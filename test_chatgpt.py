import os
import json
from dotenv import load_dotenv
from openai import OpenAI

# Load API key
load_dotenv(dotenv_path="secret.env")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

verses = [
    "Genesis 1:1", "Exodus 20:12", "Joshua 1:9", "Psalm 1:6", "Psalm 23:1",
    "Psalm 34:8", "Psalm 37:4", "Psalm 46:1", "Psalm 56:3", "Psalm 100:1",
    "Psalm 118:24", "Psalm 119:105", "Psalm 121:1-2", "Psalm 139:14", "Psalm 19:14",
    "Proverbs 3:5", "Proverbs 15:1", "Proverbs 17:17", "Proverbs 20:11",
    "Ecclesiastes 3:1", "Isaiah 26:3", "Isaiah 40:8", "Isaiah 41:10",
    "Jeremiah 29:11", "Lamentations 3:23", "Micah 6:8", "Nahum 1:7", "Zephaniah 3:17",
    "Matthew 4:19", "Matthew 5:14", "Matthew 6:33", "Matthew 7:12", "Matthew 11:28",
    "Matthew 18:20", "Matthew 21:22", "Matthew 22:39", "Matthew 28:20",
    "Mark 9:23", "Mark 10:14", "Mark 12:30",
    "Luke 1:37", "Luke 6:31", "Luke 18:27",
    "John 1:1", "John 3:16", "John 8:12", "John 13:34", "John 14:6", "John 15:12",
    "Acts 16:31",
    "Romans 3:23", "Romans 5:8", "Romans 6:23", "Romans 8:28", "Romans 10:13",
    "Romans 12:12", "Romans 12:21",
    "1 Corinthians 10:31", "1 Corinthians 13:4", "1 Corinthians 15:3", "1 Corinthians 16:14",
    "2 Corinthians 5:7",
    "Galatians 5:1", "Galatians 5:22", "Galatians 6:9",
    "Ephesians 2:8-9", "Ephesians 4:2", "Ephesians 4:32", "Ephesians 6:1",
    "Philippians 1:6", "Philippians 2:14", "Philippians 4:4", "Philippians 4:6", "Philippians 4:13",
    "Colossians 3:2", "Colossians 3:20", "Colossians 3:23",
    "1 Thessalonians 5:16-18",
    "2 Thessalonians 3:13",
    "2 Timothy 1:7", "2 Timothy 3:16",
    "Titus 3:5",
    "Hebrews 11:1", "Hebrews 13:8", "Hebrews 13:16",
    "James 1:5", "James 1:22", "James 4:7",
    "1 Peter 3:8", "1 Peter 5:7",
    "1 John 1:9", "1 John 3:18", "1 John 4:7", "1 John 4:19",
    "2 Peter 3:9",
    "Revelation 3:20",    "Deuteronomy 6:5",     # "Love the Lord your God with all your heart and with all your soul and with all your strength."
    "Psalm 4:8",           # "In peace I will lie down and sleep, for you alone, Lord, make me dwell in safety."
    "Proverbs 18:10",      # "The name of the Lord is a strong tower; the righteous run to it and are safe."
    "Isaiah 43:1",         # "Do not fear, for I have redeemed you; I have called you by name; you are mine."
    "Matthew 19:14",       # "Let the little children come to me... for the kingdom of heaven belongs to such as these."
    "John 10:11",          # "I am the good shepherd. The good shepherd lays down his life for the sheep."
    "Romans 15:13",        # "May the God of hope fill you with all joy and peace as you trust in him."
    "2 Corinthians 12:9",   # "My grace is sufficient for you, for my power is made perfect in weakness."
    "Psalm 121:1-2"  # "I lift up my eyes to the mountains— where does my help come from? My help comes from the Lord, the Maker of heaven and earth."
    

]


version = "esv"
output_dir = "output"
os.makedirs(output_dir, exist_ok=True)

def request_verse_data(verse_ref):
    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You help Christian homeschoolers create Bible worksheets."},
                {
                    "role": "user",
                    "content": f"""
Return valid JSON with:
- "verse": the reference
- "fullVerse": the full Bible verse (from the {version.upper()}), without the reference text, Capiitalize first letter
- "traceableVerse": If fullVerse has 26 words or fewer, the full Bible verse (from the {version.upper()}), without the reference text, Capiitalize first letter. Otherwise, return a meaningful excerpt (under 27 words). Capiitalize first letter
- "handwritingLines": 3
- "reflectionQuestion": one simple life-application question
- "imageIdea": a coloring prompt based on the verse (e.g. a shepherd, cross, prayer hands, etc.)
- "version": "{version.lower()}"

Formatting rules:
- If the verse has quotes inside the verse (not surrounding it), don't remove them but dont add them outside verse, if you add a quote, must open and close quote, always use Unicode directional quotes: \\u201c \\u201d for double quotes, \\u2018 \\u2019 for single quotes.
- Do NOT use ASCII straight quotes (" or ')
- Do NOT add spaces before punctuation
- Capitalize all pronouns that refer to God/Jesus (e.g., He, His, Him), example: ("but God shows His love", "And we know that for those who love God all things work together for good, for those who are called according to His purpose.", "We love because He first loved us.")
- Return JSON only. No explanations.
Verse: {verse_ref}
"""
                }
            ]
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"⚠️  Request error: {e}")
        return None

def parse_and_clean_json(content):
    return json.loads(content)

def save_json_to_file(data, filepath):
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def process_verse(verse_ref):
    print(f"⏳ Generating: {verse_ref} ({version.upper()})")
    slug = verse_ref.lower().replace(":", "_").replace("–", "_").replace(" ", "_")
    filename = f"{slug}_{version.lower()}.json"
    filepath = os.path.join(output_dir, filename)

    if os.path.exists(filepath):
        print(f"⚠️  Skipped (already exists): {filename}")
        return

    content = request_verse_data(verse_ref)
    if not content:
        print("🔁 Retrying once...")
        content = request_verse_data(verse_ref)
    if not content:
        print(f"❌ Failed to get response for {verse_ref}")
        return

    try:
        data = parse_and_clean_json(content)
        save_json_to_file(data, filepath)
        print(f"✅ Saved: {filename}")
    except Exception as e:
        print(f"❌ JSON parse/save failed for {verse_ref}: {e}")

def main():
    for verse in verses:
        process_verse(verse)

if __name__ == "__main__":
    main()
