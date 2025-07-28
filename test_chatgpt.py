import os
import json
from dotenv import load_dotenv
from openai import OpenAI
from build_pdf import generate_pdf

# Load environment and initialize OpenAI client
load_dotenv("secret.env")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Setup
version = "nlt"
output_dir = "output"
pdf_dir = "worksheets"
os.makedirs(output_dir, exist_ok=True)
os.makedirs(pdf_dir, exist_ok=True)

verses = [
    "Luke 8:25",
    "Acts 1:8",  # Example long verse
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

def request_and_retry_trace_fix(data, verse_ref, version):
    trace = data.get("traceableVerse", "")
    if len(trace.split()) <= 26:
        return data

    print(f"🔁 Retrying for shorter traceableVerse: {verse_ref}")
    new_prompt = [
        {"role": "system", "content": "You help Christian homeschoolers create Bible worksheets."},
        {
            "role": "user",
            "content": f"""Your previous traceableVerse was too long. Return new JSON with a shorter traceableVerse (<=26 words) while preserving meaning.
Original verse: {data.get("fullVerse", "")}

Only return updated JSON, and keep the original fullVerse as-is."""
        }
    ]
    content = call_openai(new_prompt)
    if content:
        try:
            shorter = json.loads(content)
            data["traceableVerse"] = shorter.get("traceableVerse", data["traceableVerse"])
        except:
            print("⚠️ Retry fix parse failed.")
    return data

def save_json(filepath, data):
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def process_verse(verse_ref):
    print(f"\n⏳ Processing: {verse_ref} ({version.upper()})")
    slug = verse_ref.lower().replace(":", "_").replace("–", "_").replace(" ", "_")
    json_path = os.path.join(output_dir, f"{slug}_{version}.json")
    pdf_path = os.path.join(pdf_dir, f"{slug}_{version}.pdf")

    if os.path.exists(pdf_path):
        print(f"⚠️ Skipping existing: {pdf_path}")
        return

    prompt = build_prompt(verse_ref, version)
    content = call_openai(prompt)
    if not content:
        print("🔁 Retrying...")
        content = call_openai(prompt)
        if not content:
            print("❌ Failed: No response.")
            return

    try:
        data = json.loads(content)
        data["verse"] = verse_ref
        data = request_and_retry_trace_fix(data, verse_ref, version)
        save_json(json_path, data)
        generate_pdf(data, pdf_path, use_cursive=True)
        print(f"✅ Saved: {pdf_path}")
    except Exception as e:
        print(f"❌ Failed processing {verse_ref}: {e}")

def main():
    for verse in verses:
        process_verse(verse)

if __name__ == "__main__":
    main()
