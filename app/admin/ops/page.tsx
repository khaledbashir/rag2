import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isPlatformOwner } from "@/lib/platformOwner";
import OpsClient from "./OpsClient";

export default async function OpsPage() {
  const session = await auth();
  const email = session?.user?.email;

  // Ghost page — returns 404-equivalent redirect for non-owners
  if (!isPlatformOwner(email)) {
    redirect("/projects");
  }

  return <OpsClient />;
}
