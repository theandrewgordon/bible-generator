import hmac
import json
import os
import secrets
from pathlib import Path

from flask import Blueprint, jsonify, make_response, render_template, redirect, request, session, send_file

from faithsparks.services.firestore import db

bp = Blueprint("lab_games", __name__, url_prefix="/labs/games")

_GAME_DIR = Path(__file__).resolve().parents[1] / "content" / "lab_games"

_SHARED_ASSETS = {"odyssey-core.js", "odyssey-ui.css"}

LAB_GAMES = (
    {
        "slug": "whits-end",
        "game_id": "whits-end",
        "aliases": ("whits-end-ice-cream",),
        "name": "Whit's End Ice Cream Shop",
        "description": "Take customer orders at Whit's End, make ice cream, shakes, and sodas, and deliver each order to the right customer.",
        "icon": "🍨",
        "accent": "#d66b8a",
        "maturity": "sandbox",
        "file": "whits-end-ice-cream.html",
        "available": True,
    },
    {
        "slug": "bernard-window-washing",
        "game_id": "bernard-window-washing",
        "aliases": (),
        "name": "Bernard's Window Washing",
        "description": "Wash Whit's End windows with the right cleaner and squeegee as new messes and tools unlock.",
        "icon": "✨",
        "accent": "#4f9bb5",
        "maturity": "sandbox",
        "file": "bernard-window-washing.html",
        "available": True,
    },
    {
        "slug": "wooten-mail-route",
        "game_id": "wooten-mail-sorting",
        "aliases": ("mail-sorting",),
        "name": "Wooten's Mail Route",
        "description": "Sort Odyssey mail, then unlock delivery routes that rotate with sorting levels.",
        "icon": "✉️",
        "accent": "#d28a35",
        "maturity": "sandbox",
        "file": "wooten-mail-route.html",
        "available": True,
    },
    {
        "slug": "timothy-center-horse-racing",
        "game_id": "timothy-center-horse-racing",
        "aliases": (),
        "name": "Timothy Center Horse Racing",
        "description": "Choose a horse and race through increasingly challenging Timothy Center courses.",
        "icon": "🐴",
        "accent": "#6b8f52",
        "maturity": "sandbox",
        "file": "timothy-center-horse-racing.html",
        "available": True,
    },
)


def _signed_in_email() -> str | None:
    return (session.get("user_email") or "").strip().casefold() or None


def _beta_allowlist() -> set[str]:
    return {
        item.strip().casefold()
        for item in os.getenv("LAB_GAMES_BETA_EMAILS", "").split(",")
        if item.strip()
    }


def _has_beta_access(email: str | None) -> bool:
    allowlist = _beta_allowlist()
    return not allowlist or bool(email and email in allowlist)


def _access_denied():
    return (
        render_template(
            "lab_games.html",
            games=LAB_GAMES,
            signed_in=True,
            access_denied=True,
            noindex=True,
        ),
        403,
    )


def _require_access():
    email = _signed_in_email()
    if not email:
        return redirect(f"/login/google/start?next={request.path}")
    if not _has_beta_access(email):
        return _access_denied()
    return None


def _game_for_slug(slug: str) -> dict | None:
    for game in LAB_GAMES:
        if slug == game["slug"] or slug in game.get("aliases", ()):
            return game
    return None


