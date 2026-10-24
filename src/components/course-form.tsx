import { useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import type { Course } from "@/lib/types";

const courseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Course code is required, e.g. CSE-2101")
    .max(20),
  title: z.string().trim().min(2, "Course title is required").max(120),
  credit: z
    .number({ message: "Credit is required" })
    .min(0.5, "Minimum 0.5")
    .max(6, "Maximum 6")
    .multipleOf(0.5, "Credit must be in steps of 0.5"),
});

interface Props {
  initial?: Course;
  onSubmit: (values: { code: string; title: string; credit: number }) => Promise<void>;
  onCancel: () => void;
}

interface FormErrors {
  code?: string;
  title?: string;
  credit?: string;
}

export function CourseForm({ initial, onSubmit, onCancel }: Props) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [credit, setCredit] = useState(initial?.credit.toString() ?? "");
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = courseSchema.safeParse({
      code,
      title,
      credit: credit === "" ? NaN : Number(credit),
    });
    if (!parsed.success) {
      const next: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormErrors;
        next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await onSubmit(parsed.data);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw.toLowerCase().includes("permission") || raw.toLowerCase().includes("insufficient")) {
        setFormError(
          "Permission denied: Please ensure Firestore security rules are published in your Firebase Console.",
        );
      } else {
        setFormError(raw || "Failed to save course. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
      {formError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {formError}
        </div>
      )}
      <div>
        <label htmlFor="course-code" className="mb-1 block text-sm font-medium text-foreground">
          Course code
        </label>
        <input
          id="course-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="CSE-2101"
          className="min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code}</p>}
      </div>
      <div>
        <label htmlFor="course-title" className="mb-1 block text-sm font-medium text-foreground">
          Course title
        </label>
        <input
          id="course-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Data Structures"
          className="min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}
      </div>
      <div>
        <label htmlFor="course-credit" className="mb-1 block text-sm font-medium text-foreground">
          Credit (0.5–3)
        </label>
        <input
          id="course-credit"
          type="number"
          min={0.5}
          max={6}
          step={0.5}
          value={credit}
          onChange={(e) => setCredit(e.target.value)}
          placeholder="3"
          className="min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {errors.credit && <p className="mt-1 text-xs text-destructive">{errors.credit}</p>}
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {initial ? "Save changes" : "Add course"}
        </button>
      </div>
    </form>
  );
}
