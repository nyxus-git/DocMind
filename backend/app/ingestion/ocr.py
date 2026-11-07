import logging
import shutil
import subprocess
from typing import List, Optional
from app.ingestion.normalizer import normalize_text

logger = logging.getLogger("docmind.ingestion.ocr")


def get_tesseract_binary() -> Optional[str]:
    """Finds the tesseract CLI binary on PATH."""
    return shutil.which("tesseract")


def get_available_ocr_languages() -> List[str]:
    """Retrieves list of installed Tesseract language packs."""
    binary = get_tesseract_binary()
    if not binary:
        return []

    try:
        proc = subprocess.run(
            [binary, "--list-langs"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if proc.returncode != 0:
            return []

        langs = []
        for line in proc.stdout.splitlines():
            cleaned = line.strip()
            if cleaned and not cleaned.startswith("List of") and not cleaned.startswith("/"):
                langs.append(cleaned)
        return langs
    except Exception as e:
        logger.warning(f"Failed to query Tesseract languages: {e}")
        return []


def is_ocr_available() -> bool:
    """Returns True if tesseract is installed and at least one language pack is available."""
    binary = get_tesseract_binary()
    if not binary:
        return False
    langs = get_available_ocr_languages()
    return len(langs) > 0


def select_best_ocr_language(preferred: str = "eng") -> Optional[str]:
    """Selects preferred language if installed, else fallback to available Latin language."""
    available = get_available_ocr_languages()
    if not available:
        return None

    if preferred in available:
        return preferred
    # Fallback to first available language (e.g. afr uses Latin alphabet)
    for lang in available:
        if lang != "osd":
            return lang
    return available[0]


def ocr_image_bytes(
    image_bytes: bytes,
    preferred_lang: str = "eng",
    timeout_seconds: int = 15
) -> Optional[str]:
    """
    Performs OCR on raw image bytes (e.g. PNG/JPEG) via Tesseract stdin pipe.
    Enforces per-page timeout and returns normalized extracted text.
    Returns None if OCR fails or is unavailable.
    """
    binary = get_tesseract_binary()
    if not binary:
        logger.warning("OCR skipped: Tesseract binary not found on PATH.")
        return None

    target_lang = select_best_ocr_language(preferred_lang)
    if not target_lang:
        logger.warning("OCR skipped: No Tesseract language packs installed.")
        return None

    try:
        cmd = [binary, "stdin", "stdout", "-l", target_lang]
        proc = subprocess.run(
            cmd,
            input=image_bytes,
            capture_output=True,
            timeout=timeout_seconds
        )

        if proc.returncode != 0:
            err_msg = proc.stderr.decode("utf-8", errors="replace").strip()
            logger.warning(f"Tesseract OCR failed (code {proc.returncode}): {err_msg}")
            return None

        raw_text = proc.stdout.decode("utf-8", errors="replace")
        cleaned = normalize_text(raw_text)
        return cleaned if len(cleaned.strip()) > 0 else None

    except subprocess.TimeoutExpired:
        logger.warning(f"Tesseract OCR timed out after {timeout_seconds}s on image.")
        return None
    except Exception as e:
        logger.warning(f"Unexpected error running OCR: {e}")
        return None

