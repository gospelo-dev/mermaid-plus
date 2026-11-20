// Build the LLM prompt that applies the color scheme to the mermaid blocks
// of a Markdown file. Nothing is modified here: the LLM's answer is what
// gets applied.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { iconNamesInDiagrams } from '@gospelo/mermaid-arch'
import type { IconCategory, MermaidBlock } from '@gospelo/mermaid-arch'
import { deriveLightTint } from './color.ts'

/** references/color-scheme.md of the bundled skill. */
export const DEFAULT_SCHEME = fileURLToPath(
  new URL('../references/color-scheme.md', import.meta.url),
)

// Colors of the default scheme that --accent replaces.
const DEFAULT_ACCENT = '#0D9488'
const DEFAULT_TINT = '#F0FDFA'

/** Put `accentHex` (and its derived light tint) in place of the default
 * teal, and drop the word "teal" so the prompt does not contradict itself. */
export function applyAccentToScheme(schemeText: string, accentHex: string): string {
  const tintHex = deriveLightTint(accentHex)
  return schemeText
    .replaceAll(DEFAULT_ACCENT, accentHex)
    .replaceAll(DEFAULT_ACCENT.toLowerCase(), accentHex)
    .replaceAll(DEFAULT_TINT, tintHex)
    .replaceAll(DEFAULT_TINT.toLowerCase(), tintHex)
    .replace(/\bTeal\b/g, 'Accent color')
    .replace(/\bteal\b/g, 'accent color')
    .replace(/\bLight teal\b/g, 'Light accent tint')
    .replace(/\bLight Teal\b/g, 'Light Accent Tint')
}

export interface ThemePromptOptions {
  /** Category colors of the icons the blocks use (from mermaid-arch's
   * iconCategories); listed so the LLM keeps icon nodes in them. */
  iconColors?: ReadonlyMap<string, IconCategory> | null
  /** Iconify prefix of the icons (default: aws). */
  iconPrefix?: string
}

function blockSection(block: MermaidBlock, index: number): string {
  return (
    `### Block ${index + 1} (lines ${block.fence.startLine}–${block.fence.endLine})\n` +
    '\n' +
    '```mermaid\n' +
    `${block.text}\n` +
    '```\n'
  )
}

function iconSection(opts: ThemePromptOptions): string {
  const prefix = opts.iconPrefix ?? 'aws'
  let out = `\
## Icon nodes

Nodes with an icon (\`id@{ icon: "${prefix}:..." }\` in flowcharts,
\`service id(${prefix}:...)\` in architecture-beta) show fixed-color artwork.

1. Never recolor the icon artwork with the theme. A \`classDef\` may still
   cover icon nodes, but their \`fill\` must be unset or a very light color
   (it shows as a plate behind the icon); \`stroke\` has no effect on them.
2. **architecture-beta** blocks: return unchanged. Do not add built-in icons
   such as \`(cloud)\`, \`(server)\`, \`(database)\`; only \`${prefix}:\` icons
   are available.
3. Mermaid lays flowcharts out with ELK by default; do not add styling that
   only works with dagre.
`
  if (opts.iconColors && opts.iconColors.size > 0) {
    out +=
      '4. When a color must be tied to an icon node, use its category color\n' +
      '   below rather than the accent color.\n\n' +
      '| Icon | Category | Color |\n|---|---|---|\n'
    for (const [name, c] of [...opts.iconColors].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) {
      out += `| \`${prefix}:${name}\` | ${c.category} | ${c.color ?? '(none)'} |\n`
    }
  }
  return out
}

const ARCHITECTURE_RE = /^\s*architecture-beta\b/m

/** Whether the icon-node rules apply: some block uses `prefix:` icons or is
 * an architecture-beta diagram. */
export function usesIcons(blocks: readonly MermaidBlock[], prefix = 'aws'): boolean {
  return iconNamesInDiagrams([...blocks], prefix).size > 0 || blocks.some((b) => ARCHITECTURE_RE.test(b.text))
}

/** The prompt: rules, the color scheme and every block. The icon-node
 * section is added only when usesIcons(blocks). */
export function buildThemePrompt(
  mdPath: string, schemeText: string, blocks: readonly MermaidBlock[], opts: ThemePromptOptions = {},
): string {
  const blocksMd = blocks.map(blockSection).join('\n')
  return `\
You are a Mermaid diagram styling assistant. Apply the color scheme below to
each Mermaid code block. Return ONLY the themed blocks in the same order,
each wrapped in \`\`\`mermaid fences, separated by a blank line. Do not add
any other text or explanation.

## Rules

1. **Do not change the diagram structure** — nodes, edges, labels, and
   subgraph groupings must stay exactly the same. Only add or update
   styling directives (classDef, class, style, linkStyle, %%{init}) and
   the front-matter \`config.elk.lineHops\` setting (rule 2).
2. For **flowchart / graph** blocks:
   - Add \`classDef node\` with the palette values and apply it to ALL node IDs
     via \`class A,B,C node\`.
   - Add \`style <subgraph_id> ...\` for each subgraph (first = primary,
     rest = neutral) unless a custom palette override is already present.
   - Add \`linkStyle\` entries: solid accent color for normal flow arrows (\`-->\`),
     dashed grey for dotted/dashed arrows (\`-.->\`). Indices are
     declaration-order, 0-based.
   - If the block already has \`classDef node\` / \`linkStyle\`, update values
     to match the palette rather than duplicating.
   - If any \`linkStyle\` is dashed (\`stroke-dasharray\`), set
     \`config.elk.lineHops: false\` in the front matter, merging into an
     existing \`config:\` (see "Dashed links need \`elk.lineHops: false\`").
3. For **sequenceDiagram** blocks:
   - Insert the \`%%{init: ...}%%\` directive on the line immediately before
     \`sequenceDiagram\` (or update the existing one).
4. For other diagram types (pie, gantt, etc.): return unchanged.
5. Preserve all \`fa:fa-*\` icon notation exactly as-is.
6. Keep indentation style consistent with the original.

${usesIcons(blocks, opts.iconPrefix) ? iconSection(opts) + '\n' : ''}<color-scheme>
${schemeText}
</color-scheme>

## Mermaid blocks from \`${path.basename(mdPath)}\`

${blocksMd}`
}

export function readScheme(file: string): string {
  return fs.readFileSync(file, 'utf8')
}
