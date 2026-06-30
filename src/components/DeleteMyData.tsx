"use client";

import { useState } from "react";

export default function DeleteMyData() {
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [deleted, setDeleted] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!contact.trim()) return;
    setState("working");
    try {
      const res = await fetch("/api/data-deletion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact: contact.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      setDeleted(data.deleted ?? 0);
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className="mt-3 rounded-lg bg-mist px-4 py-3 text-sm text-slate">
        {deleted > 0
          ? "Your data has been deleted."
          : "No record found for that contact — nothing to delete."}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <input
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        placeholder="Email or WhatsApp number"
        className="w-full rounded-lg border border-powder/40 bg-white px-3 py-2 text-sm text-slate outline-none focus:border-denim"
      />
      {state === "error" && (
        <p className="text-sm text-salmon">Something went wrong. Please try again.</p>
      )}
      <button
        type="submit"
        disabled={state === "working" || !contact.trim()}
        className="cta-diamond w-full"
      >
        {state === "working" ? "Deleting…" : "Delete my data"}
      </button>
    </form>
  );
}
