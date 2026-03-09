export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import * as xlsx from "xlsx";
import { parseFormSheet } from "@/services/specsheet/formSheetParser";
import { renderSpecSheetHtml } from "@/services/specsheet/specSheetRenderer";
import { renderPerformanceStandardsHtml, type SpecSheetProjectMeta } from "@/services/specsheet/specSheetFormRenderer";
import { log } from "@/lib/logger";

function getRequestOrigin(req: NextRequest): string {
    const xfProto = req.headers.get("x-forwarded-proto");
    const xfHost = req.headers.get("x-forwarded-host");
    const host = xfHost || req.headers.get("host");
    const proto = (xfProto || req.nextUrl.protocol.replace(":", "") || "http").split(",")[0].trim() || "http";
    if (host) {
        const cleanHost = host.split(",")[0].trim();
        return `${proto}://${cleanHost}`;
    }
    return req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
    let browser: any;
    let page: any;

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const overridesRaw = formData.get("overrides") as string | null;
        const format = (formData.get("format") as string | null) || "rfp-form"; // "rfp-form" | "anc-branded"
        const projectMetaRaw = formData.get("projectMeta") as string | null;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const workbook = xlsx.read(buffer, { type: "buffer" });

        const result = parseFormSheet(workbook);
        if (result.displays.length === 0) {
            return NextResponse.json({
                error: "No displays found in FORM sheet",
                warnings: result.warnings,
                help: [
                    "Make sure the workbook has a 'Form' tab with display data.",
                    "The Form tab should have a 'Display Name (Use)' row with one column per display.",
                ],
            }, { status: 422 });
        }

        // Apply manual overrides if provided
        if (overridesRaw) {
            try {
                const overrides = JSON.parse(overridesRaw) as Record<string, Record<string, string>>;
                for (const d of result.displays) {
                    const dOverrides = overrides[String(d.index)];
                    if (dOverrides) {
                        for (const [key, value] of Object.entries(dOverrides)) {
                            if (key in d && value !== undefined && value !== null) {
                                (d as any)[key] = value;
                            }
                        }
                    }
                }
            } catch {
                log.warn("[SPEC SHEET] Failed to parse overrides JSON");
            }
        }

        const origin = getRequestOrigin(req).replace(/\/+$/, "");

        // Build project metadata: UI overrides > FORM sheet parsed data
        let projectMeta: SpecSheetProjectMeta = {
            venueName: result.venueName || result.projectName || "",
            clientName: result.clientName || "",
            clientAddress: result.clientAddress || "",
        };
        if (projectMetaRaw) {
            try {
                const uiMeta = JSON.parse(projectMetaRaw) as SpecSheetProjectMeta;
                if (uiMeta.venueName) projectMeta.venueName = uiMeta.venueName;
                if (uiMeta.clientName) projectMeta.clientName = uiMeta.clientName;
                if (uiMeta.clientAddress) projectMeta.clientAddress = uiMeta.clientAddress;
            } catch {}
        }

        const html = format === "anc-branded"
            ? renderSpecSheetHtml(result, origin)
            : renderPerformanceStandardsHtml(result, origin, projectMeta);

        // Puppeteer PDF generation — same pattern as generateProposalPdfService
        const puppeteer = (await import("puppeteer-core")).default;
        const internalUrl = process.env.BROWSERLESS_INTERNAL_URL || "ws://basheer_browserless:3000";
        const externalUrl = process.env.BROWSERLESS_URL;
        const ENV = process.env.NODE_ENV;

        try {
            log.info(`[SPEC SHEET] Attempting internal Browserless: ${internalUrl.slice(0, 50)}...`);
            browser = await puppeteer.connect({ browserWSEndpoint: internalUrl });
            log.info("[SPEC SHEET] Browserless connected via internal network!");
        } catch (e) {
            log.info(`[SPEC SHEET] Internal Browserless unavailable: ${e instanceof Error ? e.message : String(e)}`);
        }

        if (!browser && externalUrl) {
            try {
                log.info(`[SPEC SHEET] Attempting external Browserless: ${externalUrl.slice(0, 50)}...`);
                browser = await puppeteer.connect({ browserWSEndpoint: externalUrl });
                log.info("[SPEC SHEET] Browserless connected via external URL!");
            } catch (e) {
                log.error(`[SPEC SHEET] External Browserless connect failed: ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        if (!browser && ENV === "production") {
            const chromium = (await import("@sparticuz/chromium")).default;
            const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || (await chromium.executablePath());
            browser = await puppeteer.launch({
                args: [...chromium.args, "--disable-dev-shm-usage", "--ignore-certificate-errors", "--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
                executablePath: execPath,
                headless: true,
            });
        } else if (!browser) {
            const puppeteerFull = (await import("puppeteer")).default;
            browser = await puppeteerFull.launch({
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
                headless: true,
            });
        }

        if (!browser) {
            throw new Error("Failed to launch browser — no Browserless connection and no local Chromium available");
        }

        page = await browser.newPage();
        await page.setViewport({ width: 794, height: 1122, deviceScaleFactor: 1 });
        await page.setContent(html, { waitUntil: ["domcontentloaded", "load"], timeout: 30000 });

        try {
            await page.evaluate(async () => {
                if ((document as any).fonts?.ready) await (document as any).fonts.ready;
            });
        } catch {}

        const pdf: Uint8Array = await page.pdf({
            width: "8.5in",
            height: "11in",
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: '<div style="font-size:1px;"></div>',
            footerTemplate: format === "anc-branded"
                ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; width: 100%; padding: 0 40px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e5e7eb; padding-top: 4px; box-sizing: border-box;">
                    <div style="font-size: 7.5px; font-weight: 600; color: #0A52EF; letter-spacing: 0.3px;">www.anc.com</div>
                    <div style="font-size: 7px; color: #94a3b8;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
                  </div>`
                : `<div style="font-family: 'Times New Roman', serif; width: 100%; padding: 0 40px; display: flex; justify-content: flex-end;">
                    <div style="font-size: 7px; color: #666;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
                  </div>`,
            margin: format === "anc-branded"
                ? { top: "20px", bottom: "40px", left: "20px", right: "20px" }
                : { top: "0.4in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
        });

        const projectName = result.projectName || "Spec_Sheets";
        const safeName = projectName.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");

        return new NextResponse(new Blob([pdf as any], { type: "application/pdf" }), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${safeName}_Spec_Sheets.pdf"`,
                "Cache-Control": "no-cache",
            },
            status: 200,
        });
    } catch (error: any) {
        Sentry.captureException(error, { tags: { area: "specsheet-generation" } });
        log.error("[SPEC SHEET] Generation error:", error);
        return NextResponse.json({ error: "Failed to generate spec sheets", message: String(error?.message || error) }, { status: 500 });
    } finally {
        if (page) try { await page.close(); } catch {}
        if (browser) {
            try {
                const pages = await browser.pages();
                await Promise.all(pages.map((p: any) => p.close()));
                await browser.close();
            } catch {}
        }
    }
}
