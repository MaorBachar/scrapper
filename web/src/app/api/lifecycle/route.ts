import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionUser, unauthorizedResponse } from "@/lib/auth";
import { getPropertyKeyHash } from "@/lib/propertyKeyHash";

const MANUAL_STATUSES = [
  "Sent SMS",
  "Waiting for POS",
  "Do follow up",
  "Other",
];

const AUTO_STATUSES = [
  "Price Drop",
  "Price Increase",
  "Pending",
  "Contingent",
  "Unknown",
  "Back on Market",
  "Sold",
];

const ALL_STATUSES = [...MANUAL_STATUSES, ...AUTO_STATUSES, "New"];

export async function GET(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return unauthorizedResponse();

  try {
    const { searchParams } = new URL(request.url);
    const propertyKeyHash = searchParams.get("propertyKeyHash") || searchParams.get("propertyKey");

    if (!propertyKeyHash) {
      return NextResponse.json(
        { error: "propertyKeyHash is required" },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 500 }
      );
    }

    let query = supabaseAdmin
      .from("lifecycle")
      .select("*")
      .eq("property_key_hash", propertyKeyHash)
      .order("created_at", { ascending: false });

    // Show LLC-specific entries + property-level auto entries (llc_id IS NULL)
    if (!sessionUser.isSuperAdmin && sessionUser.llcId) {
      query = query.or(`llc_id.eq.${sessionUser.llcId},llc_id.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data || []);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return unauthorizedResponse();
  if (!sessionUser.llcId && !sessionUser.isSuperAdmin) {
    return NextResponse.json({ error: "No approved LLC membership." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { property_key, lifecycle, description, follow_up_date } = body;

    if (!property_key || !lifecycle) {
      return NextResponse.json(
        { error: "property_key and lifecycle are required" },
        { status: 400 }
      );
    }

    if (!MANUAL_STATUSES.includes(lifecycle)) {
      return NextResponse.json(
        { error: `lifecycle must be one of: ${MANUAL_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 500 }
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const property_key_hash = getPropertyKeyHash(property_key);

    const propsRes = await supabaseAdmin.from("properties").upsert(
      { property_key_hash, property_key },
      { onConflict: "property_key_hash" }
    );
    const useHash = !propsRes.error;

    const insertPayload: Record<string, unknown> = {
      property_key,
      lifecycle,
      date: today,
      description: description || null,
      follow_up_date: follow_up_date || null,
      llc_id: sessionUser.llcId,
    };
    if (useHash) insertPayload.property_key_hash = property_key_hash;

    const { data, error } = await supabaseAdmin
      .from("lifecycle")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    );
  }
}
