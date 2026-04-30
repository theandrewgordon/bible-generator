from faithsparks.services.lesson_pack import _build_parent_guide, _pick_pack_words


def test_pick_pack_words_prefers_meaningful_terms():
    words = _pick_pack_words(
        "God's Love Lesson Pack",
        "For God so loved the world that he gave his one and only Son.",
        "This verse shows God's love and generous gift."
    )

    assert "LOVE" in words
    assert "GAVE" in words or "GOD" in words
    assert len(words) >= 6


def test_parent_guide_includes_key_pack_details():
    guide = _build_parent_guide(
        title="God's Love Lesson Pack",
        verse="John 3:16",
        version="nlt",
        meaning="God loved the world and gave Jesus.",
        age_bracket="6-8",
        theme_label="God's Love",
        words=["LOVE", "WORLD", "GIVE", "JESUS"],
    )

    assert "John 3:16" in guide
    assert "Age focus: 6-8" in guide
    assert "5-day mini plan" in guide
    assert "LOVE" in guide
