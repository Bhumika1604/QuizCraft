class QuizCraftError(Exception):
    """Base class for all QuizCraft domain errors."""
    status_code = 400


class EmptyQuestionBankError(QuizCraftError):
    """Raised when no questions exist for a subject at all (any difficulty)."""
    status_code = 404


class InvalidQuizStateError(QuizCraftError):
    """Raised for illegal quiz operations: submitting twice, submitting an
    already-expired attempt, fetching someone else's attempt, etc."""
    status_code = 409


class ValidationError(QuizCraftError):
    """Raised when user-supplied input fails validation."""
    status_code = 422


class NotFoundError(QuizCraftError):
    status_code = 404


class AuthError(QuizCraftError):
    status_code = 401


class PermissionDeniedError(QuizCraftError):
    status_code = 403
