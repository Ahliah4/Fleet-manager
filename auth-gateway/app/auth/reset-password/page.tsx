import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="shell">
      <section className="card">
        <div className="brand" aria-label="Fleet Operations">
          <div className="mark">IP</div>
          <span>FLEET OPERATIONS</span>
        </div>
        <h1>Choose a new password</h1>
        <p className="intro">Use at least eight characters, then sign in again.</p>
        <ResetPasswordForm token={params.token ?? ""} />
      </section>
    </main>
  );
}
