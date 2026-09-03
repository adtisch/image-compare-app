import Link from "next/link";
import ScoresAuthGate from "./AuthGate";
import { ensureSchema, query } from "@/lib/db";

// Scores change on every submission; skip static prerendering so this page
// always reflects the live DB instead of a build-time (or stale) snapshot.
export const dynamic = "force-dynamic";

type ScoreEntry = {
  total: number;
  votes: number;
  totalTimeMs?: number;
  timeVotes?: number;
  avgTimeMs?: number;
};

type ScoresFile = {
  imageScores: Record<string, ScoreEntry>;
  pairScores: Record<string, ScoreEntry>;
};

async function loadScores(): Promise<ScoresFile> {
  await ensureSchema();

  const pairRows = await query<{
    pair_key: string;
    total: number;
    votes: number;
    total_time_ms: number;
    time_votes: number;
  }>(
    "SELECT pair_key, total, votes, total_time_ms, time_votes FROM pair_scores",
  );

  const pairScores: ScoresFile["pairScores"] = {};
  for (const row of pairRows.rows) {
    pairScores[row.pair_key] = {
      total: row.total,
      votes: row.votes,
      totalTimeMs: row.total_time_ms,
      timeVotes: row.time_votes,
      avgTimeMs:
        row.time_votes > 0 ? Math.round(row.total_time_ms / row.time_votes) : 0,
    };
  }

  return { imageScores: {}, pairScores };
}

function parsePairKey(key: string) {
  const parts = key.split("__");
  const getFilename = (value: string) => {
    const trimmed = value.trim();
    const base = trimmed.split("/").pop() || trimmed;
    try {
      return decodeURIComponent(base);
    } catch {
      return base;
    }
  };
  return { imgA: getFilename(parts[0] || ""), imgB: getFilename(parts[1] || "") };
}

export default async function ScoresPage() {
  const { pairScores } = await loadScores();
  const entries = Object.entries(pairScores);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-slate-100 to-blue-200 px-6 py-10 text-stone-900">
      <ScoresAuthGate />
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-semibold tracking-wide text-stone-900 drop-shadow-sm">
            Pair Scores
          </h1>
          <div className="flex items-center gap-3">
            <a
              href="/api/scores?format=json"
              className="px-4 py-2 text-sm font-semibold rounded-xl shadow-md
                         bg-white/90 text-stone-900 border border-stone-300
                         hover:shadow-lg hover:scale-105 transition-all duration-300"
            >
              Export JSON
            </a>
            <a
              href="/api/scores?format=csv"
              className="px-4 py-2 text-sm font-semibold rounded-xl shadow-md
                         bg-white/90 text-stone-900 border border-stone-300
                         hover:shadow-lg hover:scale-105 transition-all duration-300"
            >
              Export CSV
            </a>
            <a
              href="/api/comparison_log?format=json"
              className="px-4 py-2 text-sm font-semibold rounded-xl shadow-md
                         bg-white/90 text-stone-900 border border-stone-300
                         hover:shadow-lg hover:scale-105 transition-all duration-300"
            >
              Export Log JSON
            </a>
            <a
              href="/api/comparison_log?format=csv"
              className="px-4 py-2 text-sm font-semibold rounded-xl shadow-md
                         bg-white/90 text-stone-900 border border-stone-300
                         hover:shadow-lg hover:scale-105 transition-all duration-300"
            >
              Export Log CSV
            </a>
            <Link
              href="/admin"
              className="px-4 py-2 text-sm font-semibold rounded-xl shadow-md
                         bg-white/90 text-stone-900 border border-stone-300
                         hover:shadow-lg hover:scale-105 transition-all duration-300"
            >
              Back to menu
            </Link>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="bg-white/80 border border-stone-300 rounded-2xl p-6 shadow-lg">
            No scores yet.
          </div>
        ) : (
          <div className="grid gap-4">
            {entries.map(([key, score]) => {
              const { imgA, imgB } = parsePairKey(key);
              const avg =
                score.votes > 0 ? (score.total / score.votes).toFixed(2) : "0";
              const timeVotes = score.timeVotes || 0;
              const avgTimeMs =
                typeof score.avgTimeMs === "number"
                  ? score.avgTimeMs
                  : timeVotes > 0 && typeof score.totalTimeMs === "number"
                    ? Math.round(score.totalTimeMs / timeVotes)
                    : 0;

              return (
                <div
                  key={key}
                  className="bg-white/80 border border-stone-300 rounded-2xl p-5 shadow-lg"
                >
                  <div className="text-sm text-stone-600 mb-2">Pair</div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="font-medium text-stone-900 break-all">
                      {imgA} <span className="text-stone-500">vs</span> {imgB}
                    </div>
                    <div className="text-sm text-stone-700">
                      Avg: {avg} | Votes: {score.votes} | Total: {score.total} |
                      Avg time: {avgTimeMs} ms
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
