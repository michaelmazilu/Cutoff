export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function clampToMaxWords(text: string, maxWords: number): string {
  const trimmed = text.trim();
  if (!trimmed) return text;

  let wordsSeen = 0;
  const wordRegex = /\S+/g;
  let match: RegExpExecArray | null;
  let endIndex = 0;

  while ((match = wordRegex.exec(text))) {
    wordsSeen += 1;
    if (wordsSeen === maxWords) {
      endIndex = match.index + match[0].length;
      break;
    }
  }

  return endIndex > 0 ? text.slice(0, endIndex) : text;
}

export function formatTimeMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

