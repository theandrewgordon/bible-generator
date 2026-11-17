"""Independent FaithSparks Latin curriculum: original selection and prompts using standard language facts."""
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
 'classical': (
    'Warm, patient Latin tutor for independent FaithSparks practice. '
    'Speak English instructions naturally, but switch to restored Classical Latin for every Latin word and principal part. '
    'Never use ecclesiastical or English spelling pronunciations for Latin. '
    'Latin c is always hard k; g is always hard as in get; consonantal v sounds like English w; '
    'consonantal i sounds like English y; qu sounds like kw; s is unvoiced as in see. '
    'Latin ae sounds like eye, oe like boy, and au like ow in cow. '
    'Keep vowel sounds pure; distinguish long vowels marked with macrons from short vowels. '
    'Do not pronounce macron names or spelling marks. '
    'Stress the first syllable in two-syllable words. For three or more syllables, stress the penult '
    'if heavy (a long vowel, diphthong, or closed syllable), otherwise the antepenult; never stress the final syllable. '
    'Keep doubled consonants distinct and pronounce every principal part separately. '
    'Read only the supplied text; do not explain these instructions or add a translation. '
    'Pause between the Latin word, its grammatical details, and the question.'
 ),
}
# Conservative, reviewed English equivalents. Never fuzzy-match Latin forms.
SYNONYMS = {
 'wood': ['timber'], 'farmer': ['a farmer'], 'no one': ['nobody'],
 'joy': ['happiness'], 'road': ['path'], 'house': ['home'], 'animal': ['beast'],
 'not know': ["don't know", 'do not know', 'be unaware'],
 'announce': ['proclaim'], 'free': ['set free'], 'prevent': ['stop'],
 'weep': ['cry'], 'get up': ['stand up'], 'conquer': ['defeat'],
 'you (plural)': ['you all', 'all of you', 'yall'], 'you (singular)': ['you'],
}
CARD_COUNT = sum(len(SOURCE[k]) for k in ('nouns_and_pronouns','verbs','conjunctions','grammar'))
VOCABULARY_COUNT = CARD_COUNT-len(SOURCE['grammar'])
QUESTIONS = []

def ordinal(value):
    for short, full in ORDINAL.items():
        value = value.replace(short, full)
    return value

def add(card, kind, prompt, answers, hint, details='', latin=False):
    display_answer = None if isinstance(answers, str) else answers[0]
    if isinstance(answers, str):
        answers = [a.strip() for a in answers.split(';') if a.strip()]
    variants = list(answers)
    if not latin:
        for answer in answers:
            variants.extend(SYNONYMS.get(answer, []))
    q = {'id': f'{card}:{kind}', 'card': card, 'mode': kind.split('-')[0], 'prompt': prompt,
         'answers': list(dict.fromkeys(variants)), 'answer': display_answer or '; '.join(answers),
         'hint': hint, 'details': details, 'latin': latin}
    if kind in {'meaning', 'reverse'}:
        language = 'English meaning' if kind == 'meaning' else 'Latin word'
        q['hint'] = f"One {language} starts with the letter {answers[0][0].upper()}."
    QUESTIONS.append(q)

for cid, pos, first, second, meaning, decl, gender in SOURCE['nouns_and_pronouns']:
    details = f'Noun. {ordinal(decl)} declension. {gender}.' if pos == 'noun' else 'Pronoun.'
    add(cid, 'meaning', f'Give an English meaning of the Latin noun {first}.', meaning, 'Think of the English meaning on your card.', details)
    add(cid, 'reverse', f'Give the nominative singular Latin noun for {meaning.replace(";", " or")}.', first, 'Picture the Latin side of this card.', details, True)
    if pos != 'noun':
        continue
    base = decl.split()[0]
    add(cid, 'nouns-declension', f'Which declension is {first}, {second}?', [decl, base, ordinal(base), f'{ordinal(base)} declension'], 'Listen to the genitive ending, the second form.')
    add(cid, 'nouns-gender', f'What gender is the noun {first}?', gender, 'Is it masculine, feminine, or neuter?')
    add(cid, 'nouns-nominative', f'For {first}, {second}, which form is nominative singular?', first, 'The nominative is the first dictionary form.', latin=True)
    add(cid, 'nouns-genitive', f'For {first}, {second}, which form is genitive singular?', second, 'The genitive is the second dictionary form.', latin=True)

