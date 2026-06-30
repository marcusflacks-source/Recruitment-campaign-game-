// Audience segments for the lead-capture form ('Which describes you?').
// Every analytics event and every CRM lead is tagged with one of these.

export const SEGMENTS = [
  { key: "new", label: "New to broking" },
  { key: "returning", label: "Returning to the field" },
  { key: "experienced", label: "Experienced broker" },
  { key: "relocating", label: "Relocating to Dubai" },
] as const;

export type SegmentKey = (typeof SEGMENTS)[number]["key"];

export const SEGMENT_KEYS = SEGMENTS.map((s) => s.key) as SegmentKey[];

export function isSegment(v: unknown): v is SegmentKey {
  return typeof v === "string" && (SEGMENT_KEYS as string[]).includes(v);
}
