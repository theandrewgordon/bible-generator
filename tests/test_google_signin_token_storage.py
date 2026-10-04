import hashlib
import unittest

from flask import session

import app


class _Snapshot:
    def __init__(self, data):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._data or {})


class _Document:
    def __init__(self, rows, path):
        self.rows = rows
        self.path = path

    def get(self):
        return _Snapshot(self.rows.get(self.path))

    def set(self, data):
        self.rows[self.path] = dict(data)

    def delete(self):
        self.rows.pop(self.path, None)


class _Collection:
    def __init__(self, rows, name):
        self.rows = rows
        self.name = name

    def document(self, document_id):
        return _Document(self.rows, f"{self.name}/{document_id}")


class _Database:
    def __init__(self):
        self.rows = {}

    def collection(self, name):
        return _Collection(self.rows, name)


class _Blueprint:
    name = "google"


class GoogleSigninTokenStorageTests(unittest.TestCase):
    def test_legacy_cookie_token_is_migrated_to_encrypted_firestore_reference(self):
        database = _Database()
        storage = app.EncryptedFirestoreGoogleTokenStorage()
        noisy = "".join(hashlib.sha256(str(index).encode()).hexdigest() for index in range(100))
        token = {
            "access_token": "access-secret-" + noisy[:900],
            "id_token": "identity-secret-" + noisy[900:4400],
            "refresh_token": "refresh-secret-" + noisy[4400:6000],
            "token_type": "Bearer",
            "expires_at": 12345.0,
        }
        original_db = app.db
        app._GOOGLE_SIGNIN_TOKEN_CACHE.clear()
        try:
            app.db = database
            with app.app.test_request_context("/"):
                session["google_oauth_token"] = token
                before = app._signed_session_size()

                self.assertEqual(storage.get(_Blueprint()), token)

                after = app._signed_session_size()
                handle = session[app._GOOGLE_SIGNIN_TOKEN_SESSION_KEY]
                stored = database.rows[f"{app._GOOGLE_SIGNIN_TOKEN_COLLECTION}/{handle}"]
                self.assertNotIn("google_oauth_token", session)
                self.assertGreater(before, app._COOKIE_SESSION_SOFT_LIMIT)
                self.assertLess(after, app._COOKIE_SESSION_SOFT_LIMIT)
                self.assertLess(after, before)
                self.assertNotIn("access-secret", stored["encryptedToken"])

                app._GOOGLE_SIGNIN_TOKEN_CACHE.clear()
                self.assertEqual(storage.get(_Blueprint()), token)
                storage.delete(_Blueprint())
                self.assertNotIn(app._GOOGLE_SIGNIN_TOKEN_SESSION_KEY, session)
                self.assertNotIn(f"{app._GOOGLE_SIGNIN_TOKEN_COLLECTION}/{handle}", database.rows)
        finally:
            app.db = original_db
            app._GOOGLE_SIGNIN_TOKEN_CACHE.clear()


if __name__ == "__main__":
    unittest.main()