def _apply_runtime_game_patches(html: str, game_id: str) -> str:
    """Apply small hot-path fixes without rewriting multi-megabyte embedded builds."""
    if game_id != "bernard-window-washing":
        return html

    # Bernard already has a 1.5 second completion beat and nextLevel() timer.
    # The results overlay added later interrupts that flow, so let the existing
    # timer carry the player straight into the next window.
    html = html.replace(
        "    showResultsScreen();\n",
        "    // Results are recorded above; gameplay auto-advances after the completion beat.\n",
        1,
    )

    # Pointer input is already coalesced to one requestAnimationFrame. Tighten
    # the amount of cleaning work in each frame so rapid iPad/mouse movement
    # cannot build a long main-thread task on later levels.
    html = html.replace(
        "const step = activeTool.cleaner ? .38 : .32;",
        "const step = activeTool.cleaner ? .52 : .46;",
        1,
    )
    html = html.replace(
        "const count = min(10, max(1, Math.ceil(dist / step)));",
        "const count = 1; // one cleaning sample per animation frame; visual pointer still tracks every event",
        1,
    )

    # Retina-sized backing canvases are unnecessarily expensive for this
    # hand-drawn game. A modest cap keeps the art crisp while substantially
    # reducing per-frame pixel work on iPad.
    html = html.replace(
        "    cameraScale = 40;\n    canvasClearColor",
        "    cameraScale = 40;\n    canvasPixelRatio = Math.min(devicePixelRatio || 1, 1.25);\n    canvasClearColor",
        1,
    )

    # Level 3 unlocks a second cleaner. Keep all cleaner layers logically so
    # wiping/accuracy rules remain unchanged, but render only the strongest
    # visible layer for each glass cell. This bounds wet-layer draw calls to
    # one per cell instead of multiplying them by every unlocked cleaner.
    wet_start = html.find("    // Wet cleaner layers — multiple cleaners can overlap on one spot.")
    wet_end = html.find(
        "    // ================================================================\n    // SILL",
        wet_start,
    )
    if wet_start >= 0 and wet_end > wet_start:
        wet_render = """    // Wet cleaner layers — keep full-resolution game state, but merge visible
    // cells into horizontal bands before drawing. Level 3 can have 400+ wet
    // cells; drawing every one individually was collapsing the game to ~2 FPS.
    const wetBands = new Map();

    for (const w of wetness)
    {
        if (!w.layers)
            continue;

        let cleanerId = '';
        let amount = 0;

        for (const id in w.layers)
        {
            const layerAmount = w.layers[id];
            if (layerAmount > amount)
            {
                amount = layerAmount;
                cleanerId = id;
            }
        }

        if (!cleanerId || amount <= .05)
            continue;

        const row = Math.round(w.pos.y / max(.001, cell.y));
        const key = row + ':' + cleanerId;
        let band = wetBands.get(key);

        if (!band)
        {
            band = {cleanerId,y:w.pos.y,minX:w.pos.x,maxX:w.pos.x,amount};
            wetBands.set(key, band);
        }
        else
        {
            band.minX = min(band.minX, w.pos.x);
            band.maxX = max(band.maxX, w.pos.x);
            band.amount = max(band.amount, amount);
        }
    }

    for (const band of wetBands.values())
    {
        let hue = .56;
        if (band.cleanerId == 'soap') hue = .52;
        else if (band.cleanerId == 'degreaser') hue = .12;
        else if (band.cleanerId == 'vinegar') hue = .90;
        else if (band.cleanerId == 'bernard') hue = .78;

        const a = band.cleanerId == 'water'
            ? (.18 + .20*band.amount)
            : (.13 + .17*band.amount);

        drawRect(
            vec2((band.minX + band.maxX)/2, band.y),
            vec2((band.maxX - band.minX) + cell.x*1.15, cell.y*1.12),
            band.cleanerId == 'water'
                ? hsl(.56,.76,.70,a)
                : hsl(hue,.64,.70,a)
        );
    }

"""
        html = html[:wet_start] + wet_render + html[wet_end:]

    # Temporary in-game profiler for the level-3 slowdown. It measures the
    # expensive cleaning function separately from total frame rate.
    profiler = r"""
<script id="bernard-perf-profiler">
(() => {
    const state = {frames:0,last:performance.now(),fps:0,cleanMs:0,cleanCalls:0,cleanMax:0};
    const badge = document.createElement("div");
    badge.id = "bernardPerfBadge";
    badge.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:999999;pointer-events:none;padding:5px 7px;border-radius:7px;background:rgba(0,0,0,.72);color:#bfffc7;font:12px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre;display:none";
    document.body.appendChild(badge);
    try {
        if (typeof directMoveActiveTool === "function") {
            const originalDirectMoveActiveTool = directMoveActiveTool;
            directMoveActiveTool = function(...args) {
                const start = performance.now();
                try { return originalDirectMoveActiveTool.apply(this,args); }
                finally {
                    const ms = performance.now() - start;
                    state.cleanMs += ms; state.cleanCalls++; state.cleanMax = Math.max(state.cleanMax, ms);
                }
            };
        }
    } catch (error) { console.warn("[Bernard perf] cleaner wrap failed", error); }
    const countOf = value => Array.isArray(value) ? value.length : -1;
    function sampleCounts() {
        const counts = {wet:-1,dirt:-1,streak:-1};
        try { if (typeof wetness !== "undefined") counts.wet=countOf(wetness); } catch (_) {}
        try { if (typeof dirtSpots !== "undefined") counts.dirt=countOf(dirtSpots); } catch (_) {}
        try { if (typeof streaks !== "undefined") counts.streak=countOf(streaks); } catch (_) {}
        return counts;
    }
    function tick(now) {
        state.frames++;
        const elapsed = now - state.last;
        if (elapsed >= 1000) {
            state.fps = Math.round(state.frames * 1000 / elapsed);
            const avg = state.cleanCalls ? state.cleanMs / state.cleanCalls : 0;
            const counts = sampleCounts();
            let currentLevel = 0;
            try { currentLevel = Number(level || 0); } catch (_) {}
            if (currentLevel >= 3) {
                badge.style.display = "block";
                badge.textContent = "PERF L"+currentLevel+"  FPS "+state.fps+"\nclean "+avg.toFixed(1)+"ms avg / "+state.cleanMax.toFixed(1)+" max  calls "+state.cleanCalls+"\nwet "+counts.wet+"  dirt "+counts.dirt+"  streak "+counts.streak;
                console.info("[Bernard perf]", {level:currentLevel,fps:state.fps,cleanAvgMs:+avg.toFixed(2),cleanMaxMs:+state.cleanMax.toFixed(2),cleanCalls:state.cleanCalls,wet:counts.wet,dirt:counts.dirt,streak:counts.streak});
            } else badge.style.display = "none";
            state.frames=0; state.last=now; state.cleanMs=0; state.cleanCalls=0; state.cleanMax=0;
        }
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
})();
</script>
<script id="bernard-audio-polish">
(() => {
    let activeWashLoop = null;

    function audioReady()
    {
        try { return soundEffectsEnabled !== false && ensureWindowWashAudio(); }
        catch (_) { return null; }
    }

    function makeNoiseSource(ctx)
    {
        const src = ctx.createBufferSource();
        src.buffer = wwNoiseBuffer;
        return src;
    }

    function shortNoise(ctx, when, duration, gainValue, lowpassHz, highpassHz=0)
    {
        const src = makeNoiseSource(ctx);
        const gain = ctx.createGain();
        const low = ctx.createBiquadFilter();
        low.type = 'lowpass';
        low.frequency.setValueAtTime(lowpassHz, when);
        let tail = low;

        if (highpassHz > 0)
        {
            const high = ctx.createBiquadFilter();
            high.type = 'highpass';
            high.frequency.setValueAtTime(highpassHz, when);
            low.connect(high);
            tail = high;
        }

        gain.gain.setValueAtTime(.0001, when);
        gain.gain.exponentialRampToValueAtTime(gainValue, when+.008);
        gain.gain.exponentialRampToValueAtTime(.0001, when+duration);
        src.connect(low);
        tail.connect(gain);
        gain.connect(ctx.destination);
        src.start(when);
        src.stop(when+duration+.03);
    }

    // Cleaner bottle: soft trigger click + airy liquid spray instead of a beep.
    playSpraySound = function(kind='water')
    {
        const ctx = audioReady();
        if (!ctx) return;

        try
        {
            const t = ctx.currentTime;
            const tone = kind === 'degreaser' ? 760 :
                         kind === 'vinegar' ? 860 :
                         kind === 'soap' ? 690 : 810;

            const click = ctx.createOscillator();
            const clickGain = ctx.createGain();
            click.type = 'sine';
            click.frequency.setValueAtTime(tone, t);
            click.frequency.exponentialRampToValueAtTime(240, t+.045);
            clickGain.gain.setValueAtTime(.038, t);
            clickGain.gain.exponentialRampToValueAtTime(.0001, t+.055);
            click.connect(clickGain);
            clickGain.connect(ctx.destination);
            click.start(t);
            click.stop(t+.06);

            shortNoise(ctx,t+.012,.19,.060,5200,700);
        }
        catch (_) {}
    };

    // Squeegee/cloth drag: soft rubber-on-glass hiss, not a musical tone.
    startWindowWashToolSound = function()
    {
        stopWindowWashToolSound();
        const ctx = audioReady();
        if (!ctx) return;

        try
        {
            const src = makeNoiseSource(ctx);
            const band = ctx.createBiquadFilter();
            const gain = ctx.createGain();
            band.type = 'bandpass';
            band.frequency.value = 1050;
            band.Q.value = .65;
            gain.gain.value = .022;
            src.loop = true;
            src.connect(band);
            band.connect(gain);
            gain.connect(ctx.destination);
            src.start();
            activeWashLoop = {src,gain,ctx};
        }
        catch (_) { activeWashLoop = null; }
    };

    stopWindowWashToolSound = function()
    {
        const loop = activeWashLoop;
        activeWashLoop = null;
        if (!loop) return;

        try
        {
            const t = loop.ctx.currentTime;
            loop.gain.gain.cancelScheduledValues(t);
            loop.gain.gain.setValueAtTime(Math.max(.0001, loop.gain.gain.value || .02), t);
            loop.gain.gain.exponentialRampToValueAtTime(.0001, t+.05);
            loop.src.stop(t+.06);
        }
        catch (_) {}
    };

    // Finished window: short glassy sparkle instead of an arcade chirp.
    playWindowWashSuccessSound = function()
    {
        const ctx = audioReady();
        if (!ctx) return;

        try
        {
            const t = ctx.currentTime;
            const notes = [659.25,987.77,1318.51];

            notes.forEach((frequency,index) =>
            {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = index === 2 ? 'sine' : 'triangle';
                osc.frequency.setValueAtTime(frequency,t+index*.085);
                gain.gain.setValueAtTime(.0001,t+index*.085);
                gain.gain.exponentialRampToValueAtTime(.032,t+index*.085+.01);
                gain.gain.exponentialRampToValueAtTime(.0001,t+index*.085+.34);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(t+index*.085);
                osc.stop(t+index*.085+.36);
            });

            shortNoise(ctx,t+.20,.09,.012,7600,2600);
        }
        catch (_) {}
    };
})();
</script>
"""
    html = html.replace("</body>", profiler + "</body>", 1)

    return html


