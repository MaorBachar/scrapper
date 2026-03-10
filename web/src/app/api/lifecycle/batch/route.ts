import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionUser, unauthorizedResponse } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return unauthorizedResponse();
  return fetchBatch(request, sessionUser.isSuperAdmin ? null : sessionUser.llcId);
}

const CHUNK_SIZE = 100;

async function fetchBatch(request: Request, llcId: string | null) {
  try {
    const body = await request.json();
    const hashes: string[] = Array.isArray(body.propertyKeyHashes)
      ? body.propertyKeyHashes
      : [];

    if (hashes.length === 0) return NextResponse.json({});

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Supabase not configured. Set SUPABASE_SERVICE_ROLE_KEY." },
        { status: 500 }
      );
    }

    const latestByHash: Record<
      string,
      { lifecycle: string; date: string; description?: string | null; created_at?: string | null }
    > = {};

    for (let i = 0; i < hashes.length; i += CHUNK_SIZE) {
      const chunk = hashes.slice(i, i + CHUNK_SIZE);
      let query = supabaseAdmin
        .from("lifecycle")
        .select("property_key_hash, lifecycle, date, description, created_at")
        .order("created_at", { ascending: false });

      if (llcId) query = query.or(`llc_id.eq.${llcId},llc_id.is.null`);

      const { data, error } = await query.in("property_key_hash", chunk);

      if (error) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 500 }
        );
      }

      for (const row of data || []) {
        const hash = row.property_key_hash as string;
        if (hash && !latestByHash[hash]) {
          latestByHash[hash] = {
            lifecycle: row.lifecycle,
            date: row.date,
            description: row.description,
            created_at: row.created_at,
          };
        }
      }
    }

    return NextResponse.json(latestByHash);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
