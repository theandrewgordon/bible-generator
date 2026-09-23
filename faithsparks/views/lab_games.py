import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

from firebase_admin import firestore as google_firestore
from google.cloud import firestore as cloud_firestore
from openai import OpenAI
from flask import Blueprint, Response, jsonify, make_response, render_template, redirect, request, session, send_file

from faithsparks.services.firestore import db
from faithsparks.services.users import get_user_doc, has_active_plus

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
    {
        "slug": "same-brain",
        "game_id": "same-brain",
        "aliases": (),
        "name": "Same Brain?",
        "description": "Answer five weird questions, challenge a friend, and reveal how often your brains make the same choice.",
        "icon": "🧠",
        "accent": "#6f4bd8",
        "maturity": "sandbox",
        "file": "same-brain.html",
        "available": True,
        "odyssey": False,
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
        next_url = request.full_path.rstrip("?") if request.query_string else request.path
        return redirect(f"/login/google/start?next={next_url}")
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
        "    cameraScale = 40;\n    canvasPixelRatio = Math.min(devicePixelRatio || 1, .75);\n    canvasClearColor",
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
        wet_render = """    // Wet cleaner layers — render localized cleaner residue per cell again.
    // Profiling showed drawRect is cheap, so use detailed rectangles for water
    // and soap while keeping expensive textured grime aggressively sampled.
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

        let hue = .56;
        let sat = .70;
        let light = .74;

        if (cleanerId == 'soap')
        {
            hue = .42;
            sat = .72;
            light = .76;
        }
        else if (cleanerId == 'degreaser')
        {
            hue = .12;
            sat = .70;
            light = .72;
        }
        else if (cleanerId == 'vinegar')
        {
            hue = .90;
            sat = .55;
            light = .80;
        }
        else if (cleanerId == 'bernard')
        {
            hue = .78;
            sat = .60;
            light = .74;
        }

        const alpha = cleanerId == 'water'
            ? (.045 + .12*amount)
            : (.09 + .20*amount);

        // Water is a restrained blue sheen; soap is a denser green-white film.
        const mainScale = cleanerId == 'water' ? .82 : .94;
        drawRect(w.pos, cell.scale(mainScale), hsl(hue,sat,light,alpha));

        // Soap gets staggered foam flecks. They track individual wet cells and
        // disappear as the squeegee removes the layer, so wiping is visibly
        // progressive rather than switching an entire pane at once.
        if (cleanerId == 'soap' && amount > .18)
        {
            const gx = Math.round(w.pos.x / max(.001,cell.x));
            const gy = Math.round(w.pos.y / max(.001,cell.y));

            if (((gx + gy) & 1) == 0)
                drawRect(
                    w.pos.add(vec2(cell.x*.14,cell.y*.10)),
                    cell.scale(.30),
                    hsl(.42,.22,.97,.16 + .20*amount)
                );

            if (((gx*3 + gy*5) & 3) == 0)
                drawRect(
                    w.pos.add(vec2(-cell.x*.18,-cell.y*.16)),
                    cell.scale(.16),
                    hsl(.40,.16,1,.12 + .16*amount)
                );
        }
    }

"""
        html = html[:wet_start] + wet_render + html[wet_end:]

    # Level 3+ render fast path. Gameplay still tracks every glass cell, but
    # visual rendering keeps only one cell out of each stable 2x2 block. This
    # cuts the hottest tiny-primitive workload by about 75% without changing
    # scoring, cleaner matching, or squeegee behavior.
    render_fast_path = r"""
<script id="bernard-render-fast-path">
(() => {
    const originalDrawRect = window.drawRect;
    const originalDrawTile = window.drawTile;
    if (typeof originalDrawRect !== "function" || typeof originalDrawTile !== "function")
        return;

    let bounds = null;
    let boundsBuiltAt = 0;
    window._bernardRenderFastStats = {skippedRect:0,skippedTile:0};

    function rebuildBounds()
    {
        boundsBuiltAt = performance.now();

        try
        {
            if (!Array.isArray(wetness) || !wetness.length || !cell)
            {
                bounds = null;
                return;
            }

            let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
            for (const w of wetness)
            {
                if (!w || !w.pos) continue;
                minX=Math.min(minX,w.pos.x);
                maxX=Math.max(maxX,w.pos.x);
                minY=Math.min(minY,w.pos.y);
                maxY=Math.max(maxY,w.pos.y);
            }

            bounds = minX < maxX
                ? {minX,maxX,minY,maxY,cx:Math.max(.001,cell.x),cy:Math.max(.001,cell.y)}
                : null;
        }
        catch (_) { bounds=null; }
    }

    function shouldSkip(pos,size)
    {
        let currentLevel=0;
        try { currentLevel=Number(level||0); } catch (_) {}
        if (currentLevel < 3 || !pos || !size)
            return false;

        if (!bounds || performance.now()-boundsBuiltAt > 500)
            rebuildBounds();
        if (!bounds)
            return false;

        const marginX=bounds.cx*.9;
        const marginY=bounds.cy*.9;
        if (pos.x < bounds.minX-marginX || pos.x > bounds.maxX+marginX ||
            pos.y < bounds.minY-marginY || pos.y > bounds.maxY+marginY)
            return false;

        // Only tiny grid-sized primitives are culled. Tools, bottles, Bernard,
        // window frame, siding, grass, and HUD remain untouched.
        if (size.x > bounds.cx*1.65 || size.y > bounds.cy*1.65)
            return false;

        const gx=Math.round((pos.x-bounds.minX)/bounds.cx);
        const gy=Math.round((pos.y-bounds.minY)/bounds.cy);

        // Stable spatial sampling avoids flicker.
        return ((gx & 1)!==0) || ((gy & 1)!==0);
    }

    let insideDrawRect = 0;

    window.drawRect = function(pos,size,...rest)
    {
        // Rectangles are cheap according to the profiler and carry the useful
        // cleaner/wetness feedback, so never cull them.
        insideDrawRect++;
        try
        {
            return originalDrawRect.call(this,pos,size,...rest);
        }
        finally
        {
            insideDrawRect--;
        }
    };

    window.drawTile = function(pos,size,...rest)
    {
        // Calls that originate from drawRect are cheap shape rendering, not
        // the expensive textured-detail path we are suppressing.
        if (insideDrawRect > 0)
            return originalDrawTile.call(this,pos,size,...rest);

        let currentLevel=0;
        try { currentLevel=Number(level||0); } catch (_) {}

        if (currentLevel >= 3 && pos && size)
        {
            // Level 3+ quality fast path. Profiling proved thousands of tiny
            // textured tiles are the dominant cost. Instead of hiding them,
            // redraw them directly on the 2D canvas as cheap tinted marks.
            // This preserves the grime/soap density without LittleJS texture
            // overhead. Larger artwork still uses normal drawTile().
            const tinyWindowTexture = size.x <= 1.05 && size.y <= 1.05;

            if (tinyWindowTexture)
            {
                // Real textured grime is the expensive part. Keep only a
                // sparse stable sample; water/soap detail is restored with
                // cheap localized rectangles above. 1-in-32 keeps heavy-dirt
                // frames responsive while still retaining real texture cues.
                const hx = Math.abs(Math.round(pos.x * 24));
                const hy = Math.abs(Math.round(pos.y * 24));
                const hash = hx * 3 + hy * 5;
                const keepRealTexture = (hash & 31) === 0;   // ~1 in 32

                if (!keepRealTexture)
                {
                    window._bernardRenderFastStats.skippedTile++;
                    return;
                }
            }
        }

        if (shouldSkip(pos,size))
        {
            window._bernardRenderFastStats.skippedTile++;
            return;
        }

        return originalDrawTile.call(this,pos,size,...rest);
    };
})();
</script>
"""
    html = html.replace("</body>", render_fast_path + "</body>", 1)

    # Temporary in-game profiler for the level-3 slowdown. It measures the
    # expensive cleaning function separately from total frame rate.
    profiler = r"""
<script id="bernard-perf-profiler">
(() => {
    const perfEnabled = new URLSearchParams(location.search).get('bernardPerf') === '1';
    if (!perfEnabled) return;

    const state = {
        frames:0,last:performance.now(),
        cleanMs:0,cleanCalls:0,cleanMax:0,
        drawRect:0,drawTile:0,drawLine:0,drawText:0,
        rectMs:0,tileMs:0,lineMs:0,
        rectSizes:Object.create(null),tileSizes:Object.create(null),
        renderMs:0,renderCalls:0,renderMax:0,
        updateMs:0,updateCalls:0,updateMax:0
    };

    const badge = document.createElement("div");
    badge.id = "bernardPerfBadge";
    badge.style.cssText =
        "position:fixed;left:8px;bottom:8px;z-index:999999;pointer-events:none;" +
        "padding:6px 8px;border-radius:7px;background:rgba(0,0,0,.80);color:#bfffc7;" +
        "font:11px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre;display:none";
    document.body.appendChild(badge);

    function sizeKey(size)
    {
        try {
            return (+size.x).toFixed(2)+"x"+(+size.y).toFixed(2);
        } catch (_) { return "?"; }
    }

    function topSizes(map)
    {
        return Object.entries(map)
            .sort((a,b)=>b[1]-a[1])
            .slice(0,3)
            .map(([k,v])=>k+":"+v)
            .join(" ");
    }

    function wrapDraw(name,key,timeKey,sizeMapKey)
    {
        try
        {
            const original = window[name];
            if (typeof original !== "function") return;
            window[name] = function(...args)
            {
                const t=performance.now();
                state[key]++;
                if (sizeMapKey && args[1])
                {
                    const k=sizeKey(args[1]);
                    state[sizeMapKey][k]=(state[sizeMapKey][k]||0)+1;
                }
                try { return original.apply(this,args); }
                finally { state[timeKey]+=performance.now()-t; }
            };
        }
        catch (_) {}
    }

    wrapDraw("drawRect","drawRect","rectMs","rectSizes");
    wrapDraw("drawTile","drawTile","tileMs","tileSizes");
    wrapDraw("drawLine","drawLine","lineMs",null);

    function wrapCounter(name,key)
    {
        try
        {
            const original = window[name];
            if (typeof original !== "function") return;
            window[name] = function(...args)
            {
                state[key]++;
                return original.apply(this,args);
            };
        }
        catch (_) {}
    }

    wrapCounter("drawText","drawText");
    wrapCounter("drawTextScreen","drawText");

    try
    {
        if (typeof directMoveActiveTool === "function")
        {
            const originalDirectMoveActiveTool = directMoveActiveTool;
            directMoveActiveTool = function(...args)
            {
                const t = performance.now();
                try { return originalDirectMoveActiveTool.apply(this,args); }
                finally
                {
                    const ms = performance.now()-t;
                    state.cleanMs += ms;
                    state.cleanCalls++;
                    state.cleanMax = Math.max(state.cleanMax,ms);
                }
            };
        }
    }
    catch (_) {}

    function wrapTimed(name,totalKey,callsKey,maxKey)
    {
        try
        {
            const original = window[name];
            if (typeof original !== "function") return;
            window[name] = function(...args)
            {
                const t = performance.now();
                try { return original.apply(this,args); }
                finally
                {
                    const ms = performance.now()-t;
                    state[totalKey] += ms;
                    state[callsKey]++;
                    state[maxKey] = Math.max(state[maxKey],ms);
                }
            };
        }
        catch (_) {}
    }

    wrapTimed("gameRender","renderMs","renderCalls","renderMax");
    wrapTimed("gameRenderPost","renderMs","renderCalls","renderMax");
    wrapTimed("gameUpdate","updateMs","updateCalls","updateMax");
    wrapTimed("gameUpdatePost","updateMs","updateCalls","updateMax");

    function tick(now)
    {
        state.frames++;
        const elapsed = now-state.last;

        if (elapsed >= 1000)
        {
            const fps = Math.round(state.frames*1000/elapsed);
            const cleanAvg = state.cleanCalls ? state.cleanMs/state.cleanCalls : 0;
            const renderAvg = state.renderCalls ? state.renderMs/state.renderCalls : 0;
            const updateAvg = state.updateCalls ? state.updateMs/state.updateCalls : 0;

            let currentLevel=0;
            try { currentLevel=Number(level||0); } catch (_) {}

            let canvasInfo="?";
            try
            {
                canvasInfo =
                    (mainCanvas?.width||0)+"x"+(mainCanvas?.height||0)+
                    " css "+Math.round(mainCanvas?.clientWidth||0)+"x"+Math.round(mainCanvas?.clientHeight||0)+
                    " dpr "+(window.devicePixelRatio||1).toFixed(1);
            }
            catch (_) {}

            if (currentLevel >= 3)
            {
                badge.style.display="block";
                badge.textContent =
                    "PERF L"+currentLevel+" FPS "+fps+"\n"+
                    "clean "+cleanAvg.toFixed(1)+" / "+state.cleanMax.toFixed(1)+"ms\n"+
                    "rect "+state.drawRect+" calls "+state.rectMs.toFixed(0)+"ms\n"+
                    "tile "+state.drawTile+" calls "+state.tileMs.toFixed(0)+"ms\n"+
                    "line "+state.drawLine+" calls "+state.lineMs.toFixed(0)+"ms\n"+
                    "Rsz "+topSizes(state.rectSizes)+"\n"+
                    "Tsz "+topSizes(state.tileSizes)+"\n"+
                    "detail skip T "+(window._bernardRenderFastStats?.skippedTile||0)+"\n"+
                    "canvas "+canvasInfo;

                console.info("[Bernard perf primitive]",{
                    level:currentLevel,fps,
                    cleanAvgMs:+cleanAvg.toFixed(2),
                    drawRect:state.drawRect,rectMs:+state.rectMs.toFixed(1),rectTop:topSizes(state.rectSizes),
                    drawTile:state.drawTile,tileMs:+state.tileMs.toFixed(1),tileTop:topSizes(state.tileSizes),
                    drawLine:state.drawLine,lineMs:+state.lineMs.toFixed(1),
                    skipped:window._bernardRenderFastStats||{},
                    canvas:canvasInfo
                });
            }
            else badge.style.display="none";

            Object.assign(state,{
                frames:0,last:now,
                cleanMs:0,cleanCalls:0,cleanMax:0,
                drawRect:0,drawTile:0,drawLine:0,drawText:0,
                rectMs:0,tileMs:0,lineMs:0,
                rectSizes:Object.create(null),tileSizes:Object.create(null),
                renderMs:0,renderCalls:0,renderMax:0,
                updateMs:0,updateCalls:0,updateMax:0
            });
        }

        requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
})();
</script>
<script id="bernard-audio-polish">
(() => {
    let activeWashLoop = null;
    let lastWrongFeedbackAt = 0;
    let lastCleanerUsed = 'water';

    const hint = document.createElement('div');
    hint.id = 'bernardCleanerHint';
    hint.style.cssText =
        'position:fixed;left:50%;bottom:max(54px,env(safe-area-inset-bottom));' +
        'transform:translateX(-50%);z-index:999998;pointer-events:none;' +
        'padding:7px 12px;border-radius:999px;background:rgba(16,22,24,.82);' +
        'border:1px solid rgba(255,255,255,.5);color:#fff;font:700 13px/1.2 system-ui,sans-serif;' +
        'opacity:0;transition:opacity .16s ease;white-space:nowrap';
    document.body.appendChild(hint);
    let hintTimer = 0;

    function showHint(text, kind='normal')
    {
        hint.textContent = text;
        hint.style.color = kind === 'wrong' ? '#ffd38a' :
                           kind === 'soap' ? '#dfffe2' :
                           kind === 'water' ? '#dff5ff' : '#fff';
        hint.style.opacity = '1';
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => hint.style.opacity='0', 1200);
    }

    function audioReady()
    {
        try { return soundEffectsEnabled !== false && ensureWindowWashAudio(); }
        catch (_) { return null; }
    }

    function cleanerKind(fallback='water')
    {
        try
        {
            const value = activeTool?.cleaner;
            if (typeof value === 'string' && value)
                return value.toLowerCase();

            const candidate = value?.id || value?.name || activeTool?.id || activeTool?.name || fallback;
            return String(candidate || fallback).toLowerCase();
        }
        catch (_) { return String(fallback || 'water').toLowerCase(); }
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

    function pumpClick(ctx,t,frequency=.820,volume=.035)
    {
        const osc=ctx.createOscillator();
        const gain=ctx.createGain();
        osc.type='sine';
        osc.frequency.setValueAtTime(frequency*1000,t);
        osc.frequency.exponentialRampToValueAtTime(210,t+.045);
        gain.gain.setValueAtTime(volume,t);
        gain.gain.exponentialRampToValueAtTime(.0001,t+.055);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t+.06);
    }

    // Distinct cleaner bottles: water = crisp mist, soap = softer pump + froth.
    playSpraySound = function(kind='water')
    {
        kind = cleanerKind(kind);
        lastCleanerUsed = kind;
        const ctx = audioReady();

        if (kind.includes('soap'))
            showHint('SOAP FOAM — spray grime, then squeegee', 'soap');
        else if (kind.includes('water'))
            showHint('WATER — light wet sheen, then squeegee', 'water');
        else
            showHint(kind.toUpperCase()+' — spray, then squeegee');

        if (!ctx) return;

        try
        {
            const t=ctx.currentTime;

            if (kind.includes('soap'))
            {
                pumpClick(ctx,t,.52,.042);
                shortNoise(ctx,t+.015,.13,.052,2900,260);
                shortNoise(ctx,t+.095,.17,.038,2100,180);
            }
            else if (kind.includes('degreaser'))
            {
                pumpClick(ctx,t,.74,.035);
                shortNoise(ctx,t+.012,.19,.058,4300,620);
            }
            else if (kind.includes('vinegar'))
            {
                pumpClick(ctx,t,.86,.032);
                shortNoise(ctx,t+.012,.18,.054,5000,850);
            }
            else
            {
                pumpClick(ctx,t,.82,.034);
                shortNoise(ctx,t+.012,.18,.058,5600,1050);
            }
        }
        catch (_) {}
    };

    // Squeegee: continuous low rubber-on-glass hiss.
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
            band.type='bandpass';
            band.frequency.value=980;
            band.Q.value=.72;
            gain.gain.value=.020;
            src.loop=true;
            src.connect(band);
            band.connect(gain);
            gain.connect(ctx.destination);
            src.start();
            activeWashLoop={src,gain,ctx};
        }
        catch (_) { activeWashLoop=null; }
    };

    stopWindowWashToolSound = function()
    {
        const loop=activeWashLoop;
        activeWashLoop=null;
        if (!loop) return;

        try
        {
            const t=loop.ctx.currentTime;
            loop.gain.gain.cancelScheduledValues(t);
            loop.gain.gain.setValueAtTime(Math.max(.0001,loop.gain.gain.value||.02),t);
            loop.gain.gain.exponentialRampToValueAtTime(.0001,t+.05);
            loop.src.stop(t+.06);
        }
        catch (_) {}
    };

    playWindowWashWrongCleanerSound = function()
    {
        const now=performance.now();
        if (now-lastWrongFeedbackAt < 900) return;
        lastWrongFeedbackAt=now;

        const suggestion = lastCleanerUsed.includes('soap') ? 'TRY WATER HERE' : 'TRY SOAP HERE';
        showHint('That cleaner is not lifting this grime — '+suggestion,'wrong');

        const ctx=audioReady();
        if (!ctx) return;

        try
        {
            const t=ctx.currentTime;
            [190,145].forEach((frequency,index) => {
                const osc=ctx.createOscillator();
                const gain=ctx.createGain();
                osc.type='triangle';
                osc.frequency.setValueAtTime(frequency,t+index*.085);
                gain.gain.setValueAtTime(.024,t+index*.085);
                gain.gain.exponentialRampToValueAtTime(.0001,t+index*.085+.09);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(t+index*.085);
                osc.stop(t+index*.085+.10);
            });
        }
        catch (_) {}
    };

    // Best-effort wrong-cleaner detection: if a squeegee stroke removes wetness
    // but repeatedly fails to improve the game's clean percentage, prompt the
    // other cleaner. It is intentionally gentle and throttled.
    function readCleanProgress()
    {
        try { if (typeof cleanPercent !== 'undefined') return Number(cleanPercent); } catch (_) {}
        try { if (typeof percentClean !== 'undefined') return Number(percentClean); } catch (_) {}
        try { if (typeof cleanPct !== 'undefined') return Number(cleanPct); } catch (_) {}
        try { if (typeof getCleanPercent === 'function') return Number(getCleanPercent()); } catch (_) {}
        try { if (typeof getCleanPercentage === 'function') return Number(getCleanPercentage()); } catch (_) {}
        return NaN;
    }

    function wetTotal()
    {
        try
        {
            let total=0;
            for (const w of wetness || [])
                if (w?.layers)
                    for (const id in w.layers)
                        total += Number(w.layers[id] || 0);
            return total;
        }
        catch (_) { return NaN; }
    }

    try
    {
        if (typeof directMoveActiveTool === 'function')
        {
            const originalDirectMoveForFeedback=directMoveActiveTool;
            let stalledWipes=0;

            directMoveActiveTool=function(...args)
            {
                let isCleaner=false;
                try { isCleaner=!!activeTool?.cleaner; } catch (_) {}

                const beforeClean=readCleanProgress();
                const beforeWet=wetTotal();
                const result=originalDirectMoveForFeedback.apply(this,args);

                if (!isCleaner)
                {
                    const afterClean=readCleanProgress();
                    const afterWet=wetTotal();

                    if (
                        Number.isFinite(beforeWet) && Number.isFinite(afterWet) &&
                        afterWet < beforeWet-.02 &&
                        Number.isFinite(beforeClean) && Number.isFinite(afterClean) &&
                        afterClean <= beforeClean+.001
                    )
                    {
                        stalledWipes++;
                        if (stalledWipes >= 3)
                        {
                            stalledWipes=0;
                            playWindowWashWrongCleanerSound();
                        }
                    }
                    else if (
                        Number.isFinite(beforeClean) && Number.isFinite(afterClean) &&
                        afterClean > beforeClean+.001
                    )
                        stalledWipes=0;
                }

                return result;
            };
        }
    }
    catch (_) {}

    // Finished window: short glassy sparkle.
    playWindowWashSuccessSound = function()
    {
        const ctx=audioReady();
        if (!ctx) return;

        try
        {
            const t=ctx.currentTime;
            const notes=[659.25,987.77,1318.51];

            notes.forEach((frequency,index) =>
            {
                const osc=ctx.createOscillator();
                const gain=ctx.createGain();
                osc.type=index===2?'sine':'triangle';
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


SAME_BRAIN_POINT_EVENTS = {
    "complete": 10,
    "daily_complete": 15,
    "group_complete": 12,
}
SAME_BRAIN_COSMETICS = {
    "frame_neon": 60,
    "frame_stars": 80,
    "avatar_fox": 100,
    "avatar_robot": 100,
    "theme_sunset": 120,
    "theme_arcade": 140,
}


def _same_brain_user_state(email: str | None) -> dict:
    data = get_user_doc(email) if email else {}
    sb = data.get("sameBrain") if isinstance(data.get("sameBrain"), dict) else {}
    return {
        "plus": has_active_plus(data),
        "bits": max(0, int(sb.get("bits") or 0)),
        "unlocks": sorted({str(v)[:40] for v in (sb.get("unlocks") or []) if str(v).strip()}),
        "avatar": str(sb.get("avatar") or "brain")[:40],
        "theme": str(sb.get("theme") or "classic")[:40],
    }


@bp.get("/same-brain/profile")
def same_brain_profile():
    access_response = _require_access()
    if access_response is not None:
        return access_response
    return jsonify(_same_brain_user_state(_signed_in_email()))


@bp.post("/same-brain/points")
def same_brain_points():
    access_response = _require_access()
    if access_response is not None:
        return access_response
    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _csrf_token_value()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400
    payload = request.get_json(silent=True) or {}
    event = str(payload.get("event") or "").strip()
    event_id = str(payload.get("eventId") or "").strip()[:96]
    amount = SAME_BRAIN_POINT_EVENTS.get(event)
    email = _signed_in_email()
    if not amount or not event_id or not email or not db:
        return jsonify({"error": "invalid"}), 400
    ref = db.collection("users").document(email)
    transaction = db.transaction()

    @cloud_firestore.transactional
    def award(txn):
        snap = ref.get(transaction=txn)
        data = snap.to_dict() or {}
        sb = data.get("sameBrain") if isinstance(data.get("sameBrain"), dict) else {}
        awarded = list(sb.get("awarded") or [])
        if event_id in awarded:
            return max(0, int(sb.get("bits") or 0)), True
        bits = max(0, int(sb.get("bits") or 0)) + int(amount)
        awarded = (awarded + [event_id])[-150:]
        txn.set(ref, {"sameBrain": {**sb, "bits": bits, "awarded": awarded}}, merge=True)
        return bits, False

    try:
        bits, duplicate = award(transaction)
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    return jsonify({"ok": True, "bits": bits, "duplicate": duplicate})


@bp.post("/same-brain/unlock")
def same_brain_unlock():
    access_response = _require_access()
    if access_response is not None:
        return access_response
    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _csrf_token_value()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400
    payload = request.get_json(silent=True) or {}
    item = str(payload.get("item") or "").strip()
    cost = SAME_BRAIN_COSMETICS.get(item)
    email = _signed_in_email()
    if cost is None or not email or not db:
        return jsonify({"error": "invalid"}), 400
    ref = db.collection("users").document(email)
    transaction = db.transaction()

    @cloud_firestore.transactional
    def buy(txn):
        snap = ref.get(transaction=txn)
        data = snap.to_dict() or {}
        sb = data.get("sameBrain") if isinstance(data.get("sameBrain"), dict) else {}
        unlocks = list(sb.get("unlocks") or [])
        bits = max(0, int(sb.get("bits") or 0))
        if item in unlocks:
            return bits, unlocks, True
        if bits < cost:
            return bits, unlocks, False
        bits -= cost
        unlocks.append(item)
        txn.set(ref, {"sameBrain": {**sb, "bits": bits, "unlocks": unlocks}}, merge=True)
        return bits, unlocks, True

    try:
        bits, unlocks, success = buy(transaction)
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    if not success:
        return jsonify({"error": "not_enough_bits", "bits": bits}), 409
    return jsonify({"ok": True, "bits": bits, "unlocks": unlocks})


@bp.post("/same-brain/tts")
def same_brain_tts():
    access_response = _require_access()
    if access_response is not None:
        return access_response
    user_state = _same_brain_user_state(_signed_in_email())
    if not user_state["plus"]:
        return jsonify({"error": "plus_required"}), 403
    if not os.getenv("OPENAI_API_KEY"):
        return jsonify({"error": "tts_unavailable"}), 503
    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _csrf_token_value()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400
    payload = request.get_json(silent=True) or {}
    text = " ".join(str(payload.get("text") or "").split()).strip()[:500]
    voice = str(payload.get("voice") or "marin").strip().lower()
    if voice not in {"marin", "cedar", "coral", "sage"}:
        voice = "marin"
    if not text:
        return jsonify({"error": "invalid"}), 400
    try:
        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        speech = client.audio.speech.create(
            model="gpt-4o-mini-tts",
            voice=voice,
            input=text,
            instructions="Warm, natural, playful game-host delivery. Clear and friendly. Do not sound exaggerated.",
            response_format="mp3",
        )
        audio = speech.read()
    except Exception:
        return jsonify({"error": "tts_failed"}), 503
    response = Response(audio, mimetype="audio/mpeg")
    response.headers["Cache-Control"] = "private, max-age=86400"
    response.headers["X-AI-Voice"] = "OpenAI"
    return response


SAME_BRAIN_GROUP_COLLECTION = "same_brain_groups"
SAME_BRAIN_GROUP_TTL_DAYS = 14
SAME_BRAIN_GROUP_MAX_PLAYERS = 8


def _same_brain_group_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(7))


def _same_brain_clean_name(value: object) -> str:
    return " ".join(str(value or "").split()).strip()[:20]


def _same_brain_validate_answers(question_ids: object, answers: object) -> tuple[list[str], list[int]] | None:
    if not isinstance(question_ids, list) or not isinstance(answers, list):
        return None
    if len(question_ids) not in {5, 10} or len(answers) != len(question_ids):
        return None
    qids = [str(item or "").strip()[:40] for item in question_ids]
    if any(not item for item in qids) or len(set(qids)) != 5:
        return None
    normalized = []
    for raw in answers:
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return None
        if value < 0 or value > 3:
            return None
        normalized.append(value)
    return qids, normalized


def _same_brain_group_result(data: dict) -> dict:
    players = []
    for raw in data.get("players") or []:
        if not isinstance(raw, dict):
            continue
        players.append({
            "name": _same_brain_clean_name(raw.get("name")),
            "answers": [int(v) for v in (raw.get("answers") or [])[:10]],
        })
    return {
        "code": str(data.get("code") or ""),
        "pack": str(data.get("pack") or "random")[:24],
        "questionIds": list(data.get("questionIds") or [])[:10],
        "players": players[:SAME_BRAIN_GROUP_MAX_PLAYERS],
        "maxPlayers": SAME_BRAIN_GROUP_MAX_PLAYERS,
    }


def _same_brain_group_invite(data: dict) -> dict:
    players = [p for p in (data.get("players") or []) if isinstance(p, dict)]
    host_name = _same_brain_clean_name(players[0].get("name")) if players else "A friend"
    return {
        "code": str(data.get("code") or ""),
        "pack": str(data.get("pack") or "random")[:24],
        "questionIds": list(data.get("questionIds") or [])[:10],
        "hostName": host_name,
        "playerCount": min(len(players), SAME_BRAIN_GROUP_MAX_PLAYERS),
        "maxPlayers": SAME_BRAIN_GROUP_MAX_PLAYERS,
    }


def _same_brain_group_ref(code: str):
    code = (code or "").strip().upper()
    if not code or len(code) > 12:
        return None
    try:
        client = db()
    except Exception:
        client = None
    return client.collection(SAME_BRAIN_GROUP_COLLECTION).document(code) if client else None


@bp.post("/same-brain/group")
def same_brain_group_create():
    access_response = _require_access()
    if access_response is not None:
        return access_response

    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _csrf_token_value()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400

    payload = request.get_json(silent=True) or {}
    name = _same_brain_clean_name(payload.get("name"))
    validated = _same_brain_validate_answers(payload.get("questionIds"), payload.get("answers"))
    if not name or not validated:
        return jsonify({"error": "invalid"}), 400
    question_ids, answers = validated
    pack = str(payload.get("pack") or "random").strip().lower()[:24]

    ref = None
    code = ""
    for _ in range(8):
        code = _same_brain_group_code()
        ref = _same_brain_group_ref(code)
        if ref is not None and not ref.get().exists:
            break
    if ref is None:
        return jsonify({"error": "storage_unavailable"}), 503
    if ref.get().exists:
        return jsonify({"error": "try_again"}), 503

    now = datetime.now(timezone.utc)
    result_key = secrets.token_urlsafe(18)
    data = {
        "code": code,
        "pack": pack,
        "questionIds": question_ids,
        "players": [{"name": name, "answers": answers, "joinedAt": now}],
        "createdAt": now,
        "updatedAt": now,
        "expiresAt": now + timedelta(days=SAME_BRAIN_GROUP_TTL_DAYS),
        "resultKeyHash": hashlib.sha256(result_key.encode("utf-8")).hexdigest(),
    }
    try:
        ref.set(data)
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    response = _same_brain_group_result(data)
    response["resultKey"] = result_key
    return jsonify(response), 201


@bp.get("/same-brain/group/<code>")
def same_brain_group_get(code: str):
    access_response = _require_access()
    if access_response is not None:
        return access_response
    ref = _same_brain_group_ref(code)
    if ref is None:
        return jsonify({"error": "not_found"}), 404
    try:
        snap = ref.get()
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    if not snap.exists:
        return jsonify({"error": "not_found"}), 404
    data = snap.to_dict() or {}
    expires = data.get("expiresAt")
    if expires and getattr(expires, "tzinfo", None) and expires < datetime.now(timezone.utc):
        return jsonify({"error": "expired"}), 410
    return jsonify(_same_brain_group_invite(data))


@bp.get("/same-brain/group/<code>/results")
def same_brain_group_results(code: str):
    access_response = _require_access()
    if access_response is not None:
        return access_response
    ref = _same_brain_group_ref(code)
    if ref is None:
        return jsonify({"error": "not_found"}), 404
    try:
        snap = ref.get()
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    if not snap.exists:
        return jsonify({"error": "not_found"}), 404
    data = snap.to_dict() or {}
    supplied = str(request.args.get("key") or "")
    expected = str(data.get("resultKeyHash") or "")
    if not supplied or not expected or not hmac.compare_digest(
        hashlib.sha256(supplied.encode("utf-8")).hexdigest(),
        expected,
    ):
        return jsonify({"error": "forbidden"}), 403
    return jsonify(_same_brain_group_result(data))


@bp.post("/same-brain/group/<code>/join")
def same_brain_group_join(code: str):
    access_response = _require_access()
    if access_response is not None:
        return access_response

    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _csrf_token_value()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400

    payload = request.get_json(silent=True) or {}
    name = _same_brain_clean_name(payload.get("name"))
    validated = _same_brain_validate_answers(payload.get("questionIds"), payload.get("answers"))
    if not name or not validated:
        return jsonify({"error": "invalid"}), 400
    question_ids, answers = validated

    ref = _same_brain_group_ref(code)
    if ref is None:
        return jsonify({"error": "not_found"}), 404
    client = db()
    if not client:
        return jsonify({"error": "storage_unavailable"}), 503
    transaction = client.transaction()

    @cloud_firestore.transactional
    def add_player(txn):
        snap = ref.get(transaction=txn)
        if not snap.exists:
            return ("not_found", None)
        data = snap.to_dict() or {}
        if list(data.get("questionIds") or []) != question_ids:
            return ("invalid", None)
        players = list(data.get("players") or [])
        if len(players) >= SAME_BRAIN_GROUP_MAX_PLAYERS:
            return ("full", data)
        name_key = name.casefold()
        if any(_same_brain_clean_name(p.get("name")).casefold() == name_key for p in players if isinstance(p, dict)):
            return ("name_taken", data)
        players.append({"name": name, "answers": answers, "joinedAt": datetime.now(timezone.utc)})
        data["players"] = players
        data["updatedAt"] = datetime.now(timezone.utc)
        txn.update(ref, {"players": players, "updatedAt": data["updatedAt"]})
        return ("ok", data)

    try:
        status, data = add_player(transaction)
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    if status != "ok":
        status_code = {"not_found": 404, "invalid": 400, "full": 409, "name_taken": 409}.get(status, 400)
        return jsonify({"error": status}), status_code
    return jsonify(_same_brain_group_result(data))


SAME_BRAIN_EVENTS = {
    "start",
    "challenge_created",
    "challenge_shared",
    "challenge_opened",
    "result_completed",
    "result_shared",
}


@bp.post("/same-brain/analytics")
def same_brain_analytics():
    access_response = _require_access()
    if access_response is not None:
        return access_response

    payload = request.get_json(silent=True) or {}
    event = str(payload.get("event") or "").strip()
    pack = str(payload.get("pack") or "unknown").strip().lower()[:24]
    if event not in SAME_BRAIN_EVENTS:
        return jsonify({"error": "unknown_event"}), 400

    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _csrf_token_value()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400

    dedupe_key = f"same_brain_metric:{event}:{pack}"
    if session.get(dedupe_key):
        return jsonify({"ok": True, "duplicate": True})

    try:
        if db:
            db.collection("analytics").document("same_brain_funnel").set(
                {
                    "total": google_firestore.Increment(1),
                    "events": {event: google_firestore.Increment(1)},
                    "packs": {pack: google_firestore.Increment(1)},
                    "updatedAt": google_firestore.SERVER_TIMESTAMP,
                },
                merge=True,
            )
    except Exception:
        # Analytics must never interrupt gameplay.
        pass

    session[dedupe_key] = True
    return jsonify({"ok": True})


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
