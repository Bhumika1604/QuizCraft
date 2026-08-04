# =========================================================
# QUIZCRAFT — users/views.py
# -----------------------------------------------------------
# This module is the single API surface for the whole project
# (auth, subjects, question bank CRUD, quiz generation, results,
# and faculty analytics). Everything lives here rather than in
# the (currently unused) quiz/results/api Django apps, matching
# how the project was already structured before this update —
# new endpoints below simply extend that same pattern instead of
# introducing a second routing layer.
# =========================================================
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
import json
import re
import random
import string
import threading
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from bson import ObjectId
from bson.errors import InvalidId

# DRF is used only for the two brand-new endpoints
# (generate_adaptive_quiz, faculty_dashboard_stats) to satisfy the
# "DRF API" requirement, while every pre-existing endpoint below
# keeps its original plain JsonResponse style untouched so we are
# not rewriting code that already works.
from rest_framework.decorators import api_view
from rest_framework.response import Response

# BUG FIX: this file used to open its OWN pymongo.MongoClient and
# redeclare `questions_collection` / `results_collection` a second
# time, even though backend/mongodb.py already exposes a single
# shared client with every collection we need. Two separate
# MongoClient objects in one Django process is wasteful and can
# cause subtle connection-pool issues, so we now import every
# collection from that one shared connection instead.
from backend.mongodb import (
    users_collection,
    questions_collection,
    results_collection,
    subjects_collection,
)

# Allowed difficulty levels — reused for validation (membership
# check) and for the adaptive quiz weighting logic below.
DIFFICULTY_LEVELS = ("easy", "medium", "hard")

# Marks awarded per difficulty level. This is the "difficulty based
# scoring" requirement: a Hard question is worth more than an Easy
# one. Used by submit_result() when a client sends a per-question
# breakdown, and mirrors question.py's Question.get_marks() in the
# console OOP module.
DIFFICULTY_MARKS = {"easy": 1, "medium": 2, "hard": 3}


def _update_subject_progress_async(subject_name):
    """
    WHY: after a student submits a result we want to bump that
    subject's progress percentage on the dashboard, but doing the
    extra MongoDB read+write on the same request thread would slow
    down the submit-result response the student is waiting on.

    WHAT: runs in a background daemon thread (the "basic threading"
    requirement) so submit_result() can return immediately while
    this finishes the bookkeeping. Wrapped in try/except so a
    background failure never crashes the request that started it.

    WHICH MODULE USES THIS: called from submit_result() below, once
    per quiz submission.
    """
    try:
        subject_doc = subjects_collection.find_one({"subject_name": subject_name})
        if not subject_doc:
            return

        # Simple, explainable progress rule: nudge progress up by 5%
        # (capped at 100) every time a quiz is completed for this
        # subject — good enough for a dashboard progress bar without
        # needing a full spaced-repetition model.
        new_progress = min(subject_doc.get("progress", 0) + 5, 100)
        subjects_collection.update_one(
            {"_id": subject_doc["_id"]},
            {"$set": {"progress": new_progress}}
        )
    except Exception as e:
        # Background thread errors are logged, never raised back
        # into the request/response cycle.
        print("Background subject-progress update failed:", e)


@csrf_exempt
def register(request):
    """
    WHY: creates a new student/faculty account in MongoDB.
    WHAT: validates the incoming JSON with regex checks (email
    format + password strength) before writing to `users_collection`,
    so bad data never reaches the database.
    WHICH MODULE USES THIS: Frontend/js/registerpage1.js posts here
    from registerpage1.html.
    """
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "Only POST request allowed"})

    try:
        data = json.loads(request.body)

        name = data.get("name")
        email = data.get("email")
        password = data.get("password")
        role = data.get("role", "student")

        if not name or not email or not password:
            return JsonResponse({
                "status": "error",
                "message": "All fields are required"
            })

        # REGEX VALIDATION #0 (new): a real name is letters/spaces
        # only (allowing a couple of common punctuation marks like
        # "O'Brien" or "Anne-Marie"), 2-50 characters. Blocks stray
        # digits/HTML from ending up in a name field, with a
        # specific error message rather than a generic 400.
        name_pattern = r"^[A-Za-z][A-Za-z\s\.'-]{1,49}$"

        if not re.match(name_pattern, name.strip()):
            return JsonResponse({
                "status": "error",
                "message": "Enter a valid name (letters only, 2-50 characters)"
            })

        # REGEX VALIDATION #1: basic "someone@somewhere.tld" email shape.
        email_pattern = r'^[\w\.-]+@[\w\.-]+\.\w+$'

        if not re.match(email_pattern, email):
            return JsonResponse({
                "status": "error",
                "message": "Invalid Email"
            })

        # REGEX VALIDATION #2 (new): password must be at least 8
        # characters long and contain at least one letter and one
        # digit. This was previously missing — any non-empty string
        # was accepted as a password. The pattern uses two
        # lookaheads so order of letter/digit doesn't matter.
        password_pattern = r'^(?=.*[A-Za-z])(?=.*\d).{8,}$'

        if not re.match(password_pattern, password):
            return JsonResponse({
                "status": "error",
                "message": "Password must be at least 8 characters and include a letter and a number"
            })

        # REGEX VALIDATION #3 (new): role must be exactly one of the
        # two roles the frontend offers, guarding against a tampered
        # request body sending something unexpected.
        if not re.match(r'^(student|faculty)$', role):
            return JsonResponse({
                "status": "error",
                "message": "Invalid role"
            })

        existing = users_collection.find_one({"email": email})

        if existing:
            return JsonResponse({
                "status": "error",
                "message": "Email already exists"
            })

        users_collection.insert_one({
            "name": name,
            "email": email,
            "password": password,
            "role": role,
            "created_at": datetime.now()
        })

        return JsonResponse({
            "status": "success",
            "message": "Registration Successful"
        })

    except Exception as e:
        return JsonResponse({
            "status": "error",
            "message": str(e)
        })
@csrf_exempt
def login(request):
    """
    WHY: authenticates a user against MongoDB and hands back their
    profile so the frontend can personalize pages that follow
    (dashboard greeting, quiz result attribution, faculty routing).
    WHAT: looks up a user document matching email+password.
    BUG FIX: the success response used to contain only
    status/message, so the frontend had no way to know WHO logged
    in — js/dashboard.js ended up always showing the first user in
    the collection. We now return name/email/role too, and
    js/loginpage1.js stores them in localStorage.
    WHICH MODULE USES THIS: Frontend/js/loginpage1.js.
    """
    if request.method != "POST":
        return JsonResponse({
            "status":"error",
            "message":"Only POST allowed"
        })

    try:
        data = json.loads(request.body)

        email = data.get("email")
        password = data.get("password")

        user = users_collection.find_one({
            "email": email,
            "password": password
        })

        if user:
            return JsonResponse({
                "status": "success",
                "message": "Login Successful",
                "name": user.get("name"),
                "email": user.get("email"),
                "role": user.get("role", "student"),
            })

        return JsonResponse({
            "status":"error",
            "message":"Invalid Email or Password"
        })

    except Exception as e:
        # Exception handling: malformed JSON / missing body no
        # longer crashes the request with a 500 error.
        return JsonResponse({
            "status": "error",
            "message": str(e)
        })


