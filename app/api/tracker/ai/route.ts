/**
 * POST /api/tracker/ai
 *
 * Takes unstructured text (freeform dump or answer to a question)
 * and uses AI to break it into structured kanban tasks.
 *
 * Returns streamed JSON lines — one task at a time — so the UI can
 * animate them appearing in real-time.
 *
 * Body: { text: string, author: string }
 * Response: newline-delimited JSON, each line is a task object
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ANYTHING_LLM_URL = process.env.ANYTHING_LLM_URL || "https://basheer-anything-llm.prd42b.easypanel.host/api/v1";
const ANYTHING_LLM_KEY = process.env.ANYTHING_LLM_KEY || "";
const ANYTHING_LLM_WORKSPACE = process.env.TRACKER_LLM_WORKSPACE || "phase2";

const GLM_BASE = process.env.Z_AI_BASE_URL || "https://api.z.ai/api/coding/paas/v4";
const GLM_KEY = process.env.Z_AI_API_KEY || "";
const GLM_MODEL = process.env.Z_AI_MODEL_NAME || "glm-5";

const SYSTEM_PROMPT = `You are a project management AI for the ANC Proposal Engine — an LED display integration platform for NFL, NBA, MLS, and NCAA stadiums.

Your job: take unstructured text from a team member and break it into clear, actionable tasks for a Phase 2 acceptance tracker.

RULES:
- Extract EVERY distinct task, requirement, or acceptance criterion from the text
- Each task must be a single, verifiable deliverable (something someone can check off as "done" or "not done")
- Assign each task a category from: "Core Engine", "Quote Workflow", "Validation", "Output", or "Custom"
- Assign priority: "normal", "high", or "critical"
- Keep descriptions concise but specific (one sentence)
- If someone mentions a vague concept, break it into concrete checkable items
- Return ONLY valid JSON, no markdown, no explanation

Return this exact JSON format:
{
  "tasks": [
    {
      "description": "Task description here",
      "category": "Core Engine",
      "priority": "normal"
    }
  ]
}`;

interface AITask {
  description: string;
  category: string;
  priority: string;
}

async function callAnythingLLM(userMessage: string): Promise<string | null> {
  if (!ANYTHING_LLM_KEY) return null;
  try {
    const res = await fetch(`${ANYTHING_LLM_URL}/workspace/${ANYTHING_LLM_WORKSPACE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANYTHING_LLM_KEY}`,
      },
      body: JSON.stringify({
        message: `${SYSTEM_PROMPT}\n\nUser input:\n${userMessage}`,
        mode: "chat",
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.textResponse || null;
  } catch {
    console.warn("[tracker/ai] AnythingLLM failed, falling back");
    return null;
  }
}

async function callGLM(userMessage: string): Promise<string | null> {
  if (!GLM_KEY) return null;
  try {
    const res = await fetch(`${GLM_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GLM_KEY}`,
      },
      body: JSON.stringify({
        model: GLM_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    console.warn("[tracker/ai] GLM failed");
    return null;
  }
}

function parseTasksFromAI(raw: string): AITask[] {
  // Try to extract JSON from the response (may be wrapped in markdown code blocks)
  let cleaned = raw.trim();

  // Strip markdown code fences
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) cleaned = jsonMatch[1].trim();

  // Try direct parse
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed.tasks)) return parsed.tasks;
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Try to find JSON object in the response
    const braceMatch = cleaned.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        const parsed = JSON.parse(braceMatch[0]);
        if (Array.isArray(parsed.tasks)) return parsed.tasks;
      } catch {
        // Give up on JSON parse
      }
    }
  }

  return [];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, author = "System" } = body;

    if (!text || text.trim().length < 5) {
      return NextResponse.json({ error: "Please provide more detail" }, { status: 400 });
    }

    console.log(`[tracker/ai] Processing ${text.length} chars from ${author}`);

    // Try AnythingLLM first, fallback to GLM
    let aiResponse = await callAnythingLLM(text);
    let source = "anythingllm";
    if (!aiResponse) {
      aiResponse = await callGLM(text);
      source = "glm";
    }

    if (!aiResponse) {
      return NextResponse.json(
        { error: "AI service temporarily unavailable. Please try again." },
        { status: 503 },
      );
    }

    console.log(`[tracker/ai] Got response from ${source} (${aiResponse.length} chars)`);

    const tasks = parseTasksFromAI(aiResponse);
    if (tasks.length === 0) {
      return NextResponse.json(
        { error: "Could not extract tasks from your input. Try being more specific." },
        { status: 422 },
      );
    }

    // Get current max sortOrder
    const maxItem = await prisma.trackerItem.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const startOrder = (maxItem?.sortOrder || 0) + 1;

    // Validate categories
    const validCategories = ["Core Engine", "Quote Workflow", "Validation", "Output", "Custom"];
    const validPriorities = ["normal", "high", "critical"];

    // Create all tasks in DB
    const created = await Promise.all(
      tasks.map((task, i) =>
        prisma.trackerItem.create({
          data: {
            category: validCategories.includes(task.category) ? task.category : "Custom",
            description: task.description,
            sortOrder: startOrder + i,
            column: "awaiting_review",
            status: "claimed",
            claimedBy: author,
            claimedAt: new Date(),
            priority: validPriorities.includes(task.priority) ? task.priority : "normal",
          },
          include: {
            comments: true,
            _count: { select: { comments: true } },
          },
        }),
      ),
    );

    // Log activity for each
    await Promise.all(
      created.map((item) =>
        prisma.trackerActivity.create({
          data: {
            itemId: item.id,
            actor: "AI",
            action: "created",
            details: `Generated from ${author}'s input`,
          },
        }),
      ),
    );

    // Also log one global activity
    await prisma.trackerActivity.create({
      data: {
        actor: "AI",
        action: "breakdown",
        details: `Created ${created.length} tasks from ${author}'s input`,
      },
    });

    console.log(`[tracker/ai] Created ${created.length} tasks`);

    return NextResponse.json({
      tasks: created,
      count: created.length,
      source,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "AI processing failed";
    console.error("[tracker/ai] Error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
