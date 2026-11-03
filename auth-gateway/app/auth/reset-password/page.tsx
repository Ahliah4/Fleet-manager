import { ResetPasswordForm } from "./reset-password-form";
import { AuthBrand } from "../ui/brand";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="shell">
      <section className="card">
        <AuthBrand />
        <p className="eyebrow">Account security</p>
        <h1>Choose a new password</h1>
        <p className="intro">Use at least eight characters, then sign in again.</p>
        <ResetPasswordForm token={params.token ?? ""} />
      </section>
    </main>
  );
}
