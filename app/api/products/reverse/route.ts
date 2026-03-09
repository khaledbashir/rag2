import { NextRequest, NextResponse } from "next/server";
import { reverseEngineer, ReverseQuery } from "@/services/catalog/reverseEngineer";
import { log } from "@/lib/logger";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const { targetBudget, widthFt, heightFt } = body;

        if (!targetBudget || targetBudget <= 0) {
            return NextResponse.json(
                { error: "targetBudget must be a positive number" },
                { status: 400 }
            );
        }
        if (!widthFt || widthFt <= 0) {
            return NextResponse.json(
                { error: "widthFt must be a positive number" },
                { status: 400 }
            );
        }
        if (!heightFt || heightFt <= 0) {
            return NextResponse.json(
                { error: "heightFt must be a positive number" },
                { status: 400 }
            );
        }

        const query: ReverseQuery = {
            targetBudget: Number(targetBudget),
            widthFt: Number(widthFt),
            heightFt: Number(heightFt),
            isIndoor: body.isIndoor !== false,
            marginPercent: body.marginPercent ? Number(body.marginPercent) : undefined,
            includeBondTax: body.includeBondTax,
            bondRate: body.bondRate ? Number(body.bondRate) : undefined,
            salesTaxRate: body.salesTaxRate ? Number(body.salesTaxRate) : undefined,
        };

        const options = await reverseEngineer(query);

        return NextResponse.json({ options, query });
    } catch (error) {
        log.error("[products/reverse] POST error:", error);
        return NextResponse.json(
            { error: "Failed to run reverse engineer query" },
            { status: 500 }
        );
    }
}
