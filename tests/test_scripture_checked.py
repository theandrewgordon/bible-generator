"""ESV/NLT without a licensed key: AI quote, cross-checked against WEB/KJV."""

import json
import os
import sys

import pytest

import faithsparks.services.ai_budget as ai_budget
import faithsparks.services.scripture as scripture
import faithsparks.services.scripture_checked as checked
import verse_helpers

sys.path.insert(0, os.path.dirname(__file__))
from fake_firestore import FakeFirestore  # noqa: E402

WEB = {
    "John 3:16": "For God so loved the world, that he gave his one and only Son, that whoever believes in him should not perish, but have eternal life.",
    "Psalm 23:1": "Yahweh is my shepherd: I shall lack nothing.",
    "Joshua 1:9": "Haven't I commanded you? Be strong and courageous. Don't be afraid. Don't be dismayed, for Yahweh your God is with you wherever you go.",
}
KJV = {
    "John 3:16": "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
    "Psalm 23:1": "The LORD is my shepherd; I shall not want.",
    "Joshua 1:9": "Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.",
}
ESV_316 = "For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life."
NLT_316 = "For this is how God loved the world: He gave his one and only Son, so that everyone who believes in him will not perish but have eternal life."
NLT_19 = "This is my command—be strong and courageous! Do not be afraid or discouraged. For the LORD your God is with you wherever you go."


@pytest.fixture
def env(monkeypatch):
    db = FakeFirestore()
    for module in (checked, ai_budget, verse_helpers):
        monkeypatch.setattr(module, "db", db)
    monkeypatch.setattr(checked, "_memory", {})
    monkeypatch.setattr(ai_budget, "_memory", {})
    monkeypatch.delenv("SCRIPTURE_AI_CHECKED", raising=False)
    monkeypatch.delenv("ESV_API_KEY", raising=False)
    monkeypatch.delenv("API_BIBLE_KEY", raising=False)
    monkeypatch.setattr(scripture, "_cache", {})

    def fake_fetch(reference, version):
        return {"web": WEB, "kjv": KJV}.get(version, {}).get(reference)

    monkeypatch.setattr(scripture, "fetch_verse_text", fake_fetch)
    asked = []

    def answer(text):
        def ask(reference, code):
            asked.append((reference, code))
            return text, "gpt-4o"
        monkeypatch.setattr(checked, "_ask_ai", ask)

    return db, asked, answer


@pytest.mark.parametrize("quote,ref", [(ESV_316, "John 3:16"), (NLT_316, "John 3:16"), (NLT_19, "Joshua 1:9"),
                                       ("The LORD is my shepherd; I have all that I need.", "Psalm 23:1")])
def test_real_esv_and_nlt_pass_the_check(quote, ref):
    assert checked.cross_check(quote, WEB[ref], KJV[ref])[0]


def test_wrong_verse_and_half_verse_are_rejected():
    assert not checked.cross_check(NLT_19, WEB["John 3:16"], KJV["John 3:16"])[0]
    assert not checked.cross_check("For God so loved the world, that he gave his only Son,",
                                   WEB["John 3:16"], KJV["John 3:16"])[0]


def test_checked_quote_is_cached_so_each_verse_costs_one_call(env):
    db, asked, answer = env
    answer("16 " + ESV_316)
    assert checked.fetch_checked_text("John 3:16", "esv") == ESV_316
    checked._memory.clear()
    assert checked.fetch_checked_text("John 3:16", "esv") == ESV_316  # from Firestore
    assert len(asked) == 1


def test_failed_check_prints_nothing_and_is_not_cached(env):
    db, asked, answer = env
    answer(NLT_19)
    assert checked.fetch_checked_text("John 3:16", "nlt") is None
    assert not db.store.get(checked.CACHE_COLLECTION)


def test_nothing_to_check_against_means_no_ai_call(env):
    db, asked, answer = env
    answer(ESV_316)
    assert checked.fetch_checked_text("Esther 99:1", "esv") is None
    assert asked == []


def test_worksheet_uses_checked_esv_and_switch_turns_it_off(env, monkeypatch):
    db, asked, answer = env
    answer(ESV_316)
    worksheet = {"title": "John 3:16", "verse": "John 3:16", "fullVerse": "AI wording from the worksheet call",
                 "traceableVerse": "x", "handwritingLines": 3, "reflectionQuestion": "Q?", "imageIdea": "Stars"}
    monkeypatch.setattr(verse_helpers, "call_openai", lambda prompt: json.dumps(worksheet))
    data = json.loads(verse_helpers.request_verse_data("John 3:16", "esv"))
    assert data["fullVerse"] == ESV_316 and data["verseSource"] == "ai_checked"
    assert "esv" in scripture.copywork_translation_ids()
    assert "esv" not in scripture.available_translation_ids()  # worship stays licensed-only

    monkeypatch.setenv("SCRIPTURE_AI_CHECKED", "0")
    assert verse_helpers.request_verse_data("John 3:16", "esv") is None
    assert "esv" not in scripture.copywork_translation_ids()


def test_versions_without_a_check_path_are_still_refused(env, monkeypatch):
    db, asked, answer = env
    answer("anything")
    assert checked.fetch_checked_text("John 3:16", "niv") is None
    assert asked == []
