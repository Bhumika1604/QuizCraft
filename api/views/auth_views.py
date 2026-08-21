from rest_framework.views import APIView
from rest_framework.permissions import AllowAny

from core.permissions import ok, fail, IsAuthenticatedMongo
from core.services import AuthService, public_user


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        b = request.data
        user = AuthService.register(
            full_name=b.get("full_name"),
            email=b.get("email"),
            password=b.get("password"),
            confirm_password=b.get("confirm_password"),
            role=b.get("role", "student"),
            phone=b.get("phone", ""),
        )
        _, token = AuthService.login(user["email"], b.get("password"))
        return ok(
            {"token": token, "user": public_user(user)},
            message="Registration successful.",
            status=201,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        b = request.data
        user, token = AuthService.login(b.get("email"), b.get("password"))
        return ok({"token": token, "user": public_user(user)}, message="Login successful.")


class LogoutView(APIView):
    permission_classes = [IsAuthenticatedMongo]

    def post(self, request):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        token = auth_header.replace("Bearer ", "").strip()
        AuthService.logout(token)
        return ok(message="Logged out.")


class MeView(APIView):
    permission_classes = [IsAuthenticatedMongo]

    def get(self, request):
        return ok(public_user(request.user.doc))
