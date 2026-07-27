export const MAG_CLASSES = [
  { name: "Micro", range: "< 2.0", min: 0, max: 2.0, color: "#3B82F6", hex: 0x3b82f6 },
  { name: "Minor", range: "2.0–3.9", min: 2.0, max: 4.0, color: "#22C55E", hex: 0x22c55e },
  { name: "Light", range: "4.0–4.9", min: 4.0, max: 5.0, color: "#FACC15", hex: 0xfacc15 },
  { name: "Moderate", range: "5.0–5.9", min: 5.0, max: 6.0, color: "#FB923C", hex: 0xfb923c },
  { name: "Strong", range: "6.0–6.9", min: 6.0, max: 7.0, color: "#A855F7", hex: 0xa855f7 },
  { name: "Major", range: "≥ 7.0", min: 7.0, max: Infinity, color: "#EF4444", hex: 0xef4444 },
] as const;

export function classifyMagnitude(magnitude: number) {
  return MAG_CLASSES.find((c) => magnitude >= c.min && magnitude < c.max) ?? MAG_CLASSES[MAG_CLASSES.length - 1];
}

export function getMagnitudeColor(magnitude: number): string {
  return classifyMagnitude(magnitude).color;
}

export function getMagnitudeHex(magnitude: number): number {
  return classifyMagnitude(magnitude).hex;
}

/**
 * Returns contrasting text color ("#fff" or "#111") for a given magnitude badge.
 */
export function getMagnitudeTextColor(magnitude: number): string {
  const hex = classifyMagnitude(magnitude).color.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#111" : "#fff";
}
