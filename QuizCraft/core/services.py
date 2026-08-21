"""
core/services.py
=================
All MongoDB CRUD + business logic lives here, organized as small service
classes. Views (api/*.py) stay thin: parse request -> call a service ->
return JSON. This is where the "MongoDB CRUD", "MongoDB queries by subject
and difficulty" and analytics-calculation requirements are implemented.
"""
import secrets
from datetime import datetime, timezone, timedelta

from bson import ObjectId
from bson.errors import InvalidId
from django.contrib.auth.hashers import make_password, check_password

from .db import collections
from .domain import Question, AdaptiveEngine, register_timer, clear_timer, seconds_remaining
from .exceptions import (
    ValidationError, NotFoundError, AuthError, InvalidQuizStateError,
    EmptyQuestionBankError, PermissionDeniedError,
)
from .validators import validate_full_name, validate_email, validate_phone, validate_password

TOKEN_TTL_HOURS = 24 * 7  # 7 days


def to_oid(value, field="id"):
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise ValidationError(f"Invalid {field}.")


def oid_str(value):
    return str(value) if value is not None else None


# ------------------------------------------------------------------ AUTH --
class AuthService:
    @staticmethod
    def register(full_name, email, password, confirm_password, role, phone=""):
        full_name = validate_full_name(full_name)
        email = validate_email(email)
        phone = validate_phone(phone)
        validate_password(password)
        if password != confirm_password:
            raise ValidationError("Passwords do not match.")
        if role not in ("student", "faculty"):
            raise ValidationError("Role must be 'student' or 'faculty'.")

        if collections.users.find_one({"email": email}):
            raise ValidationError("An account with this email already exists.")

        now = datetime.now(timezone.utc)
        user_doc = {
            "full_name": full_name,
            "email": email,
            "phone": phone,
            "password_hash": make_password(password),
            "role": role,
            "created_at": now,
            "updated_at": now,
        }
        result = collections.users.insert_one(user_doc)
        user_doc["_id"] = result.inserted_id
        return user_doc

    @staticmethod
    def login(email, password):
        email = (email or "").strip().lower()
        user = collections.users.find_one({"email": email})
        if not user:
            raise AuthError("No account found with this email.")
        if not check_password(password or "", user["password_hash"]):
            raise AuthError("Incorrect password.")

        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS)
        collections.sessions.insert_one({
            "token": token,
            "user_id": user["_id"],
            "created_at": datetime.now(timezone.utc),
            "expires_at": expires_at,
        })
        return user, token

    @staticmethod
    def logout(token):
        collections.sessions.delete_one({"token": token})

    @staticmethod
    def user_from_token(token):
        if not token:
            return None
        session = collections.sessions.find_one({"token": token})
        if not session:
            return None
        if session["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            collections.sessions.delete_one({"token": token})
            return None
        return collections.users.find_one({"_id": session["user_id"]})

    @staticmethod
    def update_profile(user_id, full_name=None, phone=None):
        updates = {"updated_at": datetime.now(timezone.utc)}
        if full_name is not None:
            updates["full_name"] = validate_full_name(full_name)
        if phone is not None:
            updates["phone"] = validate_phone(phone)
        collections.users.update_one({"_id": to_oid(user_id)}, {"$set": updates})
        return collections.users.find_one({"_id": to_oid(user_id)})

    @staticmethod
    def change_password(user_id, old_password, new_password):
        user = collections.users.find_one({"_id": to_oid(user_id)})
        if not user or not check_password(old_password or "", user["password_hash"]):
            raise ValidationError("Current password is incorrect.")
        validate_password(new_password)
        collections.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"password_hash": make_password(new_password),
                      "updated_at": datetime.now(timezone.utc)}},
        )


def public_user(user: dict) -> dict:
    if not user:
        return None
    return {
        "id": oid_str(user["_id"]),
        "full_name": user["full_name"],
        "email": user["email"],
        "phone": user.get("phone", ""),
        "role": user["role"],
        "created_at": user["created_at"].isoformat() if user.get("created_at") else None,
    }


