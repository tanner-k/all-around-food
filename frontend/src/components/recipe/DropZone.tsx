"use client";

import { isVideoRecipeUrl } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";

interface DropZoneProps {
  onImage: (
    base64: string,
    mediaType: "image/jpeg" | "image/png" | "image/webp",
    file: File
  ) => void;
  /** Optional — omitted for the receipt variant, which is image-only. */
  onUrl?: (url: string) => void;
  /** Optional handler for Instagram/TikTok recipe videos. Falls back to onUrl. */
  onVideoUrl?: (url: string) => void;
  /** "recipe" (default) shows URL/coming-soon pills; "receipt" is image-only. */
  variant?: "recipe" | "receipt";
}

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type SupportedMediaType = (typeof SUPPORTED_IMAGE_TYPES)[number];

function isSupportedMediaType(type: string): type is SupportedMediaType {
  return SUPPORTED_IMAGE_TYPES.includes(type as SupportedMediaType);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip the data URL prefix, keep only base64 payload
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function DropZone({
  onImage,
  onUrl,
  onVideoUrl,
  variant = "recipe",
}: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const urlInputRef = useRef<HTMLInputElement>(null);
  const isReceipt = variant === "receipt";

  const submitUrl = useCallback((rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) return;

    if (isVideoRecipeUrl(trimmed)) {
      (onVideoUrl ?? onUrl)?.(trimmed);
      return;
    }

    onUrl?.(trimmed);
  }, [onUrl, onVideoUrl]);

  // Window-level paste handler
  useEffect(() => {
    async function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        // Image from clipboard
        if (item.kind === "file" && isSupportedMediaType(item.type)) {
          const file = item.getAsFile();
          if (!file) continue;
          const base64 = await fileToBase64(file);
          onImage(base64, item.type as SupportedMediaType, file);
          return;
        }
      }

      // String — might be URL
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if ((onUrl || onVideoUrl) && /^https?:\/\//.test(text.trim())) {
        submitUrl(text);
      }
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [onImage, onUrl, onVideoUrl, submitUrl]);

  // Drag handlers
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave() {
    setDragging(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!isSupportedMediaType(file.type)) return;
    const base64 = await fileToBase64(file);
    onImage(base64, file.type as SupportedMediaType, file);
  }

  function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (urlValue.trim() && (onUrl || onVideoUrl)) {
      submitUrl(urlValue);
      setUrlValue("");
      setShowUrlInput(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          "flex flex-col items-center justify-center gap-3 rounded-2xl",
          "border-2 border-dashed px-8 py-16 text-center transition-colors",
          "bg-paper-2",
          dragging
            ? "border-terra bg-terra-soft"
            : "border-line-strong",
        ].join(" ")}
      >
        <span className="text-4xl leading-none select-none">⬇</span>
        <p className="font-serif italic text-2xl text-ink">
          {isReceipt
            ? "Drop receipt photo or paste image"
            : "Drop screenshot or paste link"}
        </p>
        <p className="text-sm text-ink-mute">⌘V works on every screen</p>
      </div>

      {/* Method pills */}
      <div className="flex flex-wrap gap-2">
        {/* Screenshot — active */}
        <label
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-paper-2 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-terra hover:text-terra"
        >
          {isReceipt ? "📷 Receipt photo" : "📷 Screenshot"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || !isSupportedMediaType(file.type)) return;
              const base64 = await fileToBase64(file);
              onImage(base64, file.type as SupportedMediaType, file);
              e.target.value = "";
            }}
          />
        </label>

        {!isReceipt && (
          <>
            {/* URL — active */}
            <button
              type="button"
              onClick={() => {
                setShowUrlInput((v) => !v);
                setTimeout(() => urlInputRef.current?.focus(), 50);
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-paper-2 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-terra hover:text-terra"
            >
              🔗 URL
            </button>

            <button
              type="button"
              onClick={() => {
                setShowUrlInput((v) => !v);
                setTimeout(() => urlInputRef.current?.focus(), 50);
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-paper-2 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-terra hover:text-terra"
            >
              🎬 TikTok / Instagram
            </button>

            {/* Coming soon */}
            {(["📧 Email", "✍ Type"] as const).map((label) => (
              <span
                key={label}
                title="Coming soon"
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-line bg-paper-2 px-3 py-1.5 text-xs font-medium text-ink-soft opacity-50"
              >
                {label}
              </span>
            ))}
          </>
        )}
      </div>

      {/* Inline URL input */}
      {showUrlInput && (
        <form
          onSubmit={handleUrlSubmit}
          className="flex gap-2"
        >
          <input
            ref={urlInputRef}
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="Paste a recipe URL, TikTok, or Instagram Reel"
            className="flex-1 rounded-xl border border-line bg-paper px-4 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-terra focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-xl bg-terra px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-[#A55230]"
          >
            Import
          </button>
        </form>
      )}
    </div>
  );
}
