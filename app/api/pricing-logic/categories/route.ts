import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

// GET all categories
export async function GET() {
	try {
		const categories = await prisma.category.findMany({
			orderBy: { name: "asc" },
			include: { _count: { select: { nodes: true } } },
		});
		return NextResponse.json(categories);
	} catch (error) {
		log.error("Error fetching categories:", error);
		return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
	}
}

// POST create category
export async function POST(req: NextRequest) {
	try {
		const { name, description } = await req.json();
		if (!name?.trim()) {
			return NextResponse.json({ error: "Name is required" }, { status: 400 });
		}
		const category = await prisma.category.create({
			data: { name: name.trim(), description: description?.trim() || null },
		});
		return NextResponse.json(category, { status: 201 });
	} catch (error: any) {
		if (error?.code === "P2002") {
			return NextResponse.json({ error: "Category name already exists" }, { status: 409 });
		}
		log.error("Error creating category:", error);
		return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
	}
}
