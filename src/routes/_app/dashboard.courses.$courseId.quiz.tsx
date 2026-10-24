import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, ChevronRight, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getFirestoreDb } from "@/lib/firebase";
import type { Resource } from "@/lib/types";
import { generateQuiz, type GeneratedQuestion } from "@/lib/ai";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/dashboard/courses/$courseId/quiz")({
  head: () => ({ meta: [{ title: "Quiz — Craft" }] }),
  component: QuizPage,
});

type QuizStep = "config" | "loading" | "taking" | "results";

function QuizPage() {
  const { courseId } = Route.useParams();
  const { user } = useAuth();
  const uid = user!.uid;

  const [resources, setResources] = useState<Resource[]>([]);
  const [resLoading, setResLoading] = useState(true);
  const [step, setStep] = useState<QuizStep>("config");
  const [count, setCount] = useState<5 | 10 | 15 | 20>(10);
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard" | "Mixed">("Mixed");
  const [examTagFilter, setExamTagFilter] = useState<"all" | "mid" | "final">("all");
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const db = await getFirestoreDb();
      const { collection, query, orderBy, onSnapshot } = await import("firebase/firestore");
      const q = query(collection(db, "users", uid, "courses", courseId, "resources"), orderBy("createdAt", "desc"));
      unsub = onSnapshot(q, (snap) => {
        setResources(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Resource));
        setResLoading(false);
      });
    })().catch(() => setResLoading(false));
    return () => unsub?.();
  }, [uid, courseId]);

  const summableResources = resources.filter((r) => r.summary && (examTagFilter === "all" || r.examTag === examTagFilter));

  const startQuiz = async () => {
    if (summableResources.length === 0) { toast.error("No summarized resources. Add and summarize resources first."); return; }
    setStep("loading");
    try {
      const result = await generateQuiz({
        summaries: summableResources.map((r) => ({ resourceId: r.id, title: r.title, examTag: r.examTag, summary: r.summary! })),
        count, difficulty,
      });
      setQuestions(result.questions);
      setAnswers([]); setCurrent(0); setSelected(null); setRevealed(false);
      setStep("taking");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate quiz");
      setStep("config");
    }
  };

  const handleNext = async () => {
    if (selected === null) return;
    const newAnswers = [...answers, selected];
    setAnswers(newAnswers);

    if (current + 1 >= questions.length) {
      try {
        const db = await getFirestoreDb();
        const { collection, addDoc } = await import("firebase/firestore");
        const score = newAnswers.filter((a, i) => a === questions[i]!.correctIndex).length;
        const perResource: Record<string, { correct: number; total: number }> = {};
        questions.forEach((q, i) => {
          const rid = q.sourceResourceId;
          if (!perResource[rid]) perResource[rid] = { correct: 0, total: 0 };
          perResource[rid].total += 1;
          if (newAnswers[i] === q.correctIndex) perResource[rid].correct += 1;
        });
        await addDoc(collection(db, "users", uid, "courses", courseId, "attempts"), {
          quizId: "",
          answers: newAnswers,
          correctAnswers: questions.map((q) => q.correctIndex),
          questionResources: questions.map((q) => q.sourceResourceId),
          score,
          total: questions.length,
          perResource,
          examTags: [...new Set(questions.map((q) => resources.find((r) => r.id === q.sourceResourceId)?.examTag ?? "final"))],
          difficulty,
          createdAt: Date.now(),
        });
      } catch (e) { console.error("Failed to save attempt", e); }
      setStep("results");
    } else {
      setCurrent((c) => c + 1); setSelected(null); setRevealed(false);
    }
  };

  const score = answers.filter((a, i) => a === questions[i]?.correctIndex).length;
  const pct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

  if (resLoading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
      <Link to="/dashboard/courses/$courseId" params={{ courseId }} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to course
      </Link>
      <h1 className="font-display mb-6 text-2xl font-bold text-foreground">Quiz</h1>

      {step === "config" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Questions</label>
                <div className="flex gap-2 flex-wrap">
                  {([5, 10, 15, 20] as const).map((n) => (
                    <button key={n} onClick={() => setCount(n)} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${count === n ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`}>{n}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Difficulty</label>
                <div className="flex gap-2 flex-wrap">
                  {(["Easy", "Medium", "Hard", "Mixed"] as const).map((d) => (
                    <button key={d} onClick={() => setDifficulty(d)} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${difficulty === d ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`}>{d}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Exam Tag</label>
                <div className="flex gap-2">
                  {(["all", "mid", "final"] as const).map((t) => (
                    <button key={t} onClick={() => setExamTagFilter(t)} className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors ${examTagFilter === t ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`}>{t}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{summableResources.length}</span> summarized resource(s) available.</p>
          </div>
          <button id="start-quiz-btn" onClick={() => void startQuiz()} disabled={summableResources.length === 0} className="w-full rounded-2xl bg-primary py-3.5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 hover:opacity-90 disabled:opacity-60">
            Generate &amp; Start Quiz
          </button>
        </div>
      )}

      {step === "loading" && (
        <div className="flex flex-col items-center gap-4 py-24">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Generating {count} questions…</p>
        </div>
      )}

      {step === "taking" && questions[current] && (
        <div>
          <div className="mb-6">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Question {current + 1} of {questions.length}</span>
              <span>{difficulty}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(current / questions.length) * 100}%` }} />
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="mb-6 text-base font-medium leading-relaxed text-foreground">{questions[current].question}</p>
            <div className="space-y-2.5">
              {questions[current].options.map((opt, i) => {
                const isCorrect = i === questions[current]!.correctIndex;
                const isSelected = i === selected;
                let cls = "flex w-full items-start gap-3 rounded-xl border p-4 text-sm text-left transition-colors ";
                if (!revealed) cls += isSelected ? "border-primary bg-primary/10" : "border-border hover:border-primary/40 hover:bg-accent";
                else if (isCorrect) cls += "border-green-500 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200";
                else if (isSelected) cls += "border-destructive bg-destructive/10 text-destructive";
                else cls += "border-border opacity-60";
                return (
                  <button key={i} onClick={() => { if (!revealed) setSelected(i); }} className={cls}>
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs font-semibold">{String.fromCharCode(65 + i)}</span>
                    <span>{opt}</span>
                    {revealed && isCorrect && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-green-600" />}
                    {revealed && isSelected && !isCorrect && <XCircle className="ml-auto h-4 w-4 shrink-0 text-destructive" />}
                  </button>
                );
              })}
            </div>
            {revealed && (
              <div className="mt-4 rounded-xl bg-accent/60 px-4 py-3 text-sm">
                <span className="font-semibold">Explanation: </span>{questions[current].explanation}
              </div>
            )}
          </div>
          <div className="mt-4 flex justify-between gap-3">
            {!revealed && (
              <button onClick={() => setRevealed(true)} disabled={selected === null} className="flex-1 rounded-xl border border-border py-3 text-sm font-medium hover:bg-accent disabled:opacity-60">Check Answer</button>
            )}
            <button onClick={() => void handleNext()} disabled={selected === null} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {current + 1 >= questions.length ? "Finish Quiz" : "Next"}<ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {step === "results" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <div className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold ${pct >= 70 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"}`}>{pct}%</div>
            <h2 className="font-display mt-5 text-2xl font-bold text-foreground">{pct >= 80 ? "Excellent!" : pct >= 60 ? "Good effort!" : "Keep practising!"}</h2>
            <p className="mt-2 text-muted-foreground">You got <span className="font-semibold text-foreground">{score}</span> out of <span className="font-semibold text-foreground">{questions.length}</span> correct.</p>
          </div>
          <div className="space-y-3">
            {questions.map((q, i) => {
              const correct = answers[i] === q.correctIndex;
              return (
                <div key={i} className={`rounded-xl border p-4 ${correct ? "border-green-500/30 bg-green-50/50 dark:bg-green-900/10" : "border-destructive/30 bg-destructive/5"}`}>
                  <div className="flex items-start gap-2">
                    {correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{q.question}</p>
                      {!correct && <p className="mt-1 text-xs text-muted-foreground">Correct: <span className="font-medium text-foreground">{q.options[q.correctIndex]}</span></p>}
                      <p className="mt-1.5 text-xs text-muted-foreground">{q.explanation}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setStep("config"); setQuestions([]); }} className="flex-1 rounded-xl border border-border py-3 text-sm font-medium hover:bg-accent">New Quiz</button>
            <Link to="/dashboard/courses/$courseId" params={{ courseId }} className="flex-1 inline-flex items-center justify-center rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">Back to Course</Link>
          </div>
        </div>
      )}
    </div>
  );
}