# -------------------------------------------------------------- SUBJECTS --
class SubjectService:
    @staticmethod
    def list_subjects():
        subjects = list(collections.subjects.find().sort("name", 1))
        out = []
        for s in subjects:
            question_count = collections.questions.count_documents({"subject": s["name"]})
            out.append({
                "id": oid_str(s["_id"]),
                "name": s["name"],
                "description": s.get("description", ""),
                "question_count": question_count,
                "created_at": s["created_at"].isoformat() if s.get("created_at") else None,
            })
        return out

    @staticmethod
    def create_subject(name, description=""):
        name = (name or "").strip()
        if not name or len(name) < 2:
            raise ValidationError("Subject name is required.")
        if collections.subjects.find_one({"name": name}):
            raise ValidationError("This subject already exists.")
        doc = {"name": name, "description": (description or "").strip(),
               "created_at": datetime.now(timezone.utc)}
        result = collections.subjects.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    @staticmethod
    def update_subject(subject_id, name=None, description=None):
        updates = {}
        if name is not None:
            name = name.strip()
            if not name:
                raise ValidationError("Subject name is required.")
            updates["name"] = name
        if description is not None:
            updates["description"] = description.strip()
        if not updates:
            return
        collections.subjects.update_one({"_id": to_oid(subject_id)}, {"$set": updates})

    @staticmethod
    def delete_subject(subject_id):
        subj = collections.subjects.find_one({"_id": to_oid(subject_id)})
        if not subj:
            raise NotFoundError("Subject not found.")
        collections.subjects.delete_one({"_id": subj["_id"]})
        collections.questions.delete_many({"subject": subj["name"]})


# ------------------------------------------------------------- QUESTIONS --
class QuestionService:
    VALID_DIFFICULTIES = {"Easy", "Medium", "Hard"}

    @staticmethod
    def _validate(question_text, subject, options, correct_answer, difficulty, marks):
        question_text = (question_text or "").strip()
        if len(question_text) < 5:
            raise ValidationError("Question text is required (min 5 characters).")
        if not subject:
            raise ValidationError("Subject is required.")
        options = [str(o).strip() for o in (options or []) if str(o).strip()]
        if len(options) != 4:
            raise ValidationError("Exactly 4 non-empty options are required.")
        if len(set(options)) != 4:
            raise ValidationError("Options must be unique.")
        correct_answer = (correct_answer or "").strip()
        if correct_answer not in options:
            raise ValidationError("Correct answer must match one of the four options.")
        if difficulty not in QuestionService.VALID_DIFFICULTIES:
            raise ValidationError("Difficulty must be Easy, Medium or Hard.")
        from .validators import validate_marks
        marks = validate_marks(marks)
        return question_text, options, correct_answer, difficulty, marks

    @staticmethod
    def create(subject, question_text, options, correct_answer, difficulty, marks, created_by):
        question_text, options, correct_answer, difficulty, marks = QuestionService._validate(
            question_text, subject, options, correct_answer, difficulty, marks
        )
        if not collections.subjects.find_one({"name": subject}):
            raise ValidationError("Unknown subject. Create the subject first.")
        now = datetime.now(timezone.utc)
        doc = {
            "question_text": question_text,
            "subject": subject,
            "options": options,
            "correct_answer": correct_answer,
            "difficulty": difficulty,
            "marks": marks,
            "created_by": to_oid(created_by),
            "created_at": now,
            "updated_at": now,
        }
        result = collections.questions.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    @staticmethod
    def update(question_id, **fields):
        existing = collections.questions.find_one({"_id": to_oid(question_id)})
        if not existing:
            raise NotFoundError("Question not found.")
        merged = {
            "question_text": fields.get("question_text", existing["question_text"]),
            "subject": fields.get("subject", existing["subject"]),
            "options": fields.get("options", existing["options"]),
            "correct_answer": fields.get("correct_answer", existing["correct_answer"]),
            "difficulty": fields.get("difficulty", existing["difficulty"]),
            "marks": fields.get("marks", existing["marks"]),
        }
        question_text, options, correct_answer, difficulty, marks = QuestionService._validate(
            merged["question_text"], merged["subject"], merged["options"],
            merged["correct_answer"], merged["difficulty"], merged["marks"]
        )
        collections.questions.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "question_text": question_text, "subject": merged["subject"],
                "options": options, "correct_answer": correct_answer,
                "difficulty": difficulty, "marks": marks,
                "updated_at": datetime.now(timezone.utc),
            }},
        )
        return collections.questions.find_one({"_id": existing["_id"]})

    @staticmethod
    def delete(question_id):
        result = collections.questions.delete_one({"_id": to_oid(question_id)})
        if result.deleted_count == 0:
            raise NotFoundError("Question not found.")

    @staticmethod
    def list_questions(subject=None, difficulty=None, search=None, page=1, page_size=20):
        query = {}
        if subject:
            query["subject"] = subject
        if difficulty:
            query["difficulty"] = difficulty
        if search:
            query["question_text"] = {"$regex": search.strip(), "$options": "i"}
        total = collections.questions.count_documents(query)
        skip = max(0, (page - 1) * page_size)
        docs = list(
            collections.questions.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        )
        return docs, total

    @staticmethod
    def to_public(doc):
        return {
            "id": oid_str(doc["_id"]),
            "question_text": doc["question_text"],
            "subject": doc["subject"],
            "options": doc["options"],
            "correct_answer": doc["correct_answer"],
            "difficulty": doc["difficulty"],
            "marks": doc["marks"],
            "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
        }


