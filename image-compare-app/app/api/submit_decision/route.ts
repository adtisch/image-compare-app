export const runtime = "nodejs";
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { ensureSchema, withTransaction } from "@/lib/db";

// One entry per individual comparison a user makes: which two images were
// shown, the ground-truth answer (Same iff imgA === imgB), what the user
// answered, whether that was correct, and how long they took.

function pairKey(imgA: string, imgB: string) {
  return [imgA, imgB].sort().join("__");
}

async function updateImageScore(
  client: PoolClient,
  image: string,
  rating: number,
) {
  await client.query(
    `INSERT INTO image_scores (image, total, votes)
     VALUES ($1, $2, 1)
     ON CONFLICT (image) DO UPDATE SET
       total = image_scores.total + EXCLUDED.total,
       votes = image_scores.votes + 1`,
    [image, rating],
  );
}

async function updatePairScore(
  client: PoolClient,
  imgA: string,
  imgB: string,
  rating: number,
  durationMs: number | null,
) {
  const key = pairKey(imgA, imgB);
  await client.query(
    `INSERT INTO pair_scores (pair_key, img_a, img_b, total, votes, total_time_ms, time_votes)
     VALUES ($1, $2, $3, $4, 1, $5, $6)
     ON CONFLICT (pair_key) DO UPDATE SET
       total = pair_scores.total + EXCLUDED.total,
       votes = pair_scores.votes + 1,
       total_time_ms = pair_scores.total_time_ms + EXCLUDED.total_time_ms,
       time_votes = pair_scores.time_votes + EXCLUDED.time_votes`,
    [key, imgA, imgB, rating, durationMs ?? 0, durationMs === null ? 0 : 1],
  );
}

async function updateUserScore(
  client: PoolClient,
  username: string,
  rating: number,
  durationMs: number | null,
  timestamp: string,
) {
  await client.query(
    `INSERT INTO user_scores (username, total, votes, total_time_ms, time_votes, last_answered_at)
     VALUES ($1, $2, 1, $3, $4, $5)
     ON CONFLICT (username) DO UPDATE SET
       total = user_scores.total + EXCLUDED.total,
       votes = user_scores.votes + 1,
       total_time_ms = user_scores.total_time_ms + EXCLUDED.total_time_ms,
       time_votes = user_scores.time_votes + EXCLUDED.time_votes,
       last_answered_at = EXCLUDED.last_answered_at`,
    [username, rating, durationMs ?? 0, durationMs === null ? 0 : 1, timestamp],
  );
}

export async function POST(req: Request) {
  try {
    await ensureSchema();

    const body = await req.json();
    const { imgA, imgB, rating, timestamp, durationMs, username } = body;
    const normalizedDurationMs =
      typeof durationMs === "number" && Number.isFinite(durationMs)
        ? Math.max(0, Math.round(durationMs))
        : null;
    const normalizedTimestamp =
      typeof timestamp === "string" ? timestamp : new Date().toISOString();

    if (!imgA || !imgB || typeof rating !== "number") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const normalizedUsername =
      typeof username === "string" && username.trim() ? username.trim() : null;

    // Ground truth: the pair is "Same" iff both images are the same file.
    const expected = imgA === imgB ? 1 : 0;
    const correct = rating === expected;

    await withTransaction(async (client) => {
      await updateImageScore(client, imgA, rating);
      await updateImageScore(client, imgB, rating);
      await updatePairScore(client, imgA, imgB, rating, normalizedDurationMs);
      if (normalizedUsername) {
        await updateUserScore(
          client,
          normalizedUsername,
          rating,
          normalizedDurationMs,
          normalizedTimestamp,
        );
      }
      await client.query(
        `INSERT INTO comparison_log
           (username, img_a, img_b, expected, rating, correct, duration_ms, "timestamp")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          normalizedUsername,
          imgA,
          imgB,
          expected,
          rating,
          correct,
          normalizedDurationMs,
          normalizedTimestamp,
        ],
      );
    });

    return NextResponse.json({
      status: "ok",
      received: body,
      correct,
    });
  } catch (err) {
    console.error("Error processing rating:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
