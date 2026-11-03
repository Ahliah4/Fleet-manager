import { assertAuthConfigured, auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CompletePage() {
  assertAuthConfigured();
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  redirect("https://fleet-manager.ip-motors-fleet.workers.dev/auth/start");
}
