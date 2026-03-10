import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!sessionUser.llcId) return NextResponse.json([], { status: 200 });
    if (!supabaseAdmin) return NextResponse.json({ error: "Server error" }, { status: 500 });

    const { data, error } = await supabaseAdmin
      .from("llc_favorite_zipcodes")
      .select("zipcode, last_scraped_at")
      .eq("llc_id", sessionUser.llcId)
      .order("zipcode");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(
      (data ?? []).map((r: { zipcode: string; last_scraped_at: string | null }) => ({
        zipcode: r.zipcode,
        lastScrapedAt: r.last_scraped_at,
      }))
    );
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!sessionUser.llcId) return NextResponse.json({ error: "No LLC context" }, { status: 400 });
    if (!supabaseAdmin) return NextResponse.json({ error: "Server error" }, { status: 500 });

    const body = await request.json();
    const zipcode = (body.zipcode ?? "").trim();
    if (!zipcode) return NextResponse.json({ error: "zipcode required" }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("llc_favorite_zipcodes")
      .upsert(
        { llc_id: sessionUser.llcId, zipcode, created_by: sessionUser.userId },
        { onConflict: "llc_id,zipcode" }
      );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