def _csrf_token_value() -> str:
    token = str(session.get("_csrf_token") or "")
    if not token:
        token = secrets.token_urlsafe(32)
        session["_csrf_token"] = token
    return token


def _default_odyssey_roster() -> dict:
    return {
        "version": 1,
        "players": [],
        "activePlayerId": "",
        "settings": {"sound": True, "music": True},
    }


def _sanitize_odyssey_roster(payload: object) -> dict:
    source = payload if isinstance(payload, dict) else {}
    players = []
    seen_ids: set[str] = set()
    seen_names: set[str] = set()

    for raw in source.get("players") or []:
        if not isinstance(raw, dict) or len(players) >= 8:
            continue
        name = " ".join(str(raw.get("name") or "").split()).strip()[:20]
        player_id = str(raw.get("id") or "").strip()[:80]
        if not name or not player_id:
            continue
        name_key = name.casefold()
        if player_id in seen_ids or name_key in seen_names:
            continue
        seen_ids.add(player_id)
        seen_names.add(name_key)
        players.append(
            {
                "id": player_id,
                "name": name,
                "avatar": str(raw.get("avatar") or "star").strip()[:32],
                "createdAt": max(0, int(raw.get("createdAt") or 0)),
            }
        )

    settings_raw = source.get("settings") if isinstance(source.get("settings"), dict) else {}
    active_id = str(source.get("activePlayerId") or "").strip()[:80]
    if active_id and active_id not in seen_ids:
        active_id = ""

    return {
        "version": 1,
        "players": players,
        "activePlayerId": active_id,
        "settings": {
            "sound": settings_raw.get("sound") is not False,
            "music": settings_raw.get("music") is not False,
        },
    }


