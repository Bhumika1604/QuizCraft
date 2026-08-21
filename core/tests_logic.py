"""
core/tests_logic.py
====================
End-to-end logic tests that exercise the REAL code paths in
core/services.py and core/analytics.py against an in-memory MongoDB
(mongomock), since a live mongod isn't available in the dev/CI sandbox
this was built in. On a machine with real MongoDB running, run these
against it too by unsetting USE_MONGOMOCK — the code under test is
identical either way (same PyMongo driver calls).

Run with:  USE_MONGOMOCK=True python manage.py test core.tests_logic
"""
import os
os.environ.setdefault("USE_MONGOMOCK", "True")

from django.test import SimpleTestCase

from core.db import get_db, ensure_indexes
from core.services import (
    AuthService, SubjectService, QuestionService, QuizAttemptService, public_user,
)
from core import analytics as core_analytics
from core.exceptions import (
    ValidationError, AuthError, EmptyQuestionBankError, InvalidQuizStateError,
    PermissionDeniedError,
)


class QuizCraftLogicTests(SimpleTestCase):
    databases = []  # this suite never touches Django's own sqlite db

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Fresh mongomock database per test run.
        get_db()
        ensure_indexes()

    # ---------------------------------------------------------- AUTH ----
    def test_01_register_validates_and_creates_user(self):
        with self.assertRaises(ValidationError):
            AuthService.register("A", "bad-email", "short", "short", "student")

        user = AuthService.register(
            "Test Student", "student1@test.com", "Password123", "Password123", "student", "9998887777",
        )
        self.assertEqual(user["email"], "student1@test.com")
        self.assertTrue(user["password_hash"] != "Password123")  # hashed, not plaintext

        with self.assertRaises(ValidationError):
            AuthService.register(
                "Dup", "student1@test.com", "Password123", "Password123", "student",
            )

    def test_02_login_success_and_failure(self):
        AuthService.register("Login Test", "login1@test.com", "Password123", "Password123", "student")
        user, token = AuthService.login("login1@test.com", "Password123")
        self.assertIsNotNone(token)
        self.assertEqual(user["email"], "login1@test.com")

        with self.assertRaises(AuthError):
            AuthService.login("login1@test.com", "wrongpassword")
        with self.assertRaises(AuthError):
            AuthService.login("doesnotexist@test.com", "Password123")

        # token resolves back to the right user
        fetched = AuthService.user_from_token(token)
        self.assertEqual(fetched["email"], "login1@test.com")

        AuthService.logout(token)
        self.assertIsNone(AuthService.user_from_token(token))

    # ------------------------------------------------------ SUBJECTS ----
    def test_03_subject_crud(self):
        subj = SubjectService.create_subject("Test Subject", "desc")
        self.assertEqual(subj["name"], "Test Subject")
        with self.assertRaises(ValidationError):
            SubjectService.create_subject("Test Subject")  # duplicate

        SubjectService.update_subject(str(subj["_id"]), description="updated")
        listed = SubjectService.list_subjects()
        found = next(s for s in listed if s["name"] == "Test Subject")
        self.assertEqual(found["description"], "updated")
        self.assertEqual(found["question_count"], 0)

    # ----------------------------------------------------- QUESTIONS ----
    def test_04_question_crud_and_validation(self):
        faculty = AuthService.register("Faculty One", "fac1@test.com", "Password123", "Password123", "faculty")
        SubjectService.create_subject("QBank Subject", "")

        with self.assertRaises(ValidationError):
            QuestionService.create(
                subject="QBank Subject", question_text="Too short",
                options=["a", "a", "b", "c"], correct_answer="a",
                difficulty="Easy", marks=1, created_by=str(faculty["_id"]),
            )  # duplicate options

        q = QuestionService.create(
            subject="QBank Subject", question_text="What is 2 + 2?",
            options=["3", "4", "5", "6"], correct_answer="4",
            difficulty="Easy", marks=1, created_by=str(faculty["_id"]),
        )
        self.assertEqual(q["correct_answer"], "4")

        updated = QuestionService.update(str(q["_id"]), marks=5)
        self.assertEqual(updated["marks"], 5)

        docs, total = QuestionService.list_questions(subject="QBank Subject")
        self.assertEqual(total, 1)

        QuestionService.delete(str(q["_id"]))
        docs, total = QuestionService.list_questions(subject="QBank Subject")
        self.assertEqual(total, 0)

    def test_05_empty_question_bank_raises(self):
        SubjectService.create_subject("Empty Subject", "")
        with self.assertRaises(EmptyQuestionBankError):
            QuizAttemptService.start("000000000000000000000000", "Empty Subject")

    # -------------------------------------------- FULL ADAPTIVE QUIZ FLOW
    def _seed_full_subject(self, name, faculty_id):
        SubjectService.create_subject(name, "")
        bank = []
        for difficulty in ("Easy", "Medium", "Hard"):
            for i in range(4):
                q = QuestionService.create(
                    subject=name, question_text=f"{difficulty} Q{i} — sample question text?",
                    options=["A", "B", "C", "D"], correct_answer="A",
                    difficulty=difficulty, marks=2, created_by=faculty_id,
                )
                bank.append(q)
        return bank

    def test_06_full_adaptive_quiz_flow_all_correct(self):
        faculty = AuthService.register("Faculty Two", "fac2@test.com", "Password123", "Password123", "faculty")
        student = AuthService.register("Student Two", "stu2@test.com", "Password123", "Password123", "student")
        self._seed_full_subject("Adaptive Subject A", str(faculty["_id"]))

        attempt, first_q = QuizAttemptService.start(str(student["_id"]), "Adaptive Subject A")
        self.assertEqual(attempt["current_difficulty"], "Medium")
        self.assertEqual(first_q.difficulty, "Medium")

        difficulties_seen = [first_q.difficulty]
        current_q = first_q
        result = None
        for _ in range(10):
            result = QuizAttemptService.submit_answer(
                str(attempt["_id"]), str(student["_id"]), current_q.id, current_q.correct_answer,
            )
            if result["finished"]:
                break
            difficulties_seen.append(result["current_difficulty"])
            from core.domain import Question
            current_q = Question({
                "_id": result["next_question"]["id"],
                "question_text": result["next_question"]["question_text"],
                "options": result["next_question"]["options"],
                "correct_answer": "A",  # we know it deterministically in this seed
                "subject": result["next_question"]["subject"],
                "difficulty": result["next_question"]["difficulty"],
                "marks": result["next_question"]["marks"],
            })

        self.assertTrue(result["finished"])
        self.assertEqual(result["percentage"], 100.0)
        self.assertEqual(result["correct_count"], 10)
        # Always-correct answers should climb to Hard and stay there.
        self.assertIn("Hard", difficulties_seen)
        self.assertEqual(difficulties_seen[-1], "Hard")

        # Duplicate submission after completion must fail cleanly.
        with self.assertRaises(InvalidQuizStateError):
            QuizAttemptService.submit_answer(
                str(attempt["_id"]), str(student["_id"]), current_q.id, "A",
            )

        # Another user cannot access this attempt.
        other = AuthService.register("Student Three", "stu3@test.com", "Password123", "Password123", "student")
        with self.assertRaises(PermissionDeniedError):
            QuizAttemptService.get_result(str(attempt["_id"]), str(other["_id"]))

        # Result is retrievable and history reflects the attempt.
        fetched_result = QuizAttemptService.get_result(str(attempt["_id"]), str(student["_id"]))
        self.assertEqual(fetched_result["percentage"], 100.0)

        history = QuizAttemptService.history(str(student["_id"]))
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["percentage"], 100.0)

    def test_07_adaptive_engine_moves_down_on_wrong_answers(self):
        faculty = AuthService.register("Faculty Three", "fac3@test.com", "Password123", "Password123", "faculty")
        student = AuthService.register("Student Four", "stu4@test.com", "Password123", "Password123", "student")
        self._seed_full_subject("Adaptive Subject B", str(faculty["_id"]))

        attempt, first_q = QuizAttemptService.start(str(student["_id"]), "Adaptive Subject B")
        self.assertEqual(first_q.difficulty, "Medium")

        # Answer wrong on purpose ("Z" never matches the correct answer "A")
        result = QuizAttemptService.submit_answer(
            str(attempt["_id"]), str(student["_id"]), first_q.id, "Z",
        )
        self.assertFalse(result["last_answer_correct"])
        self.assertEqual(result["current_difficulty"], "Easy")  # Medium + wrong -> Easy

    # -------------------------------------------------------- ANALYTICS --
    def test_08_dashboard_and_analytics_reflect_real_attempt(self):
        faculty = AuthService.register("Faculty Four", "fac4@test.com", "Password123", "Password123", "faculty")
        student = AuthService.register("Student Five", "stu5@test.com", "Password123", "Password123", "student")
        self._seed_full_subject("Analytics Subject", str(faculty["_id"]))

        before = core_analytics.student_dashboard(str(student["_id"]))
        self.assertEqual(before["quizzes_attempted"], 0)
        self.assertEqual(before["average_score"], 0.0)

        attempt, first_q = QuizAttemptService.start(str(student["_id"]), "Analytics Subject")
        current_q = first_q
        for _ in range(10):
            result = QuizAttemptService.submit_answer(
                str(attempt["_id"]), str(student["_id"]), current_q.id, current_q.correct_answer,
            )
            if result["finished"]:
                break
            from core.domain import Question
            current_q = Question({
                "_id": result["next_question"]["id"],
                "question_text": result["next_question"]["question_text"],
                "options": result["next_question"]["options"],
                "correct_answer": "A",
                "subject": result["next_question"]["subject"],
                "difficulty": result["next_question"]["difficulty"],
                "marks": result["next_question"]["marks"],
            })

        after = core_analytics.student_dashboard(str(student["_id"]))
        self.assertEqual(after["quizzes_attempted"], 1)
        self.assertEqual(after["average_score"], 100.0)
        self.assertEqual(after["best_score"], 100.0)
        self.assertEqual(after["day_streak"], 1)
        # Other tests in this shared in-memory DB may have also scored 100%,
        # so we can only assert this student IS ranked (not None/0), not an
        # exact rank — ties are legitimately possible.
        self.assertIsNotNone(after["leaderboard_rank"])
        self.assertGreaterEqual(after["leaderboard_rank"], 1)

        full = core_analytics.student_analytics(str(student["_id"]))
        self.assertTrue(full["has_data"])
        self.assertEqual(full["score_stats"]["average"], 100.0)
        self.assertEqual(full["correct_vs_incorrect"]["correct"], 10)

        fac_dash = core_analytics.faculty_dashboard()
        self.assertGreaterEqual(fac_dash["total_quiz_attempts"], 1)
        self.assertGreaterEqual(fac_dash["total_questions"], 12)

        fac_analytics = core_analytics.faculty_analytics()
        self.assertTrue(fac_analytics["has_data"])

        fac_results = core_analytics.faculty_results()
        self.assertTrue(any(r["student_name"] == "Student Five" for r in fac_results))

    def test_09_profile_update_and_password_change(self):
        student = AuthService.register("Prof One", "prof1@test.com", "Password123", "Password123", "student")
        updated = AuthService.update_profile(str(student["_id"]), full_name="Prof One Updated", phone="9111122223")
        self.assertEqual(updated["full_name"], "Prof One Updated")

        AuthService.change_password(str(student["_id"]), "Password123", "NewPassword456")
        # old password should now fail
        with self.assertRaises(AuthError):
            AuthService.login("prof1@test.com", "Password123")
        user, token = AuthService.login("prof1@test.com", "NewPassword456")
        self.assertIsNotNone(token)

    def test_10_regex_validators_reject_bad_input(self):
        from core.validators import validate_email, validate_phone, validate_password, validate_full_name
        with self.assertRaises(ValidationError):
            validate_email("not-an-email")
        with self.assertRaises(ValidationError):
            validate_phone("abc123")
        with self.assertRaises(ValidationError):
            validate_password("alllower")  # no digit
        with self.assertRaises(ValidationError):
            validate_full_name("X" * 100)
        self.assertEqual(validate_full_name("  Jane   Doe  "), "Jane Doe")
