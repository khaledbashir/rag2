import { NextRequest, NextResponse } from "next/server";

// Services
import { sendProposalPdfToEmailService } from "@/services/proposal/server/sendProposalPdfToEmailService";
import { log } from "@/lib/logger";

export async function POST(req: NextRequest) {
    try {
        const emailSent = await sendProposalPdfToEmailService(req);

        if (emailSent) {
            return new NextResponse("Email sent successfully", {
                status: 200,
            });
        } else {
            return new NextResponse("Failed to send email", {
                status: 500,
            });
        }
    } catch (err) {
        log.error("Email service error:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to send email";
        return new NextResponse(errorMessage, { status: 500 });
    }
}
