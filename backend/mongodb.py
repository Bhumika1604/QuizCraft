# =========================================================
# QUIZCRAFT — backend/mongodb.py
# -----------------------------------------------------------
# WHY: QuizCraft stores its application data (users, questions,
# results, subjects) in MongoDB instead of Django's default
# SQLite ORM, because question banks / quiz results are
# document-shaped (variable option counts, nested breakdowns)
# and easier to query flexibly with PyMongo.
#
# WHAT: This module opens a SINGLE MongoClient connection when
# the process starts and exposes one collection handle per
# logical entity. Every app that needs Mongo access should
# import the collection objects from HERE instead of creating
# its own MongoClient — creating multiple clients per module
# wastes connections and was a bug we fixed in users/views.py
# (it used to open a second, redundant MongoClient of its own).
#
# WHICH MODULE USES THIS: users/views.py (register, login,
# dashboard, questions CRUD, results CRUD, adaptive quiz
# generation, faculty analytics).
# =========================================================
from pymongo import MongoClient

# Single shared connection to the local MongoDB server.
client = MongoClient("mongodb://localhost:27017/")

# "quizcraft" is the database that holds every collection below.
db = client["quizcraft"]

# Registered users (students + faculty). Documents look like:
# { name, email, password, role, created_at }
users_collection = db["users"]

# Question bank. Documents look like:
# { subject, difficulty, question, option1..option4, answer, created_at }
questions_collection = db["questions"]

# Quiz attempt results submitted by students. Documents look like:
# { student_name, subject, difficulty, score, total, breakdown,
#   time_taken_seconds, attempted_at }
results_collection = db["results"]

# Subject list + per-student progress percentage shown on the
# student dashboard's "Subjects" widget.
subjects_collection = db["subjects"]

# Reserved for future use (saved/generated quiz definitions).
# Not yet used by any view, kept so existing imports referencing
# it elsewhere do not break.
quizzes_collection = db["quizzes"]

print("MongoDB Connected Successfully")