#!/usr/bin/env python3
"""
mermaid2png.py — Render Mermaid code blocks in a Markdown file to PNG images.

For each ```mermaid block found:
  1. Renders it to PNG via Mermaid CLI (mmdc)
  2. Saves the PNG to an images/ directory next to the Markdown file
  3. Replaces the block with:
       ![diagram](images/<name>.png)
       <details><summary>Mermaid source</summary>
       ```mermaid
       ...original code...
       ```
       </details>

Usage:
    python mermaid2png.py <markdown_file> [--puppeteer-config <path>] [--scale <N>]
"""

import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile


def _node_version_key(path):
    m = re.search(r"node/v(\d+)\.(\d+)\.(\d+)/", path)
    return tuple(int(x) for x in m.groups()) if m else (0, 0, 0)


def find_mmdc():
    """Locate mmdc (Mermaid CLI). Returns the command as an argv list."""
    mmdc = shutil.which("mmdc")
    if mmdc:
        return [mmdc]
    home = os.path.expanduser("~")
    # Try common npm-global prefix path
    candidate = os.path.join(home, ".npm-global", "bin", "mmdc")
    if os.path.isfile(candidate):
        return [candidate]
    # nvm keeps global packages per node version; mmdc may live under a
    # version that is not currently active. Its shebang is `#!/usr/bin/env
    # node`, so whatever node is on PATH can run it.
    nvm_hits = glob.glob(os.path.join(home, ".nvm", "versions", "node", "*", "bin", "mmdc"))
    if nvm_hits:
        return [max(nvm_hits, key=_node_version_key)]
    # Last resort: npx fetches the CLI on first use
    npx = shutil.which("npx")
    if npx:
        return [npx, "-y", "@mermaid-js/mermaid-cli"]
    return ["mmdc"]  # let subprocess raise if not found


def find_chromium():
    """Find a usable Chromium executable for Puppeteer."""
    candidates = [
        # Playwright-installed Chromium (common in CI / cloud sandboxes)
        "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    # Try 'which'
    for name in ("chromium-browser", "chromium", "google-chrome"):
        path = shutil.which(name)
        if path:
            return path
    return None


def ensure_puppeteer_config(explicit_path=None):
    """Return path to a puppeteer config JSON for mmdc.

    If *explicit_path* is given and exists, use it.
    Otherwise auto-generate one pointing at a detected Chromium binary.
    """
    if explicit_path and os.path.isfile(explicit_path):
        return explicit_path

    chromium = find_chromium()
    if not chromium:
        return None  # mmdc will use its own bundled Chromium if available

    cfg = {
        "executablePath": chromium,
        "args": ["--no-sandbox"],
    }
    tmp = tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", prefix="puppeteer-cfg-", delete=False
    )
    json.dump(cfg, tmp)
    tmp.close()
    return tmp.name


def extract_mermaid_blocks(md_text):
    """Return list of (start, end, code) for each ```mermaid ... ``` block.

    Handles optional whitespace and language tag variations.
    """
    pattern = re.compile(
        r"^```mermaid\s*\n(.*?)^```",
        re.MULTILINE | re.DOTALL,
    )
    blocks = []
    for m in pattern.finditer(md_text):
        blocks.append((m.start(), m.end(), m.group(1)))
    return blocks


def render_mermaid_to_png(mermaid_code, output_path, mmdc_cmd, puppeteer_cfg, scale=2):
    """Render a Mermaid diagram string to a PNG file.

    Returns True on success, False on failure.
    """
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".mmd", prefix="mermaid-", delete=False
    ) as tmp:
        tmp.write(mermaid_code)
        tmp_path = tmp.name

    try:
        cmd = mmdc_cmd + [
            "-i", tmp_path,
            "-o", output_path,
            "-s", str(scale),
            "-b", "transparent",
        ]
        if puppeteer_cfg:
            cmd += ["-p", puppeteer_cfg]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            # generous: the npx fallback downloads the CLI on first use
            timeout=300,
        )
        if result.returncode != 0:
            print(f"  [WARN] mmdc failed: {result.stderr.strip()}", file=sys.stderr)
            return False
        return os.path.isfile(output_path)
    except subprocess.TimeoutExpired:
        print("  [WARN] mmdc timed out", file=sys.stderr)
        return False
    finally:
        os.unlink(tmp_path)


def build_replacement(image_rel_path, mermaid_code):
    """Build the replacement text: image + <details> fold."""
    # Normalise to forward slashes for Markdown compatibility
    image_rel_path = image_rel_path.replace("\\", "/")
    return (
        f"![diagram]({image_rel_path})\n"
        f"\n"
        f"<details><summary>Mermaid source</summary>\n"
        f"\n"
        f"```mermaid\n"
        f"{mermaid_code}"
        f"```\n"
        f"\n"
        f"</details>"
    )


