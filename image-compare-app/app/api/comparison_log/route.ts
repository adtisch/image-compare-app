export const runtime = "nodejs";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

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

function loadComparisonLog(): ComparisonLogEntry[] {
  const filePath = path.resolve("./data/comparison_log.json");
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
  const entries = loadComparisonLog();

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
