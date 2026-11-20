# Quickstart

Get the gospelo-mermaid-plus skill running in **Claude Code** or **GitHub Copilot** in a few minutes.

日本語版は [QUICKSTART_ja.md](QUICKSTART_ja.md) を参照してください。

## Prerequisites

Supported platforms: **macOS / Linux / WSL2**

| Dependency | Required | Notes |
|---|---|---|
| Python ≥ 3.9 | yes | standard library only, no pip packages |
| Node.js ≥ 18 | for PNG rendering | |
| Mermaid CLI (`mmdc`) | recommended | `npm install -g @mermaid-js/mermaid-cli` — without it, the script falls back to `npx` (slow first run) |

## Install

The installer copies the skill into `.claude/skills/` and `.agents/skills/`, which covers Claude Code, Copilot, Codex, and OpenCode.

**From a ZIP** (if someone handed you `gospelo-mermaid-plus.zip`):

```bash
unzip gospelo-mermaid-plus.zip
python gospelo-mermaid-plus/scripts/install.py --project /path/to/your/repo
```

**From this repository:**

```bash
git clone https://github.com/gospelo-dev/mermaid-plus.git
python mermaid-plus/skills/claude/gospelo-mermaid-plus/scripts/install.py --project /path/to/your/repo
```

Use `--user` instead of `--project` to install once for all projects on your machine, and `--force` to replace an existing installation.

## Verify

### Claude Code

Open a session in the project and ask:

```
Render the mermaid diagrams in docs/architecture.md to PNG
```

Claude Code discovers the skill from `.claude/skills/` and follows its workflow. Restart the session if the skill was installed while a session was open.

### GitHub Copilot

Copilot (CLI, VS Code agent mode, cloud agent) scans both `.claude/skills/` and `.agents/skills/`. To confirm discovery with the Copilot CLI:

```bash
cd /path/to/your/repo
copilot -p "List the names of the agent skills available in this session."
```

`gospelo-mermaid-plus` should appear in the list. In VS Code, use agent mode and ask for the task in natural language ("apply the color scheme to this file's mermaid diagrams"), or reference the skill explicitly in a prompt file.

### OpenAI Codex

Codex scans `.agents/skills/` (not `.claude/skills/`), which the installer also populates. To confirm discovery with the Codex CLI:

```bash
cd /path/to/your/repo
codex exec "List the names of the agent skills available in this session."
```

`gospelo-mermaid-plus` should appear in the list.

### OpenCode

OpenCode has first-party skill support and scans both of the installer's locations, so nothing extra is needed:

| Scope | Paths scanned |
|---|---|
| Project | `.opencode/{skill,skills}/**/SKILL.md`, `.claude/skills/**/SKILL.md`, `.agents/skills/**/SKILL.md` |
| Global | `~/.config/opencode/{skill,skills}/**/SKILL.md`, `~/.claude/skills/**/SKILL.md`, `~/.agents/skills/**/SKILL.md` |

Project paths are walked up from the current directory to the git worktree root, so the skill is found from any subdirectory. To confirm discovery:

```bash
cd /path/to/your/repo
opencode run -m <provider/model> "List the names of the agent skills available in this session."
```

`gospelo-mermaid-plus` should appear in the list. Note: if the default model's API key is not configured, `opencode run` can hang without an error — pass `-m` explicitly, or store credentials once with `opencode auth login` so it works regardless of shell environment variables.

**A `duplicate skill name` warning is expected.** The installer writes the skill to both `.claude/skills/` and `.agents/skills/`, and OpenCode scans both, so it logs the duplicate and keeps whichever it scanned last. Both copies are identical, so this is harmless. Install into only one of the two directories if you would rather not see it. Note that `.agents/skills/` is always scanned, while `.claude/skills/` can be turned off — prefer `.agents/skills/` if you keep only one.

**You can skip the installer entirely.** OpenCode can read the skills straight out of a clone via `opencode.json`, which avoids copies going stale:

```json
{
  "skills": {
    "paths": ["~/src/mermaid-plus/skills/claude"]
  }
}
```

That directory is scanned as `**/SKILL.md`, so both `gospelo-mermaid-plus` and `gospelo-md2backlog` are picked up. Relative paths resolve against the project directory, and `~/` is expanded.

## Use

Two scripts, typically run in this order:

```bash
SKILL=.claude/skills/gospelo-mermaid-plus

# 1. Apply the color scheme: generates a prompt for your agent to theme the blocks
python $SKILL/scripts/apply_theme.py docs/architecture.md

# 2. Render to PNG and fold the mermaid source into <details> (for GitHub, where FA icons don't render)
python $SKILL/scripts/mermaid2png.py docs/architecture.md
```

In agent workflows you rarely run these by hand — the agent reads [SKILL.md](../skills/claude/gospelo-mermaid-plus/SKILL.md) and orchestrates both steps. See the [README](../README.md) for details and troubleshooting.
