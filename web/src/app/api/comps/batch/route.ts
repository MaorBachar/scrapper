import { NextResponse } from "next/server";
import { supabaseAdmin, fetchAllRows } from "@/lib/supabase";
import { getSessionUser, unauthorizedResponse } from "@/lib/auth";

import type { CompSummary } from "@/lib/types";

export const dynamic = "force-dynamic";
export type { CompSummary };

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return unauthorizedResponse();

  try {
    const body = await request.json();
    const listingIds: string[] = Array.isArray(body.listingIds) ? body.listingIds : [];

    if (listingIds.length === 0) return NextResponse.json({});
    if (!supabaseAdmin)
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const result: Record<string, CompSummary> = {};

    const CHUNK = 100;
    for (let i = 0; i < listingIds.length; i += CHUNK) {
      const chunk = listingIds.slice(i, i + CHUNK);
      const data = await fetchAllRows((from, to) =>
        supabaseAdmin!.from("sold_comps")
          .select("listing_id, address, url, sold_price, sold_date, beds, baths, sqft, distance_miles")
          .in("listing_id", chunk)
          .order("distance_miles", { ascending: true })
          .range(from, to)
      );

      for (const row of data) {
        const lid = row.listing_id as string;
        if (!result[lid]) result[lid] = { count: 0, avgPrice: null, isOpportunity: false, qualifyingComps: 0, comps: [] };
        result[lid].comps.push({
          address: row.address,
          url: row.url,
          sold_price: row.sold_price,
          sold_date: row.sold_date,
          beds: row.beds,
          baths: row.baths,
          sqft: row.sqft,
          distance_miles: row.distance_miles,
        });
      }
    }

    for (const summary of Object.values(result)) {
      summary.count = summary.comps.length;
      const prices = summary.comps.map((c) => c.sold_price).filter((p): p is number => p != null);
      summary.avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
    }

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
