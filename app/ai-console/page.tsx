import Link from "next/link";
import { AccountSearch } from "./_components/AccountSearch";

export const metadata = {
  title: "AI Console · ANC",
  description: "Curated AI surface for the ANC CRM — chips, briefings, FAQ, Account 360.",
};

export const dynamic = "force-dynamic";

const CHIPS = [
  {
    label: "Account 360",
    description: "Full relationship history + AI narrative for any account",
    status: "live" as const,
    href: null,
    hint: "Use the search above",
  },
  {
    label: "My pipeline",
    description: "Open opps assigned to me, sorted by what needs action",
    status: "soon" as const,
  },
  {
    label: "Stuck deals",
    description: "Anything in pipeline >30 days with no movement",
    status: "soon" as const,
  },
  {
    label: "Hot to call today",
    description: "Top accounts ranked by signal — priority + dormancy + value",
    status: "soon" as const,
  },
  {
    label: "Forecast vs target",
    description: "Current quarter committed + best-case + worst-case",
    status: "soon" as const,
  },
  {
    label: "Stuck-with-Charlie",
    description: "Anything sitting on Charlie's plate >5 days (Joe's view)",
    status: "soon" as const,
  },
];

export default function AiConsolePage() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8">
          <div className="flex items-baseline justify-between">
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">AI Console</h1>
            <span className="text-xs uppercase tracking-wider text-neutral-500">ANC · Live</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-neutral-600">
            Curated AI surface across the CRM — quick actions, account intelligence, dynamic FAQ. Each card is grounded in live data, no static demos.
          </p>
        </header>

        <section className="mb-10 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Account 360</h2>
              <p className="text-xs text-neutral-500">
                Relationship arc + AI narrative + chronological milestones for any account.
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              Live
            </span>
          </div>
          <AccountSearch />
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Quick actions
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CHIPS.map((chip) => (
              <ChipCard key={chip.label} {...chip} />
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PanelStub
            title="Today's briefing"
            description="Role-aware morning summary — what closed, what moved, what needs attention."
          />
          <PanelStub
            title="Dynamic FAQ"
            description="Top questions asked of the CRM right now, answered live against your data."
          />
        </section>

        <footer className="mt-10 flex items-center justify-between border-t border-neutral-200 pt-6 text-xs text-neutral-500">
          <span>
            CRM:{" "}
            <Link href="https://crm.ancsports.net" className="underline hover:text-neutral-700">
              crm.ancsports.net
            </Link>
          </span>
          <span>Slack: ask the @ANC bot for the same answers</span>
        </footer>
      </div>
    </div>
  );
}

function ChipCard(props: { label: string; description: string; status: "live" | "soon"; href?: string | null; hint?: string }) {
  const live = props.status === "live";
  return (
    <div
      className={`rounded-xl border p-4 transition ${
        live
          ? "border-neutral-200 bg-white shadow-sm hover:shadow-md"
          : "border-dashed border-neutral-300 bg-neutral-100/50"
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">{props.label}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
            live ? "bg-emerald-50 text-emerald-700" : "bg-neutral-200 text-neutral-600"
          }`}
        >
          {live ? "Live" : "Soon"}
        </span>
      </div>
      <p className="text-xs text-neutral-600">{props.description}</p>
      {props.hint && <p className="mt-2 text-[11px] italic text-neutral-400">{props.hint}</p>}
    </div>
  );
}

function PanelStub({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-100/50 p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
        <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-600">
          Soon
        </span>
      </div>
      <p className="text-sm text-neutral-600">{description}</p>
    </div>
  );
}
