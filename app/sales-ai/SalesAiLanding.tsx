"use client";

import Image from "next/image";
import { useState } from "react";
import {
    ArrowRight,
    BarChart3,
    Building2,
    Check,
    ChevronRight,
    Crosshair,
    Database,
    Mail,
    Search,
    ShieldCheck,
    Sparkles,
    Target,
    Users,
} from "lucide-react";
import styles from "./sales-ai.module.css";

const capabilities = [
    {
        key: "brain",
        number: "01",
        label: "Sales Brain",
        icon: Sparkles,
        headline: "Start with the whole relationship.",
        copy: "Scout reads the account, contacts, opportunities, activity, service history, and prior wins before it recommends a move.",
        prompt: "What is the strongest move on this account?",
        answer: "Lead with the venue refresh window. The active Technology opportunity closes this quarter, but the last meaningful client touch is 18 days old. Re-engage the operations lead and anchor the conversation on phasing.",
        evidence: ["Live CRM relationship history", "Three-business-unit context", "One ranked next action"],
    },
    {
        key: "control",
        number: "02",
        label: "Control Panel",
        icon: BarChart3,
        headline: "Turn pipeline into today’s work.",
        copy: "See what needs attention now—not another dashboard full of numbers with no decision attached.",
        prompt: "What should I work on this morning?",
        answer: "Three moves lead the day: one overdue proposal commitment, one high-probability deal without a next task, and one renewal with no owner. The forecast excludes four undated opportunities and marks them unconfirmed.",
        evidence: ["Priority-ranked actions", "Forecast and stale-deal risk", "Visible data-health checks"],
    },
    {
        key: "list",
        number: "03",
        label: "List Builder",
        icon: Users,
        headline: "Build the right list before buying more data.",
        copy: "Find target accounts and buying roles, deduplicate them against the CRM, and review fit before any enrichment spend.",
        prompt: "Build a target list for Venue Services in the Northeast.",
        answer: "I found 24 relevant venues. Nine already exist in the CRM, five have active ANC relationships, and ten are net-new candidates. I ranked the 15 available targets by timing signal and role coverage.",
        evidence: ["CRM-first deduplication", "Strong / Fair / Longshot fit", "Approval before paid enrichment"],
    },
    {
        key: "research",
        number: "04",
        label: "Company Researcher",
        icon: Building2,
        headline: "Walk into the room already useful.",
        copy: "Combine ANC relationship history with attributable public signals to produce a sharp account brief and a defensible conversation angle.",
        prompt: "Prep me for the account review on this company.",
        answer: "The strongest opening is operational continuity, not a net-new technology pitch. ANC has prior project history, a service touchpoint this season, and a public capital-plan signal that makes phased modernization timely.",
        evidence: ["Dated source links", "Known people vs role gaps", "One conversation angle"],
    },
    {
        key: "outreach",
        number: "05",
        label: "Email Builder",
        icon: Mail,
        headline: "Write from evidence, not a template.",
        copy: "Draft or grade concise one-to-one outreach grounded in the recipient, the relationship, and the moment.",
        prompt: "Write the first email to the venue operations lead.",
        answer: "Subject: Phasing the next venue refresh\n\nYou’re balancing an active event calendar with a growing display footprint. We’ve helped venue teams stage upgrades around live operations without turning the season into a construction plan. Open to comparing phasing options?",
        evidence: ["No invented personalization", "Stage-matched call to action", "Draft only until approved"],
    },
] as const;

const workflow = [
    { label: "KNOW", title: "Read the relationship", copy: "Start with the account, people, open motion, and prior history already in the CRM.", icon: Database },
    { label: "FIND", title: "Locate the opening", copy: "Add verified market signals, role gaps, and timing evidence without replacing CRM truth.", icon: Search },
    { label: "MOVE", title: "Choose the next action", copy: "Rank the one move most likely to advance the relationship now.", icon: Crosshair },
    { label: "WRITE", title: "Make the message specific", copy: "Turn the evidence into clear outreach, meeting prep, or a follow-up task.", icon: Mail },
];

