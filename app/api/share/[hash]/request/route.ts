export const runtime = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { postClientChangeRequestNote } from "@/services/integrations/twenty/crmAutomation";

/**
 * Async AI triage — non-blocking.
 * Categorizes annotation transcripts via AnythingLLM and updates the DB.
 */
async function triageAnnotationsAsync(
	proposalId: string,
	changeRequestIds: string[]
) {
	try {
		const records = await prisma.changeRequest.findMany({
			where: { id: { in: changeRequestIds } },
			select: { id: true, transcript: true, message: true },
		});

		const proposal = await prisma.proposal.findUnique({
			where: { id: proposalId },
			select: { aiWorkspaceSlug: true },
		});

		const workspaceSlug = proposal?.aiWorkspaceSlug || "researcher";

		const annotationsForTriage = records.map((r) => ({
			id: r.id,
			transcript: r.transcript || r.message,
		}));

		if (annotationsForTriage.length === 0) return;

		const { triageAnnotations } = await import("@/lib/anything-llm");
		const results = await triageAnnotations(
			workspaceSlug,
			annotationsForTriage
		);

		for (const result of results) {
			await prisma.changeRequest.update({
				where: { id: result.id },
				data: {
					aiCategory: result.category,
					aiConfidence: result.confidence,
				},
			});
		}

		log.info(
			`[AI Triage] Categorized ${results.length} annotations for proposal ${proposalId}`
		);
	} catch (err) {
		log.error("[AI Triage] Failed:", err);
	}
}

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ hash: string }> }
) {
	const { hash } = await params;
	try {
		const body = await req.json().catch(() => null);
		const requesterName = (body?.name || "").toString().trim();
		const requesterEmail = (body?.email || "").toString().trim();

		// Validate share link
		const snapshot = await prisma.proposalSnapshot.findUnique({
			where: { shareHash: hash },
			select: { proposalId: true, expiresAt: true },
		});

		if (!snapshot) {
			return NextResponse.json(
				{ error: "Share link not found" },
				{ status: 404 }
			);
		}

		if (snapshot.expiresAt && snapshot.expiresAt.getTime() < Date.now()) {
			return NextResponse.json(
				{ error: "Share link expired" },
				{ status: 410 }
			);
		}

		// ─── Batch Annotation Path (Client Review Annotator) ───
		if (body?.annotations && Array.isArray(body.annotations)) {
			if (!requesterName) {
				return NextResponse.json(
					{ error: "Missing required field: name" },
					{ status: 400 }
				);
			}

			const sessionId = body.sessionId || crypto.randomUUID();
			const createdIds: string[] = [];

			for (const ann of body.annotations) {
				const record = await prisma.changeRequest.create({
					data: {
						proposalId: snapshot.proposalId,
						shareHash: hash,
						requesterName,
						requesterEmail: requesterEmail || null,
						message: ann.transcript || ann.message || "",
						pinX: ann.pinX ?? null,
						pinY: ann.pinY ?? null,
						pinNumber: ann.pinNumber ?? null,
						screenshotData: ann.screenshotData ?? null,
						audioData: ann.audioData ?? null,
						audioDuration: ann.audioDuration ?? null,
						transcript: ann.transcript ?? null,
						sessionId,
					},
				});
				createdIds.push(record.id);
			}

			await prisma.activityLog.create({
				data: {
					proposalId: snapshot.proposalId,
					action: "CLIENT_ANNOTATION_BATCH",
					description: `Client submitted ${createdIds.length} annotations via review mode`,
					metadata: {
						shareHash: hash,
						requesterName,
						requesterEmail: requesterEmail || undefined,
						sessionId,
						annotationCount: createdIds.length,
					},
				},
			});

			// Fire AI triage asynchronously (non-blocking)
			triageAnnotationsAsync(snapshot.proposalId, createdIds).catch(
				log.error
			);

			postClientChangeRequestNote({
				proposalId: snapshot.proposalId,
				requesterName,
				requesterEmail: requesterEmail || null,
				count: createdIds.length,
			}).catch((err) =>
				log.warn("[share/request] Twenty CRM note sync failed:", err?.message || err),
			);

			return NextResponse.json({
				ok: true,
				ids: createdIds,
				sessionId,
			});
		}

		// ─── Legacy Single-Message Path (text form) ───
		const message = (body?.message || "").toString().trim();

		if (!requesterName || !message) {
			return NextResponse.json(
				{ error: "Missing required fields: name and message" },
				{ status: 400 }
			);
		}

		const created = await prisma.changeRequest.create({
			data: {
				proposalId: snapshot.proposalId,
				shareHash: hash,
				requesterName,
				requesterEmail: requesterEmail || null,
				message,
			},
		});

		await prisma.activityLog.create({
			data: {
				proposalId: snapshot.proposalId,
				action: "CLIENT_CHANGE_REQUEST",
				description: `Client requested changes via share link`,
				metadata: {
					shareHash: hash,
					requesterName,
					requesterEmail: requesterEmail || undefined,
					changeRequestId: created.id,
				},
			},
		});

		postClientChangeRequestNote({
			proposalId: snapshot.proposalId,
			requesterName,
			requesterEmail: requesterEmail || null,
			message,
		}).catch((err) =>
			log.warn("[share/request] Twenty CRM note sync failed:", err?.message || err),
		);

		return NextResponse.json({ ok: true, id: created.id });
	} catch (error: any) {
		return NextResponse.json(
			{
				error: "Failed to submit request",
				details: error?.message || String(error),
			},
			{ status: 500 }
		);
	}
}
