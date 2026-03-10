import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionUser, unauthorizedResponse } from "@/lib/auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return unauthorizedResponse();

  try {
    const { runId } = await params;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Supabase admin client not configured" },
        { status: 500 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("runs")
      .select("*")
      .eq("run_id", runId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Run not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `Failed to fetch run status: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Internal server error: ${errorMessage}` },
      { status: 500 }
    );
  }
}
