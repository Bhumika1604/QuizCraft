"""
core/analytics.py
==================
Every number shown on the student dashboard, student analytics page,
profile page, faculty dashboard and faculty analytics page is computed
HERE from real MongoDB documents. Nothing in this file is hardcoded -
if there is no data yet, functions return honest zeros / empty lists
and the frontend renders an explicit empty state instead of a fake chart.
"""
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from .db import collections
from .services import oid_str, to_oid


def _completed_attempts(user_id):
    return list(
        collections.quiz_attempts.find(
            {"user_id": to_oid(user_id), "status": "completed"}
        ).sort("completed_at", 1)
    )


# --------------------------------------------------------------- STREAK ---
def calculate_day_streak(attempts):
    """Counts consecutive days (ending today or yesterday) that have at
    least one completed attempt. E.g. attempts on Aug 15, 16, 17 with
    'today' = Aug 17 -> streak = 3."""
    if not attempts:
        return 0
    dates = sorted({a["completed_at"].date() for a in attempts if a.get("completed_at")}, reverse=True)
    if not dates:
        return 0
    today = datetime.now(timezone.utc).date()
    if dates[0] not in (today, today - timedelta(days=1)):
        return 0
    streak = 1
    for i in range(len(dates) - 1):
        if (dates[i] - dates[i + 1]).days == 1:
            streak += 1
        else:
            break
    return streak


# ----------------------------------------------------------- LEADERBOARD --
def leaderboard(limit=50):
    """Ranks students by average percentage across all completed attempts
    (ties broken by total attempts, more experience ranked higher)."""
    pipeline = [
        {"$match": {"status": "completed"}},
        {"$group": {
            "_id": "$user_id",
            "avg_percentage": {"$avg": "$percentage"},
            "attempts": {"$sum": 1},
        }},
        {"$sort": {"avg_percentage": -1, "attempts": -1}},
        {"$limit": limit},
    ]
    rows = list(collections.quiz_attempts.aggregate(pipeline))
    out = []
    for rank, row in enumerate(rows, start=1):
        user = collections.users.find_one({"_id": row["_id"]})
        if not user:
            continue
        out.append({
            "rank": rank,
            "user_id": oid_str(row["_id"]),
            "full_name": user["full_name"],
            "average_percentage": round(row["avg_percentage"], 2),
            "attempts": row["attempts"],
        })
    return out


def student_rank(user_id):
    board = leaderboard(limit=100000)
    for entry in board:
        if entry["user_id"] == str(user_id):
            return entry["rank"], entry["average_percentage"]
    return None, None


# ------------------------------------------------------- STUDENT DASHBOARD -
def student_dashboard(user_id):
    attempts = _completed_attempts(user_id)
    total_attempts = len(attempts)
    if total_attempts == 0:
        rank, avg_for_rank = None, None
    else:
        rank, avg_for_rank = student_rank(user_id)

    percentages = [a["percentage"] for a in attempts]
    average_score = round(sum(percentages) / total_attempts, 2) if total_attempts else 0.0
    best_score = round(max(percentages), 2) if total_attempts else 0.0

    recent = list(reversed(attempts))[:5]
    recent_out = [{
        "attempt_id": oid_str(a["_id"]),
        "subject": a["subject"],
        "percentage": a["percentage"],
        "passed": a.get("passed", False),
        "completed_at": a["completed_at"].isoformat() if a.get("completed_at") else None,
    } for a in recent]

    subj_totals = defaultdict(list)
    for a in attempts:
        subj_totals[a["subject"]].append(a["percentage"])
    subject_performance = [
        {"subject": s, "average_percentage": round(sum(v) / len(v), 2), "attempts": len(v)}
        for s, v in subj_totals.items()
    ]

    return {
        "quizzes_attempted": total_attempts,
        "average_score": average_score,
        "best_score": best_score,
        "day_streak": calculate_day_streak(attempts),
        "leaderboard_rank": rank,
        "recent_quizzes": recent_out,
        "subject_performance": subject_performance,
    }


