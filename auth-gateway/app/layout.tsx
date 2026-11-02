import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Fleet Operations",
  description: "Secure Fleet Operations sign-in",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
