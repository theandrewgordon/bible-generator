from faithsparks.services import scripture


def test_catalog_is_the_single_ordered_picker_source(monkeypatch):
    monkeypatch.delenv("ESV_API_KEY", raising=False)
    monkeypatch.delenv("API_BIBLE_KEY", raising=False)
    monkeypatch.delenv("API_BIBLE_IDS", raising=False)

    options = scripture.translation_options()
    assert [item["id"] for item in options] == ["web", "kjv", "esv", "nlt"]
    assert {item["id"] for item in options if item["available"]} == {"web", "kjv"}


def test_catalog_enables_licensed_sources_from_either_provider(monkeypatch):
    monkeypatch.setenv("ESV_API_KEY", "esv-key")
    monkeypatch.setenv("API_BIBLE_KEY", "bible-key")
    monkeypatch.setenv("API_BIBLE_IDS", "nlt:nlt-id,esv:esv-id")

    assert scripture.available_translation_ids() == {"web", "kjv", "esv", "nlt"}
    assert {item["id"] for item in scripture.translation_options(include_unavailable=False)} == {
        "web", "kjv", "esv", "nlt"
    }


def test_copywork_text_prefers_authoritative_source(monkeypatch):
    monkeypatch.setattr(scripture, "fetch_verse_text", lambda *_: "Licensed source text")
    assert scripture.fetch_copywork_text("John 3:16", "nlt") == "Licensed source text"
