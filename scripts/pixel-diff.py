#!/usr/bin/env python3
"""Compare matched PNG captures with only the Python standard library unavailable.

Requires ImageMagick (`magick`) for pixel comparison and emits JSON + a visual
absolute-difference PNG. This keeps screenshot generation deterministic and CI-
independent while retaining exact pixel metrics.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def identify(path: Path) -> tuple[int, int]:
    out = subprocess.check_output(["magick", "identify", "-format", "%w %h", str(path)], text=True)
    width, height = out.split()
    return int(width), int(height)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("reference", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--diff", type=Path, default=Path("artifacts/pixel-parity/diff.png"))
    parser.add_argument("--report", type=Path, default=Path("artifacts/pixel-parity/report.json"))
    args = parser.parse_args()
    ref_size = identify(args.reference)
    candidate_size = identify(args.candidate)
    if ref_size != candidate_size:
        raise SystemExit(f"capture sizes differ: reference={ref_size}, candidate={candidate_size}")
    args.diff.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    metric = subprocess.run(
        ["magick", "compare", "-metric", "AE", str(args.reference), str(args.candidate), str(args.diff)],
        text=True, capture_output=True,
    )
    # ImageMagick compare returns 1 when pixels differ; metric is stderr.
    # HDRI builds may append a normalized value: "53761.5 (0.0178)".
    changed = int(float((metric.stderr.strip().split() or ["0"])[0]))
    total = ref_size[0] * ref_size[1]
    report = {
        "reference": str(args.reference), "candidate": str(args.candidate),
        "width": ref_size[0], "height": ref_size[1], "total_pixels": total,
        "changed_pixels": changed, "changed_percent": round(changed / total * 100, 6),
        "diff": str(args.diff),
    }
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
