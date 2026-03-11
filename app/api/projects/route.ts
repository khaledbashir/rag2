import { NextRequest, NextResponse } from "next/server";
import { provisionProjectWorkspace } from "@/lib/anything-llm";
import { assignWorkspaceToUser } from "@/services/anythingllm/userProvisioner";
import { auth } from "@/auth";
import { log } from "@/lib/logger";

import { prisma } from "@/lib/prisma";

type PricingDocumentLike = {
    documentTotal?: number | string | null;
    currency?: string | null;
    tables?: unknown[];
};

const toFiniteNumber = (value: unknown): number | null => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
        const parsed = Number(value.replace(/,/g, ""));
        return Number.isFinite(parsed) ? parsed : null;
    }
    if (typeof value === "bigint") return Number(value);
    if (value && typeof value === "object" && "toNumber" in value && typeof (value as any).toNumber === "function") {
        const parsed = (value as any).toNumber();
        return Number.isFinite(parsed) ? parsed : null;
    }
    if (value && typeof value === "object" && "toString" in value && typeof (value as any).toString === "function") {
        const parsed = Number((value as any).toString());
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

/**
 * GET /api/projects
 * List all projects (paginated, filterable)
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get("workspaceId");
        const search = searchParams.get("search") || "";
        const status = searchParams.get("status");
        const minAmount = searchParams.get("minAmount");
        const maxAmount = searchParams.get("maxAmount");
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const minScreens = parseInt(searchParams.get("minScreens") || "0");
        const limit = parseInt(searchParams.get("limit") || "50");
        const offset = parseInt(searchParams.get("offset") || "0");

        const where: any = {};

        if (workspaceId) where.workspaceId = workspaceId;
        if (status && status !== "all") where.status = status;

        // Calculation mode filter (e.g., "ESTIMATE", "MIRROR", "INTELLIGENCE")
        const calculationMode = searchParams.get("calculationMode");
        if (calculationMode) where.calculationMode = calculationMode;

        // Document mode filter (e.g., "BUDGET", "PROPOSAL", "LOI", "CONTRACT")
        const documentMode = searchParams.get("documentMode");
        if (documentMode) where.documentMode = documentMode;

        if (search) {
            where.OR = [
                { clientName: { contains: search, mode: "insensitive" } },
                { venue: { contains: search, mode: "insensitive" } },
                { clientCity: { contains: search, mode: "insensitive" } },
            ];
        }

        // Date Range Filter
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        // Fetch projects with essential fields to derive dashboard card data.
        // Also fetch ALL proposals (no filter/pagination) for global KPI stats.
        // Stats: use groupBy for counts (O(1) not O(n)), separate lightweight query for pipeline total
        const [projectsRaw, total, statsByMode, allForPipeline] = await Promise.all([
            prisma.proposal.findMany({
                where,
                orderBy: { updatedAt: "desc" },
                take: limit,
                skip: offset,
                select: {
                    id: true,
                    createdAt: true,
                    updatedAt: true,
                    status: true,
                    clientName: true,
                    clientAddress: true,
                    clientCity: true,
                    clientZip: true,
                    venue: true,
                    documentMode: true,
                    mirrorMode: true,
                    calculationMode: true,
                    pricingDocument: true,
                    clientLogo: true,
                    versions: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: { totalSellingPrice: true }
                    },
                    screens: {
                        select: { id: true },
                    },
                    createdByUser: {
                        select: { name: true, email: true },
                    },
                    estimatorAnswers: true,
                    estimatorDisplays: true,
                }
            }),
            prisma.proposal.count({ where }),
            // Lightweight count by mode — no data transfer
            prisma.proposal.groupBy({
                by: ["calculationMode"],
                _count: { id: true },
            }),
            // Pipeline total — only fetch what we need (no pricingDocument blob)
            prisma.proposal.findMany({
                select: {
                    calculationMode: true,
                    pricingDocument: true,
                    versions: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: { totalSellingPrice: true }
                    },
                }
            }),
        ]);

        let projects = projectsRaw.map((project) => {
            const pricingDocument = (project.pricingDocument as PricingDocumentLike | null) ?? null;
            const pricingDocumentTotal = toFiniteNumber(pricingDocument?.documentTotal);
            const latestBidTotal = toFiniteNumber(project.versions?.[0]?.totalSellingPrice);
            const tables = pricingDocument?.tables;
            const pricingTables = Array.isArray(tables) ? tables : [];

            let totalAmount = 0;
            if (pricingDocumentTotal !== null) {
                totalAmount = pricingDocumentTotal;
            } else if (latestBidTotal !== null) {
                totalAmount = latestBidTotal;
            }

            const sectionCount = pricingTables.length;

            // Derive actual mode from data — stored calculationMode can be wrong
            // because ProposalContext auto-saves MIRROR (form default) on every load
            const storedMode = project.calculationMode;
            let derivedMode: string;
            if (storedMode === "ESTIMATE") {
                derivedMode = "ESTIMATE";
            } else if (sectionCount > 0) {
                // Has Excel pricing tables → Mirror (uploaded spreadsheet)
                derivedMode = "MIRROR";
            } else {
                derivedMode = "INTELLIGENCE";
            }

            return {
                id: project.id,
                createdAt: project.createdAt,
                updatedAt: project.updatedAt,
                status: project.status,
                clientName: project.clientName || "Untitled Project",
                clientCity: project.clientCity || null,
                clientAddress: project.clientAddress || null,
                clientZip: project.clientZip || null,
                clientLogo: project.clientLogo || null,
                venue: project.venue || null,
                documentMode: project.documentMode || "BUDGET",
                mirrorMode: project.mirrorMode ?? false,
                calculationMode: derivedMode,
                totalAmount,
                currency: pricingDocument?.currency || "USD",
                sectionCount,
                hasExcel: sectionCount > 0,
                screenCount: project.screens?.length
                    || ((project as any).estimatorAnswers as any)?.displays?.length
                    || ((project as any).estimatorDisplays as any[])?.length
                    || 0,
                createdBy: (project as any).createdByUser?.name || (project as any).createdByUser?.email || null,
                createdByName: (project as any).createdByUser?.name || (project as any).createdByUser?.email || null,
            };
        });

        const minAmountNumber = minAmount ? Number(minAmount) : null;
        const maxAmountNumber = maxAmount ? Number(maxAmount) : null;
        if (Number.isFinite(minAmountNumber) || Number.isFinite(maxAmountNumber)) {
            projects = projects.filter((project) => {
                const amount = project.totalAmount || 0;
                if (Number.isFinite(minAmountNumber) && amount < (minAmountNumber as number)) return false;
                if (Number.isFinite(maxAmountNumber) && amount > (maxAmountNumber as number)) return false;
                return true;
            });
        }

        if (minScreens > 0) {
            projects = projects.filter(p => p.screenCount >= minScreens);
        }

        // Compute global KPI stats — counts from groupBy (fast), pipeline from lightweight query
        const modeCountMap = Object.fromEntries(
            statsByMode.map(g => [g.calculationMode, g._count.id])
        );
        const statsMirror = modeCountMap["MIRROR"] || 0;
        const statsIntelligence = modeCountMap["INTELLIGENCE"] || 0;
        const statsEstimate = modeCountMap["ESTIMATE"] || 0;

        let statsPipeline = 0;
        for (const p of allForPipeline) {
            const pd = (p.pricingDocument as PricingDocumentLike | null) ?? null;
            const pdTotal = toFiniteNumber(pd?.documentTotal);
            const bidTotal = toFiniteNumber(p.versions?.[0]?.totalSellingPrice);
            if (pdTotal !== null) {
                statsPipeline += pdTotal;
            } else if (bidTotal !== null) {
                statsPipeline += bidTotal;
            }
        }

        return NextResponse.json({
            projects,
            total,
            limit,
            offset,
            stats: {
                totalProjects: statsMirror + statsIntelligence + statsEstimate,
                mirrorCount: statsMirror,
                intelligenceCount: statsIntelligence,
                estimateCount: statsEstimate,
                totalPipeline: statsPipeline,
            },
        });
    } catch (error) {
        log.error("GET /api/projects error:", error);
        return NextResponse.json(
            { error: "Failed to fetch projects" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/projects
 * Create a new project (auto-creates AnythingLLM workspace)
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { workspaceId, clientName } = body;

        if (!workspaceId || !clientName) {
            return NextResponse.json(
                { error: "workspaceId and clientName are required" },
                { status: 400 }
            );
        }

        // Get current user for ownership tracking
        const session = await auth();
        const userId = session?.user?.id || null;

        // Create the project in the database first (so we have an ID for the slug)
        const project = await prisma.proposal.create({
            data: {
                workspaceId,
                clientName,
                status: "DRAFT",
                ...(userId ? { createdByUserId: userId } : {}),
            },
        });

        // Provision a dedicated AnythingLLM workspace (non-blocking for fast UI)
        const warnings: string[] = [];
        const aiWorkspaceSlug = await provisionProjectWorkspace(clientName, project.id);

        if (aiWorkspaceSlug) {
            await prisma.proposal.update({
                where: { id: project.id },
                data: { aiWorkspaceSlug },
            });
            project.aiWorkspaceSlug = aiWorkspaceSlug;

            // Assign workspace to the creating user
            if (userId) {
                const user = await prisma.user.findUnique({
                    where: { id: userId },
                    select: { anythingLlmUserId: true },
                });
                if (user?.anythingLlmUserId) {
                    await assignWorkspaceToUser(aiWorkspaceSlug, user.anythingLlmUserId).catch(() => {});
                }
            }
        } else {
            warnings.push("AI workspace creation failed — project created without AI features");
        }

        return NextResponse.json({ project, warnings }, { status: 201 });
    } catch (error) {
        log.error("POST /api/projects error:", error);
        return NextResponse.json(
            { error: "Failed to create project" },
            { status: 500 }
        );
    }
}
