import io
import zipfile
from typing import Tuple
from app.core.config import settings
from app.core.exceptions import DocMindException
from app.models.enums import DocumentErrorCode


ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}

# Known file signatures (magic bytes)
SIGNATURES = {
    ".pdf": b"%PDF",
    ".docx": b"PK\x03\x04",
}


def validate_file_metadata(filename: str, declared_mime: str, size_bytes: int) -> None:
    """Enforces PRD extension, MIME, and size limits before upload."""
    import os
    ext = os.path.splitext(filename.lower())[1]
    if ext not in ALLOWED_EXTENSIONS:
        raise DocMindException(
            status_code=400,
            code=DocumentErrorCode.UNSUPPORTED_FORMAT.value,
            title="Unsupported Format",
            detail=f"File extension '{ext}' is not supported. Allowed formats: PDF, DOCX, TXT, MD."
        )

    max_bytes = settings.MAX_FILE_MB * 1024 * 1024
    if size_bytes > max_bytes:
        raise DocMindException(
            status_code=400,
            code=DocumentErrorCode.FILE_TOO_LARGE.value,
            title="File Too Large",
            detail=f"File size {round(size_bytes / (1024 * 1024), 2)} MB exceeds maximum allowed limit of {settings.MAX_FILE_MB} MB."
        )


def verify_file_content(data: bytes, filename: str) -> None:
    """Inspects magic bytes and guards against malicious files and ZIP bombs."""
    import os
    if not data:
        raise DocMindException(
            status_code=400,
            code=DocumentErrorCode.CORRUPT_FILE.value,
            title="Empty File",
            detail="Uploaded file is empty (0 bytes)."
        )

    ext = os.path.splitext(filename.lower())[1]
    expected_magic = SIGNATURES.get(ext)
    if expected_magic and not data.startswith(expected_magic):
        raise DocMindException(
            status_code=400,
            code=DocumentErrorCode.CORRUPT_FILE.value,
            title="File Signature Mismatch",
            detail=f"File content does not match the declared extension '{ext}'."
        )

    # DOCX zip bomb protection (PRD Page 11)
    if ext == ".docx":
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                total_uncompressed = sum(info.file_size for info in zf.infolist())
                compressed_size = len(data)
                
                # Check maximum uncompressed size (100 MB)
                if total_uncompressed > 100 * 1024 * 1024:
                    raise DocMindException(
                        status_code=400,
                        code=DocumentErrorCode.FILE_TOO_LARGE.value,
                        title="Decompression Limit Exceeded",
                        detail="The document's uncompressed contents exceed safe processing limits (100 MB)."
                    )
                
                # Check decompression ratio (max 100:1)
                if compressed_size > 0 and (total_uncompressed / compressed_size) > 100:
                    raise DocMindException(
                        status_code=400,
                        code=DocumentErrorCode.CORRUPT_FILE.value,
                        title="Suspicious Archive Structure",
                        detail="The document exhibits an unsafe compression ratio."
                    )
        except zipfile.BadZipFile:
            raise DocMindException(
                status_code=400,
                code=DocumentErrorCode.CORRUPT_FILE.value,
                title="Corrupt DOCX",
                detail="The DOCX archive structure is corrupt or unreadable."
            )
