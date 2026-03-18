import { ReactNode } from "react";

// Types
import { ProposalType } from "@/types";
import { BrandSlashes } from "@/app/components/reusables/BrandGraphics";

type ProposalLayoutProps = {
    data: ProposalType;
    children: ReactNode;
    disableFixedFooter?: boolean;
};

export default function ProposalLayout({ data, children, disableFixedFooter = false }: ProposalLayoutProps) {
    const { sender, receiver, details } = data;
    const templateConfig = ((details as any)?.templateConfig || {}) as Record<string, any>;
    const slashConfig = (templateConfig?.slash || {}) as Record<string, any>;
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    const slashWidth = clamp(Number(slashConfig?.width ?? 68) || 68, 32, 140);
    const slashHeight = clamp(Number(slashConfig?.height ?? 86) || 86, 40, 160);
    const slashCount = clamp(Number(slashConfig?.count ?? 5) || 5, 2, 10);
    const slashOpacity = clamp(Number(slashConfig?.opacity ?? 0.1) || 0.1, 0.03, 0.25);
    const slashTop = clamp(Number(slashConfig?.top ?? 2) || 2, 0, 20);
    const slashRight = clamp(Number(slashConfig?.right ?? 2) || 2, 0, 20);

    // Instead of fetching all signature fonts, get the specific one user selected.
    const fontHref = details.signature?.fontFamily
        ? `https://fonts.googleapis.com/css2?family=${details?.signature?.fontFamily}&display=swap`
        : "";

    // Read page layout from details to apply correct @page CSS
    const pageLayout = (details as any)?.pageLayout || "portrait-letter";
    const isLandscape = pageLayout.startsWith("landscape");

    // Map pageLayout to CSS dimensions
    const pageLayoutMap: Record<string, { width: string; height: string }> = {
        "portrait-letter": { width: "8.5in", height: "11in" },
        "portrait-legal": { width: "8.5in", height: "14in" },
        "portrait-a4": { width: "8.27in", height: "11.69in" },
        "landscape-letter": { width: "11in", height: "8.5in" },
        "landscape-legal": { width: "14in", height: "8.5in" },
        "landscape-a4": { width: "11.69in", height: "8.27in" },
    };
    const layout = pageLayoutMap[pageLayout] || pageLayoutMap["portrait-letter"];

    const head = (
        <>
            {/* eslint-disable-next-line @next/next/no-page-custom-font */}
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link
                rel="preconnect"
                href="https://fonts.gstatic.com"
                crossOrigin="anonymous"
            />
            {/* eslint-disable-next-line @next/next/no-page-custom-font */}
            <link
                href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Work+Sans:wght@400;600;700&family=Montserrat:wght@400;600;700&family=Open+Sans:wght@400;600&display=swap"
                rel="stylesheet"
            ></link>
            {details.signature?.fontFamily && (
                <>
                    {/* eslint-disable-next-line @next/next/no-page-custom-font */}
                    <link href={fontHref} rel="stylesheet" />
                </>
            )}
            {/* Global print styles for proper page breaks and clean PDF output */}
            <style dangerouslySetInnerHTML={{
                __html: `
	                    @media print {
	                        /* Set page size based on user-selected layout */
	                        @page {
	                            size: ${layout.width} ${layout.height};
	                            margin: 0;
	                        }
                        
                        /* Hide browser default headers/footers */
                        html, body {
                            margin: 0;
                            padding: 0;
                            font-family: Arial, Helvetica, sans-serif;
                        }
                        
                        /* Ensure table headers repeat on each page */
                        thead {
                            display: table-header-group;
                        }
                        
                        /* Targeted break-avoidance — only for elements that explicitly opt in */
                        .break-inside-avoid {
                            page-break-inside: avoid !important;
                            break-inside: avoid !important;
                        }
                        
                        /* Force page breaks before major sections */
                        .break-before-page, [class*="break-before-page"] {
                            page-break-before: always;
                            break-before: page;
                        }
                        
                        /* Flawless page break: single element, next content = new page (like docx PageBreak) */
                        .pdf-page-break {
                            page-break-before: always !important;
                            break-before: page !important;
                            height: 0 !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            overflow: hidden !important;
                            border: none !important;
                            min-height: 0 !important;
                            line-height: 0 !important;
                        }
                        
                        /* Content that immediately follows a page break gets a clean top margin on the new page */
                        .pdf-page-break + * {
                            padding-top: 0;
                            margin-top: 0;
                        }
                        
                        /* Prevent orphans and widows */
                        p, div {
                            orphans: 3;
                            widows: 3;
                        }
                        
                        /* Ensure break-before sections don't leave stray space on the previous page */
                        .break-before-page {
                            margin-top: 0;
                            padding-top: 0;
                        }
                        
                        /* Hide any remaining browser UI elements */
                        .no-print, .browser-header, .browser-footer, 
                        header:not(.proposal-header), footer:not(.proposal-footer) {
                            display: none !important;
                        }
                    }
                `
            }} />
        </>
    );

    return (
        <>
            {head}
            <section style={{ fontFamily: "Arial, Helvetica, sans-serif", position: 'relative' }}>
                <div className="block p-3 sm:p-6 bg-white dark:bg-white !bg-white text-[#1a1a1a] dark:text-[#1a1a1a] !text-black relative overflow-hidden print:bg-white">
                    <div className="absolute" style={{ top: `${slashTop}px`, right: `${slashRight}px` }}>
                        <BrandSlashes
                            width={slashWidth}
                            height={slashHeight}
                            opacity={slashOpacity}
                            count={slashCount}
                        />
                    </div>
                    <div className="relative z-10 mb-4">
                        {children}
                    </div>

                    {/* FIXED FOOTER — www.anc.com + decorative slashes */}
                    {!disableFixedFooter && (
                        <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between border-t pt-2" style={{ borderColor: '#E5E7EB' }}>
                            <p className="text-[11px] font-semibold text-[#0A52EF] tracking-wide">www.anc.com</p>
                            <div className="flex items-center gap-1">
                                {[...Array(5)].map((_, i) => (
                                    <div
                                        key={i}
                                        className="w-3 h-0.5 opacity-30"
                                        style={{ background: '#002C73', transform: 'skewX(-20deg)' }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </section>
        </>
    );
}
