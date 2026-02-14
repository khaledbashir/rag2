import { redirect } from "next/navigation";
import { FEATURES } from "@/lib/featureFlags";
import PdfFilterClientWrapper from "./PdfFilterClientWrapper";

export default function PdfFilterPage() {
  if (!FEATURES.RFP_INTELLIGENCE) {
    redirect("/projects");
  }

  return <PdfFilterClientWrapper />;
}
