import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

type Stats = {
  oppCount: number;
  wonCount: number;
  wonValue: string;
  wonValueRaw: number;
  lostCount: number;
  lostValue: string;
  openCount: number;
  openValue: string;
  marginTotal: string;
  marginTotalRaw: number;
  winRate: number | null;
  firstAt: string | null;
  latestAt: string | null;
  yearsActive: number | null;
};

type Milestone = {
  type: string;
  at: string;
  title: string;
  detail: string | null;
  amount: string | null;
  link: string | null;
  badge: string | null;
};

type Account360 = {
  company: { id: string; name: string; league: string | null; serviceStatus: string | null; venueName: string | null; crmUrl: string };
  stats: Stats;
  milestones: Milestone[];
  narrative: string;
  generatedAt: string;
};

async function fetchAccount(id: string): Promise<Account360 | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "proposals.anc.com";
  const proto = h.get("x-forwarded-proto") || "https";
  const base = `${proto}://${host}`;
  const cookie = h.get("cookie") || "";
  const res = await fetch(`${base}/api/ai-console/account-360?companyId=${id}`, {
    cache: "no-store",
    headers: cookie ? { cookie } : {},
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Account 360 fetch failed: ${res.status}`);
  return (await res.json()) as Account360;
}

function badgeColor(badge: string | null) {
  if (!badge) return "bg-neutral-100 text-neutral-600";
  const b = badge.toUpperCase();
  if (b === "WON") return "bg-emerald-50 text-emerald-700";
  if (b === "LOST" || b === "NO_BID") return "bg-rose-50 text-rose-700";
  if (b === "PROPOSAL" || b === "PRICING") return "bg-amber-50 text-amber-700";
  if (b === "DELIVERY" || b === "ACCOUNT") return "bg-sky-50 text-sky-700";
  if (b === "TASK") return "bg-violet-50 text-violet-700";
  if (b === "NOTE") return "bg-neutral-100 text-neutral-700";
  return "bg-neutral-100 text-neutral-600";
}

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await fetchAccount(id);
  if (!data) notFound();

  const { company, stats, milestones, narrative } = data;

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <nav className="mb-6 text-xs text-neutral-500">
          <Link href="/ai-console" className="hover:underline">
            AI Console
          </Link>
          <span className="mx-2">/</span>
          <span>Account 360</span>
        </nav>

        <header className="mb-8">
          <div className="mb-2 flex items-baseline gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">{company.name}</h1>
            <Link
              href={company.crmUrl}
              className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
              target="_blank"
            >
              Open in CRM ↗
            </Link>
          </div>
          <p className="text-sm text-neutral-600">
            {[company.league, company.venueName, company.serviceStatus].filter(Boolean).join(" · ") || "Account profile"}
          </p>
        </header>

        <section className="mb-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">AI narrative</h2>
          <p className="whitespace-pre-line text-base leading-relaxed text-neutral-800">{narrative}</p>
          <p className="mt-3 text-[11px] text-neutral-400">
            Re-resolved {new Date(data.generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC. Refresh page to regenerate.
          </p>
        </section>

        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total opps" value={String(stats.oppCount)} sub={`${stats.yearsActive ?? "?"}y active`} />
          <Stat label="Won" value={stats.wonValue} sub={`${stats.wonCount} deals`} tone="emerald" />
          <Stat
            label="Win rate"
            value={stats.winRate != null ? `${stats.winRate.toFixed(0)}%` : "—"}
            sub={`${stats.lostCount} lost / no-bid`}
          />
          <Stat label="Open" value={stats.openValue} sub={`${stats.openCount} active`} tone="amber" />
        </section>

        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Timeline</h2>
            <span className="text-xs text-neutral-500">{milestones.length} milestones</span>
          </div>
          <ol className="relative space-y-4 border-l border-neutral-200 pl-6">
            {milestones.map((m, idx) => (
              <li key={idx} className="relative">
                <span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full border-2 border-white bg-neutral-300 shadow" />
                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {m.badge && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${badgeColor(m.badge)}`}>
                          {m.badge}
                        </span>
                      )}
                      <span className="text-xs text-neutral-500">{m.at?.slice(0, 10) || "—"}</span>
                    </div>
                    {m.amount && <span className="text-xs font-medium text-neutral-700">{m.amount}</span>}
                  </div>
                  <div className="text-sm font-medium text-neutral-900">
                    {m.link ? (
                      <Link href={m.link} target="_blank" className="hover:underline">
                        {m.title}
                      </Link>
                    ) : (
                      m.title
                    )}
                  </div>
                  {m.detail && <div className="mt-0.5 text-xs text-neutral-500">{m.detail}</div>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "emerald" | "amber" }) {
  const accent =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "amber"
      ? "text-amber-700"
      : "text-neutral-900";
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${accent}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}
