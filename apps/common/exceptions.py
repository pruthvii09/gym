import logging

from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger("gymstreak")

_DEFAULT_CODES = {
    400: "bad_request",
    401: "authentication_failed",
    403: "permission_denied",
    404: "not_found",
    405: "method_not_allowed",
    429: "throttled",
}


def _extract_message(data):
    """Pull a human-readable message out of DRF's error shapes.

    DRF's default handler produces a plain list for a top-level
    ValidationError("some string"), a {"detail": ...} dict for most
    APIExceptions, or a dict of field -> [messages] for serializer field
    errors -- none of which is `response.data.get("detail")` alone.
    """
    if isinstance(data, dict):
        if "detail" in data:
            return str(data["detail"])
        for value in data.values():
            message = _extract_message(value)
            if message:
                return message
        return None
    if isinstance(data, list) and data:
        return _extract_message(data[0]) or str(data[0])
    if data:
        return str(data)
    return None


def custom_exception_handler(exc, context):
    """Wrap DRF's default exception handling in a consistent error envelope.

    Response shape: {"error": {"code": str, "message": str, "details": ...}}
    Unhandled exceptions are logged and return a generic 500 with no
    stack trace leaked to the client.
    """
    response = drf_exception_handler(exc, context)

    if response is None:
        logger.exception("Unhandled exception in %s", context.get("view"))
        return None

    code = _DEFAULT_CODES.get(response.status_code, "error")
    message = _extract_message(response.data) or "Request failed."

    response.data = {
        "error": {
            "code": code,
            "message": message,
            "details": response.data,
        }
    }
    return response
