from datetime import datetime, timezone
from flask import render_template, request, redirect, url_for, session, flash, current_app, g
from firebase_admin import firestore
from faithsparks.services.firestore import db


def admin_gift():
    if request.method == 'POST':
        if not db:
            return 'Firestore not configured', 500
        action = (request.form.get('action') or 'gift').strip()
        if action == 'revoke':
            email = (request.form.get('email') or '').strip().lower()
            if not email:
                flash('Email is required', 'error')
                return redirect(url_for('admin_gift'))
            try:
                db.collection('users').document(email).set({ 'plan': 'free', 'isPro': False, 'gifted': False, 'giftExpiresAt': None, 'updatedAt': firestore.SERVER_TIMESTAMP }, merge=True)
                flash('Gift revoked', 'success')
            except Exception as e:
                current_app.logger.exception("[%s] admin gift revoke failed: %s", getattr(g, "req_id", ""), e)
                flash('Revoke failed. Please try again.', 'error')
            return redirect(url_for('admin_gift'))
        # default: create/update gift
        email = (request.form.get('email') or '').strip().lower()
        plan = (request.form.get('plan') or 'family').strip().lower()
        expires = (request.form.get('expires') or '').strip()
        if not email:
            flash('Email is required', 'error')
            return redirect(url_for('admin_gift'))
        data = {
            'plan': plan,
            'isPro': plan in ('family','classroom','plus','plus_family','plus_classroom'),
            'gifted': True,
            'updatedAt': firestore.SERVER_TIMESTAMP,
        }
        if expires:
            try:
                y,m,d = [int(x) for x in expires.split('-')]
                dt = datetime(y,m,d,23,59,59,tzinfo=timezone.utc)
                data['giftExpiresAt'] = dt
            except Exception:
                flash('Could not parse expiration date; ignoring.', 'warning')
        try:
            db.collection('users').document(email).set(data, merge=True)
            try:
                admin_email = session.get('user_email')
                entry = { 'email': email, 'plan': plan, 'expiresAt': data.get('giftExpiresAt'), 'by': admin_email, 'at': firestore.SERVER_TIMESTAMP }
                db.collection('gifts').add(entry)
            except Exception:
                pass
            flash('Gift plan saved', 'success')
        except Exception as e:
            current_app.logger.exception("[%s] admin gift save failed: %s", getattr(g, "req_id", ""), e)
            flash('Gift save failed. Please try again.', 'error')
        return redirect(url_for('admin_gift'))
    # GET
    gifts = []
    gifted_users = []
    if db:
        try:
            q = db.collection('gifts').order_by('at', direction=firestore.Query.DESCENDING).limit(50).stream()
            for d in q:
                gifts.append(d.to_dict())
        except Exception:
            gifts = []
        try:
            q2 = db.collection('users').where(filter=firestore.FieldFilter('gifted','==', True)).stream()
            for d in q2:
                ud = d.to_dict() or {}
                gifted_users.append({ 'email': d.id, 'plan': ud.get('plan','free'), 'expiresAt': ud.get('giftExpiresAt') })
        except Exception:
            gifted_users = []
    return render_template('admin_gift.html', gifts=gifts, gifted_users=gifted_users)
