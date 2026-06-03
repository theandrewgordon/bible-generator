import re
from flask import render_template, request, redirect, url_for, flash, current_app, g
from faithsparks.services.firestore import db
from faithsparks.services.collections import get_collections


def admin_content():
    data = {}
    free_slugs = []
    collections_list = []
    if db:
        try:
            doc = db.collection('config').document('content').get()
            if doc.exists:
                data = doc.to_dict() or {}
            adoc = db.collection('config').document('app').get()
            if adoc.exists:
                free_slugs = (adoc.to_dict() or {}).get('freeSlugs') or []
            try:
                collections_list = get_collections()
            except Exception:
                collections_list = []
        except Exception:
            pass
    if request.method == 'POST':
        if not db:
            flash('Firestore not configured', 'error')
            return redirect(url_for('admin_content'))
        action = request.form.get('action') or 'save'
        if action in ('apply_preset', 'apply_and_save_active'):
            name = (request.form.get('preset_name') or '').strip()
            if not name:
                flash('Select a preset to apply', 'warning')
                return redirect(url_for('admin_content'))
            try:
                doc = db.collection('config').document('content').get()
                conf = doc.to_dict() if doc.exists else {}
                presets = (conf or {}).get('contentPresets') or {}
                preset = presets.get(name)
                if not preset:
                    flash('Preset not found', 'error')
                else:
                    db.collection('config').document('content').set(preset, merge=True)
                    if action == 'apply_and_save_active':
                        db.collection('config').document('content').set({ 'activePreset': name }, merge=True)
                        flash(f'Applied and set active preset: {name}', 'success')
                    else:
                        flash(f'Applied preset: {name}', 'success')
            except Exception as e:
                current_app.logger.exception("[%s] admin content apply preset failed: %s", getattr(g, "req_id", ""), e)
                flash('Error applying preset. Please try again.', 'error')
            return redirect(url_for('admin_content'))
        elif action == 'save_preset':
            name = (request.form.get('new_preset_name') or '').strip()
            if not name:
                flash('Enter a name for the preset', 'warning')
                return redirect(url_for('admin_content'))
            try:
                payload = {
                    'announcement_enabled': request.form.get('announcement_enabled') == 'on',
                    'announcement_text': (request.form.get('announcement_text') or '').strip(),
                    'home_title': (request.form.get('home_title') or '').strip(),
                    'home_subtitle': (request.form.get('home_subtitle') or '').strip(),
                    'home_hero_image_url': (request.form.get('home_hero_image_url') or '').strip(),
                    'home_cta_text': (request.form.get('home_cta_text') or '').strip() or 'Make a worksheet',
                    'home_cta_url': (request.form.get('home_cta_url') or '/generate').strip(),
                    'home_stat_families': (request.form.get('home_stat_families') or '').strip(),
                    'home_stat_worksheets': (request.form.get('home_stat_worksheets') or '').strip(),
                    'home_stat_rating': (request.form.get('home_stat_rating') or '').strip(),
                    'browse_banner_enabled': request.form.get('browse_banner_enabled') == 'on',
                    'browse_banner_text': (request.form.get('browse_banner_text') or '').strip(),
                    'generate_banner_enabled': request.form.get('generate_banner_enabled') == 'on',
                    'generate_banner_text': (request.form.get('generate_banner_text') or '').strip(),
                    'plus_banner_enabled': request.form.get('plus_banner_enabled') == 'on',
                    'plus_banner_text': (request.form.get('plus_banner_text') or '').strip(),
                    'about_html': (request.form.get('about_html') or '').strip(),
                    'home_intro_html': (request.form.get('home_intro_html') or '').strip(),
                }
                doc = db.collection('config').document('content').get()
                conf = doc.to_dict() if doc.exists else {}
                presets = (conf or {}).get('contentPresets') or {}
                presets[name] = payload
                db.collection('config').document('content').set({ 'contentPresets': presets }, merge=True)
                flash(f'Saved preset: {name}', 'success')
            except Exception as e:
                current_app.logger.exception("[%s] admin content save preset failed: %s", getattr(g, "req_id", ""), e)
                flash('Error saving preset. Please try again.', 'error')
            return redirect(url_for('admin_content'))
        else:
            payload = {
                'announcement_enabled': request.form.get('announcement_enabled') == 'on',
                'announcement_text': (request.form.get('announcement_text') or '').strip(),
                'home_title': (request.form.get('home_title') or '').strip(),
                'home_subtitle': (request.form.get('home_subtitle') or '').strip(),
                'home_hero_image_url': (request.form.get('home_hero_image_url') or '').strip(),
                'home_cta_text': (request.form.get('home_cta_text') or '').strip() or 'Make a worksheet',
                'home_cta_url': (request.form.get('home_cta_url') or '/generate').strip(),
                'home_stat_families': (request.form.get('home_stat_families') or '').strip(),
                'home_stat_worksheets': (request.form.get('home_stat_worksheets') or '').strip(),
                'home_stat_rating': (request.form.get('home_stat_rating') or '').strip(),
                'browse_banner_enabled': request.form.get('browse_banner_enabled') == 'on',
                'browse_banner_text': (request.form.get('browse_banner_text') or '').strip(),
                'generate_banner_enabled': request.form.get('generate_banner_enabled') == 'on',
                'generate_banner_text': (request.form.get('generate_banner_text') or '').strip(),
                'plus_banner_enabled': request.form.get('plus_banner_enabled') == 'on',
                'plus_banner_text': (request.form.get('plus_banner_text') or '').strip(),
                'about_html': (request.form.get('about_html') or '').strip(),
                'home_intro_html': (request.form.get('home_intro_html') or '').strip(),
            }
            try:
                db.collection('config').document('content').set(payload, merge=True)
                all_slugs = []
                free_raw = (request.form.get('free_slugs') or '').strip()
                if free_raw:
                    all_slugs.extend([s.strip().lower() for s in re.split(r'[\s,]+', free_raw) if s.strip()])
                from_checks = request.form.getlist('free_slugs_checks') or []
                all_slugs.extend([s.strip().lower() for s in from_checks if s.strip()])
                if db:
                    db.collection('config').document('app').set({ 'freeSlugs': sorted(list(set(all_slugs))) }, merge=True)
                flash('Content saved', 'success')
            except Exception as e:
                current_app.logger.exception("[%s] admin content save failed: %s", getattr(g, "req_id", ""), e)
                flash('Error saving content. Please try again.', 'error')
            return redirect(url_for('admin_content'))
    return render_template('admin_content.html', data=data, free_slugs=free_slugs, collections_list=collections_list)
