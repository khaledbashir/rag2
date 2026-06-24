/**
 * ANC Master Responsibility Matrix (2026)
 *
 * Source of truth: Natalia's "Responsibility Matrix (2026).xlsx" (Resp Matrix (2026) sheet).
 * This is the platform DEFAULT matrix baked into every proposal — no Excel upload or
 * wizard Q&A required. When an uploaded workbook contains its own Resp Matrix sheet,
 * the parsed one wins; otherwise this master fills in automatically.
 *
 * Two editor-only notes ("JACKSON DO WE NEED THIS LINE?") were stripped from the
 * client-facing text. Confirm those two lines with Natalia before final sign-off.
 */

import type { RespMatrix } from "@/types/pricing";

export const MASTER_RESP_MATRIX_VERSION = "2026.1";

export const ANC_MASTER_RESP_MATRIX: RespMatrix = {
  projectName: "",
  date: "",
  format: "long",
  categories: [
    {
      name: "Administrative",
      items: [
        { description: "Provide accurate architectural, structural engineering, and electrical drawings and documentation reflecting existing conditions. Where existing information is incomplete, outdated, or unavailable, perform exploratory surveys, field investigations, and verification activities as necessary to confirm actual site conditions.", anc: "", purchaser: "X" },
        { description: "Provide Payment and Performance Bond.", anc: "", purchaser: "X" },
        { description: "All required permits shall be obtained and provided. All permit‑associated fees and costs shall be reimbursed at actual cost, plus a markup of ten percent (10%).", anc: "", purchaser: "X" },
      ],
    },
    {
      name: "Engineering & Submittals",
      items: [
        { description: "Customer is responsible to ensure the existing site is adequate, including, but not limited to, providing soil reports and calculations, structural reports or existing primary steel displays to which diplays are expected to be mounted, site plans, and other information, documentation, or enabling of exploratory work asmay be required for ANC’s Engineer to adequately design the display structure (adverse install conditions will result in additional cost).", anc: "", purchaser: "X" },
        { description: "Prepare and provide all required drawings identifying locations and installation requirements for all new equipment.", anc: "X", purchaser: "" },
        { description: "Engineering and certification for equipment attachment design for new displays.", anc: "X", purchaser: "" },
        { description: "Approval of all artwork and submittals provided by the ANC Projects Team.", anc: "", purchaser: "X" },
        { description: "All engineering and certifications shall be performed and issued by a licensed professional engineer, as required by the authority having jurisdiction.", anc: "X", purchaser: "" },
      ],
    },
    {
      name: "Physical Installation",
      items: [
        { description: "Provide all labor, equipment, and services necessary for the removal and disposal of existing equipment and structural components, as required.", anc: "X", purchaser: "" },
        { description: "Fabricate, deliver, and install support structure and appropriate backing for all displays, including hardware, shims and miscellaneous materials as required.", anc: "X", purchaser: "" },
        { description: "Provide & Install LED components.", anc: "X", purchaser: "" },
        { description: "Provide floor and site protection as required.", anc: "", purchaser: "X" },
        { description: "Installation of all signage and aesthetics as approved.", anc: "", purchaser: "X" },
        { description: "Heavy equipment (including cranes, lifts, forklifts, and related machinery).", anc: "X", purchaser: "" },
        { description: "Receive, unload, and inspect all new equipment upon delivery.", anc: "X", purchaser: "" },
        { description: "Provide safe storage of video equipment and control equipment in a safe, dry and secure location until installation.", anc: "", purchaser: "X" },
        { description: "Uninterrupted, unobstructed access to all equipment and the control room for the Contractor and its subcontractors throughout installation and commissioning, until the equipment is one hundred percent (100%) operational.", anc: "", purchaser: "X" },
        { description: "Post installation site clean-up.", anc: "X", purchaser: "" },
      ],
    },
    {
      name: "Electrical & Data Installation",
      items: [
        { description: "Provide and install primary power feed at the display location with sufficient amps for ANC proposed display(s); typically 208v 3-phase.", anc: "", purchaser: "X" },
        { description: "Provide and install secondary electrical panels, breakers, and branch circuits for ANC provided equipment (excludes remote on/off).", anc: "X", purchaser: "" },
        { description: "Provide and install of all secondary conduit and low voltage cabling from owner provided demarcation point to all LED displays.", anc: "X", purchaser: "" },
        { description: "Provide and install data cables from LED processors location to LED display.", anc: "X", purchaser: "" },
        { description: "Provide and install signal cable conduit with pull string from the control location to all equipment locations and data termination points, in accordance with the electrical and data drawings.", anc: "", purchaser: "X" },
        { description: "Terminate all fiber and data cable per electrical and data drawings.", anc: "X", purchaser: "" },
        { description: "Mount and install data patch panel in control location and display location, if required.", anc: "X", purchaser: "" },
        { description: "Provide high speed internet connection to control room equipment.", anc: "", purchaser: "X" },
        { description: "Power outlets with dedicated circuit(s) for all control equipment required per electrical engineering within control room location.", anc: "", purchaser: "X" },
      ],
    },
    {
      name: "Processing and Control Systems",
      items: [
        { description: "Provide climate controlled control room for all control equipment and processing. Normal operating temperature should be between 65 and 75 degrees Fahrenheit. Normal operating humidity should be less than 80 percent non condensing.", anc: "", purchaser: "X" },
        { description: "Supply static IP address five (5) days prior to installation.", anc: "", purchaser: "X" },
        { description: "Provide and install data cable conduit, with pull string, from production control location to display for LiveSync control, should remote location be desired.", anc: "", purchaser: "X" },
        { description: "Labor to pull data cable for Content Management System.", anc: "X", purchaser: "" },
        { description: "Third party application and license fees as required by the customer, i.e. RSS Feeds, etc.", anc: "", purchaser: "X" },
        { description: "Provide computer(s) for control software.", anc: "X", purchaser: "" },
        { description: "Perform final systems testing and commissioning.", anc: "X", purchaser: "" },
      ],
    },
    {
      name: "Training",
      items: [
        { description: "Provide list of personnel for training five (5) days in advance.", anc: "", purchaser: "X" },
        { description: "Provide sign off list for all training to be distributed to all parties upon completion.", anc: "X", purchaser: "" },
        { description: "Perform one (1) day of maintenance training.", anc: "X", purchaser: "" },
        { description: "Perform two (2) days of control system operation.", anc: "", purchaser: "X" },
      ],
    },
    {
      name: "Project Specific Notes",
      items: [
        { description: "ANC has provided a three (3) year warranty on all LED parts and parts repair. Parts Repair shall mean the repair, refurbishment, or replacement of defective LED parts or components, including associated subcomponents, necessary to restore the LED equipment to proper working condition.", anc: "X", purchaser: "" },
        { description: "ANC has provided a one (1) year on-site labor during the warranty period as part of this proposal.  ANC will train facility staff to perform basic troubleshooting and simple component replacement.  ANC will deploy an authorized service technician to perform all escalated service needs at and invoice for costs incurred.", anc: "X", purchaser: "" },
        { description: "ANC has provided studio graphic creation hours as part of this proposal.", anc: "X", purchaser: "" },
        { description: "ANC has included a video scaler as part of the control system package.  This would be required for any event utilizing live camera shoots.", anc: "X", purchaser: "" },
        { description: "ANC has included installation pricing with Union labor rates.", anc: "X", purchaser: "" },
        { description: "ANC has included applicable bonds.", anc: "X", purchaser: "" },
        { description: "ANC has excluded all taxes and tariffs from the pricing in the enclosed proposal.", anc: "X", purchaser: "" },
        { description: "Ocean freight shipping is included in the quote based on current market rates. Shipping costs may change due to global impacts, including pandemics, geopolitical events, supply‑chain disruptions, port congestion, labor shortages, and fuel cost fluctuations. Any resulting increase in freight costs shall be borne by the Purchaser.  Estimated transit times are approximately six (6) weeks for ocean freight and two (2) weeks for air freight.", anc: "X", purchaser: "" },
      ],
    },
  ],
};

/** Deep clone so callers can mutate without touching the frozen master. */
export function getMasterRespMatrix(): RespMatrix {
  return JSON.parse(JSON.stringify(ANC_MASTER_RESP_MATRIX)) as RespMatrix;
}
