import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

function runsRoot(): string {
  // repoRoot/web -> repoRoot/scraper/data/runs
  return path.resolve(process.cwd(), "..", "scraper", "data", "runs");
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function GET() {
  const root = runsRoot();
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const runIds = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse();
    return NextResponse.json({ runIds });
  } catch (e: unknown) {
    return NextResponse.json(
      { runIds: [], error: `Failed to read runs directory: ${errMsg(e)}` },
      { status: 500 },
    );
  }
}

