import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  Trash2,
  Camera,
  Upload,
  X,
  ChevronDown,
  Copy,
  Check,
  Send,
  RotateCcw,
  Bot,
  FileText,
  ScanText,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getFirestoreDb } from "@/lib/firebase";
import type { Resource } from "@/lib/types";
import { Markdown } from "@/components/markdown";
import { summarizeText, summarizeImages } from "@/lib/ai";
import { chatWithGemma } from "@/lib/chat.functions";
import { compressImage } from "@/lib/compress-image";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_app/dashboard/courses/$courseId/resources/$resourceId",
)({
  head: () => ({ meta: [{ title: "Resource — Craft" }] }),
  component: ResourcePage,
});

interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  createdAt: number;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title={copied ? "Copied!" : label}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}

function AccordionSection({
  title,
  icon,
  badge,
  isOpen,
  onToggle,
  action,
  children,
  className = "",
}: {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border transition-all ${className}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="flex cursor-pointer items-center justify-between p-4 sm:p-5 select-none hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-foreground truncate">{title}</h2>
              {badge}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {action && (
            <div onClick={(e) => e.stopPropagation()}>
              {action}
            </div>
          )}
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          >
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-border/60 p-4 sm:p-5 bg-card/50">
          {children}
        </div>
      )}
    </div>
  );
}

