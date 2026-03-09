/**
 * API Route: GET /api/pricing-logic/tree
 * Returns the full decision tree for a category as JSON
 * Query params: categoryId (required)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const categoryId = searchParams.get("categoryId");

    if (!categoryId) {
      return NextResponse.json(
        { error: "categoryId query parameter is required" },
        { status: 400 }
      );
    }

    // Fetch category with nested tree structure
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        nodes: {
          orderBy: { order: "asc" },
          include: {
            options: {
              include: {
                formula: true,
              },
            },
          },
        },
      },
    });

    if (!category) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    // Convert to tree structure (nodes are already ordered by their order field)
    const tree = {
      category: {
        id: category.id,
        name: category.name,
        description: category.description,
      },
      nodes: category.nodes.map((node) => ({
        id: node.id,
        categoryId: node.categoryId,
        parentNodeId: node.parentNodeId,
        question: node.question,
        order: node.order,
        options: node.options.map((option) => ({
          id: option.id,
          optionText: option.optionText,
          nextNodeId: option.nextNodeId,
          isFinal: option.isFinal,
          formula: option.formula
            ? {
                id: option.formula.id,
                formula: option.formula.formula,
                unit: option.formula.unit,
                notes: option.formula.notes,
              }
            : null,
        })),
      })),
    };

    return NextResponse.json(tree);
  } catch (error) {
    log.error("Error fetching pricing logic tree:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}