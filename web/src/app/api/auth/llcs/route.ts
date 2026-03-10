import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  // Super admins see all LLCs
  if (sessionUser.isSuperAdmin) {
    const { data, error } = await supabaseAdmin
      .from("llcs")
      .select("id, name")
      .order("name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  // LLC admins see only LLCs they are an approved admin of
  if (sessionUser.role === "admin") {
    const { data, error } = await supabaseAdmin
      .from("user_llc_memberships")
      .select("llcs(id, name)")
      .eq("user_id", sessionUser.userId)
      .eq("status", "approved")
      .eq("role", "admin");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const llcs = (data ?? []).map((m) => m.llcs).filter(Boolean);
    return NextResponse.json(llcs);
  }

  return NextResponse.json([]);
}