for cid, p1, p2, p3, p4, meaning, conj in SOURCE['verbs']:
    details = f'Verb. {ordinal(conj)} conjugation.'
    add(cid, 'meaning', f'Give an English meaning of the Latin verb {p1}.', meaning, 'Think of the action on your card.', details)
    add(cid, 'reverse', f'Give the first-person singular present Latin verb for {meaning.replace(";", " or")} (the I-form).', p1, 'Picture the first principal part.', details, True)
    base = conj.split()[0]
    add(cid, 'verbs-conjugation', f'What conjugation is {p1}, {p2}?', [conj, base, ordinal(base), f'{ordinal(base)} conjugation'], 'Listen to the infinitive, the second principal part.')
    for n, part in enumerate([p1, p2, p3, p4], 1):
        add(cid, f'verbs-part{n}', f'What is principal part {n} of {p1}?', part, f'Picture part {n} in the four forms on your card.', latin=True)

for cid, latin, meaning in SOURCE['conjunctions']:
    add(cid, 'meaning', f'What does {latin} mean in English?', meaning, 'Think of how it connects ideas.', 'Conjunction.')
    add(cid, 'reverse', f'Which Latin conjunction means {meaning.replace(";", " or")}?', latin, 'Picture the Latin side of this card.', 'Conjunction.', True)

GRAMMAR_ALTERNATIVES = SOURCE.get('grammar_alternatives', {})
for cid, prompt, answer in SOURCE['grammar']:
    add(cid, 'grammar', prompt, [answer, *GRAMMAR_ALTERNATIVES.get(cid, [])], 'Think about the grammatical job described. Reveal the answer if you need to study the idea.')
    if cid in {'fs-g-029','fs-g-030'}: QUESTIONS[-1]['preserveVowelLength'] = True
    if cid == 'fs-g-019': QUESTIONS[-1]['listAnswer'] = True

# Standard Latin vocabulary can share English meanings; accept matching entries fairly.
# A reverse prompt accepts another approved Latin word matching any offered meaning.
reverse_cards = [q for q in QUESTIONS if q['mode'] == 'reverse']
meanings = {q['card']: set(q['answers']) for q in QUESTIONS if q['mode'] == 'meaning'}
for q in reverse_cards:
    for other in reverse_cards:
        if meanings[q['card']] & meanings[other['card']]:
            q['answers'] = list(dict.fromkeys(q['answers'] + other['answers'][:1]))

QUESTION_MAP = {q['id']: q for q in QUESTIONS}
CUES = {'study-unknown': 'I could not find that fact on these cards. Try asking for meaning, gender, declension, conjugation, or principal parts. Say repeat to hear the quiz question again.',
        'welcome': 'Welcome to Latin Quest. Listen, try one answer, and take your time. You can ask for a hint, repeat, reveal, skip, or stop.',
        'complete': 'Quest complete. Well done practicing! Your progress is saved on this device.',
        'correct': 'Correct! Well done.', 'try': 'Good try. Let us learn this one together.',
        'listen': 'Your turn. Say your answer now.', 'paused': 'Quest paused. Your completed questions are saved on this device.'}
for q in QUESTIONS:
    CUES[f'{q["id"]}:plain'] = q['prompt']
    CUES[f'{q["id"]}:details'] = f'{q["details"]} {q["prompt"]}'.strip()
    CUES[f'{q["id"]}:hint'] = q['hint']
    CUES[f'{q["id"]}:answer'] = f'The card answer is: {q["answer"]}.'
    CUES[f'option:{q["id"]}'] = q['answers'][0]

# Spoken study answers are fixed card facts, not model-generated tutoring.
STUDY = []
for cid, pos, first, second, meaning, decl, gender in SOURCE['nouns_and_pronouns']:
    facts = {'meaning': meaning, 'part of speech': pos, 'forms': f'{first}, {second}'}
    if pos == 'noun':
        facts.update({'gender': gender, 'declension': f'{ordinal(decl)} declension',
                      'nominative': first, 'genitive': second})
    for fact, value in facts.items():
        cue = f'study:{cid}:{fact.replace(" ", "-")}'
        CUES[cue] = f'{first}. {fact.capitalize()}: {value}.'
        STUDY.append({'id': cid, 'word': first, 'aliases': [first, second], 'fact': fact, 'answer': value, 'cue': cue})
