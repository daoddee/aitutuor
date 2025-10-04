import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Upload, Send, Image as ImageIcon, Loader2, FileText, Download, Settings, Shield, CheckCircle2, AlertTriangle, Wifi, Play } from "lucide-react";

/**
 * Maths & Engineering AI Agent Frontend (Framework-agnostic, client-safe)
 * - FIX: Avoids `process.env` at module scope (which breaks in browsers: ReferenceError: process is not defined).
 * - Resolves the n8n webhook URL at runtime from multiple sources (in priority order):
 *     1) URL query param `?webhook=https://...`
 *     2) localStorage key `n8n_webhook_url`
 *     3) window.__N8N_WEBHOOK_URL__ (you can inject via a <script>)
 *     4) import.meta.env.VITE_N8N_WEBHOOK_URL or .NEXT_PUBLIC_N8N_WEBHOOK_URL (Vite/other bundlers)
 *     5) process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL (guarded; safe in Next.js builds)
 *     6) Hard fallback placeholder
 * - Adds a Settings panel to update/persist the webhook URL without rebuilding.
 * - Adds a Ping Test and Sample Prompts to validate the end-to-end flow.
 */

// --- Hard fallback (replace during deployment if you wish) ---
const DEFAULT_WEBHOOK_FALLBACK = "https://YOUR-N8N-DOMAIN/webhook/ai-agent";

function resolveWebhookUrlClientSafe(): string {
  try {
    // 1) URL param override (highest priority)
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const qp = url.searchParams.get("webhook");
      if (qp) return qp;
    }

    // 2) localStorage persisted value
    if (typeof window !== "undefined") {
      const ls = window.localStorage.getItem("n8n_webhook_url");
      if (ls) return ls;
    }

    // 3) window global injected by host page
    if (typeof window !== "undefined" && (window as any).__N8N_WEBHOOK_URL__) {
      return (window as any).__N8N_WEBHOOK_URL__ as string;
    }

    // 4) Vite/other bundlers runtime vars
    try {
      const meta: any = (typeof import.meta !== "undefined" && (import.meta as any).env) ? (import.meta as any).env : undefined;
      const viteVar = meta?.VITE_N8N_WEBHOOK_URL || meta?.NEXT_PUBLIC_N8N_WEBHOOK_URL;
      if (viteVar) return viteVar as string;
    } catch {}

    // 5) Next.js build-time inlining (guarded for non-Next environments)
    try {
      const nextVar = (typeof process !== "undefined" && (process as any)?.env?.NEXT_PUBLIC_N8N_WEBHOOK_URL) || undefined;
      if (nextVar) return nextVar as string;
    } catch {}

    // 6) Hard fallback
    return DEFAULT_WEBHOOK_FALLBACK;
  } catch {
    return DEFAULT_WEBHOOK_FALLBACK;
  }
}

