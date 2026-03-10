import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionUser, unauthorizedResponse } from "@/lib/auth";

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return unauthorizedResponse();

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  let query = supabaseAdmin
    .from("runs")
    .select("id, run_id, zip_codes, status, max_listings_per_zip, created_at, completed_at, error_message, llc_id")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!sessionUser.isSuperAdmin && sessionUser.llcId) {
    query = query.eq("llc_id", sessionUser.llcId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const runIds = (data ?? []).map((r) => r.run_id);
  return NextResponse.json({ runIds, runs: data ?? [] });
}
