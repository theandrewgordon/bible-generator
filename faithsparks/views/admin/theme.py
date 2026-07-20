import os
import re
import uuid
from datetime import datetime, timezone

from flask import render_template, request, redirect, url_for, flash, jsonify, session, current_app, g
from werkzeug.utils import secure_filename
from firebase_admin import firestore
from PIL import Image, UnidentifiedImageError

from faithsparks.services.firestore import db
from faithsparks.services.storage import upload_to_storage
from faithsparks.services.themes import (
    THEMES,
    get_theme_selection,
    list_all_themes,
    get_theme_vars,
)


def _log_admin_theme_error(message: str, exc: Exception) -> None:
    current_app.logger.exception("[%s] admin theme %s: %s", getattr(g, "req_id", ""), message, exc)


def _safe_theme_upload_name(value: str) -> str:
    return re.sub(r"[^a-z0-9_-]+", "-", str(value or "default").strip().lower()).strip("-")[:60] or "default"


def _verified_image_upload(file_storage, theme: str, allowed_exts: set[str]) -> tuple[str, str]:
    filename = secure_filename(file_storage.filename or "")
    ext = os.path.splitext(filename)[1].lower()
    if ext not in allowed_exts:
        raise ValueError("Unsupported image type")
    os.makedirs("output", exist_ok=True)
    local_path = os.path.join("output", f"theme_{theme}_{uuid.uuid4().hex}{ext}")
    file_storage.save(local_path)
    try:
        with Image.open(local_path) as image:
            image.verify()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        try:
            os.remove(local_path)
        except OSError:
            pass
        raise ValueError("Invalid image file") from exc
    return local_path, ext


def admin_theme_preview():
    try:
        payload = request.get_json(silent=True) or {}
        if payload.get("clear"):
            session.pop("preview_theme", None)
            session.pop("preview_theme_exp", None)
            return jsonify({"ok": True, "cleared": True})
        sel = (payload.get("theme") or "").strip()
        if sel and (get_theme_vars(sel) is not None):
            session["preview_theme"] = sel
            ttl = payload.get("ttlMinutes")
            try:
                if ttl:
                    ttl = int(ttl)
                    session["preview_theme_exp"] = int(datetime.now(timezone.utc).timestamp()) + max(60, ttl * 60)
            except Exception:
                pass
            return jsonify({"ok": True, "theme": sel})
        return jsonify({"ok": False, "error": "Unknown theme"}), 400
    except Exception as e:
        _log_admin_theme_error("preview failed", e)
        return jsonify({"ok": False, "error": "Theme preview failed."}), 500


def admin_theme():
    name, _vars = get_theme_selection()
    if request.method == "POST":
        if not db:
            flash("Firestore not configured", "error")
            return redirect(url_for("admin_theme"))
        sel = (request.form.get("theme") or "teal").strip()
        if sel not in THEMES:
            if not (db and db.collection("themes").document(sel).get().exists):
                flash("Unknown theme", "error")
                return redirect(url_for("admin_theme"))
        try:
            db.collection("config").document("app").set({"theme": sel}, merge=True)
            flash("Theme updated", "success")
        except Exception as e:
            _log_admin_theme_error("save failed", e)
            flash("Error saving theme. Please try again.", "error")
        return redirect(url_for("admin_theme"))
    auto = {}
    autoThemes = []
    logos = {}
    favicons = {}
    if db:
        try:
            conf = db.collection("config").document("app").get()
            if conf.exists:
                confd = (conf.to_dict() or {})
                auto = confd.get("autoTheme") or {}
                autoThemes = confd.get("autoThemes") or []
                logos = confd.get("logos") or {}
                favicons = confd.get("favicons") or {}
        except Exception:
            pass
    return render_template("admin_theme.html", themes=list_all_themes(), current=name, auto=auto, autoThemes=autoThemes, logos=logos, favicons=favicons)


