import { NextRequest, NextResponse } from "next/server";
import { isImmutable, isFinancialLocked, LOCKED_FINANCIAL_FIELDS, validateApprovalTransition } from "@/lib/proposal-lifecycle";
import { logActivity, detectMeaningfulChanges } from "@/services/proposal/server/activityLogService";
import { postProposalStatusNote } from "@/services/integrations/twenty/crmAutomation";
import { auth } from "@/auth";

import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { resolveProposalTitle } from "@/lib/proposals/resolveProposalTitle";

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
        log.error("GET /api/projects/[id] error:", error);
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
            select: {
                status: true,
                isLocked: true,
                clientName: true,
                paymentTerms: true,
                loiHeaderText: true,
                documentMode: true,
                pricingDocument: true,
                parserValidationReport: true,
                parserStrictVersion: true,
                venue: true,
                clientCity: true,
                clientAddress: true,
                }
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
            substantialCompletionDate,
            additionalNotes,
            signatureBlockText, // Bug #4: Signature block text persistence
            loiHeaderText,      // LOI opening legal paragraph (Prompt 10)
            customProposalNotes, // Bug #5: Custom proposal notes persistence
            createSnapshot, // NEW: Flag to create a version snapshot
            totalSellingPrice, // NEW: For version history
            averageMargin, // NEW: For version history
            aiFilledFields, // REQ-126: AI verification tracking
            verifiedFields,  // REQ-126: Human-verified fields
            pricingDocument,  // Excel Mirror Mode pricing data
            marginAnalysis,   // Non-LED margin analysis tables
            pricingMode,      // MIRROR | STANDARD
            mirrorMode,       // Mode gate: true = Upload Excel → PDF, false = Build from Scratch
            parserValidationReport, // strict parser validation report
            sourceWorkbookHash, // sha-256 workbook hash
            parserStrictVersion, // strict parser version
            purchaserLegalName, // Prompt 42: Purchaser legal name for LOI
            masterTableIndex,   // Prompt 51: Master table selector index
            specsDisplayMode,   // Exhibit A display mode: condensed | extended
            includeResponsibilityMatrix, // LOI responsibility matrix toggle
            responsibilityMatrix, // Responsibility matrix payload
            respMatrixFormatOverride, // auto | short | long | hybrid
            tableHeaderOverrides, // Mirror Mode: section header overrides
            descriptionOverrides, // Mirror Mode: line item description overrides
            priceOverrides,       // Mirror Mode: line item price overrides
            chatHistory,          // Copilot active conversation
            chatConversations,    // Copilot archived conversations
            // Estimator fields (ESTIMATE mode)
            estimatorAnswers,
            estimatorDisplays,
            estimatorDepth,
            estimatorCellOverrides,
            estimatorCustomSheets,
            estimatorRateSnapshot,
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

        // Keep the project list title aligned with the real deal/proposal name.
        // Several save paths send placeholder receiver/client names while the
        // actual deal name lives in details.proposalName.
        const hasTitleCandidate = clientName !== undefined || receiverData?.name !== undefined || proposalName !== undefined;
        let effectiveClientName: string | undefined;
        if (hasTitleCandidate) {
            effectiveClientName = resolveProposalTitle(
                proposalName,
                clientName,
                receiverData?.name,
                existingProject.clientName,
            );
            updateData.clientName = effectiveClientName;
        }

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
        if (substantialCompletionDate !== undefined) updateData.substantialCompletionDate = substantialCompletionDate;
        if (additionalNotes !== undefined) updateData.additionalNotes = additionalNotes;
        if (signatureBlockText !== undefined) updateData.signatureBlockText = signatureBlockText;
        if (loiHeaderText !== undefined) updateData.loiHeaderText = loiHeaderText;
        if (customProposalNotes !== undefined) updateData.customProposalNotes = customProposalNotes;
        if (pricingDocument !== undefined) {
            updateData.pricingDocument = pricingDocument;
            // When a new Excel is uploaded with a resp matrix, clear the old standalone
            // responsibilityMatrix to prevent stale data from persisting after re-upload
            if (pricingDocument?.respMatrix) {
                updateData.responsibilityMatrix = null;
            }
        }
        if (marginAnalysis !== undefined) updateData.marginAnalysis = marginAnalysis;
        if (parserValidationReport !== undefined) updateData.parserValidationReport = parserValidationReport;
        if (sourceWorkbookHash !== undefined) updateData.sourceWorkbookHash = sourceWorkbookHash;
        if (parserStrictVersion !== undefined) updateData.parserStrictVersion = parserStrictVersion;
        if (pricingMode !== undefined) updateData.pricingMode = pricingMode;
        if (typeof mirrorMode === 'boolean') updateData.mirrorMode = mirrorMode;
        if (purchaserLegalName !== undefined) updateData.purchaserLegalName = purchaserLegalName;
        if (masterTableIndex !== undefined) updateData.masterTableIndex = masterTableIndex;
        if (specsDisplayMode !== undefined) updateData.specsDisplayMode = specsDisplayMode;
        if (includeResponsibilityMatrix !== undefined) updateData.includeResponsibilityMatrix = includeResponsibilityMatrix;
        if (responsibilityMatrix !== undefined) updateData.responsibilityMatrix = responsibilityMatrix;
        if (respMatrixFormatOverride !== undefined) updateData.respMatrixFormatOverride = respMatrixFormatOverride;
        if (tableHeaderOverrides !== undefined) updateData.tableHeaderOverrides = tableHeaderOverrides;
        if (descriptionOverrides !== undefined) updateData.descriptionOverrides = descriptionOverrides;
        if (priceOverrides !== undefined) updateData.priceOverrides = priceOverrides;
        if (chatHistory !== undefined) updateData.chatHistory = chatHistory;
        if (chatConversations !== undefined) updateData.chatConversations = chatConversations;
        // Estimator fields
        if (estimatorAnswers !== undefined) updateData.estimatorAnswers = estimatorAnswers;
        if (estimatorDisplays !== undefined) updateData.estimatorDisplays = estimatorDisplays;
        if (estimatorDepth !== undefined) updateData.estimatorDepth = estimatorDepth;
        if (estimatorCellOverrides !== undefined) updateData.estimatorCellOverrides = estimatorCellOverrides;
        if (estimatorCustomSheets !== undefined) updateData.estimatorCustomSheets = estimatorCustomSheets;
        if (estimatorRateSnapshot !== undefined) updateData.estimatorRateSnapshot = estimatorRateSnapshot;

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
                            customDisplayName: screen.customDisplayName || null,
                            group: screen.group || null,
                            pixelPitch: toNum(screen.pixelPitch || screen.pitchMm, 10),
                            width: toNum(screen.width || screen.widthFt, 0),
                            height: toNum(screen.height || screen.heightFt, 0),
                            brightness: screen.brightness ? toNum(screen.brightness) : null,
                            hiddenFromSpecs: screen.hiddenFromSpecs === true,
                            quantity: screen.quantity ? parseInt(String(screen.quantity), 10) : 1,
                            serviceType: screen.serviceType || null,
                            formFactor: screen.formFactor || null,
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

        // Log meaningful changes (fire-and-forget, non-blocking)
        const changes = detectMeaningfulChanges(existingProject as any, {
            clientName: effectiveClientName,
            paymentTerms,
            loiHeaderText,
            status,
            documentMode,
            pricingDocument,
            parserValidationReport,
            parserStrictVersion,
        });
        for (const change of changes) {
            logActivity(id, change.action, change.description, null, change.metadata);
        }

        // Webhook: notify ANC Service Dashboard when proposal is signed/closed
        if (status === 'SIGNED' || status === 'CLOSED') {
            const session = await auth();
            postProposalStatusNote({
                proposalId: id,
                status,
                workspaceMemberEmail: session?.user?.email || null,
            }).catch((err) => log.warn("Twenty CRM status note sync failed:", err?.message || err));

            try {
                const webhookUrl = process.env.ANC_SERVICES_WEBHOOK_URL || 'https://abc-anc-services.izcgmb.easypanel.host/api/webhooks/proposal'
                const webhookSecret = process.env.ANC_SERVICES_WEBHOOK_SECRET || 'anc-services-webhook-2026'
                fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': webhookSecret },
                    body: JSON.stringify({
                        action: status === 'SIGNED' ? 'proposal_signed' : 'proposal_closed',
                        proposal: {
                            id: project.id,
                            clientName: effectiveClientName || existingProject.clientName,
                            venue: venue || existingProject.venue,
                            city: existingProject.clientCity,
                            address: existingProject.clientAddress,
                        },
                        // Include screens if available
                        screens: await (async () => {
                            try {
                                const screens = await prisma.installedScreen.findMany({
                                    where: { venue: { sourceProposalId: id } },
                                    select: { name: true, manufacturer: true, modelNumber: true, pixelPitch: true, widthFt: true, heightFt: true, installDate: true, isActive: true }
                                })
                                if (screens.length > 0) return screens
                                // Fallback: try to get from proposal screens config
                                const prop = await prisma.proposal.findUnique({ where: { id }, select: { screens: true } })
                                return prop?.screens || []
                            } catch { return [] }
                        })(),
                    }),
                }).catch(err => log.error('Webhook to ANC Services failed:', err))
            } catch (e) {
                log.error('Webhook setup error:', e)
            }
        }

        return NextResponse.json({
            success: true,
            id: project.id,
        });

    } catch (error: any) {
        log.error("PATCH /api/projects/[id] error:", error);

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
 * Soft-delete: sets deletedAt timestamp. Only ADMIN or project creator can delete.
 * Child records are preserved for recovery. Prisma middleware filters deleted
 * proposals from all reads automatically.
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const session = await auth();
        const userId = (session?.user as any)?.id;
        const userRole = (session?.user as any)?.role || (session?.user as any)?.authRole;

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const proposal = await prisma.proposal.findUnique({
            where: { id },
            select: { id: true, createdByUserId: true, clientName: true, status: true },
        });

        if (!proposal) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        // Only ADMIN or the project creator can delete
        const isAdmin = userRole === "ADMIN" || userRole === "admin";
        const isCreator = proposal.createdByUserId === userId;

        if (!isAdmin && !isCreator) {
            return NextResponse.json(
                { error: "You don't have permission to delete this project. Only administrators or the project creator can delete." },
                { status: 403 }
            );
        }

        // Block deletion of SIGNED/CLOSED proposals
        if (proposal.status === "SIGNED" || proposal.status === "CLOSED") {
            return NextResponse.json(
                { error: `Cannot delete a ${proposal.status} proposal. This is a permanent contractual record.` },
                { status: 403 }
            );
        }

        await prisma.proposal.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        logActivity(id, "deleted", `Project "${proposal.clientName}" moved to trash`, userId).catch(() => {});

        return NextResponse.json({ success: true, softDeleted: true });
    } catch (error: any) {
        log.error("DELETE /api/projects/[id] error:", error);

        if (error.code === 'P2025') {
            return NextResponse.json({ success: true, message: "Project already deleted or not found" });
        }

        return NextResponse.json(
            { error: "Failed to delete project", detail: error.message },
            { status: 500 }
        );
    }
}
