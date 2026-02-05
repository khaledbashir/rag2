import { NextRequest, NextResponse } from "next/server";
import { isImmutable, isFinancialLocked, LOCKED_FINANCIAL_FIELDS, validateApprovalTransition } from "@/lib/proposal-lifecycle";
import { analyzeGaps } from "@/lib/gap-analysis";

import { prisma } from "@/lib/prisma";

/**
 * GET /api/projects/[id]
 * Fetch full project with latest data
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const project = await prisma.proposal.findUnique({
            where: { id },
            include: {
                screens: {
                    include: { lineItems: true },
                },
            },
        });

        if (!project) {
            return NextResponse.json(
                { error: "Project not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ project });
    } catch (error) {
        console.error("GET /api/projects/[id] error:", error);
        return NextResponse.json(
            { error: "Failed to fetch project" },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/projects/[id]
 * Update proposal data
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        // REQ-125: Immutability enforcement - check status before allowing edits
        const existingProject = await prisma.proposal.findUnique({
            where: { id },
            select: { status: true, isLocked: true }
        });

        if (!existingProject) {
            return NextResponse.json(
                { error: "Project not found" },
                { status: 404 }
            );
        }

        // Block edits on SIGNED/CLOSED proposals (fully immutable)
        if (isImmutable(existingProject.status as any) || existingProject.isLocked) {
            return NextResponse.json(
                {
                    error: `Proposal is ${existingProject.status} and cannot be edited. This version is a permanent contractual record.`,
                    action: "clone",
                    message: "To make changes, create a new version (clone) of this proposal."
                },
                { status: 403 }
            );
        }

        const body = await req.json();

        // Extract receiverData (sent as nested object by auto-save)
        const receiverData = body.receiverData;

        const {
            clientName,
            proposalName,
            venue,
            status,
            calculationMode,
            internalAudit,
            clientSummary,
            screens,
            taxRateOverride,
            bondRateOverride,
            documentMode,
            documentConfig,
            quoteItems,
            paymentTerms,
            additionalNotes,
            signatureBlockText, // Bug #4: Signature block text persistence
            customProposalNotes, // Bug #5: Custom proposal notes persistence
            createSnapshot, // NEW: Flag to create a version snapshot
            totalSellingPrice, // NEW: For version history
            averageMargin, // NEW: For version history
            aiFilledFields, // REQ-126: AI verification tracking
            verifiedFields,  // REQ-126: Human-verified fields
            excelPreviewData // Excel preview persistence across refresh
        } = body;

        // Map address from receiverData (nested) or flat fields
        const clientAddress = body.clientAddress ?? receiverData?.address;
        const clientCity = body.clientCity ?? receiverData?.city;
        const clientZip = body.clientZip ?? receiverData?.zipCode;

        // REQ-126: Blue Glow Verification Gate - Block APPROVED transition if unverified AI fields exist
        if (status === "APPROVED" && existingProject.status !== "APPROVED") {
            // Fetch the full proposal to get AI verification state
            const fullProposal = await prisma.proposal.findUnique({
                where: { id },
                select: { aiFilledFields: true, verifiedFields: true }
            });

            const currentAiFields = (fullProposal?.aiFilledFields as string[]) || aiFilledFields || [];
            const currentVerifiedFields = (fullProposal?.verifiedFields as any) || verifiedFields || {};
            
            // Handle both array and object formats
            let verifiedFieldNames: string[] = [];
            if (Array.isArray(currentVerifiedFields)) {
                verifiedFieldNames = currentVerifiedFields.map((v: any) => v.field || v);
            } else if (typeof currentVerifiedFields === 'object' && currentVerifiedFields !== null) {
                verifiedFieldNames = Object.keys(currentVerifiedFields);
            }

            const validation = validateApprovalTransition(
                existingProject.status,
                currentAiFields,
                verifiedFieldNames
            );

            if (!validation.valid) {
                return NextResponse.json(
                    {
                        error: validation.error,
                        unverifiedFields: validation.unverifiedFields,
                        message: "All AI-extracted fields must be human-verified before approval. Click the checkmark on each Blue Glow field to verify.",
                        action: "verify_fields"
                    },
                    { status: 400 }
                );
            }
        }

        // REQ-125: Block financial field edits on APPROVED proposals
        if (isFinancialLocked(existingProject.status as any)) {
            const financialFieldsInRequest = Object.keys(body).filter(key =>
                LOCKED_FINANCIAL_FIELDS.includes(key as any)
            );
            if (financialFieldsInRequest.length > 0) {
                return NextResponse.json(
                    {
                        error: `Proposal is APPROVED. Financial fields are locked: ${financialFieldsInRequest.join(', ')}`,
                        lockedFields: financialFieldsInRequest,
                        message: "Only cosmetic/branding changes are allowed on APPROVED proposals."
                    },
                    { status: 403 }
                );
            }
        }

        const updateData: any = {};

        // Map proposalName to clientName if clientName is missing
        const effectiveClientName = clientName || proposalName;
        if (effectiveClientName !== undefined) updateData.clientName = effectiveClientName;

        if (status !== undefined) updateData.status = status;
        if (calculationMode !== undefined) updateData.calculationMode = calculationMode;
        if (taxRateOverride !== undefined) updateData.taxRateOverride = taxRateOverride;
        if (bondRateOverride !== undefined) updateData.bondRateOverride = bondRateOverride;
        if (internalAudit !== undefined) updateData.internalAudit = typeof internalAudit === "string" ? internalAudit : JSON.stringify(internalAudit);
        if (clientSummary !== undefined) updateData.clientSummary = typeof clientSummary === "string" ? clientSummary : JSON.stringify(clientSummary);
        if (clientAddress !== undefined) updateData.clientAddress = clientAddress;
        if (clientCity !== undefined) updateData.clientCity = clientCity;
        if (clientZip !== undefined) updateData.clientZip = clientZip;
        if (venue !== undefined) updateData.venue = venue;
        if (documentMode !== undefined) updateData.documentMode = documentMode;
        if (documentConfig !== undefined) updateData.documentConfig = documentConfig;
        if (quoteItems !== undefined) updateData.quoteItems = quoteItems;
        if (paymentTerms !== undefined) updateData.paymentTerms = paymentTerms;
        if (additionalNotes !== undefined) updateData.additionalNotes = additionalNotes;
        if (signatureBlockText !== undefined) updateData.signatureBlockText = signatureBlockText;
        if (customProposalNotes !== undefined) updateData.customProposalNotes = customProposalNotes;
        if (excelPreviewData !== undefined) updateData.excelPreviewData = excelPreviewData;

        const project = await prisma.$transaction(async (tx) => {
            // Handle snapshot creation if requested
            if (createSnapshot) {
                const latestVersion = await tx.bidVersion.findFirst({
                    where: { proposalId: id },
                    orderBy: { versionNumber: 'desc' }
                });

                const nextVersion = (latestVersion?.versionNumber || 0) + 1;

                await tx.bidVersion.create({
                    data: {
                        proposalId: id,
                        versionNumber: nextVersion,
                        taxRate: taxRateOverride ?? undefined,
                        bondRate: bondRateOverride ?? undefined,
                        margin: averageMargin ?? undefined,
                        totalSellingPrice: totalSellingPrice ?? undefined,
                    }
                });
            }

            // Update the main proposal record
            const updated = await tx.proposal.update({
                where: { id },
                data: updateData,
                select: { id: true },
            });

            // If screens are provided, sync them (destructive sync for screens)
            if (screens && Array.isArray(screens)) {
                // Step 1: Get existing screens to delete their children
                const existingScreens = await tx.screenConfig.findMany({
                    where: { proposalId: id },
                    select: { id: true }
                });
                const screenIds = existingScreens.map(s => s.id);

                // Step 2: Delete child CostLineItems first (FK constraint)
                if (screenIds.length > 0) {
                    await tx.costLineItem.deleteMany({
                        where: { screenConfigId: { in: screenIds } }
                    });
                }

                // Step 3: Delete existing screens
                await tx.screenConfig.deleteMany({
                    where: { proposalId: id }
                });

                // Create new screens with correct schema
                for (const screen of screens) {
                    // Defensive number conversion helper
                    const toNum = (val: any, fallback: number = 0) => {
                        const n = Number(val);
                        return isNaN(n) ? fallback : n;
                    };

                    await tx.screenConfig.create({
                        data: {
                            proposalId: id,
                            name: screen.name || "Unnamed Screen",
                            externalName: screen.externalName || null,
                            pixelPitch: toNum(screen.pixelPitch || screen.pitchMm, 10),
                            width: toNum(screen.width || screen.widthFt, 0),
                            height: toNum(screen.height || screen.heightFt, 0),
                            lineItems: {
                                create: (screen.lineItems || []).map((li: any) => ({
                                    category: li.category || "Other",
                                    cost: toNum(li.cost, 0),
                                    margin: toNum(li.margin, 0),
                                    price: toNum(li.price, 0),
                                }))
                            }
                        }
                    });
                }
            }

            return updated;
        });

        return NextResponse.json({
            success: true,
            id: project.id,
        });

    } catch (error: any) {
        console.error("PATCH /api/projects/[id] error:", error);

        // Handle "Record not found" error codes
        if (error.code === 'P2025') {
            return NextResponse.json(
                { error: "Project not found (it may have been deleted or you are using a stale link)" },
                { status: 404 }
            );
        }

        return NextResponse.json(
            {
                error: "Failed to save project",
                details: error?.message ? String(error.message) : String(error),
                code: error?.code,
            },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/projects/[id]
 * Delete a project (soft delete recommended, but hard delete for now)
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        await prisma.proposal.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("DELETE /api/projects/[id] error:", error);

        if (error.code === 'P2025') {
            return NextResponse.json({ success: true, message: "Project already deleted or not found" });
        }

        return NextResponse.json(
            { error: "Failed to delete project" },
            { status: 500 }
        );
    }
}
