import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Apple fetches this exact path when the app is installed or updated. It must
 * return JSON with no redirect and no authentication.
 */
export async function GET(): Promise<Response> {
  const teamId = process.env.IOS_APP_TEAM_ID?.trim();
  const bundleId = process.env.IOS_BUNDLE_ID?.trim();
  if (!teamId || !bundleId) {
    return new NextResponse("Not configured", { status: 404 });
  }

  return NextResponse.json(
    {
      applinks: {
        details: [
          {
            appID: `${teamId}.${bundleId}`,
            paths: ["/mobile/*"],
          },
        ],
      },
    },
    {
      headers: {
        "cache-control": "public, max-age=300",
        "content-type": "application/json",
      },
    },
  );
}
