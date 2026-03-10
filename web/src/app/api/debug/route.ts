import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    const sessionUser = await getSessionUser();
    const llcId = sessionUser?.llcId ?? null;

    // Recent runs (all)
    const { data: runs } = await supabaseAdmin
      .from("runs")
      .select("run_id, id, status, llc_id, created_at, zip_codes, error_message")
      .order("created_at", { ascending: false })
      .limit(5);

    // Listing counts: total, with llc_id set, matching current llcId
    const { count: totalListings } = await supabaseAdmin
      .from("listings")
      .select("*", { count: "exact", head: true });

    const { count: listingsWithLlcId } = await supabaseAdmin
      .from("listings")
      .select("*", { count: "exact", head: true })
      .not("llc_id", "is", null);

    const { count: listingsNoLlcId } = await supabaseAdmin
      .from("listings")
      .select("*", { count: "exact", head: true })
      .is("llc_id", null);

    let listingsForCurrentLlc = null;
    if (llcId) {
      const { count } = await supabaseAdmin
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("llc_id", llcId);
      listingsForCurrentLlc = count;
    }

    // Sample of distinct llc_ids on listings
    const { data: sampleLlcIds } = await supabaseAdmin
      .from("listings")
      .select("llc_id")
      .limit(20);
    const distinctLlcIds = [...new Set((sampleLlcIds ?? []).map((r: any) => r.llc_id))];

    // Per-run listing counts
    const runDetails = await Promise.all(
      (runs ?? []).map(async (run: any) => {
        const { count: listingsInRun } = await supabaseAdmin!
          .from("listings")
          .select("*", { count: "exact", head: true })
          .eq("run_id", run.id);
        return {
          run_id: run.run_id,
          run_uuid: run.id,
          status: run.status,
          llc_id: run.llc_id,
          zip_codes: run.zip_codes,
          created_at: run.created_at,
          listings_saved: listingsInRun ?? 0,
          error_message: run.error_message ?? null,
        };
      })
    );

    return NextResponse.json({
      session: {
        userId: sessionUser?.userId,
        llcId: sessionUser?.llcId,
        llcName: sessionUser?.llcName,
        role: sessionUser?.role,
        isSuperAdmin: sessionUser?.isSuperAdmin,
      },
      listings: {
        total: totalListings,
        withLlcId: listingsWithLlcId,
        withoutLlcId: listingsNoLlcId,
        matchingCurrentLlc: listingsForCurrentLlc,
        distinctLlcIdsInListings: distinctLlcIds,
      },
      recentRuns: runDetails,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Internal error: ${errorMessage}` }, { status: 500 });
  }
}
