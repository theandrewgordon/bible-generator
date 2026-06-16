import os
import random
import re
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict

from flask import render_template, redirect, url_for, request, session, flash, send_file, jsonify, current_app
from flask_dance.contrib.google import google
from firebase_admin import firestore

from faithsparks.services.firestore import db
from faithsparks.services.collections import get_collections, get_collection_meta
from faithsparks.services.storage import signed_url_for_path
from faithsparks.services.stripe_svc import stripe, STRIPE_SECRET_KEY
from faithsparks.services.usage import _get_user_plan, _get_usage, _quota_for_plan, _update_usage
from faithsparks.services.rate_limit import check_rate_limit
from faithsparks.util.request_utils import get_client_ip
from build_games import generate_match_game_pdf, generate_word_search_pdf, generate_crossword_pdf, MatchItem
from verse_helpers import (
    request_verse_data,
    request_verse_meaning,
    request_theme_label,
    parse_and_clean_json,
)

WARM_TOPIC_SUGGESTIONS = [
    {
        "label": "God's Names & Attributes",
        "refs": "Genesis 1:1\nPsalm 23:1\nPsalm 27:1\n1 John 4:8\nPsalm 46:1\nIsaiah 9:6\nPsalm 47:7\nMatthew 6:9",
        "words": ["GOD", "LORD", "CREATOR", "FATHER", "KING", "LIGHT", "LOVE", "HELPER", "SHEPHERD", "MIGHTY"],
    },
    {
        "label": "Jesus",
        "refs": "Matthew 1:21\nJohn 14:6\nJohn 10:11\nJohn 15:15\nRevelation 19:16\nJohn 1:29\nActs 2:36\nMatthew 16:16",
        "words": ["JESUS", "SAVIOR", "SON", "TEACHER", "HEALER", "FRIEND", "KING", "LAMB", "MESSIAH", "LORD"],
    },
    {
        "label": "Creation",
        "refs": "Genesis 1:1\nGenesis 1:16\nGenesis 1:10\nGenesis 1:20\nGenesis 1:24\nPsalm 19:1\nGenesis 1:31\nPsalm 104:24",
        "words": ["CREATION", "EARTH", "SKY", "SEA", "LAND", "SUN", "MOON", "STARS", "ANIMALS", "PLANTS"],
    },
    {
        "label": "Bible",
        "refs": "2 Timothy 3:16\nPsalm 119:105\nPsalm 119:11\nHebrews 4:12\nJoshua 1:8\nPsalm 119:97\nMatthew 4:4\nJohn 17:17",
        "words": ["BIBLE", "SCRIPTURE", "WORD", "BOOK", "VERSE", "CHAPTER", "READ", "TRUTH", "LAW", "PSALMS"],
    },
    {
        "label": "Prayer",
        "refs": "Matthew 6:9-10\nPhilippians 4:6\n1 Thessalonians 5:17\nJeremiah 33:3\nPsalm 145:18\nJames 5:16\nMark 1:35\nLuke 11:9",
        "words": ["PRAY", "PRAYER", "ASK", "THANKS", "PRAISE", "LISTEN", "AMEN", "KNEEL", "TALK", "HEART"],
    },
    {
        "label": "Worship",
        "refs": "Psalm 95:1-2\nPsalm 100:2\nPsalm 150:6\nPsalm 34:1\nHebrews 13:15\nPsalm 47:1\nPsalm 98:4\nColossians 3:16",
        "words": ["WORSHIP", "PRAISE", "SING", "SONG", "JOY", "THANKS", "CLAP", "DANCE", "SHOUT", "MUSIC"],
    },
    {
        "label": "Love",
        "refs": "John 3:16\n1 John 4:19\n1 Corinthians 13:4-7\nJohn 13:34-35\nRomans 5:8\n1 John 4:7-8\nEphesians 4:32\nPsalm 136:1",
        "words": ["LOVE", "CARE", "KIND", "GIVE", "HELP", "SERVE", "SHARE", "FORGIVE", "FRIEND", "MERCY"],
    },
    {
        "label": "Kindness",
        "refs": "Ephesians 4:32\nColossians 3:12\nGalatians 5:22-23\nProverbs 15:1\nProverbs 19:11\nMicah 6:8\n1 Peter 3:8\nLuke 6:35",
        "words": ["KIND", "NICE", "HELP", "CARE", "SHARE", "SMILE", "GENTLE", "GIVE", "SERVE", "LOVE"],
    },
    {
        "label": "Obedience",
        "refs": "John 14:15\nDeuteronomy 5:33\nJames 1:22\n1 Samuel 15:22\nLuke 11:28\nColossians 3:20\nPsalm 119:9\nRomans 12:1",
        "words": ["OBEY", "LISTEN", "FOLLOW", "RULES", "RIGHT", "CHOICE", "YES", "TRUST", "DO", "WILL"],
    },
    {
        "label": "Forgiveness",
        "refs": "1 John 1:9\nColossians 3:13\nEphesians 4:32\nMatthew 6:14-15\nLuke 17:3-4\nPsalm 103:12\nMicah 7:18-19\nIsaiah 1:18",
        "words": ["FORGIVE", "SORRY", "MERCY", "LOVE", "CLEAN", "HEART", "GRACE", "AGAIN", "PEACE"],
    },
    {
        "label": "Faith & Trust",
        "refs": "Hebrews 11:1\nProverbs 3:5-6\nPsalm 56:3\nIsaiah 41:10\nRomans 10:17\nMark 9:23\nPsalm 37:5\nJames 1:6",
        "words": ["FAITH", "TRUST", "BELIEVE", "HOPE", "STRONG", "PROMISE", "WAIT", "PRAY", "SEE"],
    },
    {
        "label": "Courage",
        "refs": "Joshua 1:9\nPsalm 27:1\nDeuteronomy 31:6\n1 Corinthians 16:13\nIsaiah 41:13\n2 Timothy 1:7\nPsalm 56:3\n1 Samuel 17:47",
        "words": ["BRAVE", "STRONG", "BOLD", "FEAR", "TRUST", "HELP", "STAND", "FIGHT", "WIN"],
    },
    {
        "label": "Thankfulness",
        "refs": "1 Thessalonians 5:18\nPsalm 107:1\nColossians 3:17\nPhilippians 4:6\nPsalm 100:4\nEphesians 5:20\nJames 1:17\nPsalm 136:1",
        "words": ["THANKS", "GRATEFUL", "JOY", "BLESS", "GIFT", "PRAISE", "HAPPY", "GIVE"],
    },
    {
        "label": "God's Protection",
        "refs": "Psalm 91:1-2\nPsalm 46:1\nProverbs 18:10\nPsalm 121:7-8\nIsaiah 41:10\nPsalm 34:7\nNahum 1:7\n2 Thessalonians 3:3",
        "words": ["SAFE", "HELP", "SHIELD", "ARMOR", "WALL", "ROCK", "REFUGE", "PEACE"],
    },
    {
        "label": "Armor of God",
        "refs": "Ephesians 6:10-11\nEphesians 6:14\nEphesians 6:16\nEphesians 6:17\nEphesians 6:18\n1 Thessalonians 5:8\nIsaiah 59:17",
        "words": ["ARMOR", "BELT", "TRUTH", "SHIELD", "FAITH", "HELMET", "SWORD", "WORD", "PEACE"],
    },
    {
        "label": "Fruit of the Spirit",
        "refs": "Galatians 5:22-23\nJohn 15:5\nJohn 15:11\nColossians 3:12\nEphesians 4:2\nRomans 15:13\n2 Timothy 1:7\nMatthew 7:17",
        "words": ["LOVE", "JOY", "PEACE", "KIND", "GOOD", "FAITH", "GENTLE", "SELF", "CONTROL"],
    },
    {
        "label": "Angels",
        "refs": "Psalm 91:11\nLuke 2:10-11\nHebrews 1:14\nPsalm 103:20\nMatthew 18:10\nLuke 1:19\nActs 12:7\nRevelation 5:11",
        "words": ["ANGEL", "WINGS", "LIGHT", "HEAVEN", "MESSENGER", "SONG", "JOY", "GLORY"],
    },
    {
        "label": "Heaven",
        "refs": "John 14:2-3\nRevelation 21:4\nRevelation 21:1\nPhilippians 3:20\n1 Peter 1:4\nMatthew 5:12\nColossians 3:1-2\nPsalm 16:11",
        "words": ["HEAVEN", "HOME", "JOY", "PEACE", "LIGHT", "CROWN", "GOLD", "GLORY"],
    },
    {
        "label": "Church",
        "refs": "Acts 2:42\nHebrews 10:24-25\n1 Corinthians 12:27\nEphesians 2:19-22\nColossians 3:16\nMatthew 18:20\nActs 2:47\nRomans 12:5",
        "words": ["CHURCH", "PEOPLE", "FAMILY", "PRAY", "SING", "LOVE", "HELP", "GIVE"],
    },
    {
        "label": "Bible Heroes",
        "refs": "Genesis 6:9\nExodus 3:10\n1 Samuel 17:47\nEsther 4:14\nRuth 1:16\nDaniel 6:22\nLuke 1:38\nActs 9:15\nMatthew 16:16\nRomans 1:16",
        "words": ["NOAH", "MOSES", "DAVID", "ESTHER", "RUTH", "DANIEL", "MARY", "PAUL", "PETER"],
    },
]

