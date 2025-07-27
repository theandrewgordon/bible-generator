import os
import json
from dotenv import load_dotenv
from openai import OpenAI

# Load API key
load_dotenv(dotenv_path="secret.env")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

verses = [ "Luke 8:25"

]


version = "NLT"
output_dir = "output"
os.makedirs(output_dir, exist_ok=True)

def request_verse_data(verse_ref, version="esv"):
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
- "fullVerse": the full Bible verse (from the {version.upper()}), without the reference text, Capiitalize first letter, Guarantee full verse.
- "traceableVerse": If fullVerse has 26 words or fewer, the full Bible verse (from the {version.upper()}), without the reference text, Capiitalize first letter. Otherwise, return a meaningful excerpt (under 27 words). Capiitalize first letter,
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
