"use client";

const BRAND_TITLE = "Tangbuy";
const BRAND_SUBTITLE = "Smart Match";
const TITLE_CHARS = Array.from(BRAND_TITLE);
const SUBTITLE_CHARS = Array.from(BRAND_SUBTITLE);

function WaveText({ text, className, baseDelayMs = 0, stepMs = 60 }: { text: string[]; className?: string; baseDelayMs?: number; stepMs?: number }) {
  return (
    <span className={className} aria-label={text.join("")}>
      {text.map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="inline-block animate-wave"
          style={{ animationDelay: `${baseDelayMs + i * stepMs}ms` }}
        >
          {ch === " " ? "\u00A0" : ch}
        </span>
      ))}
    </span>
  );
}

export default function LocaleLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app-shell">
      <style>{`
        @keyframes wave {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .animate-wave {
          animation: wave 1.1s ease-in-out infinite;
        }
      `}</style>
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-ink">
          <WaveText text={TITLE_CHARS} stepMs={70} />
        </h1>
        <p className="text-sm font-medium tracking-wide text-brand-strong">
          <WaveText text={SUBTITLE_CHARS} baseDelayMs={300} stepMs={80} />
        </p>
      </div>
    </div>
  );
}