MATCH_TOPIC_SUGGESTIONS = WARM_TOPIC_SUGGESTIONS
STORY_TOPIC_SUGGESTIONS = WARM_TOPIC_SUGGESTIONS

_PRICE_META_CACHE: dict[str, tuple[float, dict | None]] = {}
_PRICE_META_TTL = 300
MAX_GAME_TITLE_LEN = 120
MAX_GAME_REFERENCES_LEN = 1200
MAX_GAME_THEME_LEN = 160
MAX_GAME_ITEMS_LEN = 3000
MAX_GAME_WORDS_LEN = 1200
MAX_GAMES_WORDS_REFS_LEN = 1200

def _get_cached_price_meta(pid: str) -> dict | None:
    now = time.time()
    entry = _PRICE_META_CACHE.get(pid)
    if entry and now - entry[0] < _PRICE_META_TTL:
        return entry[1]
    if not stripe or not STRIPE_SECRET_KEY:
        meta = None
    else:
        try:
            p = stripe.Price.retrieve(pid)
            meta = {
                "amount": (p.get("unit_amount") or 0) / 100.0,
                "currency": (p.get("currency") or "usd").upper(),
            }
        except Exception:
            meta = None
    _PRICE_META_CACHE[pid] = (now, meta)
    return meta

CROSSWORD_FALLBACK_CLUES = {
    "AGAIN": "One more time",
    "AMEN": "Spoken at prayer end",
    "ANGEL": "Heavenly messenger",
    "ANIMALS": "Living creatures God made",
    "ARMOR": "Protective gear for battle",
    "ASK": "Make a request",
    "BELIEVE": "Trust in God",
    "BELT": "Part of the armor",
    "BIBLE": "Holy book of Scripture",
    "BLESS": "Give a good gift",
    "BOLD": "Brave and not afraid",
    "BOOK": "A written collection",
    "BRAVE": "Showing courage",
    "CARE": "Show kindness",
    "CHAPTER": "Section in a book",
    "CHOICE": "A decision you make",
    "CHURCH": "Gods people together",
    "CLAP": "Hands make praise",
    "CLEAN": "Free from dirt",
    "CONTROL": "Self restraint",
    "CREATION": "Everything God made",
    "CREATOR": "One who made all",
    "CROWN": "Reward for a king",
    "DANCE": "Move with joy",
    "DANIEL": "Lion den hero",
    "DAVID": "Giant slayer king",
    "DO": "Take action",
    "EARTH": "Our world",
    "ESTHER": "Queen who was brave",
    "FAITH": "Trust in God",
    "FAMILY": "People who love you",
    "FATHER": "God as parent",
    "FEAR": "Feeling of being afraid",
    "FIGHT": "Stand against evil",
    "FOLLOW": "Go after",
    "FORGIVE": "Let go of hurt",
    "FRIEND": "Someone you love",
    "GENTLE": "Kind and soft",
    "GIFT": "A special present",
    "GIVE": "Share with others",
    "GLORY": "Honor and praise",
    "GOD": "The One we worship",
    "GOLD": "Precious yellow metal",
    "GOOD": "Right and kind",
    "GRACE": "Gods unearned gift",
    "GRATEFUL": "Thankful in heart",
    "HAPPY": "Full of joy",
    "HEALER": "One who makes well",
    "HEART": "Inside feelings",
    "HEAVEN": "Home with God",
    "HELMET": "Head protection",
    "HELP": "Give support",
    "HELPER": "Someone who assists",
    "HOME": "Place you belong",
    "HOPE": "Confident expectation",
    "JESUS": "Our Savior",
    "JOY": "Deep gladness",
    "KIND": "Nice and caring",
    "KING": "Ruler with authority",
    "KNEEL": "Bow down to pray",
    "LAMB": "Gentle young sheep",
    "LAND": "Dry ground",
    "LAW": "Gods rules",
    "LIGHT": "Shines in darkness",
    "LISTEN": "Pay attention",
    "LORD": "Title for God",
    "LOVE": "Care for others",
    "MARY": "Mother of Jesus",
    "MERCY": "Kindness to the guilty",
    "MESSENGER": "One who brings news",
    "MESSIAH": "Promised Savior",
    "MIGHTY": "Very strong",
    "MOON": "Night light in sky",
    "MOSES": "Led Israel out",
    "MUSIC": "Sounds of worship",
    "NICE": "Kind and friendly",
    "NOAH": "Built the ark",
    "OBEY": "Do what is right",
    "PAUL": "Apostle who wrote letters",
    "PEACE": "Calm in heart",
    "PEOPLE": "Gods family",
    "PETER": "Disciple who followed Jesus",
    "PLANTS": "Growing green things",
    "PRAISE": "Say good things",
    "PRAY": "Talk to God",
    "PRAYER": "Talking with God",
    "PROMISE": "A sure commitment",
    "PSALMS": "Songs in the Bible",
    "READ": "Look at words",
    "REFUGE": "Safe place",
    "RIGHT": "Good and true",
    "ROCK": "Strong and steady",
    "RULES": "Guiding instructions",
    "RUTH": "Loyal and kind woman",
    "SAFE": "Protected from harm",
    "SAVIOR": "One who rescues",
    "SCRIPTURE": "Holy writings",
    "SEA": "Large body of water",
    "SEE": "Look with eyes",
    "SELF": "You as a person",
    "SERVE": "Help with love",
    "SHARE": "Give some to others",
    "SHEPHERD": "Takes care of sheep",
    "SHIELD": "Protects in battle",
    "SHOUT": "Loud joyful cry",
    "SING": "Make music with voice",
    "SKY": "Above the earth",
    "SMILE": "Happy face",
    "SON": "Jesus as Gods child",
    "SONG": "Music with words",
    "SORRY": "Say you regret",
    "STAND": "Hold firm",
    "STARS": "Lights in night sky",
    "STRONG": "Full of strength",
    "SUN": "Bright day light",
    "SWORD": "Weapon of truth",
    "TALK": "Speak with someone",
    "TEACHER": "One who guides learning",
    "THANKS": "Words of gratitude",
    "TRUST": "Rely on God",
    "TRUTH": "What is right",
    "VERSE": "Line from Scripture",
    "WAIT": "Be patient",
    "WALL": "Strong barrier",
    "WILL": "Gods plan",
    "WIN": "Be victorious",
    "WINGS": "Angel feathers",
    "WORD": "Gods message",
    "WORDS": "Things we speak",
    "WORSHIP": "Honor God with praise",
    "YES": "An agreeing answer",
}


