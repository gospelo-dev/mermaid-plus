// CIELAB color science for deriving a scheme from one accent color.
// Ported from apply_theme.py (itself from chart-banana/worker/src/themes.py);
// results match the Python version, including its round-half-even.

const D65_XN = 95.047
const D65_YN = 100.0
const D65_ZN = 108.883
const CHROMA_MAX = 135.0

export type Lab = [L: number, a: number, b: number]

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1.0 / 2.4) - 0.055
}

function labF(t: number): number {
  const delta = 6.0 / 29.0
  return t > delta ** 3 ? t ** (1.0 / 3.0) : t / (3.0 * delta * delta) + 4.0 / 29.0
}

function labFInv(t: number): number {
  const delta = 6.0 / 29.0
  return t > delta ? t ** 3.0 : 3.0 * delta * delta * (t - 4.0 / 29.0)
}

/** Python's round(): halves go to the even neighbour. */
function roundHalfEven(x: number): number {
  const r = Math.round(x)
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r
}

export function hexToLab(hex: string): Lab {
  const h = hex.replace(/^#+/, '')
  const r = srgbToLinear(parseInt(h.slice(0, 2), 16) / 255.0)
  const g = srgbToLinear(parseInt(h.slice(2, 4), 16) / 255.0)
  const b = srgbToLinear(parseInt(h.slice(4, 6), 16) / 255.0)

  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) * 100.0
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) * 100.0
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) * 100.0

  const fx = labF(x / D65_XN)
  const fy = labF(y / D65_YN)
  const fz = labF(z / D65_ZN)
  return [116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz)]
}

function labToLinearRgb(L: number, a: number, bVal: number): [number, number, number] {
  const fy = (L + 16.0) / 116.0
  const fx = a / 500.0 + fy
  const fz = fy - bVal / 200.0

  const x = (labFInv(fx) * D65_XN) / 100.0
  const y = (labFInv(fy) * D65_YN) / 100.0
  const z = (labFInv(fz) * D65_ZN) / 100.0

  return [
    3.2404542 * x + -1.5371385 * y + -0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x + -0.2040259 * y + 1.0572252 * z,
  ]
}

function inSrgbGamut(rgb: [number, number, number]): boolean {
  return rgb.every((c) => -1e-6 <= c && c <= 1.0 + 1e-6)
}

export function labToHex(L: number, a: number, bVal: number): string {
  const channel = (c: number) =>
    roundHalfEven(Math.max(0.0, Math.min(1.0, linearToSrgb(c))) * 255)
      .toString(16)
      .toUpperCase()
      .padStart(2, '0')
  return '#' + labToLinearRgb(L, a, bVal).map(channel).join('')
}

/** A very light tint of the accent for subgraph fills: L* 98, chroma about
 * 5, same hue (reduced until it fits sRGB). Grey input gives near-white. */
export function deriveLightTint(accentHex: string): string {
  const [, a, bVal] = hexToLab(accentHex)
  const chroma = Math.sqrt(a * a + bVal * bVal)
  const targetL = 98.0
  const targetChroma = 5.0

  if (chroma < 0.5) return labToHex(targetL, 0.0, 0.0)

  const ha = a / chroma
  const hb = bVal / chroma
  if (inSrgbGamut(labToLinearRgb(targetL, ha * targetChroma, hb * targetChroma))) {
    return labToHex(targetL, ha * targetChroma, hb * targetChroma)
  }
  let lo = 0.0
  let hi = targetChroma
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2.0
    if (inSrgbGamut(labToLinearRgb(targetL, ha * mid, hb * mid))) lo = mid
    else hi = mid
  }
  return labToHex(targetL, ha * lo, hb * lo)
}

/** Chroma / 135, capped at 1. */
export function perceptualSaturation(hex: string): number {
  const [, a, bVal] = hexToLab(hex)
  return Math.min(Math.sqrt(a * a + bVal * bVal) / CHROMA_MAX, 1.0)
}

/** L* / 100, clamped to 0..1. */
export function perceptualLightness(hex: string): number {
  return Math.max(0.0, Math.min(hexToLab(hex)[0] / 100.0, 1.0))
}

/** '#RRGGBB' upper case from user input ('0d9488', "'#0D9488'", ...), or
 * null when it is not a 6-digit hex color. */
export function normalizeAccent(input: string): string | null {
  const accent = input.trim().replace(/^['"]+|['"]+$/g, '')
  if (!/^#?[0-9A-Fa-f]{6}$/.test(accent)) return null
  return (accent.startsWith('#') ? accent : '#' + accent).toUpperCase()
}

/** A warning when the accent would be hard to see on white, else null. */
export function lowContrastWarning(accent: string): string | null {
  const sat = perceptualSaturation(accent)
  const lgt = perceptualLightness(accent)
  if (sat < 0.22 || lgt > 0.85) {
    return (
      `Warning: ${accent} has low contrast on white ` +
      `(saturation=${sat.toFixed(2)}, lightness=${lgt.toFixed(2)}). ` +
      `Link strokes may be hard to see.`
    )
  }
  return null
}
