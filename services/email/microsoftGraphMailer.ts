import { createDecipheriv, hkdfSync } from "node:crypto";
import { Pool } from "pg";

type ConnectedEmailAccount = {
  id: string;
  handle: string | null;
  provider: string;
  authFailedAt: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  workspaceId: string | null;
};

export type MicrosoftGraphMailInput = {
  subject: string;
  html: string;
  recipients: string[];
  bccRecipients?: string[];
};

export type MicrosoftGraphMailReceipt = {
  id: string;
  provider: "microsoft-graph";
  from: string;
};

let connectedAccountPool: Pool | null = null;

// Ahmad receives a quiet audit copy of every message this shared mailer sends.
// Keep the default in source so a deploy cannot accidentally drop the BCC by
// omitting an environment variable. The env list can add more audit mailboxes.
export const DEFAULT_MICROSOFT_MAIL_BCC = ["ahmad.basheer@anc.com"];

function normalizeMailboxes(addresses: string[]) {
  return Array.from(
    new Set(
      addresses
        .map((address) => address.trim().toLowerCase())
        .filter((address) => address.includes("@")),
    ),
  );
}

export function microsoftMailBccRecipients() {
  const configured = (process.env.MICROSOFT_MAILER_BCC || "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  return normalizeMailboxes([...DEFAULT_MICROSOFT_MAIL_BCC, ...configured]);
}

function getConnectedAccountPool() {
  if (!connectedAccountPool) {
    const connectionString = process.env.TWENTY_CORE_DATABASE_URL?.trim();
    if (!connectionString) throw new Error("TWENTY_CORE_DATABASE_URL is not configured");
    connectedAccountPool = new Pool({ connectionString });
  }
  return connectedAccountPool;
}

// Twenty v2.5+ stores connected-account tokens in an enc:v2 envelope:
// AES-256-GCM with an HKDF-SHA256 key derived from the instance key and
// workspace context. Legacy plaintext values pass through unchanged.
export function decryptConnectedAccountSecret(
  value: string | null,
  workspaceId: string | null,
): string | null {
  if (!value || !value.startsWith("enc:v2:")) return value;

  const rawKey =
    process.env.TWENTY_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.ENCRYPTION_KEY?.trim() ||
    process.env.APP_SECRET?.trim();
  if (!rawKey) {
    throw new Error(
      "TWENTY_TOKEN_ENCRYPTION_KEY (or APP_SECRET) is not configured for token decryption",
    );
  }

  const rest = value.slice("enc:v2:".length);
  const separatorIndex = rest.indexOf(":");
  if (separatorIndex <= 0) throw new Error("Malformed enc:v2 token envelope");

  const payload = rest.slice(separatorIndex + 1);
  const info = `twenty:enc:v2:${workspaceId ?? "instance"}`;
  const key = Buffer.from(
    hkdfSync("sha256", Buffer.from(rawKey), Buffer.alloc(32), Buffer.from(info), 32),
  );
  const buffer = Buffer.from(payload, "base64");
  const iv = buffer.subarray(0, 12);
  const authTag = buffer.subarray(buffer.length - 16);
  const ciphertext = buffer.subarray(12, buffer.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

async function getMicrosoftEmailAccount() {
  const handle =
    process.env.MICROSOFT_MAILER_HANDLE?.trim() ||
    process.env.CRM_REPORT_MICROSOFT_HANDLE?.trim() ||
    "support@anc.com";
  const accountId =
    process.env.MICROSOFT_MAILER_CONNECTED_ACCOUNT_ID?.trim() ||
    process.env.CRM_REPORT_MICROSOFT_CONNECTED_ACCOUNT_ID?.trim();
  const result = await getConnectedAccountPool().query<ConnectedEmailAccount>(
    `
      select id, handle, provider, "authFailedAt", "accessToken", "refreshToken", "workspaceId"
      from core."connectedAccount"
      where ${accountId ? `id = $1` : `lower(handle) = lower($1) and provider = 'microsoft'`}
        and "accessToken" is not null
        and "refreshToken" is not null
      order by "lastCredentialsRefreshedAt" desc nulls last, "updatedAt" desc
      limit 1
    `,
    [accountId || handle],
  );

  const account = result.rows[0];
  if (!account) throw new Error(`No connected Microsoft mailbox found for ${handle}`);
  if (account.authFailedAt) throw new Error(`Microsoft mailbox ${account.handle} has an auth failure`);
  if (!account.accessToken || !account.refreshToken) {
    throw new Error(`Microsoft mailbox ${account.handle} is missing tokens`);
  }

  account.accessToken = decryptConnectedAccountSecret(account.accessToken, account.workspaceId);
  account.refreshToken = decryptConnectedAccountSecret(account.refreshToken, account.workspaceId);
  return account;
}

async function refreshMicrosoftAccountToken(account: ConnectedEmailAccount) {
  const clientId =
    process.env.CRM_MICROSOFT_CLIENT_ID?.trim() ||
    process.env.AUTH_MICROSOFT_CLIENT_ID?.trim();
  const clientSecret =
    process.env.CRM_MICROSOFT_CLIENT_SECRET?.trim() ||
    process.env.AUTH_MICROSOFT_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret || !account.refreshToken) {
    throw new Error("Microsoft token refresh is not configured");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: account.refreshToken,
    grant_type: "refresh_token",
    scope: "offline_access Mail.Send Mail.Read Mail.ReadWrite User.Read email openid profile",
  });

  const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const token = await response.json().catch(() => ({}));
  if (!response.ok || !token.access_token) {
    throw new Error(
      token.error_description || token.error || `Microsoft token refresh ${response.status}`,
    );
  }

  // Twenty owns persistence and encryption of connected-account tokens. A
  // refreshed token is intentionally kept in memory for this send only.
  return {
    ...account,
    accessToken: String(token.access_token),
    refreshToken: token.refresh_token ? String(token.refresh_token) : account.refreshToken,
  };
}

export function buildMicrosoftSendMailPayload(input: MicrosoftGraphMailInput) {
  const recipients = normalizeMailboxes(input.recipients);
  if (!recipients.length) throw new Error("No email recipients configured");
  const recipientSet = new Set(recipients);
  const bccRecipients = normalizeMailboxes([
    ...microsoftMailBccRecipients(),
    ...(input.bccRecipients || []),
  ]).filter((address) => !recipientSet.has(address));

  return {
    message: {
      subject: input.subject,
      body: { contentType: "HTML", content: input.html },
      toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
      bccRecipients: bccRecipients.map((address) => ({ emailAddress: { address } })),
    },
    saveToSentItems: true,
  };
}

export async function sendMicrosoftGraphMail(
  input: MicrosoftGraphMailInput,
): Promise<MicrosoftGraphMailReceipt> {
  let account = await getMicrosoftEmailAccount();
  const payload = buildMicrosoftSendMailPayload(input);
  const send = (accessToken: string) =>
    fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

  let response = await send(account.accessToken || "");
  if (response.status === 401 || response.status === 403) {
    account = await refreshMicrosoftAccountToken(account);
    response = await send(account.accessToken || "");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message || `Microsoft Graph sendMail ${response.status}`);
  }

  return {
    id: `${account.handle || account.id}:${Date.now()}`,
    provider: "microsoft-graph",
    from: account.handle || "support@anc.com",
  };
}
