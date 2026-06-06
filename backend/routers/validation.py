"""Validation helper routes."""
import re
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class SraValidation(BaseModel):
    sra_number: str


class EmailValidation(BaseModel):
    email: str


@router.post("/validation/sra-number")
async def validate_sra_number(request: SraValidation):
    pattern = r"^[A-Z0-9]{6}$"
    is_valid = bool(re.match(pattern, request.sra_number))
    return {"valid": is_valid, "sra_number": request.sra_number}


@router.post("/validation/email")
async def validate_email(request: EmailValidation):
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    is_valid = bool(re.match(pattern, request.email))
    return {"valid": is_valid, "email": request.email}