def admin_theme_new():
    if request.method == "POST":
        if not db:
            flash("Firestore not configured", "error")
            return redirect(url_for("admin_theme_new"))
        slug = (request.form.get("slug") or "").strip().lower()
        if not slug:
            flash("Slug is required", "error")
            return render_template("admin_theme_form.html", mode="new", data=request.form)
        data = {
            "primary": (request.form.get("primary") or "").strip() or "#0ea5a8",
            "primary_dark": (request.form.get("primary_dark") or "").strip() or "#0b8a8d",
            "background": (request.form.get("background") or "").strip() or "#ffffff",
            "box": (request.form.get("box") or "").strip() or "#edf2f7",
            "text": (request.form.get("text") or "").strip() or "#1f2937",
            "text_secondary": (request.form.get("text_secondary") or "").strip() or "#6b7280",
            "snow": True if request.form.get("snow") == "on" else False,
            "lights": True if request.form.get("lights") == "on" else False,
            "leaves": True if request.form.get("leaves") == "on" else False,
            "string_lights": True if request.form.get("string_lights") == "on" else False,
            "snow_svg": True if request.form.get("snow_svg") == "on" else False,
            "extra_css": (request.form.get("extra_css") or "").strip(),
        }
        try:
            db.collection("themes").document(slug).set(data)
            flash("Theme created", "success")
            return redirect(url_for("admin_theme"))
        except Exception as e:
            _log_admin_theme_error("create failed", e)
            flash("Error saving theme. Please try again.", "error")
            return render_template("admin_theme_form.html", mode="new", data=request.form)
    src = (request.args.get("from") or "").strip()
    data = {}
    if src:
        try:
            vars = get_theme_vars(src)
            if vars:
                data = {
                    "slug": f"{src}-copy",
                    "primary": vars.get("primary"),
                    "primary_dark": vars.get("primary_dark"),
                    "background": vars.get("background"),
                    "box": vars.get("box"),
                    "text": vars.get("text"),
                    "text_secondary": vars.get("text_secondary"),
                    "snow": (vars.get("extras") or {}).get("snow"),
                    "lights": (vars.get("extras") or {}).get("lights"),
                    "leaves": (vars.get("extras") or {}).get("leaves"),
                    "extra_css": (vars.get("extras") or {}).get("custom_css"),
                }
        except Exception:
            pass
    return render_template("admin_theme_form.html", mode="new", data=data)


def admin_theme_edit(slug):
    if not db:
        return "Firestore not configured", 500
    doc = db.collection("themes").document(slug).get()
    if not doc.exists:
        return "Not found", 404
    current = doc.to_dict() or {}
    if request.method == "POST":
        data = {
            "primary": (request.form.get("primary") or "").strip() or "#0ea5a8",
            "primary_dark": (request.form.get("primary_dark") or "").strip() or "#0b8a8d",
            "background": (request.form.get("background") or "").strip() or "#ffffff",
            "box": (request.form.get("box") or "").strip() or "#edf2f7",
            "text": (request.form.get("text") or "").strip() or "#1f2937",
            "text_secondary": (request.form.get("text_secondary") or "").strip() or "#6b7280",
            "snow": True if request.form.get("snow") == "on" else False,
            "lights": True if request.form.get("lights") == "on" else False,
            "leaves": True if request.form.get("leaves") == "on" else False,
            "string_lights": True if request.form.get("string_lights") == "on" else False,
            "snow_svg": True if request.form.get("snow_svg") == "on" else False,
            "extra_css": (request.form.get("extra_css") or "").strip(),
        }
        try:
            db.collection("themes").document(slug).set(data)
            flash("Theme updated", "success")
            return redirect(url_for("admin_theme"))
        except Exception as e:
            _log_admin_theme_error("edit failed", e)
            flash("Error saving theme. Please try again.", "error")
    form_data = {
        "slug": slug,
        "primary": current.get("primary", ""),
        "primary_dark": current.get("primary_dark") or current.get("primaryDark", ""),
        "background": current.get("background", ""),
        "box": current.get("box", ""),
        "text": current.get("text", ""),
        "text_secondary": current.get("text_secondary") or current.get("textSecondary", ""),
        "snow": current.get("snow") or (current.get("extras") or {}).get("snow"),
        "lights": current.get("lights") or (current.get("extras") or {}).get("lights"),
        "leaves": current.get("leaves") or (current.get("extras") or {}).get("leaves"),
        "string_lights": current.get("string_lights") or (current.get("extras") or {}).get("string_lights"),
        "snow_svg": current.get("snow_svg") or (current.get("extras") or {}).get("snow_svg"),
        "extra_css": current.get("extra_css") or (current.get("extras") or {}).get("custom_css"),
    }
    return render_template("admin_theme_form.html", mode="edit", data=form_data)