def _is_public_games_enabled() -> bool:
    return os.getenv("PUBLIC_GAMES", os.getenv("PUBLIC_BROWSE", "0")) in (
        "1",
        "true",
        "True",
        "yes",
        "on",
    )


def _is_admin_email(email: str) -> bool:
    allow = os.getenv("ADMIN_EMAILS", "")
    if not allow:
        return False
    allowed = [e.strip().lower() for e in allow.split(",") if e.strip()]
    return (email or "").lower() in allowed


def _usage_snapshot(email: str):
    plan = _get_user_plan(email)
    m_limit, l_limit = _quota_for_plan(plan)
    used_life, used_m = _get_usage(email)

    def remain(limit, used):
        return None if limit is None else max(0, int(limit) - int(used))

    remain_m = remain(m_limit, used_m)
    return {
        "plan": plan,
        "monthly_used": int(used_m),
        "monthly_limit": m_limit,
        "lifetime_used": int(used_life),
        "lifetime_limit": l_limit,
        "monthly_remaining": remain_m,
    }


def _match_render_options(game_type: str):
    game_type = (game_type or "match").strip().lower()
    if game_type == "match-meaning":
        return (
            "Draw a line to connect each Bible reference (left) to the correct meaning (right).",
            False,
        )
    return (
        "Draw a line to match each Bible reference (left) to the correct verse (right).",
        True,
    )


