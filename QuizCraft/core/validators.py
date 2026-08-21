"""
core/validators.py
===================
Regex-based input validation shared by registration, profile update and
the question bank forms. Backend validation is authoritative — the
frontend also validates for UX, but nothing here trusts the client.
"""
import re
from .exceptions import ValidationError

NAME_RE = re.compile(r"^[A-Za-z][A-Za-z .'-]{1,79}$")
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
PHONE_RE = re.compile(r"^\+?[0-9]{7,15}$")
# at least 8 chars, one letter, one digit
PASSWORD_RE = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).{8,}$")


def validate_full_name(name: str) -> str:
    name = (name or "").strip()
    name = re.sub(r"\s+", " ", name)
    if not NAME_RE.match(name):
        raise ValidationError(
            "Full name must be 2-80 characters and contain only letters, "
            "spaces, apostrophes or hyphens."
        )
    return name


def validate_email(email: str) -> str:
    email = (email or "").strip().lower()
    if not EMAIL_RE.match(email):
        raise ValidationError("Please enter a valid email address.")
    return email


def validate_phone(phone: str) -> str:
    phone = (phone or "").strip()
    if not phone:
        return ""
    if not PHONE_RE.match(phone):
        raise ValidationError("Please enter a valid phone number (7-15 digits).")
    return phone


def validate_password(password: str) -> str:
    if not password or not PASSWORD_RE.match(password):
        raise ValidationError(
            "Password must be at least 8 characters and include at least "
            "one letter and one number."
        )
    return password


def validate_marks(marks) -> int:
    try:
        marks = int(marks)
    except (TypeError, ValueError):
        raise ValidationError("Marks must be a valid whole number.")
    if marks < 1 or marks > 100:
        raise ValidationError("Marks must be between 1 and 100.")
    return marks