# -------------------------------------------------------- STUDENT ANALYTICS
def student_analytics(user_id):
    attempts = _completed_attempts(user_id)
    if not attempts:
        return {"has_data": False}

    # A) performance trend
    trend = [{
        "date": a["completed_at"].strftime("%Y-%m-%d") if a.get("completed_at") else "",
        "percentage": a["percentage"],
        "subject": a["subject"],
    } for a in attempts]

    # B) subject performance
    subj_totals = defaultdict(list)
    for a in attempts:
        subj_totals[a["subject"]].append(a["percentage"])
    subject_performance = [
        {"subject": s, "average_percentage": round(sum(v) / len(v), 2), "attempts": len(v)}
        for s, v in subj_totals.items()
    ]

    # C) difficulty distribution (questions attempted at each difficulty)
    difficulty_counts = {"Easy": 0, "Medium": 0, "Hard": 0}
    difficulty_correct = {"Easy": 0, "Medium": 0, "Hard": 0}
    correct_total, wrong_total, unanswered_total = 0, 0, 0
    for a in attempts:
        correct_total += a.get("correct_count", 0)
        wrong_total += a.get("wrong_count", 0)
        unanswered_total += a.get("unanswered_count", 0)
        for ans in a.get("answers", []):
            d = ans.get("difficulty", "Medium")
            if d in difficulty_counts:
                difficulty_counts[d] += 1
                if ans.get("is_correct"):
                    difficulty_correct[d] += 1

    difficulty_accuracy = {
        d: (round(difficulty_correct[d] / difficulty_counts[d] * 100, 2) if difficulty_counts[d] else 0.0)
        for d in difficulty_counts
    }

    percentages = [a["percentage"] for a in attempts]
    average_score = round(sum(percentages) / len(percentages), 2)
    highest = round(max(percentages), 2)
    lowest = round(min(percentages), 2)

    # G) recommended current difficulty = the difficulty of the most recent
    # answered question across all attempts (mirrors what AdaptiveEngine
    # would hand the student next).
    last_attempt = attempts[-1]
    current_recommended_difficulty = (
        last_attempt["difficulty_progression"][-1]
        if last_attempt.get("difficulty_progression") else "Medium"
    )

    # I/H weak & strong subjects
    ranked_subjects = sorted(subject_performance, key=lambda s: s["average_percentage"])
    weak_subjects = [s["subject"] for s in ranked_subjects[:2] if s["average_percentage"] < 60]
    strong_subjects = [s["subject"] for s in ranked_subjects[::-1][:2] if s["average_percentage"] >= 60]

    # J) improvement trend: compare first half vs second half of attempts
    half = max(1, len(attempts) // 2)
    earlier = percentages[:half]
    recent_half = percentages[half:] or percentages[-1:]
    improvement = round((sum(recent_half) / len(recent_half)) - (sum(earlier) / len(earlier)), 2)

    return {
        "has_data": True,
        "performance_trend": trend,
        "subject_performance": subject_performance,
        "difficulty_distribution": difficulty_counts,
        "difficulty_accuracy": difficulty_accuracy,
        "correct_vs_incorrect": {
            "correct": correct_total, "wrong": wrong_total, "unanswered": unanswered_total,
        },
        "score_stats": {
            "average": average_score, "highest": highest, "lowest": lowest,
            "total_attempts": len(attempts),
        },
        "adaptive_summary": {
            "questions_by_difficulty": difficulty_counts,
            "accuracy_by_difficulty": difficulty_accuracy,
            "current_recommended_difficulty": current_recommended_difficulty,
        },
        "weak_subjects": weak_subjects,
        "strong_subjects": strong_subjects,
        "improvement_percentage": improvement,
    }


# ------------------------------------------------------------- PROFILE ----
def student_profile_stats(user_id):
    attempts = _completed_attempts(user_id)
    rank, _ = student_rank(user_id) if attempts else (None, None)
    percentages = [a["percentage"] for a in attempts]
    return {
        "quizzes_attempted": len(attempts),
        "average_score": round(sum(percentages) / len(percentages), 2) if attempts else 0.0,
        "best_score": round(max(percentages), 2) if attempts else 0.0,
        "leaderboard_rank": rank,
    }


def faculty_profile_stats(user_id):
    questions_in_bank = collections.questions.count_documents({"created_by": to_oid(user_id)})
    subjects_managed = len(collections.subjects.distinct("name"))
    total_students = collections.users.count_documents({"role": "student"})
    total_attempts = collections.quiz_attempts.count_documents({"status": "completed"})
    return {
        "questions_in_bank": questions_in_bank,
        "subjects_managed": subjects_managed,
        "total_students": total_students,
        "total_quiz_attempts": total_attempts,
    }


# -------------------------------------------------------- FACULTY DASHBOARD
def faculty_dashboard():
    total_questions = collections.questions.count_documents({})
    total_subjects = collections.subjects.count_documents({})
    total_students = collections.users.count_documents({"role": "student"})
    completed = list(collections.quiz_attempts.find({"status": "completed"}))
    total_attempts = len(completed)
    percentages = [a["percentage"] for a in completed]
    average_score = round(sum(percentages) / len(percentages), 2) if completed else 0.0
    pass_count = sum(1 for a in completed if a.get("passed"))
    pass_rate = round(pass_count / total_attempts * 100, 2) if total_attempts else 0.0

    subject_attempts = defaultdict(int)
    for a in completed:
        subject_attempts[a["subject"]] += 1
    most_attempted_subject = max(subject_attempts, key=subject_attempts.get) if subject_attempts else None

    recent = sorted(completed, key=lambda a: a.get("completed_at") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)[:8]
    recent_out = []
    for a in recent:
        user = collections.users.find_one({"_id": a["user_id"]})
        recent_out.append({
            "attempt_id": oid_str(a["_id"]),
            "student_name": user["full_name"] if user else "Unknown",
            "subject": a["subject"],
            "percentage": a["percentage"],
            "passed": a.get("passed", False),
            "completed_at": a["completed_at"].isoformat() if a.get("completed_at") else None,
        })

    return {
        "total_questions": total_questions,
        "total_subjects": total_subjects,
        "total_students": total_students,
        "total_quiz_attempts": total_attempts,
        "average_student_score": average_score,
        "pass_rate": pass_rate,
        "most_attempted_subject": most_attempted_subject,
        "recent_attempts": recent_out,
    }


# -------------------------------------------------------- FACULTY ANALYTICS
def faculty_analytics():
    completed = list(collections.quiz_attempts.find({"status": "completed"}))
    if not completed:
        return {"has_data": False}

    subj_scores = defaultdict(list)
    for a in completed:
        subj_scores[a["subject"]].append(a["percentage"])
    avg_score_by_subject = [
        {"subject": s, "average_percentage": round(sum(v) / len(v), 2)} for s, v in subj_scores.items()
    ]

    pass_count = sum(1 for a in completed if a.get("passed"))
    fail_count = len(completed) - pass_count

    student_scores = defaultdict(list)
    for a in completed:
        student_scores[str(a["user_id"])].append(a["percentage"])
    student_performance = []
    for uid, scores in student_scores.items():
        user = collections.users.find_one({"_id": to_oid(uid)})
        if not user:
            continue
        student_performance.append({
            "student_name": user["full_name"],
            "average_percentage": round(sum(scores) / len(scores), 2),
            "attempts": len(scores),
        })
    student_performance.sort(key=lambda s: s["average_percentage"], reverse=True)

    attempts_over_time = defaultdict(int)
    for a in completed:
        if a.get("completed_at"):
            attempts_over_time[a["completed_at"].strftime("%Y-%m-%d")] += 1
    attempts_over_time_out = [
        {"date": d, "count": c} for d, c in sorted(attempts_over_time.items())
    ]

    difficulty_dist = {"Easy": 0, "Medium": 0, "Hard": 0}
    for a in completed:
        for ans in a.get("answers", []):
            d = ans.get("difficulty")
            if d in difficulty_dist:
                difficulty_dist[d] += 1

    return {
        "has_data": True,
        "average_score_by_subject": avg_score_by_subject,
        "pass_fail_distribution": {"pass": pass_count, "fail": fail_count},
        "student_performance": student_performance,
        "attempts_over_time": attempts_over_time_out,
        "difficulty_distribution": difficulty_dist,
    }


def faculty_results(student_search=None, subject=None):
    query = {"status": "completed"}
    if subject:
        query["subject"] = subject
    attempts = list(collections.quiz_attempts.find(query).sort("completed_at", -1))
    out = []
    for a in attempts:
        user = collections.users.find_one({"_id": a["user_id"]})
        name = user["full_name"] if user else "Unknown"
        if student_search and student_search.lower() not in name.lower():
            continue
        out.append({
            "attempt_id": oid_str(a["_id"]),
            "student_name": name,
            "student_email": user["email"] if user else "",
            "subject": a["subject"],
            "score": a["score"],
            "total_marks": a["total_marks"],
            "percentage": a["percentage"],
            "difficulty_progression": a["difficulty_progression"],
            "time_taken_seconds": a.get("time_taken_seconds", 0),
            "passed": a.get("passed", False),
            "completed_at": a["completed_at"].isoformat() if a.get("completed_at") else None,
        })
    return out
