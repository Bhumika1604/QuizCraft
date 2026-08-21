from rest_framework.views import APIView

from core.permissions import ok, IsStudent
from core.services import QuizAttemptService, AuthService, public_user
from core import analytics


class StudentDashboardView(APIView):
    permission_classes = [IsStudent]

    def get(self, request):
        return ok(analytics.student_dashboard(request.user.id))


class StudentProfileView(APIView):
    permission_classes = [IsStudent]

    def get(self, request):
        data = public_user(request.user.doc)
        data["stats"] = analytics.student_profile_stats(request.user.id)
        return ok(data)

    def put(self, request):
        b = request.data
        user = AuthService.update_profile(request.user.id, full_name=b.get("full_name"), phone=b.get("phone"))
        return ok(public_user(user), message="Profile updated.")


class StudentChangePasswordView(APIView):
    permission_classes = [IsStudent]

    def post(self, request):
        b = request.data
        AuthService.change_password(request.user.id, b.get("old_password"), b.get("new_password"))
        return ok(message="Password changed.")


class StudentHistoryView(APIView):
    permission_classes = [IsStudent]

    def get(self, request):
        subject = request.query_params.get("subject")
        difficulty = request.query_params.get("difficulty")
        return ok(QuizAttemptService.history(request.user.id, subject, difficulty))


class StudentAnalyticsView(APIView):
    permission_classes = [IsStudent]

    def get(self, request):
        return ok(analytics.student_analytics(request.user.id))


class LeaderboardView(APIView):
    permission_classes = [IsStudent]

    def get(self, request):
        return ok(analytics.leaderboard(limit=50))
