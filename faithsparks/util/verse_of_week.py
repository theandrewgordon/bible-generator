"""Verse of the Week — a weekly retention hook.

Rotates a curated, kid-friendly memory verse each ISO week. The on-page text is
pulled from an authoritative public-domain source (WEB) so it's accurate and
free to display; the worksheet itself is generated in the visitor's chosen
translation.
"""
from datetime import datetime

# (reference, short kid-friendly theme)
VERSES_OF_THE_WEEK = [
    ("John 3:16", "God's love for the whole world"),
    ("Psalm 23:1", "The Lord is my shepherd"),
    ("Philippians 4:13", "Strength through Christ"),
    ("Proverbs 3:5", "Trusting God with all your heart"),
    ("Joshua 1:9", "Be strong and courageous"),
    ("Jeremiah 29:11", "God's good plans for us"),
    ("Romans 8:28", "God works all things for good"),
    ("Psalm 46:1", "God is our refuge and strength"),
    ("Matthew 5:16", "Let your light shine"),
    ("Isaiah 40:31", "Soaring on wings like eagles"),
    ("Philippians 4:6", "Pray instead of worry"),
    ("1 John 4:19", "We love because He first loved us"),
    ("Psalm 119:105", "God's word is a lamp"),
    ("Galatians 5:22", "The fruit of the Spirit"),
    ("Ephesians 4:32", "Be kind to one another"),
    ("Matthew 6:33", "Seek first God's kingdom"),
    ("Psalm 139:14", "Wonderfully made"),
    ("Romans 12:2", "Be transformed, not conformed"),
    ("Colossians 3:23", "Work with all your heart"),
    ("1 Corinthians 13:4", "Love is patient and kind"),
    ("Hebrews 11:1", "Faith is confidence in hope"),
    ("Psalm 118:24", "Rejoice in the day He made"),
    ("Micah 6:8", "Act justly, love mercy, walk humbly"),
    ("Matthew 28:19", "Go and make disciples"),
    ("2 Timothy 1:7", "A spirit of power and love"),
    ("Psalm 27:1", "The Lord is my light"),
    ("Proverbs 22:6", "Train up a child"),
    ("James 1:5", "Ask God for wisdom"),
    ("Deuteronomy 6:5", "Love God with all your heart"),
    ("Isaiah 41:10", "Do not fear, God is with you"),
    ("Psalm 100:1", "Make a joyful noise"),
    ("Luke 6:31", "The Golden Rule"),
]


def get_verse_of_week(week: int | None = None) -> dict:
    """Return this week's verse using a simple ISO-week cycle."""
    if week is None:
        week = datetime.now().isocalendar()[1]
    idx = (max(1, int(week)) - 1) % len(VERSES_OF_THE_WEEK)
    reference, theme = VERSES_OF_THE_WEEK[idx]
    return {
        "reference": reference,
        "theme": theme,
        "verse_param": reference,
    }
