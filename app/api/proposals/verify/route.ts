/**
 * POST /api/proposals/verify
 * Runs all 4 verification layers and returns verification report
 */

import { NextRequest, NextResponse } from 'next/server';
import { computeManifest, generateReconciliationReport } from '@/lib/verification';
import { detectExceptions } from '@/lib/exceptions';
import { getRoundingAuditSummary } from '@/lib/roundingAudit';
import { log } from "@/lib/logger";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { proposalId, excelData, internalAudit, options } = body;
        
        if (!proposalId) {
            return NextResponse.json(
                { error: 'proposalId is required' },
                { status: 400 }
            );
        }
        
        // Step 1: Compute verification manifest
        const manifest = computeManifest(excelData, internalAudit, options);
        
        // Step 2: Detect exceptions
        let exceptions = detectExceptions(manifest);
        
        // Step 3: Generate reconciliation report
        const report = generateReconciliationReport(manifest, exceptions, options);
        
        // Step 4: Verify rounding contract
        const roundingCompliance = getRoundingAuditSummary();
        
        // Step 5: Save to database (not yet wired)
        // await saveVerification(proposalId, { manifest, report, exceptions });
        
        return NextResponse.json({
            success: true,
            proposalId,
            verification: {
                status: report.status,
                manifest,
                report,
                exceptions,
                roundingCompliance,
            },
        });
    } catch (error) {
        log.error('Verification error:', error);
        return NextResponse.json(
            { 
                error: 'Verification failed',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
