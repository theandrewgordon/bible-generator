"""Keep rude player names off the shared screen (church TV, family room).

Local and instant: no network call during a join. Short words are matched
as whole words (so "Cassie" and "Dickens" are fine); a few unambiguous
roots are matched anywhere. Common letter swaps (0→o, 1→i, $→s…) and
stretched letters ("fuuuck") are normalized first. The host can still
remove any player.
"""
from __future__ import annotations

import re

_SWAPS = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i"})

# Matched anywhere in the name (roots that don't occur inside real names).
_ROOTS = ("fuck", "fuk", "shit", "bitch", "cunt", "nigg", "fagg", "whore", "slut", "porn", "penis", "vagina", "boob", "dildo", "jizz")
# Matched only as whole words.
_WORDS = {
    "ass", "asses", "arse", "asshole", "damn", "dammit", "hell", "crap", "dick", "dicks", "cock", "pussy", "tit", "tits",
    "sex", "sexy", "rape", "nazi", "hitler", "kkk", "retard", "retarded", "fag", "hoe", "piss", "poop", "butt", "butthole",
    "wtf", "stfu", "bastard", "douche", "nude", "naked",
}


def _forms(name: str) -> tuple[str, str]:
    plain = (name or "").lower().translate(_SWAPS)
    return plain, re.sub(r"(.)\1{2,}", r"\1", plain)  # "fuuuck" -> "fuck"


def is_unsafe_name(name: str) -> bool:
    for text in _forms(name):
        squashed = re.sub(r"[^a-z]", "", text)
        if any(root in squashed for root in _ROOTS):
            return True
        if any(word in _WORDS for word in re.findall(r"[a-z]+", text)):
            return True
    return False
