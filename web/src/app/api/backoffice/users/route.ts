import { NextResponse } from "next/server";
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return unauthorizedResponse();
  if (!sessionUser.isSuperAdmin && sessionUser.role !== "admin") return forbiddenResponse();
  if (!supabaseAdmin) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  let query = supabaseAdmin
    .from("user_llc_memberships")
    .select(`
      id,
      user_id,
      llc_id,
      role,
      status,
      created_at,
      approved_at,
      user_profiles!user_llc_memberships_user_id_fkey (id, email, first_name, last_name, phone_number, created_at),
      llcs (id, name)
    `)
    .order("created_at", { ascending: false });

  // LLC admins can only see their own LLC
  if (!sessionUser.isSuperAdmin && sessionUser.llcId) {
    query = query.eq("llc_id", sessionUser.llcId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
