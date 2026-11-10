"""Question bank from the approved photographed cards. No generated vocabulary."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path

SOURCE = json.loads((Path(__file__).resolve().parents[1] / 'content/latin_quest/cards.json').read_text())
ORDINAL = {'1st': 'first', '2nd': 'second', '3rd': 'third', '4th': 'fourth', '5th': 'fifth'}
MODES = {'meaning': 'Latin → English', 'reverse': 'English → Latin', 'nouns': 'Noun detective', 'verbs': 'Verb workshop', 'grammar': 'Grammar cards', 'mixed': 'Mixed quest'}
MODEL = 'gpt-4o-mini-tts'
VOICES = ('coral', 'marin')
SPEED = 0.85
INSTRUCTIONS = {
 'classical': 'Warm, patient Latin tutor. Speak English instructions naturally. Pronounce Latin using restored Classical Latin; pronounce macrons as long vowels. Read only the supplied text. Pause between the word, its grammatical details, and the question.',
 'church': 'Warm, patient Latin tutor. Speak English instructions naturally. Pronounce Latin using Italianate ecclesiastical Latin. Read only the supplied text. Pause between the word, its grammatical details, and the question.',
}
# Conservative, reviewed English equivalents. Never fuzzy-match Latin forms.
SYNONYMS = {
 'wood': ['timber'], 'farmer': ['a farmer'], 'no one': ['nobody'],
 'joy': ['happiness'], 'road': ['path'], 'house': ['home'], 'animal': ['beast'],
 'announce': ['proclaim'], 'free': ['set free'], 'prevent': ['stop'],
 'weep': ['cry'], 'get up': ['stand up'], 'conquer': ['defeat'],
 'you (plural)': ['you all', 'all of you', 'yall'], 'you (singular)': ['you'],
}
QUESTIONS = []

def ordinal(value):
    for short, full in ORDINAL.items():
        value = value.replace(short, full)
    return value

def add(card, kind, prompt, answers, hint, details='', latin=False):
    if isinstance(answers, str):
        answers = [a.strip() for a in answers.split(';') if a.strip()]
    variants = list(answers)
    if not latin:
        for answer in answers:
            variants.extend(SYNONYMS.get(answer, []))
    q = {'id': f'{card}:{kind}', 'card': card, 'mode': kind.split('-')[0], 'prompt': prompt,
         'answers': list(dict.fromkeys(variants)), 'answer': '; '.join(answers),
         'hint': hint, 'details': details, 'latin': latin}
    QUESTIONS.append(q)

for cid, pos, first, second, meaning, decl, gender in SOURCE['nouns_and_pronouns']:
    details = f'Noun. {ordinal(decl)} declension. {gender}.' if pos == 'noun' else 'Pronoun.'
    add(cid, 'meaning', f'What does {first} mean in English?', meaning, 'Think of the English meaning on your card.', details)
    add(cid, 'reverse', f'What is the Latin word for {meaning.replace(";", " or")}?', first, 'Picture the Latin side of this card.', details, True)
    if pos != 'noun':
        continue
    base = decl.split()[0]
    add(cid, 'nouns-declension', f'Which declension is {first}, {second}?', [decl, base, ordinal(base), f'{ordinal(base)} declension'], 'Listen to the genitive ending, the second form.')
    add(cid, 'nouns-gender', f'What gender is the noun {first}?', gender, 'Is it masculine, feminine, or neuter?')
    add(cid, 'nouns-nominative', f'For {first}, {second}, which form is nominative singular?', first, 'The nominative is the first dictionary form.', latin=True)
    add(cid, 'nouns-genitive', f'For {first}, {second}, which form is genitive singular?', second, 'The genitive is the second dictionary form.', latin=True)

for cid, p1, p2, p3, p4, meaning, conj in SOURCE['verbs']:
    details = f'Verb. {ordinal(conj)} conjugation.'
    add(cid, 'meaning', f'What does {p1} mean in English?', meaning, 'Think of the action on your card.', details)
    add(cid, 'reverse', f'What is the Latin verb for {meaning.replace(";", " or")}?', p1, 'Picture the first principal part.', details, True)
    base = conj.split()[0]
    add(cid, 'verbs-conjugation', f'What conjugation is {p1}, {p2}?', [conj, base, ordinal(base), f'{ordinal(base)} conjugation'], 'Listen to the infinitive, the second principal part.')
    for n, part in enumerate([p1, p2, p3, p4], 1):
        add(cid, f'verbs-part{n}', f'What is principal part {n} of {p1}?', part, f'Picture part {n} in the four forms on your card.', latin=True)

for cid, latin, meaning in SOURCE['conjunctions']:
    add(cid, 'meaning', f'What does {latin} mean in English?', meaning, 'Think of how it connects ideas.', 'Conjunction.')
    add(cid, 'reverse', f'Which Latin conjunction means {meaning.replace(";", " or")}?', latin, 'Picture the Latin side of this card.', 'Conjunction.', True)

GRAMMAR_ALTERNATIVES = {
 'grammar-noun-001': ['ae', 'genitive ends in ae', 'genitive singular ae'],
 'grammar-noun-002': ['i', 'genitive ends in i', 'genitive singular i'],
 'grammar-noun-003': ['is', 'genitive ends in is', 'genitive singular is'],
 'grammar-noun-004': ['us', 'genitive ends in us', 'genitive singular us'],
 'grammar-noun-005': ['ei', 'genitive ends in ei', 'genitive singular ei'],
 'grammar-noun-006': ['first', '1st', 'first declension'],
 'grammar-noun-007': ['second', '2nd', 'second declension'],
 'grammar-noun-008': ['third', '3rd', 'third declension'],
 'grammar-noun-009': ['fourth', '4th', 'fourth declension'],
 'grammar-noun-010': ['fifth', '5th', 'fifth declension'],
 'grammar-verb-001': ['or, ris, tur, mur, minī, ntur'],
 'grammar-verb-002': ['are', 'infinitive ends in are', 'second principal part ends in are'],
 'grammar-verb-003': ['long ere', 'infinitive ends in long ere', 'second principal part ends in long ere'],
 'grammar-verb-004': ['short ere', 'infinitive ends in short ere', 'second principal part ends in short ere'],
 'grammar-verb-005': ['ire', 'infinitive ends in ire', 'second principal part ends in ire'],
}
for cid, prompt, answer in SOURCE['grammar']:
    add(cid, 'grammar', prompt, [answer, *GRAMMAR_ALTERNATIVES.get(cid, [])], 'Take your time. Reveal the answer to study this card together.')

# Several photographed cards share an English meaning (for example cibus/esca).
# A reverse prompt accepts another approved Latin word matching any offered meaning.
reverse_cards = [q for q in QUESTIONS if q['mode'] == 'reverse']
meanings = {q['card']: set(q['answers']) for q in QUESTIONS if q['mode'] == 'meaning'}
for q in reverse_cards:
    for other in reverse_cards:
        if meanings[q['card']] & meanings[other['card']]:
            q['answers'] = list(dict.fromkeys(q['answers'] + other['answers'][:1]))

QUESTION_MAP = {q['id']: q for q in QUESTIONS}
CUES = {'welcome': 'Welcome to Latin Quest. Listen, try one answer, and take your time. You can ask for a hint, repeat, reveal, skip, or stop.',
        'complete': 'Quest complete. Well done practicing! Your progress is saved on this device.',
        'correct': 'Correct! Well done.', 'try': 'Good try. Let us learn this one together.',
        'listen': 'Your turn. Say your answer now.', 'paused': 'Quest paused. Your completed questions are saved on this device.'}
for q in QUESTIONS:
    CUES[f'{q["id"]}:plain'] = q['prompt']
    CUES[f'{q["id"]}:details'] = f'{q["details"]} {q["prompt"]}'.strip()
    CUES[f'{q["id"]}:hint'] = q['hint']
    CUES[f'{q["id"]}:answer'] = f'The card answer is: {q["answer"]}.'

# Results are also fixed cues, so hands-free session summaries can be reused.
for done in range(11):
    for correct in range(done + 1):
        for state in ('complete', 'paused'):
            CUES[f'summary-{state}-{correct}-{done}'] = f'Quest {state}. {correct} out of {done} correct without hints. Well done practicing. Your completed questions are saved on this device.'

AUDIO_VERSION = hashlib.sha256(json.dumps([MODEL, SPEED, INSTRUCTIONS, CUES], sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]

def cache_path(cue, voice, pronunciation):
    payload = [MODEL, voice, pronunciation, INSTRUCTIONS[pronunciation], SPEED, CUES[cue]]
    digest = hashlib.sha256(json.dumps(payload, ensure_ascii=False).encode()).hexdigest()
    return f'latin_quest/audio/v1/{digest}.mp3'
