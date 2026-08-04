# =========================================================
# QUIZCRAFT — users/management/commands/seed_questions.py
# -----------------------------------------------------------
# WHY: the Adaptive Quiz Generator (users/views.py's
# generate_adaptive_quiz) can only be genuinely "adaptive" if
# there is a real, sizeable question bank to pick different
# questions from per subject/difficulty. This command populates
# MongoDB's questions_collection from the hand-written question
# set in seed_data.py.
#
# WHAT IT DOES:
#   1. Reads every (subject, difficulty, question, options,
#      answer) tuple from seed_data.QUESTIONS.
#   2. For each one, checks whether a question with the EXACT
#      same subject + question text already exists in MongoDB
#      before inserting — this is what makes the command safe
#      to run multiple times (idempotent) without ever creating
#      duplicate questions, satisfying the "questions must not
#      be duplicated" requirement.
#   3. After seeding, re-counts every (subject, difficulty) pair
#      and reports which ones are still below MIN_PER_COMBINATION
#      questions — the practical answer to "if the question bank
#      is insufficient, create and insert additional questions
#      automatically" is that new tuples added to seed_data.py
#      are picked up and inserted the next time this command
#      runs, and this report tells you exactly where more are
#      still needed.
#
# HOW TO RUN (from the QuizCraft/ project root, with the venv
# active and MongoDB running):
#   python manage.py seed_questions
#
# WHICH MODULE USES THIS: nothing calls this automatically (it's
# a one-time/occasional setup command, the Django equivalent of a
# database migration for content) — a faculty member or the
# developer runs it manually when setting up a fresh MongoDB
# instance, or after adding more tuples to seed_data.py.
# =========================================================
from django.core.management.base import BaseCommand
from backend.mongodb import questions_collection
from users.management.commands.seed_data import QUESTIONS

# Every subject/difficulty combination should have at least this
# many questions for the Adaptive Quiz Generator's weighted
# sampling (see generate_adaptive_quiz's weight_table) to have a
# meaningful pool to draw from at every difficulty level.
MIN_PER_COMBINATION = 10


class Command(BaseCommand):
    help = "Seeds MongoDB's questions_collection with a real question bank (Python, Java, C++, DBMS, Web Development, Machine Learning) across Easy/Medium/Hard difficulty. Safe to re-run — never inserts a duplicate question."

    def handle(self, *args, **options):
        inserted = 0
        skipped = 0

        for subject, difficulty, question_text, opt1, opt2, opt3, opt4, answer in QUESTIONS:
            # EXCEPTION HANDLING / DATA INTEGRITY: catch an author
            # mistake in seed_data.py (a typo'd answer that doesn't
            # match any option) before it ever reaches MongoDB,
            # rather than silently storing a broken question.
            if answer not in (opt1, opt2, opt3, opt4):
                self.stderr.write(self.style.ERROR(
                    f"Skipping malformed question (answer not in options): {question_text!r}"
                ))
                continue

            # DUPLICATE PREVENTION: a question is considered the
            # same one if it already exists for this exact subject
            # with the exact same question text. This is what makes
            # re-running the command safe.
            already_exists = questions_collection.find_one({
                "subject": subject,
                "question": question_text,
            })

            if already_exists:
                skipped += 1
                continue

            questions_collection.insert_one({
                "subject": subject,
                "difficulty": difficulty,
                "question": question_text,
                "option1": opt1,
                "option2": opt2,
                "option3": opt3,
                "option4": opt4,
                "answer": answer,
            })
            inserted += 1

        self.stdout.write(self.style.SUCCESS(
            f"Seeding complete: {inserted} new question(s) inserted, {skipped} already existed and were skipped."
        ))

        self._report_thin_subjects()

    def _report_thin_subjects(self):
        """
        WHAT: after seeding, counts how many questions now exist per
        (subject, difficulty) pair directly from MongoDB (not from
        the seed_data.py list, since faculty may have added their
        own questions too via add_question()), and warns about any
        combination still under MIN_PER_COMBINATION.
        WHY: this is the practical, honest version of "automatically
        create additional questions if the bank is insufficient" —
        MCQ content has to be factually correct, which means it has
        to be written (by a person or an LLM) rather than randomly
        generated; this report tells you exactly which subject/
        difficulty combination still needs more added to
        seed_data.py, instead of silently inserting low-quality
        placeholder questions just to hit a number.
        """
        subjects = ["Python", "Java", "C++", "DBMS", "Web Development", "Machine Learning"]
        difficulties = ["easy", "medium", "hard"]

        thin_spots = []

        for subject in subjects:
            for difficulty in difficulties:
                count = questions_collection.count_documents({
                    "subject": subject,
                    "difficulty": difficulty,
                })
                if count < MIN_PER_COMBINATION:
                    thin_spots.append((subject, difficulty, count))

        if not thin_spots:
            self.stdout.write(self.style.SUCCESS(
                f"Every subject/difficulty combination has at least {MIN_PER_COMBINATION} questions. Question bank looks healthy."
            ))
            return

        self.stdout.write(self.style.WARNING(
            f"The following subject/difficulty combinations have fewer than {MIN_PER_COMBINATION} questions "
            "— add more entries to seed_data.py and re-run this command:"
        ))
        for subject, difficulty, count in thin_spots:
            self.stdout.write(f"  - {subject} / {difficulty}: {count} question(s)")
