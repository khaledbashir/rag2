/**
 * Contract Exhibit A Extractor
 *
 * Parses a signed ANC Equipment Purchase & Installation Agreement PDF and pulls
 * the SKU list from Exhibit A (committed equipment schedule). Cleanroom clone of
 * the Gemini File API pattern — does NOT import from services/rfp/** so the
 * RFP Analyzer freeze stays clean.
 *
 * Input: path to a contract PDF on disk
 * Output: structured SKU list + project metadata
 */
import { readFile } from "fs/promises";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_EXTRACTION_MODEL || "gemini-2.5-flash";

export interface ExhibitASku {
  modelNumber: string;          // e.g. "32SM5J-B"
  manufacturer?: string | null; // "LG", "Samsung", etc. — null if unclear
  description?: string | null;  // Free-text from the Description column
  quantity: number;             // Qty ordered
  unitPrice?: number | null;    // $ per unit, nullable if not shown
  totalPrice?: number | null;   // Line total, nullable if not shown
  category?: string | null;     // "Display", "Rack", "Cable", "Warranty", etc.
}

export interface ExhibitAExtraction {
  project: {
    name: string | null;
    client: string | null;
    venue: string | null;
    contractor: string | null;  // Usually "ANC Sports Enterprises"
    effectiveDate: string | null;
    totalContractValue: number | null;
  };
  skus: ExhibitASku[];
  nonSkuLineItems: Array<{
    description: string;
    amount: number | null;
  }>;
  warnings: string[];
  extractionLog: {
    exhibitALocated: boolean;
    exhibitAStartPage: number | null;
    skuTableRowsCounted: number;
    reachedEndOfDocument: boolean;
    notes: string;
  };
}

const SYSTEM_PROMPT = `You are an expert contract data extraction engine. Your sole purpose is to parse signed Equipment Purchase & Installation Agreements from ANC Sports Enterprises and extract the committed SKU list from Exhibit A.

CRITICAL DIRECTIVES:

1. END-TO-END EXHAUSTIVE SEARCH: The contract body is followed by exhibits (Exhibit A, B, C, D, E). Exhibit A contains the equipment schedule — the SKU table with model numbers, quantities, and prices. You MUST scan the entire document to locate Exhibit A, even if it appears 20+ pages in.
2. ZERO HALLUCINATION: Extract only data that explicitly exists in the document. Use null for missing values. Do NOT guess model numbers or prices.
3. DISTINGUISH SKUS FROM NON-SKU ITEMS: Exhibit A often contains both equipment SKUs (with model numbers like "32SM5J-B", "55UH5J-H", "98UM5K-B") AND non-SKU line items (labor, installation, warranty, training, freight, sales tax). Separate these into "skus" and "nonSkuLineItems" arrays.
4. MODEL NUMBER FIDELITY: Extract model numbers EXACTLY as written. Do NOT normalize, add hyphens, or strip suffixes. "98UM5K-B" stays "98UM5K-B".
5. STRICT JSON ONLY: Your entire response must be a single valid JSON object. No markdown fences, no preamble.

EXTRACTION PROTOCOL:
Step 1: Identify Project Metadata from the contract preamble (Article 1 / WHEREAS clauses). Extract project name, client (Owner), venue, contractor, effective date, total contract value (from Article 2 "Purchase Price" or Exhibit A totals).
Step 2: Locate Exhibit A. Look for headers like "EXHIBIT A", "Equipment Schedule", "Schedule A", "Equipment List".
Step 3: For each row in the Exhibit A equipment table:
  - If the row has a MODEL NUMBER column value → it's a SKU. Extract to "skus" array.
  - If the row is labor, install, training, warranty, freight, tax, or similar service line → extract to "nonSkuLineItems" array.
Step 4: Flag any ambiguous rows in "warnings".

OUTPUT FORMAT: Return ONLY this JSON structure, nothing else.`;

const USER_PROMPT = `Extract the SKU list from Exhibit A of this contract.

Return ONLY a JSON object with this schema:

{
  "project": {
    "name": "Project name as stated in contract preamble",
    "client": "Owner name (e.g., CHARLOTTE PEC, LLC)",
    "venue": "Venue name if mentioned (e.g., Novant Health Performance Center)",
    "contractor": "Contractor name (usually ANC Sports Enterprises, LLC)",
    "effectiveDate": "YYYY-MM-DD or original date string",
    "totalContractValue": 123456.78
  },
  "skus": [
    {
      "modelNumber": "32SM5J-B",
      "manufacturer": "LG",
      "description": "32\\" webOS Standard Signage Display",
      "quantity": 4,
      "unitPrice": 450.00,
      "totalPrice": 1800.00,
      "category": "Display"
    }
  ],
  "nonSkuLineItems": [
    {
      "description": "Installation Labor",
      "amount": 15000.00
    }
  ],
  "warnings": ["Any ambiguities or issues"],
  "extractionLog": {
    "exhibitALocated": true,
    "exhibitAStartPage": 15,
    "skuTableRowsCounted": 13,
    "reachedEndOfDocument": true,
    "notes": "One sentence on how extraction went"
  }
}

If Exhibit A is not found in the document, return empty skus/nonSkuLineItems arrays and set exhibitALocated to false with a descriptive warning.`;

async function uploadToGemini(pdfPath: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const pdfBuffer = await readFile(pdfPath);
  const fileName = pdfPath.split("/").pop() || "contract.pdf";
  const sizeMb = (pdfBuffer.length / 1024 / 1024).toFixed(1);
  console.log(`[ExhibitA] Uploading ${fileName} (${sizeMb}MB)...`);

  const boundary = "----ExhibitAUploadBoundary" + Date.now();
  const metadata = JSON.stringify({ file: { displayName: fileName } });
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([prefix, pdfBuffer, suffix]);

  const uploadRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    }
  );

  if (!uploadRes.ok) {
    throw new Error(`Gemini file upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
  }

  const uploadData = await uploadRes.json();
  const fileUri = uploadData.file?.uri;
  const fileResource = uploadData.file?.name;
  if (!fileUri) throw new Error("No file URI returned from Gemini upload");

  // Wait for ACTIVE state
  if (fileResource) {
    for (let i = 0; i < 30; i++) {
      const statusRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileResource}?key=${GEMINI_API_KEY}`
      );
      const statusData = await statusRes.json();
      if (statusData.state === "ACTIVE") break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log(`[ExhibitA] Uploaded → ${fileUri}`);
  return fileUri;
}

export async function extractExhibitA(pdfPath: string): Promise<ExhibitAExtraction> {
  const fileUri = await uploadToGemini(pdfPath);

  const generateBody = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [
          { text: USER_PROMPT },
          { fileData: { mimeType: "application/pdf", fileUri } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 16000,
      responseMimeType: "application/json",
    },
  };

  const genRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(generateBody),
    }
  );

  if (!genRes.ok) {
    throw new Error(`Gemini generate failed (${genRes.status}): ${await genRes.text()}`);
  }

  const genData = await genRes.json();
  const text = genData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");

  let parsed: ExhibitAExtraction;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`Gemini returned invalid JSON: ${String(e).slice(0, 200)}`);
  }

  // Defensive defaults
  if (!Array.isArray(parsed.skus)) parsed.skus = [];
  if (!Array.isArray(parsed.nonSkuLineItems)) parsed.nonSkuLineItems = [];
  if (!Array.isArray(parsed.warnings)) parsed.warnings = [];

  return parsed;
}
