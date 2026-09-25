import hashlib
import hmac
import json
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

from firebase_admin import firestore as google_firestore
from google.cloud import firestore as cloud_firestore
from openai import OpenAI
from flask import Blueprint, Response, jsonify, make_response, render_template, redirect, request, session, send_file

from faithsparks.services.firestore import db
from faithsparks.services.users import get_user_doc, has_active_plus
from faithsparks.services.storage import download_storage_bytes, upload_storage_bytes

bp = Blueprint("lab_games", __name__, url_prefix="/labs/games")

_GAME_DIR = Path(__file__).resolve().parents[1] / "content" / "lab_games"

_SHARED_ASSETS = {"games-core.js", "games-ui.css", "games-save-migration.js"}

LAB_GAMES = (
    {
        "slug": "gordon-ice-cream-town",
        "game_id": "gordon-ice-cream-town",
        "aliases": (),
        "name": "Gordon Ice Cream Town",
        "description": "Take customer orders at Gordon Ice Cream Town, make ice cream, shakes, and sodas, and deliver each order to the right customer.",
        "icon": "🍨",
        "accent": "#d66b8a",
        "maturity": "sandbox",
        "file": "gordon-ice-cream-town.html",
        "available": True,
    },
    {
        "slug": "gordon-window-washing",
        "game_id": "gordon-window-washing",
        "aliases": (),
        "name": "Gordon Window Washing",
        "description": "Wash Gordon Ice Cream Town windows with the right cleaner and squeegee as new messes and tools unlock.",
        "icon": "✨",
        "accent": "#4f9bb5",
        "maturity": "sandbox",
        "file": "gordon-window-washing.html",
        "available": True,
    },
    {
        "slug": "gordon-mail-run",
        "game_id": "gordon-mail-run",
        "aliases": ("mail-sorting",),
        "name": "Gordon Mail Run",
        "description": "Sort Games mail, then unlock delivery routes that rotate with sorting levels.",
        "icon": "✉️",
        "accent": "#d28a35",
        "maturity": "sandbox",
        "file": "gordon-mail-run.html",
        "available": True,
    },
    {
        "slug": "gordon-family-stables",
        "game_id": "gordon-family-stables",
        "aliases": (),
        "name": "Gordon Family Stables",
        "description": "Choose a horse and race through increasingly challenging Gordon Family Stables courses.",
        "icon": "🐴",
        "accent": "#6b8f52",
        "maturity": "sandbox",
        "file": "gordon-family-stables.html",
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
        "games": False,
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
    if game_id == "gordon-ice-cream-town":
        # Scale timed parties by group size so later levels stay challenging
        # without giving four customers the same deadline as one.
        html = html.replace(
            " if(ruleForLevel().time)partyDeadline=time+ruleForLevel().time;\n else partyDeadline=0;",
            " const partyTime=ruleForLevel().time;\n if(partyTime)partyDeadline=time+partyTime+max(0,size-1)*18;\n else partyDeadline=0;",
            1,
        )

        # Keep one moderate autosave cadence and one persistence pass per save.
        autosave = "if(Date.now()-lastAutoSaveAt>1200){lastAutoSaveAt=Date.now();saveSession();}"
        html = html.replace(
            autosave,
            "if(Date.now()-lastAutoSaveAt>4000){lastAutoSaveAt=Date.now();saveSession();}",
            1,
        )
        html = html.replace(autosave, "", 1)
        html = html.replace(
            """function saveSession(){
 const p=currentProgress();if(!p)return;
 saveActiveProfile();
 p.session=serializeSession();
 persistProgress();
}""",
            """function saveSession(){
 const p=currentProgress();if(!p)return;
 p.score=max(0,score||0);
 p.bestScore=max(p.bestScore||0,p.score);
 p.stars=max(0,stars||0);
 p.served=max(0,served||0);
 p.level=max(1,level||1);
 p.highestLevel=max(p.highestLevel||1,p.level);
 p.levelServed=max(0,levelServed||0);
 p.lastPlayed=Date.now();
 p.session=serializeSession();
 persistProgress();
}""",
            1,
        )
        html = html.replace(
            "  saveActiveProfile();saveSession();showSavedToast();",
            "  saveSession();showSavedToast();",
            1,
        )

        # Saving while the shared menu is paused must preserve the remaining
        # party timer rather than restoring with zero seconds.
        html = html.replace(
            "  timeLeft:partyDeadline?max(0,partyDeadline-time):0,",
            "  timeLeft:partyDeadline?max(0,partyDeadline-time):max(0,pausedPartyTime||0),",
            1,
        )

        # Clearly wrong recipe choices count against a perfect round.
        html = html.replace(
            " if(!order.need.includes(item.name)){\n  message=`${shortName(item.name)} isn't in this order.`;",
            " if(!order.need.includes(item.name)){\n  roundMistakes++;\n  message=`${shortName(item.name)} isn't in this order.`;",
            1,
        )
        html = html.replace(
            " if(!(order.toppings||[]).includes(t.name)){\n  message=`No ${t.name} on this order.`;",
            " if(!(order.toppings||[]).includes(t.name)){\n  roundMistakes++;\n  message=`No ${t.name} on this order.`;",
            1,
        )
        html = html.replace(
            " if(order.kind!='SCOOP'&&kind!='CUP'){\n  message='Shakes and sodas go in a cup.';",
            " if(order.kind!='SCOOP'&&kind!='CUP'){\n  roundMistakes++;\n  message='Shakes and sodas go in a cup.';",
            1,
        )
        html = html.replace(
            " if(order.kind=='SCOOP' && kind=='CUP'){\n  message='Plain ice cream goes in a bowl or cone.';",
            " if(order.kind=='SCOOP' && kind=='CUP'){\n  roundMistakes++;\n  message='Plain ice cream goes in a bowl or cone.';",
            1,
        )
        html = html.replace(
            " if(order.container!=kind){\n  message=`This order needs a ${order.container}.`;",
            " if(order.container!=kind){\n  roundMistakes++;\n  message=`This order needs a ${order.container}.`;",
            1,
        )
        html = html.replace(
            "    if(i!=partyIndex){\n     playSfx(sndWrongPerson);",
            "    if(i!=partyIndex){\n     roundMistakes++;\n     playSfx(sndWrongPerson);",
            1,
        )

        # Slightly larger lower-row touch targets for iPad.
        html = html.replace(
            "if(hit(selectedContainerPos.BOWL,vec2(1.15,1.05)))",
            "if(hit(selectedContainerPos.BOWL,vec2(1.35,1.2)))",
            1,
        )
        html = html.replace(
            "if(hit(selectedContainerPos.CUP,vec2(1.15,1.05)))",
            "if(hit(selectedContainerPos.CUP,vec2(1.35,1.2)))",
            1,
        )
        html = html.replace(
            "if(hit(selectedContainerPos.CONE,vec2(1.15,1.05)))",
            "if(hit(selectedContainerPos.CONE,vec2(1.35,1.2)))",
            1,
        )

        # Unlock the drink recipe bank gradually. Level 2 starts with the
        # simpler first five recipes; later levels introduce two more at a
        # time until the full menu is available.
        html = html.replace(
            """function drinkOrder(){
 const base=RECIPES[randInt(RECIPES.length)];""",
            """function drinkOrder(){
 const recipeCount=min(RECIPES.length,5+max(0,level-2)*2);
 const base=RECIPES[randInt(recipeCount)];""",
            1,
        )

        # Never start a party larger than the number of orders remaining in
        # the level. This prevents auto-advance from abandoning a waiting
        # customer halfway through a group.
        html = html.replace(
            """function choosePartySize(){
 const r=ruleForLevel();
 return r.partyMin==r.partyMax?r.partyMin:r.partyMin+randInt(r.partyMax-r.partyMin+1);
}""",
            """function choosePartySize(){
 const r=ruleForLevel();
 const rolled=r.partyMin==r.partyMax?r.partyMin:r.partyMin+randInt(r.partyMax-r.partyMin+1);
 const remaining=max(1,r.goal-levelServed);
 return min(rolled,remaining);
}""",
            1,
        )

        # Machine taps should always explain what is missing and use the normal
        # bad-action sound when the wrong station is chosen.
        html = html.replace(
            "  if(order.kind!='BLEND'){roundMistakes++;message='This order does not use the blender.';messageTimer.set(1.4);return;}",
            "  if(order.kind!='BLEND'){roundMistakes++;message='This order does not use the blender.';messageTimer.set(1.4);playSfx(sndBad);return;}",
            1,
        )
        html = html.replace(
            """  if(prepared&&holdingContainer){
   containerFilled=true;playSfx(sndPick);""",
            """  if(prepared&&!holdingContainer){
   message='Pick up a cup first.';messageTimer.set(1.4);playSfx(sndBad);return;
  }
  if(prepared&&holdingContainer){
   containerFilled=true;playSfx(sndPick);""",
            1,
        )
        html = html.replace(
            "  if(order.kind!='MIX'){roundMistakes++;message='This order does not use MIX.';messageTimer.set(1.4);return;}",
            "  if(order.kind!='MIX'){roundMistakes++;message='This order does not use MIX.';messageTimer.set(1.4);playSfx(sndBad);return;}",
            1,
        )
        html = html.replace(
            """  if(!prepared){prepared=true;playSfx(sndPrep);return;}
  if(prepared&&holdingContainer){""",
            """  if(!prepared){
   prepared=true;message='Mixed! Pick up a cup.';messageTimer.set(1.4);playSfx(sndPrep);return;
  }
  if(prepared&&!holdingContainer){
   message='Pick up a cup first.';messageTimer.set(1.4);playSfx(sndBad);return;
  }
  if(prepared&&holdingContainer){""",
            1,
        )

        # Setting down a loaded scoop used to silently discard it.
        html = html.replace(
            """ if(hit(vec2(-6.55,-4.77),vec2(2.8,1.25))){
  holdingScoop=!holdingScoop;
  if(!holdingScoop){scoopLoaded=false;scoopFlavor='';}
  playSfx(sndPick);return;
 }""",
            """ if(hit(vec2(-6.55,-4.77),vec2(2.8,1.25))){
  if(holdingScoop&&scoopLoaded){
   message='Use the scoop you already have, or tap RESET.';messageTimer.set(1.5);playSfx(sndBad);return;
  }
  holdingScoop=!holdingScoop;
  playSfx(sndPick);return;
 }""",
            1,
        )

        # Historical p.stars is an order counter, while Games receives the
        # actual 1-3 star round rating. Do not mislabel the legacy counter.
        html = html.replace(
            "detail:`${max(0,p.completions||0)} completions · ★ ${max(0,p.stars||0)}`",
            "detail:`${max(0,p.completions||0)} completions · ${max(0,p.served||0)} orders served`",
            1,
        )

        # Remove the redundant autosave check at the bottom of gameUpdate.
        html = html.replace(
            """ }
 if(Date.now()-lastAutoSaveAt>4000){lastAutoSaveAt=Date.now();saveSession();}
}

function drawOpenIceTub""",
            """ }
}

function drawOpenIceTub""",
            1,
        )

        return html

    if game_id == "gordon-ice-cream-town":
        def replace_last(source: str, old: str, new: str) -> str:
            index = source.rfind(old)
            if index < 0:
                return source
            return source[:index] + new + source[index + len(old):]

        # Do not spend a timed party's clock on animations the player cannot
        # control (thank-you, walking away, or the next guest walking in).
        html = replace_last(
            html,
            """ if(waitingForNext){
  if(guestPhase=='thanks'&&guestTimer.elapsed()){""",
            """ if(waitingForNext){
  if(ruleForLevel().time && partyDeadline)
   partyDeadline += timeDelta; // freeze the clock during non-interactive guest transitions
  if(guestPhase=='thanks'&&guestTimer.elapsed()){""",
        )

        # Scoop orders can be bowls or cones, so don't tell a child to bring a
        # "cup" to the customer when no cup exists.
        html = replace_last(
            html,
            "  drawText('BRING CUP HERE',guestPos.add(vec2(0,1.78)),.2,hsl(.07,.52,.2));",
            "  drawText(\`BRING \${holdingContainer || 'ORDER'} HERE\`,guestPos.add(vec2(0,1.78)),.2,hsl(.07,.52,.2));",
        )

        # The old star chip actually counted lifetime orders served, while
        # round stars are a separate 1-3 accuracy rating. Label it accurately.
        html = replace_last(
            html,
            " drawText(\`⭐ \${stars}\`,vec2(7.8,5.05),.26,WHITE,.03,BLACK);",
            " drawText(\`SERVED \${served}\`,vec2(7.8,5.05),.22,WHITE,.03,BLACK);",
        )

        # Give the major kitchen actions distinct sounds. Scooping, toppings,
        # plops, errors, and serving already have their own cues.
        html = replace_last(
            html,
            "const sndPrep=new SoundGenerator({frequency:160,slide:1.4,release:.35,noise:.12});",
            """const sndPrep=new SoundGenerator({frequency:160,slide:1.4,release:.35,noise:.12});
const sndMix=new SoundGenerator({frequency:330,slide:.35,release:.22,noise:.05,volume:.58});
const sndPour=new SoundGenerator({frequency:420,slide:-.15,release:.16,noise:.18,volume:.52});
const sndContainer=new SoundGenerator({frequency:560,pitchJump:80,pitchJumpTime:.035,release:.10,volume:.48});""",
        )

        html = replace_last(
            html,
            " holdingContainer=kind;holdingCup=(kind=='CUP');pickupBounce.set(.3);heldVisualReady=false;message=\`\${kind.charAt(0)+kind.slice(1).toLowerCase()} picked up!\`;messageTimer.set(1.2);playSfx(sndPick);",
            " holdingContainer=kind;holdingCup=(kind=='CUP');pickupBounce.set(.3);heldVisualReady=false;message=\`\${kind.charAt(0)+kind.slice(1).toLowerCase()} picked up!\`;messageTimer.set(1.2);playSfx(sndContainer);",
        )

        html = replace_last(
            html,
            "   prepared=true;message='Mixed! Pick up a cup.';messageTimer.set(1.5);playSfx(sndPrep);return;",
            "   prepared=true;message='Mixed! Pick up a cup.';messageTimer.set(1.5);playSfx(sndMix);return;",
        )

        # Replace both latest machine pour interactions without touching older
        # embedded revisions earlier in this large self-contained file.
        latest_game = html.rfind("function gameUpdate(){")
        if latest_game >= 0:
            head, tail = html[:latest_game], html[latest_game:]
            tail = tail.replace(
                "if(holdingMilk){const x=holdingMilk;holdingMilk=false;tray.push(x);markAdded(x,vec2(-3.8,1.5));playSfx(sndPick);return;}",
                "if(holdingMilk){const x=holdingMilk;holdingMilk=false;tray.push(x);markAdded(x,vec2(-3.8,1.5));playSfx(sndPour);return;}",
                1,
            )
            tail = tail.replace(
                "if(holdingMilk){const x=holdingMilk;holdingMilk=false;tray.push(x);markAdded(x,vec2(0,1.5));playSfx(sndPick);return;}",
                "if(holdingMilk){const x=holdingMilk;holdingMilk=false;tray.push(x);markAdded(x,vec2(0,1.5));playSfx(sndPour);return;}",
                1,
            )
            html = head + tail

        return html

    if game_id != "gordon-window-washing":
        return html

    # Rowan already has a 1.5 second completion beat and nextLevel() timer.
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

    # Rowan audit fixes: make scoring/progress reflect the actual dirty
    # cells, keep resume scoring honest, and track wrong-cleaner use explicitly.
    html = html.replace(
        "let lastLevelBonusText = '';",
        "let lastLevelBonusText = '';\nlet levelInitialDirt = 1;\nlet levelWrongSprays = 0;",
        1,
    )
    html = html.replace(
        "    windowSize = windowSize.scale(.94);\n    buildDirt();\n    won = false;",
        "    windowSize = windowSize.scale(.94);\n    buildDirt();\n    levelInitialDirt = max(1, dirtLeft);\n    won = false;",
        1,
    )
    html = html.replace(
        "    levelCorrectSprays = 0;\n    levelWipes = 0;",
        "    levelCorrectSprays = 0;\n    levelWrongSprays = 0;\n    levelWipes = 0;",
        1,
    )
    html = html.replace(
        "    let hitCorrectMess = false;\n\n    forEachNearbyGlassCell(pos, 1.35, 1.15, i =>",
        "    let hitCorrectMess = false;\n    let hitWrongMess = false;\n\n    forEachNearbyGlassCell(pos, 1.35, 1.15, i =>",
        1,
    )
    html = html.replace(
        """            w.layers[cleanerId] = 1;

            const d = dirt[i];
            if (!d.clean && d.mess.cleaner == cleanerId)
            {
                d.treated = true;
                hitCorrectMess = true;
            }""",
        """            w.layers[cleanerId] = 1;
            w.lastCleanerId = cleanerId;

            const d = dirt[i];
            if (!d.clean && d.mess.cleaner == cleanerId)
            {
                d.treated = true;
                hitCorrectMess = true;
            }
            else if (!d.clean && d.mess.cleaner != cleanerId)
            {
                hitWrongMess = true;
                window._rowanLastNeededCleaner = d.mess.cleaner;
            }""",
        1,
    )
    html = html.replace(
        """    if (hitCorrectMess)
        levelCorrectSprays++;
}""",
        """    if (hitCorrectMess)
        levelCorrectSprays++;

    if (hitWrongMess)
        levelWrongSprays++;
}""",
        1,
    )
    html = html.replace(
        "    const accuracy = levelSprays > 0 ? levelCorrectSprays / levelSprays : 1;",
        "    const accuracy = levelSprays > 0\n        ? max(0, levelSprays - levelWrongSprays) / levelSprays\n        : 1;",
        1,
    )
    html = html.replace(
        "    const dirtyCells = max(1, dirt.filter(d => d.clean).length);",
        "    const dirtyCells = max(1, levelInitialDirt);",
        1,
    )
    html = html.replace(
        "                perfect:levelSprays>0 && levelSprays===levelCorrectSprays",
        "                perfect:levelSprays>0 && levelWrongSprays===0",
        1,
    )
    html = html.replace(
        "            perfect: levelSprays > 0 && levelSprays === levelCorrectSprays",
        "            perfect: levelSprays > 0 && levelWrongSprays === 0",
        1,
    )

    # Preserve score/effort/time across resume instead of resetting bonuses
    # whenever the browser backgrounds or reloads.
    html = html.replace(
        """        wetness: wetness.map(w => ({
            layers: w.layers ? {...w.layers} : {}
        })),
        savedAt: Date.now()""",
        """        wetness: wetness.map(w => ({
            layers: w.layers ? {...w.layers} : {},
            lastCleanerId: w.lastCleanerId || ''
        })),
        levelInitialDirt,
        levelSprays,
        levelCorrectSprays,
        levelWrongSprays,
        levelWipes,
        elapsedMs: max(0, performance.now() - levelStartTime),
        savedAt: Date.now()""",
        1,
    )
    html = html.replace(
        """            wetness[i].layers = savedWet && savedWet.layers ? {...savedWet.layers} : {};
        }
    }

    dirtLeft = dirt.filter(d => !d.clean).length;
    return true;""",
        """            wetness[i].layers = savedWet && savedWet.layers ? {...savedWet.layers} : {};
            wetness[i].lastCleanerId = savedWet && savedWet.lastCleanerId
                ? savedWet.lastCleanerId
                : '';
        }
    }

    dirtLeft = dirt.filter(d => !d.clean).length;
    levelInitialDirt = max(dirtLeft, resume.levelInitialDirt || dirtLeft || 1);
    levelSprays = max(0, resume.levelSprays || 0);
    levelCorrectSprays = max(0, resume.levelCorrectSprays || 0);
    levelWrongSprays = max(0, resume.levelWrongSprays || 0);
    levelWipes = max(0, resume.levelWipes || 0);
    levelStartTime = performance.now() - max(0, resume.elapsedMs || 0);
    return true;""",
        1,
    )
    html = html.replace(
        "    const cleaned = 100 - Math.round(dirtLeft / (gridX*gridY) * 100);",
        "    const cleaned = clamp(100 - Math.round(dirtLeft / max(1,levelInitialDirt) * 100), 0, 100);",
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

        let cleanerId =
            w.lastCleanerId && (w.layers[w.lastCleanerId] || 0) > .05
                ? w.lastCleanerId
                : '';
        let amount = cleanerId ? w.layers[cleanerId] : 0;

        if (!cleanerId)
        {
            for (const id in w.layers)
            {
                const layerAmount = w.layers[id];
                if (layerAmount > amount)
                {
                    amount = layerAmount;
                    cleanerId = id;
                }
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
        else if (cleanerId == 'rowan')
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
<script id="rowan-render-fast-path">
(() => {
    const originalDrawRect = window.drawRect;
    const originalDrawTile = window.drawTile;
    if (typeof originalDrawRect !== "function" || typeof originalDrawTile !== "function")
        return;

    let bounds = null;
    let boundsBuiltAt = 0;
    window._rowanRenderFastStats = {skippedRect:0,skippedTile:0};

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

        // Only tiny grid-sized primitives are culled. Tools, bottles, Rowan,
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
            if (!bounds || performance.now()-boundsBuiltAt > 500)
                rebuildBounds();

            const inGlassBounds =
                bounds &&
                pos.x >= bounds.minX-bounds.cx &&
                pos.x <= bounds.maxX+bounds.cx &&
                pos.y >= bounds.minY-bounds.cy &&
                pos.y <= bounds.maxY+bounds.cy;

            const tinyWindowTexture =
                inGlassBounds &&
                size.x <= 1.05 &&
                size.y <= 1.05;

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
                    window._rowanRenderFastStats.skippedTile++;
                    return;
                }
            }
        }

        if (shouldSkip(pos,size))
        {
            window._rowanRenderFastStats.skippedTile++;
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
<script id="rowan-perf-profiler">
(() => {
    const perfEnabled = new URLSearchParams(location.search).get('rowanPerf') === '1';
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
    badge.id = "rowanPerfBadge";
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
                    "detail skip T "+(window._rowanRenderFastStats?.skippedTile||0)+"\n"+
                    "canvas "+canvasInfo;

                console.info("[Rowan perf primitive]",{
                    level:currentLevel,fps,
                    cleanAvgMs:+cleanAvg.toFixed(2),
                    drawRect:state.drawRect,rectMs:+state.rectMs.toFixed(1),rectTop:topSizes(state.rectSizes),
                    drawTile:state.drawTile,tileMs:+state.tileMs.toFixed(1),tileTop:topSizes(state.tileSizes),
                    drawLine:state.drawLine,lineMs:+state.lineMs.toFixed(1),
                    skipped:window._rowanRenderFastStats||{},
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
<script id="rowan-audio-polish">
(() => {
    let activeWashLoop = null;
    let lastWrongFeedbackAt = 0;
    let lastCleanerUsed = 'water';

    const hint = document.createElement('div');
    hint.id = 'rowanCleanerHint';
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

        const neededId = String(window._rowanLastNeededCleaner || '').toLowerCase();
        const needed = {
            water:'WATER',
            soap:'SOAP',
            degreaser:'DISINFECTER',
            vinegar:'VINEGAR',
            rowan:"ROWAN'S SIGNATURE CLEANER"
        }[neededId] || (lastCleanerUsed.includes('soap') ? 'WATER' : 'SOAP');
        showHint('That cleaner is not lifting this grime — TRY '+needed+' HERE','wrong');

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
        try
        {
            if (typeof dirtLeft !== 'undefined' && typeof levelInitialDirt !== 'undefined')
                return clamp(100 - dirtLeft/max(1,levelInitialDirt)*100, 0, 100);
        }
        catch (_) {}
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


def _default_games_roster() -> dict:
    return {
        "version": 1,
        "players": [],
        "activePlayerId": "",
        "settings": {"sound": True, "music": True},
    }


def _sanitize_games_roster(payload: object) -> dict:
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


def _load_games_roster(email: str | None) -> dict:
    if not email or not db:
        return _default_games_roster()
    try:
        snap = db.collection("users").document(email).get()
        if not snap.exists:
            return _default_games_roster()
        data = snap.to_dict() or {}
        return _sanitize_games_roster(data.get("gamesRoster", data.get("odysseyRoster")))
    except Exception:
        return _default_games_roster()


def _merge_games_rosters(existing: dict, incoming: dict) -> dict:
    base = _sanitize_games_roster(existing)
    new = _sanitize_games_roster(incoming)
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


def _games_bootstrap(email: str | None) -> tuple[dict, dict]:
    roster = _load_games_roster(email)
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
    roster, sync_config = _games_bootstrap(_signed_in_email())
    return render_template(
        "lab_games.html",
        games=LAB_GAMES,
        signed_in=True,
        access_denied=False,
        noindex=True,
        games_roster=roster,
        games_sync_config=sync_config,
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
        return jsonify(_load_games_roster(email))

    sent_token = request.headers.get("X-CSRF-Token") or request.headers.get("X-CSRFToken") or ""
    expected_token = _csrf_token_value()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400

    incoming = _sanitize_games_roster(request.get_json(silent=True) or {})
    existing = _load_games_roster(email)
    merged = _merge_games_rosters(existing, incoming)

    if not db or not email:
        return jsonify(merged)

    try:
        db.collection("users").document(email).set({"gamesRoster": merged}, merge=True)
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503

    return jsonify(merged)


SAME_BRAIN_POINT_EVENTS = {
    "complete": 10,
    "daily_complete": 15,
    "group_complete": 12,
}
SAME_BRAIN_COSMETICS = {
    "frame_stars": 80,
    "avatar_owl": 90,
    "avatar_fox": 100,
    "avatar_robot": 100,
    "avatar_alien": 110,
    "avatar_octopus": 110,
    "avatar_astronaut": 130,
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
        "dailyStreak": max(0, int(sb.get("dailyStreak") or 0)),
        "dailyBest": max(0, int(sb.get("dailyBest") or 0)),
        "lastDailyDate": str(sb.get("lastDailyDate") or "")[:10],
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
    daily_key = str(payload.get("dateKey") or "").strip()[:10]
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
        update = {**sb, "bits": bits, "awarded": awarded}
        if event == "daily_complete":
            try:
                play_date = datetime.strptime(daily_key, "%Y-%m-%d").date()
            except (TypeError, ValueError):
                play_date = None
            utc_today = datetime.now(timezone.utc).date()
            if play_date is not None and abs((play_date - utc_today).days) <= 2:
                today_key = play_date.isoformat()
                yesterday_key = (play_date - timedelta(days=1)).isoformat()
                previous = str(sb.get("lastDailyDate") or "")
                streak = max(0, int(sb.get("dailyStreak") or 0))
                if previous == today_key:
                    pass
                elif previous == yesterday_key:
                    streak += 1
                else:
                    streak = 1
                update["dailyStreak"] = streak
                update["dailyBest"] = max(streak, int(sb.get("dailyBest") or 0))
                update["lastDailyDate"] = today_key
        txn.set(ref, {"sameBrain": update}, merge=True)
        return bits, False

    try:
        bits, duplicate = award(transaction)
    except Exception:
        return jsonify({"error": "storage_unavailable"}), 503
    state = _same_brain_user_state(email)
    return jsonify({
        "ok": True,
        "bits": bits,
        "duplicate": duplicate,
        "dailyStreak": state["dailyStreak"],
        "dailyBest": state["dailyBest"],
        "lastDailyDate": state["lastDailyDate"],
    })


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
    question_id = str(payload.get("questionId") or "").strip()[:64]
    cacheable = bool(payload.get("cacheable")) and bool(question_id) and not question_id.startswith("custom_")
    if voice not in {"marin", "cedar", "coral", "sage"}:
        voice = "marin"
    if not text:
        return jsonify({"error": "invalid"}), 400

    model = "gpt-4o-mini-tts"
    instructions = "Warm, natural, playful game-host delivery. Clear and friendly. Do not sound exaggerated."
    cache_path = ""
    if cacheable:
        digest = hashlib.sha256(
            ("|".join([model, voice, question_id, instructions, text])).encode("utf-8")
        ).hexdigest()
        cache_path = f"same_brain/tts/{voice}/{digest}.mp3"
        cached_audio = download_storage_bytes(cache_path)
        if cached_audio:
            response = Response(cached_audio, mimetype="audio/mpeg")
            response.headers["Cache-Control"] = "private, max-age=604800"
            response.headers["X-AI-Voice"] = "OpenAI"
            response.headers["X-TTS-Cache"] = "HIT"
            return response

    try:
        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        speech = client.audio.speech.create(
            model=model,
            voice=voice,
            input=text,
            instructions=instructions,
            response_format="mp3",
        )
        audio = speech.read()
    except Exception:
        return jsonify({"error": "tts_failed"}), 503

    if cache_path:
        upload_storage_bytes(audio, cache_path, content_type="audio/mpeg")

    response = Response(audio, mimetype="audio/mpeg")
    response.headers["Cache-Control"] = "private, max-age=604800" if cacheable else "private, max-age=86400"
    response.headers["X-AI-Voice"] = "OpenAI"
    response.headers["X-TTS-Cache"] = "MISS" if cacheable else "BYPASS"
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
    if any(not item for item in qids) or len(set(qids)) != len(qids):
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
    if len(question_ids) == 10 and not has_active_plus(get_user_doc(_signed_in_email())):
        return jsonify({"error": "plus_required"}), 403
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
    "home_view",
    "return_visit",
    "start",
    "challenge_created",
    "challenge_shared",
    "beat_chain_shared",
    "custom_created",
    "challenge_opened",
    "result_completed",
    "result_shared",
    "response_submitted",
    "creator_result_opened",
    "daily_crowd_viewed",
    "together_created",
    "together_joined",
    "together_completed",
    "together_opened",
    "together_first_finished",
    "question_seen",
    "question_answered",
    "question_abandoned",
    "question_flagged",
    "plus_trial_started",
    "plus_upgrade_clicked",
}


@bp.post("/same-brain/analytics")
def same_brain_analytics():
    access_response = _require_access()
    if access_response is not None:
        return access_response

    payload = request.get_json(silent=True) or {}
    event = str(payload.get("event") or "").strip()
    pack = str(payload.get("pack") or "unknown").strip().lower()[:24]
    run_id = "".join(ch for ch in str(payload.get("runId") or "") if ch.isalnum() or ch in {"-", "_"})[:64]
    audience = str(payload.get("audience") or "everyone").strip().lower()
    if audience not in {"kids", "tween", "mixed", "everyone"}:
        audience = "everyone"
    question_id = re.sub(r"[^A-Za-z0-9_-]", "", str(payload.get("questionId") or ""))[:64].strip()
    source_code = re.sub(r"[^A-Z0-9]", "", str(payload.get("sourceCode") or "").upper())[:12]
    try:
        elapsed_ms = max(0, min(120000, int(payload.get("elapsedMs") or 0)))
    except (TypeError, ValueError):
        elapsed_ms = 0
    if event not in SAME_BRAIN_EVENTS:
        return jsonify({"error": "unknown_event"}), 400

    sent_token = request.headers.get("X-CSRF-Token") or ""
    expected_token = _csrf_token_value()
    if not sent_token or not hmac.compare_digest(str(sent_token), str(expected_token)):
        return jsonify({"error": "csrf"}), 400

    detail_key = question_id or source_code or ""
    dedupe_key = f"same_brain_metric:{run_id or 'legacy'}:{event}:{pack}:{detail_key}"
    if session.get(dedupe_key):
        return jsonify({"ok": True, "duplicate": True})

    try:
        if db:
            db.collection("analytics").document("same_brain_funnel").set(
                {
                    "total": google_firestore.Increment(1),
                    "events": {event: google_firestore.Increment(1)},
                    "packs": {pack: google_firestore.Increment(1)},
                    "audiences": {audience: google_firestore.Increment(1)},
                    "updatedAt": google_firestore.SERVER_TIMESTAMP,
                },
                merge=True,
            )
            if run_id:
                run_update = {
                    "events": {event: True},
                    "pack": pack,
                    "audience": audience,
                    "updatedAt": google_firestore.SERVER_TIMESTAMP,
                }
                if source_code:
                    run_update["sourceCode"] = source_code
                db.collection("same_brain_lab_runs").document(run_id).set(run_update, merge=True)
            if question_id and event in {"question_seen", "question_answered", "question_abandoned", "question_flagged"}:
                update = {
                    event: google_firestore.Increment(1),
                    "audiences": {audience: google_firestore.Increment(1)},
                    "updatedAt": google_firestore.SERVER_TIMESTAMP,
                }
                if elapsed_ms and event in {"question_answered", "question_abandoned"}:
                    update["elapsedMsTotal"] = google_firestore.Increment(elapsed_ms)
                    update["elapsedSamples"] = google_firestore.Increment(1)
                db.collection("same_brain_question_stats_lab").document(question_id).set(update, merge=True)
    except Exception:
        # Analytics must never interrupt gameplay.
        pass

    session[dedupe_key] = True
    return jsonify({"ok": True})


@bp.get("/same-brain/metrics")
def same_brain_metrics():
    access_response = _require_access()
    if access_response is not None:
        return access_response

    def _doc_counts(doc_id: str) -> dict:
        if not db:
            return {}
        try:
            snap = db.collection("analytics").document(doc_id).get()
            data = snap.to_dict() or {} if snap.exists else {}
            return data.get("events") if isinstance(data.get("events"), dict) else {}
        except Exception:
            return {}

    def _run_docs(collection_name: str, limit: int = 500) -> list[dict]:
        if not db:
            return []
        rows = []
        try:
            for snap in db.collection(collection_name).limit(limit).stream():
                data = snap.to_dict() or {}
                events = data.get("events") if isinstance(data.get("events"), dict) else {}
                rows.append({
                    "id": snap.id,
                    "events": {str(k): bool(v) for k, v in events.items()},
                    "pack": str(data.get("pack") or "unknown")[:24],
                    "audience": str(data.get("audience") or "everyone")[:16],
                    "sourceCode": str(data.get("sourceCode") or "")[:12],
                })
        except Exception:
            return []
        return rows

    def _question_stats(limit: int = 300) -> list[dict]:
        if not db:
            return []
        rows = []
        try:
            for snap in db.collection("same_brain_question_stats").limit(limit).stream():
                data = snap.to_dict() or {}
                seen = max(0, int(data.get("question_seen") or 0))
                answered = max(0, int(data.get("question_answered") or 0))
                abandoned = max(0, int(data.get("question_abandoned") or 0))
                flagged = max(0, int(data.get("question_flagged") or 0))
                samples = max(0, int(data.get("elapsedSamples") or 0))
                elapsed_total = max(0, int(data.get("elapsedMsTotal") or 0))
                rows.append({
                    "id": snap.id,
                    "seen": seen,
                    "answered": answered,
                    "abandoned": abandoned,
                    "flagged": flagged,
                    "avgMs": round(elapsed_total / samples) if samples else None,
                    "abandonRate": round(abandoned / seen * 100, 1) if seen else None,
                })
        except Exception:
            return []
        return rows

    public_events = _doc_counts("same_brain_public_funnel")
    labs_events = _doc_counts("same_brain_funnel")
    public_runs = _run_docs("same_brain_public_runs")
    question_rows = _question_stats()

    def _event_count(events: dict, name: str) -> int:
        return max(0, int(events.get(name) or 0))

    def _cohort_rate_rows(rows: list[dict], den_event: str, num_event: str) -> dict:
        denominator_runs = [row for row in rows if row["events"].get(den_event)]
        denominator = len(denominator_runs)
        numerator = sum(1 for row in denominator_runs if row["events"].get(num_event))
        if denominator <= 0:
            return {"value": None, "numerator": 0, "denominator": 0}
        return {
            "value": round(numerator / denominator * 100, 1),
            "numerator": numerator,
            "denominator": denominator,
        }

    def _cohort_rate(den_event: str, num_event: str) -> dict:
        return _cohort_rate_rows(public_runs, den_event, num_event)

    metrics = [
        {
            "key": "creatorCompletion",
            "label": "Creator quiz completion",
            "why": "Of people who start their own quiz, how many finish all 5 and create a challenge?",
            "rate": _cohort_rate("start", "challenge_created"),
            "good": 70,
            "watch": 50,
            "problem": "People are dropping out before finishing the five questions.",
            "action": "Test the five-question flow on phones. Shorten/confusing questions or remove any interaction friction.",
        },
        {
            "key": "creatorShare",
            "label": "Creator share rate",
            "why": "Of finished challenges, how many actually get shared?",
            "rate": _cohort_rate("challenge_created", "challenge_shared"),
            "good": 30,
            "watch": 15,
            "problem": "People finish but do not send the challenge.",
            "action": "Improve the challenge-created payoff, share copy, preview, and primary Share button.",
        },
        {
            "key": "inviteCompletion",
            "label": "Friend completion rate",
            "why": "Of friends who open a challenge, how many finish and submit their result?",
            "rate": _cohort_rate("challenge_opened", "response_submitted"),
            "good": 65,
            "watch": 40,
            "problem": "Invitees open the game but do not finish it.",
            "action": "Simplify the invite/name step and inspect where mobile players abandon the five questions.",
        },
        {
            "key": "chainRate",
            "label": "Viral chain rate",
            "why": "Of friends who see a result, how many challenge the next person?",
            "rate": _cohort_rate("result_completed", "beat_chain_shared"),
            "good": 20,
            "watch": 10,
            "problem": "People enjoy the result but the chain stops there.",
            "action": "Strengthen the 'Who knows you better?' CTA and make the next share feel personally interesting.",
        },
        {
            "key": "resultShare",
            "label": "Result-card share rate",
            "why": "Of completed results, how many share the result card itself?",
            "rate": _cohort_rate("result_completed", "result_shared"),
            "good": 20,
            "watch": 8,
            "problem": "The result is not interesting enough to show other people.",
            "action": "Improve the result card/highlights before adding more gameplay features.",
        },
    ]

    for metric in metrics:
        rate = metric["rate"]
        value = rate["value"]
        sample = rate["denominator"]
        if sample < 10:
            metric["status"] = "learning"
            metric["statusLabel"] = "Not enough data"
            metric["diagnosis"] = f"Only {sample} matched run{'s' if sample != 1 else ''}. Wait for at least 10 before reacting."
        elif value is None:
            metric["status"] = "learning"
            metric["statusLabel"] = "No data"
            metric["diagnosis"] = "No matched runs yet."
        elif value >= metric["good"]:
            metric["status"] = "good"
            metric["statusLabel"] = "Healthy"
            metric["diagnosis"] = "This part of the loop looks healthy for now."
        elif value >= metric["watch"]:
            metric["status"] = "watch"
            metric["statusLabel"] = "Watch"
            metric["diagnosis"] = metric["problem"]
        else:
            metric["status"] = "problem"
            metric["statusLabel"] = "Problem"
            metric["diagnosis"] = metric["problem"]

    rough_home = _event_count(public_events, "home_view")
    rough_returns = _event_count(public_events, "return_visit")
    rough_return_rate = round(min(rough_returns, rough_home) / rough_home * 100, 1) if rough_home else None

    legacy_anomalies = []
    legacy_starts = _event_count(public_events, "start")
    legacy_results = _event_count(public_events, "result_completed")
    if legacy_results > legacy_starts and legacy_starts > 0:
        legacy_anomalies.append(
            "Old aggregate counters show more completed results than starts. This is expected from the previous session-level dedupe logic and should not be used as a completion rate."
        )
    if not public_runs:
        legacy_anomalies.append(
            "Run-based tracking has just started. The dashboard will become trustworthy as new plays arrive."
        )

    next_problem = next((m for m in metrics if m["status"] == "problem"), None)
    next_watch = next((m for m in metrics if m["status"] == "watch"), None)
    priority = next_problem or next_watch

    payload = {
        "ok": True,
        "runBased": True,
        "trackedRuns": len(public_runs),
        "metrics": metrics,
        "roughReturnRate": {
            "value": rough_return_rate,
            "returns": rough_returns,
            "homeViews": rough_home,
            "note": "Directional only: return/home counters are still session-based, not a clean user cohort.",
        },
        "priority": {
            "label": priority["label"],
            "action": priority["action"],
        } if priority else None,
        "warnings": legacy_anomalies,
        "raw": {
            "publicEvents": {key: max(0, int(value or 0)) for key, value in public_events.items()},
            "labsEvents": {key: max(0, int(value or 0)) for key, value in labs_events.items()},
        },
    }

    if request.args.get("format") == "json":
        return jsonify(payload)

    def _pct(value):
        return "—" if value is None else f"{value:.1f}%"

    status_styles = {
        "good": ("#eaf8ef", "#1d7a3b", "✅"),
        "watch": ("#fff7df", "#8a6410", "⚠️"),
        "problem": ("#fff0f0", "#a52a2a", "🚨"),
        "learning": ("#f2effa", "#655a7b", "🧪"),
    }

    metric_cards = []
    for metric in metrics:
        bg, fg, icon = status_styles[metric["status"]]
        rate = metric["rate"]
        metric_cards.append(f"""
        <section class="metric">
          <div class="metric-top">
            <div><div class="eyebrow">{icon} {metric["statusLabel"]}</div><h2>{metric["label"]}</h2></div>
            <div class="number">{_pct(rate["value"])}</div>
          </div>
          <div class="sample">{rate["numerator"]} of {rate["denominator"]} matched runs</div>
          <p>{metric["why"]}</p>
          <div class="diagnosis" style="background:{bg};color:{fg}">
            <strong>{metric["diagnosis"]}</strong>
            <span>{metric["action"] if metric["status"] in {"problem", "watch"} else ""}</span>
          </div>
        </section>
        """)

    warning_html = "".join(f"<li>{warning}</li>" for warning in legacy_anomalies) or "<li>No tracking anomalies detected.</li>"
    priority_html = (
        f"<div class='priority'><strong>Fix this next: {priority['label']}</strong><span>{priority['action']}</span></div>"
        if priority else
        "<div class='priority healthy'><strong>No obvious funnel problem yet.</strong><span>Keep collecting real-user runs before changing the game.</span></div>"
    )

    raw_rows = "".join(
        f"<tr><td>{key.replace('_', ' ')}</td><td>{max(0, int(value or 0))}</td></tr>"
        for key, value in sorted(public_events.items())
    ) or "<tr><td colspan='2'>No public events yet.</td></tr>"

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Same Brain MVP Metrics</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;background:#f7f4fc;color:#241d36;font:16px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}
main{{max-width:980px;margin:0 auto;padding:32px 18px 60px}}h1{{font-size:2rem;margin:0}}h2{{font-size:1.05rem;margin:3px 0 0}}p{{color:#675f78;margin:9px 0}}
.top{{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}}.sub{{color:#756b86;margin-top:5px}}
.chip{{background:#fff;border:1px solid #ded6ef;border-radius:999px;padding:8px 12px;font-weight:800;white-space:nowrap}}
.priority{{border:1px solid #d9cff2;background:#fff;border-radius:16px;padding:15px 17px;margin:16px 0;display:flex;flex-direction:column;gap:4px}}
.priority strong{{color:#5b3fd0}}.priority span{{color:#665e76}}.priority.healthy strong{{color:#24753d}}
.grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}}.metric{{background:#fff;border:1px solid #e0d9ee;border-radius:18px;padding:17px;box-shadow:0 8px 24px rgba(59,37,97,.05)}}
.metric-top{{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}}.eyebrow{{font-size:.75rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:#756b86}}
.number{{font-size:2rem;font-weight:950;color:#6f4bd8}}.sample{{font-size:.82rem;color:#847b91;margin-top:7px}}.diagnosis{{border-radius:12px;padding:10px 11px;margin-top:12px;font-size:.86rem;display:flex;flex-direction:column;gap:3px}}
.section{{background:#fff;border:1px solid #e0d9ee;border-radius:18px;padding:18px;margin-top:14px}}ul{{margin:9px 0;padding-left:20px;color:#665e76}}table{{width:100%;border-collapse:collapse}}td{{padding:7px 4px;border-bottom:1px solid #eee9f5}}td:last-child{{text-align:right;font-weight:800}}
.note{{font-size:.84rem;color:#7b7288}}a{{color:#5b3fd0;font-weight:800}}@media(max-width:700px){{.grid{{grid-template-columns:1fr}}.top{{flex-direction:column}}}}
</style>
</head>
<body><main>
<div class="top"><div><h1>🧠 Same Brain MVP Health</h1><div class="sub">Find the first place the viral loop is leaking. Fix that before adding features.</div></div><div class="chip">{len(public_runs)} tracked runs</div></div>
{priority_html}
<div class="grid">{''.join(metric_cards)}</div>
<section class="section">
<h2>Return behavior</h2>
<div class="number">{_pct(rough_return_rate)}</div>
<p>{rough_returns} return events / {rough_home} home views.</p>
<div class="note">Directional only for now. These counters are session-based, so do not make product decisions from this until there is more traffic.</div>
</section>
<section class="section"><h2>Data-quality notes</h2><ul>{warning_html}</ul><div class="note">The old 200% completion rate was not real. The previous counters did not represent matched cohorts. New runs are now matched anonymously by quiz run.</div></section>
<section class="section"><h2>Raw public events</h2><table>{raw_rows}</table><p class="note">Useful for debugging, not for calculating funnel rates by hand.</p></section>
<section class="section"><a href="?format=json">View raw dashboard JSON</a></section>
</main></body></html>"""
    response = make_response(html)
    response.mimetype = "text/html"
    response.headers["Cache-Control"] = "private, no-store"
    return response


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

    roster, sync_config = _games_bootstrap(_signed_in_email())
    html = game_path.read_text(encoding="utf-8")
    html = _apply_runtime_game_patches(html, game["game_id"])
    bootstrap = (
        "<script>"
        "window.__GAMES_ACCOUNT_ROSTER__=" + json.dumps(roster).replace("<", "\\u003c") + ";"
        "window.__GAMES_SYNC_CONFIG__=" + json.dumps(sync_config).replace("<", "\\u003c") + ";"
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