for cid, p1, p2, p3, p4, meaning, conj in SOURCE['verbs']:
    facts = {'meaning': meaning, 'part of speech': 'verb', 'conjugation': f'{ordinal(conj)} conjugation',
             'principal parts': ', '.join([p1, p2, p3, p4])}
    for n, part in enumerate([p1, p2, p3, p4], 1):
        facts[f'principal part {n}'] = part
    for fact, value in facts.items():
        cue = f'study:{cid}:{fact.replace(" ", "-")}'
        CUES[cue] = f'{p1}. {fact.capitalize()}: {value}.'
        STUDY.append({'id':cid, 'word':p1, 'aliases':[p1,p2,p3,p4], 'fact':fact, 'answer':value, 'cue':cue})
for cid, word, meaning in SOURCE['conjunctions']:
    for fact, value in {'meaning':meaning, 'part of speech':'conjunction'}.items():
        cue = f'study:{cid}:{fact.replace(" ", "-")}'
        CUES[cue] = f'{word}. {fact.capitalize()}: {value}.'
        STUDY.append({'id':cid,'word':word,'aliases':[word],'fact':fact,'answer':value,'cue':cue})
# Compose results from reusable number clips rather than one clip per score pair.
for number in range(CARD_COUNT+1):
    CUES[f'score-{number}'] = f'{number} correct without hints.'
    CUES[f'count-{number}'] = f'{number} questions completed.'

MEMORY_LINKS = json.loads((Path(__file__).resolve().parents[1] / 'content/latin_quest/memory_links.json').read_text())
for card_id, memory in MEMORY_LINKS.items():
    CUES['memory:' + card_id] = memory['text']
    card = next(entry for entry in STUDY if entry['id'] == card_id)
    STUDY.append({'id': card_id, 'word': card['word'], 'aliases': card['aliases'], 'fact': 'memory connection', 'answer': memory['text'], 'cue': 'memory:' + card_id})

for question in QUESTIONS:
    if question['mode'] not in {'meaning', 'reverse'}:
        question['flash_front'], question['flash_back'] = question['prompt'], question['answer']
        CUES['flash:' + question['id'] + ':front'] = question['flash_front']
        CUES['flash:' + question['id'] + ':back'] = question['flash_back']
        continue
    cid = question['card']
    meaning = next(q['answer'] for q in QUESTIONS if q['card'] == cid and q['mode'] == 'meaning')
    forms = next((e['answer'] for e in STUDY if e['id'] == cid and e['fact'] in {'forms', 'principal parts'}), None)
    latin = forms or next(q['answer'] for q in QUESTIONS if q['card'] == cid and q['mode'] == 'reverse')
    question['flash_front'], question['flash_back'] = (latin, meaning) if question['mode'] == 'meaning' else (meaning, latin)
    CUES['flash:' + question['id'] + ':front'] = question['flash_front']
    CUES['flash:' + question['id'] + ':back'] = question['flash_back']

OPTION_INSTRUCTIONS = {
    'meaning': 'The supplied text is an English meaning. Read it in natural English, not as Latin.',
    'reverse': 'The supplied text is an isolated Latin word. Read it in restored Classical Latin, not English.',
}

def speech_instructions(cue, pronunciation):
    extra = ''
    if cue.startswith('option:'):
        question = QUESTION_MAP.get(cue[7:])
        if question:
            extra = OPTION_INSTRUCTIONS['reverse' if question.get('latin') else 'meaning']
    if cue.startswith('flash:'):
        _, card, mode, side = cue.split(':')
        english = (mode == 'meaning' and side == 'back') or (mode == 'reverse' and side == 'front')
        if mode not in {'meaning', 'reverse'}:
            english = side == 'front' or not QUESTION_MAP.get(f'{card}:{mode}', {}).get('latin')
        extra = OPTION_INSTRUCTIONS['meaning' if english else 'reverse']
    return INSTRUCTIONS[pronunciation] + (' ' + extra if extra else '')

AUDIO_VERSION = hashlib.sha256(json.dumps([MODEL, SPEED, INSTRUCTIONS, OPTION_INSTRUCTIONS, CUES], sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]

def cache_path(cue, voice, pronunciation):
    payload = [MODEL, voice, pronunciation, speech_instructions(cue, pronunciation), SPEED, CUES[cue]]
    digest = hashlib.sha256(json.dumps(payload, ensure_ascii=False).encode()).hexdigest()
    return f'latin_quest/audio/v1/{digest}.mp3'

