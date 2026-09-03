import base64
import json
import subprocess


def _parse_calendar(source, week_start="2026-08-31", maximum=40):
    script = """
const calendar = require('./static/weekflow_calendar.js');
const source = Buffer.from(process.argv[1], 'base64').toString('utf8');
process.stdout.write(JSON.stringify(calendar.parseWeekEvents(source, process.argv[2], Number(process.argv[3]))));
"""
    encoded = base64.b64encode(source.encode()).decode()
    result = subprocess.run(
        ["node", "-e", script, encoded, week_start, str(maximum)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_calendar_import_reads_timed_and_all_day_events_for_selected_week():
    events = _parse_calendar(
        """BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART:20260902T130000
DTEND:20260902T143000
SUMMARY:Library\\, workshop
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260903
DTEND;VALUE=DATE:20260904
SUMMARY:Co-op day
END:VEVENT
BEGIN:VEVENT
DTSTART:20260908T090000
DTEND:20260908T100000
SUMMARY:Next week
END:VEVENT
END:VCALENDAR"""
    )

    assert events == [
        {
            "title": "Library, workshop",
            "day_id": "wed",
            "start_minute": 13 * 60,
            "end_minute": 14 * 60 + 30,
        },
        {
            "title": "Co-op day",
            "day_id": "thu",
            "start_minute": 9 * 60,
            "end_minute": 16 * 60,
        },
    ]


def test_calendar_import_honors_event_limit_and_unfolds_lines():
    source = """BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART:20260901T100000
DTEND:20260901T110000
SUMMARY:Long family
 event title
END:VEVENT
BEGIN:VEVENT
DTSTART:20260902T100000
DTEND:20260902T110000
SUMMARY:Second
END:VEVENT
END:VCALENDAR"""

    assert _parse_calendar(source, maximum=1) == [
        {
            "title": "Long familyevent title",
            "day_id": "tue",
            "start_minute": 10 * 60,
            "end_minute": 11 * 60,
        }
    ]
