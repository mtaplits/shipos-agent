# Pixel-parity baseline

Generated 2026-08-08 against upstream Goose commit
`064244e6bddf641876676f054a006b7da1da5182` using Goose agent binary `1.45.0`.

## Captures

- `goose-reference.normalized.png` — upstream Goose first-run shell capture,
  normalized from the macOS compositor capture to 1880×1600.
- `shipos-agent.png` — SHIP-OS Agent first-run shell capture at 1880×1600.
- `diff.png` — ImageMagick absolute-error visualization.
- `report.json` — machine-readable changed-pixel metric.

The baseline reports 53,761 changed pixels out of 3,008,000 (1.787267%).
This is expected at this stage: SHIP-OS Agent intentionally adds SHIP-OS navigation/auth identity while preserving Goose's layout, component, typography, color, and motion system. The original upstream capture was 3024×1898 because Electron restored a persisted Goose window state; it was normalized to the candidate dimensions for the baseline. Future comparisons should capture both apps in fresh user-data directories to avoid restored-window state.

Regenerate the metric with ImageMagick 7:

```sh
PATH="/opt/homebrew/bin:$PATH" python3 scripts/pixel-diff.py \
  artifacts/pixel-parity/goose-reference.normalized.png \
  artifacts/pixel-parity/shipos-agent.png
```
