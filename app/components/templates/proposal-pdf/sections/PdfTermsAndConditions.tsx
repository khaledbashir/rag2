/**
 * PdfTermsAndConditions — T&C Exhibit for CONTRACT document mode.
 *
 * Based on ANC's standard Sales Terms and Conditions (Dodgers template).
 * Renders as additional page(s) at the end of the Contract PDF.
 * Styled to match existing PDF sections (blue bar headers, Arial, plain text).
 *
 * Fillable spots: purchaser name, entity names
 * Toggleable sections: CMS, graphics, labor warranty, materials warranty
 */

import type { PdfColors } from "./shared";

export interface TermsAndConditionsConfig {
    /** Purchaser entity name (e.g., "Los Angeles Dodgers") */
    purchaserName: string;
    /** Warranty duration in years (default: 5) */
    warrantyYears?: number;
    /** Include labor warranty section */
    includeLaborWarranty?: boolean;
    /** Include materials warranty (parts + equipment) */
    includeMaterialsWarranty?: boolean;
    /** Include CMS-related clauses */
    includeCms?: boolean;
    /** Include graphics/content-related clauses */
    includeGraphics?: boolean;
    /** Exhibit letter (default: "C") */
    exhibitLetter?: string;
}

interface PdfTermsAndConditionsProps {
    colors: PdfColors;
    config: TermsAndConditionsConfig;
}

