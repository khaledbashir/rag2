import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FEATURES } from "@/lib/featureFlags";
import EstimatorStudio from "@/app/components/estimator/EstimatorStudio";

export default async function EstimatorPage() {
    const session = await auth();
    if (!session?.user) {
        redirect("/");
    }

    if (!FEATURES.ESTIMATOR) {
        redirect("/projects");
    }

    return <EstimatorStudio />;
}
