---
name: gospelo-mermaid-plus
description: >
  Two tools for Mermaid diagrams in Markdown: (1) apply the repository color
  scheme to mermaid blocks via LLM prompt, and (2) render them to PNG for
  GitHub (where FA icons and custom CSS are stripped).  Use this skill when
  the user mentions "mermaid to png", "render mermaid", "apply color scheme",
  "apply theme", "mermaid images", "details fold", wants FA icons visible on
  GitHub, or is writing/editing Mermaid diagrams that should follow the
  repository styling conventions.
---

# Mermaid → PNG Skill

This skill provides two tools for working with Mermaid diagrams in Markdown:

1. **apply_theme.py** — Generate an LLM prompt that applies the repository
   color scheme to mermaid blocks
2. **mermaid2png.py** — Render mermaid blocks to PNG images and fold the
   source into `<details>`

Typical workflow: apply the theme first, then render to PNG.

---

## Tool 1: Apply Color Scheme (`apply_theme.py`)

Extracts all `` ```mermaid `` blocks from a Markdown file and prints a
self-contained prompt to stdout. Feed this prompt to the LLM so it returns
properly themed Mermaid code — with `classDef`, `linkStyle`, subgraph
`style`, and `%%{init}` directives matching the repository palette.

### Why use an LLM for theming

Mermaid styling requires understanding diagram structure: which nodes exist,
which links are dashed vs solid, which subgraphs are primary vs auxiliary.
A regex-based tool can get the basics wrong (mis-counted linkStyle indices,
missed node IDs inside subgraphs, etc.).  By generating a prompt with the
full color-scheme reference and the raw blocks, the LLM can apply the theme
intelligently — respecting semantic meaning (dashed = non-destructive path)
and handling edge cases.

### Usage

```bash
# Generate the prompt
python <skill-path>/scripts/apply_theme.py doc.md > /tmp/theme-prompt.md

# Then feed the prompt content to the LLM conversation
```

In practice, as an Agent Skill, the workflow is:

1. Run `apply_theme.py <file>` to capture the prompt
2. Process the prompt (the LLM applies the color scheme)
3. Replace each mermaid block in the file with the themed version
4. Optionally run `mermaid2png.py` to render to PNG

### Options

| Flag | Default | Description |
|---|---|---|
| `--scheme PATH` | `references/color-scheme.md` | Path to color-scheme reference file |

### Color scheme summary

The full reference is in `references/color-scheme.md`.  Key values:

**Palette:**

| Role | Value |
|---|---|
| Node fill / stroke / text | `#FFFFFF` / `#666666` (1.5 px) / `#2C2C2C` |
| Accent link (solid, teal) | `#0D9488` (2 px) — normal data/control flow |
| Dashed link (grey) | `#9CA3AF` (1.5 px, `4 4`) — read-only / monitoring |
| Primary subgraph | fill `#F0FDFA` / stroke `#0D9488` |
| Neutral subgraph | fill `#F8FAFC` / stroke `#94A3B8` |

**Rules:**

- `classDef node` applied to ALL nodes in a flowchart
- Solid teal links for normal flow (`-->`), dashed grey for non-destructive (`-.->`)
- `linkStyle` indices are declaration-order, 0-based — always verify after editing
- sequenceDiagram uses `%%{init: {'theme':'base', 'themeVariables': {...}}}%%`
- `fa:fa-*` icons in flowchart node labels only (not in sequenceDiagram)
- Override the palette when the user explicitly requests different colors or
  when semantic color-coding is needed (≤ 4–5 colors)

Read `references/color-scheme.md` for the full palette mapping, recommended
icons, blacklist, and override policy.

---

## Tool 2: Render to PNG (`mermaid2png.py`)

Finds every `` ```mermaid `` block in a Markdown file, renders it to PNG via
Mermaid CLI, and rewrites the file so the rendered image appears inline with
the original source tucked into a collapsible `<details>` block.

### Why this exists

GitHub strips external fonts, `<style>`, `@font-face`, `<svg>`, and `data:`
URIs from Markdown.  The only reliable way to show FA-icon-rich Mermaid
diagrams on GitHub is to commit pre-rendered PNGs.

### What it produces

For `doc.md` with two mermaid blocks:

```
doc.md              ← rewritten in place
images/
  doc-1.png         ← rendered from block 1
  doc-2.png         ← rendered from block 2
```

Each original block becomes:

````markdown
![diagram](images/doc-1.png)

<details><summary>Mermaid source</summary>

```mermaid
graph LR
  A --> B
```

</details>
````

### Usage

```bash
python <skill-path>/scripts/mermaid2png.py <markdown_file>
```

### Options

| Flag | Default | Description |
|---|---|---|
| `--scale N` | `2` | Render scale factor (1 = 1×, 2 = retina) |
| `--puppeteer-config PATH` | auto | Puppeteer JSON config for mmdc |
| `--dry-run` | off | Report block count and planned paths only; renders nothing and leaves the Markdown untouched |

### Idempotency

A block is skipped only when it already has the `![diagram]` + `<details>`
fold above it **and** the referenced PNG actually exists on disk. If the
PNG is missing (e.g. it was deleted, or a wrapper was left behind without a
render), the block is treated as unconverted and re-rendered. Running twice
on the same file is safe.

### Prerequisites

| Dependency | Install |
|---|---|
| Node.js ≥ 18 | pre-installed in most environments |
| Mermaid CLI (`mmdc`) | `npm install -g @mermaid-js/mermaid-cli` |
| Chromium | auto-detected (Playwright-bundled or system) |
| Python ≥ 3.9 | pre-installed |

---

## FA6 Icon Blacklist

26 icon names exist in the FA npm package but have **no glyph in the FA6
Free Solid font** — they silently render as blank:

`alarm-clock` `aquarius` `aries` `bus-side` `cancer` `capricorn`
`closed-captioning-slash` `gemini` `hexagon` `leo` `libra`
`mobile-vibrate` `non-binary` `octagon` `pentagon` `picture-in-picture`
`pisces` `sagittarius` `scorpio` `septagon` `single-quote-left`
`single-quote-right` `spiral` `taurus` `virgo` `volume`

All other 1,360 FA6 Free Solid icons work with `fa:fa-*`.

## Troubleshooting

- **mmdc not found** — `npm install -g @mermaid-js/mermaid-cli`
- **Chromium not found** — The script auto-detects Playwright or system
  Chromium.  Pass `--puppeteer-config` with
  `{"executablePath": "/path/to/chrome", "args": ["--no-sandbox"]}` if needed.
- **Icons blank in PNG** — Check the blacklist above; stick to FA6 Free Solid.
- **Block skipped ("already converted")** — Remove the `![diagram]` + `<details>`
  wrapper above the block and re-run.
