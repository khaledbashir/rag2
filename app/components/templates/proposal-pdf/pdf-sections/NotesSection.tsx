import React from "react";
import type { TemplateColors, TemplateSpacing } from "./types";
import SectionHeader from "./SectionHeader";

interface NotesSectionProps {
    colors: TemplateColors;
    spacing: TemplateSpacing;
    additionalNotes?: string;
}

const NotesSection = ({ colors, spacing, additionalNotes }: NotesSectionProps) => {
    const raw = (additionalNotes || "").toString().trim();
    if (!raw) return null;
    return (
        <div data-preview-section="notes" className="mt-2">
            <SectionHeader title="Notes" colors={colors} spacing={spacing} />
            <div className="rounded-lg p-3 text-[10px] leading-snug whitespace-pre-wrap" style={{ background: colors.surface, color: colors.text }}>
                {raw}
            </div>
        </div>
    );
};

export default NotesSection;