def _default_game_title(game_type: str) -> str:
    game_type = (game_type or "match").strip().lower()
    if game_type == "word-search":
        return "Word Search"
    if game_type == "crossword":
        return "Crossword"
    if game_type == "match-meaning":
        return "Match the Meaning"
    return "Match the Verse"


def _derive_theme_from_text(text: str) -> str:
    words = _extract_words(text or "", limit=5)
    return words[0].title() if words else ""


def _derive_theme_from_refs(refs: list[str]) -> str:
    if not refs:
        return ""
    book = (refs[0] or "").split()[0]
    return book.title() if book else ""


def _ai_theme_from_text(text: str) -> str:
    if not text:
        return ""
    try:
        content = request_theme_label(text, context_label="verse")
        data = parse_and_clean_json(content)
        return (data.get("theme") or "").strip()
    except Exception:
        return ""


def _ai_theme_from_words(words: list[str]) -> str:
    if not words:
        return ""
    try:
        sample = ", ".join(words[:12])
        content = request_theme_label(sample, context_label="word list")
        data = parse_and_clean_json(content)
        return (data.get("theme") or "").strip()
    except Exception:
        return ""


def _derive_theme(game_type: str, refs: list[str], verses: list[MatchItem], words: list[str]) -> str:
    if words:
        return _ai_theme_from_words(words) or (words[0] or "").title()
    if verses:
        return _ai_theme_from_text(verses[0].text) or _derive_theme_from_text(verses[0].text)
    return _derive_theme_from_refs(refs)


def _normalize_difficulty(raw: str) -> str:
    val = (raw or "standard").strip().lower()
    return val if val in ("simple", "standard", "hard") else "standard"


def games():
    if not _is_public_games_enabled() and not google.authorized:
        return redirect(url_for("google.login", next=request.url))

    is_admin = _is_admin_email(session.get("user_email"))
    signed_in = bool(google.authorized)
    user_email = session.get("user_email") if signed_in else None

    col_items = get_collections(show_all=is_admin)
    col_items = [c for c in col_items if (c.get("kind") or "bundle") == "game"]
    col_items.sort(key=lambda c: (int(c.get("order") or 9999), c.get("title", "")))

    purchases = {}
    is_member = False
    if db and signed_in:
        try:
            u = db.collection("users").document(user_email).get()
            if u.exists:
                ud = u.to_dict() or {}
                is_member = ud.get("isPro") or (ud.get("plan") in ("family", "classroom", "plus", "plus_family", "plus_classroom"))
                purchases = ud.get("purchases") or {}
        except Exception:
            purchases = {}

    games_list = []
    for c in col_items:
        slug = c.get("slug")
        is_free = bool(c.get("isFree"))
        is_sub_only = bool(c.get("isSubscriberOnly"))
        purchased = bool(purchases.get(slug))
        locked = is_sub_only and not is_member and not purchased
        can_download = signed_in and not locked
        game_type = c.get("gameType") or "match"
        games_list.append({
            "slug": slug,
            "title": c.get("title") or _default_game_title(game_type),
            "description": c.get("description", ""),
            "zipUrl": c.get("zipUrl"),
            "isFree": is_free,
            "isSubscriberOnly": is_sub_only,
            "priceId": c.get("priceId"),
            "gameType": game_type,
            "ageRange": c.get("ageRange"),
            "skills": c.get("skills") or [],
            "useCases": c.get("useCases") or [],
            "previewImages": c.get("previewImages") or [],
            "locked": locked,
            "can_download": can_download,
            "purchased": purchased,
        })
    selected_type = (request.args.get("type") or "").strip()
    allowed_types = {"match", "word-search", "crossword", "match-meaning"}

    if selected_type in allowed_types:
        games_list = [g for g in games_list if (g.get("gameType") or "match") == selected_type]
    else:
        selected_type = ""
    if stripe and STRIPE_SECRET_KEY:
        seen: Dict[str, dict | None] = {}
        for g in games_list:
            pid = g.get("priceId")
            if not pid:
                continue
            if pid in seen:
                g["priceMeta"] = seen[pid]
                continue
            meta = _get_cached_price_meta(pid)
            g["priceMeta"] = meta
            seen[pid] = meta

    usage_info = _usage_snapshot(user_email) if signed_in else None

    return render_template(
        "games.html",
        games=games_list,
        signed_in=signed_in,
        usage_info=usage_info,
        selected_type=selected_type,
    )


def games_detail(slug):
    if not _is_public_games_enabled() and not google.authorized:
        return redirect(url_for("google.login", next=request.url))

    meta = get_collection_meta(slug)
    if not meta:
        return "Not found", 404
    if (meta.get("kind") or "bundle") != "game":
        return redirect(url_for("browse_detail", slug=slug))
    if not meta.get("title"):
        meta["title"] = _default_game_title(meta.get("gameType") or "match")

    signed_in = bool(google.authorized)
    can_download = False
    needs_member = False

    if signed_in and db:
        email = session.get("user_email")
        try:
            u = db.collection("users").document(email).get()
            if u.exists:
                ud = u.to_dict() or {}
                is_member = ud.get("isPro") or (ud.get("plan") in ("family", "classroom", "plus", "plus_family", "plus_classroom"))
                if meta.get("isSubscriberOnly") and not (is_member or (ud.get("purchases") or {}).get(slug)):
                    needs_member = True
                else:
                    can_download = True
        except Exception:
            pass

    if meta.get("priceId") and stripe and STRIPE_SECRET_KEY:
        try:
            p = stripe.Price.retrieve(meta["priceId"])
            meta["priceMeta"] = {"amount": (p.get("unit_amount") or 0) / 100.0, "currency": (p.get("currency") or "usd").upper()}
        except Exception:
            meta["priceMeta"] = None

    usage_info = _usage_snapshot(session.get("user_email")) if signed_in else None
    return render_template(
        "games_detail.html",
        c=meta,
        can_download=can_download,
        needs_member=needs_member,
        signed_in=signed_in,
        usage_info=usage_info,
    )


