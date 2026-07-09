#!/usr/bin/env python3
"""
md2backlog.py — Post a Markdown file (with local images) to a Backlog issue.

For each local image referenced in the Markdown (e.g. the images/ directory
produced by mermaid2png.py):
  1. Uploads it via POST /api/v2/space/attachment
  2. Rewrites the reference to Backlog's inline attachment syntax
     (Markdown-mode projects): ![image][filename.png]
  3. Creates a new issue (--project) or adds a comment (--issue) with the
     rewritten body and the attachments linked via attachmentId[]

Configuration — resolved per key as: CLI argument > .backlog.env > environment
variable. `.backlog.env` is searched from the current directory upward, so
each repository can carry its own space/project defaults:

    BACKLOG_SPACE_URL=https://yourspace.backlog.jp
    BACKLOG_PROJECT=PJKEY
    BACKLOG_ISSUE_TYPE=タスク        # optional
    BACKLOG_PRIORITY=中              # optional
    BACKLOG_API_KEY=...              # optional here; prefer the env var and
                                     # gitignore .backlog.env if you set it

Usage:
    # Create a new issue (project from .backlog.env, or --project PJKEY)
    python md2backlog.py doc.md [--project PJKEY] [--title "..."]

    # Add a comment to an existing issue
    python md2backlog.py doc.md --issue PJKEY-123

    # Show what would be uploaded/posted without calling the API
    python md2backlog.py doc.md --dry-run
"""

import argparse
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid

IMAGE_RE = re.compile(r"!\[([^\]]*)\]\(([^)\s]+)\)")

CONFIG_FILENAME = ".backlog.env"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def find_mermaid2png():
    """Locate the sibling gospelo-mermaid-plus skill's mermaid2png.py.

    Works both in the repository layout (skills/claude/<skill>/) and when
    installed (.claude/skills/<skill>/), where the two skills are siblings.
    """
    candidate = os.path.normpath(
        os.path.join(SCRIPT_DIR, "..", "..", "gospelo-mermaid-plus", "scripts", "mermaid2png.py")
    )
    if os.path.isfile(candidate):
        return candidate
    return None


