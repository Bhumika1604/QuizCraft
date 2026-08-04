# QuizCraft — Frontend (MCA Final Year Project)

Adaptive Quiz Generator frontend. HTML5, CSS3, Bootstrap 5, vanilla JavaScript,
Chart.js and AOS. No React/Angular/Vue/Tailwind/TypeScript/Node.

## ⚠️ How to run this (read this first)

**Fully extract the ZIP to a real folder before opening anything.**
Double-clicking an HTML file while it's still sitting inside the `.zip`
(Windows' built-in zip preview, or macOS's Archive Utility "peek") will load
the page from a temporary virtual location. Relative paths like `css/pages.css`
or `js/common.js` can silently fail to load from there, and you'll see an
unstyled, broken-looking page even though nothing is actually wrong with the
code.

**Correct steps:**
1. Right-click the ZIP → **Extract All** (Windows) or double-click to unzip (Mac).
2. Open the **extracted folder**, not the zip.
3. Double-click `index.html` (or any other page) directly from that folder.

No local server is required — every page works straight off the filesystem
via `file://`.

## Project structure

```
QuizCraft/
├── index.html                 Homepage (marketing)
├── loginpage1.html            Login
├── registerpage1.html         Register / Create Account
├── faculty_dashboard.html     Faculty: dashboard + charts + leaderboard
├── manage_questions.html      Faculty: question bank (search/filter/pagination)
├── add_question.html          Faculty: add a question
├── edit_question.html         Faculty: edit a question (pre-filled sample)
├── view_results.html          Faculty: student results + charts + CSV export
├── student_dashboard.html     Student: dashboard + charts + subjects
├── quiz.html                  Student: adaptive quiz-taking screen
├── result.html                Student: quiz result + breakdown
├── history.html                Student: quiz attempt history
├── profile.html                Shared: personal info + change password
├── features.html / subjects.html / about.html / contact.html / 404.html
│
├── css/
│   ├── pages.css        Design tokens (colors/fonts/shadows), buttons, cards,
│   │                    badges, and shared marketing components
│   ├── navbar.css       Shared sticky glass navbar
│   ├── footer.css       Shared footer
│   ├── dashboard.css    Student dashboard stat cards / panels / leaderboard
│   ├── faculty.css      Faculty welcome banner / notifications / activity list
│   ├── question.css     Tables, filters, pagination, forms, modals
│   ├── quiz.css         Quiz-taking UI + result page
│   ├── auth.css         Profile page (avatar, tabs, password strength)
│   └── responsive.css   Cross-page responsive helpers
│
├── js/
│   ├── common.js        Navbar scroll/menu, dark mode, AOS init, ripple,
│   │                    scroll-reveal, counters, profile tab logic, contact form
│   ├── dashboard.js     Student dashboard Chart.js charts
│   ├── faculty.js       Faculty dashboard charts, question table, forms, results table
│   ├── quiz.js          Quiz timer, question rendering, palette, scoring
│   ├── result.js        Result ring/chart, CSV/text download
│   └── history.js       History table + trend chart
│
├── loginpage1.css / .js        Standalone (login page is self-contained)
├── registerpage1.css / .js     Standalone (register page is self-contained)
├── style.css / main.js         Standalone (homepage is self-contained)
│
├── images/, icons/, assets/    Empty — no real image assets were needed;
│                               everything visual is built with CSS/SVG
```

Note: `index.html`, `loginpage1.html`, and `registerpage1.html` each ship
with their own dedicated CSS/JS and don't depend on the shared `css/`/`js/`
folders above — that's intentional, they were built as standalone pages
earlier in this project.

## Data

Every table/chart (question bank, student results, quiz history, dashboard
stats) is powered by a hardcoded JavaScript array near the top of its
`.js` file, clearly commented. Search each file for `NOTE:` to find the
exact spot to swap in a real API call once your Django + DRF + MongoDB
backend is ready — e.g. replacing `QUESTION_BANK` in `faculty.js` with a
`fetch('/api/questions/')` call.

## Known limitations (by design, for a frontend-only submission)

- Forms validate client-side and show a success state, but don't persist
  data anywhere real yet (no backend exists).
- "Continue with Google" buttons are UI only.
- Quiz results pass between `quiz.html` → `result.html` via `localStorage`
  as a stand-in for a real API round trip.