def dashboard(request):
    """
    WHY: powers the student dashboard header (name + avatar initial).
    BUG FIX: this used to call users_collection.find_one() with NO
    filter, which just returns the very first user document in the
    whole collection — every student saw the same (wrong) name. It
    now accepts the logged-in user's email as a query parameter
    (?email=...) sent by js/dashboard.js after reading it from
    localStorage, and looks up that specific user. If no email is
    supplied (e.g. page opened without logging in first) it falls
    back to the previous find_one() behaviour so nothing breaks.
    WHICH MODULE USES THIS: Frontend/js/dashboard.js on
    student_dashboard.html.
    """
    try:
        email = request.GET.get("email")

        if email:
            user = users_collection.find_one({"email": email})
        else:
            user = users_collection.find_one()

        if not user:
            return JsonResponse({
                "status": "error",
                "message": "User not found"
            })

        return JsonResponse({
            "status": "success",
            "name": user["name"],
            "email": user["email"],
            "role": user.get("role", "student")
        })

    except Exception as e:
        return JsonResponse({
            "status": "error",
            "message": str(e)
        })
@csrf_exempt
def add_subject(request):
    """
    WHY: lets faculty seed the list of subjects shown on the
    student dashboard's subject-progress widget.
    WHAT: inserts a new subject document starting at 0% progress.
    WHICH MODULE USES THIS: currently called manually / via admin
    tooling; get_subjects() below is what the student dashboard reads.
    """
    if request.method != "POST":
        return JsonResponse({
            "status":"error"
        })

    data = json.loads(request.body)

    subjects_collection.insert_one({

        "subject_name":data["subject_name"],
        "progress":0

    })

    return JsonResponse({

        "status":"success",
        "message":"Subject Added"

    })
def get_subjects(request):
    """
    WHY: renders the "Subjects" progress cards on the student
    dashboard.
    WHAT: returns every subject document. BUG FIX: `progress` used
    to always be the single shared counter stored on the subject
    document itself (bumped +5% for ANY student's submission,
    regardless of who) — every student saw the exact same "progress"
    number for a subject, which isn't real personal progress. When
    the caller supplies ?student_name=, progress is now THIS
    student's own average score percentage in that subject
    (computed from their real results_collection attempts), falling
    back to 0 if they haven't attempted it yet. Without a
    student_name (e.g. a future non-personalized use of this
    endpoint), the original shared counter is still returned so
    nothing else that calls this API breaks.
    WHICH MODULE USES THIS: Frontend/js/dashboard.js -> loadSubjects().
    """
    data = []
    student_name = request.GET.get("student_name")

    subjects = subjects_collection.find()

    for s in subjects:
        subject_name = s["subject_name"]
        progress = s["progress"]

        if student_name:
            attempts = list(results_collection.find(
                {
                    "student_name": student_name,
                    "subject": {"$regex": f"^{re.escape(subject_name)}$", "$options": "i"},
                },
                {"score": 1, "total": 1}
            ))
            if attempts:
                percentages = [(a.get("score", 0) / a["total"]) * 100 for a in attempts if a.get("total")]
                progress = round(sum(percentages) / len(percentages)) if percentages else 0
            else:
                progress = 0

        data.append({
            "id": str(s["_id"]),
            "subject_name": subject_name,
            "progress": progress,
        })

    return JsonResponse(data, safe=False)
@csrf_exempt
def add_question(request):
    """
    WHY: lets faculty grow the question bank from add_question.html.
    WHAT: validates + stores a new MCQ document in MongoDB.
    BUG FIX: this view used to silently drop the "difficulty" field
    even though the add-question form collects it — every question
    ended up untagged, which broke difficulty-based quiz generation
    and the "Query by subject and difficulty" requirement. It also
    had no try/except, so a missing key (e.g. option4) raised an
    uncaught KeyError -> Django 500 page instead of a clean JSON
    error. Both are fixed below.
    WHICH MODULE USES THIS: Frontend/js/faculty.js -> initQuestionForm()
    on add_question.html.
    """
    if request.method != "POST":
        return JsonResponse({
            "status": "error",
            "message": "Only POST allowed"
        })

    try:
        data = json.loads(request.body)

        subject = data.get("subject", "").strip()
        difficulty = data.get("difficulty", "easy").strip().lower()
        question_text = data.get("question", "").strip()

        # REGEX VALIDATION: subject must be plain letters/spaces
        # (e.g. "Python", "Web Development") — blocks stray HTML/JS
        # or empty strings from being stored as a subject name.
        if not re.match(r'^[A-Za-z][A-Za-z\s\+\#]{1,40}$', subject):
            return JsonResponse({"status": "error", "message": "Invalid subject name"})

        if difficulty not in DIFFICULTY_LEVELS:
            return JsonResponse({"status": "error", "message": "Difficulty must be easy, medium or hard"})

        if not question_text:
            return JsonResponse({"status": "error", "message": "Question text is required"})

        option1 = data["option1"]
        option2 = data["option2"]
        option3 = data["option3"]
        option4 = data["option4"]
        answer = data["answer"]

        if answer not in (option1, option2, option3, option4):
            return JsonResponse({"status": "error", "message": "Correct answer must match one of the options"})

        question = {
            "subject": subject,
            "difficulty": difficulty,
            "question": question_text,
            "option1": option1,
            "option2": option2,
            "option3": option3,
            "option4": option4,
            "answer": answer,
            # datetime-based tracking: lets the question bank be
            # sorted by "most recently added" on question_bank.html.
            "created_at": datetime.now(),
        }

        questions_collection.insert_one(question)

        return JsonResponse({
            "status": "success",
            "message": "Question Added"
        })

    except KeyError as e:
        return JsonResponse({"status": "error", "message": f"Missing field: {str(e)}"})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)})


