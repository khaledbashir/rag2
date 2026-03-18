import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import chromium from "@sparticuz/chromium";
import { getProposalTemplate } from "@/lib/helpers";
import { ENV, TAILWIND_CDN } from "@/lib/variables";
import { ProposalType } from "@/types";
import { sanitizeForClient } from "@/lib/security/sanitizeForClient";
import { PRICING_PARSER_STRICT_VERSION } from "@/services/pricing/pricingTableParser";

function safeErrorMessage(err: unknown) {
	const msg = err instanceof Error ? err.message : String(err);
	return msg.replace(/token=[^&\s]+/gi, "token=***");
}

function getRequestOrigin(req: NextRequest): string {
	// Prefer forwarded headers (common on EasyPanel / reverse proxies)
	const xfProto = req.headers.get("x-forwarded-proto");
	const xfHost = req.headers.get("x-forwarded-host");
	const host = xfHost || req.headers.get("host");

	const proto =
		(xfProto || req.nextUrl.protocol.replace(":", "") || "http")
			.split(",")[0]
			.trim() || "http";

	if (host) {
		const cleanHost = host.split(",")[0].trim();
		return `${proto}://${cleanHost}`;
	}

	return req.nextUrl.origin;
}

/**
 * Inject PDF viewer preferences so the document opens in Single Page / Fit Page mode.
 * Patches the PDF catalog dictionary with /PageLayout /SinglePage and /PageMode /UseNone.
 * Uses Buffer.indexOf to find the catalog safely without corrupting binary streams.
 */
function setPdfViewerPreferences(pdfBytes: Uint8Array): Uint8Array {
	const buf = Buffer.from(pdfBytes);
	// Find "/Type /Catalog" in the PDF — this marks the catalog dictionary
	const catalogMarker = Buffer.from("/Type /Catalog");
	const catalogPos = buf.indexOf(catalogMarker);
	if (catalogPos === -1) return pdfBytes;

	// Find the closing ">>" of the catalog dictionary (search forward from the marker)
	const closingMarker = Buffer.from(">>");
	const closePos = buf.indexOf(closingMarker, catalogPos + catalogMarker.length);
	if (closePos === -1) return pdfBytes;

	// Check what's already in the catalog (scan the region between obj start and >>)
	const catalogRegion = buf.slice(catalogPos, closePos).toString("ascii");
	const additions: string[] = [];
	if (!catalogRegion.includes("/PageLayout")) additions.push("/PageLayout /SinglePage");
	if (!catalogRegion.includes("/PageMode")) additions.push("/PageMode /UseNone");
	if (additions.length === 0) return pdfBytes;

	// Splice the patch bytes in right before the closing ">>"
	const patch = Buffer.from(" " + additions.join(" ") + " ");
	return Buffer.concat([buf.slice(0, closePos), patch, buf.slice(closePos)]);
}

