/**
 * Baltimore Ravens Service Contract template.
 *
 * Source of truth: docs/service-agreements/ravens-service-agreement-source.md
 * (and the verbatim rendering in
 * app/components/templates/proposal-pdf/sections/PdfServiceAgreement.tsx).
 *
 * HARD RULE: every clause is reproduced VERBATIM — wording-for-word, preserving
 * capitalization and all-caps. Do NOT rewrite or paraphrase. Only the
 * party/venue/date/fee-table values are configurable fields (handled by the
 * renderer); fixed clause text lives in the exhibit bodies below.
 */
import type { ServiceContractTemplate } from "../types";
import { SERVICE_CONTRACT_PRESETS } from "../presets";
import { GRAPHICS_PRODUCTION_BODY } from "./exhibits/graphicsProduction";
import { SOFTWARE_EULA_BODY } from "./exhibits/softwareEula";

const GENERAL_TERMS_BODY = `These general terms apply to the work performed by ANC Sports Enterprises, LLC ("ANC") as described in the attached sales proposal (the "Work") and the acceptance of such Work by Purchaser:

1. **Intellectual Property.** As between the parties hereto, each party shall at all times retain all right, title, and interest in and to its intellectual property rights. With regard to ANC's trademarks, whether registered or unregistered, whether owned or licensed by ANC (the "Trademarks"); Purchaser may use the Trademarks only with ANC's express written permission. All such uses shall inure to the benefit of ANC, and Purchaser understands that it has no rights in or to the Trademarks beyond what is expressly granted. Each party expressly waives any and all claims it may now or hereafter have to the other party's intellectual properties.

2. **Ownership of the Work.** Upon receipt of the full Purchase Fee hereunder by ANC, ANC shall transfer to Team good, clear, and marketable title to the Work, free of any and all liens and encumbrances of any kind. Said transfer of ownership shall not affect ownership of the underlying intellectual properties associated with the Work, in accordance with paragraph 1 of the General Terms hereof.

3. **Existence, Power and Authority.** Each of the parties represents and warrants to the other that it is free to enter into and perform fully its obligations under this agreement, that it has full power and authority to grant the rights contained in this agreement, and that there are no restrictions or impediments on its freedom to perform fully its obligations under this agreement.

4. **Confidentiality.** In connection with the transactions contemplated by the Agreement, each party hereto may learn non-public information regarding the business of the other party ("Confidential Information"). The term "Confidential Information" shall include the terms of this Agreement but shall not include information which (i) is or becomes generally available to the public other than as a result of disclosure in violation of the Agreement, or (ii) becomes available on a nonconfidential basis from a source which is not prohibited from disclosing such information by a legal, contractual or fiduciary obligation, or (iii) is known by a party before entering into this Agreement. Each party, its affiliates, employees and agents shall keep secret all Confidential Information. After any termination of this Agreement, all tangible embodiments of Confidential Information of a party in the possession of the other party shall be returned or destroyed upon written request. An officer of the party destroying such embodiments shall so certify upon request.

5. **Warranty.**
    ANC warrants that the material supplied hereunder complies with all applicable standards, will conform to the type and specifications of the Work as ordered by Purchaser and accepted by ANC, is free from any material defects in design or workmanship and that the material supplied hereunder complies with and/or has been produced in accordance with all applicable state and federal laws and regulations of the United States.

    THE PROVISIONS OF THE FOREGOING WARRANTIES ARE IN LIEU OF ANY OTHER WARRANTY, WHETHER EXPRESS OR IMPLIED, WRITTEN OR ORAL (INCLUDING ANY WARRANTY OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE). ANC'S LIABILITY ARISING OUT OF THE MANUFACTURE, SALE, OR SUPPLYING OF THE WORK OR THEIR USE OR DISPOSITION, WHETHER BASED UPON WARRANTY, CONTRACT, TORT OR OTHERWISE, SHALL NOT FOR ANY REASON EXCEED THE ACTUAL PURCHASE PRICE PAID BY PURCHASER FOR THE WORK. IN NO EVENT SHALL ANC BE LIABLE TO PURCHASER OR ANY OTHER PERSON OR ENTITY FOR SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, DAMAGES FOR LOSS OF PROFITS, LOSS OF DATA OR LOSS OF USE) ARISING OUT OF THE MANUFACTURE, SALE, SUPPLY, USE, MARKETING, RESALE OR OPERATION OF THE WORK, EVEN IF ANC HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES OR LOSSES.

6. **Indemnification.**
    ANC shall indemnify and hold harmless the Purchaser and its members, directors, officers, shareholders, employees, affiliates and agents from and against any and all loss, liability, costs, damages, and expenses, including reasonable attorneys' fees, which Purchaser may incur by reason of any action, claim, or proceeding arising out of any material breach of representations, warranties, or obligations hereunder.

    The Purchaser shall indemnify and hold harmless ANC, its members, directors, officers, shareholders, employees, affiliates, and agents from and against any and all loss, liability, costs, damages, and expenses, including reasonable attorneys' fees, arising out of or in connection with:
    - any injury to third parties or third party property, except for injuries resulting from ANC's gross negligence or intentional misconduct.
    - Purchaser's instructions, directions or directives, whether oral or in writing, to ANC's staff and employees in connection with the Work.

7. **Purchaser's Obligation to Pay.** If Purchaser has any approval rights, it is Purchaser's responsibility to obtain ANC's written consent to such limitations on the front of this document. The obligation of the Purchaser to pay for the Work, as outlined herein, is absolute and unconditional and not subject to set off or rebate. The provisions of Sections 4 and 5 of these General Terms shall survive any termination, in whole or in part, of the Agreement.

8. **Force Majeure.**
    "Events of Force Majeure" shall be defined as follows: any act, event, or circumstance, beyond the reasonable control of either party and unavoidable despite the exercise of reasonable diligence, that renders performance of any obligation of this agreement impossible, or so substantially increases the costs of compliance such that the value of this agreement is materially diminished or its purpose materially frustrated beyond the reasonable contemplation of either party as of the Effective Date; including, without limitation, the following actual or threatened events and their attendant consequences, so long as otherwise satisfying the foregoing definition: strikes, labor unrest, terrorism, civil disturbance or riots, military actions or movements, fires, acts of God, natural disasters, wars, pandemic, epidemic, viral outbreak, public health crisis, disease, quarantine restrictions, stay-at-home or shelter-in-place or equivalent orders, government restrictions on travel, movement, or public gatherings, public health government restrictions, acts of government or any federal, state, local, public or administrative authority, unavailability or obsolescence of parts, or materials, electrical, internet, wireless or computer network, server or telecommunications outages.

    Neither party shall be liable to the other for either (a) any delay in performing or failure to perform under the Agreement relating to or arising out of Events of Force Majeure; or (b) inoperability or breakdown of equipment or facilities relating to or arising out of Events of Force Majeure, other than the obligation to make money payments for work that was approved and delivered prior to the Event of Force Majeure.

    If either party is rendered unable, wholly or in part, by Event of Force Majeure to perform any of its obligations under this Agreement, such party will give the other party prompt written notice of the Event of Force Majeure with reasonably full particulars concerning it and the reasons for nonperformance. Thereupon, the obligations of the party giving notice will be suspended for only so long as the Event of Force Majeure continues. The affected party will use all possible diligence to remove the Event of Force Majeure as quickly as possible.

9. **Future Pandemic.** In addition to any rights either party may have under Section 8 relating to Events of Force Majeure, the parties acknowledge that amidst the duration of any pandemic similar to the extent of the Covid-19 pandemic (each a "Future Pandemic") and thereafter for some undefined period of time, there may be consequences of the Pandemic or adverse market conditions (whether or not sudden or unpredictable) that could render either party's performance hereunder difficult or impracticable or that could substantially increase the costs of compliance such that the value of this agreement is materially diminished or its purpose materially frustrated beyond the reasonable contemplation of either party as of the Effective Date. Accordingly, ANC shall not be responsible for any additional compensation hereunder or lost revenues or profits, damages, costs or overhead incurred by relating to or arising out of (i) shutdowns, postponements, or cancellations relating to or arising out of the Pandemic; or (ii) employee unavailability or staffing shortages relating to or as a consequence of Pandemic, whether due to illness, travel restrictions or Events of Force Majeure. Notwithstanding the foregoing, the lease fee payments obligations hereunder shall continue unabated throughout the Pandemic and regardless of its consequences.

10. **Miscellaneous.**
    - **Assignment.** ANC may assign the Agreement at any time without the prior written consent of Purchaser.
    - **Independent Contractors.** The Agreement is made between independent contracting parties and does not constitute a partnership or joint venture between the parties.
    - **Taxes.** The Purchaser is responsible for the payment of any and all sales or use taxes or similar taxes applicable to the LED System or the advertising displayed on the LED System should such taxes be or become due in any taxing jurisdiction as a result of legislation or any audit or such similar determination.
    - **Entire Agreement.** The Agreement embodies the entire agreement between the parties with respect to the subject matter hereof and may only be changed by a written instrument signed by both parties. No representation, warranty, undertaking or agreement is made by either party except as contained herein, and any representations, warranties, undertakings or agreements not set forth herein are specifically disclaimed.
    - **Headings.** The headings of the sections and subsections of the Agreement have been inserted for convenience and shall not modify, define, limit or expand the express provisions of the Agreement.
    - **Governing Law.** The Agreement shall be governed by and construed in accordance with the laws of the State of New York.`;

