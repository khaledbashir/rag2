/**
 * Microsoft 365 source for email → CRM intake.
 *
 * Polls a dedicated intake mailbox (anyone forwards/CCs proposal emails to
 * it), runs each unread message through the intake engine, files attachments
 * into the OneDrive/SharePoint sales folder, then marks the message read.
 *
 * Requires an Azure AD app registration with application permissions
 * (Mail.ReadWrite + Files.ReadWrite.All, admin-consented) and these env vars:
 *   MSGRAPH_TENANT_ID / MSGRAPH_CLIENT_ID / MSGRAPH_CLIENT_SECRET
 *   EMAIL_CRM_MAILBOX          e.g. deals@anc.com
 *   EMAIL_CRM_FOLDER_URL       (preferred) paste the SharePoint/OneDrive URL of
 *                              the sales folder — the drive is resolved via the
 *                              Graph shares API, no drive id hunting
 *   EMAIL_CRM_DRIVE_ID + EMAIL_CRM_ONEDRIVE_FOLDER  (alternative to FOLDER_URL)
 * Setup walkthrough: docs/email-to-crm-setup.md
 */

import { log } from "@/lib/logger";
import { processEmailCrmIntake } from "@/services/intake/emailToCrmProcess";
import type { EmailCrmInput } from "@/services/intake/emailToCrmSync";

const GRAPH = "https://graph.microsoft.com/v1.0";

export function graphConfigured(): boolean {
  return Boolean(
    process.env.MSGRAPH_TENANT_ID &&
      process.env.MSGRAPH_CLIENT_ID &&
      process.env.MSGRAPH_CLIENT_SECRET &&
      process.env.EMAIL_CRM_MAILBOX,
  );
}

export async function getGraphToken(): Promise<string> {
  const tenant = process.env.MSGRAPH_TENANT_ID!;
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MSGRAPH_CLIENT_ID!,
      client_secret: process.env.MSGRAPH_CLIENT_SECRET!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph token request failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Graph token response had no access_token.");
  return data.access_token;
}

export async function graphFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph ${res.status} on ${path}: ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>(?=\s*<)/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface GraphMessage {
  id: string;
  subject?: string;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  from?: { emailAddress?: { name?: string; address?: string } };
  body?: { contentType?: string; content?: string };
}

interface GraphAttachment {
  id: string;
  name: string;
  size?: number;
  isInline?: boolean;
  contentBytes?: string; // base64, present for fileAttachment
  "@odata.type"?: string;
}

/** Filters out signature images and other inline noise — only real documents
 *  get filed and listed on the opportunity. */
export function isRealDocument(att: { name: string; size?: number; isInline?: boolean }): boolean {
  if (att.isInline) return false;
  const imageExt = /\.(png|jpe?g|gif|bmp|svg)$/i.test(att.name);
  if (imageExt && (att.size ?? 0) < 50_000) return false; // signature/logo images
  return true;
}

interface SalesFolderTarget {
  driveId: string;
  /** Upload base: item-relative when resolved from a URL, root-relative otherwise. */
  uploadPrefix: string; // e.g. `items/<folderId>:` or `root:/<Base/Folder>`
}

let cachedFolderTarget: SalesFolderTarget | null | undefined;

/** Resolves the sales folder from EMAIL_CRM_FOLDER_URL (via the Graph shares
 *  API) or from EMAIL_CRM_DRIVE_ID + EMAIL_CRM_ONEDRIVE_FOLDER. Cached. */
