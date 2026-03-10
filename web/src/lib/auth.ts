import { createSupabaseServerClient } from "./supabase.server";
import { supabaseAdmin } from "./supabase";
import { cookies } from "next/headers";

export type SessionUser = {
  userId: string;
  email: string;
  llcId: string | null;
  llcName: string | null;
  role: "user" | "admin" | null;
  isSuperAdmin: boolean;
  firstName: string;
  lastName: string;
  openphoneApiKey: string | null;
};

/**
 * Returns the authenticated user and their active LLC context.
 * Admins/super-admins can override their LLC via the `llc_context_id` cookie.
 * Returns null if not authenticated.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !supabaseAdmin) return null;

    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!profile) return null;

    const isSuperAdmin = profile.is_super_admin ?? false;

    // Load all approved memberships (prefer admin role)
    const { data: memberships } = await supabaseAdmin
      .from("user_llc_memberships")
      .select("*, llcs(id, name)")
      .eq("user_id", user.id)
      .eq("status", "approved")
      .order("role", { ascending: true }); // 'admin' < 'user' alphabetically

    const defaultMembership = memberships?.[0] ?? null;
    const defaultLlc = defaultMembership?.llcs as { id: string; name: string } | null;

    const isAdmin = isSuperAdmin || defaultMembership?.role === "admin";

    // For admins/super-admins, check if they've selected a different LLC context
    let llcId = defaultLlc?.id ?? null;
    let llcName = defaultLlc?.name ?? null;

    if (isAdmin) {
      const cookieStore = await cookies();
      const contextCookie = cookieStore.get("llc_context_id");
      const contextLlcId = contextCookie?.value ?? null;

      if (contextLlcId && contextLlcId !== llcId) {
        // Validate access: super admin can access any LLC, admin only their memberships
        if (isSuperAdmin) {
          const { data: llc } = await supabaseAdmin
            .from("llcs")
            .select("id, name")
            .eq("id", contextLlcId)
            .single();
          if (llc) { llcId = llc.id; llcName = llc.name; }
        } else {
          const match = memberships?.find((m) => {
            const l = m.llcs as { id: string; name: string } | null;
            return l?.id === contextLlcId;
          });
          if (match) {
            const l = match.llcs as { id: string; name: string };
            llcId = l.id;
            llcName = l.name;
          }
        }
      }
    }

    return {
      userId: user.id,
      email: profile.email,
      firstName: profile.first_name,
      lastName: profile.last_name,
      openphoneApiKey: profile.openphone_api_key ?? null,
      isSuperAdmin,
      llcId,
      llcName,
      role: defaultMembership?.role ?? null,
    };
  } catch {
    return null;
  }
}

export function unauthorizedResponse(message = "Unauthorized") {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export function forbiddenResponse(message = "Forbidden") {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
