// Render the ```mermaid blocks of a Markdown file to PNG with mermaid-arch,
// and replace each block with the image plus its source folded in
// <details>. Ported from mermaid2png.py; the rewritten Markdown is the same.

import fs from 'node:fs'
import path from 'node:path'
import { BuildError, createRenderer, mermaidBlocks } from '@gospelo/mermaid-arch'
import type { Diagram, MermaidBlock, RenderOptions, RenderResult } from '@gospelo/mermaid-arch'

/** What processMarkdown needs from mermaid-arch's Renderer (tests pass a fake). */
export interface BlockRenderer {
  render(diagrams: Diagram[], options?: RenderOptions): Promise<RenderResult>
  close(): Promise<void>
}

export interface Mermaid2PngOptions {
  /** PNG pixel ratio (default 2). */
  scale?: number
  /** Report what would happen; write nothing (default false). */
  dryRun?: boolean
  /** PNG background (default 'transparent'). */
  background?: string
  /** Shrink diagrams wider than this many CSS px (default: no limit). */
  maxWidth?: number | null
  /** AWS icon zip, needed when the diagrams use aws: icons. */
  iconsZip?: string | null
  /** chrome-headless-shell executable (default: mermaid-arch's lookup). */
  chrome?: string | null
  /** Extra browser arguments, e.g. ['--no-sandbox']. */
  chromeArgs?: readonly string[]
  /** Draw fa:fa-* icons with the Font Awesome Free 6 that mermaid-arch
   * vendors (default true, as mmdc did for the Python version). */
  fontAwesome?: boolean
  /** Use this renderer instead of starting one; it is not closed. */
  renderer?: BlockRenderer
  /** Progress lines (default console.log) and warnings (default console.error). */
  log?: (line: string) => void
  warn?: (line: string) => void
}

export interface Mermaid2PngResult {
  /** Blocks in the file. */
  blocks: number
  /** Blocks rendered and replaced (would be, with dryRun). */
  converted: number
  /** Blocks left as they were because rendering failed. */
  failed: number
}

/** The image followed by the source folded in <details>. */
export function buildReplacement(imageRelPath: string, mermaidCode: string): string {
  const code = mermaidCode.endsWith('\n') ? mermaidCode : mermaidCode + '\n'
  return (
    `![diagram](${imageRelPath.replaceAll('\\', '/')})\n` +
    '\n' +
    '<details><summary>Mermaid source</summary>\n' +
    '\n' +
    '```mermaid\n' +
    code +
    '```\n' +
    '\n' +
    '</details>'
  )
}

/** Whether the block at `blockStart` already sits in the <details> fold
 * we produce, below an image that exists. A fold whose PNG is missing (a
 * manual edit, an old dry run) counts as not converted, so it is rendered. */
