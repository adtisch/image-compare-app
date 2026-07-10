export const runtime = "nodejs";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

type UserRecord = {
  username: string;
  password: string;
  role: "admin" | "user";
};

type UsersFile = {
  users: UserRecord[];
};

const USERS_PATH = path.resolve("./data/users.json");

function loadUsers(): UsersFile {
  if (!fs.existsSync(USERS_PATH)) {
    return { users: [] };
  }

  try {
    const raw = fs.readFileSync(USERS_PATH, "utf8");
    return JSON.parse(raw) as UsersFile;
  } catch (err) {
    console.error("Error reading users.json:", err);
    return { users: [] };
  }
}

export async function POST(req: Request) {
  try {
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

    const { users } = loadUsers();
    const exists = users.some((entry) => entry.username === trimmedUsername);

    if (exists) {
      return NextResponse.json(
        { error: "Username already taken." },
        { status: 409 },
      );
    }

    users.push({ username: trimmedUsername, password, role: "user" });
    fs.writeFileSync(USERS_PATH, JSON.stringify({ users }, null, 2));

    return NextResponse.json({ status: "ok", role: "user" });
  } catch (err) {
    console.error("Error processing registration:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