const PARTS_BODY = `ANC has three reporting procedures for our clients operating the company's signage systems which ensure ANC's equipment is operating to its fullest potential at all venues. These procedures ensure that ANC is immediately informed of any issues related to the company's systems and will enable timely technical support, onsite service, and repair or replacement of components.

**Toll-Free Hotline**

Clients with service requests, in-game issues or other concerns should please call the toll free TechOps Support Hotline at (888) 875-2125. The hotline is staffed around-the-clock by senior technical support specialists with over 50 years of combined experience, demonstrating our commitment to provide all the resources necessary to feature premier in-game signage content during all events.

**Parts Repair/Replacement**

ANC has a company-wide parts repair/replacement policy in place for all LED, DLP®, Rotational and Hardware Server parts. If your venue is experiencing a part malfunction, send an email to parts@anc.com.

The e-mail should include the following:

- Part make (Mitsubishi, LSI SACO, Lighthouse, etc.)
- Each part model/name
- Each part number and/or serial number
- Where the bad part came from (i.e. 360 fascia, center-hung, dasher, courtside, home plate, base line, Master Server, etc.)
- Description of the problem with the part

Once ANC receives this information, we will provide you with documentation and step-by-step shipping instructions regarding where to send the bad part(s) for repair/replacement or to set up an onsite visit. If you have any questions concerning if the part is actually faulty, please call ANC's Toll-Free Hotline`;