def games_create():
    if not google.authorized:
        flash("Please sign in to create a game.", "warning")
        return redirect(url_for("google.login", next=request.url))

    email = session.get("user_email")
    if request.method == "GET":
        usage_info = _usage_snapshot(email)
        return render_template(
            "games_create.html",
            usage_info=usage_info,
            match_topics=MATCH_TOPIC_SUGGESTIONS,
            story_topics=STORY_TOPIC_SUGGESTIONS,
        )

    def normalize_multiline(text: str) -> str:
        return (text or "").replace("\\r\\n", "\n").replace("\\n", "\n").replace("\r\n", "\n").replace("\r", "\n")

    raw_title = (request.form.get("title") or "").strip()
    version = (request.form.get("version") or "web").strip().lower()
    game_type = (request.form.get("gameType") or "match").strip().lower()
    if raw_title:
        title = raw_title
    else:
        title = _default_game_title(game_type)
    refs_raw = normalize_multiline(request.form.get("references") or "")
    theme = (request.form.get("theme") or "").strip()
    difficulty = _normalize_difficulty(request.form.get("difficulty") or "standard")
    confirm_words = bool(request.form.get("confirmWords"))
    game_items_raw = normalize_multiline(request.form.get("gameItems") or "")
    game_words_raw = normalize_multiline(request.form.get("gameWords") or "")
    word_action = (request.form.get("wordAction") or "").strip().lower()
    if (
        len(raw_title) > MAX_GAME_TITLE_LEN
        or len(refs_raw) > MAX_GAME_REFERENCES_LEN
        or len(theme) > MAX_GAME_THEME_LEN
        or len(game_items_raw) > MAX_GAME_ITEMS_LEN
        or len(game_words_raw) > MAX_GAME_WORDS_LEN
    ):
        flash("Please shorten the game details and try again.", "warning")
        return redirect(url_for("games_create"))
    refs = [r.strip() for r in re.split(r"[\n,]+", refs_raw) if r.strip()]
    game_items = []
    for line in (game_items_raw or "").splitlines():
        if not line.strip():
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 2:
            continue
        ref = parts[0]
        text = parts[1]
        v = parts[2] if len(parts) > 2 else ""
        game_items.append({"reference": ref, "text": text, "version": v})

    game_words = [w.strip() for w in (game_words_raw or "").splitlines() if w.strip()]

    def build_form_state(game_words_list: list[str], confirmed: bool = False):
        return {
            "title": raw_title,
            "theme": theme,
            "version": version,
            "game_type": game_type,
            "difficulty": difficulty,
            "references": refs_raw,
            "game_items": game_items_raw,
            "game_words": "\n".join(game_words_list),
            "confirm_words": confirmed,
        }

    if word_action in ("build", "clear"):
        if word_action == "build":
            if not refs:
                flash("Add references to build a word list.", "warning")
                usage_info = _usage_snapshot(email)
                return render_template(
                    "games_create.html",
                    usage_info=usage_info,
                    match_topics=MATCH_TOPIC_SUGGESTIONS,
                    story_topics=STORY_TOPIC_SUGGESTIONS,
                    form_state=build_form_state(game_words, confirmed=False),
                )
            game_words = _build_word_search_words_from_inputs(refs, version, [], difficulty)
        else:
            game_words = []
        usage_info = _usage_snapshot(email)
        return render_template(
            "games_create.html",
            usage_info=usage_info,
            match_topics=MATCH_TOPIC_SUGGESTIONS,
            story_topics=STORY_TOPIC_SUGGESTIONS,
            form_state=build_form_state(game_words, confirmed=False),
        )

    if not refs and not game_items and not game_words:
        flash("Add at least one reference or match item.", "warning")
        usage_info = _usage_snapshot(email)
        return render_template(
            "games_create.html",
            usage_info=usage_info,
            match_topics=MATCH_TOPIC_SUGGESTIONS,
            story_topics=STORY_TOPIC_SUGGESTIONS,
            form_state=build_form_state(game_words, confirmed=confirm_words),
        )
    if game_type in ("word-search", "crossword") and not confirm_words:
        flash("Please review the word list before creating the game.", "warning")
        usage_info = _usage_snapshot(email)
        return render_template(
            "games_create.html",
            usage_info=usage_info,
            match_topics=MATCH_TOPIC_SUGGESTIONS,
            story_topics=STORY_TOPIC_SUGGESTIONS,
            form_state=build_form_state(game_words, confirmed=False),
        )
    if game_type == "match-meaning" and not game_items and not refs:
        flash("Add references or match items for Match the Meaning.", "warning")
        usage_info = _usage_snapshot(email)
        return render_template(
            "games_create.html",
            usage_info=usage_info,
            match_topics=MATCH_TOPIC_SUGGESTIONS,
            story_topics=STORY_TOPIC_SUGGESTIONS,
            form_state=build_form_state(game_words, confirmed=confirm_words),
        )

    user_limit = check_rate_limit("games_create:user", email or get_client_ip(), limit=12, window_seconds=60 * 60)
    ip_limit = check_rate_limit("games_create:ip", get_client_ip(), limit=30, window_seconds=60 * 60)
    if not user_limit.allowed or not ip_limit.allowed:
        flash("You've made several game requests recently. Please wait a bit before creating more.", "warning")
        return redirect(url_for("games_create"))

    plan = _get_user_plan(email)
    m_limit, l_limit = _quota_for_plan(plan)
    used_life, used_m = _get_usage(email)
    if (m_limit is not None and used_m >= m_limit) or (l_limit is not None and used_life >= l_limit):
        flash("You’ve used all your credits for this month.", "warning")
        return redirect(url_for("games_create"))

    pdf_dir = os.path.join("output", "games")
    os.makedirs(pdf_dir, exist_ok=True)
    safe_title = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "match-the-verse"
    unique_id = uuid.uuid4().hex[:8]
    pdf_path = os.path.join(pdf_dir, f"custom-{safe_title}-{version}-{unique_id}.pdf")

    try:
        if game_type == "word-search":
            words = _build_word_search_words_from_inputs(refs, version, game_words, difficulty)
            if not theme:
                theme = _derive_theme(game_type, refs, [], words)
            subtitle = f"Theme: {theme}" if theme else None
            difficulty_note = "Word list: Simple uses 8 words. Standard uses 12 words. Hard hides the word list."
            show_word_list = difficulty != "hard"
            generate_word_search_pdf(
                title,
                words,
                pdf_path,
                subtitle=subtitle,
                difficulty_note=difficulty_note,
                show_word_list=show_word_list,
                scripture_versions=[version],
            )
        elif game_type == "crossword":
            words = _build_word_search_words_from_inputs(refs, version, game_words, difficulty)
            limit = 6 if difficulty == "simple" else 10
            words = words[:limit]
            if not theme:
                theme = _derive_theme(game_type, refs, [], words)
            subtitle = f"Theme: {theme}" if theme else None
            clues = _build_crossword_clues(words, theme)
            difficulty_note = "Word list: Simple uses 6 words. Standard uses 10 words. Hard hides the word bank."
            show_word_bank = difficulty != "hard"
            generate_crossword_pdf(
                title,
                words,
                clues,
                pdf_path,
                subtitle=subtitle,
                difficulty_note=difficulty_note,
                show_word_bank=show_word_bank,
                scripture_versions=[version],
            )
        else:
            refs, verses, key = _build_match_game_from_inputs(
                refs,
                version,
                game_items,
                allow_fetch=True,
                use_meaning=game_type == "match-meaning",
                difficulty=difficulty,
            )
            if not refs:
                flash("Could not create this game yet.", "warning")
                return redirect(url_for("games_create"))
            directions_text, show_version = _match_render_options(game_type)
            if not theme:
                theme = _derive_theme(game_type, refs, verses, [])
            subtitle = f"Theme: {theme}" if theme else None
            difficulty_note = "Difficulty: Simple uses shorter text. Standard uses full text."
            generate_match_game_pdf(
                title,
                refs,
                verses,
                key,
                pdf_path,
                directions_text=directions_text,
                show_version=show_version,
                subtitle=subtitle,
                difficulty_note=difficulty_note,
            )
        _update_usage(email, 1)
        return send_file(pdf_path, as_attachment=True, download_name=os.path.basename(pdf_path), conditional=True)
    except Exception as exc:
        try:
            current_app.logger.exception("Game create failed: %s", exc)
        except Exception:
            pass
        flash("Could not create this game yet.", "warning")
        return redirect(url_for("games_create"))


