from django.urls import path
from . import views

# =========================================================
# QUIZCRAFT — users/urls.py
# Every API route the frontend talks to (see the fetch() calls in
# Frontend/js/*.js) lives under /users/, matching the project's
# existing single-app routing style. New routes added for this
# milestone are grouped at the bottom and clearly commented; every
# pre-existing route above them is untouched.
# =========================================================
urlpatterns = [
    path("register/", views.register, name="register"),
    path("login/", views.login, name="login"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("add-subject/",views.add_subject),
    path("subjects/",views.get_subjects),
    path("add-question/", views.add_question),
    path("questions/", views.get_questions),
    path("submit-result/", views.submit_result),
    path("latest-result/", views.get_latest_result),
    path("history/", views.get_history),
    path("delete-question/<str:id>/", views.delete_question),

    # --- New routes added to complete MongoDB CRUD + adaptive quiz ---
    # Fetch ONE question by id (edit_question.html prefill).
    path("get-question/<str:id>/", views.get_question),
    # Update an existing question (completes CRUD's missing "Update").
    path("edit-question/<str:id>/", views.edit_question),
    # DRF-based adaptive quiz generator: GET ?subject=&difficulty=&count=
    path("generate-quiz/", views.generate_adaptive_quiz),
    # DRF-based live faculty dashboard stats (questions/subjects/students/avg score).
    path("faculty-stats/", views.faculty_dashboard_stats),

    # --- New routes: Profile API (profile.html) ---
    path("get-profile/", views.get_profile),
    path("update-profile/", views.update_profile),
    path("change-password/", views.change_password),

    # --- New routes: completes Subject CRUD (add/get already existed) ---
    path("edit-subject/<str:id>/", views.edit_subject),
    path("delete-subject/<str:id>/", views.delete_subject),

    # --- New route: real Google Sign-In (verifies a Google ID token) ---
    path("google-login/", views.google_login),

    # --- New routes: real dashboard widgets (replaces hardcoded leaderboard/activity) ---
    path("leaderboard/", views.leaderboard),
    path("recent-activity/", views.recent_activity),
    path("student-performance/", views.student_performance),
    path("subject-question-counts/", views.subject_question_counts),
]
