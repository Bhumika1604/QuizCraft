from rest_framework.permissions import BasePermission
from rest_framework.response import Response


class IsAuthenticatedMongo(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and getattr(request.user, "is_authenticated", False))


class IsStudent(IsAuthenticatedMongo):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == "student"


class IsFaculty(IsAuthenticatedMongo):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == "faculty"


def ok(data=None, message="Success", status=200):
    return Response({"success": True, "data": data, "message": message}, status=status)


def fail(message="Something went wrong", status=400, data=None):
    return Response({"success": False, "message": message, "data": data}, status=status)