def games_words():
    if not _is_public_games_enabled() and not google.authorized:
        return jsonify({"error": "unauthorized"}), 401


    payload = request.get_json(silent=True) or {}
    refs_raw = (payload.get("refs") or "").replace("\\r\\n", "\n").replace("\\n", "\n").replace("\r\n", "\n").replace("\r", "\n")
    if len(refs_raw) > MAX_GAMES_WORDS_REFS_LEN:
        return jsonify({"error": "Please shorten the reference list and try again."}), 400
    rate_key = session.get("user_email") or get_client_ip()
    user_limit = check_rate_limit("games_words:user", rate_key, limit=30, window_seconds=60 * 60)
    ip_limit = check_rate_limit("games_words:ip", get_client_ip(), limit=90, window_seconds=60 * 60)
    if not user_limit.allowed or not ip_limit.allowed:
        return jsonify({"error": "Please wait a bit before building another word list."}), 429
    version = (payload.get("version") or "web").strip().lower()
    difficulty = _normalize_difficulty(payload.get("difficulty") or "standard")
    refs = [r.strip() for r in re.split(r"[\n,]+", refs_raw) if r.strip()]
    if not refs:
        return jsonify({"words": []}), 200
    words = _build_word_search_words_from_inputs(refs, version, [], difficulty)
    try:
        current_app.logger.info(
            "games_words refs=%s words=%s version=%s difficulty=%s",
            len(refs),
            len(words),
            version,
            difficulty,
        )
    except Exception:
        pass
    return jsonify({"words": words}), 200


