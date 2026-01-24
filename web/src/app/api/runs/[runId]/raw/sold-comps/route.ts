import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

function runsRoot(): string {
  return path.resolve(process.cwd(), "..", "scraper", "data", "runs");
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const filePath = path.join(runsRoot(), runId, "sold_comps_raw.json");
  try {
    const contents = await fs.readFile(filePath, "utf-8");
    const json = JSON.parse(contents);
    return NextResponse.json(json);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: `Failed to read ${filePath}: ${errMsg(e)}` },
      { status: 404 },
    );
  }
}

