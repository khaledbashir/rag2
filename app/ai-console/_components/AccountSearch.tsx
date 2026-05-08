"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Hit = { id: string; name: string };

export function AccountSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [isPending, startTransition] = useTransition();
  const [active, setActive] = useState(false);

  async function lookup(value: string) {
    setQ(value);
    if (value.trim().length < 2) {
      setHits([]);
      return;
    }
    const res = await fetch(`/api/ai-console/companies/search?q=${encodeURIComponent(value)}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { hits: Hit[] };
    setHits(data.hits);
  }

  function go(h: Hit) {
    setQ(h.name);
    setHits([]);
    setActive(false);
    startTransition(() => {
      router.push(`/ai-console/account/${h.id}`);
    });
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => lookup(e.target.value)}
        onFocus={() => setActive(true)}
        onBlur={() => setTimeout(() => setActive(false), 150)}
        placeholder="Search any account — e.g. Houston Astros, Mavericks, Notre Dame…"
        className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-200"
      />
      {active && hits.length > 0 && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
          {hits.map((h) => (
            <button
              key={h.id}
              onClick={() => go(h)}
              className="flex w-full items-center justify-between border-b border-neutral-100 px-4 py-2.5 text-left text-sm hover:bg-neutral-50 last:border-b-0"
            >
              <span className="font-medium">{h.name}</span>
              <span className="text-xs text-neutral-400">→</span>
            </button>
          ))}
        </div>
      )}
      {isPending && <div className="mt-2 text-xs text-neutral-500">Loading account…</div>}
    </div>
  );
}