async function resolveSalesFolder(token: string): Promise<SalesFolderTarget | null> {
  if (cachedFolderTarget !== undefined) return cachedFolderTarget;

  const folderUrl = process.env.EMAIL_CRM_FOLDER_URL;
  if (folderUrl) {
    const encoded = Buffer.from(folderUrl).toString("base64url");
    try {
      const item = await graphFetch<{
        id: string;
        parentReference?: { driveId?: string };
      }>(token, `/shares/u!${encoded}/driveItem?$select=id,parentReference`);
      const driveId = item.parentReference?.driveId;
      if (driveId && item.id) {
        cachedFolderTarget = { driveId, uploadPrefix: `items/${item.id}:` };
        return cachedFolderTarget;
      }
    } catch (error) {
      log.error("[email-to-crm] could not resolve EMAIL_CRM_FOLDER_URL", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    cachedFolderTarget = null;
    return null;
  }

  const driveId = process.env.EMAIL_CRM_DRIVE_ID;
  const baseFolder = process.env.EMAIL_CRM_ONEDRIVE_FOLDER;
  if (driveId && baseFolder) {
    const encodedBase = baseFolder.split("/").map((seg) => encodeURIComponent(seg)).join("/");
    cachedFolderTarget = { driveId, uploadPrefix: `root:/${encodedBase}` };
  } else {
    cachedFolderTarget = null;
  }
  return cachedFolderTarget;
}

async function fileAttachmentToOneDrive(
  token: string,
  attachment: GraphAttachment,
  venueFolder: string,
): Promise<string | null> {
  if (!attachment.contentBytes) return null;
  const target = await resolveSalesFolder(token);
  if (!target) return null;

  const safeName = attachment.name.replace(/[\\/:*?"<>|]/g, "_");
  const safeFolder = venueFolder.replace(/[\\/:*?"<>|]/g, "_").slice(0, 100) || "Unsorted";
  // EMAIL_CRM_ALPHA_SPLIT=true files under A–Z letter folders, matching the
  // sales team's existing ANC-Sales layout (…/C/Camping World Stadium/…).
  const alphaSplit = (process.env.EMAIL_CRM_ALPHA_SPLIT || "").toLowerCase() === "true";
  const letter = safeFolder[0]?.toUpperCase();
  const letterPrefix = alphaSplit && letter && /[A-Z]/.test(letter) ? `${letter}/` : "";
  const subPath = `${letterPrefix}${encodeURIComponent(safeFolder)}/${encodeURIComponent(safeName)}`;

  const bytes = Buffer.from(attachment.contentBytes, "base64");
  const res = await fetch(
    `${GRAPH}/drives/${target.driveId}/${target.uploadPrefix}/${subPath}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: bytes,
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    log.error("[email-to-crm] OneDrive upload failed", {
      name: attachment.name,
      status: res.status,
      text: text.slice(0, 200),
    });
    return null;
  }
  const item = (await res.json()) as { webUrl?: string };
  return item.webUrl || null;
}

export interface PollResult {
  processed: number;
  results: Array<{
    messageId: string;
    subject?: string;
    intakeId?: string;
    status?: string;
    filedAttachments: number;
    error?: string;
  }>;
}

/** Reads unread mailbox messages, runs each through the intake engine, files attachments. */
export async function pollIntakeMailbox(limit = 10): Promise<PollResult> {
  if (!graphConfigured()) {
    throw new Error("Microsoft 365 intake is not configured (MSGRAPH_* / EMAIL_CRM_MAILBOX env).");
  }
  const mailbox = process.env.EMAIL_CRM_MAILBOX!;
  const token = await getGraphToken();

  const listing = await graphFetch<{ value?: GraphMessage[] }>(
    token,
    `/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages?$filter=isRead eq false&$top=${limit}&$orderby=receivedDateTime asc`,
  );
  const messages = listing.value || [];
  const results: PollResult["results"] = [];

  for (const message of messages) {
    try {
      let attachments: GraphAttachment[] = [];
      if (message.hasAttachments) {
        const attData = await graphFetch<{ value?: GraphAttachment[] }>(
          token,
          `/users/${encodeURIComponent(mailbox)}/messages/${message.id}/attachments`,
        );
        attachments = (attData.value || []).filter(
          (a) => a["@odata.type"] === "#microsoft.graph.fileAttachment" && isRealDocument(a),
        );
      }

      const rawContent = message.body?.content || "";
      const bodyText =
        message.body?.contentType?.toLowerCase() === "html" ? htmlToText(rawContent) : rawContent.trim();

      const input: EmailCrmInput = {
        subject: message.subject,
        fromEmail: message.from?.emailAddress?.address,
        fromName: message.from?.emailAddress?.name,
        receivedAt: message.receivedDateTime,
        body: bodyText,
        attachments: attachments.map((a) => ({ name: a.name, sizeBytes: a.size })),
        source: "graph-mailbox",
      };

      const result = await processEmailCrmIntake(input, { autoApply: true, appliedBy: "auto" });

      const venueFolder =
        (result.extraction?.clientOrVenue || message.subject || "Unsorted").trim();
      let filed = 0;
      for (const attachment of attachments) {
        const url = await fileAttachmentToOneDrive(token, attachment, venueFolder);
        if (url) filed += 1;
      }

      await graphFetch(
        token,
        `/users/${encodeURIComponent(mailbox)}/messages/${message.id}`,
        { method: "PATCH", body: JSON.stringify({ isRead: true }) },
      );

      results.push({
        messageId: message.id,
        subject: message.subject,
        intakeId: result.intake.id,
        status: result.intake.status,
        filedAttachments: filed,
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      log.error("[email-to-crm] mailbox message failed", { messageId: message.id, error: messageText });
      results.push({ messageId: message.id, subject: message.subject, filedAttachments: 0, error: messageText });
    }
  }

  return { processed: results.length, results };
}
