"""
frontend/views.py
==================
Every page is a real Django view rendering a template (no disconnected
static HTML files). Authentication/role checks for these pages happen
client-side on load (each protected page's JS calls GET /api/auth/me
with the stored Bearer token and redirects to /login/ if unauthorized,
or to the correct dashboard if the role doesn't match the page) — the
REAL enforcement lives server-side in the DRF permission classes
(IsStudent / IsFaculty) guarding every API endpoint, so a student can
never actually read/write faculty data even if they load a faculty
page directly.
"""
from django.views.generic import TemplateView


class IndexView(TemplateView):
    template_name = "frontend/index.html"


class AboutView(TemplateView):
    template_name = "frontend/about.html"


class ContactView(TemplateView):
    template_name = "frontend/contact.html"


class FeaturesView(TemplateView):
    template_name = "frontend/features.html"


class LoginPageView(TemplateView):
    template_name = "frontend/login.html"


class RegisterPageView(TemplateView):
    template_name = "frontend/register.html"


class StudentDashboardView(TemplateView):
    template_name = "frontend/student_dashboard.html"


class SubjectsView(TemplateView):
    template_name = "frontend/subjects.html"


class QuizView(TemplateView):
    template_name = "frontend/quiz.html"


class ResultView(TemplateView):
    template_name = "frontend/result.html"


class HistoryView(TemplateView):
    template_name = "frontend/history.html"


class AnalyticsView(TemplateView):
    template_name = "frontend/analytics.html"


class ProfileView(TemplateView):
    template_name = "frontend/profile.html"


class FacultyDashboardView(TemplateView):
    template_name = "frontend/faculty_dashboard.html"


class ManageQuestionsView(TemplateView):
    template_name = "frontend/manage_questions.html"


class AddQuestionView(TemplateView):
    template_name = "frontend/add_question.html"


class EditQuestionView(TemplateView):
    template_name = "frontend/edit_question.html"


class FacultySubjectsView(TemplateView):
    template_name = "frontend/faculty_subjects.html"


class ViewResultsView(TemplateView):
    template_name = "frontend/view_results.html"


class FacultyAnalyticsView(TemplateView):
    template_name = "frontend/faculty_analytics.html"
