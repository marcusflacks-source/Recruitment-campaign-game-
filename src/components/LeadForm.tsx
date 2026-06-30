"use client";

import { useEffect, useState } from "react";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";

interface SavedResult {
  displayName: string;
  segment: SegmentKey;
  office: string | null;
}

// One-step opt-in: name, email and/or WhatsApp, segment, explicit consent.
// On submit the verified score is saved to the leaderboard and the lead is
// forwarded to the CRM (handled server-side in /api/lead).
export default function LeadForm({
  receipt,
  sourceCode,
  onSaved,
}: {
  receipt: string;
  sourceCode?: string | null;
  onSaved: (r: SavedResult & { crmDelivered: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [segment, setSegment] = useState<SegmentKey | "">("");
  const [office, setOffice] = useState("");
  const [offices, setOffices] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/offices")
      .then((r) => r.json())
      .then((d) => setOffices(d.offices ?? []))
      .catch(() => {});
  }, []);

  const canSubmit =
    name.trim().length > 0 &&
    (email.trim().length > 0 || whatsapp.trim().length > 0) &&
    segment !== "" &&
    consent &&
    !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          receipt,
          name: name.trim(),
          email: email.trim() || undefined,
          whatsapp: whatsapp.trim() || undefined,
          segment,
          office: office || undefined,
          code: sourceCode || undefined,
          consent: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.saved) {
        setError(humanError(data.error));
        return;
      }
      onSaved({
        displayName: name.trim().split(" ")[0],
        segment: segment as SegmentKey,
        office: office || null,
        crmDelivered: Boolean(data.crmDelivered),
      });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-left">
      <p className="text-sm text-slate/80">
        Save your score to the weekly board and we&rsquo;ll be in touch about where
        your career could go.
      </p>

      <Field label="Your name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className={inputClass}
          placeholder="Full name"
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Email">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            inputMode="email"
            className={inputClass}
            placeholder="you@email.com"
          />
        </Field>
        <Field label="WhatsApp">
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className={inputClass}
            placeholder="+971 5x xxx xxxx"
          />
        </Field>
      </div>
      <p className="-mt-1 text-xs text-slate/50">Add email or WhatsApp — whichever suits you.</p>

      <Field label="Which describes you?">
        <div className="grid grid-cols-2 gap-2">
          {SEGMENTS.map((s) => (
            <button
              type="button"
              key={s.key}
              onClick={() => setSegment(s.key)}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                segment === s.key
                  ? "border-denim bg-denim text-white"
                  : "border-powder/40 bg-white text-slate hover:border-denim"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Office (optional)">
        <select value={office} onChange={(e) => setOffice(e.target.value)} className={inputClass}>
          <option value="">Prefer not to say</option>
          {offices.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Field>

      <label className="flex items-start gap-2 text-xs text-slate/70">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-denim"
        />
        <span>
          I agree to betterhomes storing my details and contacting me about broker
          opportunities. I can request deletion at any time.
        </span>
      </label>

      {error && <p className="text-sm text-salmon">{error}</p>}

      <button type="submit" disabled={!canSubmit} className="cta-diamond w-full">
        {submitting ? "Saving…" : "Save my score"}
      </button>
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-powder/40 bg-white px-3 py-2 text-sm text-slate outline-none focus:border-denim";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold tracking-wide text-denim">
        {label}
      </span>
      {children}
    </label>
  );
}

function humanError(code?: string): string {
  switch (code) {
    case "email_or_whatsapp_required":
      return "Please add an email or WhatsApp number.";
    case "invalid_or_expired_receipt":
      return "That score expired — play another quick run to save.";
    case "rate_limited":
      return "Too many attempts. Give it a moment.";
    default:
      return "Couldn’t save your score. Please try again.";
  }
}
