"""Print apply_theme.py's CIELAB results for the colors on stdin (JSON list).

Usage: python3 cielab_dump.py <scripts_dir> < colors.json
"""
import json
import sys

sys.path.insert(0, sys.argv[1])
import apply_theme as t  # noqa: E402

out = []
for c in json.load(sys.stdin):
    out.append([
        t.derive_light_tint(c),
        f"{t._perceptual_saturation(c):.2f}",
        f"{t._perceptual_lightness(c):.2f}",
    ])
print(json.dumps(out))
