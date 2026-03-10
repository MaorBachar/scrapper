import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ zip: string }> }
) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!sessionUser.llcId) return NextResponse.json({ error: "No LLC context" }, { status: 400 });
    if (!supabaseAdmin) return NextResponse.json({ error: "Server error" }, { status: 500 });

    const { zip } = await params;
    const zipcode = decodeURIComponent(zip).trim();
    if (!zipcode) return NextResponse.json({ error: "zipcode required" }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("llc_favorite_zipcodes")
      .delete()
      .eq("llc_id", sessionUser.llcId)
      .eq("zipcode", zipcode);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
