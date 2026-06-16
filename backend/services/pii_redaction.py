"""
PII redaction for AI prompts.

Tokenises direct identifiers (emails, UK phone numbers, UK postcodes) and any
caller-supplied exact terms (e.g. client names) BEFORE a prompt leaves the
process for an LLM, then restores the original values in the model's reply.

Goal: the external chat model never sees real client PII — it reasons over
stable tokens like [CLIENT_1] / [EMAIL_1], and Seema swaps the real values back
into the response. The token→value mapping is in-memory and per-call only; it is
never persisted or logged.
"""
import re
from typing import Iterable, Optional, Tuple, Dict

# Direct identifiers. Over-matching is safe (it just redacts a bit more); the
# model does not need the literal email/phone/postcode to assess compliance.
_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE = re.compile(r"(?<!\d)(?:\+44\s?|0)\d[\d\s-]{7,12}\d(?!\d)")
_POSTCODE = re.compile(r"\b[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}\b")


def _tokenise(text: str, pattern: re.Pattern, label: str,
              mapping: Dict[str, str], counter: list) -> str:
    """Replace every match of `pattern` with a stable token, recording the
    original in `mapping`. The same original value always maps to the same token."""
    seen = {v: t for t, v in mapping.items()}

    def repl(m: "re.Match") -> str:
        original = m.group(0)
        if original in seen:
            return seen[original]
        counter[0] += 1
        tok = f"[{label}_{counter[0]}]"
        mapping[tok] = original
        seen[original] = tok
        return tok

    return pattern.sub(repl, text)


def redact(text: Optional[str],
           extra_terms: Optional[Iterable[str]] = None) -> Tuple[Optional[str], Dict[str, str]]:
    """Return (redacted_text, mapping) where mapping is {token: original_value}.

    `extra_terms` are exact strings to redact (client/counterparty names, etc.).
    They are matched case-insensitively, longest first, so "John Smithson" is
    redacted before "John Smith" and partial overlaps don't leak fragments.
    """
    if not text:
        return text, {}
    mapping: Dict[str, str] = {}
    counter = [0]

    if extra_terms:
        terms = sorted(
            {t.strip() for t in extra_terms if t and len(t.strip()) > 2},
            key=len, reverse=True,
        )
        for t in terms:
            text = _tokenise(text, re.compile(re.escape(t), re.IGNORECASE),
                             "NAME", mapping, counter)

    text = _tokenise(text, _EMAIL, "EMAIL", mapping, counter)
    text = _tokenise(text, _PHONE, "PHONE", mapping, counter)
    text = _tokenise(text, _POSTCODE, "POSTCODE", mapping, counter)
    return text, mapping


def restore(text: Optional[str], mapping: Dict[str, str]) -> Optional[str]:
    """Swap tokens back to their original values in a model response."""
    if not text or not mapping:
        return text
    # Longest tokens first so [NAME_10] isn't clobbered by [NAME_1].
    for tok in sorted(mapping, key=len, reverse=True):
        text = text.replace(tok, mapping[tok])
    return text
