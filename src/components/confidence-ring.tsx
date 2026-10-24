interface Props {
  score: number | null; // null = not enough data
  size?: number;
}

export function ConfidenceRing({ score, size = 64 }: Props) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : score / 100;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      role="img"
      aria-label={score === null ? "Confidence: not enough data" : `Confidence: ${score} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="stroke-primary transition-all"
        />
      </svg>
      <span className="absolute text-xs font-semibold text-foreground">
        {score === null ? "—" : score}
      </span>
    </div>
  );
}