export async function generateProposalPdfServiceV2(req: NextRequest) {
	const body: ProposalType = await req.json();
	let browser: any;
	let page: any;

	const pricingDocument = (body.details as any)?.pricingDocument || (body as any)?.pricingDocument;
	const documentMode = (body.details as any)?.documentMode;
	const isMirrorMode = (body.details as any)?.mirrorMode === true
		|| (body.details as any)?.calculationMode === "MIRROR";
	const validation = pricingDocument?.metadata?.validation || (body.details as any)?.parserValidationReport;
	const parserStrictVersion = (body.details as any)?.parserStrictVersion || pricingDocument?.metadata?.parserStrictVersion;
	const preflightError = (error: string, guidance: string[]) =>
		new NextResponse(JSON.stringify({ error, guidance }), {
			status: 422,
			headers: { "Content-Type": "application/json" },
		});

	// If we have valid audit data (non-zero totals), skip Mirror Mode validation gates.
	// The audit engine already computed real numbers — the PDF can render from that.
	// This handles consultant schedules, RFP Analyzer imports, and other non-MA sources.
	const audit = (body as any)?._audit;
	const hasValidAudit = audit?.internalAudit?.totals?.finalClientTotal > 0;

	if (isMirrorMode && !hasValidAudit && (!pricingDocument || !Array.isArray(pricingDocument?.tables) || pricingDocument.tables.length === 0)) {
		return preflightError(
			"We couldn't generate this PDF because pricing tables were not found in the uploaded Excel.",
			[
				"Make sure the workbook includes a valid Margin Analysis tab.",
				"Re-upload the Excel and try export again.",
			]
		);
	}
	if (isMirrorMode && !hasValidAudit && (!validation || validation.status !== "PASS")) {
		return preflightError(
			"We couldn't generate this PDF because the Excel data is incomplete or formatted differently than expected.",
			[
				"Check that the file includes a valid Margin Analysis tab with pricing columns.",
				"Re-upload the corrected workbook and export again.",
			]
		);
	}
	if (isMirrorMode && !hasValidAudit && parserStrictVersion !== PRICING_PARSER_STRICT_VERSION) {
		return preflightError(
			"This project needs a fresh Excel parse before export.",
			[
				"Re-upload the source Excel file for this project.",
				"Then generate a new PDF.",
			]
		);
	}
	const hadRespMatrixCandidates = Array.isArray(validation?.evidence?.respMatrixSheetCandidates) && validation.evidence.respMatrixSheetCandidates.length > 0;
	const hasParsedRespMatrix = !!(pricingDocument?.respMatrix?.categories?.length);
	if (isMirrorMode && (documentMode === "LOI" || documentMode === "CONTRACT") && hadRespMatrixCandidates && !hasParsedRespMatrix) {
		return preflightError(
			"We couldn't find a usable Responsibility Matrix in this Excel.",
			[
				"If your file includes one, make sure the sheet name starts with 'Resp Matrix'.",
				"Make sure the matrix has Description, ANC, and Purchaser columns.",
				"Upload again, or continue without the matrix section.",
			]
		);
	}

	try {
		const ReactDOMServer = (await import("react-dom/server")).default;

		// Map pageLayout to Puppeteer PDF dimensions
		// For landscape, use portrait dimensions - the landscape:true flag rotates the page
		const pageLayoutMap: Record<string, { width: string; height: string }> = {
			"portrait-letter": { width: "8.5in", height: "11in" },
			"portrait-legal": { width: "8.5in", height: "14in" },
			"portrait-a4": { width: "8.27in", height: "11.69in" },
			"landscape-letter": { width: "8.5in", height: "11in" },
			"landscape-legal": { width: "8.5in", height: "14in" },
			"landscape-a4": { width: "8.27in", height: "11.69in" },
		};
		const requestedLayout = (body.details as any)?.pageLayout;
		const pageLayout = pageLayoutMap[requestedLayout] ? requestedLayout : "portrait-letter";
		const layout = pageLayoutMap[pageLayout];
		const isLandscapeLayout = pageLayout.startsWith("landscape");

		// Always use ProposalTemplate5 (Hybrid) — handles both Mirror Mode and Intelligence Mode
		let templateId = body.details?.pdfTemplate ?? 5;
		const DEPRECATED_TEMPLATES = [1, 2, 3, 4];
		if (DEPRECATED_TEMPLATES.includes(templateId)) {
			console.info(`[PDF] Remapping deprecated template ${templateId} → 5 (Hybrid)`);
			templateId = 5;
		}
		const ProposalTemplate = await getProposalTemplate(templateId);

		if (!ProposalTemplate) {
			throw new Error("Failed to load ProposalTemplate");
		}

		// PHASE 3: Strip Blue Glow metadata from client-facing PDF
		// Use sanitizeForClient to remove all internal metadata (aiExtractedFields, verifiedFields, etc.)
		// This ensures clean, professional PDF output without AI indicators or internal cost data
		const sanitizedBody = sanitizeForClient<ProposalType>(body);

		const htmlTemplate = ReactDOMServer.renderToStaticMarkup(
			ProposalTemplate(sanitizedBody)
		);

		// IMPORTANT: page.setContent() loads into about:blank.
		// Without a <base href>, absolute-root paths like "/ANC_Logo_2023_blue.png"
		// won't resolve during server-side PDF generation, causing broken logos.
		const origin = getRequestOrigin(req).replace(/\/+$/, "");
		const baseHref = `${origin}/`;

		// Build a descriptive document title for PDF metadata (shows in browser tab & Properties)
		const clientName = ((body.details as any)?.clientName || (body.details as any)?.proposalName || "Proposal").toString()
			.replace(/[/\\:*?"<>|]/g, "").replace(/\s+/g, "_").trim().slice(0, 50) || "Proposal";
		const docTypeLabel = documentMode === "LOI" ? "Letter_of_Intent" : documentMode === "CONTRACT" ? "Contract" : documentMode === "PROPOSAL" ? "Proposal" : "Budget_Estimate";
		const dateStr = new Date().toISOString().slice(0, 10);
		const pdfTitle = `ANC_${clientName}_${docTypeLabel}_${dateStr}`;

		const fontSizePt = Math.min(18, Math.max(8, Number((body.details as any)?.templateConfig?.fontSizePt ?? 14) || 14));
		const baseFontSizePx = fontSizePt === 14 ? 11 : Math.round(11 + (fontSizePt - 14));
		const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${pdfTitle}</title><base href="${baseHref}"/><style>body,.font-sans{font-family:Arial,Helvetica,sans-serif!important;line-height:1.3!important;font-size:${baseFontSizePx}px!important}h1,h2,h3,h4,h5,h6{font-family:Arial,Helvetica,sans-serif!important;line-height:1.3!important}p,div,span,td,th{line-height:1.3!important}.leading-relaxed{line-height:1.35!important}.leading-snug{line-height:1.25!important}</style></head><body>${htmlTemplate}</body></html>`;

		const puppeteer = (await import("puppeteer-core")).default;
		const internalUrl = process.env.BROWSERLESS_INTERNAL_URL || "ws://basheer_browserless:3000";
		const externalUrl = process.env.BROWSERLESS_URL;

		// Try internal Docker network first (faster, no auth overhead)
		try {
			console.log(`Attempting internal Browserless: ${internalUrl.slice(0, 50)}...`);
			browser = await puppeteer.connect({ browserWSEndpoint: internalUrl });
			console.log("Browserless connected via internal network!");
		} catch (e) {
			const errMsg = e instanceof Error ? e.message : String(e);
			console.log(`Internal Browserless unavailable: ${errMsg}`);
		}

		// Fall back to external Browserless URL
		if (!browser && externalUrl) {
			try {
				console.log(`Attempting external Browserless: ${externalUrl.slice(0, 50)}...`);
				browser = await puppeteer.connect({ browserWSEndpoint: externalUrl });
				console.log("Browserless connected via external URL!");
			} catch (e) {
				const errMsg = e instanceof Error ? e.message : String(e);
				console.error("External Browserless connect failed:", errMsg);
				console.error("Falling back to local Chromium...");
			}
		}

		if (!browser && ENV === "production") {
			const execPath =
				process.env.PUPPETEER_EXECUTABLE_PATH || (await chromium.executablePath());
			browser = await puppeteer.launch({
				args: [
					...chromium.args,
					"--disable-dev-shm-usage",
					"--ignore-certificate-errors",
					"--no-sandbox",
					"--disable-setuid-sandbox",
					"--disable-gpu",
				],
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
			throw new Error("Failed to launch browser");
		}

		page = await browser.newPage();
		const viewportWidth = isLandscapeLayout ? 1122 : 794;
		await page.setViewport({ width: viewportWidth, height: 1122, deviceScaleFactor: 1 });
		try {
			await page.emulateMediaType("screen");
		} catch {
		}
		await page.setContent(html, {
			waitUntil: ["domcontentloaded", "load"],
			timeout: 60000,
		});

		// Keep CSS print page size synchronized with the selected PDF layout.
		await page.addStyleTag({
			content: `@media print { @page { size: ${layout.width} ${layout.height}; } }`,
		});

		try {
			await page.addStyleTag({ url: TAILWIND_CDN });
		} catch (e) {
			console.error("Failed to load Tailwind CDN CSS, continuing without it");
		}
		try {
			await page.evaluate(async () => {
				if ((document as any).fonts?.ready) {
					await (document as any).fonts.ready;
				}
			});
		} catch {
		}
		try {
			await page.evaluate(async () => {
				const images = Array.from(document.images || []);
				await Promise.all(
					images.map((img) =>
						img.complete
							? Promise.resolve()
							: new Promise<void>((resolve) => {
									img.addEventListener("load", () => resolve(), { once: true });
									img.addEventListener("error", () => resolve(), { once: true });
								})
					)
				);
			});
		} catch {
		}

		const rawPdf: Uint8Array = await page.pdf({
			width: layout.width,
			height: layout.height,
			landscape: isLandscapeLayout,
			preferCSSPageSize: false,
			printBackground: true,
			displayHeaderFooter: true,
			// Empty header (1px font hides default browser header)
			headerTemplate: '<div style="font-size:1px;"></div>',
			// Simplified footer: www.anc.com + page number (Natalia-approved)
			footerTemplate: `
				<div style="font-family: 'Helvetica Neue', Arial, sans-serif; width: 100%; padding: 0 40px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e5e7eb; padding-top: 4px; box-sizing: border-box;">
					<div style="font-size: 8.5px; font-weight: 600; color: #0A52EF; letter-spacing: 0.3px;">www.anc.com</div>
					<div style="font-size: 8px; color: #94a3b8;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
				</div>
			`,
			margin: {
				top: "20px",
				bottom: "40px",
				left: "20px",
				right: "20px",
			},
		});

		// Post-process: inject PDF viewer preferences (Single Page layout, Fit Page zoom)
		const pdf = setPdfViewerPreferences(rawPdf);

		return new NextResponse(new Blob([pdf as any], { type: "application/pdf" }), {
			headers: {
				"Content-Type": "application/pdf",
				"Content-Disposition": `inline; filename="${pdfTitle}.pdf"`,
				"Cache-Control": "no-cache",
				Pragma: "no-cache",
			},
			status: 200,
		});
	} catch (error: any) {
		Sentry.captureException(error, { tags: { area: "pdf-generation" } });
		const message = safeErrorMessage(error);
		console.error("PDF Generation Error:", message);
		return new NextResponse(JSON.stringify({ error: "Failed to generate PDF", message }), {
			status: 500,
			headers: {
				"Content-Type": "application/json",
			},
		});
	} finally {
		if (page) {
			try {
				await page.close();
			} catch (e) {
				console.error("Error closing page:", e);
			}
		}
		if (browser) {
			try {
				const pages = await browser.pages();
				await Promise.all(pages.map((p: any) => p.close()));
				await browser.close();
			} catch (e) {
				console.error("Error closing browser:", e);
			}
		}
	}
}
