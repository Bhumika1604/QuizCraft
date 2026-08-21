# QuizCraft — Adaptive Quiz Generator

QuizCraft is an adaptive online quiz platform for EdTech use. Students take
quizzes whose difficulty adjusts question-by-question based on their
answers; every attempt is scored and stored, and both students and faculty
get real analytics computed from that data. Faculty manage a MongoDB-backed
question bank and see class-wide results.

Stack: **Python, Django, Django REST Framework, MongoDB (PyMongo)**,
server-rendered **HTML/CSS/JavaScript** (Bootstrap 5 + Chart.js). No React —
this is intentionally a classic Django + vanilla JS project.

---

## 1. Features

- Real registration/login/logout with hashed passwords and role-based
  access (Student / Faculty), enforced **server-side** on every API call —
  not just hidden buttons.
- Adaptive quiz engine: starts at Medium, moves to Hard on a correct
  answer, drops toward Easy on a wrong answer, with graceful fallback if a
  subject is short on questions at one difficulty.
- Server-authoritative countdown timer with auto-submit; the backend
  re-derives remaining time from `started_at` on every request, so a
  tampered client-side timer can't extend a quiz.
- Full scoring pipeline (correct/wrong/unanswered, percentage, pass/fail)
  stored per attempt in MongoDB.
- Student dashboard, history, and analytics (performance trend, subject
  breakdown, difficulty distribution, correct/incorrect split, adaptive
  summary, weak/strong subjects, improvement trend) — all computed from
  real attempts, with honest empty states when there's no data yet.
- Leaderboard rank and day-streak, computed from actual attempt dates —
  never a hardcoded `#0`.
- Faculty question bank CRUD, subject management, results table
  (search/filter), and analytics dashboard (5 chart types).
- One consistent REST API (`{success, data, message}` JSON) and one
  consistent question schema (`options: [...]`) used identically by the
  backend, the serializers, and every page's JavaScript.

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Backend framework | Django 5.1 + Django REST Framework |
| Database | MongoDB via PyMongo (application data) |
| Django's own DB | SQLite (admin log / migrations only — **not** app data) |
| Auth | Custom Bearer-token auth, tokens stored in a Mongo `sessions` collection |
| Frontend | Django templates + Bootstrap 5 + vanilla JS + Chart.js |

## 3. Project Structure

```
QuizCraft/
├── manage.py
├── requirements.txt
├── .env.example
├── README.md
│
├── backend/                 # Django project settings/urls
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py / asgi.py
│
├── core/                    # The academic "engine" — framework-agnostic
│   ├── db.py                 # single MongoDB connection + collections
│   ├── domain.py              # Question, Quiz, AdaptiveEngine classes
│   ├── services.py            # all MongoDB CRUD / business logic
│   ├── analytics.py           # dashboard/analytics/leaderboard calculations
│   ├── validators.py          # regex-based input validation
│   ├── authentication.py      # DRF Bearer-token auth against Mongo
│   ├── permissions.py         # IsStudent / IsFaculty + response helpers
│   ├── exceptions.py / exception_handler.py
│   └── tests_logic.py         # automated logic test suite (see §10)
│
├── api/                     # REST API app
│   ├── urls.py
│   ├── views/                 # auth_views, student_views, faculty_views, ...
│   └── management/commands/seed_data.py
│
├── frontend/                # Page-serving Django app
│   ├── views.py / urls.py
│   └── templates/frontend/*.html
│
└── static/
    ├── css/style.css
    └── js/*.js               # api.js (shared fetch helper) + one file per page
```

## 4. Prerequisites

- Python 3.10+
- MongoDB running locally, or a MongoDB Atlas connection string

## 5. Setup

```bash
# 1. Clone / unzip the project, then from the project root:
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# edit .env — at minimum set MONGO_URI if not using the local default

# 4. Django's own internal tables (admin log, migrations) — NOT app data
python manage.py migrate

# 5. Seed MongoDB with sample subjects, questions, and accounts
python manage.py seed_data

# 6. Run
python manage.py runserver
```

Open **http://127.0.0.1:8000/**.


### MongoDB setup

**Local:** install MongoDB Community Server and make sure `mongod` is
running (default `mongodb://localhost:27017/`). No further configuration
needed — `MONGO_URI` in `.env.example` already points at it.

**Atlas (cloud):** create a free cluster, get its connection string, and
set:
```
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>/?retryWrites=true&w=majority
MONGO_DB_NAME=quizcraft
```

