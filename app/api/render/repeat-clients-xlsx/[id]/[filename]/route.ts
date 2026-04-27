/**
 * GET /api/render/repeat-clients-xlsx/:id/:filename
 *
 * Serves a previously-rendered xlsx by id. The render endpoint writes to
 * /tmp/jireh-reports/{id}.xlsx and returns this URL. Public download — no
 * auth, since the URL itself contains a UUID. Reports auto-expire when
 * the container restarts (tmpfs).
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; filename: string }> }
) {
    const { id, filename } = await params;
    if (!/^[0-9a-f-]{36}$/.test(id)) {
        return NextResponse.json({ error: "bad id" }, { status: 400 });
    }
    const path = join("/tmp/jireh-reports", `${id}.xlsx`);
    if (!existsSync(path)) {
        return NextResponse.json({ error: "expired or not found" }, { status: 404 });
    }
    const buf = readFileSync(path);
    const safeName = decodeURIComponent(filename).replace(/[\r\n"]/g, "");
    return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${safeName}"`,
            "Cache-Control": "no-cache",
        },
    });
}
