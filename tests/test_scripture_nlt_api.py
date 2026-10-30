from unittest import mock

from faithsparks.services import scripture

# Trimmed from a real api.nlt.to response (key=TEST), malformed bits included.
JOHN_3_16 = (
    '<!DOCTYPE html><html><head><link rel="stylesheet" href="https://api.nlt.to/content/nlt-api-css?vers=1.04"/></head><body>'
    '<div id="bibletext" class=" NLT NLT BibleText section"><section><h2 class="bk_ch_vs_header">John 3:16, NLT</h2>'
    '<verse_export orig="john_3_16" bk="john" ch="3" vn="16">\n<p class="body"><span class="vn">16</span>'
    '<span class="red">“For this is how God loved the world: He gave<a class="a-tn">*</a><span class="tn">'
    '<span class="tn-ref">3:16</span> Or <em>For God loved the world so much that he gave.</em></span> his one and only Son, '
    'so that everyone who believes in him will not perish but have eternal life.</span> </verse_export></section></div></body></html>'
)
TWO_VERSES = (
    '<div id="bibletext"><section><h2 class="bk_ch_vs_header">Philippians 4:6-7, NLT</h2>'
    '<p class="subhead">Words of Encouragement</p>'
    '<verse_export orig="philippians_4_6" vn="6"><p class="body"><span class="vn">6</span>Don’t worry about anything; '
    'instead, pray about everything. Tell God what you need, and thank him for all he has done.</verse_export>'
    '<verse_export orig="philippians_4_7" vn="7"><span class="vn">7</span>Then you will experience God’s peace, '
    'which exceeds anything we can understand. His peace will guard your hearts and minds as you live in Christ Jesus.<p>'
    '</verse_export></section></div>'
)


def test_parse_strips_numbers_footnotes_and_headings():
    assert scripture._parse_nlt_html(JOHN_3_16) == (
        "“For this is how God loved the world: He gave his one and only Son, so that everyone "
        "who believes in him will not perish but have eternal life."
    )


def test_parse_joins_multiple_verses_and_tolerates_bad_markup():
    text = scripture._parse_nlt_html(TWO_VERSES)
    assert text.startswith("Don’t worry about anything;")
    assert "done. Then you will" in text
    assert text.endswith("in Christ Jesus.")
    assert "Words of Encouragement" not in text and "6" not in text


def test_parse_without_verses_is_none():
    assert scripture._parse_nlt_html("<html><body>Reference not found</body></html>") is None


def test_nlt_key_enables_nlt_and_is_used_first(monkeypatch):
    monkeypatch.setenv("NLT_API_KEY", "k")
    monkeypatch.delenv("API_BIBLE_KEY", raising=False)
    assert "nlt" in scripture.available_translation_ids()
    scripture._cache.clear(); scripture._recent_misses.clear()
    with mock.patch.object(scripture, "_fetch_nlt", return_value="Licensed NLT.") as nlt, \
            mock.patch.object(scripture, "_fetch_api_bible") as api_bible:
        assert scripture.fetch_verse_text("Philippians 4:6–7", "nlt") == "Licensed NLT."
    nlt.assert_called_once_with("Philippians 4:6-7")
    api_bible.assert_not_called()


def test_without_nlt_key_nothing_is_called(monkeypatch):
    monkeypatch.delenv("NLT_API_KEY", raising=False)
    assert scripture._fetch_nlt("John 3:16") is None


def test_copywork_worksheet_uses_nlt_api_before_ai_check(monkeypatch):
    import verse_helpers
    from faithsparks.services import scripture_checked

    monkeypatch.setenv("NLT_API_KEY", "k")
    scripture._cache.clear(); scripture._recent_misses.clear()
    with mock.patch.object(scripture, "_fetch_nlt", return_value="Licensed NLT words.") as nlt, \
            mock.patch.object(scripture_checked, "fetch_checked_text") as checked:
        data = verse_helpers._apply_authoritative_text({"fullVerse": "AI words"}, "Romans 8:28", "nlt")
    nlt.assert_called_once_with("Romans 8:28")
    checked.assert_not_called()
    assert data["fullVerse"] == "Licensed NLT words."
    assert data["verseSource"] == "authoritative"


def test_old_ai_checked_worksheet_cache_upgrades_to_licensed_text(monkeypatch):
    """Worksheets cached before the key existed are re-sourced from the NLT API on next use."""
    import json
    import verse_helpers

    monkeypatch.setenv("NLT_API_KEY", "k")
    scripture._cache.clear(); scripture._recent_misses.clear()
    old = {"verse": "Romans 8:28", "fullVerse": "Checked AI words", "verseSource": "ai_checked"}
    with mock.patch.object(verse_helpers, "_load_cached_verse_data", return_value=old), \
            mock.patch.object(verse_helpers, "_store_cached_verse_data") as store, \
            mock.patch.object(scripture, "_fetch_nlt", return_value="Licensed NLT words."):
        payload = json.loads(verse_helpers.request_verse_data("Romans 8:28", "nlt"))
    assert payload["fullVerse"] == "Licensed NLT words."
    assert payload["verseSource"] == "authoritative"
    store.assert_called_once()


def test_esv_notice_matches_crossway_permission_exactly():
    """Crossway permission #19964 (Feb 2026) specifies this notice verbatim."""
    from faithsparks.pdf_notices import scripture_notice_texts
    [(code, text)] = scripture_notice_texts(["ESV"])
    assert text == (
        "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by "
        "Crossway, a publishing ministry of Good News Publishers. ESV Text Edition: 2025. The ESV text may not "
        "be quoted in any publication made available to the public by a Creative Commons license. The ESV may "
        "not be translated in whole or in part into any other language. Used by permission. All rights reserved."
    )


def test_nlt_notice_uses_copyright_symbol():
    from faithsparks.pdf_notices import scripture_notice_texts
    [(code, text)] = scripture_notice_texts(["NLT"])
    assert "copyright ©1996, 2004, 2015 by Tyndale House Foundation" in text
