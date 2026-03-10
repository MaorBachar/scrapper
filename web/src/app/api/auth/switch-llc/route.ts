import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sessionUser.isSuperAdmin && sessionUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!supabaseAdmin) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { llcId } = await request.json();

  // Validate the LLC exists and the user has access to it
  if (llcId) {
    if (!sessionUser.isSuperAdmin) {
      const { data } = await supabaseAdmin
        .from("user_llc_memberships")
        .select("id")
        .eq("user_id", sessionUser.userId)
        .eq("llc_id", llcId)
        .eq("status", "approved")
        .single();
      if (!data) return NextResponse.json({ error: "No access to that LLC" }, { status: 403 });
    } else {
      const { data } = await supabaseAdmin.from("llcs").select("id").eq("id", llcId).single();
      if (!data) return NextResponse.json({ error: "LLC not found" }, { status: 404 });
    }
  }

  const response = NextResponse.json({ success: true });
  if (llcId) {
    response.cookies.set("llc_context_id", llcId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  } else {
    response.cookies.delete("llc_context_id");
  }
  return response;
}
