#!/usr/bin/env python3
"""Validate normalized game content and print an actionable JSON report."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from faithsparks.services.game_content import (
    load_bible_bee_content,
    load_family_game_content,
    validate_bible_bee_content,
    validate_family_content,
)


def main() -> int:
    report = {
        "family_game_night": validate_family_content(load_family_game_content()),
        "bible_bee": validate_bible_bee_content(load_bible_bee_content()),
    }
    print(json.dumps(report, indent=2, sort_keys=True))
    blocking_keys = ("structural_errors", "editorial_errors", "depth_errors")
    return 1 if any(section[key] for section in report.values() for key in blocking_keys) else 0


if __name__ == "__main__":
    raise SystemExit(main())
