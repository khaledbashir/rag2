import { prisma } from "@/lib/prisma";

/**
 * Log a meaningful activity on a proposal.
 * Fire-and-forget — errors are caught and logged, never thrown.
 */
export async function logActivity(
    proposalId: string,
    action: string,
    description: string,
    actor?: string | null,
    metadata?: Record<string, any> | null,
    userId?: string | null,
) {
    try {
        await prisma.activityLog.create({
            data: {
                proposalId,
                action,
                description,
                actor: actor ?? null,
                userId: userId ?? null,
                metadata: metadata ?? undefined,
            },
        });
    } catch (err) {
        console.error("[ActivityLog] Failed to log activity:", err);
    }
}

/**
 * Detect meaningful field changes between old and new data.
 * Returns an array of activity entries to log (may be empty).
 */
export function detectMeaningfulChanges(
    existingData: Record<string, any>,
    incomingData: Record<string, any>,
): Array<{ action: string; description: string; metadata?: Record<string, any> }> {
    const entries: Array<{ action: string; description: string; metadata?: Record<string, any> }> = [];

    // Client name change
    if (
        incomingData.clientName !== undefined &&
        existingData.clientName &&
        incomingData.clientName !== existingData.clientName
    ) {
        entries.push({
            action: "client_name_updated",
            description: `Updated client name to "${incomingData.clientName}"`,
            metadata: { from: existingData.clientName, to: incomingData.clientName },
        });
    }

    // Payment terms change
    if (
        incomingData.paymentTerms !== undefined &&
        existingData.paymentTerms !== null &&
        incomingData.paymentTerms !== existingData.paymentTerms
    ) {
        entries.push({
            action: "text_edited",
            description: "Updated payment terms",
            metadata: { field: "paymentTerms" },
        });
    }

    // LOI header text change
    if (
        incomingData.loiHeaderText !== undefined &&
        existingData.loiHeaderText !== null &&
        incomingData.loiHeaderText !== existingData.loiHeaderText
    ) {
        entries.push({
            action: "text_edited",
            description: "Edited LOI header paragraph",
            metadata: { field: "loiHeaderText" },
        });
    }

    // Status change
    if (
        incomingData.status !== undefined &&
        incomingData.status !== existingData.status
    ) {
        entries.push({
            action: "status_changed",
            description: `Status changed from ${existingData.status} to ${incomingData.status}`,
            metadata: { from: existingData.status, to: incomingData.status },
        });
    }

    // Document mode change
    if (
        incomingData.documentMode !== undefined &&
        incomingData.documentMode !== existingData.documentMode
    ) {
        entries.push({
            action: "document_mode_changed",
            description: `Document mode changed to ${incomingData.documentMode}`,
            metadata: { from: existingData.documentMode, to: incomingData.documentMode },
        });
    }

    // Excel data imported (pricingDocument first set or replaced)
    if (
        incomingData.pricingDocument !== undefined &&
        !existingData.pricingDocument
    ) {
        entries.push({
            action: "excel_imported",
            description: "Excel estimator data imported",
        });
    }

    return entries;
}
