import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  BookOpen,
  Camera,
  Sparkles,
  ClipboardList,
  Upload,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getFirestoreDb } from "@/lib/firebase";
import type { Course, Resource, Attempt } from "@/lib/types";
import {
  computeForecast,
  computeConfidence,
  normalizeCt,
  type CtEntry,
  type ForecastResult,
} from "@/lib/forecast";
import { ConfidenceRing } from "@/components/confidence-ring";
import { CourseForm } from "@/components/course-form";
import { MARKS, gradeFor } from "@/lib/constants";
import { compressImage } from "@/lib/compress-image";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/dashboard/courses/$courseId/")({
  head: () => ({ meta: [{ title: "Course — Craft" }] }),
  component: CoursePage,
});

function useCollection<T>(uid: string, ...pathParts: string[]) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const db = await getFirestoreDb();
      const { collection, query, orderBy, onSnapshot } = await import("firebase/firestore");
      const q = query(
        collection(db, "users", uid, ...pathParts),
        orderBy("createdAt", "desc"),
      );
      unsub = onSnapshot(q, (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
        setLoading(false);
      });
    })().catch(() => setLoading(false));
    return () => unsub?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, ...pathParts]);
  return { items, loading };
}

function MarkInput({
  label, value, max, onSave,
}: {
  label: string; value: number | null; max: number; onSave: (v: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const parsed = draft === "" ? null : parseFloat(draft);
    const num = (parsed === null || isNaN(parsed)) ? null : Math.min(max, Math.max(0, parsed));
    await onSave(num);
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="rounded-xl border border-primary bg-card p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <input
          type="number" min={0} max={max} step={0.5} value={draft}
          onChange={(e) => setDraft(e.target.value)} autoFocus
          className="mt-1 w-full rounded bg-background px-2 py-1 text-sm outline-none"
        />
        <div className="mt-2 flex gap-1">
          <button onClick={() => void save()} disabled={saving} className="flex-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-60">
            {saving ? "…" : "Save"}
          </button>
          <button onClick={() => setEditing(false)} className="flex-1 rounded border border-border px-2 py-1 text-xs">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(value?.toString() ?? ""); setEditing(true); }}
      className="rounded-xl border border-border bg-card p-3 text-center transition-colors hover:border-primary/50 hover:bg-accent"
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold text-foreground">{value !== null ? value : "—"}</p>
    </button>
  );
}

