import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  FolderKanban,
  LayoutGrid,
  LifeBuoy,
  ShieldCheck,
} from "lucide-react";
import { auth } from "@/auth";

const appTiles = [
  {
    name: "CRM",
    url: "https://crm.ancsports.net",
    description: "Accounts, pipeline, contacts, reports, and Scout.",
    icon: BarChart3,
    accent: "bg-blue-600",
  },
  {
    name: "Proposal Engine",
    url: "/projects",
    description: "Estimates, RFP analysis, proposals, and scoping workbooks.",
    icon: FileSpreadsheet,
    accent: "bg-emerald-600",
  },
  {
    name: "Services Dashboard",
    url: "https://services.ancsports.net/dashboard",
    description: "Events, venues, tickets, staffing, and field operations.",
    icon: CalendarDays,
    accent: "bg-zinc-900",
  },
  {
    name: "Operations Workspace",
    url: "https://services.ancsports.net/operations",
    description: "Airtable-style views for displays, walkthroughs, and maintenance.",
    icon: ClipboardList,
    accent: "bg-amber-500",
  },
  {
    name: "ANC Forms",
    url: "https://forms.ancsports.net",
    description: "Shared request intake for companies, people, and design flows.",
    icon: FolderKanban,
    accent: "bg-cyan-600",
  },
  {
    name: "Operator Docs",
    url: "https://docs.ancsports.net",
    description: "Platform guides, workflows, training notes, and support docs.",
    icon: LifeBuoy,
    accent: "bg-indigo-600",
  },
];

const quickLinks = [
  { label: "New estimate", href: "/estimator/new" },
  { label: "RFP analyzer", href: "/tools/rfp-analyzer" },
  { label: "Pipeline", href: "/pipeline" },
  { label: "Product catalog", href: "/admin/products" },
];

export default async function HubPage() {
  const session = await auth();
  const name = session?.user?.name || session?.user?.email || "ANC";

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-zinc-950">
      <section className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-md border border-zinc-200 bg-white">
              <Image src="/ANC_Logo_2023_blue.png" alt="ANC" width={34} height={34} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                ANC Platform
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
                Welcome, {name}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            <ShieldCheck className="h-4 w-4" />
            Microsoft identity
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-950">Apps</h2>
              <p className="mt-1 text-sm text-zinc-500">Sales, proposals, service operations, forms, and docs.</p>
            </div>
            <LayoutGrid className="h-5 w-5 text-zinc-400" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {appTiles.map((tile) => {
              const Icon = tile.icon;
              const external = tile.url.startsWith("http");
              const content = (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-md text-white ${tile.accent}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-zinc-400" />
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-zinc-950">{tile.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">{tile.description}</p>
                </>
              );

              return external ? (
                <a
                  key={tile.name}
                  href={tile.url}
                  className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
                >
                  {content}
                </a>
              ) : (
                <Link
                  key={tile.name}
                  href={tile.url}
                  className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
                >
                  {content}
                </Link>
              );
            })}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">Proposal shortcuts</h2>
            <div className="mt-4 space-y-2">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  {link.label}
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">Login model</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-600">
              <p>Each app keeps its own permissions and trusts the same ANC Microsoft identity.</p>
              <p>CRM is already wired. Proposal Engine and Services use the same Entra tenant as they come online.</p>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
