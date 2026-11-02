import { assertAuthConfigured, auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CompletePage() {
  assertAuthConfigured();
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");

  return (
    <main className="shell">
      <section className="card complete">
        <p className="eyebrow">Fleet Operations</p>
        <h1>Signed in</h1>
        <p>Your browser session is ready. You can return to the Fleet Operations app.</p>
      </section>
    </main>
  );
}