def admin_theme_delete(slug):
    if not db:
        return "Firestore not configured", 500
    try:
        db.collection("themes").document(slug).delete()
        flash("Theme deleted", "success")
    except Exception as e:
        _log_admin_theme_error("delete failed", e)
        flash("Error deleting theme. Please try again.", "error")
    return redirect(url_for("admin_theme"))


def admin_theme_auto():
    if not db:
        flash("Firestore not configured", "error")
        return redirect(url_for("admin_theme"))
    enabled = request.form.get("enabled") == "on"
    name = (request.form.get("auto_theme") or "").strip()
    start = (request.form.get("auto_start") or "").strip()
    end = (request.form.get("auto_end") or "").strip()
    try:
        db.collection("config").document("app").set({"autoTheme": {"enabled": enabled, "name": name, "start": start, "end": end}}, merge=True)
        flash("Auto theme settings saved", "success")
    except Exception as e:
        _log_admin_theme_error("auto save failed", e)
        flash("Error saving auto theme. Please try again.", "error")
    return redirect(url_for("admin_theme"))


def _save_auto_rules(rules: list[dict]):
    if not db:
        return
    db.collection("config").document("app").set({"autoThemes": rules}, merge=True)


def admin_theme_add_rule():
    if not db:
        flash("Firestore not configured", "error")
        return redirect(url_for("admin_theme"))
    name = (request.form.get("name") or "").strip()
    start = (request.form.get("start") or "").strip()
    end = (request.form.get("end") or "").strip()
    priority = request.form.get("priority") or "0"
    enabled = request.form.get("enabled") == "on"
    try:
        conf = db.collection("config").document("app").get()
        rules = (conf.to_dict() or {}).get("autoThemes") or []
        rid = f"r{int(datetime.now(timezone.utc).timestamp())}"
        weekdays = request.form.getlist("weekdays")
        weekdays = [int(x) for x in weekdays if (x.isdigit())]
        time_start = (request.form.get("time_start") or "").strip()
        time_end = (request.form.get("time_end") or "").strip()
        rules.append({"id": rid, "name": name, "start": start, "end": end, "timeStart": time_start, "timeEnd": time_end, "weekdays": weekdays, "priority": int(priority or 0), "enabled": enabled})
        _save_auto_rules(rules)
        flash("Rule added", "success")
    except Exception as e:
        _log_admin_theme_error("add rule failed", e)
        flash("Error adding rule. Please try again.", "error")
    return redirect(url_for("admin_theme"))


def admin_theme_update_rule():
    if not db:
        flash("Firestore not configured", "error")
        return redirect(url_for("admin_theme"))
    rid = (request.form.get("rid") or "").strip()
    try:
        conf = db.collection("config").document("app").get()
        rules = (conf.to_dict() or {}).get("autoThemes") or []
        new_rules = []
        for r in rules:
            if r.get("id") == rid:
                r = {
                    "id": rid,
                    "name": (request.form.get("name") or r.get("name")),
                    "start": (request.form.get("start") or r.get("start")),
                    "end": (request.form.get("end") or r.get("end")),
                    "timeStart": (request.form.get("time_start") or r.get("timeStart") or ""),
                    "timeEnd": (request.form.get("time_end") or r.get("timeEnd") or ""),
                    "weekdays": [int(x) for x in request.form.getlist("weekdays")] if request.form.getlist("weekdays") else (r.get("weekdays") or []),
                    "priority": int(request.form.get("priority") or r.get("priority") or 0),
                    "enabled": (request.form.get("enabled") == "on"),
                }
            new_rules.append(r)
        _save_auto_rules(new_rules)
        flash("Rule updated", "success")
    except Exception as e:
        _log_admin_theme_error("update rule failed", e)
        flash("Error updating rule. Please try again.", "error")
    return redirect(url_for("admin_theme"))


def admin_theme_delete_rule():
    if not db:
        flash("Firestore not configured", "error")
        return redirect(url_for("admin_theme"))
    rid = (request.form.get("rid") or "").strip()
    try:
        conf = db.collection("config").document("app").get()
        rules = (conf.to_dict() or {}).get("autoThemes") or []
        rules = [r for r in rules if (r.get("id") != rid)]
        _save_auto_rules(rules)
        flash("Rule deleted", "success")
    except Exception as e:
        _log_admin_theme_error("delete rule failed", e)
        flash("Error deleting rule. Please try again.", "error")
    return redirect(url_for("admin_theme"))


