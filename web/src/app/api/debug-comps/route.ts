import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId") || "20260123_180258";

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase admin client not available" }, { status: 500 });
  }

  try {
    // Get the run UUID
    const { data: runData, error: runError } = await supabaseAdmin
      .from("runs")
      .select("id")
      .eq("run_id", runId)
      .single();

    if (runError || !runData) {
      return NextResponse.json({ error: `Failed to fetch run: ${runError?.message}` }, { status: 404 });
    }

    // Get first 3 listings
    const { data: listings, error: listingsError } = await supabaseAdmin
      .from("listings")
      .select("id, address")
      .eq("run_id", runData.id)
      .limit(3);

    if (listingsError || !listings) {
      return NextResponse.json({ error: `Failed to fetch listings: ${listingsError?.message}` }, { status: 500 });
    }

    const results = [];
    for (const listing of listings) {
      const { data: comps, error: compsError } = await supabaseAdmin
        .from("sold_comps")
        .select("id, address")
        .eq("listing_id", listing.id);

      results.push({
        listing_id: listing.id,
        listing_address: listing.address,
        comps_count: comps?.length || 0,
        comps_error: compsError?.message || null,
        comps: comps?.slice(0, 2) || [],
      });
    }

    return NextResponse.json({
      run_id: runId,
      run_uuid: runData.id,
      listings_count: listings.length,
      results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
