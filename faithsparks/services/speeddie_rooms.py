"""Durable room storage and a fixed JSON bridge to the shared JS rule engine."""
from __future__ import annotations
import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import time
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
MAX_BYTES = 850_000

class RoomError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status

def encoded(value):
    data = json.dumps(value, separators=(",", ":"))
    if len(data.encode()) > MAX_BYTES:
        raise RoomError("Game is too large for a shared room. Use smaller token pictures.")
    return data

def run_engine(state, operation="action", **kwargs):
    node = shutil.which(os.getenv("SPEEDDIE_NODE_BIN", "node"))
    if not node:
        raise RoomError("Shared game engine is not installed on this server.", 503)
    try:
        result = subprocess.run([node, str(ROOT / "speeddie/server-runner.cjs")],
            input=encoded(dict(state=state, operation=operation, **kwargs)),
            capture_output=True, text=True, timeout=5, check=True)
        value = json.loads(result.stdout)
    except (subprocess.SubprocessError, ValueError):
        raise RoomError("The game engine could not complete this action. Your game was kept.", 503)
    if value.get("error"):
        raise RoomError(value["error"])
    return value["state"]

class SQLiteRooms:
    """Explicit local-development store; durable and safe across processes."""
    def __init__(self, path):
        self.path = path
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")
    def connect(self):
        return sqlite3.connect(self.path, timeout=10)
    def get(self, code):
        with self.connect() as db:
            row = db.execute("SELECT payload FROM rooms WHERE id=?", (code,)).fetchone()
        return json.loads(row[0]) if row else None
    def change(self, code, fn):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT payload FROM rooms WHERE id=?", (code,)).fetchone()
            value = fn(json.loads(row[0]) if row else None)
            db.execute("INSERT INTO rooms VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", (code, encoded(value)))
            return copy.deepcopy(value)

class FirestoreRooms:
    def __init__(self):
        from faithsparks.services.firestore import init_firebase
        self.db = init_firebase()[0]
        if self.db is None:
            raise RoomError("Online rooms are not configured on this server. Pass & play still works.", 503)
    def get(self, code):
        snap = self.db.collection("speeddie_rooms").document(code).get()
        return json.loads(snap.to_dict()["payload"]) if snap.exists else None
    def change(self, code, fn):
        from firebase_admin import firestore
        ref = self.db.collection("speeddie_rooms").document(code)
        @firestore.transactional
        def update(tx):
            snap = ref.get(transaction=tx)
            value = fn(json.loads(snap.to_dict()["payload"]) if snap.exists else None)
            tx.set(ref, {"payload": encoded(value), "expiresAt": datetime.fromtimestamp(value["expires"], timezone.utc)})
            return value
        return update(self.db.transaction())

def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()

def live(room):
    if not room or room.get("expires", 0) < time.time():
        raise RoomError("Room not found or expired.", 404)
    return room

def member(room, token):
    live(room)
    person = room["members"].get(token_hash(token))
    if not person:
        raise RoomError("This device is not a member of the room.", 403)
    return person

def public_room(room, token):
    who = member(room, token)
    result = dict(code=room["code"], revision=room["revision"], expires=room["expires"], closed=room.get("closed",False),
                  me={k:who[k] for k in ("id","name","seats","status","host")})
    if who["status"] != "approved":
        return result
    state = copy.deepcopy(room["state"])
    for key in ("decks","undo","undoStack"):
        state.pop(key, None)
    result["state"] = state
    result["members"] = [{k:m[k] for k in ("id","name","seats","status","host")} for m in room["members"].values()
                         if who["host"] or m["status"] == "approved"]
    return result
