/**
 * Dash array that draws a dashed line in: the dash pattern repeated out to
 * at least the line's length (`run`), then a gap as long as the line.
 * Sliding the offset from `run` down to 0 reveals the line from its start,
 * dash by dash, and ends exactly on the plain pattern. (Masking a dashed
 * line with a drawn-in solid copy does the same, but Chrome re-rasterizes
 * SVG masks every frame, which flickers.)
 */
export function dashedDrawIn(len: number, dash: number, gap: number): { array: string; run: number } {
  const pairs = Math.ceil((len + gap) / (dash + gap));
  const parts: number[] = [];
  for (let i = 0; i < pairs; i++) parts.push(dash, gap);
  parts[parts.length - 1] = len; // the last gap becomes the long one
  return { array: parts.join(" "), run: pairs * (dash + gap) - gap };
}
