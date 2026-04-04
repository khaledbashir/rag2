import { PrismaClient } from "@prisma/client";

async function run() {
  const prisma = new PrismaClient();
  const analysis = await prisma.rfpAnalysis.findMany({
    orderBy: { createdAt: 'desc' },
    take: 1
  });
  console.log("Analysis:", analysis[0]?.id);
}
run().catch(console.error);
