"""Isolated local browser-test server with in-memory storage and no paid services."""
import os
import sys
from pathlib import Path
os.environ.setdefault("OPENAI_API_KEY", "local-test-not-a-key")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_same_brain_launch import Store
from faithsparks.views import public,lab_games
from flask import Flask
from types import SimpleNamespace
store=Store(); public.db=store;lab_games.db=lambda:store
public.firestore.transactional=lambda fn:fn;lab_games.cloud_firestore.transactional=lambda fn:fn
public.check_rate_limit=lambda *a,**k:SimpleNamespace(allowed=True)
app=Flask(__name__);app.secret_key='local-preview';app.register_blueprint(public.bp);app.register_blueprint(lab_games.bp)
app.run(port=8765,threaded=False)
