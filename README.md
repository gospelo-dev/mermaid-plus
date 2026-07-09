# gospelo-mermaid-plus

Turn Mermaid diagrams in Markdown into **consistently themed, GitHub-ready PNGs**.

GitHub strips external fonts, `<style>` tags, and `data:` URIs from rendered Markdown, so Mermaid diagrams that rely on Font Awesome icons or custom styling look broken on github.com. This skill solves that with a two-step workflow:

1. **Apply a repository color scheme** to every Mermaid block (LLM-assisted)
2. **Render each block to PNG** and fold the original source into a collapsible `<details>` block

The result: crisp retina diagrams with working `fa:fa-*` icons, plus the editable Mermaid source kept right next to them.

## Tools

### `scripts/apply_theme.py` — LLM-assisted theming

Extracts all ```` ```mermaid ```` blocks from a Markdown file and prints a self-contained prompt to stdout. Feed that prompt to an LLM (e.g. Claude) and it returns the same blocks with the repository color scheme applied — `classDef`, `linkStyle`, subgraph `style`, and `%%{init}` directives matching the palette in [references/color-scheme.md](references/color-scheme.md).

Why an LLM instead of regex? Correct Mermaid styling requires understanding diagram structure — which links are dashed vs. solid, which subgraphs are primary, and 0-based `linkStyle` indices in declaration order. An LLM applies the theme semantically; a regex tool gets these wrong.

```bash
python scripts/apply_theme.py doc.md > /tmp/theme-prompt.md
# Feed the prompt to your LLM, then replace each mermaid block with the themed version
```

| Flag | Default | Description |
|---|---|---|
| `--scheme PATH` | `references/color-scheme.md` | Path to the color-scheme reference file |

The script never modifies your file — the LLM's response is what gets applied.

### `scripts/mermaid2png.py` — PNG rendering with `<details>` fold

Finds every ```` ```mermaid ```` block, renders it to PNG via Mermaid CLI (`mmdc`), saves the image to an `images/` directory next to the Markdown file, and rewrites each block in place as:

````markdown
![diagram](images/doc-1.png)

<details><summary>Mermaid source</summary>

```mermaid
graph LR
  A --> B
```

</details>
````

```bash
python scripts/mermaid2png.py doc.md
```

| Flag | Default | Description |
|---|---|---|
| `--scale N` | `2` | Render scale factor (2 = retina) |
| `--puppeteer-config PATH` | auto | Puppeteer JSON config for `mmdc` (Chromium is auto-detected) |
| `--dry-run` | off | Rewrite Markdown without rendering PNGs |

The script is **idempotent** — blocks that were already converted are skipped, so running it twice on the same file is safe. Blocks that fail to render are left untouched.

## Prerequisites

| Dependency | Install |
|---|---|
| Node.js ≥ 18 | pre-installed in most environments |
| Mermaid CLI (`mmdc`) | `npm install -g @mermaid-js/mermaid-cli` |
| Chromium | auto-detected (Playwright-bundled or system); override via `--puppeteer-config` |
| Python ≥ 3.9 | pre-installed (standard library only, no pip packages) |

## Usage example

```bash
# 1. Generate the theming prompt and apply the color scheme via your LLM
python scripts/apply_theme.py docs/architecture.md > /tmp/theme-prompt.md

# 2. Render the themed blocks to PNG and fold the source into <details>
python scripts/mermaid2png.py docs/architecture.md

# 3. Commit the rewritten Markdown and generated images
git add docs/architecture.md docs/images/
```

## Installing as an Agent Skill

This repository is a [Claude Agent Skill](https://docs.claude.com/en/docs/claude-code/skills). To install it, place it under your `.claude/skills/` directory:

```bash
# Per-project
git clone https://github.com/gospelo-dev/mermaid-plus.git .claude/skills/gospelo-mermaid-plus

# Or globally for all projects
git clone https://github.com/gospelo-dev/mermaid-plus.git ~/.claude/skills/gospelo-mermaid-plus
```

Claude Code discovers the skill via [SKILL.md](SKILL.md) and triggers it when you say things like *"render mermaid to png"*, *"apply the color scheme"*, or *"make the FA icons show up on GitHub"*. See SKILL.md for the full workflow, the FA6 icon blacklist, and troubleshooting.

## Repository layout

```
mermaid-plus/
├── SKILL.md                    # Agent Skill definition and full documentation
├── scripts/
│   ├── apply_theme.py          # Theming prompt generator
│   └── mermaid2png.py          # Mermaid → PNG renderer
└── references/
    └── color-scheme.md         # Full palette, icon recommendations, override policy
```

## License

[MIT](LICENSE)
