"""
core/domain.py
===============
The academic "core" of QuizCraft: Question, Quiz and AdaptiveEngine.

Demonstrates (per project requirements):
  - Lists for questions
  - Dictionaries for score tracking
  - Conditionals for adaptive difficulty logic
  - `random` module for question selection
  - `datetime` for timer / timestamps
  - Exception handling for empty question banks / invalid quiz states
  - threading for concurrent per-attempt timer bookkeeping
"""
import random
import threading
from datetime import datetime, timezone, timedelta

from .exceptions import EmptyQuestionBankError, InvalidQuizStateError
from .db import collections

DIFFICULTIES = ["Easy", "Medium", "Hard"]

# One lock per process guards the in-memory "active timers" table so that
# concurrent requests (e.g. a student opening the quiz in two tabs, or the
# server handling several students' submissions at once) can't corrupt the
# shared bookkeeping structure. This is a genuine (if small) use of
# threading: without the lock, two near-simultaneous submit requests for
# different attempts could interleave dict writes non-deterministically.
_timer_lock = threading.Lock()
_active_timers = {}  # attempt_id (str) -> {"started_at": datetime, "duration": int}


def register_timer(attempt_id: str, started_at: datetime, duration_seconds: int):
    with _timer_lock:
        _active_timers[attempt_id] = {
            "started_at": started_at,
            "duration": duration_seconds,
        }


def clear_timer(attempt_id: str):
    with _timer_lock:
        _active_timers.pop(attempt_id, None)


def seconds_remaining(attempt_id: str) -> int:
    """Server-side authoritative check of how much time is left. Even if a
    client's on-screen timer is tampered with, the backend re-derives the
    truth from started_at + duration."""
    with _timer_lock:
        entry = _active_timers.get(attempt_id)
    if not entry:
        return 0
    elapsed = (datetime.now(timezone.utc) - entry["started_at"]).total_seconds()
    return max(0, int(entry["duration"] - elapsed))


class Question:
    """Wraps a single question document from MongoDB into a clean object
    with ONE consistent schema used everywhere (API, JS, evaluation):

        {
          "id": "...",
          "question_text": "...",
          "options": ["...", "...", "...", "..."],
          "correct_answer": "...",   # exact text of the correct option
          "subject": "...",
          "difficulty": "Medium",
          "marks": 1
        }
    """

    def __init__(self, doc: dict):
        self.id = str(doc.get("_id") or doc.get("id"))
        self.question_text = doc["question_text"]
        self.options = list(doc["options"])
        self.correct_answer = doc["correct_answer"]
        self.subject = doc["subject"]
        self.difficulty = doc["difficulty"]
        self.marks = int(doc.get("marks", 1))

    def is_correct(self, selected_answer) -> bool:
        if selected_answer is None:
            return False
        return str(selected_answer).strip() == str(self.correct_answer).strip()

    def to_public_dict(self) -> dict:
        """What the student sees WHILE taking the quiz — no correct_answer."""
        return {
            "id": self.id,
            "question_text": self.question_text,
            "options": self.options,
            "subject": self.subject,
            "difficulty": self.difficulty,
            "marks": self.marks,
        }

    def to_full_dict(self) -> dict:
        """Includes the correct answer — used only for result review /
        evaluation, never sent to the client before submission."""
        d = self.to_public_dict()
        d["correct_answer"] = self.correct_answer
        return d


class AdaptiveEngine:
    """Implements the adaptive difficulty state machine described in the
    spec:

        Medium + correct   -> Hard
        Hard   + correct   -> Hard   (stays)
        Hard   + incorrect -> Medium
        Medium + incorrect -> Easy
        Easy   + correct   -> Medium
        Easy   + incorrect -> Easy   (stays)
    """

    def __init__(self, subject: str, starting_difficulty: str = "Medium"):
        self.subject = subject
        self.current_difficulty = starting_difficulty
        self.progression = [starting_difficulty]

    def next_difficulty(self, was_correct: bool) -> str:
        d = self.current_difficulty
        if d == "Medium":
            d = "Hard" if was_correct else "Easy"
        elif d == "Hard":
            d = "Hard" if was_correct else "Medium"
        elif d == "Easy":
            d = "Medium" if was_correct else "Easy"
        else:
            d = "Medium"
        self.current_difficulty = d
        self.progression.append(d)
        return d

    def pick_question(self, exclude_ids, count_per_difficulty_cache=None) -> Question:
        """Selects a random question at the current difficulty for this
        subject from MongoDB, falling back gracefully to neighbouring
        difficulties (never crashing, never returning an empty quiz if
        ANY valid question exists for the subject)."""
        order = self._fallback_order(self.current_difficulty)
        for difficulty in order:
            candidates = list(
                collections.questions.find(
                    {
                        "subject": self.subject,
                        "difficulty": difficulty,
                        "_id": {"$nin": exclude_ids},
                    }
                )
            )
            if candidates:
                doc = random.choice(candidates)
                return Question(doc)
        raise EmptyQuestionBankError(
            f"No more unused questions are available for subject "
            f"'{self.subject}'."
        )

    @staticmethod
    def _fallback_order(current):
        """Try the current difficulty first, then the closest neighbours,
        so a thin question bank still produces a full quiz instead of
        crashing or returning fewer questions than requested."""
        order = {
            "Easy": ["Easy", "Medium", "Hard"],
            "Medium": ["Medium", "Easy", "Hard"],
            "Hard": ["Hard", "Medium", "Easy"],
        }
        return order.get(current, DIFFICULTIES)


class Quiz:
    """Represents one quiz attempt's runtime state (used by
    core.services.QuizAttemptService). Questions are picked ONE AT A TIME
    by the AdaptiveEngine as the student answers, so difficulty genuinely
    adapts in real time rather than being pre-decided:

        pick question (Medium) -> student answers -> evaluate ->
        AdaptiveEngine.next_difficulty() -> pick next question -> ...

    Scoring uses a dict keyed by question id for O(1) lookups when the
    result page is generated.
    """

    DEFAULT_SECONDS_PER_QUESTION = 45

    def __init__(self, user_id: str, subject: str, num_questions: int = 10):
        self.user_id = user_id
        self.subject = subject
        self.num_questions = num_questions
        self.engine = AdaptiveEngine(subject, starting_difficulty="Medium")
        self.asked_ids = []  # list of ObjectIds already shown, so we never repeat
        self.answers = {}  # dict: question_id -> {"selected", "correct", "marks", ...}
        self.started_at = datetime.now(timezone.utc)
        self.duration_seconds = num_questions * self.DEFAULT_SECONDS_PER_QUESTION

    def total_marks_so_far(self) -> int:
        return sum(a["marks"] for a in self.answers.values() if a["is_correct"])
