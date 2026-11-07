#!/usr/bin/env node
// mermaid-plus CLI:
//   mermaid-plus apply-theme FILE [--scheme PATH] [--accent '#RRGGBB'] [--icons-zip ZIP]
//   mermaid-plus mermaid2png FILE [--scale N] [--dry-run] [--icons-zip ZIP] [--chrome PATH]
//                                 [--no-sandbox] [--background COLOR] [--max-width PX]
// Exit codes: 0 success, 1 error, 2 usage error.

import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { BuildError, iconCategories, iconNamesInDiagrams, mermaidBlocks } from '@gospelo/mermaid-arch'
import { lowContrastWarning, normalizeAccent } from '../color.ts'
import { processMarkdown } from '../mermaid2png.ts'
import { applyAccentToScheme, buildThemePrompt, DEFAULT_SCHEME, readScheme } from '../theme.ts'

const USAGE = `usage: mermaid-plus <command> [options] FILE

commands:
  apply-theme   print an LLM prompt that applies the color scheme to the mermaid blocks of FILE
  mermaid2png   render the mermaid blocks of FILE to images/*.png and fold their source in <details>

apply-theme options:
  --scheme PATH        color-scheme reference (default: bundled references/color-scheme.md)
  --accent '#RRGGBB'   accent color; replaces the default teal and derives a light tint (CIELAB)
  --icons-zip ZIP      AWS icon zip; lists the category color of each icon the blocks use

mermaid2png options:
  --scale N            PNG pixel ratio (default: 2)
  --dry-run            report planned output paths only; write nothing
  --icons-zip ZIP      AWS icon zip (Icon-package_*.zip); needed when blocks use aws: icons
  --chrome PATH        chrome-headless-shell executable (default: mermaid-arch's lookup)
  --no-sandbox         start the browser with --no-sandbox (containers, root)
  --background COLOR   PNG background: a CSS color or 'transparent' (default: transparent)
  --max-width PX       shrink diagrams wider than PX CSS px
`

class UsageError extends Error {}

function positiveNumber(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) throw new UsageError(`${name} must be a positive number, got '${value}'`)
  return n
}

function onlyFile(positionals: string[]): string {
  if (positionals.length !== 1) throw new UsageError('expected exactly one FILE')
  return positionals[0]!
}

function applyTheme(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      scheme: { type: 'string', default: DEFAULT_SCHEME },
      accent: { type: 'string' },
      'icons-zip': { type: 'string' },
    },
  })
  const mdPath = path.resolve(onlyFile(positionals))
  if (!fs.existsSync(mdPath)) {
    console.error(`Error: ${mdPath} not found`)
    return 1
  }

  let accent: string | null = null
  if (values.accent !== undefined) {
    accent = normalizeAccent(values.accent)
    if (!accent) {
      console.error(`Error: invalid accent color: ${values.accent} (expected '#RRGGBB')`)
      return 1
    }
    const warning = lowContrastWarning(accent)
    if (warning) console.error(warning)
  }

  const blocks = mermaidBlocks(fs.readFileSync(mdPath, 'utf8'), mdPath)
  if (blocks.length === 0) {
    console.error('No ```mermaid blocks found.')
    return 0
  }

  const schemePath = path.resolve(values.scheme)
  if (!fs.existsSync(schemePath)) {
    console.error(`Error: scheme file not found: ${schemePath}`)
    return 1
  }
  let scheme = readScheme(schemePath)
  if (accent) scheme = applyAccentToScheme(scheme, accent)

  let iconColors = null
  if (values['icons-zip']) {
    const names = iconNamesInDiagrams(blocks, 'aws')
    if (names.size > 0) iconColors = iconCategories(values['icons-zip'], { names })
  }
  console.log(buildThemePrompt(mdPath, scheme, blocks, { iconColors }))
  return 0
}

async function mermaid2png(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      scale: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'icons-zip': { type: 'string' },
      chrome: { type: 'string' },
      'no-sandbox': { type: 'boolean', default: false },
      background: { type: 'string' },
      'max-width': { type: 'string' },
    },
  })
  const file = onlyFile(positionals)
  await processMarkdown(file, {
    scale: positiveNumber('--scale', values.scale),
    dryRun: values['dry-run'],
    iconsZip: values['icons-zip'] ?? null,
    chrome: values.chrome ?? null,
    chromeArgs: values['no-sandbox'] ? ['--no-sandbox'] : [],
    background: values.background,
    maxWidth: positiveNumber('--max-width', values['max-width']) ?? null,
  })
  return 0
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv
  if (command === undefined || command === '-h' || command === '--help') {
    process.stdout.write(USAGE)
    return command === undefined ? 2 : 0
  }
  try {
    if (command === 'apply-theme') return applyTheme(rest)
    if (command === 'mermaid2png') return await mermaid2png(rest)
    throw new UsageError(`unknown command '${command}'`)
  } catch (err) {
    if (err instanceof UsageError || (err as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')) {
      process.stderr.write(`mermaid-plus: error: ${(err as Error).message}\n\n${USAGE}`)
      return 2
    }
    if (err instanceof BuildError) {
      console.error(`Error: ${err.message}`)
      return 1
    }
    throw err
  }
}

process.exitCode = await main(process.argv.slice(2))
