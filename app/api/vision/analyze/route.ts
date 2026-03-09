import { NextRequest, NextResponse } from 'next/server';
import { DrawingService } from '@/services/vision/drawing-service';
import { log } from "@/lib/logger";

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        // Convert File to Base64
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64Image = `data:${file.type};base64,${buffer.toString('base64')}`;

        // Initialize Service (automatically loads env vars)
        const service = new DrawingService();
        
        // Process
        log.info("Processing image with Z AI...");
        const results = await service.processDrawingPage(base64Image);

        return NextResponse.json({ success: true, results });

    } catch (error: any) {
        log.error("Vision API Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" }, 
            { status: 500 }
        );
    }
}
