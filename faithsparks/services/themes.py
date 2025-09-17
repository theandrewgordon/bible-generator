import os
from datetime import datetime, timezone, date
from flask import session, request
from .firestore import db


THEMES = {
    'teal': {
        'primary': '#0ea5a8', 'primary_dark': '#0b8a8d',
        'background': '#ffffff', 'box': '#edf2f7',
        'text': '#1f2937', 'text_secondary': '#6b7280'
    },
    'blue': {
        'primary': '#3182ce', 'primary_dark': '#2b6cb0',
        'background': '#ffffff', 'box': '#edf2f7',
        'text': '#2d3748', 'text_secondary': '#718096'
    },
    'christmas': {
        'primary': '#065f46', 'primary_dark': '#064e3b',
        'background': '#ffffff', 'box': '#f1f5f9',
        'text': '#1f2937', 'text_secondary': '#6b7280'
    },
    'thanksgiving': {
        'primary': '#b45309', 'primary_dark': '#92400e',
        'background': '#fffaf0', 'box': '#fef3c7',
        'text': '#1f2937', 'text_secondary': '#6b7280'
    },
}


def get_theme_vars(name: str) -> dict | None:
    if name in THEMES:
        return THEMES[name]
    if db and name:
        try:
            d = db.collection('themes').document(name).get()
            if d.exists:
                data = d.to_dict() or {}
                return {
                    'primary': data.get('primary') or '#0ea5a8',
                    'primary_dark': data.get('primary_dark') or data.get('primaryDark') or '#0b8a8d',
                    'background': data.get('background') or '#ffffff',
                    'box': data.get('box') or '#edf2f7',
                    'text': data.get('text') or '#1f2937',
                    'text_secondary': data.get('text_secondary') or data.get('textSecondary') or '#6b7280',
                    'extras': {
                        'snow': bool(data.get('snow') or (data.get('extras') or {}).get('snow')),
                        'lights': bool(data.get('lights') or (data.get('extras') or {}).get('lights')),
                        'leaves': bool(data.get('leaves') or (data.get('extras') or {}).get('leaves')),
                        'string_lights': bool(data.get('string_lights') or (data.get('extras') or {}).get('string_lights')),
                        'snow_svg': bool(data.get('snow_svg') or (data.get('extras') or {}).get('snow_svg')),
                        'custom_css': (data.get('extra_css') or (data.get('extras', {}) if isinstance(data.get('extras'), dict) else {}).get('custom_css') or ''),
                    }
                }
        except Exception:
            pass
    return None


def list_all_themes() -> dict:
    out = dict(THEMES)
    if db:
        try:
            for d in db.collection('themes').stream():
                name = d.id
                data = d.to_dict() or {}
                out[name] = {
                    'primary': data.get('primary') or '#0ea5a8',
                    'primary_dark': data.get('primary_dark') or data.get('primaryDark') or '#0b8a8d',
                    'background': data.get('background') or '#ffffff',
                    'box': data.get('box') or '#edf2f7',
                    'text': data.get('text') or '#1f2937',
                    'text_secondary': data.get('text_secondary') or data.get('textSecondary') or '#6b7280',
                    'extras': {
                        'snow': bool(data.get('snow') or (data.get('extras') or {}).get('snow')),
                        'lights': bool(data.get('lights') or (data.get('extras') or {}).get('lights')),
                        'leaves': bool(data.get('leaves') or (data.get('extras') or {}).get('leaves')),
                        'string_lights': bool(data.get('string_lights') or (data.get('extras') or {}).get('string_lights')),
                        'snow_svg': bool(data.get('snow_svg') or (data.get('extras') or {}).get('snow_svg')),
                        'custom_css': (data.get('extra_css') or (data.get('extras') or {}).get('custom_css') or ''),
                    }
                }
        except Exception:
            pass
    return out


def _parse_date_str(s: str):
    s = (s or '').strip()
    if not s:
        return None
    try:
        parts = [int(p) for p in s.split('-')]
        if len(parts) == 3:
            return date(parts[0], parts[1], parts[2])
    except Exception:
        pass
    try:
        parts = [int(p) for p in s.split('-')]
        if len(parts) == 2:
            today = datetime.now(timezone.utc).date()
            return today.replace(month=parts[0], day=parts[1])
    except Exception:
        return None
    return None


def _is_today_in_range(start_s: str, end_s: str) -> bool:
    today = datetime.now(timezone.utc).date()
    start = _parse_date_str(start_s)
    end = _parse_date_str(end_s)
    if not start or not end:
        return False
    s = start.replace(year=today.year)
    e = end.replace(year=today.year)
    if e < s:
        return today >= s or today <= e
    return s <= today <= e


def _parse_time_str(s: str):
    s = (s or '').strip()
    if not s:
        return None
    try:
        hh, mm = s.split(':')
        return int(hh) * 60 + int(mm)
    except Exception:
        return None


def _is_now_in_time_range(start_t: str, end_t: str) -> bool:
    now = datetime.now().hour * 60 + datetime.now().minute
    s = _parse_time_str(start_t)
    e = _parse_time_str(end_t)
    if s is None or e is None:
        return True
    if e < s:
        return now >= s or now <= e
    return s <= now <= e


def _weekday_today_sun0() -> int:
    return (datetime.now().weekday() + 1) % 7


def _rule_matches(r: dict) -> bool:
    if not r or not r.get('name'):
        return False
    if not _is_today_in_range(r.get('start', ''), r.get('end', '')):
        return False
    if not _is_now_in_time_range(r.get('timeStart', ''), r.get('timeEnd', '')):
        return False
    w = r.get('weekdays') or []
    if isinstance(w, list) and len(w):
        if _weekday_today_sun0() not in [int(x) for x in w]:
            return False
    return True


def get_theme_selection():
    name = 'teal'
    auto = None
    auto_rules = []
    if db:
        try:
            conf = db.collection('config').document('app').get()
            if conf.exists:
                n = (conf.to_dict() or {}).get('theme')
                if n:
                    name = n
                confd = (conf.to_dict() or {})
                auto = confd.get('autoTheme') or None
                auto_rules = confd.get('autoThemes') or []
        except Exception:
            pass
    if name == 'teal':
        env_sel = os.getenv('THEME_NAME')
        if env_sel:
            name = env_sel
    try:
        if isinstance(auto_rules, list) and len(auto_rules):
            def _key(r):
                try:
                    return int(r.get('priority') or 0)
                except Exception:
                    return 0
            for r in sorted(auto_rules, key=_key, reverse=True):
                if r.get('enabled') and r.get('name') and _rule_matches(r):
                    name = r.get('name')
                    break
        elif auto and auto.get('enabled') and auto.get('name'):
            if _is_today_in_range(auto.get('start', ''), auto.get('end', '')):
                name = auto.get('name')
    except Exception:
        pass
    try:
        pv = session.get('preview_theme')
        pv_exp = session.get('preview_theme_exp')
        if pv:
            if pv_exp and int(datetime.now(timezone.utc).timestamp()) > int(pv_exp):
                session.pop('preview_theme', None)
                session.pop('preview_theme_exp', None)
            elif (get_theme_vars(pv) is not None):
                name = pv
        qname = (request.args.get('theme') or '').strip()
        if qname and (get_theme_vars(qname) is not None):
            name = qname
            if request.args.get('pv') in ('1','true','True','yes'):
                session['preview_theme'] = qname
                try:
                    session['preview_theme_exp'] = int(datetime.now(timezone.utc).timestamp()) + 3600
                except Exception:
                    pass
    except Exception:
        pass
    vars = get_theme_vars(name) or THEMES['teal']
    return name, vars

