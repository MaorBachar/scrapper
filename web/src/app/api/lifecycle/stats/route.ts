import { NextResponse } from "next/server";
import { supabaseAdmin, fetchAllRows } from "@/lib/supabase";
import { getSessionUser, unauthorizedResponse } from "@/lib/auth";

import type { LifecycleStats } from "@/lib/types";
export type { LifecycleStats };

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return unauthorizedResponse();
  if (!supabaseAdmin) return NextResponse.json({ error: "Server error" }, { status: 500 });

  try {
    const llcId = sessionUser.llcId;

    // 1. Total unique listings for this LLC (by property_key_hash)
    const listingsData = await fetchAllRows((from, to) => {
      let q = supabaseAdmin!.from("listings").select("property_key_hash")
        .eq("listing_status", "FOR_SALE");
      if (llcId) q = q.eq("llc_id", llcId);
      return q.range(from, to);
    });
    const hashSet = new Set<string>();
    for (const row of listingsData) {
      if (row.property_key_hash) hashSet.add(row.property_key_hash as string);
    }
    const total = hashSet.size;

    // 2. Most recent lifecycle entry per property_key_hash (LLC-specific + property-level auto)
    const lcData = await fetchAllRows((from, to) => {
      let q = supabaseAdmin!.from("lifecycle").select("property_key_hash, lifecycle, follow_up_date, created_at")
        .order("created_at", { ascending: false });
      if (llcId) q = q.or(`llc_id.eq.${llcId},llc_id.is.null`);
      return q.range(from, to);
    });

    const latestByHash = new Map<string, { lifecycle: string; follow_up_date: string | null }>();
    for (const row of lcData ?? []) {
      const hash = row.property_key_hash as string;
      if (hash && !latestByHash.has(hash)) {
        latestByHash.set(hash, {
          lifecycle: row.lifecycle,
          follow_up_date: row.follow_up_date ?? null,
        });
      }
    }

    // 3. Count by stage (only for properties this LLC has)
    const byCycle: Record<string, number> = {};
    const today = new Date().toISOString().slice(0, 10);
    let overdueFollowUps = 0;
    let withLifecycle = 0;

    for (const hash of hashSet) {
      const entry = latestByHash.get(hash);
      if (!entry) continue;
      byCycle[entry.lifecycle] = (byCycle[entry.lifecycle] ?? 0) + 1;
      withLifecycle++;
      if (
        entry.lifecycle === "Do follow up" &&
        entry.follow_up_date &&
        entry.follow_up_date < today
      ) {
        overdueFollowUps++;
      }
    }

    const newCount = total - withLifecycle;
    if (newCount > 0) {
      byCycle["New"] = (byCycle["New"] ?? 0) + newCount;
    }

    // Count recent price drops (last 14 days) — auto entries are property-level (no llc_id)
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    const pdData = await fetchAllRows((from, to) => {
      const q = supabaseAdmin!.from("lifecycle")
        .select("property_key_hash")
        .eq("lifecycle", "Price Drop")
        .eq("source", "auto")
        .gte("created_at", twoWeeksAgo);
      return q.range(from, to);
    });
    const pdHashes = new Set<string>();
    for (const row of pdData) {
      if (row.property_key_hash) pdHashes.add(row.property_key_hash);
    }
    const priceDropCount = pdHashes.size;

    return NextResponse.json({ total, byCycle, overdueFollowUps, priceDropCount } satisfies LifecycleStats);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    );
  }
}
