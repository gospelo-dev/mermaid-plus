#!/usr/bin/env python3
"""
apply_theme.py — Extract Mermaid blocks from a Markdown file, build an LLM
prompt that asks for color-scheme application, and print the prompt to stdout.

The caller (typically Claude via the Agent Skill) pipes this output back into
an LLM conversation to get properly themed Mermaid code.

Usage:
    python apply_theme.py <markdown_file> [--scheme <path>] [--accent '#RRGGBB']

Output: a self-contained prompt (Markdown) including
  - the color-scheme reference
  - each mermaid block with its index
  - clear instructions for what the LLM should return

The script itself does NOT modify the file — the LLM's response is what
gets applied.
"""

import argparse
import math
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SCHEME = os.path.join(SCRIPT_DIR, "..", "references", "color-scheme.md")

# Default scheme placeholder colors
_DEFAULT_ACCENT = "#0D9488"
_DEFAULT_TINT = "#F0FDFA"

# --- CIELAB color science (ported from chart-banana/worker/src/themes.py) ---

_D65_XN, _D65_YN, _D65_ZN = 95.047, 100.0, 108.883
_CHROMA_MAX = 135.0


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _linear_to_srgb(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1.0 / 2.4) - 0.055


def _lab_f(t):
    delta = 6.0 / 29.0
    if t > delta ** 3:
        return t ** (1.0 / 3.0)
    return t / (3.0 * delta * delta) + 4.0 / 29.0


def _lab_f_inv(t):
    delta = 6.0 / 29.0
    if t > delta:
        return t ** 3.0
    return 3.0 * delta * delta * (t - 4.0 / 29.0)


def _hex_to_lab(hex_color):
    h = hex_color.lstrip("#")
    ri, gi, bi = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

    r = _srgb_to_linear(ri / 255.0)
    g = _srgb_to_linear(gi / 255.0)
    b = _srgb_to_linear(bi / 255.0)

    x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) * 100.0
    y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) * 100.0
    z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) * 100.0

    fx = _lab_f(x / _D65_XN)
    fy = _lab_f(y / _D65_YN)
    fz = _lab_f(z / _D65_ZN)

    L = 116.0 * fy - 16.0
    a = 500.0 * (fx - fy)
    b_val = 200.0 * (fy - fz)
    return L, a, b_val


def _lab_to_linear_rgb(L, a, b_val):
    fy = (L + 16.0) / 116.0
    fx = a / 500.0 + fy
    fz = fy - b_val / 200.0

    x = _lab_f_inv(fx) * _D65_XN / 100.0
    y = _lab_f_inv(fy) * _D65_YN / 100.0
    z = _lab_f_inv(fz) * _D65_ZN / 100.0

    rl = 3.2404542 * x + -1.5371385 * y + -0.4985314 * z
    gl = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z
    bl = 0.0556434 * x + -0.2040259 * y + 1.0572252 * z
    return rl, gl, bl


def _in_srgb_gamut(rl, gl, bl):
    eps = -1e-6
    return all(eps <= c <= 1.0 + 1e-6 for c in (rl, gl, bl))


def _lab_to_hex(L, a, b_val):
    rl, gl, bl = _lab_to_linear_rgb(L, a, b_val)
    ri = round(max(0.0, min(1.0, _linear_to_srgb(rl))) * 255)
    gi = round(max(0.0, min(1.0, _linear_to_srgb(gl))) * 255)
    bi = round(max(0.0, min(1.0, _linear_to_srgb(bl))) * 255)
    return f"#{ri:02X}{gi:02X}{bi:02X}"


