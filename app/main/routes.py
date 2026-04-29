import os
import tempfile
from pathlib import Path

from flask import jsonify, render_template, request
from flask_login import login_required
from werkzeug.utils import secure_filename

from app.main import main_bp


@main_bp.route("/")
@login_required
def index():
    return render_template("main/index.html")

@main_bp.route("/parser")
@login_required
def parser():
    return render_template("main/parser.html")


def _allowed_upload(filename: str) -> bool:
    ext = Path(filename).suffix.lower().lstrip(".")
    return ext in {"pdf", "csv"}


@main_bp.route("/parser/upload", methods=["POST"])
@login_required
def parser_upload():
    uploaded = request.files.get("file")
    if uploaded is None or not uploaded.filename:
        return jsonify(error="Missing file."), 400

    filename = secure_filename(uploaded.filename)
    if not _allowed_upload(filename):
        return jsonify(error="Only PDF or CSV files are supported."), 415

    ext = Path(filename).suffix.lower().lstrip(".")

    upload_root = Path(tempfile.gettempdir()) / "expense-analysis-uploads"
    upload_root.mkdir(parents=True, exist_ok=True)

    # Ensure uniqueness while preserving original name for display.
    fd, tmp_path = tempfile.mkstemp(prefix="parser-", suffix=f"-{filename}", dir=upload_root)
    os.close(fd)
    tmp_file_path = Path(tmp_path)

    uploaded.save(tmp_file_path)

    if ext == "pdf":
        try:
            from pypdf import PdfReader
        except Exception:
            return jsonify(error="PDF support is not installed on the server."), 500

        try:
            reader = PdfReader(str(tmp_file_path))
            parts: list[str] = []
            for page in reader.pages:
                page_text = page.extract_text() or ""
                if page_text:
                    parts.append(page_text)
            full_text = "\n\n".join(parts).strip()
        except Exception:
            return jsonify(error="Failed to read PDF."), 400

        preview_len = 5000
        return (
            jsonify(
                filename=filename,
                kind="pdf",
                textPreview=full_text[:preview_len],
                textLength=len(full_text),
            ),
            200,
        )

    # CSV phase 1: no parsing, just preview raw text.
    try:
        raw = tmp_file_path.read_bytes()
    except Exception:
        return jsonify(error="Failed to read CSV."), 400

    preview_len_bytes = 5000
    preview_bytes = raw[:preview_len_bytes]
    preview_text = preview_bytes.decode("utf-8", errors="replace")
    return (
        jsonify(
            filename=filename,
            kind="csv",
            textPreview=preview_text,
            textLength=len(raw),
        ),
        200,
    )