import type { Metadata, Viewport } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Sign in | IP Motors Fleet Manager",
  description: "Secure sign-in for IP Motors Fleet Manager",
  icons: { icon: "https://fleet-manager.ip-motors-fleet.workers.dev/favicon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#131313",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
