import { generateScopingWorkbook } from "./services/rfp/pipeline/generateScopingWorkbook";
import * as fs from "fs";

async function run() {
  const options = {
    project: {
      id: "proj1",
      name: "Test Project",
      client: "Test Client",
      currency: "USD",
      deadline: "2026-12-31"
    },
    specs: [
      {
        id: "d1",
        name: "Test Screen",
        environment: "indoor",
        pixelPitchMm: 2.5,
        heightPx: 1219,
        widthPx: 2438,
        quantity: 1
      }
    ],
    pricedDisplays: [
      {
        specId: "d1",
        ledHardwareCost: 50000,
        sparePartsCost: 5000,
        sendingCardCost: 2000,
        signalCableCost: 1000,
        upsCost: 1000,
        backupProcessorCost: 1000,
        weatherproofCost: 1000,
        shippingCost: 5000,
        installCost: 20000,
      }
    ],
    overrides: {}
  };
  
  const { buffer } = await generateScopingWorkbook(options as any);
  fs.writeFileSync("test.xlsx", buffer);
  console.log("Wrote test.xlsx");
}

run().catch(console.error);
