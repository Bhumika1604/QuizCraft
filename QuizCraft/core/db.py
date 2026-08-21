"""
core/db.py
==========
Single centralized MongoDB connection for the whole project.

WHY: the previous project opened MongoClient in more than one module,
which wastes connections and makes it easy for collections to drift
out of sync. Every app in this project must import collections from
HERE and nowhere else.

Configuration comes from environment variables (see .env.example):
    MONGO_URI       e.g. mongodb://localhost:27017/
    MONGO_DB_NAME   e.g. quizcraft

If USE_MONGOMOCK=True (used only by the automated test suite in
core/tests_logic.py) an in-memory fake Mongo is used instead of a
real server, so the CRUD / adaptive-engine / analytics logic can be
exercised without a live MongoDB installation.
"""
import os
import sys
from pymongo import MongoClient, ASCENDING
from pymongo.errors import ServerSelectionTimeoutError

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/")
MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME", "quizcraft")
USE_MONGOMOCK = os.environ.get("USE_MONGOMOCK", "False") == "True"

_client = None
_db = None


def _connect():
    global _client, _db
    if _db is not None:
        return _db

    if USE_MONGOMOCK:
        import mongomock
        _client = mongomock.MongoClient()
        _db = _client[MONGO_DB_NAME]
        return _db

    try:
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        # Force a round trip so failures surface immediately at startup
        # instead of silently falling back to anything else.
        _client.admin.command("ping")
        _db = _client[MONGO_DB_NAME]
        print(f"MongoDB Connected Successfully -> db='{MONGO_DB_NAME}'")
    except ServerSelectionTimeoutError as exc:
        sys.stderr.write(
            "\n[QuizCraft] Could not connect to MongoDB.\n"
            f"  MONGO_URI = {MONGO_URI}\n"
            f"  Reason    = {exc}\n"
            "  -> Start your local mongod, or set MONGO_URI to a working\n"
            "     MongoDB Atlas / server connection string in your .env file.\n"
        )
        raise
    return _db


def get_db():
    return _connect()


class Collections:
    """Lazy collection accessors so importing this module never opens a
    connection until a collection is actually used (keeps `manage.py check`
    and unit tests that don't touch Mongo fast and side-effect free)."""

    @property
    def users(self):
        return get_db()["users"]

    @property
    def subjects(self):
        return get_db()["subjects"]

    @property
    def questions(self):
        return get_db()["questions"]

    @property
    def quiz_attempts(self):
        return get_db()["quiz_attempts"]

    @property
    def results(self):
        return get_db()["results"]

    @property
    def sessions(self):
        """Auth tokens issued at login (token -> user_id + expiry)."""
        return get_db()["sessions"]


collections = Collections()


def ensure_indexes():
    """Create indexes required for uniqueness/performance. Safe to call
    repeatedly (create_index is idempotent)."""
    db = get_db()
    db["users"].create_index([("email", ASCENDING)], unique=True)
    db["subjects"].create_index([("name", ASCENDING)], unique=True)
    db["questions"].create_index([("subject", ASCENDING), ("difficulty", ASCENDING)])
    db["quiz_attempts"].create_index([("user_id", ASCENDING)])
    db["results"].create_index([("user_id", ASCENDING)])
    db["sessions"].create_index([("token", ASCENDING)], unique=True)
    db["sessions"].create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)
