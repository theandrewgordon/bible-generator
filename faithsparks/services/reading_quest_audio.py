"""Fixed Reading Quest curriculum; no caller text or personal data reaches TTS."""
import json
from pathlib import Path

TASKS = json.loads((Path(__file__).resolve().parents[1] / 'content/reading_quest.json').read_text())
CUES = {
    'welcome': 'Welcome to Reading Quest. Press play!',
    'retry': "Let's try once more.",
    'listen': 'Listen again.',
    'success': 'Great work! You earned a star!',
}
for index, task in enumerate(TASKS):
    for kind in ('say', 'help', 'intro'):
        if kind in task:
            CUES[f'{index}-{kind}'] = task[kind]

INSTRUCTIONS = (
    'Speak only the supplied reading lesson text in a warm, calm American English voice. '
    'Use a slow, clear pace suitable for beginning readers. '
    'When demonstrating individual sounds, pronounce phonemes rather than letter names, '
    'without adding an uh sound to consonants. Do not add commentary.'
)
