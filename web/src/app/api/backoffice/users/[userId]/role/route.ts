import { NextResponse } from "next/server";
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return unauthorizedResponse();
  if (!sessionUser.isSuperAdmin && sessionUser.role !== "admin") return forbiddenResponse();
  if (!supabaseAdmin) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { userId } = await params;
  const body = await request.json().catch(() => ({}));
  const newRole = body.role === "admin" ? "admin" : "user";

  if (!sessionUser.isSuperAdmin) {
    const { data: membership } = await supabaseAdmin
      .from("user_llc_memberships")
      .select("llc_id")
      .eq("user_id", userId)
      .eq("llc_id", sessionUser.llcId)
      .single();

    if (!membership) return forbiddenResponse("User is not in your LLC.");
  }

  const { error } = await supabaseAdmin
    .from("user_llc_memberships")
    .update({ role: newRole })
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
