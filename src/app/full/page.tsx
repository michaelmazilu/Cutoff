"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VideoQuestion } from "../VideoQuestion";
import {
  getRandomPrompt,
  getRandomThreeVariableVideoPrompt,
  getRandomVideoInterviewPrompt,
} from "../prompts";
import { clampToMaxWords, countWords, formatTimeMMSS } from "../text";

const WRITTEN_TOTAL_SECONDS = 10 * 60;
const WORD_TARGET = 300;
const HARD_MAX_WORDS = 350;

const VIDEO_2_PREP_SECONDS = 2 * 60;
const VIDEO_2_RECORD_SECONDS = 2 * 60;
const VIDEO_3_PREP_SECONDS = 2 * 60;
const VIDEO_3_RECORD_SECONDS = 3 * 60;

type Section = "intro" | "written" | "video2" | "video3" | "summary";
type WrittenEndReason = "submitted" | "timeup" | null;

function stopTracks(stream: MediaStream | null) {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
}

export default function FullTestPage() {
  const [section, setSection] = useState<Section>("intro");
  const [writtenHelpOpen, setWrittenHelpOpen] = useState<boolean>(false);
  const [startingVideo2, setStartingVideo2] = useState<boolean>(false);

  const [writtenPrompt, setWrittenPrompt] = useState<string>("");
  const [videoPrompt2, setVideoPrompt2] = useState<string>("");
  const [videoPrompt3, setVideoPrompt3] = useState<string>("");

  const [responseText, setResponseText] = useState<string>("");
  const [writtenSecondsRemaining, setWrittenSecondsRemaining] = useState<number>(
    WRITTEN_TOTAL_SECONDS,
  );
  const [writtenIsRunning, setWrittenIsRunning] = useState<boolean>(false);
  const [writtenEndReason, setWrittenEndReason] =
    useState<WrittenEndReason>(null);

  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);

  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);

  const writtenDeadlineMsRef = useRef<number | null>(null);
  const writtenIntervalRef = useRef<number | null>(null);
  const writtenHasExpiredRef = useRef<boolean>(false);
  const writtenSecondsRemainingRef = useRef<number>(WRITTEN_TOTAL_SECONDS);

  useEffect(() => {
    videoStreamRef.current = videoStream;
  }, [videoStream]);

  const writtenWordCount = useMemo(
    () => countWords(responseText),
    [responseText],
  );

  const stopWrittenTimer = useCallback(() => {
    if (writtenIntervalRef.current == null) return;
    window.clearInterval(writtenIntervalRef.current);
    writtenIntervalRef.current = null;
  }, []);

  const clearCopyTimeout = useCallback(() => {
    if (copyTimeoutRef.current == null) return;
    window.clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = null;
  }, []);

  const endWrittenSession = useCallback(
    (reason: Exclude<WrittenEndReason, null>) => {
      const deadline = writtenDeadlineMsRef.current;
      const remainingNow =
        deadline == null
          ? writtenSecondsRemainingRef.current
          : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      const finalRemaining = reason === "timeup" ? 0 : remainingNow;

      stopWrittenTimer();
      setWrittenIsRunning(false);
      setWrittenEndReason(reason);
      setWrittenSecondsRemaining(finalRemaining);
      writtenSecondsRemainingRef.current = finalRemaining;
    },
    [stopWrittenTimer],
  );

  const reset = useCallback(() => {
    stopWrittenTimer();
    clearCopyTimeout();
    stopTracks(videoStreamRef.current);
    videoStreamRef.current = null;

    writtenDeadlineMsRef.current = null;
    writtenHasExpiredRef.current = false;
    writtenSecondsRemainingRef.current = WRITTEN_TOTAL_SECONDS;

    setSection("intro");
    setWrittenHelpOpen(false);
    setStartingVideo2(false);
    setWrittenPrompt("");
    setVideoPrompt2("");
    setVideoPrompt3("");
    setResponseText("");
    setWrittenSecondsRemaining(WRITTEN_TOTAL_SECONDS);
    setWrittenIsRunning(false);
    setWrittenEndReason(null);
    setCopyStatus(null);
    setVideoStream(null);
  }, [clearCopyTimeout, stopWrittenTimer]);

  const startFullTest = useCallback(() => {
    stopWrittenTimer();
    clearCopyTimeout();
    setWrittenHelpOpen(false);
    setStartingVideo2(false);

    stopTracks(videoStreamRef.current);
    videoStreamRef.current = null;

    const nextWritten = getRandomPrompt();
    const nextVideo2 = getRandomVideoInterviewPrompt();
    const nextVideo3 = getRandomThreeVariableVideoPrompt();

    setWrittenPrompt(nextWritten);
    setVideoPrompt2(nextVideo2);
    setVideoPrompt3(nextVideo3);
    setResponseText("");
    setCopyStatus(null);

    setWrittenSecondsRemaining(WRITTEN_TOTAL_SECONDS);
    writtenSecondsRemainingRef.current = WRITTEN_TOTAL_SECONDS;
    setWrittenEndReason(null);
    writtenHasExpiredRef.current = false;
    writtenDeadlineMsRef.current = Date.now() + WRITTEN_TOTAL_SECONDS * 1000;

    setVideoStream(null);

    setWrittenIsRunning(true);
    setSection("written");
  }, [clearCopyTimeout, stopWrittenTimer]);

  useEffect(() => {
    if (!writtenIsRunning) return;
    const deadline = writtenDeadlineMsRef.current;
    if (deadline == null) return;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      writtenSecondsRemainingRef.current = remaining;
      setWrittenSecondsRemaining(remaining);
      if (remaining === 0 && !writtenHasExpiredRef.current) {
        writtenHasExpiredRef.current = true;
        endWrittenSession("timeup");
      }
    };

    tick();
    writtenIntervalRef.current = window.setInterval(tick, 250);

    return () => {
      stopWrittenTimer();
    };
  }, [endWrittenSession, stopWrittenTimer, writtenIsRunning]);

  useEffect(() => {
    return () => {
      stopWrittenTimer();
      clearCopyTimeout();
      stopTracks(videoStreamRef.current);
    };
  }, [clearCopyTimeout, stopWrittenTimer]);

  function handleResponseChange(nextValue: string) {
    if (writtenEndReason) return;
    const nextWords = countWords(nextValue);
    if (nextWords <= HARD_MAX_WORDS) {
      setResponseText(nextValue);
      return;
    }
    setResponseText(clampToMaxWords(nextValue, HARD_MAX_WORDS));
  }

  async function copyResponse() {
    clearCopyTimeout();
    try {
      await navigator.clipboard.writeText(responseText);
      setCopyStatus("Copied.");
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopyStatus(null);
        copyTimeoutRef.current = null;
      }, 1500);
    } catch {
      setCopyStatus("Copy failed. Select and copy manually.");
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopyStatus(null);
        copyTimeoutRef.current = null;
      }, 2500);
    }
  }

  const ensureVideoStream = useCallback(async (): Promise<MediaStream | null> => {
    if (videoStreamRef.current) return videoStreamRef.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia not supported");
      }
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      videoStreamRef.current = nextStream;
      setVideoStream(nextStream);
      return nextStream;
    } catch {
      return null;
    }
  }, []);

  if (section === "written") {
    const timerText = formatTimeMMSS(writtenSecondsRemaining);
    const canSubmit = !writtenEndReason;

    return (
      <div className="flex min-h-screen flex-col bg-white text-black">
        <div className="sticky top-0 z-20 border-b border-black/10 bg-white/80 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black bg-white text-black hover:opacity-70"
              aria-label="Back"
            >
              ←
            </button>

            <div
              className="text-sm font-medium tabular-nums"
              aria-label={`Time remaining ${timerText}`}
            >
              <span className="font-semibold text-blue-600">{timerText}</span>{" "}
              remaining
            </div>

            <button
              type="button"
              onClick={() => setWrittenHelpOpen(true)}
              className="inline-flex items-center justify-center rounded-full border border-black bg-white px-4 py-2 text-sm font-medium text-black hover:opacity-70"
            >
              Help
            </button>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10">
          {writtenEndReason && (
            <div className="mb-6 rounded-2xl border border-black bg-white px-4 py-3 text-sm text-black">
              {writtenEndReason === "timeup"
                ? "Time’s up. Response locked."
                : "Submitted. Response locked."}
            </div>
          )}

          <div className="grid flex-1 gap-10 lg:grid-cols-2">
            <div className="text-lg leading-8 text-black sm:text-xl sm:leading-9">
              <span className="font-semibold">Q1.</span>{" "}
              <span className="whitespace-pre-wrap">{writtenPrompt}</span>

              <div className="mt-8 text-sm leading-6 text-black/70">
                Minimum {WORD_TARGET} words, maximum {HARD_MAX_WORDS} words.
              </div>
            </div>

            <div className="flex flex-col">
              <textarea
                id="full-written-response"
                value={responseText}
                onChange={(e) => handleResponseChange(e.target.value)}
                readOnly={!canSubmit}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                autoComplete="off"
                className="min-h-[60vh] w-full resize-none rounded-2xl border-2 border-blue-600 bg-white p-5 text-sm leading-6 text-black shadow-sm outline-none placeholder:text-black/40 focus:border-blue-600"
                placeholder="Start typing…"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium tabular-nums text-black">
              {writtenWordCount}/{HARD_MAX_WORDS} words
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {writtenEndReason ? (
                <>
                  <button
                    type="button"
                    onClick={copyResponse}
                    className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
                  >
                    Copy response
                  </button>
                  <button
                    type="button"
                    disabled={startingVideo2}
                    onClick={async () => {
                      setStartingVideo2(true);
                      try {
                        await ensureVideoStream();
                      } finally {
                        setStartingVideo2(false);
                      }
                      setSection("video2");
                    }}
                    className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                  >
                    {startingVideo2 ? "Starting camera…" : "Continue"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => endWrittenSession("submitted")}
                  disabled={!canSubmit}
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Submit
                </button>
              )}
            </div>
          </div>

          {copyStatus && (
            <div className="mt-3 text-sm text-black/70">{copyStatus}</div>
          )}
        </div>

        {writtenHelpOpen && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-6">
            <div className="w-full max-w-md rounded-2xl border border-black bg-white p-5">
              <div className="text-base font-semibold text-black">Help</div>
              <div className="mt-2 space-y-2 text-sm leading-6 text-black/70">
                <p>Question 1 is a 10-minute written response.</p>
                <p>
                  Target {WORD_TARGET} words, hard cap {HARD_MAX_WORDS} words.
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setWrittenHelpOpen(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={startFullTest}
                  className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
                >
                  Restart Full Test
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
                >
                  Back to Menu
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (section === "video2") {
    return (
      <VideoQuestion
        questionLabel="Q2."
        prompt={videoPrompt2}
        onPromptChange={setVideoPrompt2}
        prepSeconds={VIDEO_2_PREP_SECONDS}
        recordSeconds={VIDEO_2_RECORD_SECONDS}
        stream={videoStream}
        onStreamChange={setVideoStream}
        onBack={() => setSection("written")}
        onRestart={startFullTest}
        onExit={reset}
        onContinue={() => setSection("video3")}
      />
    );
  }

  if (section === "video3") {
    return (
      <VideoQuestion
        questionLabel="Q3."
        prompt={videoPrompt3}
        onPromptChange={setVideoPrompt3}
        prepSeconds={VIDEO_3_PREP_SECONDS}
        recordSeconds={VIDEO_3_RECORD_SECONDS}
        stream={videoStream}
        onStreamChange={setVideoStream}
        onBack={() => setSection("video2")}
        onRestart={startFullTest}
        onExit={reset}
        onContinue={() => {
          stopTracks(videoStreamRef.current);
          videoStreamRef.current = null;
          setVideoStream(null);
          setSection("summary");
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="mb-8 flex items-center justify-center">
          <Image
            src="/uoft.svg"
            alt="UofT"
            width={120}
            height={32}
            priority
            className="h-8 w-auto"
          />
        </div>

        {section === "intro" && (
          <div className="rounded-3xl border border-black bg-white p-6 shadow-sm sm:p-10">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Full Test (Written + 2 Video)
            </h1>

            <div className="mt-6 space-y-3 text-sm leading-6 text-black/70">
              <p>Question 1: 10 minutes written response.</p>
              <p>Question 2: 2 minutes prep + 2 minutes speaking.</p>
              <p>Question 3: 2 minutes prep + 3 minutes speaking.</p>
              <p className="text-xs text-black/50">
                Camera is live-only (nothing recorded or uploaded).
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={startFullTest}
                className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
              >
                Start Full Test
              </button>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
              >
                Back
              </Link>
            </div>
          </div>
        )}

        {section === "summary" && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-black bg-white p-6 shadow-sm sm:p-10">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Finished
              </h1>
              <p className="mt-3 text-sm text-black/70">
                Review your written response and the prompts below.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
                >
                  Start Again
                </button>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
                  onClick={() => reset()}
                >
                  Back Home
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-black bg-white p-6 shadow-sm sm:p-10">
              <div className="text-sm font-semibold text-black">
                Question 1 (Written)
              </div>
              <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-black bg-white p-4 text-sm leading-6 text-black">
                {responseText || "—"}
              </div>
            </div>

            <div className="rounded-3xl border border-black bg-white p-6 shadow-sm sm:p-10">
              <div className="text-sm font-semibold text-black">
                Question 2 (Video)
              </div>
              <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-black bg-white p-4 text-sm leading-6 text-black">
                {videoPrompt2 || "—"}
              </div>
              <div className="mt-3 text-sm text-black/70">
                Completed (no playback saved).
              </div>
            </div>

            <div className="rounded-3xl border border-black bg-white p-6 shadow-sm sm:p-10">
              <div className="text-sm font-semibold text-black">
                Question 3 (Video)
              </div>
              <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-black bg-white p-4 text-sm leading-6 text-black">
                {videoPrompt3 || "—"}
              </div>
              <div className="mt-3 text-sm text-black/70">
                Completed (no playback saved).
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
