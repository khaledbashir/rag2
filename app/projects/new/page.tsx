"use client";

import { useEffect, useRef } from "react";
import ProposalPage from "@/app/components/ProposalPage";
import { useProposalContext } from "@/contexts/ProposalContext";

export default function NewProjectPage() {
    const { newProposal } = useProposalContext();
    const hasReset = useRef(false);

    useEffect(() => {
        // Guard: only run once per mount to prevent React #185 (max update depth).
        if (hasReset.current) return;
        hasReset.current = true;
        // ALWAYS reset when landing on /projects/new — no conditions.
        // This must fire before Providers' draft hydration (child effects fire first)
        // and clears localStorage so parent hydration finds nothing.
        newProposal({ silent: true });
    }, [newProposal]);

    return <ProposalPage projectId="new" />;
}