def get_questions(request):
    """
    WHY: powers manage_questions.html / question_bank.html and the
    adaptive quiz generator's candidate pool.
    WHAT: returns questions, optionally filtered by subject AND/OR
    difficulty.
    BUG FIX: originally only filtered by subject — the "Query by
    subject and difficulty" requirement needed a difficulty filter
    too, so ?subject=python&difficulty=hard now works. Older
    documents saved before the difficulty field existed default to
    "easy" via q.get(..., "easy") instead of raising a KeyError.
    WHICH MODULE USES THIS: Frontend/js/faculty.js -> loadQuestions().
    """
    subject = request.GET.get("subject")
    difficulty = request.GET.get("difficulty")

    query = {}
    if subject:
        # BUG FIX: questions are stored with their Title-Case display
        # text (e.g. "Python", "Web Development") because add_question()
        # saves subject.options[selectedIndex].text, but the rest of
        # the app (URL query strings, dropdown <option value="">) uses
        # lowercase slugs like "python". An exact-match filter here
        # silently returned zero results for every subject except one
        # that happened to be typed in matching case. A case-insensitive
        # regex match fixes this without needing to touch how any
        # existing document is stored.
        query["subject"] = {"$regex": f"^{re.escape(subject)}$", "$options": "i"}
    if difficulty:
        query["difficulty"] = difficulty

    data = []

    try:
        questions = questions_collection.find(query)

        for q in questions:
            data.append({
                "id": str(q["_id"]),
                "subject": q["subject"],
                "difficulty": q.get("difficulty", "easy"),
                "question": q["question"],
                "option1": q["option1"],
                "option2": q["option2"],
                "option3": q["option3"],
                "option4": q["option4"],
                "answer": q["answer"]
            })

        return JsonResponse(data, safe=False)

    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


def get_question(request, id):
    """
    WHY: edit_question.html needs to load ONE existing question's
    full details before the faculty member can edit it. This
    endpoint did not exist before — edit_question.html was shipping
    with hardcoded sample values because there was no way to fetch
    a specific question by id.
    WHAT: looks up a single question document by its Mongo _id.
    WHICH MODULE USES THIS: Frontend/js/faculty.js -> edit-mode
    prefill on edit_question.html.
    """
    try:
        question = questions_collection.find_one({"_id": ObjectId(id)})

        if not question:
            return JsonResponse({"status": "error", "message": "Question not found"}, status=404)

        return JsonResponse({
            "status": "success",
            "id": str(question["_id"]),
            "subject": question["subject"],
            "difficulty": question.get("difficulty", "easy"),
            "question": question["question"],
            "option1": question["option1"],
            "option2": question["option2"],
            "option3": question["option3"],
            "option4": question["option4"],
            "answer": question["answer"],
        })

    except InvalidId:
        # Exception handling: a malformed id in the URL (e.g. someone
        # editing the query string by hand) used to crash with an
        # uncaught bson.errors.InvalidId -> 500 error.
        return JsonResponse({"status": "error", "message": "Invalid question id"}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@csrf_exempt
def edit_question(request, id):
    """
    WHY: completes the MongoDB CRUD for questions — Create (add_question)
    and Read (get_questions/get_question) already existed, but there
    was no Update endpoint at all, so the "Edit" button on
    manage_questions.html linked to a form that could only ever
    create a NEW question instead of updating the existing one.
    WHAT: validates the submitted fields the same way add_question()
    does, then applies them to the existing document with
    update_one() instead of inserting a new document.
    WHICH MODULE USES THIS: Frontend/js/faculty.js -> initQuestionForm()
    in edit mode, on edit_question.html.
    """
    if request.method not in ("PUT", "PATCH"):
        return JsonResponse({"status": "error", "message": "Only PUT/PATCH allowed"}, status=405)

    try:
        data = json.loads(request.body)

        subject = data.get("subject", "").strip()
        difficulty = data.get("difficulty", "easy").strip().lower()
        question_text = data.get("question", "").strip()

        if not re.match(r'^[A-Za-z][A-Za-z\s\+\#]{1,40}$', subject):
            return JsonResponse({"status": "error", "message": "Invalid subject name"})

        if difficulty not in DIFFICULTY_LEVELS:
            return JsonResponse({"status": "error", "message": "Difficulty must be easy, medium or hard"})

        if not question_text:
            return JsonResponse({"status": "error", "message": "Question text is required"})

        option1 = data["option1"]
        option2 = data["option2"]
        option3 = data["option3"]
        option4 = data["option4"]
        answer = data["answer"]

        if answer not in (option1, option2, option3, option4):
            return JsonResponse({"status": "error", "message": "Correct answer must match one of the options"})

        result = questions_collection.update_one(
            {"_id": ObjectId(id)},
            {"$set": {
                "subject": subject,
                "difficulty": difficulty,
                "question": question_text,
                "option1": option1,
                "option2": option2,
                "option3": option3,
                "option4": option4,
                "answer": answer,
                "updated_at": datetime.now(),
            }}
        )

        if result.matched_count == 0:
            return JsonResponse({"status": "error", "message": "Question not found"}, status=404)

        return JsonResponse({"status": "success", "message": "Question Updated"})

    except InvalidId:
        return JsonResponse({"status": "error", "message": "Invalid question id"}, status=400)
    except KeyError as e:
        return JsonResponse({"status": "error", "message": f"Missing field: {str(e)}"})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


# NOTE: `results_collection` used to be re-declared here as
# `db["results"]` using the file's own (now-removed) MongoClient.
# It's already imported once at the top of this file from
# backend.mongodb, so that duplicate line has been removed.


@csrf_exempt
def submit_result(request):
    """
    WHY: saves a completed quiz attempt so it can power the result
    page, the student's history page, and faculty analytics.
    WHAT (extended): still accepts the original minimal payload
    (student_name, subject, score, total) for backward compatibility,
    but now also stores, when the client sends them:
      - difficulty: the quiz's difficulty level (dictionary-based
        DIFFICULTY_MARKS is used to compute a weighted score if a
        per-question breakdown is supplied).
      - breakdown: a dictionary {"correct": n, "wrong": n,
        "unanswered": n} — the "dictionary based score tracking"
        requirement.
      - time_taken_seconds: how long the attempt took, computed
        client-side from a datetime-style start/end timestamp — the
        "datetime based quiz timer" requirement.
      - attempted_at: server-side datetime.now(), so results can be
        sorted/filtered by date without relying on Mongo's ObjectId
        insertion order.
    After saving, a background thread nudges the subject's progress
    forward (see _update_subject_progress_async) without delaying
    this response — the "basic threading implementation" requirement.
    WHICH MODULE USES THIS: Frontend/js/quiz.js -> finishQuiz().
    """
    if request.method != "POST":
        return JsonResponse({
            "status":"error"
        })

    try:
        data = json.loads(request.body)

        student_name = data.get("student_name", "Guest")
        subject = data.get("subject", "")
        score = data["score"]
        total = data["total"]
        difficulty = data.get("difficulty", "easy")
        breakdown = data.get("breakdown")  # optional dict: correct/wrong/unanswered
        time_taken_seconds = data.get("time_taken_seconds")

        result_doc = {
            "student_name": student_name,
            "subject": subject,
            "difficulty": difficulty if difficulty in DIFFICULTY_LEVELS else "easy",
            "score": score,
            "total": total,
            "attempted_at": datetime.now(),
        }

        if isinstance(breakdown, dict):
            result_doc["breakdown"] = {
                "correct": breakdown.get("correct", score),
                "wrong": breakdown.get("wrong", 0),
                "unanswered": breakdown.get("unanswered", 0),
            }

        if time_taken_seconds is not None:
            result_doc["time_taken_seconds"] = time_taken_seconds

        results_collection.insert_one(result_doc)

        # BASIC THREADING: fire-and-forget background update so the
        # student doesn't wait on this extra write. daemon=True means
        # the thread won't block Django from shutting down.
        threading.Thread(
            target=_update_subject_progress_async,
            args=(subject,),
            daemon=True
        ).start()

        return JsonResponse({
            "status":"success",
            "message":"Result Saved"
        })

    except KeyError as e:
        return JsonResponse({"status": "error", "message": f"Missing field: {str(e)}"})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)})


