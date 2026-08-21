"""Small, dependency-free chord chart helpers for Worship resources."""

from __future__ import annotations

import re


CHROMATIC_KEYS = ("C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B")

_NOTE_VALUE = {
    "C": 0, "B#": 0,
    "C#": 1, "DB": 1,
    "D": 2,
    "D#": 3, "EB": 3,
    "E": 4, "FB": 4,
    "E#": 5, "F": 5,
    "F#": 6, "GB": 6,
    "G": 7,
    "G#": 8, "AB": 8,
    "A": 9,
    "A#": 10, "BB": 10,
    "B": 11, "CB": 11,
}
_SHARP_NOTES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
_FLAT_NOTES = CHROMATIC_KEYS
_FLAT_KEYS = {"F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm"}
_KEY_RE = re.compile(r"^\s*([A-Ga-g])([#b]?)(m?)\s*$")
_CHORD_RE = re.compile(
    r"^([A-Ga-g])([#b]?)"
    r"((?:(?:maj|min|dim|aug|sus|add|omit|no|alt)|[mM0-9()+#b+\-°ø])*)"
    r"(?:/([A-Ga-g])([#b]?))?$"
)
_BRACKET_CHORD_RE = re.compile(r"\[([^\]\r\n]+)\]")
_KEY_DIRECTIVE_RE = re.compile(r"(\{\s*key\s*:\s*)([A-Ga-g][#b]?m?)(\s*\})", re.IGNORECASE)
_PLAIN_TOKEN_RE = re.compile(r"(?<!\S)([A-Ga-g](?:#|b)?[^\s|,;]*)(?!\S)")
_DIRECTIVE_RE = re.compile(r"^\{\s*([^:}]+)\s*:\s*(.*?)\s*\}$")
_SECTION_RE = re.compile(
    r"^(?:intro|verse|pre[- ]?chorus|chorus|refrain|bridge|interlude|instrumental|"
    r"turnaround|tag|ending|outro|vamp|breakdown)(?:\s+\d+|\s+[a-z])?$",
    re.IGNORECASE,
)
_SECTION_DIRECTIVES = {"comment", "c", "section", "s", "start_of_verse", "start_of_chorus", "start_of_bridge"}
_HIDDEN_DIRECTIVES = {"title", "t", "subtitle", "st", "artist", "key", "tempo", "time", "capo"}
_PAGE_CHART_STOP_RE = re.compile(
    r"^(?:videos?|links?|other versions? of this song|follow us)$",
    re.IGNORECASE,
)
_ORIGINAL_KEY_RE = re.compile(r"^([A-G](?:#|b)?m?)\s*\(\s*original\s*\)$", re.IGNORECASE)
_METADATA_PATTERNS = {
    "ccli_song_number": re.compile(r"^CCLI(?:\s*(?:Song)?\s*(?:#|Number))?\s*:\s*([0-9-]+)\s*$", re.I),
    "key": re.compile(r"^Key\s*:\s*([A-G](?:#|b)?m?)\s*$", re.I),
    "bpm": re.compile(r"^BPM\s*:\s*(\d{1,3})\s*$", re.I),
    "time_signature": re.compile(r"^Time\s*Sig(?:nature)?\s*:\s*([0-9]+\s*/\s*[0-9]+)\s*$", re.I),
    "writers": re.compile(r"^Writers?\s*:\s*(.+)$", re.I),
    "themes": re.compile(r"^Themes?\s*:\s*(.+)$", re.I),
    "scripture": re.compile(r"^Scripture\s*:\s*(.+)$", re.I),
}


def normalize_key(value: str) -> str:
    """Return a canonical major/minor key spelling or an empty string."""
    match = _KEY_RE.match(str(value or ""))
    if not match:
        return ""
    root = match.group(1).upper() + match.group(2)
    if root.upper() not in _NOTE_VALUE:
        return ""
    return root + match.group(3).lower()


def key_distance(source_key: str, target_key: str) -> int:
    source = normalize_key(source_key)
    target = normalize_key(target_key)
    if not source or not target:
        raise ValueError("Choose a valid source and target key.")
    if source.endswith("m") != target.endswith("m"):
        raise ValueError("Source and target keys must both be major or both be minor.")
    return (_NOTE_VALUE[target.removesuffix("m").upper()] - _NOTE_VALUE[source.removesuffix("m").upper()]) % 12