// Signature block: sign-here preamble + "AGREED TO AND ACCEPTED" heading + the
// fixed ANC party block. The Purchaser side and the BY/TITLE/DATE lines for
// both parties are rendered structurally by PdfServiceContract. Wording per
// Natalia 2026-07-27 (49ers review): identical to the ANC purchase-order sign
// block except "the Services" replaces "the Display System".
const SIGNATURE_BLOCK_TEXT = `Please sign to indicate Purchaser's agreement to purchase the Services as described herein and to authorize ANC to commence production.

If, for any reason, Purchaser terminates this Agreement prior to the completion of the work, ANC will immediately cease all work and Purchaser will pay ANC for any work performed, work in progress, and materials purchased, if any. This document will be considered binding on both parties; however, it will be followed by a formal agreement containing standard contract language, including terms of liability, indemnification, and warranty. Payment is due within thirty (30) days of ANC's invoice(s).

AGREED TO AND ACCEPTED:

ANC Sports Enterprises, LLC ("ANC")
2 Manhattanville Road, Suite 402
Purchase, NY 10577`;

export const RAVENS_TEMPLATE: ServiceContractTemplate = {
  id: "ravens",
  name: "Baltimore Ravens Service",
  sourceDoc: "docs/service-agreements/ravens-service-agreement-source.md",
  exhibits: [
    {
      id: "general-terms",
      exhibitLetter: "",
      title: "General Terms",
      bodyMarkdown: GENERAL_TERMS_BODY,
      defaultOn: true,
      category: "general",
    },
    {
      id: "exhibit-a-stub",
      exhibitLetter: "A",
      title: "Exhibit A",
      bodyMarkdown: "",
      defaultOn: true,
      category: "optional",
    },
    {
      id: "exhibit-b-stub",
      exhibitLetter: "B",
      title: "Exhibit B",
      bodyMarkdown: "",
      defaultOn: true,
      category: "optional",
    },
    {
      id: "parts",
      exhibitLetter: "C",
      title: "Parts Replacement Procedures",
      bodyMarkdown: PARTS_BODY,
      defaultOn: true,
      category: "optional",
    },
    {
      id: "live-sync",
      exhibitLetter: "",
      title: "Live Sync",
      bodyMarkdown: "",
      defaultOn: false,
      category: "optional",
    },
    {
      id: "software",
      exhibitLetter: "",
      title: "Software End User License Agreement",
      bodyMarkdown: SOFTWARE_EULA_BODY,
      defaultOn: false,
      category: "optional",
    },
    {
      id: "labor",
      exhibitLetter: "",
      title: "Labor",
      bodyMarkdown: "",
      defaultOn: false,
      category: "optional",
    },
    {
      id: "graphics",
      exhibitLetter: "",
      title: "Graphics Production",
      bodyMarkdown: GRAPHICS_PRODUCTION_BODY,
      defaultOn: false,
      category: "optional",
    },
  ],
  signatureBlockText: SIGNATURE_BLOCK_TEXT,
  projectTypePresets: SERVICE_CONTRACT_PRESETS,
};