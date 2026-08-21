from rest_framework.views import APIView

from core.permissions import ok, IsAuthenticatedMongo, IsFaculty
from core.services import SubjectService, oid_str


class SubjectListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsFaculty()]
        return [IsAuthenticatedMongo()]

    def get(self, request):
        return ok(SubjectService.list_subjects())

    def post(self, request):
        b = request.data
        subj = SubjectService.create_subject(b.get("name"), b.get("description", ""))
        return ok({"id": oid_str(subj["_id"]), "name": subj["name"]},
                   message="Subject created.", status=201)


class SubjectDetailView(APIView):
    permission_classes = [IsFaculty]

    def put(self, request, subject_id):
        b = request.data
        SubjectService.update_subject(subject_id, name=b.get("name"), description=b.get("description"))
        return ok(message="Subject updated.")

    def delete(self, request, subject_id):
        SubjectService.delete_subject(subject_id)
        return ok(message="Subject deleted.")
