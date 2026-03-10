import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "node:path";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionUser, unauthorizedResponse } from "@/lib/auth";

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return unauthorizedResponse();
  if (!sessionUser.llcId) {
    return NextResponse.json({ error: "No approved LLC membership." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { zip_codes, max_listings_per_zip, mode } = body;

    if (!zip_codes || !Array.isArray(zip_codes) || zip_codes.length === 0) {
      return NextResponse.json(
        { error: "zip_codes must be a non-empty array" },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Supabase admin client not configured" },
        { status: 500 }
      );
    }

    // Generate unique run_id
    let run_id = "";
    let runError: any;
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");
      const milliseconds = String(now.getMilliseconds()).padStart(3, "0");
      const randomSuffix =
        attempts > 0
          ? `_${Math.floor(Math.random() * 1000)
              .toString()
              .padStart(3, "0")}`
          : "";
      run_id = `${year}${month}${day}_${hours}${minutes}${seconds}_${milliseconds}${randomSuffix}`;

      const result = await supabaseAdmin
        .from("runs")
        .insert({
          run_id,
          zip_codes,
          status: "pending",
          max_listings_per_zip: max_listings_per_zip || null,
          created_at: new Date().toISOString(),
          llc_id: sessionUser.llcId,
        })
        .select()
        .single();

      runError = result.error;
      if (!runError || !runError.message?.includes("duplicate key")) break;
      attempts++;
      await new Promise((r) => setTimeout(r, 100 * attempts));
    }

    if (runError) {
      return NextResponse.json(
        { error: `Failed to create run: ${runError.message}` },
        { status: 500 }
      );
    }

    // --- Fire-and-forget: spawn process and return immediately ---

    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL;
    const pythonBackendPath = process.env.PYTHON_BACKEND_PATH || "/api/scrape";

    if (pythonBackendUrl) {
      // Remote backend: fire HTTP call in background (don't await)
      let backendEndpoint: string;
      if (
        pythonBackendUrl.includes("/api/") ||
        pythonBackendUrl.endsWith("/")
      ) {
        backendEndpoint = pythonBackendUrl.endsWith("/")
          ? `${pythonBackendUrl}${pythonBackendPath.replace(/^\//, "")}`
          : pythonBackendUrl;
      } else {
        backendEndpoint = `${pythonBackendUrl}${pythonBackendPath}`;
      }

      fetch(backendEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip_codes, max_listings_per_zip, run_id, mode: mode || "full" }),
      }).catch((err) => {
        console.error(`[API] Background backend call failed:`, err);
        supabaseAdmin
          ?.from("runs")
          .update({ status: "failed", error_message: String(err) })
          .eq("run_id", run_id);
      });
    } else {
      // Local mode: spawn detached Python process
      const scraperPath = path.resolve(process.cwd(), "..", "scraper");
      const pythonCmd = process.env.PYTHON_CMD || "python3";
      const args = [
        "-m",
        "zillow_scrapper.cli",
        "--zips",
        zip_codes.join(","),
        "--output-dir",
        "data/runs",
        "--run-id",
        run_id,
      ];
      if (max_listings_per_zip) {
        args.push("--max-listings-per-zip", String(max_listings_per_zip));
      }
      if (mode && mode !== "full") {
        args.push("--mode", mode);
      }

      const homeDir = process.env.HOME || process.env.USERPROFILE || "";
      const pyenvPath = homeDir
        ? `${homeDir}/.pyenv/shims:${process.env.PATH}`
        : process.env.PATH;

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json(
          { error: "Supabase environment variables not configured" },
          { status: 500 }
        );
      }

      const child = spawn(pythonCmd, args, {
        cwd: scraperPath,
        env: {
          ...process.env,
          SUPABASE_URL: supabaseUrl,
          SUPABASE_SERVICE_ROLE_KEY: supabaseKey,
          PATH: pyenvPath || "/usr/local/bin:/usr/bin:/bin",
        },
        stdio: "ignore",
        detached: true,
      });

      // Detach so the process keeps running after the API response
      child.unref();

      child.on("error", (err) => {
        console.error(`[API] Spawn error for run ${run_id}:`, err);
        supabaseAdmin
          ?.from("runs")
          .update({
            status: "failed",
            error_message: `Failed to spawn: ${err.message}`,
          })
          .eq("run_id", run_id);
      });
    }

    // Return immediately with pending status
    return NextResponse.json({
      run_id,
      status: "pending",
      message: "Scrape started in background",
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Internal server error: ${errorMessage}` },
      { status: 500 }
    );
  }
}