function ResourceChat({
  resource,
  uid,
  resourceId,
}: {
  resource: Resource;
  uid: string;
  resourceId: string;
}) {
  const storageKey = `craft_chat_${uid}_${resourceId}`;

  const defaultIntro: ChatMessage = {
    id: "welcome",
    role: "model",
    text: `👋 Hi! I'm your Craft study assistant for **"${resource.title}"**.\n\nAsk me any follow-up questions about this topic, ask for simplified explanations, real-world examples, or have me test your knowledge!`,
    createdAt: Date.now(),
  };

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return [defaultIntro];
  });

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages, storageKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const handleClear = () => {
    if (messages.length <= 1) return;
    if (confirm("Clear chat history for this resource?")) {
      setMessages([defaultIntro]);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }
  };

  const buildContext = () => {
    const parts = [
      `RESOURCE TITLE: ${resource.title}`,
      `RESOURCE TYPE: ${resource.type}`,
      `EXAM SCOPE: ${resource.examTag}`,
    ];
    if (resource.summary) {
      parts.push(`AI SUMMARY OF RESOURCE:\n${resource.summary}`);
    }
    if (resource.extractedText) {
      parts.push(`EXTRACTED TEXT FROM NOTES/PHOTOS:\n${resource.extractedText}`);
    }
    if (resource.content) {
      parts.push(`ORIGINAL CONTENT:\n${resource.content}`);
    }
    return parts.join("\n\n---\n\n");
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim();
    if (!text || sending) return;

    const userMessage: ChatMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      text,
      createdAt: Date.now(),
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    try {
      const apiMessages = nextMessages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({
          role: m.role,
          text: m.text,
        }));

      if (apiMessages.length === 0) {
        apiMessages.push({ role: "user", text });
      }

      const res = await chatWithGemma({
        data: {
          messages: apiMessages,
          context: buildContext(),
        },
      });

      const modelMessage: ChatMessage = {
        id: `m_${Date.now()}`,
        role: "model",
        text: res.text,
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, modelMessage]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to get AI response";
      toast.error(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "model",
          text: `⚠️ **Error:** ${msg}\n\nPlease check your connection or try again.`,
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const quickPrompts = [
    "Key concepts to remember",
    "Explain in simple terms",
    "Quiz me with 3 questions",
    "Exam tips for this topic",
  ];

  return (
    <div className="flex h-[620px] flex-col rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">Resource Assistant</h3>
            <p className="text-[11px] text-muted-foreground truncate">
              Follow-up questions on this topic
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClear}
          title="Reset conversation"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-sm">
        {messages.map((m) => {
          const isUser = m.role === "user";
          return (
            <div
              key={m.id}
              className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
            >
              {!isUser && (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary mt-0.5">
                  <Bot className="h-3.5 w-3.5" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
                  isUser
                    ? "bg-primary text-primary-foreground rounded-br-xs"
                    : "bg-muted/60 text-foreground border border-border/60 rounded-bl-xs"
                }`}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap">{m.text}</p>
                ) : (
                  <Markdown>{m.text}</Markdown>
                )}
              </div>
            </div>
          );
        })}

        {sending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl border border-border/60 bg-muted/40 px-3 py-2 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Craft is thinking…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Suggestions */}
      <div className="border-t border-border/50 bg-muted/20 px-3 py-2">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={sending}
              onClick={() => void handleSend(prompt)}
              className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className="flex items-center gap-2 border-t border-border bg-card p-3 shrink-0"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about this topic…"
          disabled={sending}
          className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-xs sm:text-sm outline-none transition-colors focus:border-primary disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </form>
    </div>
  );
}

function ResourcePage() {
  const { courseId, resourceId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const uid = user!.uid;

  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  const [mobileTab, setMobileTab] = useState<"resource" | "chat">("resource");

  const [openSections, setOpenSections] = useState({
    summary: true,
    extractedText: false,
    content: true,
    photos: true,
  });

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const db = await getFirestoreDb();
      const { doc, onSnapshot } = await import("firebase/firestore");
      unsub = onSnapshot(
        doc(db, "users", uid, "courses", courseId, "resources", resourceId),
        (snap) => {
          if (snap.exists()) {
            const data = { id: snap.id, ...snap.data() } as Resource;
            setResource(data);
            if (data.images && data.images.length > 0) {
              setImages((prev) => (prev.length === 0 ? data.images! : prev));
            }
          } else {
            setResource(null);
          }
          setLoading(false);
        },
      );
    })().catch(() => setLoading(false));
    return () => unsub?.();
  }, [uid, courseId, resourceId]);

  const handleSummarize = async () => {
    if (!resource) return;
    setSummarizing(true);
    try {
      let result;
      if (resource.type === "photo" && images.length > 0) {
        result = await summarizeImages(images);
      } else if (resource.content) {
        result = await summarizeText(resource.content);
      } else {
        toast.error("No content to summarize.");
        return;
      }
      const db = await getFirestoreDb();
      const { doc, updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, "users", uid, "courses", courseId, "resources", resourceId), {
        summary: result.summary,
        extractedText: result.extractedText,
        summaryGeneratedAt: Date.now(),
        summaryModel: "gemini-2.5-flash",
        imageCount: images.length,
        images,
        updatedAt: Date.now(),
      });
      setOpenSections((prev) => ({ ...prev, summary: true }));
      toast.success("Summary generated!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to summarize");
    } finally {
      setSummarizing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this resource?")) return;
    setDeleting(true);
    try {
      const db = await getFirestoreDb();
      const { doc, deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(db, "users", uid, "courses", courseId, "resources", resourceId));
      void navigate({ to: "/dashboard/courses/$courseId", params: { courseId } });
    } catch {
      toast.error("Failed to delete resource");
      setDeleting(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploadingImages(true);
    try {
      const compressed = await Promise.all(Array.from(files).map((f) => compressImage(f)));
      const nextImages = [...images, ...compressed.map((c) => c.base64)].slice(0, 8);
      setImages(nextImages);
      const db = await getFirestoreDb();
      const { doc, updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, "users", uid, "courses", courseId, "resources", resourceId), {
        images: nextImages,
        imageCount: nextImages.length,
        updatedAt: Date.now(),
      });
      toast.success(`${files.length} photo(s) added`);
    } catch {
      toast.error("Failed to process images");
    } finally {
      setUploadingImages(false);
      e.target.value = "";
    }
  };

  const handleRemoveImage = async (index: number) => {
    const nextImages = images.filter((_, i) => i !== index);
    setImages(nextImages);
    try {
      const db = await getFirestoreDb();
      const { doc, updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, "users", uid, "courses", courseId, "resources", resourceId), {
        images: nextImages,
        imageCount: nextImages.length,
        updatedAt: Date.now(),
      });
      toast.success("Photo removed");
    } catch {
      toast.error("Failed to update photos");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Resource not found.</p>
        <Link
          to="/dashboard/courses/$courseId"
          params={{ courseId }}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Back to course
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
      {/* Navigation */}
      <Link
        to="/dashboard/courses/$courseId"
        params={{ courseId }}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to course
      </Link>

      {/* Top Header Card */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary capitalize">
              {resource.type}
            </span>
            <span className="rounded-md bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground capitalize">
              {resource.examTag}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {resource.title}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleSummarize()}
            disabled={summarizing || (!resource.content && images.length === 0)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:opacity-60"
          >
            {summarizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {summarizing ? "Summarizing…" : resource.summary ? "Re-summarize" : "Summarize"}
          </button>

          <button
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-destructive hover:bg-destructive/10 transition-colors"
            aria-label="Delete"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Tab Switcher */}
      <div className="mb-4 flex rounded-xl bg-muted/60 p-1 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("resource")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all ${
            mobileTab === "resource"
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground"
          }`}
        >
          <FileText className="h-4 w-4" />
          Resource Details
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("chat")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all ${
            mobileTab === "chat"
              ? "bg-background text-primary shadow-xs"
              : "text-muted-foreground"
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          AI Study Assistant
        </button>
      </div>

      {/* Main Grid: Left = Accordions, Right = Chat Panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left Column: Accordions for Content, Extracted Text, Summary, Photos */}
        <div
          className={`space-y-4 lg:col-span-7 xl:col-span-7 ${
            mobileTab === "resource" ? "block" : "hidden lg:block"
          }`}
        >
          {/* Quick controls: Expand/Collapse All */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium text-muted-foreground">Resource Sections</span>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() =>
                  setOpenSections({
                    summary: true,
                    extractedText: true,
                    content: true,
                    photos: true,
                  })
                }
                className="text-primary hover:underline"
              >
                Expand all
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                onClick={() =>
                  setOpenSections({
                    summary: false,
                    extractedText: false,
                    content: false,
                    photos: false,
                  })
                }
                className="text-muted-foreground hover:text-foreground"
              >
                Collapse all
              </button>
            </div>
          </div>

          {/* 1. AI Summary Accordion */}
          <AccordionSection
            title="AI Summary"
            icon={<Sparkles className="h-4.5 w-4.5" />}
            badge={
              resource.summary ? (
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  Generated
                </span>
              ) : (
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  Not Generated
                </span>
              )
            }
            isOpen={openSections.summary}
            onToggle={() => toggleSection("summary")}
            action={resource.summary ? <CopyButton text={resource.summary} label="Copy Summary" /> : undefined}
            className="border-primary/20 bg-primary/5"
          >
            {resource.summary ? (
              <div className="space-y-3">
                {resource.summaryGeneratedAt && (
                  <div className="flex items-center justify-end border-b border-border/50 pb-2 text-[11px] text-muted-foreground">
                    <span>Generated {new Date(resource.summaryGeneratedAt).toLocaleString()}</span>
                  </div>
                )}
                <Markdown>{resource.summary}</Markdown>
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <Sparkles className="mb-2 h-7 w-7 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">No summary generated yet</p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  {resource.type === "photo"
                    ? "Upload photos and click Summarize to extract notes and generate a study guide."
                    : "Click Summarize to generate an AI study digest of this content."}
                </p>
                <button
                  type="button"
                  onClick={() => void handleSummarize()}
                  disabled={summarizing || (!resource.content && images.length === 0)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {summarizing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {summarizing ? "Generating…" : "Generate Summary"}
                </button>
              </div>
            )}
          </AccordionSection>

          {/* 2. Extracted Text Accordion (if present) */}
          {Boolean(resource.extractedText) && (
            <AccordionSection
              title="Extracted Text (OCR)"
              icon={<ScanText className="h-4.5 w-4.5" />}
              badge={
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {resource.extractedText!.length.toLocaleString()} characters
                </span>
              }
              isOpen={openSections.extractedText}
              onToggle={() => toggleSection("extractedText")}
              action={<CopyButton text={resource.extractedText!} label="Copy Text" />}
              className="border-border bg-card"
            >
              <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-3.5 font-mono text-xs leading-relaxed text-foreground">
                {resource.extractedText}
              </pre>
            </AccordionSection>
          )}

          {/* 3. Original Content Accordion (if present) */}
          {Boolean(resource.content) && (
            <AccordionSection
              title="Original Content"
              icon={<FileText className="h-4.5 w-4.5" />}
              badge={
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {resource.content!.trim().split(/\s+/).length} words
                </span>
              }
              isOpen={openSections.content}
              onToggle={() => toggleSection("content")}
              action={<CopyButton text={resource.content!} label="Copy Content" />}
              className="border-border bg-card"
            >
              <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/30 p-3.5 text-sm leading-relaxed text-foreground">
                {resource.content}
              </pre>
            </AccordionSection>
          )}

          {/* 4. Uploaded Photos Accordion (for photo resources) */}
          {resource.type === "photo" && (
            <AccordionSection
              title="Uploaded Photos"
              icon={<Camera className="h-4.5 w-4.5" />}
              badge={
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {images.length} photo{images.length === 1 ? "" : "s"}
                </span>
              }
              isOpen={openSections.photos}
              onToggle={() => toggleSection("photos")}
              action={
                <label
                  htmlFor="photo-upload-more"
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploadingImages ? "Compressing…" : "Add Photos"}
                </label>
              }
              className="border-border bg-card"
            >
              <input
                id="photo-upload-more"
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => void handleImageUpload(e)}
              />

              {images.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {images.map((base64, index) => {
                    const src = base64.startsWith("data:")
                      ? base64
                      : `data:image/jpeg;base64,${base64}`;
                    return (
                      <div
                        key={index}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted shadow-sm"
                      >
                        <img
                          src={src}
                          alt={`Photo ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => void handleRemoveImage(index)}
                          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-90 transition-opacity hover:bg-destructive hover:opacity-100"
                          title="Remove photo"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          Photo #{index + 1}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border-2 border-dashed border-border bg-accent/20 p-8 text-center transition-colors hover:border-primary/50">
                  <input
                    id="photo-upload-initial"
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => void handleImageUpload(e)}
                  />
                  <label
                    htmlFor="photo-upload-initial"
                    className="flex cursor-pointer flex-col items-center justify-center gap-2"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Camera className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Click to upload photos</p>
                      <p className="text-xs text-muted-foreground">
                        Upload photos of your notes, whiteboard, or slides (PNG, JPG)
                      </p>
                    </div>
                  </label>
                </div>
              )}
            </AccordionSection>
          )}
        </div>

        {/* Right Column: AI Assistant Follow-Up Chat Panel */}
        <div
          className={`lg:col-span-5 xl:col-span-5 lg:sticky lg:top-6 ${
            mobileTab === "chat" ? "block" : "hidden lg:block"
          }`}
        >
          <ResourceChat resource={resource} uid={uid} resourceId={resourceId} />
        </div>
      </div>
    </div>
  );
}
