import { AuthForm } from "../ui/auth-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  return <AuthForm mode="sign-in" returnTo={params.returnTo} />;
}
