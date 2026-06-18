import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function tally(values: (string | null)[]): [string, number][] {
    const m = new Map<string, number>();
    for (const v of values) {
        const k = (v || "—").trim() || "—";
        m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export default async function TrainingIntakeAdminPage() {
    const rows = await prisma.trainingProfile.findMany({ orderBy: { createdAt: "desc" } });

    const total = rows.length;
    const completed = rows.filter((r) => r.completed).length;
    const byTrack = tally(rows.map((r) => r.recommendedTrack));
    const byTime = tally(rows.map((r) => r.preferredTime));
    const allPains = rows.flatMap((r) => r.painPoints || []).filter(Boolean);

    return (
        <div className="max-w-6xl mx-auto px-6 py-8 text-slate-800">
            <h1 className="text-2xl font-bold mb-1">Training Intake</h1>
            <p className="text-sm text-slate-500 mb-6">
                Responses from the onboarding bot. Drives the per-person training tracks; pain points feed the UX fix list.
            </p>

            {/* Aggregate */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <Card title="Responses">
                    <div className="text-3xl font-bold">{total}</div>
                    <div className="text-xs text-slate-500">{completed} completed</div>
                </Card>
                <Card title="Recommended track">
                    {byTrack.length === 0 ? (
                        <Empty />
                    ) : (
                        <ul className="text-sm space-y-1">
                            {byTrack.map(([k, n]) => (
                                <li key={k} className="flex justify-between">
                                    <span>{k}</span>
                                    <span className="font-semibold">{n}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
                <Card title="Preferred time">
                    {byTime.length === 0 ? (
                        <Empty />
                    ) : (
                        <ul className="text-sm space-y-1">
                            {byTime.map(([k, n]) => (
                                <li key={k} className="flex justify-between">
                                    <span className="truncate pr-2">{k}</span>
                                    <span className="font-semibold">{n}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>

            {/* Pain points */}
            {allPains.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-sm font-semibold text-slate-700 mb-2">Pain points (UX fix list input)</h2>
                    <div className="flex flex-wrap gap-2">
                        {allPains.map((p, i) => (
                            <span key={i} className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs text-amber-800">
                                {p}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                        <tr>
                            {["Name", "Role", "Team", "Track", "Comfort", "AI", "Preferred time", "Done", "Date"].map((h) => (
                                <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="px-3 py-8 text-center text-slate-400">No responses yet.</td>
                            </tr>
                        ) : (
                            rows.map((r) => (
                                <tr key={r.id} className="border-t border-slate-100">
                                    <td className="px-3 py-2 whitespace-nowrap">{r.name || "—"}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{r.role || "—"}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{r.team || "—"}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{r.recommendedTrack || "—"}</td>
                                    <td className="px-3 py-2">{r.techComfort ?? "—"}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{r.aiExposure || "—"}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{r.preferredTime || "—"}</td>
                                    <td className="px-3 py-2">{r.completed ? "✓" : "—"}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                                        {new Date(r.createdAt).toLocaleDateString()}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">{title}</div>
            {children}
        </div>
    );
}

function Empty() {
    return <div className="text-sm text-slate-400">No data yet</div>;
}
