import Link from "next/link";
import { AccountSearch } from "./_components/AccountSearch";

export const metadata = {
  title: "AI Console · ANC",
  description: "Account intelligence on demand — relationship arc + AI narrative for any ANC account.",
};

export const dynamic = "force-dynamic";

export default function AiConsolePage() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-3xl px-6 pb-24 pt-20">
        <header className="mb-12">
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-400">
            ANC · AI Console
          </span>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-neutral-900">
            Look up any account.
          </h1>
          <p className="mt-3 text-base text-neutral-600">
            Relationship arc, win-rate, lifetime value, and an AI narrative — pulled live from the CRM in seconds.
          </p>
        </header>

        <section className="mb-16">
          <AccountSearch />
          <p className="mt-3 text-xs text-neutral-400">
            Try Houston Astros, Mavericks, Notre Dame, or any account you work.
          </p>
        </section>

        <footer className="border-t border-neutral-200 pt-6 text-xs text-neutral-500">
          <p>
            Full AI capability catalog lives inside the CRM under{" "}
            <Link href="https://crm.ancsports.net" className="text-neutral-700 underline hover:text-neutral-900">
              AI &amp; AI Activity
            </Link>
            . Same answers reachable in Slack via @ANC.
          </p>
        </footer>
      </div>
    </div>
  );
}
