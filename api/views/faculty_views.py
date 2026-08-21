from rest_framework.views import APIView

from core.permissions import ok, IsFaculty
from core.services import AuthService, public_user
from core import analytics


class FacultyDashboardView(APIView):
    permission_classes = [IsFaculty]

    def get(self, request):
        return ok(analytics.faculty_dashboard())


class FacultyResultsView(APIView):
    permission_classes = [IsFaculty]

    def get(self, request):
        student_search = request.query_params.get("student")
        subject = request.query_params.get("subject")
        return ok(analytics.faculty_results(student_search, subject))


class FacultyAnalyticsView(APIView):
    permission_classes = [IsFaculty]

    def get(self, request):
        return ok(analytics.faculty_analytics())


class FacultyProfileView(APIView):
    permission_classes = [IsFaculty]

    def get(self, request):
        data = public_user(request.user.doc)
        data["stats"] = analytics.faculty_profile_stats(request.user.id)
        return ok(data)

    def put(self, request):
        b = request.data
        user = AuthService.update_profile(request.user.id, full_name=b.get("full_name"), phone=b.get("phone"))
        return ok(public_user(user), message="Profile updated.")


class FacultyChangePasswordView(APIView):
    permission_classes = [IsFaculty]

    def post(self, request):
        b = request.data
        AuthService.change_password(request.user.id, b.get("old_password"), b.get("new_password"))
        return ok(message="Password changed.")
