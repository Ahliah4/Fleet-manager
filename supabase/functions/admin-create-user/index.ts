// Supabase Edge Function: admin-create-user
//
// Creates a user with the service role key after confirming the caller is an
// admin, and puts the new account in the caller's fleet so team members share
// vehicles and alerts. Deploy with:
//
//   supabase functions deploy admin-create-user
//
// The function reads SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY from the Edge Function environment, which Supabase
// provides automatically. Never expose the service role key to the browser.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Function is missing Supabase environment variables." }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "You must be signed in to create users." }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("role,fleet_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return json({ error: profileError.message }, 500);
    }

    if (callerProfile?.role !== "admin") {
      return json({ error: "Only admins can create users." }, 403);
    }

    if (!callerProfile.fleet_id) {
      return json({ error: "Your account is not linked to a fleet. Run supabase/schema.sql." }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const fullName = String(body.fullName ?? "").trim();
    const role = body.role === "admin" ? "admin" : "member";

    if (!email.includes("@")) {
      return json({ error: "Enter a valid email address." }, 400);
    }

    if (password.length < 8) {
      return json({ error: "Password must be at least 8 characters." }, 400);
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || email.split("@")[0] },
    });

    if (error) {
      return json({ error: error.message }, 400);
    }

    // The database trigger creates a profile with its own temporary fleet.
    // Move the account into the admin's fleet and clean up the unused fleet.
    const { data: createdProfile } = await adminClient
      .from("profiles")
      .select("fleet_id")
      .eq("id", data.user.id)
      .maybeSingle();

    const { error: upsertError } = await adminClient.from("profiles").upsert({
      id: data.user.id,
      email,
      full_name: fullName || null,
      role,
      fleet_id: callerProfile.fleet_id,
    });

    if (upsertError) {
      return json({ error: upsertError.message }, 500);
    }

    if (createdProfile?.fleet_id && createdProfile.fleet_id !== callerProfile.fleet_id) {
      const { count } = await adminClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("fleet_id", createdProfile.fleet_id);

      if (!count) {
        await adminClient.from("fleets").delete().eq("id", createdProfile.fleet_id);
      }
    }

    return json(
      {
        user: {
          id: data.user.id,
          email: data.user.email,
          role,
          fleet_id: callerProfile.fleet_id,
        },
      },
      200
    );
  } catch (error) {
    return json({ error: error?.message ?? "Unexpected error creating the user." }, 500);
  }
});
