from django.urls import path
from . import views

urlpatterns = [
    path("", views.IndexView.as_view(), name="index"),
    path("about/", views.AboutView.as_view(), name="about"),
    path("contact/", views.ContactView.as_view(), name="contact"),
    path("features/", views.FeaturesView.as_view(), name="features"),
    path("login/", views.LoginPageView.as_view(), name="login"),
    path("register/", views.RegisterPageView.as_view(), name="register"),

    path("dashboard/", views.StudentDashboardView.as_view(), name="student_dashboard"),
    path("subjects/", views.SubjectsView.as_view(), name="subjects"),
    path("quiz/", views.QuizView.as_view(), name="quiz"),
    path("result/", views.ResultView.as_view(), name="result"),
    path("history/", views.HistoryView.as_view(), name="history"),
    path("analytics/", views.AnalyticsView.as_view(), name="analytics"),
    path("profile/", views.ProfileView.as_view(), name="profile"),

    path("faculty/dashboard/", views.FacultyDashboardView.as_view(), name="faculty_dashboard"),
    path("faculty/questions/", views.ManageQuestionsView.as_view(), name="manage_questions"),
    path("faculty/questions/add/", views.AddQuestionView.as_view(), name="add_question"),
    path("faculty/questions/edit/", views.EditQuestionView.as_view(), name="edit_question"),
    path("faculty/subjects/", views.FacultySubjectsView.as_view(), name="faculty_subjects"),
    path("faculty/results/", views.ViewResultsView.as_view(), name="view_results"),
    path("faculty/analytics/", views.FacultyAnalyticsView.as_view(), name="faculty_analytics"),
]
