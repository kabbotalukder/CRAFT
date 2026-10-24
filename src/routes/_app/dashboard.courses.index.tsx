import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, BookOpen, ChevronRight, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getFirestoreDb } from "@/lib/firebase";
import type { Course } from "@/lib/types";
import { CourseForm } from "@/components/course-form";
import { computeForecast } from "@/lib/forecast";
import { gradeFor } from "@/lib/constants";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/dashboard/courses/")({
  head: () => ({ meta: [{ title: "Courses — Craft" }] }),
  component: CoursesPage,
});

function CoursesPage() {
  const { user } = useAuth();
  const uid = user!.uid;

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const db = await getFirestoreDb();
      const { collection, query, orderBy, onSnapshot } = await import("firebase/firestore");
      const q = query(collection(db, "users", uid, "courses"), orderBy("createdAt", "desc"));
      unsub = onSnapshot(q, (snap) => {
        setCourses(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Course));
        setLoading(false);
      });
    })().catch(() => setLoading(false));
    return () => unsub?.();
  }, [uid]);

  const handleAdd = async (values: { code: string; title: string; credit: number }) => {
    try {
      const db = await getFirestoreDb();
      const { collection, addDoc } = await import("firebase/firestore");
      const now = Date.now();
      await addDoc(collection(db, "users", uid, "courses"), {
        ...values,
        attendance: null,
        ctEntries: [],
        mid: null,
        final: null,
        createdAt: now,
        updatedAt: now,
      });
      toast.success("Course added successfully!");
      setShowForm(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("permission") || msg.includes("insufficient")) {
        toast.error("Firestore permission denied. Check your Firebase security rules.");
      } else {
        toast.error("Failed to add course.");
      }
      throw err;
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold text-foreground">Courses</h1>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add Course
        </button>
      </div>

      {showForm && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-base font-semibold">New Course</h2>
          <CourseForm onSubmit={handleAdd} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : courses.length === 0 && !showForm ? (
        <div className="flex flex-col items-center py-24 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <p className="text-base font-medium">No courses yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Click "Add Course" to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map((c) => {
            const f = computeForecast({
              attendance: c.attendance,
              ctEntries: c.ctEntries,
              mid: c.mid,
              final: null,
              attempts: [],
              resources: [],
              now: Date.now(),
            });
            const grade = f ? gradeFor(f.total.expected) : null;
            return (
              <Link
                key={c.id}
                to="/dashboard/courses/$courseId"
                params={{ courseId: c.id }}
                className="group flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{c.code}</span>
                    <span className="text-xs text-muted-foreground">{c.credit} cr</span>
                  </div>
                  <p className="mt-1.5 truncate text-sm font-medium text-foreground">{c.title}</p>
                  {grade && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Projected: <span className="font-semibold text-foreground">{grade.letter} ({f!.total.expected.toFixed(1)})</span>
                    </p>
                  )}
                </div>
                <ChevronRight className="ml-3 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
