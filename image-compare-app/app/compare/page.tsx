"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Role = "admin" | "user";
type Pair = { imgA: string; imgB: string };
type PairsResponse = { similarPairs?: Pair[]; differentPairs?: Pair[] };

// Number of untracked practice comparisons shown before real data collection
// begins. These are not sent to /api/submit_decision.
const TRAINING_COUNT = 5;

// How long the response timer bar takes to drain, in seconds, before the
// "Please make a selection!" prompt appears.
const TIMER_SECONDS = 3;

// How long, once the prompt appears, it takes to grow until it fills the
// screen.
const OVERDUE_GROW_SECONDS = 3;

// Never let a slow or broken image file stall a trial indefinitely.
const PRELOAD_TIMEOUT_MS = 1000;

// Files already fetched *and decoded* by the browser. Pictographs are held
// hidden until they are decoded so a trial never opens on a half-painted
// image, and so the response clock starts at true visual onset.
const decodedImages = new Set<string>();

function preloadImage(src: string): Promise<void> {
  if (decodedImages.has(src)) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new window.Image();
    const done = () => {
      decodedImages.add(src);
      resolve();
    };
    // decode() resolves only once the bitmap is ready to paint, which is the
    // guarantee we need; onload alone can still leave decoding to do.
    if (typeof img.decode === "function") {
      img.src = src;
      img.decode().then(done, done);
    } else {
      img.onload = done;
      img.onerror = done;
      img.src = src;
    }
  });
}

