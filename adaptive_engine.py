# =========================================================
# QUIZCRAFT — adaptive_engine.py
# -----------------------------------------------------------
# WHY: implements the "Adaptive Quiz Generator" requirement as an
# explainable, self-contained OOP class for the viva. It is the
# console counterpart of users/views.py's generate_adaptive_quiz()
# DRF endpoint — same core idea (start at some difficulty, move up
# after a correct answer, move down after a wrong one, never repeat
# a question) implemented in plain Python instead of MongoDB
# aggregation.
#
# WHAT THIS DEMONSTRATES (viva talking points):
#   1. Random question selection — random.choice() picks the next
#      question from whichever difficulty pool is currently active,
#      so two attempts at the same difficulty ladder rarely look
#      identical.
#   2. Adaptive difficulty stepping — next_difficulty() walks up the
#      ladder (easy -> medium -> hard) after a correct answer and
#      back down after a wrong one, clamped at both ends.
#   3. Basic threading — start_timer_thread() runs a background
#      countdown using threading.Thread so the console can show a
#      live "time remaining" readout without blocking the main
#      thread that is waiting on input().
#   4. Exception handling — guards against a requested difficulty
#      having no remaining unused questions.
#
# WHICH MODULE USES THIS: main.py (the console adaptive quiz demo).
# =========================================================
import random
import threading
import time


class AdaptiveEngine:
    """Chooses the next question to ask based on the student's
    running performance, and (optionally) runs a background timer
    thread alongside the quiz."""

    # The difficulty ladder, in order from easiest to hardest —
    # used to step up/down after each answer.
    LADDER = ["easy", "medium", "hard"]

    def __init__(self, question_pool, start_difficulty="easy"):
        """
        question_pool: a list of Question objects (see questions.py).
        start_difficulty: which rung of the ladder to begin on.
        """
        self.question_pool = question_pool
        self.current_difficulty = start_difficulty if start_difficulty in self.LADDER else "easy"
        self.asked_questions = []  # avoids repeating a question in one attempt

        # threading.Event lets the background timer thread know when
        # to stop cleanly instead of running forever.
        self._stop_timer = threading.Event()
        self._timer_thread = None

    def _pool_for_difficulty(self, difficulty):
        """Filters the full question pool down to one difficulty
        level and removes anything already asked this attempt."""
        return [
            q for q in self.question_pool
            if q.difficulty.strip().lower() == difficulty
            and q not in self.asked_questions
        ]

    def get_next_question(self):
        """
        RANDOM QUESTION SELECTION: returns one Question object from
        the current difficulty pool, chosen with random.choice().
        EXCEPTION HANDLING: if the current difficulty pool has run
        dry, it tries neighbouring difficulties before giving up, so
        a thin question bank doesn't crash the console demo.
        """
        try:
            pool = self._pool_for_difficulty(self.current_difficulty)

            if not pool:
                # Fall back to any difficulty that still has unused
                # questions, closest on the ladder first.
                for level in self.LADDER:
                    pool = self._pool_for_difficulty(level)
                    if pool:
                        break

            if not pool:
                return None  # question bank for this subject is exhausted

            chosen = random.choice(pool)
            self.asked_questions.append(chosen)
            return chosen

        except Exception as e:
            print("AdaptiveEngine failed to select a question:", e)
            return None

    def next_difficulty(self, was_correct):
        """
        ADAPTIVE STEP: moves one rung up the ladder after a correct
        answer, one rung down after a wrong one, clamped so it never
        goes past "hard" or below "easy". Mirrors the weighted
        distribution used server-side in generate_adaptive_quiz().
        """
        index = self.LADDER.index(self.current_difficulty)

        if was_correct and index < len(self.LADDER) - 1:
            index += 1
        elif not was_correct and index > 0:
            index -= 1

        self.current_difficulty = self.LADDER[index]
        return self.current_difficulty

    # -----------------------------------------------------
    # BASIC THREADING DEMONSTRATION
    # -----------------------------------------------------
    def start_timer_thread(self, seconds):
        """
        WHY: shows a live countdown in the console WHILE the main
        thread is blocked waiting on input() for the next answer —
        something a single-threaded loop cannot do.
        WHAT: spawns a daemon background thread that prints the time
        remaining once every few seconds until stop_timer_thread()
        sets the stop event, or time runs out.
        """
        def _countdown():
            remaining = seconds
            while remaining > 0 and not self._stop_timer.is_set():
                time.sleep(5)
                remaining -= 5
                if remaining > 0 and not self._stop_timer.is_set():
                    print(f"\n[Timer] {remaining} seconds remaining...")

        self._stop_timer.clear()
        self._timer_thread = threading.Thread(target=_countdown, daemon=True)
        self._timer_thread.start()

    def stop_timer_thread(self):
        """Signals the background countdown thread to stop cleanly."""
        self._stop_timer.set()