def get_latest_result(request):
    """
    WHY: renders result.html right after a student finishes a quiz.
    BUG FIX: previously ignored WHO was asking and always returned
    the single most recent result across every student. It now
    accepts an optional ?student_name= filter (sent by
    Frontend/js/result.js using the logged-in user's name) and
    falls back to the old global-latest behaviour if it's absent,
    so nothing breaks for callers that don't send it.
    WHICH MODULE USES THIS: Frontend/js/result.js.
    """
    try:
        student_name = request.GET.get("student_name")

        query = {"student_name": student_name} if student_name else {}

        result = results_collection.find_one(
            query,
            sort=[("_id", -1)]
        )

        if not result:
            return JsonResponse({
                "status": "error",
                "message": "No Result"
            })

        return JsonResponse({
            "status": "success",
            "student_name": result["student_name"],
            "subject": result["subject"],
            "difficulty": result.get("difficulty", "easy"),
            "score": result["score"],
            "total": result["total"],
            "breakdown": result.get("breakdown"),
            "time_taken_seconds": result.get("time_taken_seconds"),
            "attempted_at": result["attempted_at"].isoformat() if result.get("attempted_at") else None,
        })

    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


def get_history(request):
    """
    WHY: powers the student's own history.html AND the faculty
    view_results.html table.
    BUG FIX: previously returned every result in the database with
    no way to filter, and never exposed difficulty/date — the
    frontend had to hardcode difficulty:"Medium" and today's date
    for every row. It now supports optional ?student_name=,
    ?subject= and ?difficulty= filters (the "Query by subject and
    difficulty" requirement) and returns the real difficulty and
    attempted_at date for each result.
    WHICH MODULE USES THIS: Frontend/js/history.js (student) and
    Frontend/js/faculty.js (faculty view_results.html).
    """
    try:
        student_name = request.GET.get("student_name")
        subject = request.GET.get("subject")
        difficulty = request.GET.get("difficulty")

        query = {}
        if student_name:
            query["student_name"] = student_name
        if subject:
            # Same case-insensitive fix as get_questions() above —
            # results can be stored as "Python" while a filter comes
            # in as "python".
            query["subject"] = {"$regex": f"^{re.escape(subject)}$", "$options": "i"}
        if difficulty:
            query["difficulty"] = difficulty

        data = []

        results = results_collection.find(query).sort("_id", -1)

        for r in results:

            data.append({
                "student_name": r["student_name"],
                "subject": r["subject"],
                "difficulty": r.get("difficulty", "easy"),
                "score": r["score"],
                "total": r["total"],
                "attempted_at": r["attempted_at"].isoformat() if r.get("attempted_at") else None,
            })

        return JsonResponse(data, safe=False)

    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@csrf_exempt
