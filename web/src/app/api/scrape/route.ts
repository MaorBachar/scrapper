import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "node:path";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { zip_codes, max_listings_per_zip } = body;

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

    // Generate run_id (format: YYYYMMDD_HHMMSS_mmm to ensure uniqueness)
    // Include milliseconds to avoid collisions when multiple requests come in the same second
    let run_id: string = "";
    let runData: any;
    let runError: any;
    let attempts = 0;
    const maxAttempts = 5;

    // Retry logic to handle duplicate key errors
    while (attempts < maxAttempts) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");
      const milliseconds = String(now.getMilliseconds()).padStart(3, "0");
      
      // Add random component if retrying to ensure uniqueness
      const randomSuffix = attempts > 0 ? `_${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}` : "";
      run_id = `${year}${month}${day}_${hours}${minutes}${seconds}_${milliseconds}${randomSuffix}`;

      // Create run record in Supabase
      const result = await supabaseAdmin
        .from("runs")
        .insert({
          run_id,
          zip_codes,
          status: "pending",
          max_listings_per_zip: max_listings_per_zip || null,
          created_at: now.toISOString(),
        })
        .select()
        .single();

      runData = result.data;
      runError = result.error;

      // If no error or error is not a duplicate key, break
      if (!runError || !runError.message?.includes("duplicate key")) {
        break;
      }

      // If duplicate key error, wait a bit and retry
      attempts++;
      console.warn(`[API] Duplicate run_id detected (${run_id}), retrying (attempt ${attempts}/${maxAttempts})...`);
      await new Promise(resolve => setTimeout(resolve, 100 * attempts)); // Exponential backoff
    }

    if (runError) {
      console.error("Failed to create run:", runError);
      return NextResponse.json(
        { error: `Failed to create run: ${runError.message}` },
        { status: 500 }
      );
    }

    // Ensure run_id was assigned (TypeScript check)
    if (!run_id) {
      return NextResponse.json(
        { error: "Failed to generate run_id" },
        { status: 500 }
      );
    }

    // Check if Python backend URL is configured (for production)
    // Default: use local Python process if PYTHON_BACKEND_URL is not set
    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL;
    
    if (pythonBackendUrl) {
      // Call Python backend via HTTP (production mode)
      // If URL already includes path, use it as-is; otherwise append /api/scrape
      const backendEndpoint = pythonBackendUrl.includes('/api/') 
        ? pythonBackendUrl 
        : `${pythonBackendUrl}/api/scrape`;
      
      console.log(`[API] Calling Python backend at: ${backendEndpoint}`);
      
      try {
        const backendResponse = await fetch(backendEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            zip_codes,
            max_listings_per_zip,
            run_id,
          }),
        });

        if (!backendResponse.ok) {
          let errorMessage = `Backend returned ${backendResponse.status}`;
          
          if (backendResponse.status === 405) {
            const allowedMethods = backendResponse.headers.get('Allow');
            errorMessage = `Method Not Allowed. ${allowedMethods ? `Allowed methods: ${allowedMethods}` : 'The endpoint may not accept POST requests.'}`;
          } else {
            const errorData = await backendResponse.json().catch(() => null);
            if (errorData?.error) {
              errorMessage = errorData.error;
            }
          }
          
          throw new Error(errorMessage);
        }

        const backendData = await backendResponse.json();
        console.log(`[API] Python backend response:`, backendData);
        
        // Return immediately - backend will update status in Supabase
        return NextResponse.json({
          run_id,
          status: "pending",
          message: "Scraper started via backend",
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[API] Failed to call Python backend:`, errorMessage);
        
        // Update status to failed
        if (supabaseAdmin) {
          await supabaseAdmin
            .from("runs")
            .update({
              status: "failed",
              error_message: `Failed to call Python backend: ${errorMessage}`,
            })
            .eq("run_id", run_id);
        }
        
        return NextResponse.json(
          { error: `Failed to start scraper: ${errorMessage}` },
          { status: 500 }
        );
      }
    }

    // Default: Spawn Python scraper process locally (when PYTHON_BACKEND_URL is not set)
    console.log(`[API] Using local Python process (PYTHON_BACKEND_URL not set)`);
    const scraperPath = path.resolve(process.cwd(), "..", "scraper");
    // Use python3 command - ensure PATH includes pyenv shims
    const pythonCmd = process.env.PYTHON_CMD || "python3";
    const zipsArg = zip_codes.join(",");
    const args = [
      "-m",
      "zillow_scrapper.cli",
      "--zips",
      zipsArg,
      "--output-dir",
      "data/runs",
      "--run-id",
      run_id,
    ];

    if (max_listings_per_zip) {
      args.push("--max-listings-per-zip", String(max_listings_per_zip));
    }

    // Set environment variables for Supabase
    // Include PATH with pyenv shims to ensure python3 is found
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    const pyenvPath = homeDir ? `${homeDir}/.pyenv/shims:${process.env.PATH}` : process.env.PATH;
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    console.log(`[API] Passing Supabase env vars: URL=${supabaseUrl ? "SET" : "NOT SET"}, KEY=${supabaseKey ? "SET" : "NOT SET"}`);
    if (!supabaseUrl || !supabaseKey) {
      console.error(`[API ERROR] Missing Supabase env vars! URL=${supabaseUrl}, KEY=${supabaseKey ? "SET" : "NOT SET"}`);
      return NextResponse.json(
        { error: "Supabase environment variables not configured" },
        { status: 500 }
      );
    }
    
    const env = {
      ...process.env,
      SUPABASE_URL: supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: supabaseKey,
      PATH: pyenvPath || "/usr/local/bin:/usr/bin:/bin",
    };
    
    // Log what we're actually passing (without exposing the key)
    console.log(`[API] Environment: SUPABASE_URL=${supabaseUrl}, SUPABASE_SERVICE_ROLE_KEY=${supabaseKey.substring(0, 10)}...`);

    console.log(`[API] Spawning Python process: ${pythonCmd} ${args.join(" ")}`);
    console.log(`[API] Working directory: ${scraperPath}`);
    
    const child = spawn(pythonCmd, args, {
      cwd: scraperPath,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Set a timeout to mark as failed if process doesn't start updating status
    const statusTimeout = setTimeout(async () => {
      if (!supabaseAdmin) return;
      
      // Check if status is still pending after 30 seconds
      const { data: runCheck } = await supabaseAdmin
        .from("runs")
        .select("status")
        .eq("run_id", run_id)
        .single();
      
      if (runCheck?.status === "pending") {
        console.error(`[API] Run ${run_id} still pending after 30s, marking as failed`);
        await supabaseAdmin
          .from("runs")
          .update({
            status: "failed",
            error_message: "Process started but did not update status within 30 seconds. Check server logs.",
          })
          .eq("run_id", run_id);
      }
    }, 30000);

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
      const output = data.toString();
      console.log(`[scraper stdout] ${output}`);
      // Also log Supabase-related messages prominently
      if (output.includes("Supabase") || output.includes("saved") || output.includes("Saved")) {
        console.log(`[SUPABASE] ${output}`);
      }
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
      const output = data.toString();
      console.error(`[scraper stderr] ${output}`);
      // Also log Supabase-related errors prominently (but not generic warnings)
      if (output.includes("Supabase") && (output.includes("Error") || output.includes("Failed") || output.includes("error"))) {
        console.error(`[SUPABASE ERROR] ${output}`);
      }
    });

    child.on("close", async (code) => {
      clearTimeout(statusTimeout);
      console.log(`[API] Process closed for run ${run_id} with exit code ${code}`);
      console.log(`[API] stdout length: ${stdout.length}, stderr length: ${stderr.length}`);
      
      if (!supabaseAdmin) {
        console.error(`[API] Supabase admin client not available, cannot update status for run ${run_id}`);
        return;
      }
      
      if (code === 0) {
        // Update status to completed
        const { error } = await supabaseAdmin
          .from("runs")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("run_id", run_id);
        if (error) {
          console.error(`[API] Failed to update status to completed: ${error.message}`);
        } else {
          console.log(`[API] Scraper completed successfully for run ${run_id}`);
        }
      } else {
        // Update status to failed
        const errorMsg = stderr.length > 0 
          ? `Process exited with code ${code}. stderr: ${stderr.slice(-500)}`
          : `Process exited with code ${code}. stdout: ${stdout.slice(-500)}`;
        const { error } = await supabaseAdmin
          .from("runs")
          .update({
            status: "failed",
            error_message: errorMsg,
          })
          .eq("run_id", run_id);
        if (error) {
          console.error(`[API] Failed to update status to failed: ${error.message}`);
        } else {
          console.error(`[API] Scraper failed for run ${run_id} with code ${code}`);
        }
      }
    });

    child.on("error", async (error) => {
      console.error(`[API] Process spawn error for run ${run_id}:`, error);
      if (!supabaseAdmin) {
        console.error(`[API] Supabase admin client not available, cannot update status for run ${run_id}`);
        return;
      }
      const { error: updateError } = await supabaseAdmin
        .from("runs")
        .update({
          status: "failed",
          error_message: `Failed to spawn process: ${error.message}`,
        })
        .eq("run_id", run_id);
      if (updateError) {
        console.error(`[API] Failed to update status after spawn error: ${updateError.message}`);
      }
    });

    // Return immediately with run_id
    return NextResponse.json({
      run_id,
      status: "pending",
      message: "Scraper started",
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in scrape endpoint:", error);
    return NextResponse.json(
      { error: `Internal server error: ${errorMessage}` },
      { status: 500 }
    );
  }
}
