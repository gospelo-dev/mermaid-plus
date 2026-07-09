#!/usr/bin/env python3
"""
apply_theme.py — Extract Mermaid blocks from a Markdown file, build an LLM
prompt that asks for color-scheme application, and print the prompt to stdout.

The caller (typically Claude via the Agent Skill) pipes this output back into
an LLM conversation to get properly themed Mermaid code.

Usage:
    python apply_theme.py <markdown_file> [--scheme <path>]

Output: a self-contained prompt (Markdown) including
  - the color-scheme reference
  - each mermaid block with its index
  - clear instructions for what the LLM should return

The script itself does NOT modify the file — the LLM's response is what
gets applied.
"""

import argparse
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SCHEME = os.path.join(SCRIPT_DIR, "..", "references", "color-scheme.md")


def read_scheme(path):
    path = os.path.abspath(path)
    if not os.path.isfile(path):
        print(f"Error: scheme file not found: {path}", file=sys.stderr)
        sys.exit(1)
    return open(path, "r", encoding="utf-8").read()


def extract_mermaid_blocks(md_text):
    pattern = re.compile(
        r"^```mermaid\s*\n(.*?)^```",
        re.MULTILINE | re.DOTALL,
    )
    return [(m.start(), m.end(), m.group(1)) for m in pattern.finditer(md_text)]


def build_prompt(md_path, scheme_text, blocks):
    """Build the LLM prompt with the scheme + extracted blocks."""

    block_sections = []
    for i, (start, end, code) in enumerate(blocks):
        block_sections.append(
            f"### Block {i + 1} (offset {start}–{end})\n"
            f"\n"
            f"```mermaid\n"
            f"{code}"
            f"```\n"
        )

    blocks_md = "\n".join(block_sections)

    prompt = f"""\
You are a Mermaid diagram styling assistant. Apply the color scheme below to
each Mermaid code block. Return ONLY the themed blocks in the same order,
each wrapped in ```mermaid fences, separated by a blank line. Do not add
any other text or explanation.

## Rules

1. **Do not change the diagram structure** — nodes, edges, labels, and
   subgraph groupings must stay exactly the same. Only add or update
   styling directives (classDef, class, style, linkStyle, %%{{init}}).
2. For **flowchart / graph** blocks:
   - Add `classDef node` with the palette values and apply it to ALL node IDs
     via `class A,B,C node`.
   - Add `style <subgraph_id> ...` for each subgraph (first = primary,
     rest = neutral) unless a custom palette override is already present.
   - Add `linkStyle` entries: solid teal for normal flow arrows (`-->`),
     dashed grey for dotted/dashed arrows (`-.->`). Indices are
     declaration-order, 0-based.
   - If the block already has `classDef node` / `linkStyle`, update values
     to match the palette rather than duplicating.
3. For **sequenceDiagram** blocks:
   - Insert the `%%{{init: ...}}%%` directive on the line immediately before
     `sequenceDiagram` (or update the existing one).
4. For other diagram types (pie, gantt, etc.): return unchanged.
5. Preserve all `fa:fa-*` icon notation exactly as-is.
6. Keep indentation style consistent with the original.

<color-scheme>
{scheme_text}
</color-scheme>

## Mermaid blocks from `{os.path.basename(md_path)}`

{blocks_md}"""

    return prompt


def main():
    parser = argparse.ArgumentParser(
        description="Build an LLM prompt to apply Mermaid color scheme."
    )
    parser.add_argument("markdown_file", help="Path to Markdown file")
    parser.add_argument(
        "--scheme",
        default=DEFAULT_SCHEME,
        help="Path to color-scheme reference (default: references/color-scheme.md)",
    )
    args = parser.parse_args()

    md_path = os.path.abspath(args.markdown_file)
    if not os.path.isfile(md_path):
        print(f"Error: {md_path} not found", file=sys.stderr)
        sys.exit(1)

    md_text = open(md_path, "r", encoding="utf-8").read()
    blocks = extract_mermaid_blocks(md_text)

    if not blocks:
        print("No ```mermaid blocks found.", file=sys.stderr)
        sys.exit(0)

    scheme_text = read_scheme(args.scheme)
    prompt = build_prompt(md_path, scheme_text, blocks)

    print(prompt)


if __name__ == "__main__":
    main()
