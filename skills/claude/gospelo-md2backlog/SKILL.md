---
name: gospelo-md2backlog
description: >
  Post a Markdown file with local images to a Backlog (Nulab) issue: uploads
  each image via the Backlog API, rewrites references to Backlog's inline
  attachment syntax, and creates a new issue or adds a comment.  Use this
  skill when the user mentions "post to Backlog", "Backlogに投稿",
  "Backlogに貼り付け", "create a Backlog issue from this doc", or wants to
  share mermaid2png output (Markdown + images/) on a Backlog issue.
  Configured per project via a .backlog.env file (BACKLOG_SPACE_URL,
  BACKLOG_PROJECT, BACKLOG_API_KEY), with environment variables as fallback.
---

# Markdown → Backlog Issue Skill

Posts a Markdown document — including local images such as the `images/`
directory produced by gospelo-mermaid-plus's `mermaid2png.py` — to a Backlog
issue in one command.

## Configuration

Settings are resolved per key as **CLI argument > `.backlog.env` > environment
variable**. `.backlog.env` is searched from the current directory upward, so
each repository carries its own space and project defaults:

```bash
# <repo>/.backlog.env  — add this file to the repo's .gitignore
BACKLOG_SPACE_URL=https://yourspace.backlog.jp
BACKLOG_PROJECT=PJKEY
BACKLOG_ISSUE_TYPE=タスク   # optional
BACKLOG_PRIORITY=中         # optional
BACKLOG_API_KEY=...         # optional here; the env var also works
```

| Requirement | Notes |
|---|---|
| `BACKLOG_SPACE_URL` | e.g. `https://yourspace.backlog.jp` (scheme optional) |
| `BACKLOG_API_KEY` | personal API key from Backlog personal settings |
| Python ≥ 3.9 | standard library only |
| Markdown-mode project | the target Backlog project's text formatting must be **Markdown** (see Notes) |

If the space URL or API key is not configured, stop and tell the user to set
them — do not ask for the API key in chat, and never commit `.backlog.env`
containing a key (add it to `.gitignore`).

## Usage

```bash
# Create a new issue (project from .backlog.env; title = first H1, else filename)
python <skill-path>/scripts/md2backlog.py doc.md

# Create a new issue in an explicit project
python <skill-path>/scripts/md2backlog.py doc.md --project PJKEY

# Add a comment to an existing issue
python <skill-path>/scripts/md2backlog.py doc.md --issue PJKEY-123

# Preview without calling the API
python <skill-path>/scripts/md2backlog.py doc.md --dry-run
```

### Options

| Flag | Default | Description |
|---|---|---|
| `--project KEY` | `BACKLOG_PROJECT` | Create a new issue in this project (mutually exclusive with `--issue`) |
| `--issue KEY-N` | — | Add a comment to this issue instead |
| `--title TEXT` | first H1 → filename | Issue summary; the H1 used as title is removed from the body |
| `--issue-type NAME` | `BACKLOG_ISSUE_TYPE` → project's first type | Issue type by name (e.g. `タスク`, `Bug`) |
| `--priority NAME` | `BACKLOG_PRIORITY` → middle (normal) | Priority by name |
| `--render` | off | Render ALL mermaid blocks to PNG in a temp copy first (original file untouched) |
| `--scale N` | `1` | Render scale for `--render` (1 keeps attachments light; 2 = retina) |
| `--dry-run` | off | Print planned uploads and rewritten body without calling the API |

**Backlog cannot display ```mermaid code blocks at all** (unlike GitHub), so
pass `--render` whenever the document still contains raw mermaid blocks.
It copies the Markdown to a temp directory, renders every block via the
sibling gospelo-mermaid-plus skill's `mermaid2png.py`, and posts the rendered
copy — both the rendered diagrams and pre-existing regular images are
uploaded. The original file is never modified.

## How it works

1. Finds local image references `![alt](path)` (http/https/data URLs are left as-is)
2. Uploads each file via `POST /api/v2/space/attachment` → `attachmentId`
3. Rewrites each reference to Backlog's Markdown inline attachment syntax:
   `![image][filename.png]`
4. Creates the issue (`POST /api/v2/issues`) or comment
   (`POST /api/v2/issues/:key/comments`) with `attachmentId[]` linking the uploads

## Typical workflow with gospelo-mermaid-plus

```bash
# One command: render all mermaid blocks in a temp copy, then post
python <this-skill>/scripts/md2backlog.py docs/design.md --render

# Or, if the document was already converted by mermaid2png.py (images/ committed):
python <this-skill>/scripts/md2backlog.py docs/design.md
```

`--render` requires the gospelo-mermaid-plus skill to be installed next to
this one (both skills are siblings under the same skills directory).

## Notes

- **Backlog記法 projects are not supported**: the inline syntax `![image][name]`
  only renders in Markdown-mode projects. For Backlog記法 projects the images
  arrive as plain attachments (use `#image(name.png)` manually).
- Backlog references attachments **by filename**, so two different images with
  the same basename in one document are rejected — rename them first.
- Uploaded files that fail to be linked to an issue are deleted by Backlog
  after one hour, so a failed run leaves no orphan files.
- The API key determines the posting user — issues/comments appear as the key's owner.
