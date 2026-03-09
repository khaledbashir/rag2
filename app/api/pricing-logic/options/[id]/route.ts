import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

// PUT update option (including formula upsert)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;
		const { optionText, nextNodeId, isFinal, formula } = await req.json();

		const data: any = {};
		if (optionText?.trim()) data.optionText = optionText.trim();
		if (nextNodeId !== undefined) data.nextNodeId = nextNodeId || null;
		if (typeof isFinal === "boolean") data.isFinal = isFinal;

		const option = await prisma.decisionOption.update({
			where: { id },
			data,
			include: { formula: true },
		});

		// Handle formula upsert/delete
		if (isFinal && formula?.formula) {
			await prisma.pricingFormula.upsert({
				where: { optionId: id },
				create: {
					optionId: id,
					formula: formula.formula,
					unit: formula.unit || "USD",
					notes: formula.notes || null,
				},
				update: {
					formula: formula.formula,
					unit: formula.unit || "USD",
					notes: formula.notes || null,
				},
			});
		} else if (!isFinal) {
			// Remove formula if option is no longer final
			await prisma.pricingFormula.deleteMany({ where: { optionId: id } });
		}

		// Return fresh option with formula
		const updated = await prisma.decisionOption.findUnique({
			where: { id },
			include: { formula: true },
		});
		return NextResponse.json(updated);
	} catch (error: any) {
		if (error?.code === "P2025") {
			return NextResponse.json({ error: "Option not found" }, { status: 404 });
		}
		log.error("Error updating option:", error);
		return NextResponse.json({ error: "Failed to update option" }, { status: 500 });
	}
}

// DELETE option (cascades to formula)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;
		await prisma.decisionOption.delete({ where: { id } });
		return NextResponse.json({ ok: true });
	} catch (error: any) {
		if (error?.code === "P2025") {
			return NextResponse.json({ error: "Option not found" }, { status: 404 });
		}
		log.error("Error deleting option:", error);
		return NextResponse.json({ error: "Failed to delete option" }, { status: 500 });
	}
}
