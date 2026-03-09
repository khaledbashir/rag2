/**
 * /api/rate-card — Rate Card CRUD API
 *
 * GET:    List all rate card entries (optionally filter by category)
 * POST:   Create a new entry
 * PUT:    Update an existing entry (by id in body)
 * DELETE: Delete an entry (by id in query string)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateRateCardCache } from "@/services/rfp/rateCardLoader";
import { requireAuth } from "@/lib/apiAuth";

export async function GET(request: NextRequest) {
    try {
        const [, authError] = await requireAuth();
        if (authError) return authError;
        const { searchParams } = new URL(request.url);
        const category = searchParams.get("category");
        const activeOnly = searchParams.get("active") !== "false";

        const where: any = {};
        if (activeOnly) where.isActive = true;
        if (category) where.category = category;

        const entries = await prisma.rateCardEntry.findMany({
            where,
            orderBy: [{ category: "asc" }, { key: "asc" }],
        });

        const categories = await prisma.rateCardEntry.groupBy({
            by: ["category"],
            _count: true,
            where: activeOnly ? { isActive: true } : undefined,
        });

        return NextResponse.json({
            entries,
            categories: categories.map((c) => ({ name: c.category, count: c._count })),
            total: entries.length,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const [, authError] = await requireAuth();
        if (authError) return authError;
        const body = await request.json();
        const { category, key, label, value, unit, provenance, confidence } = body;

        if (!category || !key || !label || value == null || !unit) {
            return NextResponse.json(
                { error: "Missing required fields: category, key, label, value, unit" },
                { status: 400 }
            );
        }

        const entry = await prisma.rateCardEntry.create({
            data: {
                category,
                key,
                label,
                value,
                unit,
                provenance: provenance || null,
                confidence: confidence || "estimated",
            },
        });

        await prisma.rateCardAudit.create({
            data: { entryId: entry.id, action: "create", newValue: JSON.stringify({ category, key, label, value, unit, provenance, confidence }), changedBy: "admin" },
        });

        invalidateRateCardCache();
        return NextResponse.json({ entry }, { status: 201 });
    } catch (err: any) {
        if (err.code === "P2002") {
            return NextResponse.json({ error: `Duplicate key: "${(await request.clone().json()).key}" already exists` }, { status: 409 });
        }
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const [, authError] = await requireAuth();
        if (authError) return authError;
        const body = await request.json();
        const { id, ...data } = body;

        if (!id) {
            return NextResponse.json({ error: "Missing id" }, { status: 400 });
        }

        const before = await prisma.rateCardEntry.findUnique({ where: { id } });
        const entry = await prisma.rateCardEntry.update({
            where: { id },
            data,
        });

        // Log each changed field
        if (before) {
            for (const [field, newVal] of Object.entries(data)) {
                const oldVal = (before as any)[field];
                if (oldVal != null && String(oldVal) !== String(newVal)) {
                    await prisma.rateCardAudit.create({
                        data: { entryId: id, action: "update", field, oldValue: String(oldVal), newValue: String(newVal), changedBy: "admin" },
                    });
                }
            }
        }

        invalidateRateCardCache();
        return NextResponse.json({ entry });
    } catch (err: any) {
        if (err.code === "P2025") {
            return NextResponse.json({ error: "Entry not found" }, { status: 404 });
        }
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const [, authError] = await requireAuth();
        if (authError) return authError;
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "Missing id" }, { status: 400 });
        }

        const before = await prisma.rateCardEntry.findUnique({ where: { id } });
        await prisma.rateCardEntry.delete({ where: { id } });

        // Audit is cascade-deleted with the entry, so log to a detached record
        // We skip audit here since the entry (and its audits) are deleted together.
        // If you need deletion history, use soft-delete (isActive=false) instead.

        invalidateRateCardCache();
        return NextResponse.json({ deleted: true, key: before?.key });
    } catch (err: any) {
        if (err.code === "P2025") {
            return NextResponse.json({ error: "Entry not found" }, { status: 404 });
        }
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
