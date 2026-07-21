export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { ensureSchema, query } from "@/lib/db";

type ScoreEntry = {
  total: number;
  votes: number;
  totalTimeMs: number;
  timeVotes: number;
  avgTimeMs: number;
};

type ScoresFile = {
  imageScores: Record<string, ScoreEntry>;
  pairScores: Record<string, ScoreEntry>;
  userScores: Record<string, ScoreEntry & { lastAnsweredAt: string }>;
};

function avgTimeMs(totalTimeMs: number, timeVotes: number) {
  return timeVotes > 0 ? Math.round(totalTimeMs / timeVotes) : 0;
}

async function loadScores(): Promise<ScoresFile> {
  await ensureSchema();

  const [imageRows, pairRows, userRows] = await Promise.all([
    query<{ image: string; total: number; votes: number }>(
      "SELECT image, total, votes FROM image_scores",
    ),
    query<{
      pair_key: string;
      total: number;
      votes: number;
      total_time_ms: number;
      time_votes: number;
    }>(
      "SELECT pair_key, total, votes, total_time_ms, time_votes FROM pair_scores",
    ),
    query<{
      username: string;
      total: number;
      votes: number;
      total_time_ms: number;
      time_votes: number;
      last_answered_at: Date | null;
    }>(
      "SELECT username, total, votes, total_time_ms, time_votes, last_answered_at FROM user_scores",
    ),
  ]);

  const imageScores: ScoresFile["imageScores"] = {};
  for (const row of imageRows.rows) {
    imageScores[row.image] = {
      total: row.total,
      votes: row.votes,
      totalTimeMs: 0,
      timeVotes: 0,
      avgTimeMs: 0,
    };
  }

  const pairScores: ScoresFile["pairScores"] = {};
  for (const row of pairRows.rows) {
    pairScores[row.pair_key] = {
      total: row.total,
      votes: row.votes,
      totalTimeMs: row.total_time_ms,
      timeVotes: row.time_votes,
      avgTimeMs: avgTimeMs(row.total_time_ms, row.time_votes),
    };
  }

  const userScores: ScoresFile["userScores"] = {};
  for (const row of userRows.rows) {
    userScores[row.username] = {
      total: row.total,
      votes: row.votes,
      totalTimeMs: row.total_time_ms,
      timeVotes: row.time_votes,
      avgTimeMs: avgTimeMs(row.total_time_ms, row.time_votes),
      lastAnsweredAt: row.last_answered_at
        ? row.last_answered_at.toISOString()
        : "",
    };
  }

  return { imageScores, pairScores, userScores };
}

function toCsv(scores: ScoresFile) {
  const header = "imgA,imgB,total,votes,avg,totalTimeMs,timeVotes,avgTimeMs";
  const rows = Object.entries(scores.pairScores).map(([key, score]) => {
    const [imgA, imgB] = key.split("__");
    const avg = score.votes > 0 ? score.total / score.votes : 0;
    return [
      imgA || "",
      imgB || "",
      String(score.total),
      String(score.votes),
      avg.toFixed(4),
      String(score.totalTimeMs),
      String(score.timeVotes),
      score.avgTimeMs.toFixed(2),
    ]
      .map((val) => `"${val.replaceAll(`"`, `""`)}"`)
      .join(",");
  });

  return [header, ...rows].join("\n");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const format = (searchParams.get("format") || "json").toLowerCase();
  const scores = await loadScores();

  if (format === "csv") {
    const csv = toCsv(scores);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="pair-scores.csv"',
      },
    });
  }

  return NextResponse.json(scores, {
    headers: {
      "Content-Disposition": 'attachment; filename="scores.json"',
    },
  });
}
