# =========================================================
# QUIZCRAFT — main.py
# -----------------------------------------------------------
# WHY: this is the standalone console demo of QuizCraft's core
# quiz logic, kept separate from the Django + MongoDB web app
# (backend/, users/) so the OOP design (Question, Quiz,
# AdaptiveEngine) can be explained and run in isolation during the
# viva without needing Django or MongoDB running at all.
#
# WHAT IT DOES:
#   1. Builds an AdaptiveEngine over the question pool in questions.py.
#   2. Starts a background timer thread (basic threading requirement)
#      alongside a Quiz instance that tracks score in a dictionary
#      and timestamps the attempt with datetime (matches
#      users/views.py's submit_result()).
#   3. Loops: engine picks a random question at the current
#      difficulty -> student answers (regex-validated input) ->
#      Quiz records correct/wrong/skipped -> engine adapts the next
#      difficulty up or down based on that answer.
#   4. Prints a final dictionary-based score summary.
#
# The original version of this file just looped over a flat list
# with no adaptivity — it has been rewritten here specifically to
# fulfil the "Adaptive Quiz Generator" requirement; Question,
# Quiz and AdaptiveEngine (the classes it wires together) are each
# still in their own file and are individually unit-testable.
# =========================================================
from questions import questions
from quiz_engine import Quiz
from adaptive_engine import AdaptiveEngine

# How many questions make up one console quiz attempt, and how
# long (in seconds) the background timer thread counts down from.
QUESTIONS_PER_ATTEMPT = 5
QUIZ_DURATION_SECONDS = 60


def run_console_quiz():
    """Ties Question + Quiz + AdaptiveEngine together into one
    runnable adaptive quiz attempt. Wrapped in a top-level
    try/except so an unexpected error (e.g. Ctrl+C, empty question
    bank) always ends with a clean message instead of a raw
    traceback — EXCEPTION HANDLING requirement."""

    student_name = input("Enter your name: ").strip() or "Guest"

    engine = AdaptiveEngine(questions, start_difficulty="easy")
    quiz = Quiz(student_name)

    quiz.start_quiz()
    engine.start_timer_thread(QUIZ_DURATION_SECONDS)  # BASIC THREADING

    try:
        for question_number in range(1, QUESTIONS_PER_ATTEMPT + 1):
            question = engine.get_next_question()

            if question is None:
                print("\nNo more unused questions available — ending quiz early.")
                break

            print(f"\n--- Question {question_number} of {QUESTIONS_PER_ATTEMPT} "
                  f"(Difficulty: {engine.current_difficulty.title()}) ---")
            question.display_question()

            # REGEX VALIDATION happens inside Quiz.validate_input(),
            # called from within record_answer() below.
            try:
                raw_input = input("Enter your answer (1-4, or Enter to skip): ")
            except (EOFError, KeyboardInterrupt):
                # EXCEPTION HANDLING: lets the demo be interrupted
                # cleanly (e.g. piped input running out) instead of
                # crashing with a traceback.
                print("\nInput interrupted — ending quiz early.")
                break

            outcome = quiz.record_answer(question, raw_input)
            print(outcome)

            # ADAPTIVE STEP: correct answers push the next question
            # to a harder difficulty, wrong answers ease back down.
            was_correct = outcome == "Correct!"
            new_difficulty = engine.next_difficulty(was_correct)
            print(f"Next difficulty: {new_difficulty.title()}")

    finally:
        # Always stop the background timer thread and stamp the end
        # time, even if the loop above exited early or raised.
        engine.stop_timer_thread()
        quiz.end_quiz()

    quiz.summary()


if __name__ == "__main__":
    try:
        run_console_quiz()
    except Exception as e:
        # Top-level safety net — the console demo should never end
        # in a raw Python traceback during a live viva demo.
        print("QuizCraft console demo stopped due to an error:", e)
