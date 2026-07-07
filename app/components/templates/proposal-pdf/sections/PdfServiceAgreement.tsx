/**
 * PdfServiceAgreement — ANC Service Contract Agreement document.
 *
 * Reproduced VERBATIM from ANC's "Baltimore Ravens Service DRAFT 07.01.26" (Natalia
 * ask 2026-07-06). HARD RULE (Natalia + Ahmad): build EXACTLY as-is, wording-for-word.
 * Do NOT AI/rewrite/paraphrase ANY clause. Only the party/venue/date/fee-table values
 * are configurable fields; every fixed clause is the source document's exact language.
 * Source of truth: docs/service-agreements/ravens-service-agreement-source.md
 *
 * Styled to match the other proposal-pdf legal sections (blue-bar headers, plain text).
 */

import React from "react";

import type { PdfColors } from "./shared";

export interface ServiceAgreementFeeRow {
    /** Contract year label, e.g. "2026–2027" */
    contractYear: string;
    /** Monthly service fee, e.g. "$45,000.00" */
    monthlyFee: string;
}

export interface ServiceAgreementConfig {
    /** Agreement date, e.g. "June 30, 2026" */
    agreementDate: string;
    /** Purchaser entity, e.g. "Baltimore Ravens Limited Partnership" */
    purchaserName: string;
    /** Purchaser address line, e.g. "1101 Russell Street, Baltimore, MD 21230" */
    purchaserAddress: string;
    /** Venue, e.g. "M&T Bank Stadium" */
    venueName: string;
    /** Term start, e.g. "July 15, 2026" */
    termStart: string;
    /** Term end, e.g. "December 31, 2030" */
    termEnd: string;
    /** First-installment due date, e.g. "August 1st" */
    firstInstallmentDue: string;
    /** Final-installment due date, e.g. "January 1, 2030" */
    finalInstallmentDue: string;
    /** Sales-tax jurisdiction, e.g. "Maryland" */
    taxJurisdiction: string;
    /** Governing-law state, e.g. "New York" */
    governingLawState: string;
    /** Compensation fee schedule rows */
    feeRows: ServiceAgreementFeeRow[];
}

/** Default config = the Baltimore Ravens M&T Bank Stadium source values. */
export const RAVENS_SERVICE_AGREEMENT_DEFAULTS: ServiceAgreementConfig = {
    agreementDate: "June 30, 2026",
    purchaserName: "Baltimore Ravens Limited Partnership",
    purchaserAddress: "1101 Russell Street, Baltimore, MD 21230",
    venueName: "M&T Bank Stadium",
    termStart: "July 15, 2026",
    termEnd: "December 31, 2030",
    firstInstallmentDue: "August 1st",
    finalInstallmentDue: "January 1, 2030",
    taxJurisdiction: "Maryland",
    governingLawState: "New York",
    feeRows: [
        { contractYear: "2026–2027", monthlyFee: "$45,000.00" },
        { contractYear: "2027–2028", monthlyFee: "$51,439.33" },
        { contractYear: "2028–2029", monthlyFee: "$59,015.17" },
        { contractYear: "2029–2030", monthlyFee: "$59,394.00" },
    ],
};

interface PdfServiceAgreementProps {
    colors: PdfColors;
    config?: Partial<ServiceAgreementConfig>;
}

