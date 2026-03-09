import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

// POST create node
export async function POST(req: NextRequest) {
	try {
		const { categoryId, parentNodeId, question } = await req.json();
		if (!categoryId || !question?.trim()) {
			return NextResponse.json({ error: "categoryId and question are required" }, { status: 400 });
		}

		// Auto-assign order: next in sequence for this category
		const maxOrder = await prisma.decisionNode.aggregate({
			where: { categoryId },
			_max: { order: true },
		});
		const order = (maxOrder._max.order ?? 0) + 1;

		const node = await prisma.decisionNode.create({
			data: {
				categoryId,
				parentNodeId: parentNodeId || null,
				question: question.trim(),
				order,
			},
			include: { options: { include: { formula: true } } },
		});
		return NextResponse.json(node, { status: 201 });
	} catch (error) {
		log.error("Error creating node:", error);
		return NextResponse.json({ error: "Failed to create node" }, { status: 500 });
	}
}
