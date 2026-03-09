import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Require authenticated session for API routes.
 * Returns the session if valid, or a 401 NextResponse if not.
 *
 * Usage:
 *   const [session, errorResponse] = await requireAuth();
 *   if (errorResponse) return errorResponse;
 *   // session is guaranteed non-null here
 */
export async function requireAuth(): Promise<
    [Awaited<ReturnType<typeof auth>>, null] | [null, NextResponse]
> {
    try {
        const session = await auth();
        if (!session?.user) {
            return [null, NextResponse.json({ error: "Unauthorized" }, { status: 401 })];
        }
        return [session, null];
    } catch {
        return [null, NextResponse.json({ error: "Authentication failed" }, { status: 401 })];
    }
}
