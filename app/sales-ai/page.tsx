import type { Metadata } from "next";
import SalesAiLanding from "./SalesAiLanding";

export const metadata: Metadata = {
    title: "ANC Sales Intelligence | The CRM That Moves With You",
    description:
        "Meet ANC Sales Intelligence: five evidence-backed AI capabilities inside the CRM for account research, target lists, outreach, pipeline control, and next-best actions.",
};

export default function SalesAiPage() {
    return <SalesAiLanding />;
}
