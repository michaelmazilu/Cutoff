"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRandomPrompt } from "./prompts";
import { Timer } from "./Timer";
import { WebcamPreview } from "./WebcamPreview";
import { WordCounter } from "./WordCounter";
import { clampToMaxWords, countWords, formatTimeMMSS } from "./text";

const TOTAL_SECONDS = 10 * 60;
const WORD_TARGET = 300;
const HARD_MAX_WORDS = 350;

type Screen = "landing" | "requesting" | "practice";
type EndReason = "submitted" | "timeup" | null;

function stopTracks(stream: MediaStream | null) {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [prompt, setPrompt] = useState<string>("");
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [customPromptOpen, setCustomPromptOpen] = useState<boolean>(false);
  const [customPromptError, setCustomPromptError] = useState<string | null>(
    null,
  );

  const [webcamWarning, setWebcamWarning] = useState<string | null>(null);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const [webcamPreviewVisible, setWebcamPreviewVisible] =
    useState<boolean>(true);

  const [responseText, setResponseText] = useState<string>("");
  const [secondsRemaining, setSecondsRemaining] =
    useState<number>(TOTAL_SECONDS);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [endReason, setEndReason] = useState<EndReason>(null);
  const [finalSecondsRemaining, setFinalSecondsRemaining] = useState<
    number | null
  >(null);

  const deadlineMsRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const hasExpiredRef = useRef<boolean>(false);
  const copyTimeoutRef = useRef<number | null>(null);
  const secondsRemainingRef = useRef<number>(TOTAL_SECONDS);

  const wordCount = useMemo(() => countWords(responseText), [responseText]);
  const characterCount = responseText.length;

  const timeUsedSeconds = useMemo(() => {
    if (finalSecondsRemaining == null) return null;
    return Math.max(0, TOTAL_SECONDS - finalSecondsRemaining);
  }, [finalSecondsRemaining]);

  const clearCopyTimeout = useCallback(() => {
    if (copyTimeoutRef.current == null) return;
    window.clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = null;
  }, []);

  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const stopTimer = useCallback(() => {
    if (intervalRef.current == null) return;
    window.clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const stopWebcam = useCallback((updateState: boolean) => {
    stopTracks(webcamStreamRef.current);
    webcamStreamRef.current = null;
    if (updateState) setWebcamStream(null);
  }, []);

  function resetToLanding() {
    stopTimer();
    stopWebcam(true);
    deadlineMsRef.current = null;
    hasExpiredRef.current = false;
    clearCopyTimeout();

    setScreen("landing");
    setIsRunning(false);
    setEndReason(null);
    setFinalSecondsRemaining(null);
    setSecondsRemaining(TOTAL_SECONDS);
    secondsRemainingRef.current = TOTAL_SECONDS;
    setPrompt("");
    setResponseText("");
    setWebcamWarning(null);
    setWebcamPreviewVisible(true);
    setCopyStatus(null);
    setCustomPromptError(null);
    setCustomPromptOpen(false);
  }

  const endSession = useCallback((reason: Exclude<EndReason, null>) => {
    const deadline = deadlineMsRef.current;
    const remainingNow =
      deadline == null
        ? secondsRemainingRef.current
        : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const finalRemaining = reason === "timeup" ? 0 : remainingNow;

    stopTimer();
    stopWebcam(true);
    setIsRunning(false);
    setEndReason(reason);
    setSecondsRemaining(finalRemaining);
    secondsRemainingRef.current = finalRemaining;
    setFinalSecondsRemaining(finalRemaining);
  }, [stopTimer, stopWebcam]);

  async function startSession(promptText: string) {
    stopTimer();
    stopWebcam(true);
    clearCopyTimeout();

    setPrompt("");
    setResponseText("");
    setSecondsRemaining(TOTAL_SECONDS);
    secondsRemainingRef.current = TOTAL_SECONDS;
    setFinalSecondsRemaining(null);
    setEndReason(null);
    setWebcamWarning(null);
    setCopyStatus(null);
    setWebcamPreviewVisible(true);
    hasExpiredRef.current = false;
    deadlineMsRef.current = null;

    setScreen("requesting");

    let stream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia not supported");
      }
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    } catch {
      setWebcamWarning("Webcam permission denied. You can continue without webcam.");
    }

    webcamStreamRef.current = stream;
    setWebcamStream(stream);

    setPrompt(promptText);
    const startedAt = Date.now();
    deadlineMsRef.current = startedAt + TOTAL_SECONDS * 1000;
    setIsRunning(true);
    setScreen("practice");
  }

  useEffect(() => {
    if (!isRunning) return;
    const deadline = deadlineMsRef.current;
    if (deadline == null) return;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      secondsRemainingRef.current = remaining;
      setSecondsRemaining(remaining);
      if (remaining === 0 && !hasExpiredRef.current) {
        hasExpiredRef.current = true;
        endSession("timeup");
      }
    };

    tick();
    intervalRef.current = window.setInterval(tick, 250);

    return () => {
      stopTimer();
    };
  }, [isRunning, endSession, stopTimer]);

  useEffect(() => {
    return () => {
      stopTimer();
      stopWebcam(false);
      clearCopyTimeout();
    };
  }, [clearCopyTimeout, stopTimer, stopWebcam]);

  function handleResponseChange(nextValue: string) {
    if (endReason) return;
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

  return (
    <div className="min-h-screen bg-white text-black">
      <WebcamPreview
        stream={webcamStream}
        visible={webcamPreviewVisible}
        onToggleVisible={() => setWebcamPreviewVisible((v) => !v)}
      />

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

        {screen === "landing" && (
          <div className="rounded-3xl border border-black bg-white p-6 shadow-sm sm:p-10">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Timed Written Response Practice
            </h1>

            <div className="mt-6 space-y-3 text-sm leading-6 text-black/70">
              <p>
                You have 10 minutes to write a response of up to 300 words.
              </p>
              <p>The timer starts when the prompt is revealed.</p>
              <p>
                Your webcam will be enabled during the session but nothing is
                recorded.
              </p>
              <p className="text-xs text-black/50">
                Prompts below are for practice and are not official UofT prompts.
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => startSession(getRandomPrompt())}
                className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
              >
                Start Practice
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomPromptOpen(true);
                  setCustomPromptError(null);
                }}
                className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
              >
                Use My Own Prompt
              </button>
            </div>

            {customPromptOpen && (
              <div className="mt-6 rounded-2xl border border-black bg-white p-4">
                <label
                  htmlFor="custom-prompt"
                  className="block text-sm font-medium text-black"
                >
                  Paste your prompt
                </label>
                <textarea
                  id="custom-prompt"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="mt-2 w-full resize-y rounded-xl border border-black bg-white p-3 text-sm text-black shadow-sm outline-none ring-0 placeholder:text-black/40 focus:border-black"
                  rows={4}
                  placeholder="Enter your prompt here…"
                />

                {customPromptError && (
                  <div className="mt-2 text-sm text-black">
                    {customPromptError}
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = customPrompt.trim();
                      if (!trimmed) {
                        setCustomPromptError("Please enter a prompt to continue.");
                        return;
                      }
                      startSession(trimmed);
                    }}
                    className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
                  >
                    Start With This Prompt
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomPromptOpen(false);
                      setCustomPromptError(null);
                    }}
                    className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {screen === "requesting" && (
          <div className="rounded-3xl border border-black bg-white p-6 shadow-sm sm:p-10">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Timed Written Response Practice
            </h1>
            <p className="mt-4 text-sm text-black/70">
              Requesting webcam permission…
            </p>
            <p className="mt-2 text-xs text-black/50">
              If you deny permission, you can still continue without webcam.
            </p>
          </div>
        )}

        {screen === "practice" && (
          <div className="space-y-6">
            {endReason === "timeup" && (
              <div className="rounded-2xl border border-black bg-white px-4 py-3 text-sm text-black">
                Time’s up. Response locked.
              </div>
            )}
            {endReason === "submitted" && (
              <div className="rounded-2xl border border-black bg-white px-4 py-3 text-sm text-black">
                Submitted. Response locked.
              </div>
            )}
            {webcamWarning && (
              <div className="rounded-2xl border border-black bg-white px-4 py-3 text-sm text-black">
                {webcamWarning}
              </div>
            )}

            <div className="rounded-3xl border border-black bg-white p-5 shadow-sm sm:p-6">
              <div className="text-xs font-medium uppercase tracking-wide text-black/60">
                Prompt
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black">
                {prompt}
              </div>
            </div>

            <Timer secondsRemaining={secondsRemaining} />

            <div className="rounded-3xl border border-black bg-white p-5 shadow-sm sm:p-6">
              <label
                htmlFor="response"
                className="block text-sm font-medium text-black"
              >
                Your response
              </label>
              <textarea
                id="response"
                value={responseText}
                onChange={(e) => handleResponseChange(e.target.value)}
                readOnly={Boolean(endReason)}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                autoComplete="off"
                className="mt-2 min-h-72 w-full resize-y rounded-2xl border border-black bg-white p-4 text-sm leading-6 text-black shadow-sm outline-none focus:border-black placeholder:text-black/40"
                placeholder="Start typing…"
              />

              <div className="mt-4">
                <WordCounter
                  wordCount={wordCount}
                  characterCount={characterCount}
                  maxWords={WORD_TARGET}
                />
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => endSession("submitted")}
                    disabled={Boolean(endReason)}
                    className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Submit Early
                  </button>
                  <button
                    type="button"
                    onClick={resetToLanding}
                    className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
                  >
                    Restart
                  </button>
                </div>

                {webcamStream && (
                  <button
                    type="button"
                    onClick={() => setWebcamPreviewVisible((v) => !v)}
                    className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
                  >
                    {webcamPreviewVisible
                      ? "Hide Webcam Preview"
                      : "Show Webcam Preview"}
                  </button>
                )}
              </div>
            </div>

            {endReason && (
              <div className="rounded-3xl border border-black bg-white p-5 shadow-sm sm:p-6">
                <div className="text-sm font-semibold text-black">Summary</div>
                <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-black sm:grid-cols-3">
                  <div className="rounded-2xl border border-black bg-white px-4 py-3">
                    <div className="text-xs text-black/60">
                      Final words
                    </div>
                    <div className="mt-1 font-semibold tabular-nums text-black">
                      {wordCount}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-black bg-white px-4 py-3">
                    <div className="text-xs text-black/60">
                      Characters
                    </div>
                    <div className="mt-1 font-semibold tabular-nums text-black">
                      {characterCount}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-black bg-white px-4 py-3">
                    <div className="text-xs text-black/60">
                      Time used
                    </div>
                    <div className="mt-1 font-semibold tabular-nums text-black">
                      {timeUsedSeconds == null
                        ? "—"
                        : formatTimeMMSS(timeUsedSeconds)}
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={copyResponse}
                    className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
                  >
                    Copy response
                  </button>
                  {copyStatus && (
                    <div className="text-sm text-black/70">
                      {copyStatus}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
