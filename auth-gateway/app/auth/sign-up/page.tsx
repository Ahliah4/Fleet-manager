import { AuthForm } from "../ui/auth-form";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  return <AuthForm mode="sign-up" returnTo={params.returnTo} />;
}
