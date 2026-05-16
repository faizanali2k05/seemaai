"""Response envelope middleware — FastAPI handles JSON serialization natively."""

# This file is a placeholder for future response envelope formatting.
# FastAPI automatically serializes response models to JSON using Pydantic.
# No additional envelope wrapping is needed at this time.

def wrap_response(data, status="success", message=""):
    """Optional helper to wrap responses in an envelope format.

    Usage (if needed in the future):
        return wrap_response(data, status="success", message="Operation completed")

    Args:
        data: The response data
        status: Status string (success, error, warning)
        message: Optional message

    Returns:
        Dict with envelope structure
    """
    return {
        "status": status,
        "message": message,
        "data": data,
    }
