# =========================================================
# QUIZCRAFT — quiz_engine.py
# -----------------------------------------------------------
# WHY: the MCA project requirements ask for OOP classes named
# Question, Quiz and AdaptiveEngine. Question already lives in
# question.py; this file adds the Quiz class, which is the piece
# responsible for running one quiz attempt from start to finish:
# tracking the score, timing the attempt, and validating what the
# student typed.
#
# WHAT THIS DEMONSTRATES (viva talking points):
#   1. Dictionary-based score tracking — self.score_board is a
#      plain dict {"correct": n, "wrong": n, "skipped": n} instead
#      of three separate counter variables.
#   2. datetime-based quiz timer — start_quiz()/end_quiz() capture
#      datetime.now() and elapsed_time() returns a timedelta, the
#      same idea used server-side in users/views.py's submit_result
#      (attempted_at = datetime.now()).
#   3. Regex validation — validate_input() only accepts a single
#      digit 1-4 (or blank to skip), rejecting anything else before
#      it is used to index into the options list.
#   4. Exception handling — every place user input could break the
#      program (bad index, non-numeric input) is wrapped in
#      try/except so the quiz never crashes mid-attempt.
#
# WHICH MODULE USES THIS: main.py (the console adaptive quiz demo).
# =========================================================
import re
from datetime import datetime


class Quiz:
    """Runs a single quiz attempt: score tracking, timing, and
    input validation for one student working through a list of
    Question objects handed to it one at a time by AdaptiveEngine."""

    # Marks awarded per difficulty — mirrors Question.get_marks()
    # and users/views.py's DIFFICULTY_MARKS so console demo and web
    # backend stay consistent.
    DIFFICULTY_MARKS = {"easy": 1, "medium": 2, "hard": 3}

    # REGEX VALIDATION: a valid answer is exactly one digit from 1-4,
    # or an empty string (student pressing Enter to skip).
    ANSWER_PATTERN = re.compile(r'^([1-4])?$')

    def __init__(self, student_name):
        self.student_name = student_name

        # DICTIONARY-BASED SCORE TRACKING: one dict instead of three
        # loose counters — easy to extend (e.g. add "flagged") and
        # easy to print/serialize as-is.
        self.score_board = {"correct": 0, "wrong": 0, "skipped": 0}

        # Weighted marks total, using difficulty-based scoring.
        self.total_marks = 0

        self.start_time = None
        self.end_time = None

    def start_quiz(self):
        """DATETIME-BASED TIMER: records the moment the quiz began."""
        self.start_time = datetime.now()
        print(f"\nQuiz started at {self.start_time.strftime('%H:%M:%S')} for {self.student_name}")

    def end_quiz(self):
        """DATETIME-BASED TIMER: records the moment the quiz ended."""
        self.end_time = datetime.now()

    def elapsed_time(self):
        """Returns the quiz duration as a datetime.timedelta. Falls
        back gracefully if the quiz was never properly started/ended,
        instead of raising a TypeError on None - None."""
        if not self.start_time or not self.end_time:
            return None
        return self.end_time - self.start_time

    def validate_input(self, raw_input):
        """
        REGEX VALIDATION + EXCEPTION HANDLING: confirms the raw
        string the student typed matches ANSWER_PATTERN before it is
        ever converted to an int and used as a list index. Returns
        the matched string, or None if it didn't match — callers
        check for None instead of relying on a try/except at every
        call site.
        """
        raw_input = raw_input.strip()
        match = self.ANSWER_PATTERN.match(raw_input)
        return match.group(0) if match else None

    def record_answer(self, question, raw_input):
        """
        WHY: the single place that turns "what the student typed"
        into a score-board update, so main.py's loop stays simple.
        WHAT: validates input via regex, looks up the chosen option
        safely (EXCEPTION HANDLING guards the index lookup), checks
        it against the Question, and updates score_board + total_marks.
        Returns a short result string for main.py to print.
        """
        choice = self.validate_input(raw_input)

        if choice is None:
            # Invalid characters typed (not 1-4, not blank).
            self.score_board["skipped"] += 1
            return "Invalid input — treated as skipped."

        if choice == "":
            self.score_board["skipped"] += 1
            return "Skipped."

        try:
            selected_option = question.options[int(choice) - 1]
        except (IndexError, ValueError):
            # EXCEPTION HANDLING: guards against an out-of-range
            # option number even though the regex already restricts
            # input to 1-4 — defensive in case options list is short.
            self.score_board["skipped"] += 1
            return "Invalid option number — treated as skipped."

        if question.check_answer(selected_option):
            self.score_board["correct"] += 1
            self.total_marks += question.get_marks()
            return "Correct!"
        else:
            self.score_board["wrong"] += 1
            return f"Wrong. Correct answer: {question.answer}"

    def summary(self):
        """
        WHY: prints the dictionary-based score breakdown plus the
        datetime-derived elapsed time at the end of a quiz attempt —
        the console equivalent of result.html's breakdown cards.
        """
        elapsed = self.elapsed_time()
        print("\n===== QUIZ SUMMARY =====")
        print("Student        :", self.student_name)
        print("Correct        :", self.score_board["correct"])
        print("Wrong          :", self.score_board["wrong"])
        print("Skipped        :", self.score_board["skipped"])
        print("Weighted Score :", self.total_marks, "marks")
        if elapsed is not None:
            print("Time Taken     :", str(elapsed).split(".")[0])
        print("=========================")