def delete_question(request, id):
    """
    WHY: completes the "D" in MongoDB CRUD for the question bank.
    BUG FIX: used `db.questions.delete_one(...)` referencing a `db`
    object from the file's old duplicate MongoClient — since that
    duplicate connection has been removed, this now uses the shared
    `questions_collection` import (same underlying collection,
    correct reference). It also had no exception handling, so a
    malformed id in the URL raised an uncaught InvalidId error.
    WHICH MODULE USES THIS: Frontend/js/faculty.js -> delete button
    on manage_questions.html.
    """
    if request.method != "DELETE":
        return JsonResponse({
            "error": "Invalid Request"
        }, status=400)

    try:
        result = questions_collection.delete_one({"_id": ObjectId(id)})

        if result.deleted_count == 0:
            return JsonResponse({"status": "error", "message": "Question not found"}, status=404)

        return JsonResponse({
            "status": "success",
            "message": "Question deleted successfully"
        })

    except InvalidId:
        return JsonResponse({"status": "error", "message": "Invalid question id"}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


# =========================================================
# ADAPTIVE QUIZ GENERATOR (new)
# ---------------------------------------------------------
# WHY: the frontend quiz.html used to run entirely on a hardcoded
# JS array (QUIZ_DATA) — no random selection, no adaptivity, and
# no connection to the question bank at all. This DRF endpoint is
# the "Adaptive Quiz Generator" + "Random question selection"
# requirement's server-side half (the client-side half lives in
# question.py / quiz_engine.py / adaptive_engine.py for the console
# demo, and in js/quiz.js for the live web app).
#
# WHAT: given a subject, returns EVERY question MongoDB has for it
# (all three difficulty levels, tagged individually), shuffled.
#
# IMPORTANT DESIGN NOTE — this used to pre-select a single fixed
# weighted sample of questions before the student answered anything
# at all, which isn't genuinely adaptive (the "adaptivity" was
# decided once, up front, not in response to real performance).
# True per-answer adaptivity — "increase/decrease difficulty
# according to student performance" — needs to happen QUESTION BY
# QUESTION as the student answers, which requires knowing the
# result of question N before choosing question N+1. That can't
# happen in one upfront API call; it happens client-side in
# js/quiz.js's AdaptiveQuizEngine, which walks this full pool one
# step at a time exactly like adaptive_engine.py's AdaptiveEngine
# class does for the console demo (random.choice from the current
# difficulty's pool, step up on a correct answer / down on a wrong
# one, never repeat a question). This endpoint's job is simply to
# hand over ALL the raw material for that — the adaptivity itself
# lives in the client.
#
# WHICH MODULE USES THIS: Frontend/js/quiz.js on quiz.html load.
# =========================================================
@api_view(["GET"])
def generate_adaptive_quiz(request):
    subject = request.GET.get("subject", "").strip()
    starting_difficulty = request.GET.get("difficulty", "easy").strip().lower()

    # REGEX VALIDATION: reject anything that isn't a plain subject
    # name before it touches the database query.
    if not subject or not re.match(r'^[A-Za-z][A-Za-z\s\+\#]{1,40}$', subject):
        return Response({"status": "error", "message": "A valid subject is required"}, status=400)

    if starting_difficulty not in DIFFICULTY_LEVELS:
        starting_difficulty = "easy"

    try:
        # BUG FIX: same case-sensitivity issue as get_questions() —
        # questions are stored as "Python"/"Web Development" (Title
        # Case, from the add_question.html dropdown's display text)
        # while quiz.html passes a lowercase URL slug like "python".
        # This was the real reason "the quiz only ever shows Python" —
        # every OTHER subject's exact-match query returned nothing and
        # silently fell back to the bundled demo questions.
        all_questions = list(questions_collection.find({
            "subject": {"$regex": f"^{re.escape(subject)}$", "$options": "i"}
        }))

        # EMPTY QUESTION BANK EXCEPTION HANDLING: a subject that exists
        # on the "Subjects" page but has no questions in it yet (e.g. a
        # faculty member hasn't added any for "Machine Learning") must
        # not crash — it returns a clear 404 the frontend can show as a
        # friendly message instead of a blank/broken quiz page.
        if not all_questions:
            return Response({
                "status": "error",
                "message": f'No questions are available for "{subject}" yet. Please choose a different subject or check back later.'
            }, status=404)

        # Use the REAL subject text as stored on the matched questions
        # (e.g. "Web Development") for display, rather than echoing
        # back the raw lowercase URL slug ("webdev") the request came
        # in with.
        actual_subject_label = all_questions[0].get("subject", subject)

        # RANDOM QUESTION SELECTION: shuffle so the pool arrives in a
        # different order every attempt — js/quiz.js's adaptive engine
        # still picks randomly WITHIN each difficulty group as it
        # walks forward, this shuffle just avoids handing the pool
        # over in insertion order every single time.
        random.shuffle(all_questions)

        pool_questions = []
        for q in all_questions:
            options = [q["option1"], q["option2"], q["option3"], q["option4"]]
            pool_questions.append({
                "id": str(q["_id"]),
                "text": q["question"],
                "difficulty": q.get("difficulty", "easy"),
                "marks": DIFFICULTY_MARKS.get(q.get("difficulty", "easy"), 1),
                "options": options,
                # index instead of raw answer text — the client checks
                # the selected option's index against this, mirroring
                # Question.check_answer() in the console OOP module.
                "correct": options.index(q["answer"]) if q["answer"] in options else 0,
            })

        return Response({
            "status": "success",
            "subject": actual_subject_label,
            "starting_difficulty": starting_difficulty,
            "pool": pool_questions,
        })

    except Exception as e:
        return Response({"status": "error", "message": str(e)}, status=500)


# =========================================================
# FACULTY DASHBOARD ANALYTICS (new)
# ---------------------------------------------------------
# WHY: faculty_dashboard.html shipped with hardcoded stat-card
# numbers (486 questions, 6 subjects, 312 students, 76% avg score)
# that never reflected the real database — the "Faculty Dashboard
# integration with MongoDB" requirement.
# WHAT: aggregates live counts/averages across the users, questions,
# subjects and results collections.
# WHICH MODULE USES THIS: Frontend/js/faculty.js on
# faculty_dashboard.html.
# =========================================================
@api_view(["GET"])
def faculty_dashboard_stats(request):
    try:
        total_questions = questions_collection.count_documents({})
        total_subjects = subjects_collection.count_documents({})
        total_students = users_collection.count_documents({"role": "student"})

        difficulty_counts = {level: questions_collection.count_documents({"difficulty": level}) for level in DIFFICULTY_LEVELS}

        all_results = list(results_collection.find({}, {"score": 1, "total": 1}))
        if all_results:
            percentages = [
                (r["score"] / r["total"]) * 100
                for r in all_results
                if r.get("total")
            ]
            avg_score = round(sum(percentages) / len(percentages), 1) if percentages else 0
        else:
            avg_score = 0

        return Response({
            "status": "success",
            "total_questions": total_questions,
            "total_subjects": total_subjects,
            "total_students": total_students,
            "total_attempts": len(all_results),
            "average_score": avg_score,
            "difficulty_distribution": difficulty_counts,
        })

    except Exception as e:
        return Response({"status": "error", "message": str(e)}, status=500)


# =========================================================
# PROFILE API (new)
# ---------------------------------------------------------
# WHY: profile.html previously had zero backend wiring — the
# "Personal Information" and "Change Password" forms just showed
# a fake success banner via JS and never touched MongoDB, and the
# page always displayed the hardcoded demo user "Aarav Mehta"
# regardless of who was logged in.
# WHICH MODULE USES THIS: Frontend/js/common.js's initProfilePage()
# on profile.html.
# =========================================================
@api_view(["GET"])
def get_profile(request):
    """
    WHY: profile.html needs to load the CURRENTLY logged-in user's
    real details on page load instead of showing static demo text.
    WHAT: looks up one user by email (sent as ?email=... — the
    frontend reads this from the client-side session stored in
    localStorage by js/loginpage1.js) and returns the editable
    profile fields. The password hash is never included in the
    response.
    """
    email = request.GET.get("email")

    if not email:
        return Response({"status": "error", "message": "email is required"}, status=400)

    try:
        user = users_collection.find_one({"email": email})

        if not user:
            return Response({"status": "error", "message": "User not found"}, status=404)

        response_data = {
            "status": "success",
            "name": user.get("name", ""),
            "email": user.get("email", ""),
            # Real join date for the profile header's "Member since"
            # text — was previously hardcoded as "Jan 2026" for every
            # user regardless of when they actually registered.
            "created_at": user["created_at"].isoformat() if user.get("created_at") else None,
            # phone/bio are optional fields — older accounts created
            # before this feature existed simply won't have them yet,
            # so we default to empty string instead of KeyError.
            "phone": user.get("phone", ""),
            "bio": user.get("bio", ""),
            "role": user.get("role", "student"),
        }

        # BUG FIX: profile.html's "Quizzes Attempted" / "Average Score"
        # / "Leaderboard Rank" stat cards used to be hardcoded
        # (48 / 82% / #12) for every single visitor. These are only
        # meaningful for students (faculty don't take quizzes), so
        # they're computed here from the SAME results_collection data
        # the leaderboard/history pages already use.
        if response_data["role"] == "student":
            name = response_data["name"]
            attempts = list(results_collection.find({"student_name": name}, {"score": 1, "total": 1}))

            quizzes_attempted = len(attempts)
            if attempts:
                percentages = [(a.get("score", 0) / a["total"]) * 100 for a in attempts if a.get("total")]
                average_score = round(sum(percentages) / len(percentages)) if percentages else 0
            else:
                average_score = 0

            # Reuse the exact same ranking logic as leaderboard() so a
            # student's rank here always matches what the dashboard's
            # leaderboard widget shows.
            all_results = list(results_collection.find({}, {"student_name": 1, "score": 1, "total": 1}))
            per_student = {}
            for r in all_results:
                rn = r.get("student_name")
                total = r.get("total") or 0
                if not rn or not total:
                    continue
                pct = (r.get("score", 0) / total) * 100
                entry = per_student.setdefault(rn, {"name": rn, "percentages": []})
                entry["percentages"].append(pct)
            ranking = sorted(
                per_student.values(),
                key=lambda e: -(sum(e["percentages"]) / len(e["percentages"]))
            )
            rank = next((i + 1 for i, e in enumerate(ranking) if e["name"] == name), None)

            response_data["quizzes_attempted"] = quizzes_attempted
            response_data["average_score"] = average_score
            response_data["leaderboard_rank"] = rank
        else:
            # FACULTY STATS: "Quizzes Attempted"/"Average Score"/
            # "Leaderboard Rank" mean nothing for a faculty account —
            # this reuses the exact same counts faculty_dashboard_stats()
            # already computes so a faculty member's own profile page
            # agrees with their dashboard.
            response_data["total_questions"] = questions_collection.count_documents({})
            response_data["total_subjects"] = subjects_collection.count_documents({})
            response_data["total_students"] = users_collection.count_documents({"role": "student"})

        return Response(response_data)

    except Exception as e:
        return Response({"status": "error", "message": str(e)}, status=500)


@api_view(["PUT", "PATCH"])
def update_profile(request):
    """
    WHY: completes the "Profile update should save to MongoDB"
    requirement — the form used to only fake a success message.
    WHAT: identifies the account by `original_email` (the email the
    user was logged in with, so we can still find the document even
    if they are also changing their email address in the same
    request), regex-validates the new values, and applies them with
    update_one(). If the email is being changed, we also confirm the
    new address isn't already taken by a different account.
    """
    try:
        data = request.data if hasattr(request, "data") else json.loads(request.body)

        original_email = data.get("original_email", "").strip()
        name = data.get("name", "").strip()
        new_email = data.get("email", "").strip()
        phone = data.get("phone", "").strip()
        bio = data.get("bio", "").strip()

        if not original_email:
            return Response({"status": "error", "message": "original_email is required"}, status=400)

        # REGEX VALIDATION: same name/email rules used at registration,
        # reused here so a profile edit can't smuggle in bad data.
        if not re.match(r"^[A-Za-z][A-Za-z\s\.'-]{1,49}$", name):
            return Response({"status": "error", "message": "Enter a valid name (letters only, 2-50 characters)"}, status=400)

        if not re.match(r'^[\w\.-]+@[\w\.-]+\.\w+$', new_email):
            return Response({"status": "error", "message": "Invalid email"}, status=400)

        # Optional phone: if provided, must be exactly 10 digits
        # (matches the maxlength=10 already enforced in the HTML).
        if phone and not re.match(r'^\d{10}$', phone):
            return Response({"status": "error", "message": "Phone number must be 10 digits"}, status=400)

        existing = users_collection.find_one({"_id": {"$exists": True}, "email": original_email})
        if not existing:
            return Response({"status": "error", "message": "User not found"}, status=404)

        if new_email != original_email:
            clash = users_collection.find_one({"email": new_email})
            if clash:
                return Response({"status": "error", "message": "That email is already in use"}, status=400)

        users_collection.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "name": name,
                "email": new_email,
                "phone": phone,
                "bio": bio,
                "updated_at": datetime.now(),
            }}
        )

        return Response({
            "status": "success",
            "message": "Profile updated successfully",
            # Echoed back so the frontend can refresh its localStorage
            # session (name/email may have just changed).
            "name": name,
            "email": new_email,
            "role": existing.get("role", "student"),
        })

    except Exception as e:
        return Response({"status": "error", "message": str(e)}, status=500)


