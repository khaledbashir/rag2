import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/featureFlags";
import MnsSyncClient from "./MnsSyncClient";

export const dynamic = "force-dynamic";

export default function Page() {
  if (!FEATURES.M_AND_S_OPERATING_LAYER) {
    notFound();
  }
  return <MnsSyncClient />;
}