def _transpose_note(root: str, accidental: str, semitones: int, prefer_flats: bool) -> str:
    value = _NOTE_VALUE.get((root.upper() + accidental).upper())
    if value is None:
        return root + accidental
    notes = _FLAT_NOTES if prefer_flats else _SHARP_NOTES
    return notes[(value + semitones) % 12]


def transpose_chord(chord: str, semitones: int, *, prefer_flats: bool = False) -> str:
    """Transpose one chord symbol while preserving its quality and slash bass."""
    raw = str(chord or "")
    match = _CHORD_RE.match(raw)
    if not match:
        return raw
    root, accidental, suffix, bass_root, bass_accidental = match.groups()
    result = _transpose_note(root, accidental, semitones, prefer_flats) + suffix
    if bass_root:
        result += "/" + _transpose_note(bass_root, bass_accidental or "", semitones, prefer_flats)
    return result


def _looks_like_chord_line(line: str) -> bool:
    rhythm_tokens = {"|", ":", "||", "/", "//", "///", "////"}
    tokens = [token for token in re.split(r"\s+", line.strip()) if token and token not in rhythm_tokens]
    if not tokens:
        return False
    chordish = 0
    for token in tokens:
        cleaned = token.strip("|,:()")
        if _CHORD_RE.match(cleaned) or cleaned in {"N.C.", "NC", "N/C", "%", "x2", "x3", "x4"}:
            chordish += 1
    return chordish >= max(1, int(len(tokens) * 0.65 + 0.5))


def transpose_chart(chart: str, source_key: str, target_key: str) -> str:
    """Transpose ChordPro brackets and conservative plain-text chord rows."""
    semitones = key_distance(source_key, target_key)
    normalized_target = normalize_key(target_key)
    prefer_flats = normalized_target in _FLAT_KEYS or "b" in normalized_target

    def bracket_replace(match: re.Match[str]) -> str:
        chord = match.group(1)
        return "[" + transpose_chord(chord, semitones, prefer_flats=prefer_flats) + "]"

    output = []
    for line in str(chart or "").splitlines():
        chordpro_line = _KEY_DIRECTIVE_RE.sub(
            lambda match: match.group(1) + normalized_target + match.group(3), line
        )
        chordpro_line = _BRACKET_CHORD_RE.sub(bracket_replace, chordpro_line)
        if chordpro_line == line and _looks_like_chord_line(line):
            def token_replace(match: re.Match[str]) -> str:
                token = match.group(1)
                prefix = token[: len(token) - len(token.lstrip("|,:()"))]
                suffix = token[len(token.rstrip("|,:()")) :]
                core = token[len(prefix): len(token) - len(suffix) if suffix else None]
                return prefix + transpose_chord(core, semitones, prefer_flats=prefer_flats) + suffix
            chordpro_line = _PLAIN_TOKEN_RE.sub(token_replace, line)
        output.append(chordpro_line)
    return "\n".join(output)


def chart_has_chords(chart: str) -> bool:
    text = str(chart or "")
    if _BRACKET_CHORD_RE.search(text):
        return True
    return any(_looks_like_chord_line(line) for line in text.splitlines())


def _is_chord_marker(value: str) -> bool:
    marker = str(value or "").strip()
    if len(marker) > 2 and marker.startswith("(") and marker.endswith(")"):
        marker = marker[1:-1].strip()
    return bool(_CHORD_RE.match(marker) or marker in {"N.C.", "NC", "N/C", "%"})


def _chordpro_segments(line: str) -> list[dict[str, str]]:
    """Pair each ChordPro chord with the lyric phrase that follows it."""
    matches = list(_BRACKET_CHORD_RE.finditer(line))
    if not matches or not all(_is_chord_marker(match.group(1)) for match in matches):
        return []

    segments: list[dict[str, str]] = []
    if matches[0].start():
        segments.append({"chord": "", "lyric": line[:matches[0].start()]})
    for index, match in enumerate(matches):
        next_start = matches[index + 1].start() if index + 1 < len(matches) else len(line)
        segments.append({
            "chord": match.group(1).strip(),
            "lyric": line[match.end():next_start],
        })
    return segments


