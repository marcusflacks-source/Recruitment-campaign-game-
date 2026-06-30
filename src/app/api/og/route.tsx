import { ImageResponse } from "next/og";
import { tierForHeight, CAREER_TIERS } from "@/lib/tiers";
import { BRAND } from "@/lib/brand";

export const runtime = "nodejs";

// Server-side branded Open Graph score card. Renders the player's height + career
// tier so shared links preview the run. Driven entirely by query params so it
// works without a DB round-trip:  /api/og?h=420&name=Sara
export async function GET(req: Request) {
  const url = new URL(req.url);
  const height = Math.max(0, Math.floor(Number(url.searchParams.get("h") ?? 0)) || 0);
  const name = (url.searchParams.get("name") ?? "").slice(0, 24);
  const tier = tierForHeight(height);
  const tierIndex = CAREER_TIERS.findIndex((t) => t.key === tier.key);
  const p = BRAND.palette;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px",
          background: `linear-gradient(135deg, ${p.slate} 0%, ${p.denim} 100%)`,
          fontFamily: "sans-serif",
          color: p.mist,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>
            betterhomes
          </div>
          <div style={{ display: "flex", fontSize: 26, color: p.powder }}>
            Trust better. Get better.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 30, color: p.powder, marginBottom: 8 }}>
            {name ? `${name} climbed to` : "Climbed to"}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <div
              style={{ display: "flex", fontSize: 190, fontWeight: 800, lineHeight: 0.9, color: "#fff" }}
            >
              {height}
            </div>
            <div
              style={{ display: "flex", fontSize: 56, color: p.sand, marginLeft: 16, marginBottom: 30 }}
            >
              m
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: 18,
              padding: "12px 28px",
              borderRadius: 999,
              background: tier.color,
              color: tier.key === "lead" ? p.slate : "#fff",
              fontSize: 38,
              fontWeight: 700,
              alignSelf: "flex-start",
            }}
          >
            {tier.title}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 12 }}>
            {CAREER_TIERS.map((t, i) => (
              <div
                key={t.key}
                style={{
                  width: 56,
                  height: 14,
                  borderRadius: 999,
                  background: i <= tierIndex ? t.color : "rgba(255,255,255,0.18)",
                }}
              />
            ))}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontWeight: 700,
              color: p.sand,
              letterSpacing: 1,
            }}
          >
            Break the ceiling
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