function preloadPair(pair: Pair): Promise<void> {
  return Promise.race([
    Promise.all([preloadImage(pair.imgA), preloadImage(pair.imgB)]).then(
      () => undefined,
    ),
    new Promise<void>((resolve) =>
      window.setTimeout(resolve, PRELOAD_TIMEOUT_MS),
    ),
  ]);
}

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
  const overdueTimerRef = useRef<number | null>(null);
  const revealTokenRef = useRef(0);
  // State mirror of revealTokenRef. Every trial bumps it, so the reveal
  // effect below re-runs once per trial even when the new pair's URLs are
  // identical to the previous pair's (a ref change alone would not re-run
  // an effect, and identical URLs leave imgA/imgB unchanged).
  const [trialKey, setTrialKey] = useState(0);
  // The flash is driven imperatively through these refs rather than through
  // React state: a state-driven show/hide 50 ms apart can be committed by
  // React without the browser ever painting the visible frame, which makes
  // the pictographs seem never to appear at all.
  const imgARef = useRef<HTMLImageElement | null>(null);
  const imgBRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  // Authoritative trial counters. Kept in refs (mirrored into state purely for
  // rendering) so advancing never depends on a stale closure.
  const answeredRef = useRef(0);
  const trainingIndexRef = useRef(0);
  const answeringRef = useRef(false);
  const [showBaby, setShowBaby] = useState(false);
  const [showBottle, setShowBottle] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [pairIndex, setPairIndex] = useState(0);
  const [timerKey, setTimerKey] = useState(0);
  const [selectionOverdue, setSelectionOverdue] = useState(false);
  const [trainingPairs, setTrainingPairs] = useState<Pair[]>([]);
  const [trainingIndex, setTrainingIndex] = useState(0);
  const [trainingComplete, setTrainingComplete] = useState(false);

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
    if (overdueTimerRef.current !== null) {
      window.clearTimeout(overdueTimerRef.current);
      overdueTimerRef.current = null;
    }
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Hide immediately so the outgoing pair can't linger into the next trial.
    if (imgARef.current) imgARef.current.style.visibility = "hidden";
    if (imgBRef.current) imgBRef.current.style.visibility = "hidden";
    setImgA(null);
    setImgB(null);
    setShowBaby(false);
    setShowBottle(false);
    setSelectionOverdue(false);
    pairStartRef.current = null;
    revealTokenRef.current += 1;
    setTrialKey(revealTokenRef.current);
    answeringRef.current = false;
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
      revealTimerRef.current = null;
      // Both <img> tags mount hidden. The flash itself is run by the effect
      // below, once React has committed them and the refs are attached.
    }, 0);
  }

  // Reveal both pictographs and leave them up for the rest of the trial —
  // they are only cleared when the next pair starts. The response clock and
  // the countdown are anchored to the frame that actually paints them, so
  // reaction times are measured from true visual onset.
  function revealPictographs(token: number) {
    const a = imgARef.current;
    const b = imgBRef.current;
    if (!a || !b) return;

    a.style.visibility = "visible";
    b.style.visibility = "visible";

    // First rAF runs before the next paint; the second runs after it, so by
    // then the pictographs have genuinely reached the screen.
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        if (revealTokenRef.current !== token) return;

        pairStartRef.current = performance.now();
        setTimerKey((prev) => prev + 1);
        overdueTimerRef.current = window.setTimeout(() => {
          setSelectionOverdue(true);
          overdueTimerRef.current = null;
        }, TIMER_SECONDS * 1000);
      });
    });
  }

  function shufflePairs(list: Pair[]) {
    const shuffled = [...list];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function samePair(a: Pair, b: Pair) {
    return a.imgA === b.imgA && a.imgB === b.imgB;
  }

  // Reorders a list so no trial repeats the identical pair of its
  // predecessor. Showing the same pair twice in a row leaves imgA/imgB state
  // unchanged between trials, so the reveal effect never re-runs, the
  // pictographs never appear, and nothing gets recorded. Repeats only arise
  // from the randomly drawn self-pairs (the server's lists are unique), so a
  // repeat is swapped with the nearest later trial that fits both of its
  // neighbours; the rest of the order is left untouched.
  function separateRepeats(list: Pair[]) {
    const result = [...list];
    const fits = (index: number) => {
      const prev = result[index - 1];
      const next = result[index + 1];
      return (
        (!prev || !samePair(result[index], prev)) &&
        (!next || !samePair(result[index], next))
      );
    };
    for (let i = 1; i < result.length; i += 1) {
      if (!samePair(result[i], result[i - 1])) continue;
      for (let step = 1; step < result.length; step += 1) {
        // Try later positions first, then wrap around to earlier ones.
        const j = (i + step) % result.length;
        [result[i], result[j]] = [result[j], result[i]];
        if (fits(i) && fits(j)) break;
        [result[i], result[j]] = [result[j], result[i]];
      }
    }
    return result;
  }

  // Zips two (already-shuffled) lists into strict alternation — a, b, a, b,
  // … — so the user sees Same and Different trials back-to-back rather than
  // whatever streaks a plain random shuffle happens to produce. Falls back
  // to whichever list still has items once the other runs out.
  function alternatePairs(first: Pair[], second: Pair[]) {
    const result: Pair[] = [];
    const maxLength = Math.max(first.length, second.length);
    for (let i = 0; i < maxLength; i += 1) {
      if (first[i]) result.push(first[i]);
      if (second[i]) result.push(second[i]);
    }
    return result;
  }

  // Fetch a handful of pairs for an untracked practice round. Nothing from
  // this round is sent to the server. Same and Different trials strictly
  // alternate so the user is guaranteed to practice both before data
  // collection begins (unlike the real test, which randomizes order).
  async function loadTraining() {
    setLoading(true);
    const res = await fetch("/api/pairs");
    const data = (await res.json()) as PairsResponse;
    const similarPairs = Array.isArray(data.similarPairs)
      ? data.similarPairs
      : [];
    const differentPairs = Array.isArray(data.differentPairs)
      ? data.differentPairs
      : [];
    const imagePool = [...similarPairs, ...differentPairs].flatMap((pair) => [
      pair.imgA,
      pair.imgB,
    ]);
    const sameCount = Math.ceil(TRAINING_COUNT / 2);
    const differentCount = TRAINING_COUNT - sameCount;
    const differentTrials = shufflePairs([
      ...similarPairs,
      ...differentPairs,
    ]).slice(0, differentCount);
    const sameTrials: Pair[] =
      imagePool.length === 0
        ? []
        : Array.from({ length: sameCount }, () => {
            const img =
              imagePool[Math.floor(Math.random() * imagePool.length)];
            return { imgA: img, imgB: img };
          });
    const selected = separateRepeats(
      (Math.random() < 0.5
        ? alternatePairs(sameTrials, differentTrials)
        : alternatePairs(differentTrials, sameTrials)
      ).slice(0, TRAINING_COUNT),
    );
    setTrainingPairs(selected);
    setTrainingIndex(0);
    trainingIndexRef.current = 0;
    // Warm every upcoming trial's images so later flashes are instant.
    selected.forEach((pair) => void preloadPair(pair));
    if (selected.length > 0) {
      showPair(selected[0]);
    } else {
      setImgA(null);
      setImgB(null);
    }
    setLoading(false);
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
    // Random order for the real data-collection trials (unlike the
    // practice round, which strictly alternates Same/Different).
    selected = separateRepeats(
      shufflePairs([...selected, ...selfPairs]).slice(0, targetCount),
    );
    setPairs(selected);
    setPairIndex(0);
    setAnswersCount(0);
    answeredRef.current = 0;
    // Warm every upcoming trial's images so later flashes are instant.
    selected.forEach((pair) => void preloadPair(pair));
    if (selected.length > 0) {
      showPair(selected[0]);
    } else {
      setImgA(null);
      setImgB(null);
    }
    setLoading(false);
  }

  // Advance through the practice round without recording anything.
  // Counters live in refs and advancing happens outside any setState updater:
  // updaters must be pure, and React double-invokes them in development, which
  // would otherwise start two overlapping trials at once.
  function submitTraining() {
    const next = trainingIndexRef.current + 1;
    trainingIndexRef.current = next;
    setTrainingIndex(next);
    if (next >= trainingPairs.length) {
      setTrainingComplete(true);
      return;
    }
    const nextPair = trainingPairs[next];
    if (nextPair) {
      showPair(nextPair);
    }
  }

  // Submit rating 1–5
  async function submit(rating: number) {
    // One answer per trial — the POST below is async, so without this a quick
    // double press could record twice and skip a pair.
    if (answeringRef.current) return;
    answeringRef.current = true;
    if (overdueTimerRef.current !== null) {
      window.clearTimeout(overdueTimerRef.current);
      overdueTimerRef.current = null;
    }
    if (!trainingComplete) {
      submitTraining();
      return;
    }
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

    const next = answeredRef.current + 1;
    answeredRef.current = next;
    setAnswersCount(next);
    if (next >= 100 || next >= pairs.length) {
      setFinished(true);
      return;
    }
    const nextPair = pairs[next];
    if (nextPair) {
      setPairIndex(next);
      showPair(nextPair);
    }
  }

  // Once both pictographs are mounted (and therefore their refs attached),
  // wait for the browser to have them decoded and then reveal them. Running
  // this from an effect guarantees the DOM nodes exist before we touch them;
  // showBaby/showBottle are in the guard because the <img> tags only render
  // once those are true. trialKey is a dependency so a trial that shows the
  // very same URLs as the one before it still gets revealed: showPair's
  // null-then-value updates can be batched into a single render in which
  // imgA/imgB never appear to change.
  useEffect(() => {
    if (loading || !imgA || !imgB || !showBaby || !showBottle) return;
    const token = revealTokenRef.current;
    let cancelled = false;
    preloadPair({ imgA, imgB }).then(() => {
      if (cancelled || revealTokenRef.current !== token) return;
      revealPictographs(token);
    });
    return () => {
      cancelled = true;
    };
  }, [trialKey, imgA, imgB, loading, showBaby, showBottle]);

  useEffect(() => {
    if (started && !trainingComplete && trainingPairs.length === 0) {
      loadTraining();
    }
  }, [started, trainingComplete, trainingPairs.length]);

  useEffect(() => {
    if (started && trainingComplete && !finished && pairs.length === 0) {
      loadTest();
    }
  }, [started, trainingComplete, finished, pairs.length]);

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
      if (overdueTimerRef.current !== null) {
        window.clearTimeout(overdueTimerRef.current);
      }
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

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

  const trialProgress =
    pairs.length > 0 ? Math.min(100, (answersCount / pairs.length) * 100) : 0;

  // Lets an admin bail out of the trial from any screen — intro, finished,
  // and mid-trial alike — instead of having to finish or reload.
  const adminMenuButton =
    role === "admin" ? (
      <button
        onClick={() => router.push("/admin")}
        className="fixed top-4 left-4 z-[60] px-4 py-2 text-sm font-semibold rounded-xl shadow-md
                   bg-white/90 text-stone-900 border border-stone-300
                   hover:shadow-lg hover:scale-105 transition-all duration-300"
      >
        ← Admin menu
      </button>
    ) : null;

  // -----------------------------------------------------------
  // INTRO PAGE
  // -----------------------------------------------------------
  if (!started) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-sky-100 via-slate-100 to-blue-200
                      flex flex-col items-center justify-center text-stone-800 px-6 text-center animate-fadeIn"
      >
        {adminMenuButton}
        <h1 className="text-4xl font-bold mb-6 tracking-wide text-stone-900 drop-shadow-sm">
          Instructions
        </h1>

        <p className="text-lg text-stone-700 max-w-2xl mb-8 leading-relaxed">
          Try to decide whether the two images are the same or different as fast
          as possible. Use the keyboard only: press <span className="font-semibold">s</span>{" "}
          for Same and <span className="font-semibold">d</span> for Different.
        </p>

        <p className="text-base text-stone-600 max-w-2xl mb-8 leading-relaxed">
          You&apos;ll start with {TRAINING_COUNT} practice comparisons to get
          familiar with the task. Those don&apos;t count &mdash; data
          collection begins right after.
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
        {adminMenuButton}
        <h1 className="text-5xl font-bold mb-6 tracking-wide text-stone-900 drop-shadow-sm">
          Thank you for your answer
        </h1>
        <button
          onClick={() => {
            setAnswersCount(0);
            answeredRef.current = 0;
            answeringRef.current = false;
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
      {adminMenuButton}
      {!loading && imgA && imgB && (
        <div className="fixed top-0 left-0 w-full h-2 bg-stone-300/60 z-50">
          <div
            key={timerKey}
            className="h-full bg-gradient-to-r from-sky-500 to-blue-600 animate-timerbar"
            style={{ animationDuration: `${TIMER_SECONDS}s` }}
          />
        </div>
      )}
      {trainingComplete && (
        <div className="fixed bottom-0 left-0 w-full h-2 bg-stone-300/60 z-50">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-indigo-600 transition-all duration-500 ease-out"
            style={{ width: `${trialProgress}%` }}
          />
        </div>
      )}
      {selectionOverdue && !loading && imgA && imgB && (
        <div className="fixed inset-0 z-50 flex items-center justify-center text-center pointer-events-none overflow-hidden">
          <p
            className="max-w-[10rem] sm:max-w-xs text-3xl sm:text-4xl font-extrabold text-red-600 drop-shadow-sm animate-growFill"
            style={{ animationDuration: `${OVERDUE_GROW_SECONDS}s` }}
          >
            Please make a selection!
          </p>
        </div>
      )}
      <h1 className="text-3xl sm:text-4xl font-semibold mb-2 tracking-wide text-stone-900 drop-shadow-sm">
        {trainingComplete ? "Image Comparison" : "Practice Round"}
      </h1>
      <p className="mb-6 sm:mb-8 text-sm font-medium text-stone-600">
        {trainingComplete
          ? "Your answers are now being recorded."
          : `Practice ${trainingIndex + 1} of ${trainingPairs.length} — not recorded`}
      </p>

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
              ref={imgARef}
              src={imgA}
              className="invisible absolute left-1/2 top-[54%] -translate-x-1/2 -translate-y-1/2
                         w-[22.4%] h-[11.2%] object-cover rounded-md shadow-md"
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
              ref={imgBRef}
              src={imgB}
              className="invisible absolute left-1/2 top-[59%] -translate-x-1/2 -translate-y-1/2
                         w-[22.4%] h-[11.2%] object-cover rounded-md shadow-md"
            />
          )}
        </div>
      </div>

      {/* -------------------------------------------------------
          KEYBOARD-ONLY RATING LEGEND — responses must come from the
          s / d keys (see the keydown handler above), so these are
          non-interactive indicators rather than clickable buttons.
          ------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mt-8 sm:mt-10 w-full max-w-xl">
        <div
          className="px-6 py-4 text-lg font-semibold rounded-2xl text-white text-center cursor-default select-none
                     bg-gradient-to-r from-emerald-500 to-emerald-700 shadow-md"
        >
          Same <span className="font-normal opacity-80">(press S)</span>
        </div>

        <div
          className="px-6 py-4 text-lg font-semibold rounded-2xl text-white text-center cursor-default select-none
                     bg-gradient-to-r from-red-500 to-red-700 shadow-md"
        >
          Different <span className="font-normal opacity-80">(press D)</span>
        </div>
      </div>
    </div>
  );
}
