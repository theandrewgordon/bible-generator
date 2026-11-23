#!/usr/bin/env python3
"""Audit reviewed chapter data, or create an AI proposal for human review (never publish it)."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from faithsparks.services.scroll_quest_learning import catalog, author_draft, LearningError


def audit():
    data=catalog();issues=[]
    if len(data['chapters'])!=54:issues.append('Expected 54 chapters.')
    for chapter_id,ch in data['chapters'].items():
        if not ch['passage'] or not ch['memoryVerse'] or not ch['memoryVerse'].get('ref'):issues.append(chapter_id+': missing Scripture reference.')
        if not ch['tasks'] or not ch['quiz']:issues.append(chapter_id+': missing reviewed tasks or questions.')
        for q in ch['quiz']:
            if type(q.get('answer')) is not int or not 0<=q['answer']<len(q.get('options',[])) or not q.get('ref'):issues.append(chapter_id+': incomplete quiz item.')
        for cue in ch['cues'].values():
            if cue['kind']=='scripture' and not cue.get('ref'):issues.append(chapter_id+': quotation without a reference.')
    return {'chapters':len(data['chapters']),'release':data['release'],'issues':issues,
            'scope':'Structural checks only. Human Bible review and gameplay tests remain necessary.'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--draft',metavar='CHAPTER',help='Generate one reviewed-source proposal (uses the configured OpenAI budget).')
    parser.add_argument('--output',type=Path,help='Save the review artifact as JSON, outside game files.')
    options=parser.parse_args();result=audit()
    if options.draft:
        try:suggestion=author_draft(options.draft)
        except LearningError as exc:
            result.update(reviewed=False,published=False,error=str(exc))
            print(json.dumps(result,indent=2,ensure_ascii=False));return 1
        result.update(chapter=options.draft,reviewed=False,published=False,suggestion=suggestion)
    if options.output:
        target=options.output.resolve()
        root=Path(__file__).resolve().parents[1]
        if target.suffix.lower()!='.json' or any(target.is_relative_to(root/name) for name in ['faithsparks/content','static','templates']):
            parser.error('Save a JSON review artifact outside published content, static files and templates.')
        target.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(json.dumps(result,indent=2,ensure_ascii=False))
    return 1 if result['issues'] else 0


if __name__=='__main__':raise SystemExit(main())
