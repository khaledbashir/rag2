/**
 * Structured logger — silent in production, verbose in development.
 * Drop-in replacement for console.log/warn/error in API routes.
 *
 * Usage:
 *   import { log } from "@/lib/logger";
 *   log.info("[EXCEL IMPORT]", "Parsed 5 tables");
 *   log.warn("[PARSER]", "Fallback triggered");
 *   log.error("[API]", error);
 */

const isProd = process.env.NODE_ENV === "production";

function noop(..._args: unknown[]) {}

export const log = {
    /** Debug info — suppressed in production */
    info: isProd ? noop : console.log.bind(console),
    /** Warnings — always visible */
    warn: console.warn.bind(console),
    /** Errors — always visible (also sent to Sentry separately) */
    error: console.error.bind(console),
    /** Debug-only — never in production */
    debug: isProd ? noop : console.debug.bind(console),
};

export default log;