def dl_game(slug):
    if not db:
        return "Firestore not configured", 500
    d = db.collection("collections").document(slug).get()
    if not d.exists:
        return "Not found", 404
    meta = d.to_dict() or {}
    if (meta.get("kind") or "bundle") != "game":
        return "Not found", 404

    if not google.authorized:
        flash("Please sign in to download games.", "warning")
        return redirect(url_for("google.login", next=request.url))

    allowed = not bool(meta.get("isSubscriberOnly"))
    email = session.get("user_email")
    if db and email:
        try:
            u = db.collection("users").document(email).get()
            if u.exists:
                ud = u.to_dict() or {}
                if ud.get("isPro") or (ud.get("plan") in ("family", "classroom", "plus", "plus_family", "plus_classroom")):
                    allowed = True
                purchases = ud.get("purchases") or {}
                if purchases.get(slug):
                    allowed = True
        except Exception:
            pass

    if meta.get("isSubscriberOnly") and not allowed:
        flash("This game is included with Membership.", "info")
        return redirect(url_for("games_detail", slug=slug))

    plan = _get_user_plan(email)
    m_limit, l_limit = _quota_for_plan(plan)
    used_life, used_m = _get_usage(email)
    if (m_limit is not None and used_m >= m_limit) or (l_limit is not None and used_life >= l_limit):
        flash("You’ve used all your credits for this month.", "warning")
        return redirect(url_for("games_detail", slug=slug))

    try:
        db.collection("analytics").document("games").set({slug: firestore.Increment(1)}, merge=True)
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        db.collection("analytics_daily").document(f"games_{today}").set({slug: firestore.Increment(1)}, merge=True)
    except Exception:
        pass

    try:
        gcs_signed = signed_url_for_path(f"games/{slug}.zip", minutes=120)
        if gcs_signed:
            _update_usage(email, 1)
            return redirect(gcs_signed)
    except Exception:
        pass

    url = meta.get("zipUrl")
    if url:
        _update_usage(email, 1)
        return redirect(url)

    path = os.path.join("output", "games", f"{slug}.zip")
    if os.path.exists(path):
        _update_usage(email, 1)
        return send_file(path, as_attachment=True, download_name=os.path.basename(path), conditional=True)

    # Build a fresh PDF if no ZIP exists yet
    pdf_dir = os.path.join("output", "games")
    os.makedirs(pdf_dir, exist_ok=True)
    version = (request.args.get("version") or meta.get("defaultVersion") or "nlt").lower()
    pdf_path = os.path.join(pdf_dir, f"{slug}-{version}.pdf")
    try:
        game_type = (meta.get("gameType") or "match").strip().lower()
        title = meta.get("title") or _default_game_title(game_type)
        theme = (meta.get("theme") or "").strip()
        difficulty = _normalize_difficulty(meta.get("difficulty") or "standard")
        if game_type == "word-search":
            words = _build_word_search_words(meta, version, difficulty)
            if not theme:
                theme = _derive_theme(game_type, meta.get("verses") or [], [], words)
            subtitle = f"Theme: {theme}" if theme else None
            difficulty_note = "Word list: Simple uses 8 words. Standard uses 12 words. Hard hides the word list."
            show_word_list = difficulty != "hard"
            generate_word_search_pdf(
                title,
                words,
                pdf_path,
                subtitle=subtitle,
                difficulty_note=difficulty_note,
                show_word_list=show_word_list,
                scripture_versions=[version],
            )
        elif game_type == "crossword":
            words = _build_word_search_words(meta, version, difficulty)
            limit = 6 if difficulty == "simple" else 10
            words = words[:limit]
            if not theme:
                theme = _derive_theme(game_type, meta.get("verses") or [], [], words)
            subtitle = f"Theme: {theme}" if theme else None
            clues = _build_crossword_clues(words, theme)
            difficulty_note = "Word list: Simple uses 6 words. Standard uses 10 words. Hard hides the word bank."
            show_word_bank = difficulty != "hard"
            generate_crossword_pdf(
                title,
                words,
                clues,
                pdf_path,
                subtitle=subtitle,
                difficulty_note=difficulty_note,
                show_word_bank=show_word_bank,
                scripture_versions=[version],
            )
        else:
            refs, verses, key = _build_match_game_items(
                meta,
                version,
                allow_fetch=True,
                use_meaning=game_type == "match-meaning",
                difficulty=difficulty,
            )
            if not refs:
                return "Game not available", 404
            directions_text, show_version = _match_render_options(game_type)
            if not theme:
                theme = _derive_theme(game_type, refs, verses, [])
            subtitle = f"Theme: {theme}" if theme else None
            difficulty_note = "Difficulty: Simple uses shorter text. Standard uses full text."
            generate_match_game_pdf(
                title,
                refs,
                verses,
                key,
                pdf_path,
                directions_text=directions_text,
                show_version=show_version,
                subtitle=subtitle,
                difficulty_note=difficulty_note,
            )
        _update_usage(email, 1)
        return send_file(pdf_path, as_attachment=True, download_name=os.path.basename(pdf_path), conditional=True)
    except Exception:
        return "Game not available", 404


def _build_match_game_items(
    meta,
    version: str,
    allow_fetch: bool = True,
    use_meaning: bool = False,
    difficulty: str = "standard",
):
    base_refs = list(meta.get("verses") or [])
    version = (version or meta.get("defaultVersion") or "nlt").lower()
    refs = base_refs[:8]
    verses = []
    game_items = meta.get("gameItems") or []
    if game_items:
        refs = []
        for item in game_items[:8]:
            ref = (item.get("reference") or "").strip()
            text = (item.get("text") or "").strip()
            v = (item.get("version") or version).strip().lower() or version
            if not ref or not text:
                continue
            refs.append(ref)
            verses.append(MatchItem(text=text, version=v))
        if refs:
            order = list(range(len(verses)))
            rng = random.Random(meta.get("slug") or "")
            rng.shuffle(order)
            shuffled = [verses[i] for i in order]
            answer_key = [order.index(i) + 1 for i in range(len(verses))]
            return refs, shuffled, answer_key
        refs = base_refs[:8]
    if not allow_fetch:
        return [], [], []
    for ref in refs:
        text = "Verse text unavailable."
        try:
            content = request_verse_data(ref, version)
            data = parse_and_clean_json(content)
            full_verse = (data.get("fullVerse") or "").strip()
            if use_meaning:
                meaning = ""
                try:
                    if difficulty == "simple":
                        meaning_content = request_verse_meaning(ref, full_verse, version, min_words=4, max_words=6)
                    else:
                        meaning_content = request_verse_meaning(ref, full_verse, version)
                    meaning_data = parse_and_clean_json(meaning_content)
                    meaning = (meaning_data.get("meaning") or "").strip()
                except Exception:
                    meaning = ""
                text = meaning or "Meaning unavailable."
            else:
                if difficulty == "simple":
                    text = (data.get("traceableVerse") or full_verse or text).strip()
                else:
                    text = full_verse or text
        except Exception:
            pass
        verses.append(MatchItem(text=text, version=version))

    rng = random.Random(meta.get("slug") or "")
    order = list(range(len(verses)))
    rng.shuffle(order)
    shuffled = [verses[i] for i in order]
    answer_key = [order.index(i) + 1 for i in range(len(verses))]
    return refs, shuffled, answer_key