function CtInput({
  entries,
  onSave,
}: {
  entries: CtEntry[];
  onSave: (entries: CtEntry[]) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"direct" | "detailed">("direct");
  const normalized = normalizeCt(entries);
  const [directScore, setDirectScore] = useState(normalized !== null ? normalized.toString() : "");
  const [localEntries, setLocalEntries] = useState<CtEntry[]>(
    entries.length > 0 ? entries : [{ obtained: 8, max: 10 }]
  );
  const [saving, setSaving] = useState(false);

  const handleOpen = () => {
    const norm = normalizeCt(entries);
    setDirectScore(norm !== null ? norm.toFixed(1) : "");
    setLocalEntries(entries.length > 0 ? entries : [{ obtained: 8, max: 10 }]);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (mode === "direct") {
        const val = parseFloat(directScore);
        if (isNaN(val) || directScore.trim() === "") {
          await onSave([]);
        } else {
          const clamped = Math.min(10, Math.max(0, val));
          await onSave([{ obtained: clamped, max: 10 }]);
        }
      } else {
        const valid = localEntries.filter((e) => e.max > 0);
        await onSave(valid);
      }
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="rounded-xl border border-primary bg-card p-3 shadow-md">
        <div className="flex items-center justify-between pb-1">
          <p className="text-xs font-semibold text-foreground">Class Test (CT) /10</p>
          <div className="flex rounded-md bg-muted p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setMode("direct")}
              className={`rounded px-1.5 py-0.5 ${mode === "direct" ? "bg-background font-semibold shadow-xs text-foreground" : "text-muted-foreground"}`}
            >
              Direct
            </button>
            <button
              type="button"
              onClick={() => setMode("detailed")}
              className={`rounded px-1.5 py-0.5 ${mode === "detailed" ? "bg-background font-semibold shadow-xs text-foreground" : "text-muted-foreground"}`}
            >
              Tests
            </button>
          </div>
        </div>

        {mode === "direct" ? (
          <div className="my-2">
            <input
              type="number"
              min={0}
              max={10}
              step={0.5}
              value={directScore}
              onChange={(e) => setDirectScore(e.target.value)}
              placeholder="e.g. 8.5"
              autoFocus
              className="w-full rounded border border-input bg-background px-2 py-1 text-sm outline-none"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Enter total CT mark out of 10</p>
          </div>
        ) : (
          <div className="my-2 max-h-40 space-y-2 overflow-y-auto pr-1">
            {localEntries.map((entry, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-muted-foreground">CT{i + 1}:</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={entry.obtained}
                  onChange={(e) => {
                    const next = [...localEntries];
                    next[i] = { ...next[i]!, obtained: parseFloat(e.target.value) || 0 };
                    setLocalEntries(next);
                  }}
                  className="w-16 rounded border border-input bg-background px-1.5 py-0.5 text-xs outline-none"
                  placeholder="Obt"
                />
                <span className="text-xs text-muted-foreground">/</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={entry.max}
                  onChange={(e) => {
                    const next = [...localEntries];
                    next[i] = { ...next[i]!, max: parseFloat(e.target.value) || 10 };
                    setLocalEntries(next);
                  }}
                  className="w-16 rounded border border-input bg-background px-1.5 py-0.5 text-xs outline-none"
                  placeholder="Max"
                />
                <button
                  type="button"
                  onClick={() => setLocalEntries(localEntries.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setLocalEntries([...localEntries, { obtained: 0, max: 20 }])}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              + Add another CT
            </button>
          </div>
        )}

        <div className="mt-2 flex gap-1">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex-1 rounded bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="flex-1 rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-accent"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      className="group relative rounded-xl border border-border bg-card p-3 text-center transition-colors hover:border-primary/50 hover:bg-accent"
    >
      <div className="flex items-center justify-center gap-1">
        <p className="text-xs text-muted-foreground">CT /10</p>
        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="mt-1 text-lg font-bold text-foreground">
        {normalized !== null ? normalized.toFixed(1) : "—"}
      </p>
      {entries.length > 1 && (
        <p className="text-[10px] text-muted-foreground">{entries.length} tests recorded</p>
      )}
    </button>
  );
}

function PredictedFinalCard({
  forecast,
}: {
  forecast: ForecastResult | null;
}) {
  const predicted = forecast?.final;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-center relative overflow-hidden">
      <div className="flex items-center justify-center gap-1">
        <Sparkles className="h-3 w-3 text-primary" />
        <p className="text-xs font-semibold text-primary">Final /50 (Predicted)</p>
      </div>
      <p className="mt-1 text-lg font-bold text-foreground">
        {predicted ? `~${predicted.expected.toFixed(1)}` : "—"}
      </p>
      <p className="text-[10px] text-muted-foreground truncate">
        {predicted
          ? `Range: ${predicted.low.toFixed(0)}–${predicted.high.toFixed(0)}`
          : "Take quizzes to forecast"}
      </p>
    </div>
  );
}

function CoursePage() {
  const { courseId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const uid = user!.uid;

  const [course, setCourse] = useState<Course | null>(null);
  const [courseLoading, setCourseLoading] = useState(true);
  const { items: resources, loading: resLoading } = useCollection<Resource>(uid, "courses", courseId, "resources");
  const { items: attempts, loading: attLoading } = useCollection<Attempt>(uid, "courses", courseId, "attempts");

  const [editing, setEditing] = useState(false);
  const [addingResource, setAddingResource] = useState(false);
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceType, setResourceType] = useState<"text" | "photo">("text");
  const [resourceContent, setResourceContent] = useState("");
  const [resourceExamTag, setResourceExamTag] = useState<"mid" | "final">("mid");
  const [resourcePhotos, setResourcePhotos] = useState<{ base64: string; dataUrl: string }[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [resourceBusy, setResourceBusy] = useState(false);

  const handleResourcePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploadingPhotos(true);
    try {
      const compressed = await Promise.all(Array.from(files).map((f) => compressImage(f)));
      setResourcePhotos((prev) => {
        const combined = [...prev, ...compressed];
        if (combined.length > 8) {
          toast.warning("Maximum 8 photos allowed. Keeping first 8.");
          return combined.slice(0, 8);
        }
        return combined;
      });
      toast.success(`${files.length} photo(s) selected`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process photo");
    } finally {
      setUploadingPhotos(false);
      e.target.value = "";
    }
  };

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const db = await getFirestoreDb();
      const { doc, onSnapshot } = await import("firebase/firestore");
      unsub = onSnapshot(doc(db, "users", uid, "courses", courseId), (snap) => {
        setCourse(snap.exists() ? ({ id: snap.id, ...snap.data() } as Course) : null);
        setCourseLoading(false);
      });
    })().catch(() => setCourseLoading(false));
    return () => unsub?.();
  }, [uid, courseId]);

  const updateCourse = async (values: { code: string; title: string; credit: number }) => {
    const db = await getFirestoreDb();
    const { doc, updateDoc } = await import("firebase/firestore");
    await updateDoc(doc(db, "users", uid, "courses", courseId), { ...values, updatedAt: Date.now() });
    setEditing(false);
  };

  const deleteCourse = async () => {
    if (!confirm("Delete this course and all its resources? This cannot be undone.")) return;
    const db = await getFirestoreDb();
    const { doc, deleteDoc } = await import("firebase/firestore");
    await deleteDoc(doc(db, "users", uid, "courses", courseId));
    void navigate({ to: "/dashboard" });
  };

  const updateMarks = async (field: string, value: number | null) => {
    const db = await getFirestoreDb();
    const { doc, updateDoc } = await import("firebase/firestore");
    await updateDoc(doc(db, "users", uid, "courses", courseId), { [field]: value, updatedAt: Date.now() });
    toast.success("Mark updated!");
  };

  const updateCtEntries = async (entries: CtEntry[]) => {
    const db = await getFirestoreDb();
    const { doc, updateDoc } = await import("firebase/firestore");
    await updateDoc(doc(db, "users", uid, "courses", courseId), { ctEntries: entries, updatedAt: Date.now() });
    toast.success("CT marks updated!");
  };

  const addResource = async () => {
    if (!resourceTitle.trim()) return;
    if (resourceType === "photo" && resourcePhotos.length === 0) {
      toast.error("Please add at least one photo.");
      return;
    }
    setResourceBusy(true);
    try {
      const db = await getFirestoreDb();
      const { collection, addDoc } = await import("firebase/firestore");
      const now = Date.now();
      await addDoc(collection(db, "users", uid, "courses", courseId, "resources"), {
        title: resourceTitle.trim(),
        type: resourceType,
        examTag: resourceExamTag,
        content: resourceType === "text" ? resourceContent : null,
        extractedText: null,
        summary: null,
        summaryGeneratedAt: null,
        summaryModel: null,
        imageCount: resourceType === "photo" ? resourcePhotos.length : 0,
        images: resourceType === "photo" ? resourcePhotos.map((p) => p.base64) : [],
        createdAt: now,
        updatedAt: now,
      });
      setResourceTitle("");
      setResourceContent("");
      setResourcePhotos([]);
      setAddingResource(false);
      toast.success("Resource added!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add resource");
    } finally {
      setResourceBusy(false);
    }
  };

  if (courseLoading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!course) return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <p className="text-muted-foreground">Course not found.</p>
      <Link to="/dashboard" className="text-sm text-primary underline-offset-4 hover:underline">Back to dashboard</Link>
    </div>
  );

  const resourceInfos = resources.map((r) => ({ id: r.id, examTag: r.examTag }));
  const attemptInfos = attempts.map((a) => {
    const rawRids = a.questionResources ?? [];
    const defaultRid = Object.keys(a.perResource ?? {})[0] ?? "";
    return {
      createdAt: a.createdAt,
      questions: (a.answers ?? []).map((chosen, i) => ({
        resourceId: rawRids[i] || defaultRid,
        correct: a.correctAnswers ? chosen === a.correctAnswers[i] : true,
      })),
    };
  });

  const forecast = computeForecast({
    attendance: course.attendance,
    ctEntries: course.ctEntries ?? [],
    mid: course.mid,
    final: null, // Always predict final mark based on quizzes and continuous assessment
    attempts: attemptInfos,
    resources: resourceInfos,
    now: Date.now(),
  });

  const confidence = computeConfidence(attemptInfos, resourceInfos, Date.now());

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <Link to="/dashboard" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>

      {editing ? (
        <div className="mb-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-base font-semibold">Edit Course</h2>
          <CourseForm initial={course} onSubmit={updateCourse} onCancel={() => setEditing(false)} />
        </div>
      ) : (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-primary/10 px-2.5 py-1 text-sm font-semibold text-primary">{course.code}</span>
              <span className="text-sm text-muted-foreground">{course.credit} credits</span>
            </div>
            <h1 className="font-display mt-2 text-2xl font-bold text-foreground">{course.title}</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent" aria-label="Edit">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={() => void deleteCourse()} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-destructive hover:bg-destructive/10" aria-label="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Marks */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Marks & Predictions</h2>
          <span className="text-xs text-muted-foreground">Click Attendance, CT, or Mid to edit</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MarkInput
            label={`Attendance /${MARKS.attendance}`}
            value={course.attendance}
            max={MARKS.attendance}
            onSave={(v) => updateMarks("attendance", v)}
          />
          <CtInput
            entries={course.ctEntries ?? []}
            onSave={updateCtEntries}
          />
          <MarkInput
            label={`Mid /${MARKS.mid}`}
            value={course.mid}
            max={MARKS.mid}
            onSave={(v) => updateMarks("mid", v)}
          />
          <PredictedFinalCard forecast={forecast} />
        </div>
      </section>

      {/* Forecast & Confidence */}
      {forecast && (
        <section className="mb-8 rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Grade Forecast & Confidence
            </h2>
            {forecast.final && (
              <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                Predicting Final: ~{forecast.final.expected.toFixed(1)}/50
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-4xl font-bold text-foreground">{forecast.grade}</p>
              <p className="text-sm text-muted-foreground">{forecast.gradePoint.toFixed(2)} GP</p>
            </div>
            <div className="flex-1 space-y-1 text-sm min-w-40">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Overall Low</span>
                <span className="font-medium">{forecast.total.low.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected Overall</span>
                <span className="font-semibold text-foreground">{forecast.total.expected.toFixed(1)} / 100</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Overall High</span>
                <span className="font-medium">{forecast.total.high.toFixed(1)}</span>
              </div>
            </div>

            {/* Confidence Score Display */}
            <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-background/50 p-3 min-w-36 text-center">
              {confidence.status === "ok" ? (
                <>
                  <ConfidenceRing score={confidence.score} size={64} />
                  <div>
                    <p className="text-xs font-semibold text-foreground">{confidence.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Based on {attempts.length} quiz{attempts.length === 1 ? "" : "zes"}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30 text-muted-foreground">
                    <span className="text-xs font-semibold">?</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Building Confidence</p>
                    <p className="text-[10px] text-muted-foreground">
                      {attempts.length}/2 quizzes completed
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {forecast.neededForNextGrades.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">Final exam mark needed for next grades:</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {forecast.neededForNextGrades.map((n) => (
                  <span key={n.grade} className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium">
                    {n.grade}: {n.needed}/50 in Final
                  </span>
                ))}
              </div>
            </div>
          )}
          {forecast.tip && <p className="mt-3 rounded-xl bg-accent/60 px-3 py-2 text-xs text-muted-foreground">💡 {forecast.tip}</p>}
        </section>
      )}

      {/* Resources */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Resources</h2>
          <button onClick={() => setAddingResource(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>

        {addingResource && (
          <div className="mb-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-4 text-base font-semibold text-foreground">New Resource</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Resource Title</label>
                <input
                  value={resourceTitle}
                  onChange={(e) => setResourceTitle(e.target.value)}
                  placeholder="e.g. Chapter 3 Notes / Week 4 Whiteboard"
                  className="min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Exam Segment</label>
                  <select
                    value={resourceExamTag}
                    onChange={(e) => setResourceExamTag(e.target.value as "mid" | "final")}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="mid">Mid Exam</option>
                    <option value="final">Final Exam</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Resource Type</label>
                  <select
                    value={resourceType}
                    onChange={(e) => setResourceType(e.target.value as "text" | "photo")}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="text">Text / Notes</option>
                    <option value="photo">Photo(s) of Notes / Slides</option>
                  </select>
                </div>
              </div>

              {resourceType === "text" ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes Content</label>
                  <textarea
                    value={resourceContent}
                    onChange={(e) => setResourceContent(e.target.value)}
                    placeholder="Paste or write your study notes, formulas, lecture summary…"
                    rows={5}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Photos (Lecture notes, whiteboard, textbook)
                  </label>
                  <div className="rounded-xl border-2 border-dashed border-border bg-accent/20 p-5 text-center transition-colors hover:border-primary/50">
                    <input
                      id="resource-photo-upload"
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      onChange={(e) => void handleResourcePhotoUpload(e)}
                    />
                    <label htmlFor="resource-photo-upload" className="flex cursor-pointer flex-col items-center justify-center gap-2">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Camera className="h-6 w-6" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-foreground">
                          {uploadingPhotos ? "Compressing photos…" : "Click or tap to upload photos"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Upload photos of notes, slides, or whiteboard (PNG, JPG, up to 8 photos)
                        </p>
                      </div>
                    </label>
                  </div>

                  {resourcePhotos.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{resourcePhotos.length} photo(s) selected</span>
                        <button
                          type="button"
                          onClick={() => setResourcePhotos([])}
                          className="text-destructive hover:underline"
                        >
                          Clear all
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {resourcePhotos.map((photo, index) => (
                          <div key={index} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                            <img src={photo.dataUrl} alt={`Photo ${index + 1}`} className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setResourcePhotos(resourcePhotos.filter((_, i) => i !== index))}
                              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white transition-opacity hover:bg-destructive"
                              title="Remove"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                              #{index + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddingResource(false);
                    setResourceTitle("");
                    setResourceContent("");
                    setResourcePhotos([]);
                  }}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void addResource()}
                  disabled={resourceBusy || !resourceTitle.trim() || (resourceType === "photo" && resourcePhotos.length === 0)}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
                >
                  {resourceBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save Resource
                </button>
              </div>
            </div>
          </div>
        )}

        {resLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : resources.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-border py-12 text-center">
            <BookOpen className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No resources yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {resources.map((r) => (
              <Link key={r.id} to="/dashboard/courses/$courseId/resources/$resourceId" params={{ courseId, resourceId: r.id }}
                className="group flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/30">
                <div className="flex items-center gap-3 min-w-0">
                  {r.type === "photo" ? <Camera className="h-4 w-4 shrink-0 text-muted-foreground" /> : <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">{r.examTag} · {r.summary ? "Summarized" : "No summary"}</p>
                  </div>
                </div>
                {r.summary && <Sparkles className="ml-2 h-3.5 w-3.5 shrink-0 text-primary" />}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Quizzes */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Quizzes</h2>
          <Link to="/dashboard/courses/$courseId/quiz" params={{ courseId }} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
            <ClipboardList className="h-3.5 w-3.5" /> Take Quiz
          </Link>
        </div>
        {attLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : attempts.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-border py-12 text-center">
            <ClipboardList className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No attempts yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {attempts.slice(0, 5).map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{a.score}/{a.total} correct</p>
                  <p className="text-xs text-muted-foreground">{a.difficulty} · {new Date(a.createdAt).toLocaleDateString()}</p>
                </div>
                <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${a.score / a.total >= 0.7 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"}`}>
                  {Math.round((a.score / a.total) * 100)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
