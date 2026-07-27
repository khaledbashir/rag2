/**
 * Generic strict-JSON completion over the shared AI provider chain
 * (services/intake/emailToCrmSync.ts). Same resilience contract as the
 * email → CRM extraction: every configured provider is tried in order,
 * a 429/5xx/network/parse failure falls through to the next.
 */

import { log } from "@/lib/logger";
import { providerChain, type Provider } from "@/services/intake/emailToCrmSync";

async function completeJson<T>(provider: Provider, system: string, user: string): Promise<T> {
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      // GLM models truncate JSON mid-object at low limits; newer OpenAI models
      // reject max_tokens / non-default temperature — shape params per provider.
      ...(provider.name === "openai"
        ? { max_completion_tokens: 6000 }
        : { temperature: 0.2, max_tokens: 6000 }),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${text.slice(0, 160)}`);
  }
  const payload = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content || "";
  const jsonText = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(jsonText) as T;
  } catch {
    throw new Error(`non-JSON output: ${content.slice(0, 160)}`);
  }
}

export async function extractJsonWithProviderChain<T>(system: string, user: string): Promise<T> {
  const chain = providerChain();
  if (chain.length === 0) throw new Error("No AI provider configured.");
  const failures: string[] = [];
  for (const provider of chain) {
    try {
      const result = await completeJson<T>(provider, system, user);
      if (failures.length > 0) {
        log.info(`[briefing] succeeded on fallback provider ${provider.name} after: ${failures.join(" | ")}`);
      }
      return result;
    } catch (err) {
      failures.push(`${provider.name}: ${String((err as Error)?.message || err).slice(0, 140)}`);
    }
  }
  throw new Error(`Briefing AI failed on all providers — ${failures.join(" | ")}`);
}
