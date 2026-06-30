"use client";

import { useState } from "react";

// Share controls. The shared URL points at /careers/play/share, which carries a
// server-rendered Open Graph score card (height + tier) and a button to take on
// the head-to-head challenge.
export default function ShareRow({
  height,
  name,
  sourceCode,
  onShareEmit,
}: {
  height: number;
  name: string;
  sourceCode?: string | null;
  onShareEmit: (channel: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  function shareUrl(): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const params = new URLSearchParams({ h: String(height), name });
    if (sourceCode) params.set("code", sourceCode);
    return `${origin}/careers/play/share?${params.toString()}`;
  }

  const text = `I climbed to ${height} m in betterhomes "Break the ceiling". Beat me.`;

  async function nativeShare() {
    onShareEmit("native");
    const url = shareUrl();
    if (navigator.share) {
      try {
        await navigator.share({ title: "Break the ceiling", text, url });
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    await copy();
  }

  async function copy() {
    onShareEmit("copy");
    try {
      await navigator.clipboard.writeText(shareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  function whatsapp() {
    onShareEmit("whatsapp");
    const url = `https://wa.me/?text=${encodeURIComponent(`${text} ${shareUrl()}`)}`;
    window.open(url, "_blank", "noopener");
  }

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-semibold tracking-wide text-denim">
        Challenge someone
      </p>
      <div className="flex gap-2">
        <button
          onClick={nativeShare}
          className="flex-1 rounded-lg bg-denim px-3 py-2 text-sm font-semibold text-white"
        >
          Share
        </button>
        <button
          onClick={whatsapp}
          className="flex-1 rounded-lg bg-powder px-3 py-2 text-sm font-semibold text-slate"
        >
          WhatsApp
        </button>
        <button
          onClick={copy}
          className="flex-1 rounded-lg border border-powder/50 px-3 py-2 text-sm font-semibold text-slate"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
