import { generateScopingWorkbook } from "./services/rfp/pipeline/generateScopingWorkbook";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import { getScopingOptionsForEstimator } from "./app/api/estimator/export-unified/route";

async function run() {
  const prisma = new PrismaClient();
  const proposal = await prisma.proposal.findFirst({
    where: { source: "budget_estimator" },
    include: {
      financialOverrides: true,
      budgetEstimatorSettings: true,
      screenConfigs: true
    }
  });
  if (!proposal) {
    console.error("No proposal found");
    return;
  }
  
  // Actually, let's just use the mapper function
  const { estimatorToScopingMapper } = await import("./services/rfp/pipeline/estimatorToScopingMapper");
  const options = await estimatorToScopingMapper(proposal.id);
  const { buffer } = await generateScopingWorkbook(options);
  fs.writeFileSync("test-estimator.xlsx", buffer);
  console.log("Wrote test-estimator.xlsx");
}

run().catch(console.error);
