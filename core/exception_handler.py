from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.response import Response

from .exceptions import QuizCraftError


def quizcraft_exception_handler(exc, context):
    if isinstance(exc, QuizCraftError):
        return Response(
            {"success": False, "message": str(exc), "data": None},
            status=exc.status_code,
        )

    response = drf_exception_handler(exc, context)
    if response is not None:
        detail = response.data
        if isinstance(detail, dict) and "detail" in detail:
            message = str(detail["detail"])
        else:
            message = str(detail)
        response.data = {"success": False, "message": message, "data": None}
        return response

    # Unhandled exception - log server-side, return a generic 500 to the client
    import traceback
    traceback.print_exc()
    return Response(
        {"success": False, "message": "Internal server error.", "data": None},
        status=500,
    )
