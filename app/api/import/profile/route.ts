import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { saveProfileAndExtract } from "@/services/import/excelNormalizer";
import type { SaveProfileInput, ColumnMapping } from "@/services/import/excelNormalizer";
import { log } from "@/lib/logger";

/**
 * POST /api/import/profile
 *
 * Saves a new ImportProfile from the Mapping Wizard, then extracts data
 * using the new profile and returns the result.
 *
 * Body: multipart/form-data with:
 *   - file: the Excel file
 *   - profile: JSON string of SaveProfileInput
 */
export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const profileJson = formData.get("profile") as string;

        if (!file) {
            return NextResponse.json(
                { error: "No file uploaded" },
                { status: 400 },
            );
        }

        if (!profileJson) {
            return NextResponse.json(
                { error: "No profile data provided" },
                { status: 400 },
            );
        }

        let input: SaveProfileInput;
        try {
            input = JSON.parse(profileJson);
        } catch {
            return NextResponse.json(
                { error: "Invalid profile JSON" },
                { status: 400 },
            );
        }

        // Validate required fields
        if (!input.name || !input.fingerprint || input.headerRowIndex == null || input.dataStartRowIndex == null) {
            return NextResponse.json(
                { error: "Missing required profile fields: name, fingerprint, headerRowIndex, dataStartRowIndex" },
                { status: 400 },
            );
        }

        if (!input.columnMapping || typeof input.columnMapping !== "object") {
            return NextResponse.json(
                { error: "columnMapping must be an object mapping field names to column letters" },
                { status: 400 },
            );
        }

        // Validate column letters
        const colLetterRegex = /^[A-Z]{1,3}$/i;
        for (const [field, letter] of Object.entries(input.columnMapping)) {
            if (letter && !colLetterRegex.test(letter)) {
                return NextResponse.json(
                    { error: `Invalid column letter "${letter}" for field "${field}". Use A-Z format.` },
                    { status: 400 },
                );
            }
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await saveProfileAndExtract(buffer, input);

        return NextResponse.json(result);
    } catch (err: any) {
        Sentry.captureException(err, { tags: { area: "excelNormalizerProfile" } });
        log.error("[IMPORT PROFILE] Error:", err);

        // Handle duplicate fingerprint
        if (err?.code === "P2002" && err?.meta?.target?.includes("fingerprint")) {
            return NextResponse.json(
                { error: "A profile with this fingerprint already exists. The file layout was already mapped." },
                { status: 409 },
            );
        }

        return NextResponse.json(
            { error: String(err) },
            { status: 500 },
        );
    }
}
