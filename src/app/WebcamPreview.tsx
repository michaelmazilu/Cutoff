"use client";

import { useEffect, useRef } from "react";

type WebcamPreviewProps = {
  stream: MediaStream | null;
  visible: boolean;
  onToggleVisible: () => void;
};

export function WebcamPreview({
  stream,
  visible,
  onToggleVisible,
}: WebcamPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    return () => {
      el.srcObject = null;
    };
  }, [stream]);

  if (!stream) return null;

  if (!visible) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          type="button"
          onClick={onToggleVisible}
          className="rounded-full border border-black bg-white px-4 py-2 text-sm font-medium text-black shadow-sm hover:bg-white/90"
        >
          Show webcam
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-56 overflow-hidden rounded-2xl border border-black bg-white shadow-lg">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-xs font-medium text-black">Webcam (live)</div>
        <button
          type="button"
          onClick={onToggleVisible}
          className="text-xs font-medium text-black hover:opacity-70"
          aria-label="Hide webcam preview"
        >
          Hide
        </button>
      </div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-36 w-full bg-black object-cover"
      />
    </div>
  );
}
