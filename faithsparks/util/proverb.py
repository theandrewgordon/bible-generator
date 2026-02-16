from datetime import datetime

PROVERBS_OF_THE_DAY = [
    ("The fear of the Lord is the beginning of knowledge.", "Proverbs 1:7"),
    ("Trust in the Lord with all your heart.", "Proverbs 3:5"),
    ("In all your ways acknowledge Him.", "Proverbs 3:6"),
    ("The Lord gives wisdom.", "Proverbs 2:6"),
    ("A gentle answer turns away wrath.", "Proverbs 15:1"),
    ("The name of the Lord is a strong tower.", "Proverbs 18:10"),
    ("Commit your work to the Lord.", "Proverbs 16:3"),
    ("Walk with the wise and become wise.", "Proverbs 13:20"),
    ("A cheerful heart is good medicine.", "Proverbs 17:22"),
    ("Pride goes before destruction.", "Proverbs 16:18"),
    ("Better a little with righteousness than much gain with injustice.", "Proverbs 16:8"),
    ("The Lord directs the steps of the godly.", "Proverbs 16:9"),
    ("Kind words are like honey.", "Proverbs 16:24"),
    ("Those who guard their mouths preserve their lives.", "Proverbs 13:3"),
    ("Wisdom is more precious than rubies.", "Proverbs 3:15"),
    ("The Lord weighs the heart.", "Proverbs 21:2"),
    ("The righteous are as bold as a lion.", "Proverbs 28:1"),
    ("A good name is better than riches.", "Proverbs 22:1"),
    ("Train up a child in the way he should go.", "Proverbs 22:6"),
    ("Hope deferred makes the heart sick.", "Proverbs 13:12"),
    ("The Lord hates dishonest scales.", "Proverbs 11:1"),
    ("The wise store up knowledge.", "Proverbs 10:14"),
    ("The Lord’s blessing makes rich.", "Proverbs 10:22"),
    ("Better patience than power.", "Proverbs 16:32"),
    ("The way of the righteous leads to life.", "Proverbs 10:17"),
    ("A prudent person foresees danger.", "Proverbs 22:3"),
    ("The Lord watches over the righteous.", "Proverbs 15:3"),
    ("The fear of the Lord leads to life.", "Proverbs 19:23"),
    ("Do not withhold good when it is in your power.", "Proverbs 3:27"),
    ("As iron sharpens iron, so one person sharpens another.", "Proverbs 27:17"),
    ("The Lord blesses the house of the righteous.", "Proverbs 3:33"),
]

DEFAULT_PROVERB_VERSION = "NLT"


def get_proverb_of_day(day: int | None = None) -> dict:
    """Return today's proverb using a simple 31-day cycle."""
    if day is None:
        day = datetime.now().day
    idx = (max(1, int(day)) - 1) % len(PROVERBS_OF_THE_DAY)
    text, reference = PROVERBS_OF_THE_DAY[idx]
    verse_param = f"{reference} ({DEFAULT_PROVERB_VERSION})"
    return {
        "text": text,
        "reference": reference,
        "verse_param": verse_param,
    }
