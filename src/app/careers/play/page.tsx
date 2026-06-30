import Hub from "@/components/Hub";

export const dynamic = "force-dynamic";

// The game hub. Supports:
//   ?challenge=<height>&by=<name>  head-to-head challenge (score to beat)
//   ?code=<ref>                    source/referral code (links physical puzzles)
export default function PlayPage({
  searchParams,
}: {
  searchParams: { challenge?: string; by?: string; code?: string };
}) {
  const challengeTarget = searchParams.challenge
    ? Math.max(0, Math.floor(Number(searchParams.challenge)) || 0) || null
    : null;

  return (
    <Hub
      challengeTarget={challengeTarget}
      challengeBy={searchParams.by ?? null}
      code={searchParams.code ?? null}
    />
  );
}