def _section_title(value: str) -> str:
    title = " ".join(str(value or "").strip().split())
    return title if _SECTION_RE.match(title) else ""


def _plain_chord_tokens(line: str) -> list[tuple[int, str]]:
    tokens: list[tuple[int, str]] = []
    for match in re.finditer(r"\S+", str(line or "")):
        raw_token = match.group(0)
        if raw_token in {"/", "//", "///", "////", "|", "||", ":"}:
            continue
        token = raw_token.strip("|,:;")
        if not token:
            continue
        if not _is_chord_marker(token):
            return []
        tokens.append((match.start(), token))
    return tokens


def _nearest_lyric_boundary(lyric: str, position: int) -> int:
    position = min(max(position, 0), len(lyric))
    if position == 0 or position == len(lyric) or lyric[position - 1].isspace():
        return position
    candidates = [
        candidate for candidate in range(max(0, position - 3), min(len(lyric), position + 3) + 1)
        if candidate == 0 or candidate == len(lyric) or lyric[candidate - 1].isspace()
    ]
    return min(candidates, key=lambda candidate: (abs(candidate - position), candidate)) if candidates else position


def _merge_plain_chords_with_lyrics(chord_line: str, lyric_line: str) -> str:
    """Convert a visually aligned chord row plus lyric row into ChordPro."""
    lyric = str(lyric_line or "").rstrip()
    insertions: list[tuple[int, str]] = []
    for column, chord in _plain_chord_tokens(chord_line):
        insertions.append((_nearest_lyric_boundary(lyric, column), f"[{chord}]"))
    for position, marker in sorted(insertions, key=lambda item: item[0], reverse=True):
        lyric = lyric[:position] + marker + lyric[position:]
    lyric = re.sub(r"\bI\s+'\s*m\b", "I'm", lyric, flags=re.I)
    return re.sub(r"[ \t]+", " ", lyric).strip()


def clean_pasted_chord_chart(chart: str) -> dict[str, object]:
    """Extract an exact chart from copied song-page text without rewriting lyrics.

    Page navigation and footer text are removed only when a strong chord-chart
    boundary is present. Plain chord rows are paired with the lyric row below
    them using their copied column positions, producing responsive ChordPro.
    """
    raw_text = str(chart or "").replace("\r\n", "\n").replace("\r", "\n")
    lines = raw_text.split("\n")
    metadata: dict[str, str] = {}
    for line in lines:
        stripped = line.strip()
        for name, pattern in _METADATA_PATTERNS.items():
            match = pattern.match(stripped)
            if match and name not in metadata:
                value = re.sub(r"\s+", " ", match.group(1)).strip()
                metadata[name] = value.replace("-", "") if name == "ccli_song_number" else value

    original_key_indexes = [index for index, line in enumerate(lines) if _ORIGINAL_KEY_RE.match(line.strip())]
    chords_indexes = [index for index, line in enumerate(lines) if line.strip().lower() == "chords"]
    start_index = -1
    if original_key_indexes:
        candidate = original_key_indexes[-1]
        if not chords_indexes or any(index < candidate for index in chords_indexes):
            start_index = candidate + 1
            original_key = _ORIGINAL_KEY_RE.match(lines[candidate].strip())
            if original_key and "key" not in metadata:
                metadata["key"] = original_key.group(1)
    elif chords_indexes:
        candidate = chords_indexes[-1] + 1
        if any(_section_title(line.strip().rstrip(":")) for line in lines[candidate:candidate + 20]):
            start_index = candidate

    # A normal hand-authored chart should pass through unchanged.
    if start_index < 0:
        return {"chart": raw_text.strip(), "metadata": metadata, "changed": False, "removed_lines": 0}

    end_index = len(lines)
    for index in range(start_index, len(lines)):
        stripped = lines[index].strip()
        if _PAGE_CHART_STOP_RE.match(stripped) or stripped.lower().startswith("copyright ©"):
            end_index = index
            break

    body = lines[start_index:end_index]
    output: list[str] = []
    index = 0
    while index < len(body):
        line = body[index].rstrip()
        stripped = line.strip()
        if not stripped:
            if output and output[-1] != "":
                output.append("")
            index += 1
            continue

        repeat_match = re.fullmatch(
            r"repeat\s+(verse|chorus|bridge|tag)(?:\s*(\d+))?\s*:?", stripped, flags=re.I
        )
        if repeat_match:
            label = repeat_match.group(1).title() + (f" {repeat_match.group(2)}" if repeat_match.group(2) else "")
            output.append(f"{{comment: Repeat {label}}}")
            index += 1
            continue

        next_line = body[index + 1].rstrip() if index + 1 < len(body) else ""
        next_stripped = next_line.strip()
        chord_tokens = _plain_chord_tokens(line)
        next_is_section = bool(_section_title(next_stripped.rstrip(":")))
        if chord_tokens and next_stripped and not _looks_like_chord_line(next_line) and not next_is_section:
            output.append(_merge_plain_chords_with_lyrics(line, next_line))
            index += 2
            continue

        section = _section_title(stripped.rstrip(":"))
        output.append(section or re.sub(r"[ \t]+", " ", stripped))
        index += 1

    while output and output[-1] == "":
        output.pop()
    cleaned = "\n".join(output).strip()
    removed_lines = max(0, len(lines) - len(body))
    return {
        "chart": cleaned or raw_text.strip(),
        "metadata": metadata,
        "changed": bool(cleaned and cleaned != raw_text.strip()),
        "removed_lines": removed_lines,
    }