@api_view(["POST"])
def change_password(request):
    """
    WHY: the "Change Password" tab on profile.html used to be UI
    only. This verifies the user's current password before allowing
    a change, same as any real account-security flow.
    WHAT: confirms email+current_password match a MongoDB user
    document, regex-validates the new password's strength (same
    rule as registration), then updates it.
    """
    try:
        data = request.data if hasattr(request, "data") else json.loads(request.body)

        email = data.get("email", "").strip()
        current_password = data.get("current_password", "")
        new_password = data.get("new_password", "")

        user = users_collection.find_one({"email": email, "password": current_password})

        if not user:
            return Response({"status": "error", "message": "Current password is incorrect"}, status=400)

        password_pattern = r'^(?=.*[A-Za-z])(?=.*\d).{8,}$'
        if not re.match(password_pattern, new_password):
            return Response({
                "status": "error",
                "message": "New password must be at least 8 characters and include a letter and a number"
            }, status=400)

        users_collection.update_one(
            {"_id": user["_id"]},
            {"$set": {"password": new_password, "updated_at": datetime.now()}}
        )

        return Response({"status": "success", "message": "Password updated successfully"})

    except Exception as e:
        return Response({"status": "error", "message": str(e)}, status=500)


# =========================================================
# SUBJECT CRUD (completes what add_subject/get_subjects started)
# ---------------------------------------------------------
# WHY: add_subject (Create) and get_subjects (Read) already existed,
# but there was no way to rename a subject or remove one that was
# added by mistake — the "Subject CRUD" requirement needs Update
# and Delete too.
# WHICH MODULE USES THIS: the Subject Management panel on
# faculty_dashboard.html (see Frontend/js/faculty.js).
# =========================================================
@api_view(["PUT", "PATCH"])
def edit_subject(request, id):
    try:
        data = request.data if hasattr(request, "data") else json.loads(request.body)
        subject_name = data.get("subject_name", "").strip()

        if not re.match(r'^[A-Za-z][A-Za-z\s\+\#]{1,40}$', subject_name):
            return Response({"status": "error", "message": "Invalid subject name"}, status=400)

        result = subjects_collection.update_one(
            {"_id": ObjectId(id)},
            {"$set": {"subject_name": subject_name}}
        )

        if result.matched_count == 0:
            return Response({"status": "error", "message": "Subject not found"}, status=404)

        return Response({"status": "success", "message": "Subject updated"})

    except InvalidId:
        return Response({"status": "error", "message": "Invalid subject id"}, status=400)
    except Exception as e:
        return Response({"status": "error", "message": str(e)}, status=500)


