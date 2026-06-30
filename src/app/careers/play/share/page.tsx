import type { Metadata } from "next";
import Link from "next/link";
import { tierForHeight } from "@/lib/tiers";
import { BRAND } from "@/lib/brand";
import { siteOrigin } from "@/lib/config";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

interface SP {
  h?: string;
  name?: string;
  code?: string;
}

function reqOrigin(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || "https";
  const fromReq = host ? `${proto}://${host}` : undefined;
  return siteOrigin(fromReq ? new Request(fromReq) : undefined);
}

// Server-rendered share landing. Its Open Graph tags point at /api/og so the
// shared link previews the player's height + career tier as a branded card.
export function generateMetadata({ searchParams }: { searchParams: SP }): Metadata {
  const height = Math.max(0, Math.floor(Number(searchParams.h) || 0));
  const name = (searchParams.name ?? "").slice(0, 24);
  const origin = reqOrigin();
  const ogParams = new URLSearchParams({ h: String(height) });
  if (name) ogParams.set("name", name);
  const ogUrl = `${origin}/api/og?${ogParams.toString()}`;
  const title = name
    ? `${name} climbed to ${height} m — break the ceiling`
    : `${height} m — break the ceiling`;

  return {
    title,
    description: `${BRAND.campaign} Take on the betterhomes broker climber and beat ${height} m.`,
    openGraph: {
      title,
      description: BRAND.campaign,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, images: [ogUrl] },
  };
}

export default function SharePage({ searchParams }: { searchParams: SP }) {
  const height = Math.max(0, Math.floor(Number(searchParams.h) || 0));
  const name = (searchParams.name ?? "").slice(0, 24);
  const tier = tierForHeight(height);

  const params = new URLSearchParams({ challenge: String(height) });
  if (name) params.set("by", name);
  if (searchParams.code) params.set("code", searchParams.code);
  const challengeHref = `/careers/play?${params.toString()}`;

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold tracking-[0.2em] text-powder">
        {BRAND.name} careers
      </p>
      <h1 className="mt-2 font-head text-3xl text-slate">
        {name ? `${name} set the bar at` : "The bar is set at"}
      </h1>
      <p className="font-head text-7xl text-slate">
        {height}
        <span className="ml-1 text-3xl text-sand">m</span>
      </p>
      <span
        className="mt-2 inline-block rounded-full px-4 py-1 text-sm font-semibold text-white"
        style={{ background: tier.color }}
      >
        {tier.title}
      </span>
      <p className="mt-4 max-w-xs text-sm text-denim">
        {BRAND.campaign} Smash through the ceilings and climb higher.
      </p>
      <Link href={challengeHref} className="cta-diamond mt-6 text-base">
        Beat {height} m
      </Link>
    </main>
  );
}
