/**
 * Database Operations for Verification System
 * Handles saving/loading verification data to/from PostgreSQL
 */

import { VerificationManifest, ReconciliationReport, Exception, VerificationStatus } from '@/types/verification';
import { prisma } from '@/lib/prisma';

// ============================================================================
// VERIFICATION SAVE/LOAD
// ============================================================================

/**
 * Save verification results to database
 */
export async function saveVerification(
    proposalId: string,
    data: {
        manifest: VerificationManifest;
        report: ReconciliationReport;
        exceptions: Exception[];
    }
): Promise<void> {
    await prisma.proposal.update({
        where: { id: proposalId },
        data: {
            verificationManifest: data.manifest as any,
            verificationStatus: data.report.status,
            lastVerifiedAt: new Date(),
        },
    });
    
    if (data.exceptions?.length) {
        console.info(`[Verification] ${data.exceptions.length} exceptions detected but not persisted (no Exception model yet)`);
    }
}

/**
 * Fetch verification status from database
 */
export async function fetchVerificationStatus(
    proposalId: string
): Promise<{ status: VerificationStatus; manifest: VerificationManifest | null }> {
    const proposal = await prisma.proposal.findUnique({
        where: { id: proposalId },
        select: {
            verificationStatus: true,
            verificationManifest: true,
        },
    });
    
    if (!proposal) {
        throw new Error(`Proposal ${proposalId} not found`);
    }
    
    return {
        status: (proposal.verificationStatus as VerificationStatus) || VerificationStatus.PENDING,
        manifest: proposal.verificationManifest as VerificationManifest | null,
    };
}

/**
 * Check if proposal needs re-verification
 */
export async function checkIfReverificationNeeded(
    proposalId: string
): Promise<boolean> {
    const proposal = await prisma.proposal.findUnique({
        where: { id: proposalId },
        select: {
            verificationStatus: true,
            lastVerifiedAt: true,
            updatedAt: true,
        },
    });
    
    if (!proposal) {
        throw new Error(`Proposal ${proposalId} not found`);
    }
    
    // Needs verification if never verified
    if (!proposal.lastVerifiedAt) {
        return true;
    }
    
    // Needs verification if proposal was updated after last verification
    if (proposal.updatedAt > proposal.lastVerifiedAt) {
        return true;
    }
    
    // Needs verification if status is PENDING
    if (proposal.verificationStatus === VerificationStatus.PENDING) {
        return true;
    }
    
    return false;
}

// ============================================================================
// PROPOSAL VERSIONS
// ============================================================================

/**
 * Create proposal version snapshot
 */
export async function createProposalVersion(
    proposalId: string,
    data: {
        manifest: VerificationManifest;
        auditData: any; // InternalAudit
        pdfUrl?: string;
        uglySheetUrl?: string;
        changeReason: string;
        createdBy?: string;
    }
): Promise<void> {
    // Get current version count
    const versionCount = await prisma.proposalVersion.count({
        where: { proposalId },
    });
    
    await prisma.proposalVersion.create({
        data: {
            proposalId,
            versionNumber: versionCount + 1,
            manifest: data.manifest as any,
            auditData: data.auditData,
            pdfUrl: data.pdfUrl,
            uglySheetUrl: data.uglySheetUrl,
            changeReason: data.changeReason,
            createdBy: data.createdBy || 'system',
        },
    });
}

/**
 * Get all proposal versions
 */
export async function getProposalVersions(
    proposalId: string
): Promise<any[]> {
    const versions = await prisma.proposalVersion.findMany({
        where: { proposalId },
        orderBy: { createdAt: 'desc' },
    });
    
    return versions;
}

/**
 * Get latest proposal version
 */
export async function getLatestProposalVersion(
    proposalId: string
): Promise<any | null> {
    const version = await prisma.proposalVersion.findFirst({
        where: { proposalId },
        orderBy: { createdAt: 'desc' },
    });
    
    return version;
}

