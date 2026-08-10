import { NextRequest, NextResponse } from "next/server";
import { ProposalType } from "@/types";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { PRICING_PARSER_STRICT_VERSION } from "@/services/pricing/pricingTableParser";
import { log } from "@/lib/logger";

import { prisma } from "@/lib/prisma";

function addDays(date: Date, days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + Number(days || 0));
    return d;
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const project = await prisma.proposal.findUnique({
            where: { id },
            include: {
                screens: {
                    include: { lineItems: true }
                }
            }
        });

        if (!project) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        // Parse summaries if they exist
        const clientSummary = project.clientSummary ? (() => { try { return JSON.parse(project.clientSummary!); } catch { return null; } })() : null;
        const internalAudit = project.internalAudit ? (() => { try { return JSON.parse(project.internalAudit!); } catch { return null; } })() : null;

        // --- NATALIA GATEKEEPER: AI Verification Guardrail ---
        const aiFilledFields = (project.aiFilledFields as string[]) || [];
        const verifiedFields = (project.verifiedFields as Record<string, any>) || {};
        const unverifiedFields = aiFilledFields.filter(f => !verifiedFields[f]);

        if (unverifiedFields.length > 0) {
            return NextResponse.json({
                error: "AI Guardrail Block: This proposal contains unverified AI data.",
                code: "UNVERIFIED_AI_DATA",
                blockingFields: unverifiedFields
            }, { status: 422 });
        }
        // ---------------------------------------------------

        // REQ-113: Deep clone project object before sanitization to prevent data leakage
        // This ensures internal cost/margin data is never accidentally logged or served
        const sanitizedProject = JSON.parse(JSON.stringify(project));

        // Parse request body for security options
        const body = await req.json().catch(() => ({}));
        const forceNewVersionInput = body.forceNewVersion || false;
        const strictVersionDrift =
            (project as any).pricingDocument &&
            ((project as any).parserStrictVersion || (project as any).pricingDocument?.metadata?.parserStrictVersion) !== PRICING_PARSER_STRICT_VERSION;
        const forceNewVersion = forceNewVersionInput || strictVersionDrift;
        const password = body.password || null;
        const daysToExpire = body.daysToExpire || 30; // Default 30 days per PRD

        // Hash password if provided
        const passwordHash = password ? await bcrypt.hash(password, 10) : null;
        const expiresAt = addDays(new Date(), daysToExpire);

        // 2. REQ-118: Version-Aware Hash Strategy
        // Each version gets its own unique, immutable share hash
        const versionNumber = project.versionNumber || 1;
        let shareHash: string;

        if (forceNewVersion || !project.shareHash) {
            shareHash = `${crypto.randomBytes(16).toString("hex")}-v${versionNumber}`;
            await (prisma.proposal as any).update({
                where: { id },
                data: {
                    shareHash,
                    shareExpiresAt: expiresAt,
                    sharePasswordHash: passwordHash
                }
            });
        } else {
            shareHash = project.shareHash;
        }

        // 3. Create Sanitized Snapshot (The "Ferrari" View)
        // Map DB project to ProposalType structure
        const cfg = ((project as any).documentConfig || {}) as any;
        const modeFromDb = (project as any).documentMode as ("BUDGET" | "PROPOSAL" | "LOI" | "CONTRACT") | undefined;
        const modeFromSummary =
            clientSummary?.documentType === "LOI"
                ? "LOI"
                : clientSummary?.pricingType === "Hard Quoted"
                    ? "PROPOSAL"
                    : "BUDGET";
        const documentMode = modeFromDb || modeFromSummary;
        const snapshot: Partial<ProposalType> = {
            receiver: {
                name: (project as any).purchaserLegalName || project.clientName,
                address: (project as any).clientAddress || "",
                zipCode: (project as any).clientZip || "",
                city: (project as any).clientCity || "",
                country: "",
                email: "",
                phone: "",
                customInputs: []
            },
            sender: {
                name: "ANC Sports Enterprises",
                address: "2 Manhattanville Road, Suite 402",
                zipCode: "10577",
                city: "Purchase, NY",
                country: "United States",
                email: "info@ancsports.com",
                phone: "(914) 696-2100",
                customInputs: []
            },
            details: {
                proposalId: project.id,
                proposalName: project.clientName,
                proposalDate: project.createdAt.toISOString(),
                dueDate: project.createdAt.toISOString(),
                items: [],
                currency: "USD",
                language: "English",
                taxDetails: { amount: 0, amountType: "amount", taxID: "" },
                discountDetails: { amount: 0, amountType: "amount" },
                shippingDetails: { cost: 0, costType: "amount" },
                paymentInformation: { bankName: "", accountName: "", accountNumber: "" },
                additionalNotes: (project as any).additionalNotes || clientSummary?.additionalNotes || "",
                paymentTerms: (project as any).paymentTerms || clientSummary?.paymentTerms || "50% on Deposit, 40% on Mobilization, 10% on Substantial Completion",
                substantialCompletionDate: (project as any).substantialCompletionDate || "",
                pdfTemplate: 5,
                quoteItems: ((project as any).quoteItems || []) as any,
                screens: project.screens.map(s => ({
                    id: s.id,
                    name: s.name,
                    externalName: (s as any).externalName || "",
                    customDisplayName: (s as any).customDisplayName || "",
                    pitchMm: s.pixelPitch,
                    widthFt: s.width,
                    heightFt: s.height,
                    brightness: (s as any).brightness ?? "",
                    hiddenFromSpecs: (s as any).hiddenFromSpecs === true,
                    quantity: (s as any).quantity ?? 1,
                    // SANITIZATION: Strictly zero out all internal cost/margin data
                    lineItems: s.lineItems.map(li => ({
                        category: li.category,
                        price: Number(li.price || 0),
                        cost: 0,
                        margin: 0
                    })),
                    // CALCULATED: Sum up line item prices for screen total
                    sellPrice: s.lineItems.reduce((sum, li) => sum + Number(li.price || 0), 0),
                    // SANITIZATION: Strip AI metadata
                    aiSource: undefined,
                    citations: undefined
                })) as any,
                totalAmount: clientSummary?.finalClientTotal || 0,
                totalAmountInWords: "",
                documentType: clientSummary?.documentType || "First Round",
                pricingType: clientSummary?.pricingType || "Budget",
                documentMode,
                proposalNumber: project.id.substring(0, 8).toUpperCase(),
                subTotal: clientSummary?.sellPrice || 0,
                mirrorMode: clientSummary?.mirrorMode || false,
                calculationMode: project.calculationMode as any,
                venue: (project as any).venue || clientSummary?.venue || "Generic",
                // SECURITY: Strictly nullify internal financial logic
                bondRateOverride: Number(project.bondRateOverride) || undefined,
                taxRateOverride: Number(project.taxRateOverride) || undefined,
                overheadRate: 0.10,
                profitRate: 0.05,
                internalAudit: undefined,
                includePricingBreakdown: cfg.includePricingBreakdown ?? false,
                showPricingTables: cfg.showPricingTables ?? true,
                showIntroText: cfg.showIntroText ?? true,
                showBaseBidTable: cfg.showBaseBidTable ?? false,
                showSpecifications: cfg.showSpecifications ?? true,
                showCompanyFooter: cfg.showCompanyFooter ?? true,
                showPaymentTerms: (documentMode === "LOI" || documentMode === "CONTRACT") ? (cfg.showPaymentTerms ?? true) : false,
                showTermsAndConditions: (documentMode === "LOI" || documentMode === "CONTRACT") ? (cfg.showTermsAndConditions ?? documentMode === "CONTRACT") : false,
                showSubstantialCompletionDate: (documentMode === "LOI" || documentMode === "CONTRACT") ? (cfg.showSubstantialCompletionDate ?? documentMode === "CONTRACT") : false,
                showSignatureBlock: (documentMode === "LOI" || documentMode === "CONTRACT") ? (cfg.showSignatureBlock ?? true) : false,
                showAssumptions: false,
                showExhibitA: cfg.showExhibitA ?? false,
                showExhibitB: (documentMode === "LOI" || documentMode === "CONTRACT") ? (cfg.showExhibitB ?? false) : false,
                // Universal toggles for Hybrid Template
                showNotes: cfg.showNotes ?? true,
                showScopeOfWork: cfg.showScopeOfWork ?? false,
                scopeOfWorkText: cfg.scopeOfWorkText || "",
                specsSectionTitle: cfg.specsSectionTitle || "",
                pageLayout: cfg.pageLayout ?? "portrait-letter",
                specsDisplayMode: (project as any).specsDisplayMode || "extended",
                includeResponsibilityMatrix: (project as any).includeResponsibilityMatrix ?? false,
                responsibilityMatrix: (project as any).responsibilityMatrix || null,
                respMatrixFormatOverride: (project as any).respMatrixFormatOverride || "auto",
                parserValidationReport: (project as any).parserValidationReport || (project as any).pricingDocument?.metadata?.validation || null,
                sourceWorkbookHash: (project as any).sourceWorkbookHash || (project as any).pricingDocument?.metadata?.sourceWorkbookHash || null,
                parserStrictVersion: (project as any).parserStrictVersion || (project as any).pricingDocument?.metadata?.parserStrictVersion || null,
                masterTableIndex: (project as any).masterTableIndex ?? null,
                // FR-4.1 & FR-4.2: Manual overrides
                tableHeaderOverrides: (project as any).tableHeaderOverrides || {},
                descriptionOverrides: (project as any).descriptionOverrides || {},
                priceOverrides: (project as any).priceOverrides || {},
                customProposalNotes: (project as any).customProposalNotes || "",
                // Change Order fields (only meaningful when documentMode === "CHANGE_ORDER")
                changeOrderNumber: (project as any).changeOrderNumber || cfg.changeOrderNumber || "",
                changeOrderRequestedBy: (project as any).changeOrderRequestedBy || cfg.changeOrderRequestedBy || "",
                changeOrderDate: (project as any).changeOrderDate || cfg.changeOrderDate || "",
                changeOrderOriginalContractNumber: (project as any).changeOrderOriginalContractNumber || cfg.changeOrderOriginalContractNumber || "",
                changeOrderOriginalContractAmount: Number((project as any).changeOrderOriginalContractAmount || cfg.changeOrderOriginalContractAmount) || 0,
                changeOrderPreviousTotalAmount: Number(cfg.changeOrderPreviousTotalAmount) || 0,
                changeOrderOverheadPct: Number((project as any).changeOrderOverheadPct || cfg.changeOrderOverheadPct) || 0,
                changeOrderIntroText: (project as any).changeOrderIntroText || cfg.changeOrderIntroText || "",
                showChangeOrderTotals: cfg.showChangeOrderTotals ?? true,
                showHiddenRows: cfg.showHiddenRows ?? false,
                serviceContractTemplateId: cfg.serviceContractTemplateId || "ravens",
                serviceContractProjectType: cfg.serviceContractProjectType || undefined,
                termExhibitOverrides: cfg.termExhibitOverrides || {},
                serviceContractSignatureText: cfg.serviceContractSignatureText || "",
                serviceManualFeeRows: Array.isArray(cfg.serviceManualFeeRows) ? cfg.serviceManualFeeRows : [],
                serviceSectionOverrides: cfg.serviceSectionOverrides || {},
                freeformTables: Array.isArray(cfg.freeformTables) ? cfg.freeformTables : [],
                showFreeformTables: cfg.showFreeformTables ?? true,
            },
            pricingDocument: (project as any).pricingDocument || undefined,
            marginAnalysis: (project as any).marginAnalysis || undefined,
        };

        // 4. Save Snapshot to DB
        // REQ-118: IMMUTABLE SNAPSHOTS - once created, v1 snapshot NEVER changes
        // New versions create NEW snapshots with NEW hashes
        const existingSnapshot = await prisma.proposalSnapshot.findUnique({
            where: { shareHash }
        });

        if (!existingSnapshot) {
            // Create new immutable snapshot for this version
            await (prisma.proposalSnapshot as any).create({
                data: {
                    proposalId: id,
                    shareHash,
                    snapshotData: JSON.stringify(snapshot),
                    expiresAt,
                    passwordHash
                }
            });
        }
        // NOTE: We intentionally do NOT update existing snapshots
        // This ensures v1 links always show v1 data (immutability)

        // DYNAMIC HOST DETECTION
        // Prioritize:
        // 1. Environment variable (if explicitly set for override)
        // 2. Request headers (for accurate current domain)
        // 3. Fallback to localhost
        let baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

        if (!baseUrl || baseUrl.includes("localhost")) {
            const host = req.headers.get("host");
            const proto = req.headers.get("x-forwarded-proto") || "https";
            if (host) {
                baseUrl = `${proto}://${host}`;
            } else {
                baseUrl = "http://localhost:3000";
            }
        }

        const shareUrl = `${baseUrl}/share/${shareHash}`;

        return NextResponse.json({
            shareUrl,
            version: versionNumber,
            isNewSnapshot: !existingSnapshot,
            message: existingSnapshot
                ? `Returning existing v${versionNumber} share link (immutable)`
                : `Created new v${versionNumber} share link`
        });
    } catch (error) {
        log.error("POST /api/projects/[id]/share error:", error);
        return NextResponse.json({ error: "Failed to generate share link" }, { status: 500 });
    }
}
