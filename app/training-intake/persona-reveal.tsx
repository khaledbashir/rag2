"use client";

import React, { useState } from "react";

export type Persona = {
    archetypeKey: string;
    archetype: string;
    tagline: string;
    traits: string[];
    superpower: string;
    path: { slug: string; title: string; href: string; blurb: string; why: string }[];
};

// archetypeKey → hero art + accent gradient. Art is pre-generated (Higgsfield).
const ARCH_VISUALS: Record<string, { img: string; from: string; to: string; icon: string }> = {
    reports: { img: "/personas/reports.jpg", from: "#0a52ef", to: "#061d63", icon: "📊" },
    closer: { img: "/personas/closer.jpg", from: "#1d63ff", to: "#0a2a7a", icon: "🎯" },
    account: { img: "/personas/account.jpg", from: "#3b75f2", to: "#0b2560", icon: "🧭" },
    pipeline: { img: "/personas/pipeline.jpg", from: "#0a52ef", to: "#08205a", icon: "⚡" },
    sponsorship: { img: "/personas/sponsorship.jpg", from: "#2b6bff", to: "#0a1f5c", icon: "🏟️" },
    command: { img: "/personas/command.jpg", from: "#0b3fd0", to: "#050f3a", icon: "🛰️" },
    explorer: { img: "/personas/explorer.jpg", from: "#3b75f2", to: "#0a2470", icon: "🚀" },
};
export function archVisual(key: string) {
    return ARCH_VISUALS[key] || ARCH_VISUALS.explorer;
}

/** The flattering persona archetype + AI-personalized learning path reveal.
 *  When `shareUrl` is passed, shows a copyable personal link to this path. */
export function PersonaReveal({ persona, shareUrl }: { persona: Persona; shareUrl?: string }) {
    const v = archVisual(persona.archetypeKey);
    const [copied, setCopied] = useState(false);
    const heroStyle: React.CSSProperties = {
        backgroundColor: v.to,
        backgroundImage: `linear-gradient(180deg, rgba(4,10,35,.05) 0%, rgba(4,10,35,.35) 45%, rgba(4,10,35,.82) 100%), url("${v.img}")`,
        backgroundSize: "cover, cover",
        backgroundPosition: "center, center",
        backgroundRepeat: "no-repeat, no-repeat",
    };
    const copy = async () => {
        if (!shareUrl) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            /* clipboard blocked — the link is still visible to copy manually */
        }
    };
    return (
        <div className="pt-3 anc-reveal">
            <style>{`@keyframes ancRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}.anc-reveal{animation:ancRise .5s cubic-bezier(.16,1,.3,1) both}.anc-step{animation:ancRise .5s cubic-bezier(.16,1,.3,1) both}`}</style>
            <div className="rounded-2xl border border-blue-100 bg-white shadow-md overflow-hidden">
                {/* Hero */}
                <div className="relative h-52 sm:h-56 flex flex-col justify-end p-5 text-white" style={heroStyle}>
                    <div className="absolute top-4 left-5 flex items-center gap-2">
                        <span className="text-lg leading-none">{v.icon}</span>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/80">Your CRM persona</span>
                    </div>
                    <div>
                        <div className="text-2xl sm:text-[26px] font-extrabold leading-tight drop-shadow">{persona.archetype}</div>
                        {persona.tagline && <div className="mt-1 text-[13px] sm:text-sm text-white/90 leading-snug max-w-md drop-shadow">{persona.tagline}</div>}
                    </div>
                </div>

                {/* Traits + superpower */}
                <div className="px-5 pt-4">
                    {persona.traits.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {persona.traits.map((t, i) => (
                                <span key={i} className="rounded-full bg-blue-50 border border-blue-100 px-3 py-1 text-[12px] font-semibold text-blue-700">{t}</span>
                            ))}
                        </div>
                    )}
                    {persona.superpower && (
                        <div className="mt-3 rounded-xl bg-gradient-to-r from-blue-50 to-white border border-blue-100 px-4 py-3">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-500">⚡ Your CRM superpower</div>
                            <div className="text-[14px] text-slate-800 leading-snug mt-0.5">{persona.superpower}</div>
                        </div>
                    )}
                </div>

                {/* Path */}
                <div className="px-5 pt-5 pb-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Your personalized path</div>
                    <div className="text-[15px] font-semibold text-slate-800 leading-tight">{persona.path.length} lessons, picked for you</div>
                    <div className="text-[12px] text-slate-500 mt-0.5">In order — start at the top and work down.</div>
                </div>
                <ol className="px-2">
                    {persona.path.map((s, i) => (
                        <li key={s.slug} className="anc-step" style={{ animationDelay: `${0.12 * i + 0.15}s` }}>
                            <a href={s.href} target="_blank" rel="noopener noreferrer"
                               className="flex items-start gap-3 rounded-xl px-3 py-3 hover:bg-blue-50/70 transition group">
                                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[13px] font-bold text-white">{i + 1}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[15px] font-semibold text-slate-800 group-hover:text-blue-700">{s.title}</span>
                                    <span className="block text-[12.5px] text-slate-500 leading-snug mt-0.5">{s.why}</span>
                                </span>
                                <span className="mt-1 text-slate-300 group-hover:text-blue-500">→</span>
                            </a>
                        </li>
                    ))}
                </ol>

                {/* Shareable personal link */}
                {shareUrl && (
                    <div className="px-5 pt-3">
                        <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-500">🔗 Your personal path link</div>
                            <div className="mt-1.5 flex items-center gap-2">
                                <input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()}
                                       className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-[12.5px] text-slate-700" />
                                <button onClick={copy}
                                        className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-blue-700 transition">
                                    {copied ? "Copied!" : "Copy"}
                                </button>
                            </div>
                            <div className="text-[11.5px] text-slate-500 mt-1.5">Bookmark this — it always reopens your persona and path.</div>
                        </div>
                    </div>
                )}

                <div className="px-5 py-4 border-t border-slate-100 mt-3">
                    <a href={persona.path[0]?.href || "https://docs.ancsports.net/docs/training"} target="_blank" rel="noopener noreferrer"
                       className="block w-full rounded-xl bg-blue-600 px-4 py-3 text-center text-[15px] font-semibold text-white hover:bg-blue-700 transition">
                        Start your first lesson →
                    </a>
                    <a href="https://docs.ancsports.net/docs/training" target="_blank" rel="noopener noreferrer"
                       className="mt-2 block text-center text-[13px] font-medium text-slate-500 hover:text-blue-600">
                        Or browse the full training library
                    </a>
                </div>
            </div>
        </div>
    );
}
