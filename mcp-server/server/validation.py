"""
Machine-readable validation errors for MCP tools.
"""
from __future__ import annotations

from typing import Any

from mcp.types import CallToolResult, TextContent
from pydantic import ValidationError


def validation_error_from_pydantic(exc: ValidationError) -> dict[str, Any]:
    """Convert the first Pydantic error into a stable error payload."""
    errors = exc.errors()
    if not errors:
        return {
            "code": "INVALID_INPUT",
            "message": "Invalid input — please check your parameters and try again.",
            "field": None,
            "received": None,
            "expected": None,
        }

    err = errors[0]
    field = ".".join(str(part) for part in err.get("loc", ()))
    code = _error_code_for_field(field, err.get("type", ""))
    received = err.get("input")
    expected = err.get("ctx", {}).get("pattern") or err.get("msg")

    return {
        "code": code,
        "message": _human_message(field, err),
        "field": field or None,
        "received": received,
        "expected": expected,
    }


def validation_error(
    *,
    code: str,
    message: str,
    field: str | None = None,
    received: Any = None,
    expected: str | None = None,
) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "field": field,
        "received": received,
        "expected": expected,
    }


def validation_error_result(error: dict[str, Any]) -> CallToolResult:
    structured = {
        "kind": "error",
        "status": "error",
        "error": error,
    }
    text = (
        f"TrailVerse error ({error['code']}): {error['message']}"
        + (f" [field={error['field']}]" if error.get("field") else "")
    )
    return CallToolResult(
        content=[TextContent(type="text", text=text)],
        structuredContent=structured,
        isError=True,
    )


def timeout_error_result(seconds: float, *, partial: dict[str, Any] | None = None) -> CallToolResult:
    error = validation_error(
        code="UPSTREAM_TIMEOUT",
        message=(
            f"Trip planning timed out after {int(seconds)} seconds. "
            "Try a shorter trip, fewer constraints, or retry in a moment."
        ),
        field=None,
        expected=f"response within {int(seconds)} seconds",
    )
    structured: dict[str, Any] = {
        "kind": "error",
        "status": "error",
        "error": error,
    }
    if partial:
        structured["partial"] = partial
    return CallToolResult(
        content=[TextContent(type="text", text=f"TrailVerse error: {error['message']}")],
        structuredContent=structured,
        isError=True,
    )


def _error_code_for_field(field: str, err_type: str) -> str:
    mapping = {
        "start_date": "INVALID_START_DATE",
        "number_of_days": "INVALID_NUMBER_OF_DAYS",
        "park_code": "INVALID_PARK_CODE",
        "park_name": "INVALID_PARK_NAME",
        "adults": "INVALID_TRAVELERS",
        "children": "INVALID_TRAVELERS",
        "max_hike_miles": "INVALID_MAX_HIKE_MILES",
        "difficulty": "INVALID_DIFFICULTY",
        "interests": "INVALID_INTERESTS",
        "lodging_area": "INVALID_LODGING_AREA",
        "session_id": "INVALID_SESSION_ID",
        "revision_request": "INVALID_REVISION_REQUEST",
    }
    if field in mapping:
        return mapping[field]
    if err_type == "missing":
        return f"MISSING_{field.upper()}" if field else "MISSING_REQUIRED_FIELD"
    return "INVALID_INPUT"


def _human_message(field: str, err: dict[str, Any]) -> str:
    err_type = err.get("type", "")
    if field == "start_date":
        return "start_date must use YYYY-MM-DD format."
    if field == "number_of_days":
        return "number_of_days must be between 1 and 14."
    if field == "difficulty":
        return "difficulty entries must be one of: easy, moderate, challenging."
    if err_type == "missing":
        return f"{field} is required."
    return str(err.get("msg") or "Invalid input.")