export function AIMathsEngineeringFrontend() {
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string>("");
  const [files, setFiles] = useState<Array<{ name: string; url: string }>>([]);
  const [token, setToken] = useState<string>(""); // optional per-user token
  const [webhookUrl, setWebhookUrl] = useState<string>("");
  const [configNotice, setConfigNotice] = useState<string | null>(null);
  const [pingStatus, setPingStatus] = useState<"idle" | "ok" | "fail" | "running">("idle");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Resolve webhook URL at runtime (client-safe) once on mount
  useEffect(() => {
    const resolved = resolveWebhookUrlClientSafe();
    setWebhookUrl(resolved);
    if (!resolved || resolved === DEFAULT_WEBHOOK_FALLBACK) {
      setConfigNotice(
        "Webhook URL not configured. Update it in Settings or via ?webhook=… query param."
      );
    }
  }, []);

  // Persist webhook URL changes
  useEffect(() => {
    if (webhookUrl && typeof window !== "undefined") {
      window.localStorage.setItem("n8n_webhook_url", webhookUrl);
    }
  }, [webhookUrl]);

  const isWebhookLikelyValid = useMemo(() => {
    return /^https?:\/\//i.test(webhookUrl);
  }, [webhookUrl]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) setImageFile(f);
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf("image") !== -1) {
        const blob = item.getAsFile();
        if (blob) setImageFile(new File([blob], "pasted.png", { type: blob.type }));
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setAnswer("");
    setFiles([]);

    if (!isWebhookLikelyValid) {
      setLoading(false);
      setError("Invalid or missing webhook URL. Open Settings to configure.");
      return;
    }

    try {
      const form = new FormData();
      form.append("text", text);
      if (imageFile) form.append("image", imageFile);
      if (token) form.append("token", token);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);

      const res = await fetch(webhookUrl, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Upstream error ${res.status}: ${t}`);
      }
      const json = await res.json();
      setAnswer(json.answer_markdown || "");
      setFiles(Array.isArray(json.files) ? json.files : []);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setError("Request timed out after 60s. Try again or check your n8n logs.");
      } else {
        setError(err?.message || "Request failed");
      }
    } finally {
      setLoading(false);
    }
  }

  function renderMarkdown(md: string) {
    // Lightweight markdown rendering without extra deps.
    // If you want advanced LaTeX, drop in katex/remark/rehype.
    const withCode = (md || "")
      .replace(/```(\w+)?\n([\s\S]*?)```/g, (m, lang, code) => {
        return `<pre class="bg-gray-900 text-gray-100 p-4 rounded-2xl overflow-x-auto"><code>${escapeHtml(
          code
        )}</code></pre>`;
      })
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-semibold mb-2">$1</h1>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>')
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-3 mb-2">$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded">$1</code>')
      .replace(/\n\n/g, "<br/><br/>");
    return { __html: withCode };
  }

  function escapeHtml(s: string) {
    return (s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  async function handlePing() {
    if (!isWebhookLikelyValid) {
      setPingStatus("fail");
      setError("Webhook URL invalid. Fix in Settings.");
      return;
    }
    setPingStatus("running");
    setError(null);
    try {
      const form = new FormData();
      form.append("text", "__ping__");
      form.append("diagnostic", "true");
      const res = await fetch(webhookUrl, { method: "POST", body: form });
      if (!res.ok) throw new Error(`Ping failed: ${res.status}`);
      setPingStatus("ok");
    } catch (e: any) {
      setPingStatus("fail");
      setError(e?.message || "Ping failed");
    }
  }

  function useSample(prompt: string) {
    setText(prompt);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white px-4 py-10" data-app="ai-maths-engineering-frontend">
      <div className="max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Maths & Engineering AI Agent</h1>
          <p className="text-gray-600 mt-1">Upload a problem image or paste text. The agent will OCR, retrieve from your corpus, compute, and return a step-by-step answer.</p>
          {configNotice && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 px-4 py-3 text-sm flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 mt-0.5" />
              <div>{configNotice}</div>
            </div>
          )}
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-3 items-center">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prompt</label>
                  <textarea
                    id="prompt"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onPaste={onPaste}
                    placeholder="e.g., E=200 GPa, I=8e-6 m^4, L=3 m, w=4 kN/m, find max deflection"
                    className="w-full h-40 rounded-2xl border border-gray-200 p-4 focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${
                  dragOver ? "border-black bg-gray-50" : "border-gray-300"
                }`}
              >
                <p className="text-sm text-gray-600 mb-3">Drag & drop an image (handwritten/printed) or</p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 hover:bg-gray-50"
                  >
                    <Upload className="w-4 h-4" /> Choose image
                  </button>
                  {imageFile && (
                    <span className="text-sm text-gray-700 inline-flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" /> {imageFile.name}
                    </span>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Optional access token</label>
                  <input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="enter token if required"
                    className="w-full rounded-2xl border border-gray-200 p-3 focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <button
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-2xl bg-black text-white px-5 py-3 hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {loading ? "Submitting…" : "Submit"}
                </button>
              </div>

              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 mt-0.5" />
                  <div>
                    <div className="font-semibold">Request failed</div>
                    <div className="text-sm">{error}</div>
                  </div>
                </div>
              )}
            </form>

            {/* Answer */}
            {answer && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 rounded-2xl border p-5 bg-white"
              >
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4" />
                  <h3 className="font-semibold">Answer</h3>
                </div>
                <div className="prose max-w-none" dangerouslySetInnerHTML={renderMarkdown(answer)} />
                {files?.length > 0 && (
                  <div className="mt-4">
                    <div className="font-medium mb-2 flex items-center gap-2">
                      <Download className="w-4 h-4" /> Attachments
                    </div>
                    <ul className="list-disc list-inside">
                      {files.map((f, i) => (
                        <li key={i}>
                          <a className="text-blue-600 underline" href={f.url} target="_blank" rel="noreferrer">
                            {f.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            )}

            {/* Sample test prompts (runtime tests) */}
            <div className="mt-6 rounded-2xl border p-5 bg-white">
              <div className="flex items-center gap-2 mb-3">
                <Play className="w-4 h-4" />
                <h3 className="font-semibold">Sample Prompts (Smoke Tests)</h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <button
                  onClick={() =>
                    useSample(
                      "E=200e9 Pa, I=8e-6 m^4, L=3 m, w=4000 N/m. Find the max deflection for a simply supported beam under UDL."
                    )
                  }
                  className="rounded-xl border px-3 py-2 hover:bg-gray-50 text-left"
                >
                  Beam deflection (UDL)
                </button>
                <button
                  onClick={() =>
                    useSample(
                      "Hot in 120°C (2 kg/s, Cp=4.2 kJ/kgK), cold in 20°C (1.5 kg/s, Cp=4.2 kJ/kgK), epsilon=0.75. Estimate outlet temps (epsilon-NTU)."
                    )
                  }
                  className="rounded-xl border px-3 py-2 hover:bg-gray-50 text-left"
                >
                  Heat exchanger ε-NTU
                </button>
                <button
                  onClick={() => useSample("∫ (2x^3 - 4x + 1) dx; show steps and constant of integration.")}
                  className="rounded-xl border px-3 py-2 hover:bg-gray-50 text-left"
                >
                  Polynomial integral
                </button>
                <button
                  onClick={() => useSample("Convert 5 lbf·in to N·m and explain the conversion.")}
                  className="rounded-xl border px-3 py-2 hover:bg-gray-50 text-left"
                >
                  Unit conversion
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="rounded-2xl border bg-white p-5">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="w-4 h-4" />
                <h3 className="font-semibold">Backend config</h3>
              </div>
              <div className="space-y-3 text-sm text-gray-700">
                <label className="block">
                  <span className="text-gray-700">n8n Webhook URL</span>
                  <input
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://n8n.yourdomain.com/webhook/ai-agent"
                    className="mt-1 w-full rounded-2xl border border-gray-200 p-3 focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </label>
                <div className="text-xs text-gray-600">
                  You can also set via <code>?webhook=…</code> query param, <code>localStorage</code>,
                  or <code>window.__N8N_WEBHOOK_URL__</code>. This component no longer reads <code>process.env</code> at runtime.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePing}
                    className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 hover:bg-gray-50"
                  >
                    <Wifi className="w-4 h-4" /> Ping test
                  </button>
                  {pingStatus === "ok" && (
                    <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="w-4 h-4"/> Reachable</span>
                  )}
                  {pingStatus === "fail" && (
                    <span className="inline-flex items-center gap-1 text-red-700"><AlertTriangle className="w-4 h-4"/> Unreachable</span>
                  )}
                  {pingStatus === "running" && (
                    <span className="inline-flex items-center gap-1 text-gray-700"><Loader2 className="w-4 h-4 animate-spin"/> Testing…</span>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4" />
                <h3 className="font-semibold">Security</h3>
              </div>
              <ul className="text-sm text-gray-700 list-disc list-inside">
                <li>Use a per-user token or session to rate-limit abuse.</li>
                <li>Validate file type/size server-side; strip EXIF.</li>
                <li>Consider a proxy endpoint to hide the n8n URL.</li>
              </ul>
            </div>

            <div className="rounded-2xl border bg-white p-5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4" />
                <h3 className="font-semibold">n8n response shape</h3>
              </div>
              <pre className="text-xs bg-gray-50 p-3 rounded-xl overflow-x-auto">{`{
  "answer_markdown": "...",
  "files": [ { "name": "solution.pdf", "url": "https://..." } ]
}`}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Also export default for compatibility with both named and default imports.
export default AIMathsEngineeringFrontend;