def render_to_tmp(md_path, scale):
    """Copy the Markdown into a temp dir and render ALL mermaid blocks there.

    Backlog does not render ```mermaid blocks at all, so every diagram must
    become an image before posting. The original file is left untouched.
    Returns the path of the rendered temp copy.
    """
    renderer = find_mermaid2png()
    if not renderer:
        print(
            "Error: --render requires the gospelo-mermaid-plus skill installed"
            " next to this one (mermaid2png.py not found).",
            file=sys.stderr,
        )
        sys.exit(1)

    tmp_dir = tempfile.mkdtemp(prefix="md2backlog-")
    tmp_md = os.path.join(tmp_dir, os.path.basename(md_path))
    shutil.copy2(md_path, tmp_md)

    result = subprocess.run(
        [sys.executable, renderer, tmp_md, "--scale", str(scale)],
        capture_output=True,
        text=True,
    )
    sys.stdout.write(result.stdout)
    if result.returncode != 0:
        print(f"Error: mermaid rendering failed:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)
    return tmp_md


def load_config_file():
    """Find .backlog.env from cwd upward and parse KEY=VALUE lines."""
    d = os.getcwd()
    while True:
        path = os.path.join(d, CONFIG_FILENAME)
        if os.path.isfile(path):
            config = {}
            for line in open(path, "r", encoding="utf-8"):
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                config[key.strip()] = value.split("#")[0].strip()
            return config, path
        parent = os.path.dirname(d)
        if parent == d:
            return {}, None
        d = parent


def resolve(cli_value, config, env_key):
    """Resolution order: CLI argument > .backlog.env > environment variable."""
    if cli_value:
        return cli_value
    if config.get(env_key):
        return config[env_key]
    return os.environ.get(env_key, "").strip()


def require_connection(config):
    space = resolve(None, config, "BACKLOG_SPACE_URL")
    api_key = resolve(None, config, "BACKLOG_API_KEY")
    if not space or not api_key:
        print(
            "Error: BACKLOG_SPACE_URL and BACKLOG_API_KEY are required.\n"
            f"Set them in {CONFIG_FILENAME} (searched from the current directory"
            " upward) or as environment variables.",
            file=sys.stderr,
        )
        sys.exit(1)
    if not space.startswith("http"):
        space = "https://" + space
    return space.rstrip("/"), api_key


def api_url(space, path, api_key, **params):
    query = {"apiKey": api_key, **params}
    return f"{space}/api/v2/{path}?{urllib.parse.urlencode(query, doseq=True)}"


def api_get(space, path, api_key, **params):
    with urllib.request.urlopen(api_url(space, path, api_key, **params)) as resp:
        return json.load(resp)


def api_post(space, path, api_key, form):
    data = urllib.parse.urlencode(form, doseq=True).encode()
    req = urllib.request.Request(
        api_url(space, path, api_key),
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def upload_attachment(space, api_key, file_path):
    """POST /api/v2/space/attachment (multipart/form-data). Returns {id, name, size}."""
    boundary = uuid.uuid4().hex
    filename = os.path.basename(file_path)
    ctype = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    with open(file_path, "rb") as f:
        content = f.read()

    body = b"".join(
        [
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode(),
            f"Content-Type: {ctype}\r\n\r\n".encode(),
            content,
            f"\r\n--{boundary}--\r\n".encode(),
        ]
    )
    req = urllib.request.Request(
        api_url(space, "space/attachment", api_key),
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def collect_local_images(md_text, search_dirs):
    """Return list of (matched_text, rel_path, abs_path) for local image refs.

    Each relative reference is resolved against search_dirs in order — with
    --render that is the temp copy's directory (rendered diagrams) first,
    then the original document's directory (pre-existing regular images).
    """
    images = []
    for m in IMAGE_RE.finditer(md_text):
        ref = m.group(2)
        if ref.startswith(("http://", "https://", "data:")):
            continue
        abs_path = None
        for d in search_dirs:
            candidate = os.path.normpath(os.path.join(d, ref))
            if os.path.isfile(candidate):
                abs_path = candidate
                break
        if abs_path is None:
            abs_path = os.path.normpath(os.path.join(search_dirs[0], ref))
        images.append((m.group(0), ref, abs_path))
    return images


def rewrite_body(md_text, uploaded):
    """Replace ![alt](local_path) with Backlog inline syntax ![image][name]."""
    for original, _ref, name in uploaded:
        md_text = md_text.replace(original, f"![image][{name}]")
    return md_text


def split_title(md_text, explicit_title, fallback):
    """Use --title, else the first H1 (removed from body), else the filename."""
    if explicit_title:
        return explicit_title, md_text
    m = re.search(r"^#\s+(.+)$", md_text, re.MULTILINE)
    if m:
        title = m.group(1).strip()
        body = (md_text[: m.start()] + md_text[m.end() :]).lstrip("\n")
        return title, body
    return fallback, md_text


def resolve_issue_fields(space, api_key, project_key, issue_type, priority):
    project = api_get(space, f"projects/{project_key}", api_key)
    types = api_get(space, f"projects/{project_key}/issueTypes", api_key)
    if issue_type:
        matched = [t for t in types if t["name"] == issue_type]
        if not matched:
            names = ", ".join(t["name"] for t in types)
            print(f"Error: issue type '{issue_type}' not found. Available: {names}", file=sys.stderr)
            sys.exit(1)
        type_id = matched[0]["id"]
    else:
        type_id = types[0]["id"]

    priorities = api_get(space, "priorities", api_key)
    if priority:
        matched = [p for p in priorities if p["name"] == priority]
        if not matched:
            names = ", ".join(p["name"] for p in priorities)
            print(f"Error: priority '{priority}' not found. Available: {names}", file=sys.stderr)
            sys.exit(1)
        priority_id = matched[0]["id"]
    else:
        priority_id = priorities[len(priorities) // 2]["id"]  # middle = normal

    return project["id"], type_id, priority_id


def main():
    parser = argparse.ArgumentParser(
        description="Post a Markdown file with local images to a Backlog issue."
    )
    parser.add_argument("markdown_file", help="Path to the Markdown file to post")
    target = parser.add_mutually_exclusive_group()
    target.add_argument("--project", help="Project key: create a new issue (default: BACKLOG_PROJECT from .backlog.env)")
    target.add_argument("--issue", help="Issue key: add a comment (e.g. PJKEY-123)")
    parser.add_argument("--title", help="Issue summary (default: first H1, else filename)")
    parser.add_argument("--issue-type", help="Issue type name (default: BACKLOG_ISSUE_TYPE, else project's first type)")
    parser.add_argument("--priority", help="Priority name (default: BACKLOG_PRIORITY, else middle/normal)")
    parser.add_argument(
        "--render",
        action="store_true",
        help="Render ALL mermaid blocks to PNG in a temp copy first"
        " (Backlog cannot display mermaid code blocks); the original file is untouched",
    )
    parser.add_argument(
        "--scale",
        type=int,
        default=1,
        help="Render scale for --render (default: 1, lighter files for Backlog)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned uploads and body without calling the API",
    )
    args = parser.parse_args()

    config, config_path = load_config_file()
    if config_path:
        print(f"config: {config_path}")
    project = args.project if args.issue is None else None
    if not args.issue:
        project = resolve(args.project, config, "BACKLOG_PROJECT")
    if not project and not args.issue:
        print(
            "Error: no target. Pass --project/--issue or set BACKLOG_PROJECT"
            f" in {CONFIG_FILENAME}.",
            file=sys.stderr,
        )
        sys.exit(1)
    issue_type = resolve(args.issue_type, config, "BACKLOG_ISSUE_TYPE")
    priority = resolve(args.priority, config, "BACKLOG_PRIORITY")

    md_path = os.path.abspath(args.markdown_file)
    if not os.path.isfile(md_path):
        print(f"Error: file not found: {md_path}", file=sys.stderr)
        sys.exit(1)

    orig_dir = os.path.dirname(md_path)
    tmp_dir = None
    if args.render:
        md_path = render_to_tmp(md_path, args.scale)
        tmp_dir = os.path.dirname(md_path)
        search_dirs = [tmp_dir, orig_dir]
    else:
        search_dirs = [orig_dir]

    try:
        post(args, config, project, issue_type, priority, md_path, search_dirs)
    finally:
        # The rendered temp copy is upload-only material — remove it even on
        # failure (sys.exit raises SystemExit, so finally still runs).
        if tmp_dir:
            shutil.rmtree(tmp_dir, ignore_errors=True)


def post(args, config, project, issue_type, priority, md_path, search_dirs):
    md_text = open(md_path, "r", encoding="utf-8").read()
    images = collect_local_images(md_text, search_dirs)

    missing = [ref for _o, ref, p in images if not os.path.isfile(p)]
    if missing:
        print(f"Error: referenced image(s) not found: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    basenames = [os.path.basename(p) for _o, _r, p in images]
    dupes = {n for n in basenames if basenames.count(n) > 1}
    if len(set(p for _o, _r, p in images)) != len(set(basenames)) and dupes:
        print(
            f"Error: duplicate image filenames across directories: {', '.join(sorted(dupes))}."
            " Backlog references attachments by filename — rename them first.",
            file=sys.stderr,
        )
        sys.exit(1)

    if args.dry_run:
        title, body = split_title(md_text, args.title, os.path.basename(md_path))
        body = rewrite_body(body, [(o, r, os.path.basename(p)) for o, r, p in images])
        print(f"[dry-run] target : {'comment on ' + args.issue if args.issue else 'new issue in ' + project}")
        print(f"[dry-run] title  : {title}")
        print(f"[dry-run] uploads: {', '.join(basenames) or '(none)'}")
        print("[dry-run] ---- body ----")
        print(body)
        return

    space, api_key = require_connection(config)

    uploaded = []
    attachment_ids = []
    for original, ref, abs_path in images:
        result = upload_attachment(space, api_key, abs_path)
        uploaded.append((original, ref, result["name"]))
        attachment_ids.append(result["id"])
        print(f"  uploaded {ref} -> attachmentId {result['id']}")

    if not args.issue:
        title, body = split_title(md_text, args.title, os.path.basename(md_path))
        body = rewrite_body(body, uploaded)
        project_id, type_id, priority_id = resolve_issue_fields(
            space, api_key, project, issue_type, priority
        )
        form = [
            ("projectId", project_id),
            ("summary", title),
            ("description", body),
            ("issueTypeId", type_id),
            ("priorityId", priority_id),
        ] + [("attachmentId[]", a) for a in attachment_ids]
        issue = api_post(space, "issues", api_key, form)
        print(f"\nCreated: {space}/view/{issue['issueKey']}")
    else:
        body = rewrite_body(md_text, uploaded)
        form = [("content", body)] + [("attachmentId[]", a) for a in attachment_ids]
        api_post(space, f"issues/{args.issue}/comments", api_key, form)
        print(f"\nCommented: {space}/view/{args.issue}")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        print(f"Backlog API error {e.code}: {detail}", file=sys.stderr)
        sys.exit(1)