// ============================================================================
// MANUAL OVERRIDES
// ============================================================================

/**
 * Create manual override with audit trail
 */
export async function createManualOverride(
    proposalId: string,
    data: {
        entityType: string;
        entityId: string;
        field: string;
        overrideValue: number; // Will be converted to Decimal
        reason: string;
        approver: string;
        createdBy: string;
    }
): Promise<any> {
    // Get current value
    const currentValue = await getCurrentProposalValue(
        proposalId,
        data.entityType,
        data.entityId,
        data.field
    );
    
    // Create override record
    const override = await prisma.manualOverride.create({
        data: {
            proposalId,
            entityType: data.entityType,
            entityId: data.entityId,
            field: data.field,
            originalValue: currentValue, // Will be Decimal in schema
            overrideValue: data.overrideValue, // Will be Decimal in schema
            reason: data.reason,
            approver: data.approver,
            createdBy: data.createdBy,
        },
    });
    
    return override;
}

/**
 * Get all manual overrides for a proposal
 */
export async function getManualOverrides(
    proposalId: string
): Promise<any[]> {
    const overrides = await prisma.manualOverride.findMany({
        where: { proposalId },
        orderBy: { createdAt: 'desc' },
    });
    
    return overrides;
}

/**
 * Helper: Get current proposal value
 */
async function getCurrentProposalValue(
    proposalId: string,
    entityType: string,
    entityId: string,
    field: string
): Promise<number> {
    if (entityType === 'screen') {
        // Fetch proposal directly to get internalAudit JSON
        const proposal = await prisma.proposal.findUnique({
            where: { id: proposalId },
            select: { 
                internalAudit: true,
                bondRateOverride: true, 
                taxRateOverride: true 
            }
        });

        if (!proposal || !proposal.internalAudit) return 0;

        // Parse internalAudit to get screens
        let screens: any[] = [];
        try {
            const audit = typeof proposal.internalAudit === 'string' 
                ? JSON.parse(proposal.internalAudit) 
                : proposal.internalAudit;
            screens = audit.perScreen || [];
        } catch (e) {
            console.error("Failed to parse proposal internalAudit", e);
            return 0;
        }

        // Find the specific screen by name or ID
        const screen = screens.find((s: any) => s.id === entityId || s._id === entityId || s.name === entityId);
        
        if (!screen) return 0;

        // Helper to get numbers safely from breakdown
        const breakdown = screen.breakdown || {};
        const num = (v: any) => Number(v || 0);

        // Calculate based on field - using the already calculated values in internalAudit if available
        if (field === 'totalCost') {
            return num(breakdown.totalCost);
        }
        
        if (field === 'sellPrice') {
            return num(breakdown.sellPrice);
        }
        
        if (field === 'finalTotal') {
            return num(breakdown.finalClientTotal);
        }
    }
    
    // Fallback for other entity types or unknown fields
    return 0;
}

// ============================================================================
// PROPOSAL UPDATES
// ============================================================================

/**
 * Update proposal and create version snapshot
 */
export async function updateProposalWithVersion(
    proposalId: string,
    updates: any,
    changeReason: string,
    createdBy: string
): Promise<void> {
    // Get current proposal data
    const currentProposal = await prisma.proposal.findUnique({
        where: { id: proposalId },
        include: {
            screens: {
                include: {
                    lineItems: true,
                },
            },
        },
    });
    
    if (!currentProposal) {
        throw new Error(`Proposal ${proposalId} not found`);
    }
    
    // Update proposal
    await prisma.proposal.update({
        where: { id: proposalId },
        data: updates,
    });
    
    // Create version snapshot
    await createProposalVersion(proposalId, {
        manifest: currentProposal.verificationManifest || {} as any,
        auditData: currentProposal.internalAudit || {},
        changeReason,
        createdBy,
    });
}

// ============================================================================
// EXPORT
// ============================================================================
export default prisma;
