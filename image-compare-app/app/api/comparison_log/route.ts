export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { ensureSchema, query } from "@/lib/db";

type ComparisonLogEntry = {
  username: string | null;
  imgA: string;
  imgB: string;
  expected: number;
  rating: number;
  correct: boolean;
  durationMs: number | null;
  timestamp: string;
};

async function loadComparisonLog(): Promise<ComparisonLogEntry[]> {
  await ensureSchema();

  const result = await query<{
    username: string | null;
    img_a: string;
    img_b: string;
    expected: number;
    rating: number;
    correct: boolean;
    duration_ms: number | null;
    timestamp: Date;
  }>(
    `SELECT username, img_a, img_b, expected, rating, correct, duration_ms, "timestamp"
     FROM comparison_log
     ORDER BY id ASC`,
  );

  return result.rows.map((row) => ({
    username: row.username,
    imgA: row.img_a,
    imgB: row.img_b,
    expected: row.expected,
    rating: row.rating,
    correct: row.correct,
    durationMs: row.duration_ms,
    timestamp: row.timestamp.toISOString(),
  }));
}

function filename(value: string) {
  const base = value.trim().split("/").pop() || value;
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
}

function toCsv(entries: ComparisonLogEntry[]) {
  const header =
    "timestamp,username,imgA,imgB,expected,answer,correct,durationMs";
  const rows = entries.map((entry) =>
    [
      entry.timestamp,
      entry.username ?? "",
      filename(entry.imgA),
      filename(entry.imgB),
      entry.expected === 1 ? "Same" : "Different",
      entry.rating === 1 ? "Same" : "Different",
      entry.correct ? "true" : "false",
      entry.durationMs === null ? "" : String(entry.durationMs),
    ]
      .map((val) => `"${String(val).replaceAll(`"`, `""`)}"`)
      .join(","),
  );

  return [header, ...rows].join("\n");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const format = (searchParams.get("format") || "json").toLowerCase();
  const entries = await loadComparisonLog();

  if (format === "csv") {
    const csv = toCsv(entries);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="comparison-log.csv"',
      },
    });
  }

  return NextResponse.json(entries, {
    headers: {
      "Content-Disposition": 'attachment; filename="comparison-log.json"',
    },
  });
}
