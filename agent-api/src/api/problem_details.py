"""RFC 9457 Problem Details error responses.

Registers FastAPI exception handlers that emit `application/problem+json`
for HTTPException, RequestValidationError, and unexpected exceptions.
Existing frontend code that reads `response.data.detail` continues to
work because we keep the `detail` field, while adding the standardized
`type`, `title`, `status`, and `instance` members.
"""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from src.utils.logger import api_logger


PROBLEM_CONTENT_TYPE = "application/problem+json"
PROBLEM_TYPE_BASE = "https://agent-craft/errors"


def _status_title(status: int) -> str:
    return {
        400: "Bad Request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not Found",
        405: "Method Not Allowed",
        409: "Conflict",
        410: "Gone",
        413: "Payload Too Large",
        422: "Unprocessable Entity",
        429: "Too Many Requests",
        500: "Internal Server Error",
        502: "Bad Gateway",
        503: "Service Unavailable",
    }.get(status, "Error")


def _problem(
    *,
    status: int,
    detail: Any,
    request: Request,
    type_: str | None = None,
    title: str | None = None,
    extra: dict | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": type_ or f"{PROBLEM_TYPE_BASE}/{status}",
        "title": title or _status_title(status),
        "status": status,
        "detail": detail,
        "instance": str(request.url.path),
    }
    if extra:
        body.update(extra)
    return JSONResponse(
        status_code=status,
        content=jsonable_encoder(body),
        media_type=PROBLEM_CONTENT_TYPE,
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    # Preserve existing detail shape (dict or str) — frontend already reads it.
    return _problem(
        status=exc.status_code,
        detail=exc.detail,
        request=request,
        extra={"headers": dict(exc.headers)} if exc.headers else None,
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return _problem(
        status=422,
        detail="Request validation failed",
        request=request,
        type_=f"{PROBLEM_TYPE_BASE}/validation",
        title="Unprocessable Entity",
        extra={"errors": exc.errors()},
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    api_logger.error(f"Unhandled exception on {request.url.path}: {exc}", exc_info=True)
    return _problem(
        status=500,
        detail="An unexpected error occurred. See server logs for details.",
        request=request,
        type_=f"{PROBLEM_TYPE_BASE}/internal",
    )


def register(app: FastAPI) -> None:
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
