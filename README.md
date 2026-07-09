# gospelo-mermaid-plus

[![License: MIT](https://img.shields.io/badge/License-MIT-1E90FF.svg?style=flat)](https://github.com/gospelo-dev/mermaid-plus/blob/main/LICENSE) [![Python](https://img.shields.io/badge/Python-3.9+-1E90FF.svg?style=flat&logo=python&logoColor=white)](https://www.python.org/) [![Mermaid](https://img.shields.io/badge/Mermaid-CLI-FF3670.svg?style=flat&logo=mermaid&logoColor=white)](https://github.com/mermaid-js/mermaid-cli) [![Agent Skill](https://img.shields.io/badge/Claude_Code-Agent_Skill-7B3FF2.svg?style=flat)](https://docs.claude.com/en/docs/claude-code/skills)

Turn Mermaid diagrams in Markdown into **consistently themed, GitHub-ready PNGs**.

日本語版: [README_ja.md](README_ja.md)

GitHub strips external fonts, `<style>` tags, and `data:` URIs from rendered Markdown, so Mermaid diagrams that rely on Font Awesome icons or custom styling look broken on github.com. This skill solves that with a two-step workflow:

1. **Apply a repository color scheme** to every Mermaid block (LLM-assisted)
2. **Render each block to PNG** and fold the original source into a collapsible `<details>` block

The result: crisp retina diagrams with working `fa:fa-*` icons, plus the editable Mermaid source kept right next to them.

New here? See the [Quickstart](docs/QUICKSTART.md) ([日本語](docs/QUICKSTART_ja.md)) for install and first-run steps with Claude Code or GitHub Copilot.

## Tools

### `apply_theme.py` — LLM-assisted theming

Extracts all ```` ```mermaid ```` blocks from a Markdown file and prints a self-contained prompt to stdout. Feed that prompt to an LLM (e.g. Claude) and it returns the same blocks with the repository color scheme applied — `classDef`, `linkStyle`, subgraph `style`, and `%%{init}` directives matching the palette in [references/color-scheme.md](skills/claude/gospelo-mermaid-plus/references/color-scheme.md).

Why an LLM instead of regex? Correct Mermaid styling requires understanding diagram structure — which links are dashed vs. solid, which subgraphs are primary, and 0-based `linkStyle` indices in declaration order. An LLM applies the theme semantically; a regex tool gets these wrong.

```bash
python skills/claude/gospelo-mermaid-plus/scripts/apply_theme.py doc.md > /tmp/theme-prompt.md
# Feed the prompt to your LLM, then replace each mermaid block with the themed version
```

| Flag | Default | Description |
|---|---|---|
| `--scheme PATH` | `references/color-scheme.md` | Path to the color-scheme reference file |

The script never modifies your file — the LLM's response is what gets applied.

### `mermaid2png.py` — PNG rendering with `<details>` fold

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
python skills/claude/gospelo-mermaid-plus/scripts/mermaid2png.py doc.md
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
SKILL=skills/claude/gospelo-mermaid-plus

# 1. Generate the theming prompt and apply the color scheme via your LLM
python $SKILL/scripts/apply_theme.py docs/architecture.md > /tmp/theme-prompt.md

# 2. Render the themed blocks to PNG and fold the source into <details>
python $SKILL/scripts/mermaid2png.py docs/architecture.md

# 3. Commit the rewritten Markdown and generated images
git add docs/architecture.md docs/images/
```

## Installing as an Agent Skill

This repository ships an [Agent Skill](https://docs.claude.com/en/docs/claude-code/skills) at `skills/claude/gospelo-mermaid-plus/`. The skill uses only the portable core of the open [Agent Skills standard](https://github.com/agentskills/agentskills), so it works with **Claude Code, GitHub Copilot, OpenAI Codex, and OpenCode**.

`scripts/install.py` copies (or symlinks) the skill into the discovery paths those agents scan — `.claude/skills/` and `.agents/skills/`:

```bash
git clone https://github.com/gospelo-dev/mermaid-plus.git
INSTALL=mermaid-plus/skills/claude/gospelo-mermaid-plus/scripts/install.py

# Into a project
python $INSTALL --project /path/to/repo

# User-wide (all projects on this machine)
python $INSTALL --user

# Development setup: symlink back to this clone instead of copying
python $INSTALL --user --symlink

# Replace an existing installation
python $INSTALL --project /path/to/repo --force
```

Agents discover the skill via [SKILL.md](skills/claude/gospelo-mermaid-plus/SKILL.md) and trigger it when you say things like *"render mermaid to png"*, *"apply the color scheme"*, or *"make the FA icons show up on GitHub"*. See SKILL.md for the full workflow, the FA6 icon blacklist, and troubleshooting.

### Distributing as a ZIP

To hand the skill to someone without repo access:

```bash
cd mermaid-plus/skills/claude
zip -r gospelo-mermaid-plus.zip gospelo-mermaid-plus -x "*__pycache__*" -x "*.DS_Store"
```

The recipient unzips it anywhere and runs the installer:

```bash
unzip gospelo-mermaid-plus.zip
python gospelo-mermaid-plus/scripts/install.py --project /path/to/repo   # or --user
```

## Repository layout

```
mermaid-plus/
└── skills/
    └── claude/
        └── gospelo-mermaid-plus/
            ├── SKILL.md            # Agent Skill definition and full documentation
            ├── scripts/
            │   ├── apply_theme.py  # Theming prompt generator
            │   ├── mermaid2png.py  # Mermaid → PNG renderer
            │   └── install.py      # Installer for agent skill discovery paths
            └── references/
                └── color-scheme.md # Full palette, icon recommendations, override policy
```

## License

[MIT](LICENSE)
