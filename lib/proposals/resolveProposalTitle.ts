const PLACEHOLDER_TITLES = new Set([
    "client name",
    "new project",
    "new estimate",
    "placeholder",
    "untitled",
    "untitled project",
    "untitled proposal",
    "untitled estimate",
    "unnamed client",
    "anc led display proposal",
]);

export function normalizeProposalTitle(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const title = value.trim().replace(/\s+/g, " ");
    if (!title) return null;
    if (PLACEHOLDER_TITLES.has(title.toLowerCase())) return null;
    return title;
}

export function resolveProposalTitle(...candidates: unknown[]): string {
    for (const candidate of candidates) {
        const title = normalizeProposalTitle(candidate);
        if (title) return title;
    }
    return "Untitled Project";
}