@api_view(["DELETE"])
def delete_subject(request, id):
    try:
        result = subjects_collection.delete_one({"_id": ObjectId(id)})

        if result.deleted_count == 0:
            return Response({"status": "error", "message": "Subject not found"}, status=404)

        return Response({"status": "success", "message": "Subject deleted"})

    except InvalidId:
        return Response({"status": "error", "message": "Invalid subject id"}, status=400)
    except Exception as e:
        return Response({"status": "error", "message": str(e)}, status=500)


# =========================================================
# GOOGLE SIGN-IN (new)
# ---------------------------------------------------------
# WHY: completes "Implement real Google Sign-In using Django
# authentication/OAuth" — the button previously just showed a
# "UI only" alert.
#
# WHAT: the frontend (Frontend/js/loginpage1.js /
# registerpage1.js) uses Google Identity Services to open Google's
# real sign-in popup and gets back a signed ID token (a JWT) proving
# the user authenticated with Google. That token is POSTed here as
# {"credential": "..."}. We verify it by asking GOOGLE ITSELF
# (Google's tokeninfo endpoint) whether the token is genuine, rather
# than trying to verify the JWT signature ourselves — this avoids
# needing the `google-auth` pip package as a new dependency while
# still being a real, secure verification (Google is the one
# confirming the token, not us trusting the frontend blindly).
#
# WHAT HAPPENS NEXT: if the token is valid and was issued for THIS
# app's GOOGLE_CLIENT_ID (see backend/settings.py), we look the
# person up by the email Google gave us. First time we see that
# email, we create a new "student" account for them (Google sign-in
# is the public self-service flow — faculty accounts are still
# created deliberately via the normal Register form + a role
# change). Either way we respond with the same
# {status, name, email, role} shape as the normal login() view, so
# the frontend's existing "store session + route by role" logic
# handles Google sign-ins identically to a password login.
#
# WHICH MODULE USES THIS: Frontend/js/loginpage1.js and
# Frontend/js/registerpage1.js -> the "Continue with Google" button.
# =========================================================
@csrf_exempt
def google_login(request):
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "Only POST allowed"})

    try:
        data = json.loads(request.body)
        credential = data.get("credential")

        if not credential:
            return JsonResponse({"status": "error", "message": "Missing Google credential"})

        # Ask Google to confirm this token is genuine and read back the
        # profile info it encodes (email, name, whether the email is
        # verified). This single HTTPS call IS the verification step —
        # a forged/expired token gets rejected by Google's endpoint
        # with a non-200 response, which we treat as invalid below.
        verify_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={credential}"

        try:
            with urllib.request.urlopen(verify_url, timeout=6) as resp:
                token_info = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError:
            # EXCEPTION HANDLING: Google itself rejected the token
            # (expired / tampered / malformed) — never trust it.
            return JsonResponse({"status": "error", "message": "Invalid or expired Google credential"})
        except urllib.error.URLError:
            return JsonResponse({"status": "error", "message": "Could not reach Google to verify sign-in. Check your internet connection."})

        # Confirm the token was issued for OUR app specifically, not
        # some other website's Google sign-in button — this is what
        # stops a token obtained elsewhere from being replayed here.
        expected_client_id = getattr(settings, "GOOGLE_CLIENT_ID", "")
        if expected_client_id and "YOUR_GOOGLE_OAUTH_CLIENT_ID" not in expected_client_id:
            if token_info.get("aud") != expected_client_id:
                return JsonResponse({"status": "error", "message": "This Google credential was not issued for this app"})
        # else: GOOGLE_CLIENT_ID is still the placeholder from
        # settings.py — we can't fully lock this down until a real
        # Client ID is configured, so we proceed using whatever
        # Google's tokeninfo endpoint already validated (still a real
        # signature-checked token, just without the extra audience
        # pin), and log it so it's obvious in development.
        else:
            print("WARNING: GOOGLE_CLIENT_ID is still a placeholder — "
                  "set a real one in backend/settings.py before deploying.")

        email = token_info.get("email")
        name = token_info.get("name") or (email.split("@")[0] if email else "Google User")
        email_verified = token_info.get("email_verified") in ("true", True)

        if not email or not email_verified:
            return JsonResponse({"status": "error", "message": "Google account has no verified email"})

        user = users_collection.find_one({"email": email})

        if not user:
            # First time this Google account has signed in — create a
            # QuizCraft account for them automatically. A random,
            # unguessable password is stored (never shown to the user
            # and never usable via the normal password-login form in
            # practice, since it's 32 random characters) purely
            # because `password` is a required field elsewhere in this
            # schema; this account is meant to always be accessed via
            # "Continue with Google", not typed credentials.
            random_password = "".join(random.choices(string.ascii_letters + string.digits, k=32))

            new_user = {
                "name": name,
                "email": email,
                "password": random_password,
                "role": "student",
                "auth_provider": "google",
                "created_at": datetime.now(),
            }
            users_collection.insert_one(new_user)
            user = new_user

        return JsonResponse({
            "status": "success",
            "message": "Google sign-in successful",
            "name": user.get("name", name),
            "email": user.get("email", email),
            "role": user.get("role", "student"),
        })

    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)})


# =========================================================
# LEADERBOARD + RECENT ACTIVITY (new)
# ---------------------------------------------------------
# WHY: both student_dashboard.html and faculty_dashboard.html
# shipped with a "Top Students" leaderboard widget containing five
# hardcoded names and scores that never changed no matter who
# actually took quizzes — exactly the kind of fabricated data the
# "no dummy data" requirement calls out. This aggregates the REAL
# results_collection to rank students by their average score.
#
# WHICH MODULE USES THIS: Frontend/js/dashboard.js (student
# dashboard) and Frontend/js/faculty.js (faculty dashboard).
# =========================================================
@api_view(["GET"])
def leaderboard(request):
    try:
        results = list(results_collection.find({}, {"student_name": 1, "score": 1, "total": 1}))

        # Group by student and average their percentage across every
        # attempt they've made, rather than just summing raw scores
        # (which would unfairly reward students who simply attempted
        # more quizzes rather than scoring better on each one).
        per_student = {}
        for r in results:
            name = r.get("student_name")
            total = r.get("total") or 0
            if not name or not total:
                continue
            pct = (r.get("score", 0) / total) * 100
            entry = per_student.setdefault(name, {"name": name, "percentages": [], "attempts": 0})
            entry["percentages"].append(pct)
            entry["attempts"] += 1

        ranking = []
        for entry in per_student.values():
            avg = sum(entry["percentages"]) / len(entry["percentages"])
            ranking.append({
                "name": entry["name"],
                "average_score": round(avg, 1),
                "attempts": entry["attempts"],
            })

        # Highest average first; ties broken by whoever has attempted
        # more quizzes (more evidence of consistent performance).
        ranking.sort(key=lambda x: (-x["average_score"], -x["attempts"]))

        for i, entry in enumerate(ranking, start=1):
            entry["rank"] = i

        return Response({"status": "success", "leaderboard": ranking})

    except Exception as e:
        return Response({"status": "error", "message": str(e)}, status=500)


