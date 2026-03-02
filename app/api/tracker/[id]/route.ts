/**
 * GET  /api/tracker/[id] — Get a single tracker item with comments & activity
 * PATCH /api/tracker/[id] — Update a tracker item (verify, dispute, comment, move, delete)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Verification {
  name: string;
  status: "verified" | "disputed";
  comment: string;
  date: string;
}

// Safe include — falls back if new tables don't exist yet
async function findItemWithRelations(id: string) {
  try {
    return await prisma.trackerItem.findUnique({
      where: { id },
      include: {
        comments: { orderBy: { createdAt: "desc" }, take: 50 },
        _count: { select: { comments: true } },
      },
    });
  } catch {
    // Comments table may not exist yet
    return await prisma.trackerItem.findUnique({ where: { id } });
  }
}

async function logActivity(data: { itemId?: string; actor: string; action: string; details?: string }) {
  try {
    await prisma.trackerActivity.create({
      data: {
        itemId: data.itemId || null,
        actor: data.actor,
        action: data.action,
        details: data.details || null,
      },
    });
  } catch {
    // Activity table may not exist yet
  }
}

async function addComment(itemId: string, author: string, body: string) {
  try {
    return await prisma.trackerComment.create({
      data: { itemId, author, body, type: "comment" },
    });
  } catch {
    // Comments table may not exist yet
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const item = await findItemWithRelations(id);
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    return NextResponse.json({ item });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load";
    console.error("[tracker] GET item error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const item = await prisma.trackerItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // ── Action: verify or dispute ──
    if (body.action === "verify" || body.action === "dispute") {
      const { name, comment } = body;
      if (!name) {
        return NextResponse.json({ error: "name is required" }, { status: 400 });
      }

      const verifications = (item.verifications as unknown as Verification[]) || [];
      const existing = verifications.findIndex((v) => v.name === name);
      const entry: Verification = {
        name,
        status: body.action as "verified" | "disputed",
        comment: comment || "",
        date: new Date().toISOString(),
      };

      if (existing >= 0) {
        verifications[existing] = entry;
      } else {
        verifications.push(entry);
      }

      const hasDispute = verifications.some((v) => v.status === "disputed");
      const verifiedCount = verifications.filter((v) => v.status === "verified").length;
      let newStatus = item.status;
      let newColumn = item.column;
      if (hasDispute) {
        newStatus = "disputed";
        newColumn = "disputed";
      } else if (verifiedCount >= 1) {
        newStatus = "verified";
        newColumn = "verified";
      }

      const updated = await prisma.trackerItem.update({
        where: { id },
        data: {
          verifications: JSON.parse(JSON.stringify(verifications)),
          status: newStatus,
          column: newColumn,
        },
      });

      await logActivity({ itemId: id, actor: name, action: body.action, details: comment || undefined });
      if (comment) await addComment(id, name, comment);

      // Re-fetch with relations
      const full = await findItemWithRelations(id);
      return NextResponse.json({ item: full || updated });
    }

    // ── Action: add comment ──
    if (body.action === "comment") {
      const { name, comment: commentText } = body;
      if (!name || !commentText) {
        return NextResponse.json({ error: "name and comment required" }, { status: 400 });
      }

      const newComment = await addComment(id, name, commentText);
      await logActivity({ itemId: id, actor: name, action: "commented", details: commentText.substring(0, 100) });

      return NextResponse.json({ comment: newComment });
    }

    // ── Action: move kanban column ──
    if (body.action === "move") {
      const { column, name } = body;
      const validColumns = ["awaiting_review", "in_review", "verified", "disputed"];
      if (!column || !validColumns.includes(column)) {
        return NextResponse.json({ error: `column must be one of: ${validColumns.join(", ")}` }, { status: 400 });
      }

      const statusMap: Record<string, string> = {
        awaiting_review: "claimed",
        in_review: "claimed",
        verified: "verified",
        disputed: "disputed",
      };

      const updated = await prisma.trackerItem.update({
        where: { id },
        data: { column, status: statusMap[column] || item.status },
      });

      if (name) {
        await logActivity({ itemId: id, actor: name, action: "moved", details: `Moved to ${column.replace(/_/g, " ")}` });
      }

      return NextResponse.json({ item: updated });
    }

    // ── Action: delete ──
    if (body.action === "delete") {
      // Clean up related records safely
      try { await prisma.trackerComment.deleteMany({ where: { itemId: id } }); } catch { /* */ }
      try { await prisma.trackerActivity.deleteMany({ where: { itemId: id } }); } catch { /* */ }

      await prisma.trackerItem.delete({ where: { id } });

      await logActivity({ actor: body.name || "System", action: "deleted", details: item.description.substring(0, 80) });

      return NextResponse.json({ deleted: true });
    }

    // ── Action: update notes ──
    if (body.notes !== undefined) {
      const updated = await prisma.trackerItem.update({
        where: { id },
        data: { notes: body.notes },
      });
      return NextResponse.json({ item: updated });
    }

    // ── Action: change status directly ──
    if (body.status) {
      const updated = await prisma.trackerItem.update({
        where: { id },
        data: {
          status: body.status,
          claimedBy: body.claimedBy || item.claimedBy,
          claimedAt: body.status === "claimed" ? new Date() : item.claimedAt,
        },
      });
      return NextResponse.json({ item: updated });
    }

    return NextResponse.json({ error: "No valid action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update";
    console.error("[tracker] PATCH error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
