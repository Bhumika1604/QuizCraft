from django.urls import path

from .views import auth_views, subject_views, question_views, quiz_views, result_views, student_views, faculty_views

urlpatterns = [
    # AUTH
    path("auth/register/", auth_views.RegisterView.as_view()),
    path("auth/login/", auth_views.LoginView.as_view()),
    path("auth/logout/", auth_views.LogoutView.as_view()),
    path("auth/me/", auth_views.MeView.as_view()),

    # STUDENT
    path("student/dashboard/", student_views.StudentDashboardView.as_view()),
    path("student/profile/", student_views.StudentProfileView.as_view()),
    path("student/change-password/", student_views.StudentChangePasswordView.as_view()),
    path("student/history/", student_views.StudentHistoryView.as_view()),
    path("student/analytics/", student_views.StudentAnalyticsView.as_view()),
    path("student/results/", result_views.StudentResultsView.as_view()),
    path("student/leaderboard/", student_views.LeaderboardView.as_view()),

    # SUBJECTS
    path("subjects/", subject_views.SubjectListCreateView.as_view()),
    path("subjects/<str:subject_id>/", subject_views.SubjectDetailView.as_view()),

    # QUESTIONS
    path("questions/", question_views.QuestionListCreateView.as_view()),
    path("questions/<str:question_id>/", question_views.QuestionDetailView.as_view()),

    # QUIZ
    path("quiz/start/", quiz_views.QuizStartView.as_view()),
    path("quiz/<str:attempt_id>/", quiz_views.QuizStateView.as_view()),
    path("quiz/<str:attempt_id>/answer/", quiz_views.QuizAnswerView.as_view()),
    path("quiz/<str:attempt_id>/submit/", quiz_views.QuizSubmitView.as_view()),

    # RESULTS
    path("results/<str:attempt_id>/", result_views.ResultDetailView.as_view()),

    # FACULTY
    path("faculty/dashboard/", faculty_views.FacultyDashboardView.as_view()),
    path("faculty/results/", faculty_views.FacultyResultsView.as_view()),
    path("faculty/analytics/", faculty_views.FacultyAnalyticsView.as_view()),
    path("faculty/profile/", faculty_views.FacultyProfileView.as_view()),
    path("faculty/change-password/", faculty_views.FacultyChangePasswordView.as_view()),
]
