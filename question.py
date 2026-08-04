# =========================================================
# QUIZCRAFT — question.py
# -----------------------------------------------------------
# WHY: this is the core OOP building block of the console-side
# quiz engine (used by main.py / quiz_engine.py / adaptive_engine.py)
# — the same OOP design (Question -> Quiz -> AdaptiveEngine) that
# is explained during the viva. It mirrors the "question" concept
# stored in MongoDB by the Django backend (users/views.py), just
# represented as a plain Python object instead of a Mongo document.
# WHICH MODULE USES THIS: questions.py (builds a list of Question
# objects), main.py (runs the adaptive console quiz), quiz_engine.py
# and adaptive_engine.py (score tracking + adaptive selection).
# =========================================================
class Question:

    def __init__(self, subject, difficulty, question, options, answer):
        self.subject = subject
        self.difficulty = difficulty
        self.question = question
        self.options = options
        self.answer = answer

    def display_question(self):
        """WHAT: prints the question and its numbered options to the
        console. WHY: keeps all display formatting in one place so
        main.py doesn't need to know how a Question is laid out."""
        print("\nSubject :", self.subject)
        print("Difficulty :", self.difficulty)
        print("Question :", self.question)

        for i, option in enumerate(self.options, start=1):
            print(f"{i}. {option}")

    def check_answer(self, user_answer):
        """WHAT: case/whitespace-insensitive comparison between what
        the student typed and the stored correct answer."""
        return user_answer.strip().lower() == self.answer.strip().lower()

    def get_marks(self):
        """
        WHY (new): implements "difficulty based scoring" — a Hard
        question should be worth more than an Easy one instead of
        every question counting as a flat 1 point.
        WHAT: maps this question's difficulty string to a mark value.
        Mirrors DIFFICULTY_MARKS in users/views.py so the console
        demo and the Django backend agree on the same scoring rule.
        WHICH MODULE USES THIS: quiz_engine.py's Quiz.record_answer().
        """
        marks_table = {"easy": 1, "medium": 2, "hard": 3}
        return marks_table.get(self.difficulty.strip().lower(), 1)
