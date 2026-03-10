import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionUser, unauthorizedResponse } from "@/lib/auth";

export const dynamic = "force-dynamic";

const DEFAULTS = { pctBelow: 30, minComps: 2, sqftRange: 20, maxDistance: 0.5, maxCompMonths: 3 };

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return unauthorizedResponse();
  if (!sessionUser.llcId || !supabaseAdmin) return NextResponse.json(DEFAULTS);

  const { data } = await supabaseAdmin
    .from("llc_opportunity_settings")
    .select("pct_below, min_comps, sqft_range, max_distance_miles, max_comp_months")
    .eq("llc_id", sessionUser.llcId)
    .single();

  if (!data) return NextResponse.json(DEFAULTS);
  return NextResponse.json({
    pctBelow: data.pct_below,
    minComps: data.min_comps,
    sqftRange: data.sqft_range ?? DEFAULTS.sqftRange,
    maxDistance: data.max_distance_miles ?? DEFAULTS.maxDistance,
    maxCompMonths: data.max_comp_months ?? DEFAULTS.maxCompMonths,
  });
}

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return unauthorizedResponse();
  if (!sessionUser.llcId)
    return NextResponse.json({ error: "No LLC context" }, { status: 400 });
  if (!supabaseAdmin)
    return NextResponse.json({ error: "Server error" }, { status: 500 });

  const body = await request.json();
  const pctBelow = Math.max(1, Math.min(99, parseInt(body.pctBelow, 10) || DEFAULTS.pctBelow));
  const minComps = Math.max(1, Math.min(50, parseInt(body.minComps, 10) || DEFAULTS.minComps));
  const sqftRange = Math.max(1, Math.min(100, parseInt(body.sqftRange, 10) || DEFAULTS.sqftRange));
  const maxDistance = Math.max(0.1, Math.min(10, parseFloat(body.maxDistance) || DEFAULTS.maxDistance));
  const maxCompMonths = Math.max(1, Math.min(24, parseInt(body.maxCompMonths, 10) || DEFAULTS.maxCompMonths));

  const { error } = await supabaseAdmin
    .from("llc_opportunity_settings")
    .upsert(
      {
        llc_id: sessionUser.llcId,
        pct_below: pctBelow,
        min_comps: minComps,
        sqft_range: sqftRange,
        max_distance_miles: maxDistance,
        max_comp_months: maxCompMonths,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "llc_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pctBelow, minComps, sqftRange, maxDistance, maxCompMonths });
}
