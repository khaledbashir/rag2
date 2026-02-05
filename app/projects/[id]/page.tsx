import { redirect } from "next/navigation";
import ProposalPage from "@/app/components/ProposalPage";
import { FORM_DEFAULT_VALUES } from "@/lib/variables";
import { prisma } from "@/lib/prisma";

interface PageProps {
    params: Promise<{ id: string }>;
}

/**
 * Map DB Proposal schema to Form schema (ProposalType)
 * DB stores flat structure; Form expects nested structure
 */
function mapDbToFormSchema(dbProject: any) {
    const cfg = (dbProject.documentConfig || {}) as any;
    const documentMode = (dbProject.documentMode || "BUDGET") as "BUDGET" | "PROPOSAL" | "LOI";
    const documentType = documentMode === "LOI" ? "LOI" : "First Round";
    const pricingType = documentMode === "PROPOSAL" ? "Hard Quoted" : "Budget";

    return {
        // Sender defaults (ANC info)
        sender: FORM_DEFAULT_VALUES.sender,

        // Receiver = Client info
        receiver: {
            name: dbProject.clientName || "",
            address: dbProject.clientAddress || "",
            zipCode: dbProject.clientZip || "",
            city: dbProject.clientCity || "",
            country: "",
            email: "",
            phone: "",
            customInputs: [],
        },

        // Details = Most of the proposal data
        details: {
            proposalLogo: "",
            proposalId: dbProject.id,
            proposalName: dbProject.clientName,
            proposalNumber: dbProject.id.slice(-8).toUpperCase(),
            proposalDate: dbProject.createdAt ? new Date(dbProject.createdAt).toISOString().split("T")[0] : "",
            dueDate: "",
            items: [],
            currency: "USD",
            language: "English",
            taxDetails: { amount: 0, amountType: "amount", taxID: "" },
            discountDetails: { amount: 0, amountType: "amount" },
            shippingDetails: { cost: 0, costType: "amount" },
            paymentInformation: { bankName: "", accountName: "", accountNumber: "" },
            additionalNotes: dbProject.additionalNotes || "",
            paymentTerms: dbProject.paymentTerms || "50% on Deposit, 40% on Mobilization, 10% on Substantial Completion",
            totalAmountInWords: "",
            documentType: documentType as any,
            pricingType: pricingType as any,
            documentMode: documentMode as any,
            pdfTemplate: 5, // Default to Standard (Hybrid) template
            subTotal: 0,
            totalAmount: 0,
            overheadRate: Number(dbProject.overheadRate) || 0.10,
            profitRate: Number(dbProject.profitRate) || 0.05,
            // Map screens from DB (with lineItems) to form structure
            screens: (dbProject.screens || []).map((s: any) => ({
                id: s.id,
                name: s.name || "Display",
                externalName: s.externalName || "",
                pitchMm: Number(s.pixelPitch) || 0,
                widthFt: Number(s.width) || 0,
                heightFt: Number(s.height) || 0,
                quantity: 1,
                lineItems: (s.lineItems || []).map((li: any) => ({
                    category: li.category,
                    cost: Number(li.cost) || 0,
                    margin: Number(li.margin) || 0,
                    price: Number(li.price) || 0,
                })),
            })),
            internalAudit: dbProject.internalAudit ? JSON.parse(dbProject.internalAudit) : {},
            clientSummary: dbProject.clientSummary ? JSON.parse(dbProject.clientSummary) : {},
            mirrorMode: dbProject.calculationMode === "MIRROR",
            calculationMode: dbProject.calculationMode || "INTELLIGENCE",
            taxRateOverride: Number(dbProject.taxRateOverride) || 0,
            bondRateOverride: Number(dbProject.bondRateOverride) || 0,
            aiWorkspaceSlug: dbProject.aiWorkspaceSlug || null,
            venue: (dbProject.venue || "Generic") as "Milan Puskar Stadium" | "WVU Coliseum" | "Generic",
            quoteItems: (dbProject.quoteItems || []) as any,
            includePricingBreakdown: cfg.includePricingBreakdown ?? false,
            showPricingTables: cfg.showPricingTables ?? true,
            showIntroText: cfg.showIntroText ?? true,
            showBaseBidTable: cfg.showBaseBidTable ?? false,
            showSpecifications: cfg.showSpecifications ?? true,
            showCompanyFooter: cfg.showCompanyFooter ?? true,
            showPaymentTerms: cfg.showPaymentTerms ?? false,
            showSignatureBlock: cfg.showSignatureBlock ?? false,
            showAssumptions: false,
            showExhibitA: cfg.showExhibitA ?? false,
            showExhibitB: cfg.showExhibitB ?? false,
            showNotes: cfg.showNotes ?? true,
            showScopeOfWork: cfg.showScopeOfWork ?? false,
            // FR-4.1 & FR-4.2: Manual overrides
            tableHeaderOverrides: dbProject.tableHeaderOverrides || {},
            customProposalNotes: dbProject.customProposalNotes || "",
        },

        // Excel preview data for refresh survival
        excelPreviewData: dbProject.excelPreviewData || null,
    };
}

export default async function ProjectEditorPage({ params }: PageProps) {
    const { id } = await params;

    const project = await prisma.proposal.findUnique({
        where: { id },
        include: {
            screens: {
                include: { lineItems: true }
            }
        }
    });

    if (!project) {
        redirect("/projects");
    }

    // Map DB schema to Form schema
    const formData = mapDbToFormSchema(project);

    return <ProposalPage initialData={formData} projectId={id} />;
}
