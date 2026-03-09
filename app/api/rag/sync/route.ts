import { NextRequest, NextResponse } from "next/server";
import { loadCatalog } from "@/lib/catalog";
import { syncDocumentsToAnythingLLM } from "@/lib/rag-sync";
import { log } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const catalog = await loadCatalog();
    const docs = catalog.map((c: any) => ({ name: c.product_id, content: JSON.stringify(c) }));
    const res = await syncDocumentsToAnythingLLM(docs);
    return NextResponse.json({ ok: true, result: res }, { status: 200 });
  } catch (err: any) {
    log.error("/api/rag/sync error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}