On startup, `core/db.py` pings MongoDB immediately. If it can't connect,
the app prints a clear error and does **not** silently fall back to
SQLite — you'll know right away if MongoDB isn't reachable.

## 6. Sample Credentials

Created by `python manage.py seed_data`:

| Role | Email | Password |
|---|---|---|
| Student | `student@quizcraft.com` | `Student@123` |
| Faculty | `faculty@quizcraft.com` | `Faculty@123` |

The seed script also creates 4 subjects (Python Programming, Web
Development, Database Systems, Data Structures & Algorithms) with
Easy/Medium/Hard questions in each, so the app is never empty on first
run. Re-running `seed_data` is safe — it skips anything that already
exists instead of creating duplicates.

## 7. MongoDB Collections

| Collection | Purpose |
|---|---|
| `users` | full_name, email (unique), password_hash, role, phone, timestamps |
| `subjects` | name (unique), description |
| `questions` | question_text, subject, options[4], correct_answer, difficulty, marks, created_by |
| `quiz_attempts` | full per-attempt record: answers[], difficulty_progression[], score, percentage, timing, status |
| `results` | compact summary mirror of each completed attempt (attempt_id, user_id, subject, score, percentage, date) |
| `sessions` | Bearer token → user_id + expiry (TTL-indexed, auto-expires) |

## 8. Authentication Flow

