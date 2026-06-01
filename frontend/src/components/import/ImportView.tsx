"use client";

import { useState, useRef, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { api, type Recipe, ApiError } from "@/lib/api";

type ImportState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; recipe: Recipe }
  | { status: "error"; message: string };

export function ImportView() {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  const [state, setState] = useState<ImportState>({ status: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const hasInput = url.trim() !== "" || text.trim() !== "" || imageBase64 !== null;

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix: "data:image/jpeg;base64," → keep only the base64 part
      const base64 = result.split(",")[1] ?? result;
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hasInput) return;

    setState({ status: "loading" });

    const payload: Parameters<typeof api.recipes.import>[0] = {};
    if (url.trim()) payload.url = url.trim();
    if (text.trim()) payload.text = text.trim();
    if (imageBase64) {
      payload.imageBase64 = imageBase64;
      payload.imageMediaType = "image/jpeg"; // best guess; could derive from file
    }

    try {
      const recipe = await api.recipes.import(payload);
      setState({ status: "success", recipe });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 422) {
          setState({
            status: "error",
            message:
              "Could not extract a recipe from that source. Try a different URL or paste the recipe text directly.",
          });
        } else {
          setState({ status: "error", message: err.message });
        }
      } else {
        setState({ status: "error", message: "Something went wrong. Please try again." });
      }
    }
  }

  function handleReset() {
    setUrl("");
    setText("");
    setImageBase64(null);
    setImageFileName(null);
    setState({ status: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (state.status === "success") {
    const recipe = state.recipe;
    const ingredientCount = recipe.ingredients?.length ?? 0;
    const stepCount = recipe.steps?.length ?? 0;

    return (
      <>
        <SectionHeader
          number="05"
          scene="RECIPE SAVED"
          title={
            <>
              <em className="italic text-terra">{recipe.title}</em>
            </>
          }
          description="AI extracted the recipe. Review it, then decide what to do next."
        />

        <div className="mt-14 rounded-xl border border-line bg-paper p-6">
          {/* Status badge + title */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="font-serif text-ink leading-tight mb-1" style={{ fontSize: "28px" }}>
                {recipe.title}
              </h2>
              {recipe.sourceUrl && (
                <p className="text-xs text-ink-mute truncate max-w-md">{recipe.sourceUrl}</p>
              )}
            </div>
            <Pill variant="terra-soft">parsed</Pill>
          </div>

          {/* Extracted counts */}
          <div className="flex flex-wrap gap-2 mb-6">
            {ingredientCount > 0 && (
              <Pill>{ingredientCount} ingredient{ingredientCount !== 1 ? "s" : ""}</Pill>
            )}
            {stepCount > 0 && (
              <Pill>{stepCount} step{stepCount !== 1 ? "s" : ""}</Pill>
            )}
          </div>

          {/* Ingredients preview */}
          {recipe.ingredients && recipe.ingredients.length > 0 && (
            <div className="mb-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-mute mb-2">
                Ingredients
              </p>
              <div className="text-sm text-ink leading-relaxed">
                {recipe.ingredients.slice(0, 6).map((ing) => (
                  <span key={ing.id} className="block">
                    · {ing.name}
                    {ing.amount !== null && (
                      <>
                        {" "}
                        <span className="bg-terra-soft text-terra px-1 py-0.5 rounded text-xs font-semibold">
                          {ing.amount}{ing.unit ? ` ${ing.unit}` : ""}
                        </span>
                      </>
                    )}
                  </span>
                ))}
                {recipe.ingredients.length > 6 && (
                  <span className="text-ink-mute text-xs">
                    + {recipe.ingredients.length - 6} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* CTA buttons */}
          <div className="flex gap-3 flex-wrap mt-2">
            <Button
              variant="terra"
              size="lg"
              onClick={() => router.push("/cookbook")}
            >
              View in Cookbook →
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={() => router.push(`/cook/${recipe.id}`)}
            >
              Start cooking
            </Button>
            <Button size="lg" onClick={handleReset}>
              Import another
            </Button>
          </div>
        </div>
      </>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  const isLoading = state.status === "loading";

  // ── Idle / error state ─────────────────────────────────────────────────────
  return (
    <>
      <SectionHeader
        number="05"
        scene="NEW RECIPE"
        title={
          <>
            Save a <em className="italic text-terra">recipe</em>.
          </>
        }
        description="Anywhere you find one — drop it in. AI extracts ingredients and steps."
      />

      <form onSubmit={handleSubmit} className="mt-14 space-y-6">
        {/* Drop zone / URL input */}
        <div
          className={[
            "rounded-xl border-[1.5px] border-dashed bg-paper-2 px-6 py-10 text-center transition-colors",
            isLoading
              ? "border-terra opacity-60"
              : "border-line-strong hover:border-ink-mute",
          ].join(" ")}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) {
              setImageFileName(file.name);
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                const base64 = result.split(",")[1] ?? result;
                setImageBase64(base64);
              };
              reader.readAsDataURL(file);
            }
            const text = e.dataTransfer.getData("text");
            if (text && text.startsWith("http")) {
              setUrl(text);
            }
          }}
        >
          {isLoading ? (
            <div className="space-y-4">
              <div className="text-3xl">⏳</div>
              <p className="font-serif italic text-xl text-ink">Reading the recipe…</p>
              <div className="flex flex-col items-center gap-2 text-sm text-ink-soft max-w-xs mx-auto">
                <ParseStep done text="Sending to AI" />
                <ParseStep loading text="Extracting ingredients & steps…" />
                <ParseStep text="Saving to cookbook" />
              </div>
            </div>
          ) : (
            <>
              <div className="text-3xl mb-2">⬇</div>
              <p className="font-serif italic text-xl text-ink mb-1">
                Drop screenshot or paste link
              </p>
              <p className="text-xs text-ink-mute">⌘V works on every screen</p>

              {imageFileName && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-forest-soft px-3 py-1 text-xs text-forest">
                  📷 {imageFileName}
                  <button
                    type="button"
                    onClick={() => { setImageBase64(null); setImageFileName(null); }}
                    className="hover:text-forest/70"
                  >
                    ×
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Source type pills */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-line bg-paper-2 text-[11px] text-ink-soft hover:border-ink-mute transition-colors"
          >
            📷 Screenshot
          </button>
          <Pill>🔗 URL</Pill>
          <Pill>🎬 TikTok / Instagram</Pill>
          <Pill>✍ Paste text</Pill>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* URL field */}
        <Input
          label="Recipe URL"
          type="url"
          placeholder="https://www.seriouseats.com/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isLoading}
        />

        {/* Pasted text */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute">
            Or paste recipe text
          </label>
          <textarea
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:outline-none focus:border-ink-soft transition-colors resize-y min-h-[100px]"
            placeholder="Paste the ingredients, steps, or any text from the recipe…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isLoading}
          />
        </div>

        {/* Error message */}
        {state.status === "error" && (
          <div className="rounded-lg bg-terra-soft border border-terra/20 px-4 py-3 text-sm text-terra">
            {state.message}
          </div>
        )}

        {/* Submit */}
        <Button
          type="submit"
          variant="terra"
          size="lg"
          block
          disabled={!hasInput || isLoading}
        >
          {isLoading ? "Importing…" : "Import recipe →"}
        </Button>
      </form>
    </>
  );
}

// ── Mini parse-step indicator ────────────────────────────────────────────────

function ParseStep({ done = false, loading = false, text }: { done?: boolean; loading?: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-ink-soft">
      <span
        className={[
          "w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 text-[9px]",
          done
            ? "bg-forest border-forest text-paper"
            : loading
              ? "border-terra"
              : "border-line-strong",
        ].join(" ")}
      >
        {done ? "✓" : loading ? (
          <span className="w-1.5 h-1.5 rounded-full bg-terra animate-pulse block" />
        ) : null}
      </span>
      <span className={done ? "text-ink" : loading ? "text-ink-soft" : "text-ink-mute/60"}>
        {text}
      </span>
    </div>
  );
}
