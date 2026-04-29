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


def _upload_root() -> Path:
    root = Path(tempfile.gettempdir()) / "expense-analysis-uploads"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_tmp_path(file_id: str) -> Path | None:
    # Only allow basenames we generated (no path separators).
    if not file_id or file_id != os.path.basename(file_id):
        return None

    candidate = _upload_root() / file_id
    try:
        candidate.resolve().relative_to(_upload_root().resolve())
    except Exception:
        return None
    return candidate


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

    upload_root = _upload_root()

    # Ensure uniqueness while preserving original name for display.
    fd, tmp_path = tempfile.mkstemp(
        prefix="parser-",
        suffix=f"-{filename}",
        dir=upload_root,
    )
    os.close(fd)
    tmp_file_path = Path(tmp_path)
    file_id = tmp_file_path.name

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

        # preview_len = 5000
        return (
            jsonify(
                filename=filename,
                kind="pdf",
                fileId=file_id,
                textPreview=full_text,
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
            fileId=file_id,
            textPreview=preview_text,
            textLength=len(raw),
        ),
        200,
    )


@main_bp.route("/parser/extract-table", methods=["POST"])
@login_required
def parser_extract_table():
    payload = request.get_json(silent=True) or {}
    file_id = payload.get("fileId")
    if not isinstance(file_id, str):
        return jsonify(error="Missing fileId."), 400

    tmp_path = _safe_tmp_path(file_id)
    if tmp_path is None or not tmp_path.exists():
        return jsonify(error="File not found (it may have expired)."), 404

    if tmp_path.suffix.lower() != ".pdf":
        return jsonify(error="Table extraction is only supported for PDFs."), 415

    try:
        import pdfplumber
    except Exception:
        return jsonify(error="Table extraction is not installed on the server."), 500

    tables: list[list[list[str | None]]] = []
    try:
        with pdfplumber.open(str(tmp_path)) as pdf:
            for page in pdf.pages:
                page_tables = page.extract_tables(
                    table_settings={
                        # Use statement row lines; infer columns from text positions.
                        "horizontal_strategy": "lines",
                        "vertical_strategy": "text",
                        "snap_tolerance": 3,
                        "join_tolerance": 3,
                        "intersection_tolerance": 3,
                        "text_x_tolerance": 2,
                        "text_y_tolerance": 2,
                    }
                )
                for t in page_tables or []:
                    if t:
                        tables.append(t)
    except Exception:
        return jsonify(error="Failed to extract tables from PDF."), 400

    return jsonify(fileId=file_id, tables=tables), 200