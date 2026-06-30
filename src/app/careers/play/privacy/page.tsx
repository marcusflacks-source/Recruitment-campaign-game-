import DeleteMyData from "@/components/DeleteMyData";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "betterhomes — privacy & data" };

// PDPL/GDPR-aligned notice + self-service data deletion.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <Link href="/careers/play" className="text-sm text-denim underline">
        ← Back to the game
      </Link>
      <h1 className="mt-4 font-head text-3xl text-slate">Your data</h1>
      <div className="mt-4 space-y-3 text-sm text-slate/80">
        <p>
          When you save a score, {BRAND.name} stores the name, contact detail and
          segment you provide, along with your score, so we can show you on the
          leaderboard and talk to you about broker opportunities.
        </p>
        <p>
          We keep your details only for recruitment follow-up and never sell them.
          Storage is consent-based and aligned with the UAE PDPL and GDPR. You can
          ask us to delete your data at any time using the form below.
        </p>
      </div>

      <div className="mt-8 rounded-2xl bg-white p-5 shadow-card">
        <h2 className="font-head text-xl text-slate">Delete my data</h2>
        <p className="mt-1 text-sm text-slate/70">
          Enter the email or WhatsApp number you signed up with.
        </p>
        <DeleteMyData />
      </div>
    </main>
  );
}
