import { prisma } from "@/lib/prisma";
import { PersonaReveal, type Persona } from "../../persona-reveal";

export const dynamic = "force-dynamic";

/**
 * Public, shareable personalized learning path.
 * URL: /training-intake/path/[sessionId] — generated at the end of the intake chat.
 * Reads the persona persisted by the "persona" action and re-renders it any time.
 */
export default async function LearningPathPage({ params }: { params: Promise<{ sessionId: string }> }) {
    const { sessionId } = await params;

    let persona: Persona | null = null;
    let name: string | null = null;
    try {
        const profile = await prisma.trainingProfile.findUnique({
            where: { sessionId },
            select: { persona: true, name: true },
        });
        if (profile?.persona && typeof profile.persona === "object") {
            persona = profile.persona as unknown as Persona;
        }
        name = profile?.name ?? null;
    } catch {
        /* fall through to the empty state */
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col" style={{ colorScheme: "light" }}>
            <header className="border-b border-blue-100 bg-white/80 backdrop-blur">
                <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">A</div>
                    <div className="flex-1">
                        <div className="font-semibold text-slate-800">ANC CRM — Your Learning Path</div>
                        <div className="text-xs text-slate-500">{name ? `Made for ${name}` : "Your personalized training path"}</div>
                    </div>
                </div>
            </header>

            <main className="flex-1">
                <div className="max-w-2xl mx-auto px-4 py-6">
                    {persona && Array.isArray(persona.path) && persona.path.length > 0 ? (
                        <PersonaReveal persona={persona} />
                    ) : (
                        <div className="mt-10 text-center">
                            <div className="text-4xl mb-3">🧭</div>
                            <div className="text-lg font-semibold text-slate-800">This path isn&apos;t ready yet</div>
                            <p className="mt-1 text-[14px] text-slate-500 max-w-sm mx-auto">
                                Finish the quick intro chat and your personalized path will appear here.
                            </p>
                            <a href="/training-intake"
                               className="mt-5 inline-block rounded-xl bg-blue-600 px-5 py-3 text-[15px] font-semibold text-white hover:bg-blue-700 transition">
                                Start the 2-minute intro →
                            </a>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
