"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatTimeMMSS } from "./text";

type Phase = "idle" | "requesting" | "prep" | "recording" | "done" | "error";

type VideoQuestionProps = {
  questionLabel: string;
  prompt: string;
  onPromptChange?: (nextPrompt: string) => void;
  prepSeconds: number;
  recordSeconds: number;
  stream: MediaStream | null;
  onStreamChange: (stream: MediaStream | null) => void;
  onContinue: () => void;
  onBack?: () => void;
  onRestart?: () => void;
  onExit?: () => void;
};

function stopTracks(stream: MediaStream | null) {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
}

export function VideoQuestion({
  questionLabel,
  prompt,
  onPromptChange,
  prepSeconds,
  recordSeconds,
  stream,
  onStreamChange,
  onContinue,
  onBack,
  onRestart,
  onExit,
}: VideoQuestionProps) {
  const isMountedRef = useRef<boolean>(true);
  const defaultPromptRef = useRef<string>(prompt);

  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] =
    useState<number>(prepSeconds);
  const [helpOpen, setHelpOpen] = useState<boolean>(false);
  const [customPromptOpen, setCustomPromptOpen] = useState<boolean>(false);
  const [customPromptDraft, setCustomPromptDraft] = useState<string>("");
  const [customPromptError, setCustomPromptError] = useState<string | null>(
    null,
  );
  const phaseBeforeCustomPromptRef = useRef<Phase>("idle");

  const liveVideoRef = useRef<HTMLVideoElement | null>(null);

  const streamRef = useRef<MediaStream | null>(null);

  const intervalRef = useRef<number | null>(null);
  const deadlineMsRef = useRef<number | null>(null);
  const hasExpiredRef = useRef<boolean>(false);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  useEffect(() => {
    const el = liveVideoRef.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) {
      const playPromise = el.play();
      if (playPromise) playPromise.catch(() => {});
    }
    return () => {
      el.srcObject = null;
    };
  }, [stream]);

  const stopTimer = useCallback(() => {
    if (intervalRef.current == null) return;
    window.clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const resetTimerState = useCallback((durationSeconds: number) => {
    deadlineMsRef.current = Date.now() + durationSeconds * 1000;
    hasExpiredRef.current = false;
    setSecondsRemaining(durationSeconds);
  }, []);

  const startCountdown = useCallback(
    (durationSeconds: number, onExpired: () => void) => {
      stopTimer();
      resetTimerState(durationSeconds);

      const tick = () => {
        const deadline = deadlineMsRef.current;
        if (deadline == null) return;
        const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        setSecondsRemaining(remaining);
        if (remaining === 0 && !hasExpiredRef.current) {
          hasExpiredRef.current = true;
          stopTimer();
          onExpired();
        }
      };

      tick();
      intervalRef.current = window.setInterval(tick, 250);
    },
    [resetTimerState, stopTimer],
  );

  const finishAndContinue = useCallback(() => {
    stopTimer();
    setPhase("done");
    onContinue();
  }, [onContinue, stopTimer]);

  const startRecording = useCallback(() => {
    const activeStream = streamRef.current;
    if (!activeStream) {
      setPhase("error");
      setErrorMessage("Camera stream unavailable. Please try again.");
      return;
    }
    setErrorMessage(null);
    setPhase("recording");
    startCountdown(recordSeconds, finishAndContinue);
  }, [finishAndContinue, recordSeconds, startCountdown]);

  const ensureStream = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current) return streamRef.current;
    setPhase("requesting");
    setErrorMessage(null);
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
      if (!isMountedRef.current) {
        stopTracks(nextStream);
        return null;
      }
      streamRef.current = nextStream;
      const el = liveVideoRef.current;
      if (el) {
        el.srcObject = nextStream;
        const playPromise = el.play();
        if (playPromise) playPromise.catch(() => {});
      }
      onStreamChange(nextStream);
      return nextStream;
    } catch {
      if (!isMountedRef.current) return null;
      setPhase("error");
      setErrorMessage(
        "Camera permission denied or unavailable. Check browser permissions and try again.",
      );
      return null;
    }
  }, [onStreamChange]);

  const startPrep = useCallback(async () => {
    stopTimer();
    setErrorMessage(null);

    const nextStream = await ensureStream();
    if (!nextStream) return;

    setPhase("prep");
    startCountdown(prepSeconds, startRecording);
  }, [ensureStream, prepSeconds, startCountdown, startRecording, stopTimer]);

  useEffect(() => {
    if (phase !== "idle") return;
    if (helpOpen || customPromptOpen) return;
    if (!stream) return;
    void startPrep();
  }, [customPromptOpen, helpOpen, phase, startPrep, stream]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopTimer();
    };
  }, [stopTimer]);

  const phaseLabel = useMemo(() => {
    if (phase === "requesting") return "Starting";
    if (phase === "prep") return "Preparation";
    if (phase === "recording") return "Response";
    if (phase === "done") return "Done";
    if (phase === "error") return "Error";
    return "Ready";
  }, [phase]);

  const remainingText = useMemo(() => {
    if (phase !== "prep" && phase !== "recording") return null;
    return `${formatTimeMMSS(secondsRemaining)} remaining`;
  }, [phase, secondsRemaining]);

  const openCustomPromptEditor = useCallback(() => {
    phaseBeforeCustomPromptRef.current = phase;

    if (phase === "prep") {
      stopTimer();
      setPhase("idle");
    }

    setCustomPromptDraft(prompt);
    setCustomPromptError(null);
    setHelpOpen(false);
    setCustomPromptOpen(true);
  }, [phase, prompt, stopTimer]);

  const closeCustomPromptEditor = useCallback(() => {
    const phaseBefore = phaseBeforeCustomPromptRef.current;
    setCustomPromptOpen(false);
    setCustomPromptError(null);
    if (phaseBefore === "prep") {
      void startPrep();
    }
  }, [startPrep]);

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="sticky top-0 z-20 border-b border-black/10 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                type="button"
                onClick={() => {
                  setHelpOpen(false);
                  stopTimer();
                  onBack();
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black bg-white text-black hover:opacity-70"
                aria-label="Back"
              >
                ←
              </button>
            )}
          </div>

          <div
            className="text-sm font-medium tabular-nums"
            aria-label={remainingText ?? undefined}
          >
            {remainingText ? (
              <>
                <span
                  className={[
                    phase === "recording" ? "text-red-600" : "text-blue-600",
                    "font-semibold",
                  ].join(" ")}
                >
                  {formatTimeMMSS(secondsRemaining)}
                </span>{" "}
                remaining
              </>
            ) : (
              <span className="text-black/60">{phaseLabel}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="inline-flex items-center justify-center rounded-full border border-black bg-white px-4 py-2 text-sm font-medium text-black hover:opacity-70"
            >
              Help
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <div className="overflow-hidden rounded-2xl bg-black">
          <div className="relative aspect-video w-full">
            <video
              ref={liveVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />

            {(phase === "requesting" || phase === "prep") && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
                <div className="text-4xl font-semibold tracking-tight text-white sm:text-6xl">
                  {phase === "prep" ? "Preparation" : "Starting"}
                </div>
              </div>
            )}

            {phase === "recording" && (
              <div className="pointer-events-none absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-white">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                Response
              </div>
            )}

            <div className="pointer-events-none absolute bottom-4 right-4 flex gap-1">
              {[0, 1, 2, 3].map((dot) => (
                <span
                  key={dot}
                  className={[
                    "h-2 w-2 rounded-full",
                    stream ? "bg-green-500" : "bg-white/30",
                  ].join(" ")}
                />
              ))}
            </div>
          </div>
        </div>

        {phase === "error" && (
          <div className="mt-6 rounded-2xl border border-black bg-white px-4 py-3 text-sm text-black">
            {errorMessage ?? "Something went wrong. Please try again."}
          </div>
        )}

        <div className="mt-10 text-lg leading-8 text-black sm:text-xl sm:leading-9">
          <span className="font-semibold">{questionLabel}</span>{" "}
          <span className="whitespace-pre-wrap">{prompt}</span>
        </div>

        {onPromptChange && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                openCustomPromptEditor();
              }}
              disabled={phase === "recording" || phase === "requesting"}
              className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-3 py-1.5 text-xs font-medium text-black hover:opacity-70"
            >
              Use my own prompt
            </button>
            {prompt !== defaultPromptRef.current && (
              <div className="text-xs text-black/50">Custom prompt</div>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          {phase === "recording" && (
            <button
              type="button"
              onClick={finishAndContinue}
              className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
            >
              Finish Early
            </button>
          )}

          {(phase === "idle" || phase === "error") && (
            <button
              type="button"
              onClick={startPrep}
              className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
            >
              {phase === "idle" ? "Start" : "Try Again"}
            </button>
          )}
        </div>
      </div>

      {helpOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-md rounded-2xl border border-black bg-white p-5">
            <div className="text-base font-semibold text-black">Help</div>
            <div className="mt-2 space-y-2 text-sm leading-6 text-black/70">
              <p>
                You have {Math.floor(prepSeconds / 60)} minutes to prepare, then{" "}
                {Math.floor(recordSeconds / 60)} minutes to respond.
              </p>
              <p>
                Camera stays on-device. Nothing is recorded or uploaded.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setHelpOpen(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
                >
                  Close
                </button>

              {onRestart && (
                <button
                  type="button"
                  onClick={() => {
                    setHelpOpen(false);
                    stopTimer();
                    onRestart();
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
                >
                  Restart Full Test
                </button>
              )}

              {onExit && (
                <button
                  type="button"
                  onClick={() => {
                    setHelpOpen(false);
                    stopTimer();
                    onExit();
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
                >
                  Exit
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {customPromptOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-xl rounded-2xl border border-black bg-white p-5">
            <div className="text-base font-semibold text-black">
              Use Your Own Prompt
            </div>
            <div className="mt-2 text-sm leading-6 text-black/70">
              Replaces the current prompt and restarts preparation time.
            </div>

            <label
              htmlFor="custom-video-prompt"
              className="mt-4 block text-sm font-medium text-black"
            >
              Prompt
            </label>
            <textarea
              id="custom-video-prompt"
              value={customPromptDraft}
              onChange={(e) => setCustomPromptDraft(e.target.value)}
              rows={6}
              className="mt-2 w-full resize-y rounded-xl border border-black bg-white p-3 text-sm text-black shadow-sm outline-none placeholder:text-black/40 focus:border-black"
              placeholder="Paste your prompt here…"
            />

            {customPromptError && (
              <div className="mt-2 text-sm text-black">{customPromptError}</div>
            )}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  closeCustomPromptEditor();
                }}
                className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!onPromptChange) return;
                  const original = defaultPromptRef.current;
                  onPromptChange(original);
                  setCustomPromptOpen(false);
                  setCustomPromptError(null);
                  void startPrep();
                }}
                disabled={!onPromptChange || prompt === defaultPromptRef.current}
                className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reset Prompt
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!onPromptChange) return;
                  const trimmed = customPromptDraft.trim();
                  if (!trimmed) {
                    setCustomPromptError("Please enter a prompt to continue.");
                    return;
                  }
                  onPromptChange(trimmed);
                  setCustomPromptOpen(false);
                  setCustomPromptError(null);
                  void startPrep();
                }}
                className="inline-flex items-center justify-center rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:opacity-70"
              >
                Use This Prompt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
