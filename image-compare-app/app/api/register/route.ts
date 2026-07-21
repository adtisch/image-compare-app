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

    const trimmedUsername = username?.trim();

    if (!trimmedUsername || !password) {
      return NextResponse.json(
        { error: "Username and password are required." },
        { status: 400 },
      );
    }

    try {
      await query(
        `INSERT INTO users (username, password, role) VALUES ($1, $2, 'user')`,
        [trimmedUsername, password],
      );
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: string }).code === "23505"
      ) {
        return NextResponse.json(
          { error: "Username already taken." },
          { status: 409 },
        );
      }
      throw err;
    }

    return NextResponse.json({ status: "ok", role: "user" });
  } catch (err) {
    console.error("Error processing registration:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
