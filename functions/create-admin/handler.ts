import { createClient } from "npm:@insforge/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/*
 * Fixed CodeRelay administrator registration code.
 *
 * Keep this value on the server only.
 * Do NOT put the registration code in the React frontend.
 */
const FIXED_ADMIN_REGISTRATION_CODE = "CODERELAY-ADMIN-2026";

type RegisterAdminRequest = {
  user_id: string;
  full_name: string;
  email: string;
  admin_id: string;
  registration_code: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getBearerToken(request: Request) {
  const value = request.headers.get("authorization");

  if (!value?.startsWith("Bearer ")) {
    return null;
  }

  return value.slice(7).trim();
}

export default async function handler(request: Request) {
  /*
   * Handle browser CORS preflight requests.
   */
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return json(
      { error: "Only POST requests are supported." },
      405,
    );
  }

  try {
    const body = (await request.json()) as Partial<RegisterAdminRequest>;

    const userId = body.user_id?.trim();
    const fullName = body.full_name?.trim();
    const email = body.email?.trim().toLowerCase();
    const adminId = body.admin_id?.trim();
    const registrationCode = body.registration_code?.trim();

    /*
     * Validate required fields.
     */
    if (!userId || !fullName || !email || !adminId || !registrationCode) {
      return json(
        { error: "Missing required admin registration fields." },
        400,
      );
    }

    /*
     * Validate the fixed administrator registration code.
     */
    if (registrationCode !== FIXED_ADMIN_REGISTRATION_CODE) {
      return json(
        { error: "Invalid admin registration code." },
        403,
      );
    }

    /*
     * Server-only privileged InsForge API key.
     * Never expose this key in the frontend.
     */
    const serviceKey =
      Deno.env.get("API_KEY") ??
      Deno.env.get("INSFORGE_SERVICE_KEY") ??
      Deno.env.get("INSFORGE_ADMIN_KEY");

    const insforgeUrl = Deno.env.get("INSFORGE_URL");

    if (!serviceKey) {
      return json(
        {
          error: "Admin registration backend is not configured.",
          details: "Missing server-side API_KEY/INSFORGE_SERVICE_KEY.",
        },
        503,
      );
    }

    if (!insforgeUrl) {
      return json(
        {
          error: "Admin registration backend is not configured.",
          details: "Missing INSFORGE_URL.",
        },
        503,
      );
    }

    /*
     * If an authenticated access token is supplied, verify that it
     * belongs to the same Auth user being registered.
     *
     * Email verification can mean signup itself does not return an
     * access token, so the fixed registration code remains required.
     */
    const bearerToken = getBearerToken(request);

    if (bearerToken) {
      const authDb = createClient({
        baseUrl: insforgeUrl,
        accessToken: bearerToken,
      });

      const currentUser = await authDb.auth.getCurrentUser();

      if (
        currentUser.error ||
        !currentUser.data?.user ||
        currentUser.data.user.id !== userId
      ) {
        return json(
          { error: "The signup user could not be verified." },
          401,
        );
      }
    }

    /*
     * Privileged database client.
     */
    const adminDb = createClient({
      baseUrl: insforgeUrl,
      accessToken: serviceKey,
    });

    /*
     * Prevent the same Admin ID from being assigned to another user.
     */
    const existingAdmin = await adminDb.database
      .from("profiles")
      .select("user_id, admin_id")
      .eq("admin_id", adminId)
      .maybeSingle();

    if (existingAdmin.error) {
      return json(
        {
          error: "Unable to check the Admin ID.",
          details: existingAdmin.error,
        },
        500,
      );
    }

    if (existingAdmin.data && existingAdmin.data.user_id !== userId) {
      return json(
        { error: "This Admin ID is already registered." },
        409,
      );
    }

    /*
     * Create/update the CodeRelay administrator profile.
     *
     * profiles.id is NOT NULL, so use the Auth user's UUID as
     * the profile primary key.
     *
     * profiles.role CHECK constraint:
     * STUDENT | ADMIN | SUPER_ADMIN
     *
     * Therefore this table uses uppercase ADMIN.
     */
    const profileResult = await adminDb.database
      .from("profiles")
      .upsert(
        {
          id: userId,
          user_id: userId,
          full_name: fullName,
          email,
          admin_id: adminId,
          role: "ADMIN",
        },
        {
          onConflict: "user_id",
        },
      )
      .select()
      .maybeSingle();

    if (profileResult.error) {
      return json(
        {
          error: "Unable to create the admin profile.",
          details: profileResult.error,
        },
        500,
      );
    }

    /*
     * Create/update the administrator role record.
     *
     * user_roles.role CHECK constraint:
     * student | admin
     *
     * Therefore this table uses lowercase admin.
     */
    const roleResult = await adminDb.database
      .from("user_roles")
      .upsert(
        {
          user_id: userId,
          role: "admin",
        },
        {
          onConflict: "user_id",
        },
      )
      .select()
      .maybeSingle();

    if (roleResult.error) {
      return json(
        {
          error: "Unable to assign the admin role.",
          details: roleResult.error,
        },
        500,
      );
    }

    /*
     * Administrator registration completed successfully.
     */
    return json({
      success: true,
      message: "Admin registration completed.",
      user_id: userId,
      admin_id: adminId,
    });
  } catch (error) {
    console.error("create-admin failed:", error);

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Admin registration failed.",
      },
      500,
    );
  }
}
