/**
 * Colour helpers for branding. A studio picks one brand colour; we must pick a
 * legible text colour to sit on it, and never trust the input blindly.
 */

/** #RGB or #RRGGBB. */
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isHexColor(value: string): boolean {
  return HEX.test(value.trim());
}

/** Expand #abc -> #aabbcc; returns [r,g,b] in 0..255. Assumes a valid hex. */
function toRgb(hex: string): [number, number, number] {
  let h = hex.trim().slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Relative luminance (WCAG). 0 = black, 1 = white. */
export function luminance(hex: string): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = toRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * A foreground (black or white) that reads on `hex`. 0.179 is the WCAG contrast
 * crossover — the luminance at which black and white give equal contrast ratio
 * (sqrt(1.05*0.05) - 0.05). Above it black wins, below it white. This is the
 * correct split; a naive 0.5 would put mid-tones like amber on white text.
 */
export function readableForeground(hex: string): "#000000" | "#ffffff" {
  return luminance(hex) > 0.179 ? "#000000" : "#ffffff";
}
