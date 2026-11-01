import re
import unicodedata


def normalize_text(raw_text: str) -> str:
    """
    Normalizes text according to PRD Page 12:
    - Normalizes Unicode to NFC
    - Line endings to LF
    - Collapses repeated horizontal whitespace
    - Preserves meaningful bullet, list, and heading boundaries
    """
    if not raw_text:
        return ""

    # Unicode NFC normalization
    text = unicodedata.normalize("NFC", raw_text)

    # Standardize line breaks to LF
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Remove non-printable / control characters except tab and newline
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

    # Replace non-breaking spaces
    text = text.replace("\u00a0", " ")

    # Collapse excessive spaces / tabs on each line
    lines = []
    for line in text.split("\n"):
        clean_line = re.sub(r"[ \t]+", " ", line).strip()
        lines.append(clean_line)

    # Collapse more than two consecutive empty lines
    cleaned = "\n".join(lines)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)

    return cleaned.strip()
