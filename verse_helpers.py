import os
import json
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv("secret.env")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def slugify(verse_ref):
    return verse_ref.lower().replace(":", "_").replace("–", "_").replace(" ", "_")

def build_prompt(verse_ref, version):
    return [
        {"role": "system", "content": "You help Christian homeschoolers create Bible worksheets."},
        {
            "role": "user",
            "content": f"""
Return valid JSON with:
- "verse": the reference
- "fullVerse": full Bible verse from the {version.upper()} version (no reference, capitalize first letter, full sentence).
- "traceableVerse": If fullVerse has 26 words or fewer, return it exactly. If longer, return the most important self-contained 27-word-or-less excerpt that preserves the spiritual message.
- "handwritingLines": 3
- "reflectionQuestion": one simple life-application question
- "imageIdea": coloring prompt based on the verse
- "version": "{version.lower()}"

Rules:
- Capitalize pronouns for God/Jesus (He, His, etc.)
- Use Unicode quotes for internal quotes: “ ” and ‘ ’
- No ASCII straight quotes, no quotes around whole verse
- No extra spaces before punctuation
- Return JSON only, no explanation

Verse: {verse_ref}
"""
        }
    ]

def call_openai(prompt):
    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=prompt
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"⚠️ OpenAI error: {e}")
        return None

def request_verse_data(verse_ref, version="nlt"):
    prompt = build_prompt(verse_ref, version)
    content = call_openai(prompt)
    if content:
        return content
    # Retry once
    return call_openai(prompt)

def parse_and_clean_json(content):
    try:
        return json.loads(content)
    except Exception:
        return {}

def retry_traceable_fix(data):
    trace = data.get("traceableVerse", "")
    if len(trace.split()) <= 26:
        return data

    retry_prompt = [
        {"role": "system", "content": "You help Christian homeschoolers create Bible worksheets."},
        {
            "role": "user",
            "content": f"""Your previous traceableVerse was too long. Return new JSON with a shorter traceableVerse (<=26 words) while preserving meaning.
Original verse: {data.get("fullVerse", "")}

Only return updated JSON, and keep the original fullVerse as-is."""
        }
    ]
    new_content = call_openai(retry_prompt)
    if new_content:
        try:
            fixed = json.loads(new_content)
            data["traceableVerse"] = fixed.get("traceableVerse", data["traceableVerse"])
        except:
            pass
    return data

def save_json_to_file(data, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