def already_converted(md_text, block_start, md_dir):
    """Check if the mermaid block is already inside a <details> fold
    preceded by a PNG image that actually exists on disk.

    A wrapper alone is not enough: a prior ``--dry-run`` (or a manual
    edit) can leave the ``![diagram]`` reference + ``<details>`` fold in
    place while the PNG was never rendered.  In that case we must treat
    the block as *not* converted so it gets rendered on the real run.
    """
    # Look backwards from block_start for the pattern we produce
    prefix = md_text[max(0, block_start - 300):block_start]
    if "<details>" not in prefix:
        return False

    # Take the image reference closest to the block (last match in prefix)
    refs = re.findall(r"!\[diagram\]\(([^)]+)\)", prefix)
    if not refs:
        return False

    image_ref = refs[-1].strip()
    # Resolve the reference (relative to the Markdown file) to a real path.
    image_path = image_ref if os.path.isabs(image_ref) else os.path.join(md_dir, image_ref)
    return os.path.isfile(image_path)


def process_markdown(md_path, puppeteer_cfg=None, scale=2, dry_run=False):
    """Main entry point: process a single Markdown file."""
    md_path = os.path.abspath(md_path)
    if not os.path.isfile(md_path):
        print(f"Error: file not found: {md_path}", file=sys.stderr)
        return False

    md_dir = os.path.dirname(md_path)
    images_dir = os.path.join(md_dir, "images")

    md_text = open(md_path, "r", encoding="utf-8").read()
    blocks = extract_mermaid_blocks(md_text)

    if not blocks:
        print("No ```mermaid blocks found.")
        return True

    print(f"Found {len(blocks)} mermaid block(s) in {os.path.basename(md_path)}")

    # Determine a base name from the markdown filename
    base = os.path.splitext(os.path.basename(md_path))[0]

    def png_ref(real_idx):
        png_name = f"{base}-{real_idx + 1}.png" if len(blocks) > 1 else f"{base}.png"
        return png_name, os.path.join(images_dir, png_name), f"images/{png_name}"

    # --dry-run must be side-effect free: no rendering, no images/ dir, and
    # crucially NO Markdown rewrite.  A prior version rewrote the file into the
    # "converted" shape without producing PNGs, which then made the real run
    # skip every block as "already converted" — leaving broken image links.
    if dry_run:
        would_convert = 0
        for real_idx, (start, end, code) in enumerate(blocks):
            _, _, rel_path = png_ref(real_idx)
            if already_converted(md_text, start, md_dir):
                print(f"  Block {real_idx + 1}: already converted, would skip")
            else:
                print(f"  Block {real_idx + 1}: would render → {rel_path}")
                would_convert += 1
        print(f"\nDry run: {would_convert}/{len(blocks)} block(s) would be converted. "
              f"No files written.")
        return True

    mmdc_cmd = find_mmdc()
    pup_cfg = ensure_puppeteer_config(puppeteer_cfg)

    os.makedirs(images_dir, exist_ok=True)

    # Process blocks in reverse order so string offsets stay valid
    converted = 0
    for idx, (start, end, code) in enumerate(reversed(blocks)):
        real_idx = len(blocks) - 1 - idx  # original order index

        if already_converted(md_text, start, md_dir):
            print(f"  Block {real_idx + 1}: already converted, skipping")
            continue

        _, png_path, rel_path = png_ref(real_idx)

        print(f"  Block {real_idx + 1}: rendering → {rel_path}")

        ok = render_mermaid_to_png(code, png_path, mmdc_cmd, pup_cfg, scale)
        if ok:
            replacement = build_replacement(rel_path, code)
            md_text = md_text[:start] + replacement + md_text[end:]
            converted += 1
        else:
            print(f"  Block {real_idx + 1}: FAILED — keeping original", file=sys.stderr)

    if converted > 0:
        open(md_path, "w", encoding="utf-8").write(md_text)
        print(f"\nDone: {converted}/{len(blocks)} block(s) converted.")
    else:
        print("\nNo blocks were converted.")

    # Clean up temp puppeteer config if we auto-generated one
    if pup_cfg and pup_cfg != puppeteer_cfg and os.path.isfile(pup_cfg):
        os.unlink(pup_cfg)

    return True


def main():
    parser = argparse.ArgumentParser(
        description="Render Mermaid blocks in Markdown to PNG images."
    )
    parser.add_argument("markdown_file", help="Path to the Markdown file to process")
    parser.add_argument(
        "--puppeteer-config",
        help="Path to puppeteer config JSON for mmdc (auto-detected if omitted)",
    )
    parser.add_argument(
        "--scale",
        type=int,
        default=2,
        help="Render scale factor (default: 2 for retina)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report block count and planned output paths only; "
             "render nothing and leave the Markdown untouched",
    )
    args = parser.parse_args()
    success = process_markdown(
        args.markdown_file,
        puppeteer_cfg=args.puppeteer_config,
        scale=args.scale,
        dry_run=args.dry_run,
    )
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
