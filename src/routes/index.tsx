import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, BookOpen, Brain, TrendingUp, BarChart3 } from "lucide-react";
import { signInWithGoogle } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Craft — Your AI study co-pilot" },
      {
        name: "description",
        content:
          "Track your marks, summarize study resources with AI, take generated quizzes, and forecast your final grades.",
      },
      { property: "og:title", content: "Craft — Your AI study co-pilot" },
      {
        property: "og:description",
        content:
          "Track marks, AI summaries, generated quizzes, and grade forecasts for university students.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: BookOpen,
    title: "Smart Summaries",
    desc: "Upload notes or photos and get comprehensive AI-generated study digests.",
  },
  {
    icon: Brain,
    title: "AI Quizzes",
    desc: "Generate tailored MCQs from your material. Practice until you're confident.",
  },
  {
    icon: TrendingUp,
    title: "Grade Forecast",
    desc: "See your projected final grade in real time as you enter marks.",
  },
  {
    icon: BarChart3,
    title: "Confidence Score",
    desc: "A data-driven view of how well you know each topic before the exam.",
  },
];

function Landing() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user) void navigate({ to: "/dashboard" });
  }, [ready, user, navigate]);

  const handleSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Hero */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-primary shadow-lg shadow-primary/30">
          <span className="font-display text-3xl font-bold text-primary-foreground">C</span>
        </div>
        <h1 className="font-display mt-8 text-6xl font-bold tracking-tight text-foreground md:text-7xl">
          Craft
        </h1>
        <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
          Your AI-powered study co-pilot. Track marks, get comprehensive
          summaries, practise with generated quizzes, and forecast your
          final grades — all in one place.
        </p>
        <button
          id="sign-in-button"
          onClick={() => void handleSignIn()}
          disabled={busy}
          className="mt-10 inline-flex min-h-14 w-full max-w-xs items-center justify-center gap-3 rounded-2xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:opacity-90 hover:shadow-xl disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="currentColor"
                d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
              />
            </svg>
          )}
          Continue with Google
        </button>
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      </div>

      {/* Features */}
      <div className="mx-auto w-full max-w-4xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
