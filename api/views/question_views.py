from rest_framework.views import APIView

from core.permissions import ok, IsAuthenticatedMongo, IsFaculty
from core.services import QuestionService


class QuestionListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsFaculty()]
        return [IsAuthenticatedMongo()]

    def get(self, request):
        subject = request.query_params.get("subject")
        difficulty = request.query_params.get("difficulty")
        search = request.query_params.get("search")
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 20))
        docs, total = QuestionService.list_questions(subject, difficulty, search, page, page_size)
        return ok({
            "questions": [QuestionService.to_public(d) for d in docs],
            "total": total,
            "page": page,
            "page_size": page_size,
        })

    def post(self, request):
        b = request.data
        doc = QuestionService.create(
            subject=b.get("subject"),
            question_text=b.get("question_text"),
            options=b.get("options"),
            correct_answer=b.get("correct_answer"),
            difficulty=b.get("difficulty"),
            marks=b.get("marks", 1),
            created_by=request.user.id,
        )
        return ok(QuestionService.to_public(doc), message="Question added.", status=201)


class QuestionDetailView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [IsAuthenticatedMongo()]
        return [IsFaculty()]

    def get(self, request, question_id):
        docs, _ = QuestionService.list_questions()
        from core.services import to_oid
        from core.db import collections
        doc = collections.questions.find_one({"_id": to_oid(question_id)})
        if not doc:
            from core.exceptions import NotFoundError
            raise NotFoundError("Question not found.")
        return ok(QuestionService.to_public(doc))

    def put(self, request, question_id):
        b = request.data
        doc = QuestionService.update(
            question_id,
            question_text=b.get("question_text"),
            subject=b.get("subject"),
            options=b.get("options"),
            correct_answer=b.get("correct_answer"),
            difficulty=b.get("difficulty"),
            marks=b.get("marks"),
        )
        return ok(QuestionService.to_public(doc), message="Question updated.")

    def delete(self, request, question_id):
        QuestionService.delete(question_id)
        return ok(message="Question deleted.")