def _load_odyssey_roster(email: str | None) -> dict:
    if not email or not db:
        return _default_odyssey_roster()
    try:
        snap = db.collection("users").document(email).get()
        if not snap.exists:
            return _default_odyssey_roster()
        data = snap.to_dict() or {}
        return _sanitize_odyssey_roster(data.get("odysseyRoster"))
    except Exception:
        return _default_odyssey_roster()


def _merge_odyssey_rosters(existing: dict, incoming: dict) -> dict:
    base = _sanitize_odyssey_roster(existing)
    new = _sanitize_odyssey_roster(incoming)
    by_id = {p["id"]: dict(p) for p in base["players"]}
    name_to_id = {p["name"].casefold(): p["id"] for p in base["players"]}

    for player in new["players"]:
        match_id = player["id"]
        if match_id not in by_id:
            match_id = name_to_id.get(player["name"].casefold(), match_id)
        if match_id in by_id:
            merged = dict(by_id[match_id])
            merged.update(player)
            merged["id"] = match_id
            by_id[match_id] = merged
        elif len(by_id) < 8:
            by_id[player["id"]] = dict(player)
            name_to_id[player["name"].casefold()] = player["id"]

    players = list(by_id.values())[:8]
    ids = {p["id"] for p in players}
    active_id = new["activePlayerId"] if new["activePlayerId"] in ids else base["activePlayerId"]
    if active_id not in ids:
        active_id = ""

    return {
        "version": 1,
        "players": players,
        "activePlayerId": active_id,
        "settings": {**base["settings"], **new["settings"]},
    }


