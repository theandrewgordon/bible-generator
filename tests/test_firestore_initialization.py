import json
import os
import unittest
from unittest.mock import patch

from faithsparks.services import firestore as firestore_service


class FirestoreInitializationTests(unittest.TestCase):
    def setUp(self):
        self.original_db = firestore_service._db
        self.original_storage_client = firestore_service._storage_client
        self.original_initialized = firestore_service._initialized
        firestore_service._db = None
        firestore_service._storage_client = None
        firestore_service._initialized = False

    def tearDown(self):
        firestore_service._db = self.original_db
        firestore_service._storage_client = self.original_storage_client
        firestore_service._initialized = self.original_initialized

    def test_storage_failure_does_not_disable_firestore(self):
        credentials_json = json.dumps({"project_id": "test-project"})
        fake_firestore_client = object()

        with (
            patch.dict(os.environ, {"FIREBASE_CREDS_JSON": credentials_json}),
            patch.object(firestore_service, "STORAGE_BUCKET", "test-bucket"),
            patch.object(firestore_service.firebase_admin, "_apps", {"default": object()}),
            patch.object(firestore_service.firestore, "client", return_value=fake_firestore_client),
            patch.object(
                firestore_service.storage.Client,
                "from_service_account_info",
                side_effect=RuntimeError("storage unavailable"),
            ),
        ):
            db, storage_client = firestore_service.init_firebase()

        self.assertIs(db, fake_firestore_client)
        self.assertIsNone(storage_client)
        self.assertTrue(firestore_service._initialized)

    def test_failed_firestore_initialization_can_be_retried(self):
        credentials_json = json.dumps({"project_id": "test-project"})
        fake_firestore_client = object()

        with (
            patch.dict(os.environ, {"FIREBASE_CREDS_JSON": credentials_json}),
            patch.object(firestore_service, "STORAGE_BUCKET", None),
            patch.object(firestore_service.firebase_admin, "_apps", {"default": object()}),
            patch.object(
                firestore_service.firestore,
                "client",
                side_effect=[RuntimeError("temporary failure"), fake_firestore_client],
            ),
        ):
            first_db, _ = firestore_service.init_firebase()
            second_db, _ = firestore_service.init_firebase()

        self.assertIsNone(first_db)
        self.assertIs(second_db, fake_firestore_client)

    def test_accessor_treats_falsey_client_as_available(self):
        class FalseyClient:
            def __bool__(self):
                return False

        firestore_service._db = FalseyClient()
        firestore_service._initialized = True

        self.assertTrue(firestore_service.db)

    def test_initialized_client_is_returned_by_identity(self):
        client = object()
        firestore_service._db = client
        firestore_service._initialized = True

        returned, _ = firestore_service.init_firebase()

        self.assertIs(returned, client)


class FirebaseCredentialValidationTests(unittest.TestCase):
    def test_validation_does_not_initialize_firebase_client(self):
        credentials_json = json.dumps({"project_id": "test-project"})

        with (
            patch.dict(os.environ, {"FIREBASE_CREDS_JSON": credentials_json}),
            patch.object(firestore_service.credentials, "Certificate") as certificate,
            patch.object(firestore_service.firestore, "client") as client,
        ):
            firestore_service.validate_firebase_credentials()

        certificate.assert_called_once_with({"project_id": "test-project"})
        client.assert_not_called()


if __name__ == "__main__":
    unittest.main()
