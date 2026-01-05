import { formatTimeMMSS } from "./text";

type TimerProps = {
  secondsRemaining: number;
};

export function Timer({ secondsRemaining }: TimerProps) {
  return (
    <div
      className={[
        "rounded-2xl border px-6 py-4 text-center font-mono text-5xl tracking-tight shadow-sm",
        "border-black bg-white text-black",
      ].join(" ")}
      aria-label={`Time remaining ${formatTimeMMSS(secondsRemaining)}`}
    >
      {formatTimeMMSS(secondsRemaining)}
    </div>
  );
}