export default function PdfServiceAgreement({ colors, config }: PdfServiceAgreementProps) {
    const c: ServiceAgreementConfig = { ...RAVENS_SERVICE_AGREEMENT_DEFAULTS, ...config };

    const Header = ({ children }: { children: React.ReactNode }) => (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", margin: "14px 0 8px" }}>
            <div style={{ width: "3px", height: "14px", borderRadius: "1px", background: colors.primary, flexShrink: 0 }} />
            <span className="text-[14px] font-bold uppercase tracking-wider" style={{ color: colors.primaryDark }}>
                {children}
            </span>
        </div>
    );

    return (
        <div data-preview-section="service-agreement" className="px-6 text-[12px] leading-relaxed" style={{ color: colors.text }}>
            <div className="text-[16px] font-bold" style={{ color: colors.primaryDark, marginBottom: "10px" }}>
                {c.venueName} Service Contract
            </div>

            <p className="mb-3">
                AGREEMENT (&ldquo;Agreement&rdquo;) dated {c.agreementDate} between ANC SPORTS ENTERPRISES, LLC, a Delaware
                limited liability company located at 2 Manhattanville Road, Purchase, NY 10577 (&ldquo;ANC&rdquo;) and {c.purchaserName} with
                office at {c.purchaserAddress}.
            </p>
            <p className="mb-3">
                WHEREAS, ANC has expertise in the maintenance of video-based light-emitting diode (&ldquo;LED&rdquo;) modules (the &ldquo;LED Modules&rdquo;).
            </p>
            <p className="mb-3">
                WHEREAS, Purchaser plays in the sports and entertainment facility currently known as {c.venueName} (the &ldquo;Stadium&rdquo;),
                in which LED Modules and the necessary hardware, software, equipment and connections required to operate the Stadium
                LED Modules (collectively, the &ldquo;LED System&rdquo;) have been installed for use at NFL Games and other events; and which
                Purchaser wishes to have ANC maintain such LED System;
            </p>
            <p className="mb-3">NOW, THEREFORE, the parties hereto hereby agree as follows:</p>

            <Header>ANC&rsquo;s Responsibilities</Header>
            <p className="mb-2">
                WHEREAS, ANC has expertise in the maintenance of video-based light-emitting diode (&ldquo;LED&rdquo;) modules (the &ldquo;LED Modules&rdquo;); and
            </p>
            <p className="mb-2">
                WHEREAS, Purchaser operates the sports and entertainment facility currently known as {c.venueName} (the &quot;Stadium&quot;),
                in which LED Modules and the necessary hardware, parts, equipment and connections required to service and maintain the
                Stadium&rsquo;s LED Modules (collectively, the &ldquo;LED System&rdquo;) are provided by the Purchaser for their use in NFL games,
                and additional events at the Stadium, and Purchaser wishes to have ANC service and maintain such LED System.
            </p>
            <ul className="list-disc pl-5 space-y-1 mb-3">
                <li>ANC shall provide Maintenance Staff as defined in Exhibit A &ndash; Service Overview.</li>
                <li>ANC shall provide service as defined in Exhibit A for Display List as defined in Exhibit B</li>
                <li>ANC will also provide a trained and capable representative or representatives to work with Purchaser throughout the Term to service and maintain the LED System for the duration of the term.</li>
                <li>ANC will provide 24/7 365 tech support at no additional cost to assist with any hardware issues that occur.</li>
            </ul>

            <Header>Purchaser&rsquo;s Responsibilities</Header>
            <ul className="list-disc pl-5 space-y-1 mb-3">
                <li>Purchaser shall supply, at its expense, the electricity required for the operation of the LED System.</li>
                <li>Purchaser will provide at its cost the raw unencoded data feed from any sports information service for display on the LED Modules.</li>
                <li>Purchaser shall provide at no cost to ANC or its technicians full access credentials and complimentary parking at The Stadium parking lot (as needed) for each NFL Game for the purposes of carrying out ANC&rsquo;s obligations hereunder. Such ANC personnel shall comply with all applicable Stadium rules and regulations in connection with their activities hereunder. The Purchaser shall use best efforts to ensure that ANC&rsquo;s technicians have easy physical access to the LED Modules. If lifts, cranes or other equipment are required to access any portion of the ANC LED displays, the Purchaser will be responsible for providing.</li>
            </ul>

            <Header>Term</Header>
            <p className="mb-3">The term or this agreement (&ldquo;Term&rdquo;) shall begin on {c.termStart}, and end on {c.termEnd}</p>

            <Header>Compensation</Header>
            <p className="mb-2">
                As compensation for the services described in Section 1, the Company shall pay ANC an annual service fee as follows:
            </p>
            <p className="mb-2">
                Payment Schedule. The annual service fee for each Contract Year shall be payable in six (6) equal monthly installments.
                The first installment shall be due on {c.firstInstallmentDue} of the applicable Contract Year, with subsequent installments
                due on the first (1st) day of each month thereafter, and the final installment due on {c.finalInstallmentDue}.
            </p>
            <table style={{ borderCollapse: "collapse", fontSize: "11px", margin: "6px 0 12px" }}>
                <thead>
                    <tr><th style={{ textAlign: "left", padding: "3px 18px 3px 0", fontWeight: 700 }}>Contract Year</th><th style={{ textAlign: "left", padding: "3px 0", fontWeight: 700 }}>Monthly Service Fee</th></tr>
                </thead>
                <tbody>
                    {c.feeRows.map((r) => (
                        <tr key={r.contractYear}><td style={{ padding: "2px 18px 2px 0" }}>{r.contractYear}</td><td style={{ padding: "2px 0" }}>{r.monthlyFee}</td></tr>
                    ))}
                </tbody>
            </table>
            <p className="mb-2">
                The fees described herein do not include any {c.taxJurisdiction} sales or use tax that may be due. ANC shall determine
                whether any such tax is payable on the fees, and, if such tax is due, ANC will bill Company for such tax and will be
                responsible for remitting the tax, as paid by Company, to the appropriate taxing authorities.
            </p>
            <p className="mb-3">
                Time is of the essence with regard to all payments. If Company is thirty (30) days late in any non-disputed payment due
                hereunder, ANC shall 1) provide written notice of such delinquency to Company in accordance with paragraph 7(a) of the
                General Terms. Provided that ANC has fully complied with its obligations hereunder as of the date of written notice, ANC
                will have the right to terminate this Agreement immediately upon written notice to Company if Company has not cured such
                payment default within thirty (30) days after Company&rsquo;s receipt of such delinquency notice.
            </p>
            <p className="mb-3">
                Please sign to indicate Purchaser&rsquo;s agreement to purchase the Work as described herein and to authorize ANC to commence
                production of the Work. If, for any reason, Purchaser terminates this Agreement prior to the completion of the Work, ANC
                will immediately cease all work and Purchaser will pay ANC for any work performed, work in progress, and materials
                purchased, if any. Tax is not included. Applicable sales tax will be included in ANC&rsquo;s invoice. Payment is due within
                thirty (30) days of ANC&rsquo;s invoice(s).
            </p>
            <p className="mb-3 uppercase text-[11px]">
                Unless otherwise noted in the following space, all terms and conditions on the general terms of this order are fully
                accepted by purchaser.
            </p>
            <div className="font-bold" style={{ color: colors.primaryDark, margin: "10px 0 6px" }}>AGREED TO AND ACCEPTED:</div>
            <div style={{ display: "flex", gap: "48px", marginBottom: "16px" }}>
                <div>
                    <div>ANC SPORTS ENTERPRISES, LLC (&ldquo;ANC&rdquo;)</div>
                    <div>2 Manhattanville Road, Suite 402</div>
                    <div>Purchase, NY 10577</div>
                    <div style={{ marginTop: "18px" }}>By: ____________________</div>
                    <div style={{ marginTop: "10px" }}>Date: __________________</div>
                </div>
                <div>
                    <div>{c.purchaserName} (&ldquo;Purchaser&rdquo;)</div>
                    <div>{c.purchaserAddress}</div>
                    <div style={{ marginTop: "18px" }}>By: ____________________</div>
                    <div style={{ marginTop: "10px" }}>Date: __________________</div>
                </div>
            </div>

            <Header>General Terms</Header>
            <p className="mb-2">
                These general terms apply to the work performed by ANC Sports Enterprises, LLC (&ldquo;ANC&rdquo;) as described in the attached
                sales proposal (the &ldquo;Work&rdquo;) and the acceptance of such Work by Purchaser:
            </p>
            <ol className="list-decimal pl-5 space-y-2">
                <li><span className="font-bold">Intellectual Property.</span> As between the parties hereto, each party shall at all times retain all right, title, and interest in and to its intellectual property rights. With regard to ANC&apos;s trademarks, whether registered or unregistered, whether owned or licensed by ANC (the &ldquo;Trademarks&rdquo;); Purchaser may use the Trademarks only with ANC&rsquo;s express written permission. All such uses shall inure to the benefit of ANC, and Purchaser understands that it has no rights in or to the Trademarks beyond what is expressly granted. Each party expressly waives any and all claims it may now or hereafter have to the other party&rsquo;s intellectual properties.</li>
                <li><span className="font-bold">Ownership of the Work.</span> Upon receipt of the full Purchase Fee hereunder by ANC, ANC shall transfer to Team good, clear, and marketable title to the Work, free of any and all liens and encumbrances of any kind. Said transfer of ownership shall not affect ownership of the underlying intellectual properties associated with the Work, in accordance with paragraph 1 of the General Terms hereof.</li>
                <li><span className="font-bold">Existence, Power and Authority.</span> Each of the parties represents and warrants to the other that it is free to enter into and perform fully its obligations under this agreement, that it has full power and authority to grant the rights contained in this agreement, and that there are no restrictions or impediments on its freedom to perform fully its obligations under this agreement.</li>
                <li><span className="font-bold">Confidentiality.</span> In connection with the transactions contemplated by the Agreement, each party hereto may learn non-public information regarding the business of the other party (&quot;Confidential Information&quot;). The term &quot;Confidential Information&quot; shall include the terms of this Agreement but shall not include information which (i) is or becomes generally available to the public other than as a result of disclosure in violation of the Agreement, or (ii) becomes available on a nonconfidential basis from a source which is not prohibited from disclosing such information by a legal, contractual or fiduciary obligation, or (iii) is known by a party before entering into this Agreement. Each party, its affiliates, employees and agents shall keep secret all Confidential Information. After any termination of this Agreement, all tangible embodiments of Confidential Information of a party in the possession of the other party shall be returned or destroyed upon written request. An officer of the party destroying such embodiments shall so certify upon request.</li>
                <li>
                    <span className="font-bold">Warranty.</span>
                    <p className="mt-1 mb-1">ANC warrants that the material supplied hereunder complies with all applicable standards, will conform to the type and specifications of the Work as ordered by Purchaser and accepted by ANC, is free from any material defects in design or workmanship and that the material supplied hereunder complies with and/or has been produced in accordance with all applicable state and federal laws and regulations of the United States.</p>
                    <p className="uppercase text-[11px]">The provisions of the foregoing warranties are in lieu of any other warranty, whether express or implied, written or oral (including any warranty of merchantability or fitness for a particular purpose). ANC&rsquo;s liability arising out of the manufacture, sale, or supplying of the Work or their use or disposition, whether based upon warranty, contract, tort or otherwise, shall not for any reason exceed the actual purchase price paid by Purchaser for the Work. In no event shall ANC be liable to Purchaser or any other person or entity for special, incidental or consequential damages (including, but not limited to, damages for loss of profits, loss of data or loss of use) arising out of the manufacture, sale, supply, use, marketing, resale or operation of the Work, even if ANC has been advised of the possibility of such damages or losses.</p>
                </li>
                <li>
                    <span className="font-bold">Indemnification.</span>
                    <p className="mt-1 mb-1">ANC shall indemnify and hold harmless the Purchaser and its members, directors, officers, shareholders, employees, affiliates and agents from and against any and all loss, liability, costs, damages, and expenses, including reasonable attorneys&apos; fees, which Purchaser may incur by reason of any action, claim, or proceeding arising out of any material breach of representations, warranties, or obligations hereunder.</p>
                    <p className="mb-1">The Purchaser shall indemnify and hold harmless ANC, its members, directors, officers, shareholders, employees, affiliates, and agents from and against any and all loss, liability, costs, damages, and expenses, including reasonable attorneys&apos; fees, arising out of or in connection with:</p>
                    <ul className="list-disc pl-5">
                        <li>any injury to third parties or third party property, except for injuries resulting from ANC&apos;s gross negligence or intentional misconduct.</li>
                        <li>Purchaser&rsquo;s instructions, directions or directives, whether oral or in writing, to ANC&rsquo;s staff and employees in connection with the Work.</li>
                    </ul>
                </li>
                <li><span className="font-bold">Purchaser&rsquo;s Obligation to Pay.</span> If Purchaser has any approval rights, it is Purchaser&rsquo;s responsibility to obtain ANC&rsquo;s written consent to such limitations on the front of this document. The obligation of the Purchaser to pay for the Work, as outlined herein, is absolute and unconditional and not subject to set off or rebate. The provisions of Sections 4 and 5 of these General Terms shall survive any termination, in whole or in part, of the Agreement.</li>
                <li>
                    <span className="font-bold">Force Majeure.</span>
                    <p className="mt-1 mb-1">&ldquo;Events of Force Majeure&rdquo; shall be defined as follows: any act, event, or circumstance, beyond the reasonable control of either party and unavoidable despite the exercise of reasonable diligence, that renders performance of any obligation of this agreement impossible, or so substantially increases the costs of compliance such that the value of this agreement is materially diminished or its purpose materially frustrated beyond the reasonable contemplation of either party as of the Effective Date; including, without limitation, the following actual or threatened events and their attendant consequences, so long as otherwise satisfying the foregoing definition: strikes, labor unrest, terrorism, civil disturbance or riots, military actions or movements, fires, acts of God, natural disasters, wars, pandemic, epidemic, viral outbreak, public health crisis, disease, quarantine restrictions, stay-at-home or shelter-in-place or equivalent orders, government restrictions on travel, movement, or public gatherings, public health government restrictions, acts of government or any federal, state, local, public or administrative authority, unavailability or obsolescence of parts, or materials, electrical, internet, wireless or computer network, server or telecommunications outages.</p>
                    <p className="mb-1">Neither party shall be liable to the other for either (a) any delay in performing or failure to perform under the Agreement relating to or arising out of Events of Force Majeure; or (b) inoperability or breakdown of equipment or facilities relating to or arising out of Events of Force Majeure, other than the obligation to make money payments for work that was approved and delivered prior to the Event of Force Majeure.</p>
                    <p>If either party is rendered unable, wholly or in part, by Event of Force Majeure to perform any of its obligations under this Agreement, such party will give the other party prompt written notice of the Event of Force Majeure with reasonably full particulars concerning it and the reasons for nonperformance. Thereupon, the obligations of the party giving notice will be suspended for only so long as the Event of Force Majeure continues. The affected party will use all possible diligence to remove the Event of Force Majeure as quickly as possible.</p>
                </li>
                <li><span className="font-bold">Future Pandemic.</span> In addition to any rights either party may have under Section 8 relating to Events of Force Majeure, the parties acknowledge that amidst the duration of any pandemic similar to the extent of the Covid-19 pandemic (each a &ldquo;Future Pandemic&rdquo;) and thereafter for some undefined period of time, there may be consequences of the Pandemic or adverse market conditions (whether or not sudden or unpredictable) that could render either party&rsquo;s performance hereunder difficult or impracticable or that could substantially increase the costs of compliance such that the value of this agreement is materially diminished or its purpose materially frustrated beyond the reasonable contemplation of either party as of the Effective Date. Accordingly, ANC shall not be responsible for any additional compensation hereunder or lost revenues or profits, damages, costs or overhead incurred by relating to or arising out of (i) shutdowns, postponements, or cancellations relating to or arising out of the Pandemic; or (ii) employee unavailability or staffing shortages relating to or as a consequence of Pandemic, whether due to illness, travel restrictions or Events of Force Majeure. Notwithstanding the foregoing, the lease fee payments obligations hereunder shall continue unabated throughout the Pandemic and regardless of its consequences.</li>
                <li>
                    <span className="font-bold">Miscellaneous.</span>
                    <ul className="list-disc pl-5 mt-1">
                        <li><span className="font-semibold">Assignment.</span> ANC may assign the Agreement at any time without the prior written consent of Purchaser.</li>
                        <li><span className="font-semibold">Independent Contractors.</span> The Agreement is made between independent contracting parties and does not constitute a partnership or joint venture between the parties.</li>
                        <li><span className="font-semibold">Taxes.</span> The Purchaser is responsible for the payment of any and all sales or use taxes or similar taxes applicable to the LED System or the advertising displayed on the LED System should such taxes be or become due in any taxing jurisdiction as a result of legislation or any audit or such similar determination.</li>
                        <li><span className="font-semibold">Entire Agreement.</span> The Agreement embodies the entire agreement between the parties with respect to the subject matter hereof and may only be changed by a written instrument signed by both parties. No representation, warranty, undertaking or agreement is made by either party except as contained herein, and any representations, warranties, undertakings or agreements not set forth herein are specifically disclaimed.</li>
                        <li><span className="font-semibold">Headings.</span> The headings of the sections and subsections of the Agreement have been inserted for convenience and shall not modify, define, limit or expand the express provisions of the Agreement.</li>
                        <li><span className="font-semibold">Governing Law.</span> The Agreement shall be governed by and construed in accordance with the laws of the State of {c.governingLawState}.</li>
                    </ul>
                </li>
            </ol>

            <div style={{ breakBefore: "page", pageBreakBefore: "always", minHeight: "580px" }}>
                <Header>Exhibit A</Header>
            </div>

            <div style={{ breakBefore: "page", pageBreakBefore: "always", minHeight: "580px" }}>
                <Header>Exhibit B</Header>
            </div>

            <div style={{ breakBefore: "page", pageBreakBefore: "always" }}>
                <Header>Exhibit C</Header>
                <div className="font-bold uppercase mb-3">Parts Replacement Procedures</div>
                <p className="mb-3">
                    ANC has three reporting procedures for our clients operating the company&rsquo;s signage systems which
                    ensure ANC&rsquo;s equipment is operating to its fullest potential at all venues. These procedures ensure that
                    ANC is immediately informed of any issues related to the company&rsquo;s systems and will enable timely
                    technical support, onsite service, and repair or replacement of components.
                </p>
                <div className="font-bold mb-1">Toll-Free Hotline</div>
                <p className="mb-3">
                    Clients with service requests, in-game issues or other concerns should please call the toll free TechOps
                    Support Hotline at (888) 875-2125. The hotline is staffed around-the-clock by senior technical support
                    specialists with over 50 years of combined experience, demonstrating our commitment to provide all the
                    resources necessary to feature premier in-game signage content during all events.
                </p>
                <div className="font-bold mb-1">Parts Repair/Replacement</div>
                <p className="mb-3">
                    ANC has a company-wide parts repair/replacement policy in place for all LED, DLP&reg;, Rotational and
                    Hardware Server parts. If your venue is experiencing a part malfunction, send an email to parts@anc.com.
                </p>
                <p className="mb-2">The e-mail should include the following:</p>
                <ul className="list-disc pl-5 space-y-1 mb-3">
                    <li>Part make (Mitsubishi, LSI SACO, Lighthouse, etc.)</li>
                    <li>Each part model/name</li>
                    <li>Each part number and/or serial number</li>
                    <li>Where the bad part came from (i.e. 360 fascia, center-hung, dasher, courtside, home plate, base line, Master Server, etc.)</li>
                    <li>Description of the problem with the part</li>
                </ul>
                <p>
                    Once ANC receives this information, we will provide you with documentation and step-by-step shipping
                    instructions regarding where to send the bad part(s) for repair/replacement or to set up an onsite visit. If
                    you have any questions concerning if the part is actually faulty, please call ANC&rsquo;s Toll-Free Hotline
                </p>
            </div>
        </div>
    );
}