def derive_light_tint(accent_hex):
    """Derive a very light tint from an accent color for subgraph fills.

    Lifts to L*=97 while preserving hue direction. Reduces chroma to ~5
    for a subtle wash. Achromatic input yields neutral near-white.
    """
    L, a, b_val = _hex_to_lab(accent_hex)
    chroma = math.sqrt(a * a + b_val * b_val)

    target_L = 98.0
    target_chroma = 5.0

    if chroma < 0.5:
        return _lab_to_hex(target_L, 0.0, 0.0)

    ha = a / chroma
    hb = b_val / chroma
    new_a = ha * target_chroma
    new_b = hb * target_chroma

    if _in_srgb_gamut(*_lab_to_linear_rgb(target_L, new_a, new_b)):
        return _lab_to_hex(target_L, new_a, new_b)

    lo, hi = 0.0, target_chroma
    for _ in range(24):
        mid = (lo + hi) / 2.0
        if _in_srgb_gamut(*_lab_to_linear_rgb(target_L, ha * mid, hb * mid)):
            lo = mid
        else:
            hi = mid
    return _lab_to_hex(target_L, ha * lo, hb * lo)


def _perceptual_saturation(hex_color):
    _, a, b_val = _hex_to_lab(hex_color)
    return min(math.sqrt(a * a + b_val * b_val) / _CHROMA_MAX, 1.0)


def _perceptual_lightness(hex_color):
    L, _, _ = _hex_to_lab(hex_color)
    return max(0.0, min(L / 100.0, 1.0))


# --- end CIELAB ---


def read_scheme(path):
    path = os.path.abspath(path)
    if not os.path.isfile(path):
        print(f"Error: scheme file not found: {path}", file=sys.stderr)
        sys.exit(1)
    return open(path, "r", encoding="utf-8").read()


def apply_accent_to_scheme(scheme_text, accent_hex):
    """Replace default accent/tint colors and neutralize color name references."""
    tint_hex = derive_light_tint(accent_hex)

    result = scheme_text.replace(_DEFAULT_ACCENT, accent_hex)
    result = result.replace(_DEFAULT_ACCENT.lower(), accent_hex)
    result = result.replace(_DEFAULT_TINT, tint_hex)
    result = result.replace(_DEFAULT_TINT.lower(), tint_hex)

    result = re.sub(r'\bTeal\b', 'Accent color', result)
    result = re.sub(r'\bteal\b', 'accent color', result)
    result = re.sub(r'\bLight teal\b', 'Light accent tint', result)
    result = re.sub(r'\bLight Teal\b', 'Light Accent Tint', result)

    return result


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
   - Add `linkStyle` entries: solid accent color for normal flow arrows (`-->`),
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
    parser.add_argument(
        "--accent",
        default=None,
        help=(
            "Accent color as '#RRGGBB'. Auto-generates a complete color scheme "
            "from a single accent color using CIELAB color science. Replaces the "
            "default teal accent in the scheme template."
        ),
    )
    args = parser.parse_args()

    md_path = os.path.abspath(args.markdown_file)
    if not os.path.isfile(md_path):
        print(f"Error: {md_path} not found", file=sys.stderr)
        sys.exit(1)

    if args.accent:
        accent = args.accent.strip().strip("'\"")
        if not re.match(r'^#?[0-9A-Fa-f]{6}$', accent):
            print(f"Error: invalid accent color: {accent} (expected '#RRGGBB')", file=sys.stderr)
            sys.exit(1)
        if not accent.startswith("#"):
            accent = f"#{accent}"
        args.accent = accent.upper()

        sat = _perceptual_saturation(args.accent)
        lgt = _perceptual_lightness(args.accent)
        if sat < 0.22 or lgt > 0.85:
            print(
                f"Warning: {args.accent} has low contrast on white "
                f"(saturation={sat:.2f}, lightness={lgt:.2f}). "
                f"Link strokes may be hard to see.",
                file=sys.stderr,
            )

    md_text = open(md_path, "r", encoding="utf-8").read()
    blocks = extract_mermaid_blocks(md_text)

    if not blocks:
        print("No ```mermaid blocks found.", file=sys.stderr)
        sys.exit(0)

    scheme_text = read_scheme(args.scheme)

    if args.accent:
        scheme_text = apply_accent_to_scheme(scheme_text, args.accent)

    prompt = build_prompt(md_path, scheme_text, blocks)

    print(prompt)


if __name__ == "__main__":
    main()