# ------------------------------------------------------------------ QUIZ --
class QuizAttemptService:
    NUM_QUESTIONS = 10

    @staticmethod
    def start(user_id, subject):
        if not collections.subjects.find_one({"name": subject}):
            raise ValidationError("Unknown subject.")
        if collections.questions.count_documents({"subject": subject}) == 0:
            raise EmptyQuestionBankError(
                f"No questions available for '{subject}' yet. Ask faculty to add some."
            )

        now = datetime.now(timezone.utc)
        duration = QuizAttemptService.NUM_QUESTIONS * 45

        engine = AdaptiveEngine(subject, "Medium")
        first_question = engine.pick_question(exclude_ids=[])

        attempt = {
            "user_id": to_oid(user_id),
            "subject": subject,
            "status": "in_progress",
            "num_questions": QuizAttemptService.NUM_QUESTIONS,
            "duration_seconds": duration,
            "started_at": now,
            "completed_at": None,
            "current_difficulty": "Medium",
            "difficulty_progression": ["Medium"],
            "asked_question_ids": [to_oid(first_question.id)],
            "current_question": first_question.to_public_dict(),
            "answers": [],  # list of {question_id, question_text, options, correct_answer, difficulty, marks, selected_answer, is_correct}
            "score": 0,
            "total_marks": 0,
            "percentage": 0.0,
        }
        result = collections.quiz_attempts.insert_one(attempt)
        attempt["_id"] = result.inserted_id

        register_timer(str(attempt["_id"]), now, duration)

        return attempt, first_question

    @staticmethod
    def _get_owned_attempt(attempt_id, user_id):
        attempt = collections.quiz_attempts.find_one({"_id": to_oid(attempt_id)})
        if not attempt:
            raise NotFoundError("Quiz attempt not found.")
        if str(attempt["user_id"]) != str(user_id):
            raise PermissionDeniedError("This quiz attempt does not belong to you.")
        return attempt

    @staticmethod
    def current_state(attempt_id, user_id):
        attempt = QuizAttemptService._get_owned_attempt(attempt_id, user_id)
        remaining = seconds_remaining(str(attempt["_id"])) if attempt["status"] == "in_progress" else 0
        if attempt["status"] == "in_progress" and remaining <= 0:
            # Timer expired since we last checked (e.g. browser was closed) -
            # auto-submit now instead of leaving a zombie attempt.
            QuizAttemptService.finalize(attempt_id, user_id, auto=True)
            attempt = collections.quiz_attempts.find_one({"_id": attempt["_id"]})
            remaining = 0
        return attempt, remaining

    @staticmethod
    def submit_answer(attempt_id, user_id, question_id, selected_answer):
        attempt = QuizAttemptService._get_owned_attempt(attempt_id, user_id)
        if attempt["status"] != "in_progress":
            raise InvalidQuizStateError("This quiz attempt has already been submitted.")

        remaining = seconds_remaining(str(attempt["_id"]))
        if remaining <= 0:
            QuizAttemptService.finalize(attempt_id, user_id, auto=True)
            raise InvalidQuizStateError("Time is up — this attempt was auto-submitted.")

        current_q = attempt.get("current_question")
        if not current_q or current_q.get("id") != question_id:
            raise InvalidQuizStateError(
                "This isn't the current question for this attempt (already answered or out of sync)."
            )

        q_doc = collections.questions.find_one({"_id": to_oid(question_id)})
        if not q_doc:
            raise NotFoundError("Question not found.")
        question = Question(q_doc)
        is_correct = question.is_correct(selected_answer)

        answer_record = {
            "question_id": question.id,
            "question_text": question.question_text,
            "options": question.options,
            "correct_answer": question.correct_answer,
            "selected_answer": selected_answer,
            "difficulty": question.difficulty,
            "marks": question.marks,
            "is_correct": is_correct,
        }

        engine = AdaptiveEngine(attempt["subject"], attempt["current_difficulty"])
        next_difficulty = engine.next_difficulty(is_correct)

        collections.quiz_attempts.update_one(
            {"_id": attempt["_id"]},
            {
                "$push": {
                    "answers": answer_record,
                    "difficulty_progression": next_difficulty,
                },
                "$set": {"current_difficulty": next_difficulty, "current_question": None},
            },
        )

        attempt = collections.quiz_attempts.find_one({"_id": attempt["_id"]})
        answered_count = len(attempt["answers"])

        if answered_count >= attempt["num_questions"]:
            return QuizAttemptService.finalize(attempt_id, user_id)

        exclude_ids = [to_oid(x) if not isinstance(x, ObjectId) else x for x in attempt["asked_question_ids"]]
        try:
            next_question = engine.pick_question(exclude_ids=exclude_ids)
        except EmptyQuestionBankError:
            # Ran out of fresh questions for this subject -> finish early
            # gracefully instead of crashing.
            return QuizAttemptService.finalize(attempt_id, user_id)

        collections.quiz_attempts.update_one(
            {"_id": attempt["_id"]},
            {
                "$push": {"asked_question_ids": to_oid(next_question.id)},
                "$set": {"current_question": next_question.to_public_dict()},
            },
        )

        return {
            "attempt_id": oid_str(attempt["_id"]),
            "finished": False,
            "next_question": next_question.to_public_dict(),
            "question_number": answered_count + 1,
            "total_questions": attempt["num_questions"],
            "seconds_remaining": seconds_remaining(str(attempt["_id"])),
            "current_difficulty": next_difficulty,
            "last_answer_correct": is_correct,
        }

    @staticmethod
    def finalize(attempt_id, user_id, auto=False):
        attempt = QuizAttemptService._get_owned_attempt(attempt_id, user_id)
        if attempt["status"] == "completed":
            return QuizAttemptService._result_payload(attempt)

        answers = attempt["answers"]
        correct_count = sum(1 for a in answers if a["is_correct"])
        wrong_count = sum(1 for a in answers if not a["is_correct"])
        unanswered_count = max(0, attempt["num_questions"] - len(answers))
        total_marks = sum(a["marks"] for a in answers) + 0  # marks only from questions actually served
        score = sum(a["marks"] for a in answers if a["is_correct"])
        percentage = round((score / total_marks) * 100, 2) if total_marks else 0.0
        completed_at = datetime.now(timezone.utc)
        time_taken = int((completed_at - attempt["started_at"].replace(tzinfo=timezone.utc)).total_seconds())
        passed = percentage >= 40

        collections.quiz_attempts.update_one(
            {"_id": attempt["_id"]},
            {"$set": {
                "status": "completed",
                "completed_at": completed_at,
                "time_taken_seconds": time_taken,
                "score": score,
                "total_marks": total_marks,
                "percentage": percentage,
                "correct_count": correct_count,
                "wrong_count": wrong_count,
                "unanswered_count": unanswered_count,
                "passed": passed,
                "auto_submitted": auto,
            }},
        )
        clear_timer(str(attempt["_id"]))

        # Mirror a compact summary into `results` (per the required schema).
        collections.results.insert_one({
            "attempt_id": attempt["_id"],
            "user_id": attempt["user_id"],
            "subject": attempt["subject"],
            "score": score,
            "total_marks": total_marks,
            "percentage": percentage,
            "difficulty_progression": attempt["difficulty_progression"],
            "passed": passed,
            "date": completed_at,
        })

        attempt = collections.quiz_attempts.find_one({"_id": attempt["_id"]})
        return QuizAttemptService._result_payload(attempt)

    @staticmethod
    def _result_payload(attempt):
        return {
            "attempt_id": oid_str(attempt["_id"]),
            "finished": True,
            "subject": attempt["subject"],
            "score": attempt["score"],
            "total_marks": attempt["total_marks"],
            "percentage": attempt["percentage"],
            "correct_count": attempt.get("correct_count", 0),
            "wrong_count": attempt.get("wrong_count", 0),
            "unanswered_count": attempt.get("unanswered_count", 0),
            "time_taken_seconds": attempt.get("time_taken_seconds", 0),
            "difficulty_progression": attempt["difficulty_progression"],
            "passed": attempt.get("passed", False),
            "started_at": attempt["started_at"].isoformat(),
            "completed_at": attempt["completed_at"].isoformat() if attempt.get("completed_at") else None,
            "answers": attempt["answers"],
        }

    @staticmethod
    def get_result(attempt_id, user_id):
        attempt = QuizAttemptService._get_owned_attempt(attempt_id, user_id)
        if attempt["status"] != "completed":
            raise InvalidQuizStateError("This quiz attempt has not been submitted yet.")
        return QuizAttemptService._result_payload(attempt)

    @staticmethod
    def history(user_id, subject=None, difficulty=None):
        query = {"user_id": to_oid(user_id), "status": "completed"}
        if subject:
            query["subject"] = subject
        attempts = list(collections.quiz_attempts.find(query).sort("completed_at", -1))
        out = []
        for a in attempts:
            if difficulty and difficulty not in a.get("difficulty_progression", []):
                continue
            out.append({
                "attempt_id": oid_str(a["_id"]),
                "subject": a["subject"],
                "score": a["score"],
                "total_marks": a["total_marks"],
                "percentage": a["percentage"],
                "difficulty_progression": a["difficulty_progression"],
                "passed": a.get("passed", False),
                "time_taken_seconds": a.get("time_taken_seconds", 0),
                "completed_at": a["completed_at"].isoformat() if a.get("completed_at") else None,
            })
        return out
