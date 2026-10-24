import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Plus,
  BookOpen,
  TrendingUp,
  ChevronRight,
  Loader2,
  GraduationCap,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getFirestoreDb } from "@/lib/firebase";
import type { Course } from "@/lib/types";
import { computeForecast } from "@/lib/forecast";
import { CourseForm } from "@/components/course-form";
import { gradeFor } from "@/lib/constants";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/dashboard/")({
  head: () => ({ meta: [{ title: "Dashboard — Craft" }] }),
  component: Dashboard,
});

function useCourses(uid: string) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const db = await getFirestoreDb();
      const { collection, query, orderBy, onSnapshot } = await import("firebase/firestore");
      const q = query(
        collection(db, "users", uid, "courses"),
        orderBy("createdAt", "desc"),
      );
      unsub = onSnapshot(q, (snap) => {
        setCourses(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Course));
        setLoading(false);
      });
    })().catch(() => setLoading(false));
    return () => unsub?.();
  }, [uid]);

  return { courses, loading };
}

async function addCourse(
  uid: string,
  values: { code: string; title: string; credit: number },
) {
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
}

function CourseCard({ course }: { course: Course }) {
  const forecast = computeForecast({
    attendance: course.attendance,
    ctEntries: course.ctEntries,
    mid: course.mid,
    final: null,
    attempts: [],
    resources: [],
    now: Date.now(),
  });

  const grade = forecast ? gradeFor(forecast.total.expected) : null;

  return (
    <Link
      to="/dashboard/courses/$courseId"
      params={{ courseId: course.id }}
      className="group flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {course.code}
          </span>
          <span className="text-xs text-muted-foreground">{course.credit} cr</span>
        </div>
        <p className="mt-1.5 truncate text-sm font-medium text-foreground">{course.title}</p>
        {grade && (
          <p className="mt-1 text-xs text-muted-foreground">
            Projected:{" "}
            <span className="font-semibold text-foreground">
              {grade.letter} ({forecast!.total.expected.toFixed(1)})
            </span>
          </p>
        )}
      </div>
      <ChevronRight className="ml-3 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const { courses, loading } = useCourses(user!.uid);
  const [showForm, setShowForm] = useState(false);

  const handleAdd = async (values: { code: string; title: string; credit: number }) => {
    try {
      await addCourse(user!.uid, values);
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

  const totalCredits = courses.reduce((s, c) => s + c.credit, 0);
  const gradePoints = courses
    .map((c) => {
      const f = computeForecast({
        attendance: c.attendance,
        ctEntries: c.ctEntries,
        mid: c.mid,
        final: null,
        attempts: [],
        resources: [],
        now: Date.now(),
      });
      return f ? gradeFor(f.total.expected).point * c.credit : null;
    })
    .filter((v): v is number => v !== null);
  const cgpa =
    totalCredits > 0 && gradePoints.length > 0
      ? (gradePoints.reduce((a, b) => a + b, 0) / totalCredits).toFixed(2)
      : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back,{" "}
            <span className="font-medium text-foreground">
              {user?.displayName?.split(" ")[0] ?? "there"}
            </span>
          </p>
        </div>
        <button
          id="add-course-btn"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/30 hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add Course
        </button>
      </div>

      {/* Stats */}
      {courses.length > 0 && (
        <div className="mb-8 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <BookOpen className="mb-2 h-5 w-5 text-primary" />
            <p className="text-2xl font-bold text-foreground">{courses.length}</p>
            <p className="text-xs text-muted-foreground">Courses</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <TrendingUp className="mb-2 h-5 w-5 text-primary" />
            <p className="text-2xl font-bold text-foreground">{totalCredits}</p>
            <p className="text-xs text-muted-foreground">Credits</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <GraduationCap className="mb-2 h-5 w-5 text-primary" />
            <p className="text-2xl font-bold text-foreground">{cgpa ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Projected CGPA</p>
          </div>
        </div>
      )}

      {/* Add course form */}
      {showForm && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-foreground">New Course</h2>
          <CourseForm onSubmit={handleAdd} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {/* Course list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : courses.length === 0 && !showForm ? (
        <div className="flex flex-col items-center py-24 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <p className="text-base font-medium text-foreground">No courses yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click "Add Course" to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      )}
    </div>
  );
}