1. `POST /api/auth/register/` — validates input (regex), hashes the
   password (Django's `make_password`), stores the user in `users`, then
   logs the new user in automatically and returns a Bearer token.
2. `POST /api/auth/login/` — verifies the hash, issues a new token stored
   in `sessions` (7-day expiry), returns `{token, user}`.
3. Every subsequent request sends `Authorization: Bearer <token>`.
   `core/authentication.py` resolves it against `sessions` → `users` on
   every call — no client-trusted role flags.
4. `IsStudent` / `IsFaculty` DRF permission classes enforce role access on
   every protected endpoint. A student calling a faculty-only endpoint
   gets a real `403`, not just a hidden button.
5. `POST /api/auth/logout/` deletes the session document; the token stops
   working immediately.

## 9. Quiz & Adaptive Engine Flow

1. `POST /api/quiz/start/` — creates a `quiz_attempts` document, picks a
   **Medium** question via `AdaptiveEngine.pick_question()`, registers a
   server-side timer, returns the question (no `correct_answer` field).
2. `POST /api/quiz/<id>/answer/` — evaluates the answer, records it,
   applies the adaptive rule, and returns the next question:

   ```
   Medium + correct   → Hard
   Hard   + correct   → Hard (stays)
   Hard   + incorrect → Medium
   Medium + incorrect → Easy
   Easy   + correct   → Medium
   Easy   + incorrect → Easy (stays)
   ```

   Question selection queries MongoDB by `{subject, difficulty}` and picks
   randomly among unused matches; if that difficulty is out of fresh
   questions it falls back to a neighbouring difficulty instead of
   crashing or returning an empty quiz.
3. After the configured number of questions (10 by default), the backend
   finalizes the attempt: computes score/percentage/pass-fail, writes a
   summary into `results`, and returns the full result payload.
4. Every remaining action (auto-submit on timer expiry, duplicate
   submission, fetching someone else's attempt) is checked server-side —
   the frontend timer is cosmetic only.

## 10. Testing Performed

Two layers of automated testing are included, both exercising the *real*
PyMongo-driver code (no logic is faked or stubbed out for tests):

**`core/tests_logic.py`** — 10 test cases against an in-memory MongoDB
(`mongomock`), covering registration/validation, login success & failure,
subject & question CRUD, empty-question-bank handling, a full 10-question
adaptive quiz run (verifies it climbs to Hard on all-correct answers),
adaptive difficulty dropping on a wrong answer, dashboard/analytics
reflecting a real attempt, profile update + password change, and the
regex validators. Run with:

```bash
USE_MONGOMOCK=True python manage.py test core.tests_logic -v 2
```

**Full HTTP end-to-end pass** — with the dev server actually running, a
script drove the real API over HTTP: register faculty & student → faculty
creates a subject and 12 questions → verified the question response
schema has no `option1`-style bug → student takes a full adaptive quiz →
verified difficulty climbed to Hard and score was scored correctly →
verified dashboard, history, analytics, and profile all updated
automatically → verified faculty dashboard/results/analytics reflect the
same attempt → edited and deleted a question → logged out and confirmed
the token stops working (`401`) → confirmed role-based `403`s for a
student hitting faculty-only endpoints. All 23 page routes and both
static asset paths were also checked for `200`s.

**Note on MongoDB in this build environment:** the environment this
project was built in has no real `mongod` available (no network path to
install one), so live testing above used `mongomock`, a faithful in-memory
PyMongo-compatible driver — the same driver calls run unchanged against a
real MongoDB. **You should still do one basic smoke test yourself** after
pointing `MONGO_URI` at your real MongoDB: run `seed_data`, log in as the
sample student, take one quiz, and confirm the dashboard/history/analytics
update — this exercises the exact same code path, just against a real
server instead of the in-memory one.

## 11. API Endpoints

All responses follow `{ "success": bool, "data": ..., "message": str }`.

**Auth**
```
POST   /api/auth/register/
POST   /api/auth/login/
POST   /api/auth/logout/
GET    /api/auth/me/
```

**Student**
```
GET    /api/student/dashboard/
GET    /api/student/profile/
PUT    /api/student/profile/
POST   /api/student/change-password/
GET    /api/student/history/            ?subject=&difficulty=
GET    /api/student/analytics/
GET    /api/student/results/
GET    /api/student/leaderboard/
```

**Subjects**
```
GET    /api/subjects/
POST   /api/subjects/                   (faculty)
PUT    /api/subjects/<id>/              (faculty)
DELETE /api/subjects/<id>/              (faculty)
```

**Questions**
```
GET    /api/questions/                  ?subject=&difficulty=&search=&page=
POST   /api/questions/                  (faculty)
GET    /api/questions/<id>/
PUT    /api/questions/<id>/             (faculty)
DELETE /api/questions/<id>/             (faculty)
```

**Quiz**
```
POST   /api/quiz/start/                 { subject }
GET    /api/quiz/<attempt_id>/
POST   /api/quiz/<attempt_id>/answer/   { question_id, selected_answer }
POST   /api/quiz/<attempt_id>/submit/
```

**Results**
```
GET    /api/results/<attempt_id>/
```

**Faculty**
```
GET    /api/faculty/dashboard/
GET    /api/faculty/results/            ?student=&subject=
GET    /api/faculty/analytics/
GET    /api/faculty/profile/
PUT    /api/faculty/profile/
POST   /api/faculty/change-password/
```

## 12. Student Workflow

Register/Login → Subjects page (shows live question counts) → Start Quiz
→ answer questions with a live server-checked timer and a progress bar →
Submit (or auto-submit on timeout) → Result page (score circle,
correct/wrong/unanswered, difficulty progression, pass/fail) → Dashboard,
History and Analytics all reflect the new attempt immediately, and again
after a page refresh (everything is read from MongoDB, not localStorage).

## 13. Faculty Workflow

Register/Login as faculty → Manage Subjects (create/edit/delete) → Add
Question (dropdown of live subjects, 4-option form, correct-answer
picker) → Manage Questions (search/filter/edit/delete, all hitting
MongoDB) → Results (every student attempt, searchable by name, filterable
by subject) → Analytics (score by subject, pass/fail split, attempts over
time, difficulty distribution, top students) → Profile (question/subject/
student/attempt counts, all live).

## 14. Troubleshooting

- **"Could not connect to MongoDB" on startup** — start your local
  `mongod`, or fix `MONGO_URI`/`MONGO_DB_NAME` in `.env`. The app refuses
  to silently fall back to SQLite for application data.
- **Empty dashboard/analytics right after install** — run
  `python manage.py seed_data`, then log in and take a quiz (or use the
  sample student account) to generate real attempt data.
- **Static files 404 in production** — run
  `python manage.py collectstatic` and make sure your web server serves
  `STATIC_ROOT`.
- **CORS errors calling the API from a different origin** — set
  `CORS_ALLOWED_ORIGINS` in `.env`; in `DEBUG=True` all origins are
  already allowed for local development.
- **Google Sign-In** — not configured by default; the login/register
  pages simply don't render a Google button unless `GOOGLE_CLIENT_ID` is
  set. There is no fake "Sign in with Google" UI pretending to work.

## 15. Running Tests

```bash
# Logic test suite (in-memory MongoDB, no server required)
USE_MONGOMOCK=True python manage.py test core.tests_logic -v 2

# Django system check
python manage.py check
```

## 16. What You Need to Provide

- A running MongoDB instance (local `mongod` or an Atlas connection
  string) — this is the one piece of infrastructure the project can't
  supply for you.
- A real `SECRET_KEY` and `DEBUG=False` before any real deployment.
- If you want Google Sign-In, your own `GOOGLE_CLIENT_ID`.