def _odyssey_bootstrap(email: str | None) -> tuple[dict, dict]:
    roster = _load_odyssey_roster(email)
    config = {
        "url": "/labs/games/roster",
        "csrfToken": _csrf_token_value(),
    }
    return roster, config


@bp.get("")
@bp.get("/")
def index():
    access_response = _require_access()
    if access_response is not None:
        return access_response
    roster, sync_config = _odyssey_bootstrap(_signed_in_email())
    return render_template(
        "lab_games.html",
        games=LAB_GAMES,
        signed_in=True,
        access_denied=False,
        noindex=True,
        odyssey_roster=roster,
        odyssey_sync_config=sync_config,
    )


@bp.get("/assets/<filename>")
def asset(filename: str):
    access_response = _require_access()
    if access_response is not None:
        return access_response

    if filename not in _SHARED_ASSETS:
        return render_template("404.html"), 404

    asset_path = _GAME_DIR / filename
    if not asset_path.is_file():
        return render_template("404.html"), 404

    mimetype = "text/javascript" if filename.endswith(".js") else "text/css"
    response = send_file(asset_path, mimetype=mimetype)
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive, nosnippet"
    return response


@bp.route("/roster", methods=["GET", "PUT"])
def roster():
    access_response = _require_access()
    if access_response is not None:
        return access_response

    email = _signed_in_email()
    if request.method == "GET":
        return jsonify(_load_odyssey_roster(email))

    sent_token = request.headers.get("X-CSRF-Token") or request.headers.get("X-CSRFToken") or ""
    expected_token = _csrf_token_value()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400

    incoming = _sanitize_odyssey_roster(request.get_json(silent=True) or {})
    existing = _load_odyssey_roster(email)
    merged = _merge_odyssey_rosters(existing, incoming)

    if not db or not email:
        return jsonify(merged)

    try:
        db.collection("users").document(email).set({"odysseyRoster": merged}, merge=True)
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503

    return jsonify(merged)


@bp.get("/<slug>")
def play(slug: str):
    access_response = _require_access()
    if access_response is not None:
        return access_response

    game = _game_for_slug(slug)
    if not game:
        return render_template("404.html"), 404

    game_path = _GAME_DIR / game["file"]
    if not game_path.is_file():
        return render_template("404.html"), 404

    roster, sync_config = _odyssey_bootstrap(_signed_in_email())
    html = game_path.read_text(encoding="utf-8")
    html = _apply_runtime_game_patches(html, game["game_id"])
    bootstrap = (
        "<script>"
        "window.__ODYSSEY_ACCOUNT_ROSTER__=" + json.dumps(roster).replace("<", "\\u003c") + ";"
        "window.__ODYSSEY_SYNC_CONFIG__=" + json.dumps(sync_config).replace("<", "\\u003c") + ";"
        "</script>"
    )
    if "</head>" in html:
        html = html.replace("</head>", bootstrap + "</head>", 1)
    else:
        html = bootstrap + html

    response = make_response(html)
    response.mimetype = "text/html"
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive, nosnippet"
    return response
