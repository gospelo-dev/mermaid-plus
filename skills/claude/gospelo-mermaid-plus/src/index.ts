// mermaid-plus: color schemes and PNG rendering for the mermaid blocks of
// Markdown files, built on @gospelo/mermaid-arch.
//
//   import { processMarkdown } from './src/index.ts'   // Node >= 22.18 runs .ts as is
//   await processMarkdown('docs/arch.md', { iconsZip: 'Icon-package_*.zip' })
export {
  deriveLightTint, hexToLab, labToHex, lowContrastWarning, normalizeAccent,
  perceptualLightness, perceptualSaturation,
} from './color.ts'
export type { Lab } from './color.ts'
export { applyAccentToScheme, buildThemePrompt, DEFAULT_SCHEME, readScheme, usesIcons } from './theme.ts'
export type { ThemePromptOptions } from './theme.ts'
export { alreadyConverted, buildReplacement, pngName, processMarkdown, wrapperImage } from './mermaid2png.ts'
export type { BlockRenderer, Mermaid2PngOptions, Mermaid2PngResult } from './mermaid2png.ts'
