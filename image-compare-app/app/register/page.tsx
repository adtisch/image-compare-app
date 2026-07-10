"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    window.localStorage.removeItem("role");
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? "Registration failed. Please try again.");
        return;
      }

      window.localStorage.setItem("role", data.role);
      window.localStorage.setItem("username", username);
      router.push(data.role === "admin" ? "/admin" : "/compare");
    } catch {
      setError("Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-slate-100 to-blue-200 flex items-center justify-center px-6">
      <div className="bg-white/80 border border-stone-300 rounded-3xl shadow-2xl p-10 max-w-lg w-full text-center animate-fadeIn">
        <h1 className="text-4xl font-bold mb-4 text-stone-900 drop-shadow-sm">
          Create an account
        </h1>
        <p className="text-stone-700 mb-8">
          Choose a username and password to get started.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="text-left">
            <label className="block text-sm font-semibold text-stone-700 mb-2">
              Username
            </label>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-2xl border border-stone-300 bg-white/90 px-4 py-3 text-stone-900 shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Choose a username"
              autoComplete="username"
              required
            />
          </div>

          <div className="text-left">
            <label className="block text-sm font-semibold text-stone-700 mb-2">
              Password
            </label>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-stone-300 bg-white/90 px-4 py-3 text-stone-900 shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Choose a password"
              type="password"
              autoComplete="new-password"
              required
            />
          </div>

          <div className="text-left">
            <label className="block text-sm font-semibold text-stone-700 mb-2">
              Confirm password
            </label>
            <input
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-2xl border border-stone-300 bg-white/90 px-4 py-3 text-stone-900 shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Re-enter your password"
              type="password"
              autoComplete="new-password"
              required
            />
          </div>

          {error ? (
            <div className="text-sm text-red-600 font-medium">{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-3 text-lg font-semibold rounded-2xl shadow-lg
                       bg-gradient-to-r from-blue-500 to-sky-600 text-white
                       hover:scale-105 hover:shadow-xl transition-all duration-300 disabled:opacity-70 disabled:hover:scale-100"
          >
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="text-sm text-stone-700 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-600 font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
