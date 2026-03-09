import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

// POST create option
export async function POST(req: NextRequest) {
	try {
		const { nodeId, optionText, nextNodeId, isFinal, formula } = await req.json();
		if (!nodeId || !optionText?.trim()) {
			return NextResponse.json({ error: "nodeId and optionText are required" }, { status: 400 });
		}

		const option = await prisma.decisionOption.create({
			data: {
				nodeId,
				optionText: optionText.trim(),
				nextNodeId: nextNodeId || null,
				isFinal: isFinal ?? false,
				...(isFinal && formula?.formula
					? {
							formula: {
								create: {
									formula: formula.formula,
									unit: formula.unit || "USD",
									notes: formula.notes || null,
								},
							},
						}
					: {}),
			},
			include: { formula: true },
		});
		return NextResponse.json(option, { status: 201 });
	} catch (error) {
		log.error("Error creating option:", error);
		return NextResponse.json({ error: "Failed to create option" }, { status: 500 });
	}
}