@api_view(["GET"])
def recent_activity(request):
    """
    WHY: faculty_dashboard.html's "Recent Activity" feed used to be
    five hardcoded lines ("Priya Sharma completed...", "You added
    6 new questions...") that never reflected anything real. Rather
    than fabricate a faculty audit log that doesn't exist yet, this
    returns REAL recent quiz attempts (which do exist in MongoDB)
    so the feed is honest, even though it's narrower in scope than
    the original mock content implied.
    """
    try:
        limit = int(request.GET.get("limit", 6))
        recent = list(results_collection.find(
            {}, {"student_name": 1, "subject": 1, "score": 1, "total": 1, "attempted_at": 1}
        ).sort("_id", -1).limit(limit))

        activity = []
        for r in recent:
            total = r.get("total") or 1
            pct = round((r.get("score", 0) / total) * 100)
            activity.append({
                "student_name": r.get("student_name", "A student"),
                "subject": r.get("subject", ""),
                "percentage": pct,
                "attempted_at": r["attempted_at"].isoformat() if r.get("attempted_at") else None,
            })

        return Response({"status": "success", "activity": activity})

    except Exception as e:
        return Response({"status": "error", "message": str(e)}, status=500)


# =========================================================
# STUDENT PERFORMANCE (new)
# ---------------------------------------------------------
# WHY: student_dashboard.html's two Chart.js widgets — "Accuracy
# over time" and "Questions by difficulty" — were both drawing
# from hardcoded arrays baked into dashboard.js
# (e.g. data: [58, 64, 61, 70, 75, 78, 82] for every single
# student, and a fixed [20, 48, 32] Easy/Medium/Hard split). This
# aggregates ONE student's own real quiz history from MongoDB so
# both charts reflect what they actually did.
#
# WHICH MODULE USES THIS: Frontend/js/dashboard.js's
# initPerformanceChart()/initAdaptiveChart() on student_dashboard.html.
# =========================================================
@api_view(["GET"])
def student_performance(request):
    student_name = request.GET.get("student_name")

    if not student_name:
        return Response({"status": "error", "message": "student_name is required"}, status=400)

    try:
        attempts = list(results_collection.find(
            {"student_name": student_name},
            {"subject": 1, "difficulty": 1, "score": 1, "total": 1, "attempted_at": 1}
        ).sort("_id", 1))  # oldest -> newest, so the accuracy line reads left-to-right chronologically

        accuracy_series = []
        difficulty_counts = {"easy": 0, "medium": 0, "hard": 0}

        for a in attempts:
            total = a.get("total") or 0
            if total:
                accuracy_series.append({
                    "label": a["attempted_at"].strftime("%b %d") if a.get("attempted_at") else "",
                    "percentage": round((a.get("score", 0) / total) * 100),
                })
            difficulty = a.get("difficulty", "easy")
            if difficulty in difficulty_counts:
                difficulty_counts[difficulty] += 1

        # Only the most recent 10 attempts, so the line chart doesn't
        # get unreadably dense for a student with a long history.
        accuracy_series = accuracy_series[-10:]

        # BUG FIX: student_dashboard.html's 4 stat cards (Quizzes
        # Attempted, Average Score, Day Streak, Leaderboard Rank)
        # used to be hardcoded (48 / 82% / 7 / #12) for every student.
        # Computed here from the same `attempts` list already fetched
        # above, so this doesn't cost an extra MongoDB round trip.
        if attempts:
            all_percentages = [
                (a.get("score", 0) / a["total"]) * 100
                for a in attempts if a.get("total")
            ]
            average_score = round(sum(all_percentages) / len(all_percentages)) if all_percentages else 0
        else:
            average_score = 0

        # DAY STREAK: count consecutive calendar days with at least
        # one attempt, walking backward from today (a streak started
        # yesterday still "counts" today so it doesn't reset the
        # instant midnight passes without a new attempt yet).
        attempt_dates = sorted({
            a["attempted_at"].date() for a in attempts if a.get("attempted_at")
        }, reverse=True)

        day_streak = 0
        if attempt_dates:
            today = datetime.now().date()
            yesterday = today - timedelta(days=1)
            cursor = today if attempt_dates[0] == today else (yesterday if attempt_dates[0] == yesterday else None)

            if cursor is not None:
                date_set = set(attempt_dates)
                while cursor in date_set:
                    day_streak += 1
                    cursor = cursor - timedelta(days=1)

        # Same ranking approach as leaderboard()/get_profile(), kept
        # consistent so a student's rank matches everywhere it's shown.
        all_results = list(results_collection.find({}, {"student_name": 1, "score": 1, "total": 1}))
        per_student = {}
        for r in all_results:
            rn = r.get("student_name")
            total = r.get("total") or 0
            if not rn or not total:
                continue
            pct = (r.get("score", 0) / total) * 100
            entry = per_student.setdefault(rn, {"name": rn, "percentages": []})
            entry["percentages"].append(pct)
        ranking = sorted(
            per_student.values(),
            key=lambda e: -(sum(e["percentages"]) / len(e["percentages"]))
        )
        rank = next((i + 1 for i, e in enumerate(ranking) if e["name"] == student_name), None)

        return Response({
            "status": "success",
            "accuracy_series": accuracy_series,
            "difficulty_counts": difficulty_counts,
            "total_attempts": len(attempts),
            "quizzes_attempted": len(attempts),
            "average_score": average_score,
            "day_streak": day_streak,
            "leaderboard_rank": rank,
        })

    except Exception as e:
        return Response({"status": "error", "message": str(e)}, status=500)


@api_view(["GET"])
def subject_question_counts(request):
    """
    WHY: subjects.html (the public "browse subjects" page) shipped
    with a hardcoded question count on every card ("132 Questions",
    "98 Questions", ...) that had nothing to do with what was
    actually in MongoDB. This returns the REAL count per subject so
    the page is honest — including subjects that currently have
    zero questions (faculty just hasn't added any yet), rather than
    implying a question bank that doesn't exist.
    WHICH MODULE USES THIS: Frontend/js/common.js's
    initSubjectCards() on subjects.html.
    """
    try:
        counts = {}
        for doc in questions_collection.aggregate([
            {"$group": {"_id": "$subject", "count": {"$sum": 1}}}
        ]):
            if doc["_id"]:
                counts[doc["_id"]] = doc["count"]

        return Response({"status": "success", "counts": counts})

    except Exception as e:
        return Response({"status": "error", "message": str(e)}, status=500)