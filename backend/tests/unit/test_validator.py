import io
import pytest
import zipfile
from app.core.exceptions import DocMindException
from app.ingestion.validator import validate_file_metadata, verify_file_content


def test_allowed_extensions_and_size_limits():
    # Valid PDF within limit
    validate_file_metadata("annual_report.pdf", "application/pdf", 1024 * 1024)

    # Disallowed extension
    with pytest.raises(DocMindException) as exc:
        validate_file_metadata("script.py", "text/x-python", 1024)
    assert exc.value.code == "UNSUPPORTED_FORMAT"

    # Exceeding 20 MB limit
    with pytest.raises(DocMindException) as exc:
        validate_file_metadata("huge.pdf", "application/pdf", 25 * 1024 * 1024)
    assert exc.value.code == "FILE_TOO_LARGE"


def test_magic_byte_verification():
    # Valid PDF magic header
    valid_pdf_bytes = b"%PDF-1.7\nSample content"
    verify_file_content(valid_pdf_bytes, "valid.pdf")

    # Corrupt PDF (fake bytes)
    fake_pdf = b"NOT_A_REAL_PDF"
    with pytest.raises(DocMindException) as exc:
        verify_file_content(fake_pdf, "fake.pdf")
    assert exc.value.code == "CORRUPT_FILE"


def test_empty_file_rejected():
    with pytest.raises(DocMindException) as exc:
        verify_file_content(b"", "empty.txt")
    assert exc.value.code == "CORRUPT_FILE"