export function alreadyConverted(mdText: string, blockStart: number, mdDir: string): boolean {
  const prefix = mdText.slice(Math.max(0, blockStart - 300), blockStart)
  if (!prefix.includes('<details>')) return false
  const refs = [...prefix.matchAll(/!\[diagram\]\(([^)]+)\)/g)]
  const last = refs.at(-1)
  if (!last) return false
  const ref = last[1]!.trim()
  const file = path.isAbsolute(ref) ? ref : path.join(mdDir, ref)
  try {
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

/** images/<base>.png for a single block, images/<base>-<n>.png otherwise. */
export function pngName(base: string, index: number, count: number): string {
  return count > 1 ? `${base}-${index + 1}.png` : `${base}.png`
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Convert one Markdown file in place. Throws BuildError when the file is
 * missing or has an unclosed mermaid block; a block that fails to render is
 * reported, kept as it was and counted in `failed`. */
export async function processMarkdown(mdFile: string, opts: Mermaid2PngOptions = {}): Promise<Mermaid2PngResult> {
  const log = opts.log ?? ((l: string) => console.log(l))
  const warn = opts.warn ?? ((l: string) => console.error(l))
  const mdPath = path.resolve(mdFile)
  if (!fs.existsSync(mdPath) || !fs.statSync(mdPath).isFile()) {
    throw new BuildError(`file not found: ${mdPath}`, 'file-not-found')
  }
  const mdDir = path.dirname(mdPath)
  const imagesDir = path.join(mdDir, 'images')
  let mdText = fs.readFileSync(mdPath, 'utf8')
  const blocks = mermaidBlocks(mdText, mdPath)

  if (blocks.length === 0) {
    log('No ```mermaid blocks found.')
    return { blocks: 0, converted: 0, failed: 0 }
  }
  log(`Found ${blocks.length} mermaid block(s) in ${path.basename(mdPath)}`)

  const base = path.basename(mdPath, path.extname(mdPath))
  const relPath = (i: number) => `images/${pngName(base, i, blocks.length)}`
  const done = blocks.map((b) => alreadyConverted(mdText, b.offset.start, mdDir))
  const todo = blocks.filter((_, i) => !done[i]).length

  // A dry run writes nothing: no images/, no PNG and no Markdown rewrite
  // (a rewritten file without its PNGs would look converted on the real run).
  if (opts.dryRun) {
    blocks.forEach((_, i) =>
      log(done[i] ? `  Block ${i + 1}: already converted, would skip` : `  Block ${i + 1}: would render → ${relPath(i)}`),
    )
    log(`\nDry run: ${todo}/${blocks.length} block(s) would be converted. No files written.`)
    return { blocks: blocks.length, converted: todo, failed: 0 }
  }
  if (todo === 0) {
    for (let i = blocks.length - 1; i >= 0; i--) log(`  Block ${i + 1}: already converted, skipping`)
    log('\nNo blocks were converted.')
    return { blocks: blocks.length, converted: 0, failed: 0 }
  }

  fs.mkdirSync(imagesDir, { recursive: true })
  const renderer = opts.renderer ?? createRenderer({
    iconsZip: opts.iconsZip ?? null,
    chrome: opts.chrome ?? null,
    chromeArgs: opts.chromeArgs ?? [],
    fontAwesome: opts.fontAwesome ?? true,
  })
  const renderOptions: RenderOptions = {
    formats: ['png'],
    scale: opts.scale ?? 2,
    maxWidth: opts.maxWidth ?? null,
    background: opts.background ?? 'transparent',
  }

  let converted = 0
  let failed = 0
  try {
    // Last block first, so the offsets of the earlier ones stay valid.
    for (let index = blocks.length - 1; index >= 0; index--) {
      const block = blocks[index]!
      if (done[index]) {
        log(`  Block ${index + 1}: already converted, skipping`)
        continue
      }
      const rel = relPath(index)
      log(`  Block ${index + 1}: rendering → ${rel}`)
      const png = await renderBlock(renderer, block, renderOptions, warn)
      if (!png) {
        warn(`  Block ${index + 1}: FAILED — keeping original`)
        failed++
        continue
      }
      fs.writeFileSync(path.join(mdDir, rel), png)
      mdText = mdText.slice(0, block.offset.start) + buildReplacement(rel, block.text) + mdText.slice(block.offset.end)
      converted++
    }
  } finally {
    if (!opts.renderer) await renderer.close()
  }

  if (converted > 0) {
    fs.writeFileSync(mdPath, mdText, 'utf8')
    log(`\nDone: ${converted}/${blocks.length} block(s) converted.`)
  } else {
    log('\nNo blocks were converted.')
  }
  return { blocks: blocks.length, converted, failed }
}

async function renderBlock(
  renderer: BlockRenderer, block: MermaidBlock, options: RenderOptions, warn: (l: string) => void,
): Promise<Uint8Array | null> {
  try {
    const { images } = await renderer.render([block], options)
    return images[0]?.png ?? null
  } catch (err) {
    // Missing browser or icon zip fails every block the same way: stop.
    if (err instanceof BuildError && FATAL_CODES.has(err.code)) throw err
    warn(`  [WARN] render failed: ${errorText(err)}`)
    return null
  }
}

/** mermaid-arch error codes that are not about one diagram. */
const FATAL_CODES = new Set([
  'chrome-missing', 'chrome-launch-failed', 'icon-zip-not-found', 'bad-icon-zip',
  'not-icon-package', 'no-icons-of-size', 'vendor-missing', 'vendor-mismatch', 'bad-argument',
])
