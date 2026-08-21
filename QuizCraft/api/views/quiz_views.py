from rest_framework.views import APIView

from core.permissions import ok, IsStudent
from core.services import QuizAttemptService, oid_str


class QuizStartView(APIView):
    permission_classes = [IsStudent]

    def post(self, request):
        subject = request.data.get("subject")
        attempt, first_question = QuizAttemptService.start(request.user.id, subject)
        return ok({
            "attempt_id": oid_str(attempt["_id"]),
            "subject": attempt["subject"],
            "total_questions": attempt["num_questions"],
            "duration_seconds": attempt["duration_seconds"],
            "question_number": 1,
            "current_difficulty": attempt["current_difficulty"],
            "question": first_question.to_public_dict(),
        }, message="Quiz started.", status=201)


class QuizStateView(APIView):
    permission_classes = [IsStudent]

    def get(self, request, attempt_id):
        attempt, remaining = QuizAttemptService.current_state(attempt_id, request.user.id)
        return ok({
            "attempt_id": oid_str(attempt["_id"]),
            "subject": attempt["subject"],
            "status": attempt["status"],
            "total_questions": attempt["num_questions"],
            "answered_count": len(attempt["answers"]),
            "seconds_remaining": remaining,
            "current_difficulty": attempt["current_difficulty"],
            "current_question": attempt.get("current_question"),
            "duration_seconds": attempt["duration_seconds"],
            "result": None if attempt["status"] == "in_progress" else QuizAttemptService._result_payload(attempt),
        })


class QuizAnswerView(APIView):
    permission_classes = [IsStudent]

    def post(self, request, attempt_id):
        b = request.data
        result = QuizAttemptService.submit_answer(
            attempt_id, request.user.id, b.get("question_id"), b.get("selected_answer")
        )
        return ok(result, message="Answer recorded.")


class QuizSubmitView(APIView):
    permission_classes = [IsStudent]

    def post(self, request, attempt_id):
        result = QuizAttemptService.finalize(attempt_id, request.user.id)
        return ok(result, message="Quiz submitted.")
