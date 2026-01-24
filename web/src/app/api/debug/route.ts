import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    // Get latest run
    const { data: runs, error: runsError } = await supabaseAdmin
      .from("runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);

    if (runsError) {
      return NextResponse.json({ error: `Failed to fetch runs: ${runsError.message}` }, { status: 500 });
    }

    const debugInfo: any = {
      runs: runs || [],
      runDetails: [],
    };

    // For each run, get listing and comp counts
    for (const run of runs || []) {
      const { count: listingsCount } = await supabaseAdmin
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("run_id", run.id);

      const { count: compsCount } = await supabaseAdmin
        .from("sold_comps")
        .select("*", { count: "exact", head: true })
        .in(
          "listing_id",
          (
            await supabaseAdmin.from("listings").select("id").eq("run_id", run.id)
          ).data?.map((l) => l.id) || []
        );

      debugInfo.runDetails.push({
        run_id: run.run_id,
        status: run.status,
        listings_count: listingsCount || 0,
        comps_count: compsCount || 0,
      });
    }

    return NextResponse.json(debugInfo);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Internal error: ${errorMessage}` }, { status: 500 });
  }
}
