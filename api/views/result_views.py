from rest_framework.views import APIView

from core.permissions import ok, IsStudent
from core.services import QuizAttemptService


class ResultDetailView(APIView):
    permission_classes = [IsStudent]

    def get(self, request, attempt_id):
        return ok(QuizAttemptService.get_result(attempt_id, request.user.id))


class StudentResultsView(APIView):
    permission_classes = [IsStudent]

    def get(self, request):
        return ok(QuizAttemptService.history(request.user.id))
