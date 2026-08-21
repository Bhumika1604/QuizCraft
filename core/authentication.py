"""
core/authentication.py
=======================
Custom DRF authentication that validates a Bearer token against the
`sessions` collection in MongoDB (see core.services.AuthService). This is
ONE consistent auth architecture used by every protected endpoint - no
mixing of Django sessions and tokens.
"""
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .services import AuthService


class MongoUser:
    """Thin wrapper so request.user behaves enough like a user object for
    DRF's permission plumbing (is_authenticated) while the real document
    stays a plain dict at request.user.doc."""

    def __init__(self, doc):
        self.doc = doc
        self.is_authenticated = True

    def __getitem__(self, key):
        return self.doc[key]

    def get(self, key, default=None):
        return self.doc.get(key, default)

    @property
    def id(self):
        return str(self.doc["_id"])

    @property
    def role(self):
        return self.doc["role"]


class TokenAuthentication(BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith(f"{self.keyword} "):
            return None
        token = auth_header[len(self.keyword) + 1:].strip()
        if not token:
            return None
        user_doc = AuthService.user_from_token(token)
        if not user_doc:
            raise AuthenticationFailed("Invalid or expired session token.")
        return (MongoUser(user_doc), token)

    def authenticate_header(self, request):
        # Declaring this makes DRF return a proper 401 (with a
        # WWW-Authenticate header) for missing/invalid tokens instead of
        # silently downgrading to a 403, which is what happens when an
        # authenticator doesn't implement this method.
        return self.keyword
