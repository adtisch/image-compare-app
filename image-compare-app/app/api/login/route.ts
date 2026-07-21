export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { ensureSchema, query } from "@/lib/db";

export async function POST(req: Request) {
  try {
    await ensureSchema();

    const body = await req.json();
    const { username, password } = body as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 400 },
      );
    }

    const result = await query<{ role: "admin" | "user" }>(
      "SELECT role FROM users WHERE username = $1 AND password = $2",
      [username, password],
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    return NextResponse.json({ status: "ok", role: result.rows[0].role });
  } catch (err) {
    console.error("Error processing login:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
