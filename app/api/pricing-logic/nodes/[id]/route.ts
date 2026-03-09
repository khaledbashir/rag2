import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

// PUT update node
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;
		const { question, order } = await req.json();
		const data: any = {};
		if (question?.trim()) data.question = question.trim();
		if (typeof order === "number") data.order = order;

		const node = await prisma.decisionNode.update({
			where: { id },
			data,
			include: { options: { include: { formula: true } } },
		});
		return NextResponse.json(node);
	} catch (error: any) {
		if (error?.code === "P2025") {
			return NextResponse.json({ error: "Node not found" }, { status: 404 });
		}
		log.error("Error updating node:", error);
		return NextResponse.json({ error: "Failed to update node" }, { status: 500 });
	}
}

// DELETE node (cascades to options → formulas)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;
		await prisma.decisionNode.delete({ where: { id } });
		return NextResponse.json({ ok: true });
	} catch (error: any) {
		if (error?.code === "P2025") {
			return NextResponse.json({ error: "Node not found" }, { status: 404 });
		}
		log.error("Error deleting node:", error);
		return NextResponse.json({ error: "Failed to delete node" }, { status: 500 });
	}
}