def _build_match_game_from_inputs(
    refs,
    version,
    game_items,
    allow_fetch: bool = True,
    use_meaning: bool = False,
    difficulty: str = "standard",
):
    refs = list(refs or [])[:8]
    version = (version or "nlt").lower()
    verses = []
    if game_items:
        refs = []
        for item in game_items[:8]:
            ref = (item.get("reference") or "").strip()
            text = (item.get("text") or "").strip()
            v = (item.get("version") or version).strip().lower() or version
            if not ref or not text:
                continue
            refs.append(ref)
            verses.append(MatchItem(text=text, version=v))
        if refs:
            order = list(range(len(verses)))
            rng = random.Random("custom-game")
            rng.shuffle(order)
            shuffled = [verses[i] for i in order]
            answer_key = [order.index(i) + 1 for i in range(len(verses))]
            return refs, shuffled, answer_key
    if not allow_fetch:
        return [], [], []

    for ref in refs:
        text = "Verse text unavailable."
        try:
            content = request_verse_data(ref, version)
            data = parse_and_clean_json(content)
            full_verse = (data.get("fullVerse") or "").strip()
            if use_meaning:
                meaning = ""
                try:
                    if difficulty == "simple":
                        meaning_content = request_verse_meaning(ref, full_verse, version, min_words=4, max_words=6)
                    else:
                        meaning_content = request_verse_meaning(ref, full_verse, version)
                    meaning_data = parse_and_clean_json(meaning_content)
                    meaning = (meaning_data.get("meaning") or "").strip()
                except Exception:
                    meaning = ""
                text = meaning or "Meaning unavailable."
            else:
                if difficulty == "simple":
                    text = (data.get("traceableVerse") or full_verse or text).strip()
                else:
                    text = full_verse or text
        except Exception:
            pass
        verses.append(MatchItem(text=text, version=version))

    order = list(range(len(verses)))
    rng = random.Random("custom-game")
    rng.shuffle(order)
    shuffled = [verses[i] for i in order]
    answer_key = [order.index(i) + 1 for i in range(len(verses))]
    return refs, shuffled, answer_key


_STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "your", "you", "from", "into",
    "will", "shall", "lord", "god", "his", "her", "him", "their", "they",
    "them", "are", "was", "were", "who", "whom", "what", "when", "where",
    "why", "how", "but", "not", "all", "any", "our", "out", "over", "under",
    "have", "has", "had", "let", "may", "can", "one", "two", "three", "four",
}


def _extract_words(text: str, limit: int = 12) -> list[str]:
    words = []
    for raw in re.findall(r"[A-Za-z]{4,}", text or ""):
        w = raw.lower()
        if w in _STOPWORDS:
            continue
        if w not in words:
            words.append(w)
        if len(words) >= limit:
            break
    return [w.upper() for w in words]


def _unique_words(words: list[str]) -> list[str]:
    seen = set()
    ordered = []
    for word in words:
        w = (word or "").strip().upper()
        if not w or w in seen:
            continue
        seen.add(w)
        ordered.append(w)
    return ordered


def _build_crossword_clues(words: list[str], theme: str | None) -> list[str]:
    if not words:
        return []
    clue_bank = CROSSWORD_FALLBACK_CLUES
    def _fallback(word: str) -> str:
        clean = (word or "").strip().upper()
        if not clean:
            return "Word in this puzzle"
        if clean in clue_bank:
            return clue_bank[clean]
        return f"{len(clean)} letters, starts with {clean[0]}"
    return [_fallback(w) for w in words]


def _build_word_search_words(meta, version: str, difficulty: str = "standard") -> list[str]:
    version = (version or meta.get("defaultVersion") or "nlt").lower()
    game_words = [w.strip() for w in (meta.get("gameWords") or []) if w.strip()]
    limit = 8 if difficulty == "simple" else 12
    if game_words:
        return _unique_words([w.upper() for w in game_words])[:limit]

    refs = list(meta.get("verses") or [])[:6]
    words = []
    for ref in refs:
        try:
            content = request_verse_data(ref, version)
            data = parse_and_clean_json(content)
            full = (data.get("fullVerse") or "").strip()
            words.extend(_extract_words(full, limit=12))
        except Exception:
            pass
        if len(words) >= limit:
            break
    if not words:
        for ref in refs:
            book = ref.split()[0]
            if book and book.upper() not in words:
                words.append(book.upper())
            if len(words) >= 8:
                break
    return _unique_words(words)[:limit]


def _build_word_search_words_from_inputs(refs, version, game_words, difficulty: str = "standard"):
    limit = 8 if difficulty == "simple" else 12
    if game_words:
        return _unique_words([w.upper() for w in game_words])[:limit]
    refs = list(refs or [])[:6]
    version = (version or "nlt").lower()
    words = []
    for ref in refs:
        try:
            content = request_verse_data(ref, version)
            data = parse_and_clean_json(content)
            full = (data.get("fullVerse") or "").strip()
            words.extend(_extract_words(full, limit=12))
        except Exception:
            pass
        if len(words) >= limit:
            break
    if words:
        return _unique_words(words)[:limit]
    return _unique_words([w.upper() for w in refs[:8]])[:limit]