export default function SalesAiLanding() {
    const [activeKey, setActiveKey] = useState<(typeof capabilities)[number]["key"]>("brain");
    const active = capabilities.find((capability) => capability.key === activeKey) ?? capabilities[0];
    const ActiveIcon = active.icon;

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <a className={styles.logoLink} href="#top" aria-label="ANC Sales Intelligence home">
                    <Image
                        src="/ANC_Logo_2023_white.png"
                        alt="ANC"
                        width={118}
                        height={34}
                        priority
                        className={styles.logo}
                    />
                </a>
                <nav className={styles.nav} aria-label="Page navigation">
                    <a href="#system">The system</a>
                    <a href="#capabilities">Capabilities</a>
                    <a href="#trust">Built for trust</a>
                </nav>
                <a className={styles.headerCta} href="https://crm.ancsports.net/chat">
                    Open Scout <ArrowRight size={15} aria-hidden="true" />
                </a>
            </header>

            <section className={styles.hero} id="top">
                <Image
                    src="/venues/levis-stadium-upper-deck.jpg"
                    alt="Fans celebrating beneath venue LED displays at Levi's Stadium"
                    fill
                    priority
                    sizes="100vw"
                    className={styles.heroImage}
                />
                <div className={styles.heroShade} />
                <div className={styles.heroGrid} />
                <div className={styles.heroContent}>
                    <div className={styles.heroCopy}>
                        <p className={styles.eyebrow}><span /> ANC SALES INTELLIGENCE</p>
                        <h1>Your best sales day.<br /><em>On command.</em></h1>
                        <p className={styles.heroLead}>
                            Five specialist AI capabilities, working from one live CRM—so every account move starts with context, evidence, and a clear next action.
                        </p>
                        <div className={styles.heroActions}>
                            <a className={styles.primaryCta} href="https://crm.ancsports.net/chat">
                                Launch Sales AI <ArrowRight size={18} aria-hidden="true" />
                            </a>
                            <a className={styles.textCta} href="#capabilities">
                                Explore the system <ChevronRight size={17} aria-hidden="true" />
                            </a>
                        </div>
                    </div>

                    <div className={styles.briefCard} aria-label="Example Scout briefing">
                        <div className={styles.briefTopline}>
                            <span className={styles.liveDot} /> LIVE ACCOUNT BRIEF
                            <span>SCOUT / CRM</span>
                        </div>
                        <div className={styles.briefPrompt}>
                            <Sparkles size={17} aria-hidden="true" />
                            What should move first today?
                        </div>
                        <div className={styles.briefResult}>
                            <p className={styles.briefLabel}>BEST MOVE</p>
                            <h2>Re-engage the operations lead before the proposal window narrows.</h2>
                            <p>High-probability Technology opportunity. No meaningful client touch in 18 days. Phased delivery is the strongest verified angle.</p>
                        </div>
                        <div className={styles.briefEvidence}>
                            <span><Check size={13} /> CRM history</span>
                            <span><Check size={13} /> Timing signal</span>
                            <span><Check size={13} /> Next action</span>
                        </div>
                    </div>
                </div>
                <p className={styles.photoCaption}>VENUE EXPERIENCE / LEVI&apos;S STADIUM</p>
            </section>

            <section className={styles.signalBar} aria-label="Product facts">
                <div><strong>LIVE</strong><span>CRM context</span></div>
                <div><strong>05</strong><span>Specialist skills</span></div>
                <div><strong>03</strong><span>Revenue engines</span></div>
                <div><strong>01</strong><span>Source of truth</span></div>
            </section>

            <section className={styles.intro} id="system">
                <div className={styles.sectionTag}>THE SHIFT</div>
                <div className={styles.introGrid}>
                    <h2>The CRM stops storing the work.<br /><span>It starts moving it.</span></h2>
                    <div>
                        <p>Most sales systems tell you what happened. ANC Sales Intelligence tells you what matters now, why it matters, and what to do next.</p>
                        <p>It works across Technology, Venue Services, and Media &amp; Sponsorship without flattening three different sales motions into one generic playbook.</p>
                    </div>
                </div>
            </section>

            <section className={styles.workflowSection}>
                <div className={styles.workflowRail}>
                    {workflow.map((step, index) => {
                        const Icon = step.icon;
                        return (
                            <article className={styles.workflowStep} key={step.label}>
                                <div className={styles.workflowIndex}>0{index + 1}</div>
                                <Icon size={22} aria-hidden="true" />
                                <p>{step.label}</p>
                                <h3>{step.title}</h3>
                                <span>{step.copy}</span>
                            </article>
                        );
                    })}
                </div>
            </section>

            <section className={styles.capabilities} id="capabilities">
                <div className={styles.sectionHeading}>
                    <div>
                        <p className={styles.sectionTag}>THE FIVE-SKILL SYSTEM</p>
                        <h2>One Scout. Five disciplines.</h2>
                    </div>
                    <p>Use plain language. Scout routes the work to the specialist that can answer with the strongest evidence and the least speculation.</p>
                </div>

                <div className={styles.capabilityLayout}>
                    <div className={styles.capabilityTabs} role="tablist" aria-label="Sales AI capabilities">
                        {capabilities.map((capability) => {
                            const Icon = capability.icon;
                            const selected = capability.key === active.key;
                            return (
                                <button
                                    key={capability.key}
                                    type="button"
                                    role="tab"
                                    aria-selected={selected}
                                    className={selected ? styles.activeTab : undefined}
                                    onClick={() => setActiveKey(capability.key)}
                                >
                                    <span>{capability.number}</span>
                                    <Icon size={19} aria-hidden="true" />
                                    <strong>{capability.label}</strong>
                                    <ChevronRight size={17} aria-hidden="true" />
                                </button>
                            );
                        })}
                    </div>

                    <div className={styles.capabilityStage} role="tabpanel" key={active.key}>
                        <div className={styles.capabilityCopy}>
                            <span className={styles.capabilityIcon}><ActiveIcon size={25} /></span>
                            <p className={styles.capabilityNumber}>CAPABILITY {active.number}</p>
                            <h3>{active.headline}</h3>
                            <p>{active.copy}</p>
                            <ul>
                                {active.evidence.map((item) => <li key={item}><Check size={15} /> {item}</li>)}
                            </ul>
                        </div>
                        <div className={styles.conversation}>
                            <div className={styles.conversationTop}>
                                <span><Sparkles size={14} /> ASK SCOUT</span>
                                <span>EXAMPLE</span>
                            </div>
                            <div className={styles.userBubble}>{active.prompt}</div>
                            <div className={styles.aiBubble}>
                                <Image src="/brand-2026/Fav.png" alt="" width={25} height={25} />
                                <p>{active.answer}</p>
                            </div>
                            <a href="https://crm.ancsports.net/chat">Try it in the CRM <ArrowRight size={15} /></a>
                        </div>
                    </div>
                </div>
            </section>

            <section className={styles.trust} id="trust">
                <div className={styles.trustVisual}>
                    <div className={styles.trustOrbit}>
                        <div className={styles.trustCore}>
                            <ShieldCheck size={32} />
                            <strong>CRM TRUTH</strong>
                            <span>before AI inference</span>
                        </div>
                        <span className={styles.orbitOne}>RESEARCH</span>
                        <span className={styles.orbitTwo}>PIPELINE</span>
                        <span className={styles.orbitThree}>OUTREACH</span>
                    </div>
                </div>
                <div className={styles.trustCopy}>
                    <p className={styles.sectionTag}>BUILT FOR TRUST</p>
                    <h2>No confident<br />silent numbers.</h2>
                    <p>Sales AI is only useful when the team can see what is known, what is missing, and what the system inferred.</p>
                    <ul>
                        <li><ShieldCheck size={18} /><span><strong>CRM facts first.</strong> Public research adds evidence; it never overwrites the relationship record.</span></li>
                        <li><Target size={18} /><span><strong>One recommended move.</strong> Prioritized action replaces generic advice and dashboard noise.</span></li>
                        <li><Check size={18} /><span><strong>Approval before action.</strong> No sending, paid enrichment, or record changes without a clear confirmation.</span></li>
                    </ul>
                </div>
            </section>

            <section className={styles.finalCta}>
                <div className={styles.finalGrid} />
                <div>
                    <p className={styles.sectionTag}>THE NEXT MOVE IS ALREADY IN THE CRM</p>
                    <h2>Ask the question.<br />Move the account.</h2>
                </div>
                <div className={styles.finalAction}>
                    <p>Open Scout and start with one live account, one pipeline question, or one message that needs to land.</p>
                    <a className={styles.primaryCta} href="https://crm.ancsports.net/chat">
                        Open ANC Sales Intelligence <ArrowRight size={18} />
                    </a>
                </div>
            </section>

            <footer className={styles.footer}>
                <Image src="/ANC_Logo_2023_white.png" alt="ANC" width={92} height={27} />
                <p>SALES INTELLIGENCE / POWERED BY LIVE CRM CONTEXT</p>
                <span>© 2026 ANC SPORTS</span>
            </footer>
        </main>
    );
}
