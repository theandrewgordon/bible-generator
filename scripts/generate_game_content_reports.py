#!/usr/bin/env python3
"""Regenerate committed machine-readable and editorial content-health reports."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from faithsparks.services.game_content_health import (
    BEE_REPORT_PATH, FGN_REPORT_PATH, bible_bee_health, family_game_night_health,
    render_bible_markdown, render_family_markdown,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sampler-seeds", type=int, default=5000)
    args = parser.parse_args()
    family = family_game_night_health(sampler_seeds=max(1, args.sampler_seeds))
    bee = bible_bee_health()
    FGN_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    FGN_REPORT_PATH.write_text(json.dumps(family, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    BEE_REPORT_PATH.write_text(json.dumps(bee, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "docs" / "family-game-night-editorial-review.md").write_text(render_family_markdown(family), encoding="utf-8")
    (ROOT / "docs" / "bible-bee-editorial-review.md").write_text(render_bible_markdown(bee), encoding="utf-8")
    errors = sum(len(report["validation"][key]) for report in (family, bee) for key in ("structural_errors", "editorial_errors", "depth_errors"))
    print(json.dumps({"errors": errors, "family": family["counts"], "bible_bee": bee["counts"]}, indent=2, sort_keys=True))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
