import { PrismaClient } from "@prisma/client";
import * as fs from "fs";

async function run() {
  const prisma = new PrismaClient();
  const analysis = await prisma.rfpAnalysis.findFirst({
    where: { project: { path: ["projectName"], not: null } },
    orderBy: { createdAt: 'desc' }
  });
  console.log("Analysis:", analysis?.id);
}
run().catch(console.error);
