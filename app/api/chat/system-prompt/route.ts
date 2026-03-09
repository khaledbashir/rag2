import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { log } from "@/lib/logger";

const PROMPT_DIR = path.join(process.cwd(), ".data");
const PROMPT_FILE = path.join(PROMPT_DIR, "chat-system-prompt.txt");

/**
 * GET /api/chat/system-prompt
 * Reads the system prompt from local file storage.
 */
export async function GET() {
    try {
        const prompt = await readFile(PROMPT_FILE, "utf-8").catch(() => "");
        return NextResponse.json({ prompt });
    } catch (error: any) {
        log.error("[Chat/SystemPrompt] GET error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/chat/system-prompt
 * Saves the system prompt to local file storage.
 * Body: { prompt: string }
 */
export async function POST(req: NextRequest) {
    try {
        const { prompt } = await req.json();

        if (typeof prompt !== "string") {
            return NextResponse.json({ error: "prompt must be a string" }, { status: 400 });
        }

        await mkdir(PROMPT_DIR, { recursive: true });
        await writeFile(PROMPT_FILE, prompt, "utf-8");

        log.info(`[Chat/SystemPrompt] Saved system prompt (${prompt.length} chars)`);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        log.error("[Chat/SystemPrompt] POST error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
