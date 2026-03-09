/**
 * POST /api/proposals/[id]/verify-field
 * 
 * Marks an AI-extracted field as human-verified (removes Blue Glow).
 * Persists verification state to database for audit trail.
 * 
 * REQ-126: Blue Glow Persistence & Audit Trail
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const { fieldPath, verifiedBy } = body;

        if (!fieldPath) {
            return NextResponse.json(
                { error: "fieldPath is required" },
                { status: 400 }
            );
        }

        // Fetch current proposal state
        const proposal = await prisma.proposal.findUnique({
            where: { id },
            select: {
                aiFilledFields: true,
                verifiedFields: true,
                calculationMode: true,
                status: true,
            },
        });

        if (!proposal) {
            return NextResponse.json(
                { error: "Proposal not found" },
                { status: 404 }
            );
        }

        // Get current arrays
        const aiFilledFields = (proposal.aiFilledFields as string[]) || [];
        const verifiedFields = (proposal.verifiedFields as any) || {};

        // Verify the field exists in AI-filled fields
        if (!aiFilledFields.includes(fieldPath)) {
            return NextResponse.json(
                { 
                    error: "Field was not AI-extracted",
                    message: "This field was not filled by AI, so verification is not required."
                },
                { status: 400 }
            );
        }

        // Check if already verified
        if (verifiedFields[fieldPath]) {
            return NextResponse.json(
                { 
                    message: "Field already verified",
                    verifiedAt: verifiedFields[fieldPath].verifiedAt
                },
                { status: 200 }
            );
        }

        // Add verification record
        const updatedVerifiedFields = {
            ...verifiedFields,
            [fieldPath]: {
                verifiedBy: verifiedBy || "unknown",
                verifiedAt: new Date().toISOString(),
            },
        };

        // Update proposal
        await prisma.proposal.update({
            where: { id },
            data: {
                verifiedFields: updatedVerifiedFields as any,
                lastVerifiedBy: verifiedBy || "unknown",
                lastVerifiedAt: new Date(),
            },
        });

        // Calculate verification progress
        const verifiedCount = Object.keys(updatedVerifiedFields).length;
        const totalAiFields = aiFilledFields.length;
        const completionRate = totalAiFields > 0 
            ? Math.round((verifiedCount / totalAiFields) * 100) 
            : 100;

        return NextResponse.json({
            success: true,
            fieldPath,
            verifiedAt: updatedVerifiedFields[fieldPath].verifiedAt,
            progress: {
                verified: verifiedCount,
                total: totalAiFields,
                completionRate,
            },
        });
    } catch (error: any) {
        log.error("[Verify Field] Error:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to verify field" },
            { status: 500 }
        );
    }
}
