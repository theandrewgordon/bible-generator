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
    tokens = [token for token in re.split(r"\s+", line.strip()) if token and token not in {"|", ":", "||"}]
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
