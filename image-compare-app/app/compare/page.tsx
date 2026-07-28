"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Role = "admin" | "user";
type Pair = { imgA: string; imgB: string };
type PairsResponse = { similarPairs?: Pair[]; differentPairs?: Pair[] };

export default function Home() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [imgA, setImgA] = useState<string | null>(null);
  const [imgB, setImgB] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [answersCount, setAnswersCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const pairStartRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const leftTimerRef = useRef<number | null>(null);
  const babyTimerRef = useRef<number | null>(null);
  const bottleTimerRef = useRef<number | null>(null);
  const [showBaby, setShowBaby] = useState(false);
  const [showBottle, setShowBottle] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [pairIndex, setPairIndex] = useState(0);
  const [showReminder, setShowReminder] = useState(false);

  // Show the baby icon, then the left image shortly after, then the bottle
  // icon, then the right image shortly after. The response timer starts only
  // once the right image appears.
  function showPair(pair: Pair) {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
    }
    if (leftTimerRef.current !== null) {
      window.clearTimeout(leftTimerRef.current);
    }
    if (babyTimerRef.current !== null) {
      window.clearTimeout(babyTimerRef.current);
    }
    if (bottleTimerRef.current !== null) {
      window.clearTimeout(bottleTimerRef.current);
    }
    setImgA(null);
    setImgB(null);
    setShowBaby(false);
    setShowBottle(false);
    pairStartRef.current = null;
    babyTimerRef.current = window.setTimeout(() => {
      setShowBaby(true);
      babyTimerRef.current = null;
    }, 0);
    leftTimerRef.current = window.setTimeout(() => {
      setImgA(pair.imgA);
      leftTimerRef.current = null;
    }, 0);
    bottleTimerRef.current = window.setTimeout(() => {
      setShowBottle(true);
      bottleTimerRef.current = null;
    }, 0);
    revealTimerRef.current = window.setTimeout(() => {
      setImgB(pair.imgB);
      pairStartRef.current = performance.now();
      revealTimerRef.current = null;
    }, 0);
  }

  function shufflePairs(list: Pair[]) {
    const shuffled = [...list];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Fetch all possible pairs and start a new test
  async function loadTest() {
    setLoading(true);
    const res = await fetch("/api/pairs");
    const data = (await res.json()) as PairsResponse;
    const similarPairs = Array.isArray(data.similarPairs)
      ? data.similarPairs
      : [];
    const differentPairs = Array.isArray(data.differentPairs)
      ? data.differentPairs
      : [];
    const targetCount = 100;
    const selfPairCount = Math.max(1, Math.round(targetCount * 0.5));
    const baseCount = Math.max(0, targetCount - selfPairCount);
    const shuffledDifferent = shufflePairs(differentPairs);
    let selected = [...similarPairs];
    if (selected.length < baseCount) {
      selected = selected.concat(
        shuffledDifferent.slice(0, baseCount - selected.length),
      );
    } else if (selected.length > baseCount) {
      selected = selected.slice(0, baseCount);
    }
    const imagePool = [...similarPairs, ...differentPairs].flatMap((pair) => [
      pair.imgA,
      pair.imgB,
    ]);
    const selfPairs: Pair[] =
      imagePool.length === 0
        ? []
        : Array.from({ length: selfPairCount }, () => {
            const img =
              imagePool[Math.floor(Math.random() * imagePool.length)];
            return { imgA: img, imgB: img };
          });
    selected = shufflePairs([...selected, ...selfPairs]).slice(0, targetCount);
    setPairs(selected);
    setPairIndex(0);
    if (selected.length > 0) {
      showPair(selected[0]);
    } else {
      setImgA(null);
      setImgB(null);
    }
    setLoading(false);
  }

  // Submit rating 1–5
  async function submit(rating: number) {
    const now = performance.now();
    const durationMs =
      pairStartRef.current === null
        ? null
        : Math.max(0, Math.round(now - pairStartRef.current));
    await fetch("/api/submit_decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imgA,
        imgB,
        rating,
        timestamp: new Date().toISOString(),
        durationMs,
        username,
      }),
    });

    setAnswersCount((prev) => {
      const next = prev + 1;
      if (next >= 100 || next >= pairs.length) {
        setFinished(true);
        return next;
      }
      const nextPair = pairs[next];
      if (nextPair) {
        setPairIndex(next);
        showPair(nextPair);
      }
      return next;
    });
    setShowReminder(false);
  }

  useEffect(() => {
    if (started && !finished && pairs.length === 0) {
      loadTest();
    }
  }, [started, finished, pairs.length]);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
      }
      if (leftTimerRef.current !== null) {
        window.clearTimeout(leftTimerRef.current);
      }
      if (babyTimerRef.current !== null) {
        window.clearTimeout(babyTimerRef.current);
      }
      if (bottleTimerRef.current !== null) {
        window.clearTimeout(bottleTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!started || finished || loading || !imgA || !imgB) {
      setShowReminder(false);
      return;
    }
    setShowReminder(false);
    const timer = window.setTimeout(() => {
      setShowReminder(true);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [started, finished, loading, imgA, imgB]);

  useEffect(() => {
    const storedRole = window.localStorage.getItem("role");
    if (storedRole !== "admin" && storedRole !== "user") {
      window.localStorage.removeItem("role");
      router.replace("/login");
      return;
    }
    setRole(storedRole);
    setUsername(window.localStorage.getItem("username"));
    setAuthChecked(true);
  }, [router]);

  useEffect(() => {
    if (!started || finished) return;

    function handleKeydown(event: KeyboardEvent) {
      if (loading || !imgA || !imgB) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        submit(1);
      } else if (key === "d") {
        submit(0);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [started, finished, loading, imgA, imgB]);

  if (!authChecked) {
    return null;
  }

  // -----------------------------------------------------------
  // INTRO PAGE
  // -----------------------------------------------------------
  if (!started) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-sky-100 via-slate-100 to-blue-200 
                      flex flex-col items-center justify-center text-stone-800 px-6 text-center animate-fadeIn"
      >
        <h1 className="text-4xl font-bold mb-6 tracking-wide text-stone-900 drop-shadow-sm">
          Instructions
        </h1>

        <p className="text-lg text-stone-700 max-w-2xl mb-8 leading-relaxed">
          Try to decide whether the two images are the same or different as fast
          as possible. Click the on-screen buttons, or press <span className="font-semibold">s</span>{" "}
          for Same and <span className="font-semibold">d</span> for Different.
        </p>

        <button
          onClick={() => setStarted(true)}
          className="px-10 py-4 text-lg font-semibold rounded-2xl shadow-lg 
                     bg-gradient-to-r from-blue-500 to-sky-600 text-white 
                     hover:scale-105 hover:shadow-xl transition-all duration-300"
        >
          Start
        </button>
      </div>
    );
  }

  if (finished) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-sky-100 via-slate-100 to-blue-200 
                      flex flex-col items-center justify-center text-stone-800 px-6 text-center animate-fadeIn"
      >
        <h1 className="text-5xl font-bold mb-6 tracking-wide text-stone-900 drop-shadow-sm">
          Thank you for your answer
        </h1>
        <button
          onClick={() => {
            setAnswersCount(0);
            setFinished(false);
            if (role === "admin") {
              router.push("/admin");
              return;
            }
            setPairs([]);
            setPairIndex(0);
            setStarted(true);
          }}
          className="px-10 py-4 text-lg font-semibold rounded-2xl shadow-lg 
                     bg-gradient-to-r from-blue-500 to-sky-600 text-white 
                     hover:scale-105 hover:shadow-xl transition-all duration-300"
        >
          Start again
        </button>
      </div>
    );
  }

  // -----------------------------------------------------------
  // MAIN IMAGE COMPARISON PAGE
  // -----------------------------------------------------------
  return (
    <div
      className="min-h-screen bg-gradient-to-br from-sky-100 via-slate-100 to-blue-200 
                    flex flex-col items-center justify-center text-stone-900 px-4 animate-fadeIn"
    >
      {showReminder && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-white/90 backdrop-blur-sm text-stone-900 border border-stone-200 shadow-lg rounded-full px-6 py-3 text-base font-semibold">
            Please choose Same or Different
          </div>
        </div>
      )}
      <h1 className="text-3xl sm:text-4xl font-semibold mb-8 sm:mb-10 tracking-wide text-stone-900 drop-shadow-sm">
        Image Comparison
      </h1>

      <div className="flex flex-col sm:flex-row gap-[3.75rem] sm:gap-36 items-center">
        {/* Baby, with the left comparison image overlaid on its t-shirt */}
        <div
          className="relative w-[15rem] h-[30rem] sm:w-[18rem] sm:h-[36rem] bg-white/80 backdrop-blur-sm border border-stone-300
                     rounded-2xl overflow-hidden shadow-xl"
        >
          {!loading && showBaby ? (
            <img
              src="/baby.svg"
              alt="Baby"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="animate-pulse w-full h-full bg-stone-200" />
          )}
          {!loading && showBaby && imgA && (
            <img
              src={imgA}
              className="absolute left-1/2 top-[54%] -translate-x-1/2 -translate-y-1/2
                         w-[32%] h-[16%] object-cover rounded-md shadow-md
                         transition-transform duration-300 hover:scale-105"
            />
          )}
        </div>

        {/* Bottle, with the right comparison image overlaid on its middle */}
        <div
          className="relative w-[15rem] h-[30rem] sm:w-[18rem] sm:h-[36rem] bg-white/80 backdrop-blur-sm border border-stone-300
                     rounded-2xl overflow-hidden shadow-xl"
        >
          {!loading && showBottle ? (
            <img
              src="/bottle.svg"
              alt="Bottle"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="animate-pulse w-full h-full bg-stone-200" />
          )}
          {!loading && showBottle && imgB && (
            <img
              src={imgB}
              className="absolute left-1/2 top-[59%] -translate-x-1/2 -translate-y-1/2
                         w-[32%] h-[16%] object-cover rounded-md shadow-md
                         transition-transform duration-300 hover:scale-105"
            />
          )}
        </div>
      </div>

      {/* -------------------------------------------------------
          TWO-OPTION RATING BUTTONS
          ------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mt-8 sm:mt-10 w-full max-w-xl">
        <button
          onClick={() => submit(1)}
          className="px-6 py-4 text-lg font-semibold rounded-2xl text-white
                     bg-gradient-to-r from-emerald-500 to-emerald-700
                     hover:scale-105 shadow-md hover:shadow-lg transition-all duration-300"
        >
          Same
        </button>

        <button
          onClick={() => submit(0)}
          className="px-6 py-4 text-lg font-semibold rounded-2xl text-white
                     bg-gradient-to-r from-red-500 to-red-700
                     hover:scale-105 shadow-md hover:shadow-lg transition-all duration-300"
        >
          Different
        </button>
      </div>
    </div>
  );
}
