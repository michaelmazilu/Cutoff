type WordCounterProps = {
  wordCount: number;
  characterCount: number;
  maxWords?: number;
};

export function WordCounter({
  wordCount,
  characterCount,
  maxWords = 300,
}: WordCounterProps) {
  const isOver = wordCount > maxWords;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <div
        className={[
          "font-semibold tabular-nums",
          isOver ? "text-green-700" : "text-black",
        ].join(" ")}
      >
        {wordCount}/{maxWords}
      </div>
      <div className="text-black">
        Characters:{" "}
        <span className="font-semibold tabular-nums text-black">
          {characterCount}
        </span>
      </div>
    </div>
  );
}
