/**
 * Product catalog sync: rag2 → Twenty CRM (LedProduct).
 *
 * rag2 is the source of truth. Every save to ManufacturerProduct upserts the
 * matching Twenty LedProduct (keyed on modelNumber). Soft-deletes propagate as
 * isActive=false.
 *
 * Failure mode: returns a typed result, never throws. Callers log failures
 * (do NOT swallow with empty .catch()) so we don't go blind like universalCrmPush.
 */

import { prisma } from "@/lib/prisma";
import { toTwentyLedProductPayload } from "./productMapping";

const TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host";
const TWENTY_API_KEY =
  process.env.TWENTY_API_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA";

type GraphqlResponse<T> = { data?: T; errors?: Array<{ message?: string }> };

async function twentyGraphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${TWENTY_BASE}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TWENTY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json().catch(() => ({}))) as GraphqlResponse<T>;
  if (!res.ok || body.errors?.length) {
    const err = body.errors?.map((e) => e.message).filter(Boolean).join(", ");
    throw new Error(err || `Twenty GraphQL ${res.status}`);
  }
  if (!body.data) throw new Error("Twenty GraphQL returned no data");
  return body.data;
}

async function findLedProductByModelNumber(modelNumber: string): Promise<string | null> {
  const data = await twentyGraphql<{
    ledProducts: { edges: Array<{ node: { id: string } }> };
  }>(
    `query FindLedProduct($filter: LedProductFilterInput) {
      ledProducts(filter: $filter, first: 1) { edges { node { id } } }
    }`,
    { filter: { modelNumber: { eq: modelNumber } } },
  );
  return data.ledProducts.edges[0]?.node.id ?? null;
}

export type ProductSyncResult =
  | { ok: true; twentyId: string; action: "created" | "updated" }
  | { ok: false; error: string };

/**
 * Upsert a single rag2 ManufacturerProduct into Twenty LedProduct (by modelNumber).
 * Idempotent — safe to call repeatedly.
 */
export async function syncProductToTwenty(productId: string): Promise<ProductSyncResult> {
  const product = await prisma.manufacturerProduct.findUnique({ where: { id: productId } });
  if (!product) return { ok: false, error: `Product ${productId} not found in rag2` };

  const payload = toTwentyLedProductPayload(product);

  try {
    const existingId = await findLedProductByModelNumber(product.modelNumber);

    if (existingId) {
      await twentyGraphql(
        `mutation UpdateLedProduct($id: UUID!, $data: LedProductUpdateInput!) {
          updateLedProduct(id: $id, data: $data) { id }
        }`,
        { id: existingId, data: payload },
      );
      return { ok: true, twentyId: existingId, action: "updated" };
    }

    const created = await twentyGraphql<{ createLedProduct: { id: string } }>(
      `mutation CreateLedProduct($data: LedProductCreateInput!) {
        createLedProduct(data: $data) { id }
      }`,
      { data: payload },
    );
    return { ok: true, twentyId: created.createLedProduct.id, action: "created" };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Soft-delete in Twenty by setting isActive=false on the matching LedProduct.
 * Used when rag2 admin DELETE soft-deletes a product.
 */
export async function softDeleteProductInTwenty(modelNumber: string): Promise<ProductSyncResult> {
  try {
    const existingId = await findLedProductByModelNumber(modelNumber);
    if (!existingId) return { ok: false, error: `No Twenty LedProduct with modelNumber ${modelNumber}` };

    await twentyGraphql(
      `mutation Deactivate($id: UUID!, $data: LedProductUpdateInput!) {
        updateLedProduct(id: $id, data: $data) { id }
      }`,
      { id: existingId, data: { isActive: false } },
    );
    return { ok: true, twentyId: existingId, action: "updated" };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}
