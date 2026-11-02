import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Android verifies this file before opening the app for an HTTPS link. The
 * release signing certificate fingerprint is supplied as a server-side
 * configuration value, never committed to the repository.
 */
export async function GET(): Promise<Response> {
  const packageName = process.env.ANDROID_APP_PACKAGE?.trim();
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  if (!packageName || fingerprints.length === 0) {
    return new NextResponse("Not configured", { status: 404 });
  }

  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: packageName,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    {
      headers: {
        "cache-control": "public, max-age=300",
        "content-type": "application/json",
      },
    },
  );
}