export default function PdfTermsAndConditions({ colors, config }: PdfTermsAndConditionsProps) {
    const {
        purchaserName = "Purchaser",
        warrantyYears = 5,
        includeLaborWarranty = true,
        includeMaterialsWarranty = true,
        includeCms = false,
        includeGraphics = false,
        exhibitLetter = "C",
    } = config;

    let sectionNum = 1;

    return (
        <div data-preview-section="terms-and-conditions" className="px-6">
            {/* Exhibit Header — matches "Exhibit B — Statement of Work" style */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <div style={{ width: '3px', height: '14px', borderRadius: '1px', background: colors.primary, flexShrink: 0 }} />
                <span className="text-[14px] font-bold uppercase tracking-wider" style={{ color: colors.primaryDark }}>
                    Exhibit {exhibitLetter} — Terms and Conditions
                </span>
            </div>

            <div className="space-y-3 text-[12px] leading-relaxed" style={{ color: colors.text }}>
                {/* Section 1: Intellectual Property */}
                <Section num={sectionNum++} title="Intellectual Property" colors={colors}>
                    <p>
                        As used herein, &quot;Marks&quot; means any trademarks, service marks, trade names, logos,
                        designs, copyrights, domain names, or other intellectual property of a party. Each
                        party retains all right, title, and interest in and to its own Marks. Neither party
                        may use the other party&apos;s Marks without the prior written consent of the owning party.
                    </p>
                </Section>

                {/* Section 2: Ownership */}
                <Section num={sectionNum++} title="Ownership of the Equipment" colors={colors}>
                    <p>
                        Title to and ownership of the Server Equipment shall pass to {purchaserName} (&quot;Purchaser&quot;)
                        upon receipt of full payment therefor, free and clear of all liens, claims, security
                        interests, and encumbrances. Notwithstanding the foregoing, intellectual property
                        ownership shall be governed by Section 1 above.
                    </p>
                </Section>

                {/* Section 3: Authority */}
                <Section num={sectionNum++} title="Existence, Power and Authority" colors={colors}>
                    <p>
                        Each party represents and warrants that it is duly organized, validly existing, and
                        in good standing, and has the full right, power, and authority to enter into and
                        perform its obligations under this Agreement.
                    </p>
                </Section>

                {/* Section 4: Warranty */}
                <Section num={sectionNum++} title="Warranty" colors={colors}>
                    {includeLaborWarranty && (
                        <div className="mb-2">
                            <p className="font-semibold text-[11px] uppercase tracking-wide mb-1" style={{ color: colors.textMuted }}>
                                (a) Labor Warranty
                            </p>
                            <p>
                                ANC warrants that the installation labor and workmanship shall be free from
                                defects for a period of {warrantyYears} year{warrantyYears !== 1 ? "s" : ""} from
                                the date of installation completion. During this warranty period, ANC shall
                                repair or correct, at its own expense, any defects in workmanship within
                                forty-eight (48) hours of receiving written notice from {purchaserName}.
                            </p>
                        </div>
                    )}

                    {includeMaterialsWarranty && (
                        <div className="mb-2">
                            <p className="font-semibold text-[11px] uppercase tracking-wide mb-1" style={{ color: colors.textMuted }}>
                                {includeLaborWarranty ? "(b)" : "(a)"} Materials &amp; Equipment Warranty
                            </p>
                            <p>
                                ANC warrants that all equipment and materials furnished shall be free from
                                defects in materials for a period of {warrantyYears} year{warrantyYears !== 1 ? "s" : ""} from
                                the date of installation completion. ANC shall, at its option, repair or
                                replace any defective parts or components at no additional cost
                                to {purchaserName}.
                            </p>
                        </div>
                    )}

                    <div className="mb-2">
                        <p className="font-semibold text-[11px] uppercase tracking-wide mb-1" style={{ color: colors.textMuted }}>
                            {includeLaborWarranty && includeMaterialsWarranty ? "(c)" : includeLaborWarranty || includeMaterialsWarranty ? "(b)" : "(a)"} Exclusions
                        </p>
                        <p>
                            The warranty does not cover defects or damage caused by: neglect, misuse, or abuse;
                            vandalism or theft; acts of nature, power surges, or lightning; unauthorized
                            servicing, modification, or repair by parties other than ANC; or normal wear
                            and tear. The warranty shall be suspended during any period in which {purchaserName} is
                            in default of payment obligations.
                        </p>
                    </div>

                    <div>
                        <p className="font-semibold text-[11px] uppercase tracking-wide mb-1" style={{ color: colors.textMuted }}>
                            {includeLaborWarranty && includeMaterialsWarranty ? "(d)" : includeLaborWarranty || includeMaterialsWarranty ? "(c)" : "(b)"} Limitation
                        </p>
                        <p>
                            THE WARRANTY SET FORTH HEREIN IS THE SOLE AND EXCLUSIVE WARRANTY. ALL OTHER
                            WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY AND
                            FITNESS FOR A PARTICULAR PURPOSE, ARE HEREBY DISCLAIMED. ANC&apos;S LIABILITY SHALL
                            NOT EXCEED THE PURCHASE PRICE. IN NO EVENT SHALL ANC BE LIABLE FOR ANY
                            CONSEQUENTIAL, INCIDENTAL, OR SPECIAL DAMAGES. This warranty is non-transferable.
                        </p>
                    </div>
                </Section>

                {/* CMS Section (conditional) */}
                {includeCms && (
                    <Section num={sectionNum++} title="Content Management System" colors={colors}>
                        <p>
                            ANC shall provide a Content Management System (&quot;CMS&quot;) for the scheduling,
                            management, and distribution of content across the display network.
                            The CMS license and associated support services are included for the duration
                            of the maintenance agreement. {purchaserName} shall be responsible for all
                            content creation, scheduling, and compliance with applicable regulations.
                            ANC provides the platform only and assumes no liability for content displayed.
                        </p>
                    </Section>
                )}

                {/* Graphics Section (conditional) */}
                {includeGraphics && (
                    <Section num={sectionNum++} title="Graphics &amp; Content Services" colors={colors}>
                        <p>
                            ANC shall provide graphic design and content creation services as specified
                            in the project scope. All original creative works produced by ANC shall remain
                            the property of ANC unless otherwise agreed in writing. {purchaserName} grants
                            ANC a limited license to use {purchaserName}&apos;s Marks solely for the purpose
                            of fulfilling graphic design obligations under this Agreement.
                        </p>
                    </Section>
                )}

                {/* Indemnification */}
                <Section num={sectionNum++} title="Indemnification" colors={colors}>
                    <p className="mb-2">
                        (a) Each party shall indemnify, defend, and hold harmless the other party from and
                        against any claims, damages, losses, and expenses arising from: (i) the negligence
                        or willful misconduct of the indemnifying party; (ii) any product defect attributable
                        to the indemnifying party; or (iii) any breach of this Agreement. ANC specifically
                        assumes liability for the acts and omissions of its employees, agents, and
                        subcontractors while on {purchaserName}&apos;s premises.
                    </p>
                    <p>
                        (b) The party seeking indemnification shall provide prompt written notice of any
                        claim and shall cooperate with the indemnifying party in the defense thereof.
                        This Section shall survive termination of this Agreement.
                    </p>
                </Section>

                {/* Force Majeure */}
                <Section num={sectionNum++} title="Force Majeure" colors={colors}>
                    <p>
                        Neither party shall be liable for any failure or delay in performance due to causes
                        beyond its reasonable control, including but not limited to: strikes, lockouts,
                        terrorism, war, natural disasters, pandemic, epidemic, government restrictions,
                        telecommunications or power outages, or acts of God. Obligations shall be suspended
                        for the duration of such event.
                    </p>
                </Section>

                {/* Miscellaneous */}
                <Section num={sectionNum++} title="Miscellaneous" colors={colors}>
                    <p className="mb-1">
                        (a) ANC may assign this Agreement without the consent of {purchaserName}.
                    </p>
                    <p className="mb-1">
                        (b) The parties are independent contractors. Nothing herein creates an
                        employment, agency, partnership, or joint venture relationship.
                    </p>
                    <p className="mb-1">
                        (c) {purchaserName} shall be responsible for all applicable taxes, fees,
                        and assessments relating to the equipment and services.
                    </p>
                    <p className="mb-1">
                        (d) This Agreement, together with all exhibits and attachments, constitutes
                        the entire agreement between the parties and supersedes all prior negotiations,
                        representations, and agreements.
                    </p>
                    <p className="mb-1">
                        (e) Section headings are for reference only and shall not affect interpretation.
                    </p>
                    <p>
                        (f) This Agreement shall be governed by and construed in accordance with the
                        laws of the state in which {purchaserName}&apos;s principal place of business
                        is located, without regard to conflict of law principles.
                    </p>
                </Section>
            </div>
        </div>
    );
}

/** Numbered section with blue bar — matches SectionHeader style from ProposalTemplate5 */
function Section({
    num,
    title,
    colors,
    children,
}: {
    num: number;
    title: string;
    colors: PdfColors;
    children: React.ReactNode;
}) {
    return (
        <div className="break-inside-avoid">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <div style={{ width: '3px', height: '12px', borderRadius: '1px', background: colors.primary, flexShrink: 0 }} />
                <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: colors.text }}>
                    {num}. {title}
                </span>
            </div>
            <div className="pl-3 text-[12px] leading-relaxed">
                {children}
            </div>
        </div>
    );
}
