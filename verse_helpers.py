import os
import json
from openai import OpenAI
from dotenv import load_dotenv

# Load API key
load_dotenv("secret.env")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def request_verse_data(verse_ref, version="nlt"):
    prompt = [
        {"role": "system", "content": "You help Christian homeschoolers create Bible worksheets."},
        {"role": "user", "content": f"""
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
"""}
    ]
    try:
        response = client.chat.completions.create(model="gpt-3.5-turbo", messages=prompt)
        return response.choices[0].message.content
    except Exception as e:
        print(f"❌ OpenAI error: {e}")
        return None

def parse_and_clean_json(content):
    """
    Tries to safely extract the first JSON object from the response string.
    """
    try:
        first_brace = content.find("{")
        last_brace = content.rfind("}")
        json_block = content[first_brace:last_brace+1]
        return json.loads(json_block)
    except Exception as e:
        print(f"❌ JSON parsing failed: {e}")
        raise

def save_json_to_file(data, path):
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"❌ Failed to save JSON to {path}: {e}")