def admin_theme_vars(name):
    vars = get_theme_vars(name)
    if not vars:
        return jsonify({"error": "Not found"}), 404
    return jsonify(vars)


def admin_theme_logo():
    if not db:
        flash("Firestore not configured", "error")
        return redirect(url_for("admin_theme"))
    theme = _safe_theme_upload_name(request.form.get("theme"))
    f = request.files.get("file")
    if not f or not f.filename:
        flash("No file uploaded", "error")
        return redirect(url_for("admin_theme"))
    local_path = None
    try:
        local_path, ext = _verified_image_upload(f, theme, {".png", ".jpg", ".jpeg", ".gif"})
        uploaded = upload_to_storage(local_path, f"branding/{theme}/logo{ext}")
        if uploaded:
            url = url_for("branding_asset", theme=theme, asset=f"logo{ext}", _external=True)
        else:
            url = url_for("static", filename="faith_sparks_logo.png")
        db.collection("config").document("app").set({"logos": {theme: url}}, merge=True)
        flash("Logo uploaded", "success")
    except Exception as e:
        _log_admin_theme_error("logo upload failed", e)
        flash("Upload failed. Please try again.", "error")
    finally:
        if local_path:
            try:
                os.remove(local_path)
            except OSError:
                pass
    return redirect(url_for("admin_theme"))


def admin_theme_favicon():
    if not db:
        flash("Firestore not configured", "error")
        return redirect(url_for("admin_theme"))
    theme = _safe_theme_upload_name(request.form.get("theme"))
    f = request.files.get("file")
    if not f or not f.filename:
        flash("No file uploaded", "error")
        return redirect(url_for("admin_theme"))
    local_path = None
    try:
        local_path, ext = _verified_image_upload(f, theme, {".ico", ".png", ".jpg", ".jpeg"})
        uploaded = upload_to_storage(local_path, f"branding/{theme}/favicon{ext}")
        if uploaded:
            url = url_for("branding_asset", theme=theme, asset=f"favicon{ext}", _external=True)
        else:
            url = url_for("static", filename="favicon.ico")
        db.collection("config").document("app").set({"favicons": {theme: url}}, merge=True)
        flash("Favicon uploaded", "success")
    except Exception as e:
        _log_admin_theme_error("favicon upload failed", e)
        flash("Upload failed. Please try again.", "error")
    finally:
        if local_path:
            try:
                os.remove(local_path)
            except OSError:
                pass
    return redirect(url_for("admin_theme"))


def admin_theme_clone_activate():
    if not db:
        flash("Firestore not configured", "error")
        return redirect(url_for("admin_theme"))
    src = (request.form.get("from") or "").strip()
    if not src:
        flash("Missing source theme", "error")
        return redirect(url_for("admin_theme"))
    try:
        vars = get_theme_vars(src)
        if not vars:
            flash("Unknown source theme", "error")
            return redirect(url_for("admin_theme"))
        new_slug = f"{src}-copy-{int(datetime.now(timezone.utc).timestamp())}"
        data = {
            "primary": vars.get("primary"),
            "primary_dark": vars.get("primary_dark"),
            "background": vars.get("background"),
            "box": vars.get("box"),
            "text": vars.get("text"),
            "text_secondary": vars.get("text_secondary"),
            "snow": (vars.get("extras") or {}).get("snow", False),
            "lights": (vars.get("extras") or {}).get("lights", False),
            "leaves": (vars.get("extras") or {}).get("leaves", False),
            "string_lights": (vars.get("extras") or {}).get("string_lights", False),
            "snow_svg": (vars.get("extras") or {}).get("snow_svg", False),
            "extra_css": (vars.get("extras") or {}).get("custom_css", ""),
        }
        db.collection("themes").document(new_slug).set(data)
        db.collection("config").document("app").set({"theme": new_slug}, merge=True)
        flash(f"Cloned and activated: {new_slug}", "success")
    except Exception as e:
        _log_admin_theme_error("clone failed", e)
        flash("Clone failed. Please try again.", "error")
    return redirect(url_for("admin_theme"))
