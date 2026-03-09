import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

// PUT update category
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;
		const { name, description } = await req.json();
		if (!name?.trim()) {
			return NextResponse.json({ error: "Name is required" }, { status: 400 });
		}
		const category = await prisma.category.update({
			where: { id },
			data: { name: name.trim(), description: description?.trim() || null },
		});
		return NextResponse.json(category);
	} catch (error: any) {
		if (error?.code === "P2025") {
			return NextResponse.json({ error: "Category not found" }, { status: 404 });
		}
		if (error?.code === "P2002") {
			return NextResponse.json({ error: "Category name already exists" }, { status: 409 });
		}
		log.error("Error updating category:", error);
		return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
	}
}

// DELETE category (cascades to nodes → options → formulas)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;
		await prisma.category.delete({ where: { id } });
		return NextResponse.json({ ok: true });
	} catch (error: any) {
		if (error?.code === "P2025") {
			return NextResponse.json({ error: "Category not found" }, { status: 404 });
		}
		log.error("Error deleting category:", error);
		return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
	}
}