def parse_chord_chart(chart: str) -> list[dict[str, object]]:
    """Convert ChordPro/plain text into safe, presentation-ready chart sections.

    The returned values are plain strings and dictionaries so Jinja can retain
    its normal auto-escaping. Chords are paired with their following lyric text,
    which keeps the musical cue attached to the right word on narrow screens.
    """
    sections: list[dict[str, object]] = []
    current: dict[str, object] = {"title": "", "lines": [], "repeat": False}

    def finish_section() -> None:
        nonlocal current
        lines = current["lines"]
        while lines and lines[-1].get("kind") == "spacer":
            lines.pop()
        if current["title"] or lines:
            sections.append(current)
        current = {"title": "", "lines": [], "repeat": False}

    for raw_line in str(chart or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        stripped = raw_line.strip()
        if not stripped:
            lines = current["lines"]
            if lines and lines[-1].get("kind") != "spacer":
                lines.append({"kind": "spacer"})
            continue

        directive = _DIRECTIVE_RE.match(stripped)
        if directive:
            name = directive.group(1).strip().lower().replace("-", "_").replace(" ", "_")
            value = directive.group(2).strip()
            is_repeat = bool(re.match(r"^repeat\s+(?:verse|chorus|bridge|tag)", value, flags=re.I))
            comment_is_section = name in {"comment", "c"} and bool(_section_title(value) or is_repeat)
            if value and (name in _SECTION_DIRECTIVES - {"comment", "c"} or comment_is_section):
                finish_section()
                current["title"] = value
                current["repeat"] = is_repeat
            elif name not in _HIDDEN_DIRECTIVES and value:
                current["lines"].append({"kind": "note", "text": value})
            continue

        bracket_header = re.fullmatch(r"\[([^\]]+)\]", stripped)
        header = _section_title(bracket_header.group(1) if bracket_header else stripped)
        if header:
            finish_section()
            current["title"] = header
            continue

        # Some provider exports wrap an entire measure progression in brackets.
        if bracket_header and ("|" in bracket_header.group(1) or "/" in bracket_header.group(1)):
            current["lines"].append({"kind": "progression", "text": bracket_header.group(1).strip()})
            continue

        segments = _chordpro_segments(raw_line)
        if segments:
            current["lines"].append({"kind": "song", "segments": segments})
        elif _looks_like_chord_line(raw_line):
            current["lines"].append({"kind": "chords", "text": stripped})
        else:
            current["lines"].append({"kind": "lyrics", "text": raw_line})

    finish_section()
    return sections
