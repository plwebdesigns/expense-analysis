function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.getAttribute("content") : null;
}

function setStatus(target, html, kind) {
  if (!target) return;
  const bsKind = kind === "error" ? "danger" : kind || "secondary";
  target.innerHTML = `<div class="alert alert-${bsKind} mb-3" role="alert">${html}</div>`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderRawTable(tableEl, rows) {
  if (!tableEl) return;
  const safeRows = Array.isArray(rows) ? rows : [];
  if (safeRows.length === 0) {
    tableEl.innerHTML = "";
    return;
  }

  const head = safeRows[0] || [];
  const body = safeRows.slice(1);

  const thead = `<thead><tr>${head
    .map((c) => `<th scope="col">${escapeHtml(c ?? "")}</th>`)
    .join("")}</tr></thead>`;
  const tbody = `<tbody>${body
    .map(
      (r) =>
        `<tr>${(r || [])
          .map((c) => `<td>${escapeHtml(c ?? "")}</td>`)
          .join("")}</tr>`,
    )
    .join("")}</tbody>`;

  tableEl.innerHTML = thead + tbody;
}

async function extractParserTable(opts) {
  const { endpoint, fileId, statusEl, tableCardEl, tableEl, tableMetaEl } = opts;
  if (!fileId) return;

  const csrf = getCsrfToken();
  if (!csrf) {
    setStatus(statusEl, "Missing CSRF token in page.", "error");
    return;
  }

  setStatus(statusEl, "Extracting table...", "info");
  tableCardEl?.classList.add("d-none");
  if (tableMetaEl) tableMetaEl.textContent = "";

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrf,
      },
      body: JSON.stringify({ fileId }),
    });
  } catch (e) {
    setStatus(statusEl, "Network error extracting table.", "error");
    return;
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // ignore
  }

  if (!res.ok) {
    const msg = data && data.error ? data.error : `Table extraction failed (${res.status}).`;
    setStatus(statusEl, escapeHtml(msg), "error");
    return;
  }

  const tables = Array.isArray(data.tables) ? data.tables : [];
  if (tables.length === 0) {
    setStatus(statusEl, "No tables found on the PDF pages.", "warning");
    return;
  }

  // For now, render the largest table (by rows) as a best-effort “main” table.
  const best = tables.reduce((a, b) => ((b?.length || 0) > (a?.length || 0) ? b : a), tables[0]);

  renderRawTable(tableEl, best);
  tableCardEl?.classList.remove("d-none");
  if (tableMetaEl) tableMetaEl.textContent = `${tables.length} table(s) detected across pages`;
  setStatus(statusEl, "Table extracted.", "success");
}

async function uploadParserFile(file, opts) {
  const { endpoint, statusEl, previewEl, metaEl, extractBtnEl, tableCardEl } = opts;

  if (!file) return;
  const name = file.name || "file";
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (!(ext === "pdf" || ext === "csv")) {
    setStatus(statusEl, "Only PDF or CSV files are supported.", "error");
    return;
  }

  const csrf = getCsrfToken();
  if (!csrf) {
    setStatus(statusEl, "Missing CSRF token in page.", "error");
    return;
  }

  setStatus(statusEl, `Uploading <strong>${escapeHtml(name)}</strong>...`, "info");
  if (previewEl) previewEl.textContent = "";
  if (metaEl) metaEl.textContent = "";
  tableCardEl?.classList.add("d-none");
  extractBtnEl?.classList.add("d-none");

  const fd = new FormData();
  fd.append("file", file);

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-CSRFToken": csrf,
      },
      body: fd,
    });
  } catch (e) {
    setStatus(statusEl, "Network error uploading file.", "error");
    return;
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // ignore
  }

  if (!res.ok) {
    const msg = data && data.error ? data.error : `Upload failed (${res.status}).`;
    setStatus(statusEl, escapeHtml(msg), "error");
    return;
  }

  const filename = data.filename || name;
  const kind = data.kind || ext;
  const textPreview = data.textPreview || "";
  const textLength = data.textLength;
  const fileId = data.fileId;

  setStatus(
    statusEl,
    `Uploaded <strong>${escapeHtml(filename)}</strong> (${escapeHtml(kind)}).`,
    "success",
  );

  if (metaEl) {
    const lenInfo = Number.isFinite(textLength)
      ? `${textLength.toLocaleString()} chars`
      : "unknown length";
    metaEl.textContent = `Extracted text length: ${lenInfo}`;
  }

  if (previewEl) previewEl.textContent = textPreview;

  if (kind === "pdf" && fileId && extractBtnEl) {
    extractBtnEl.dataset.fileId = fileId;
    extractBtnEl.classList.remove("d-none");
  }
}

function initParserDropzone() {
  const dropzone = document.querySelector("[data-parser-dropzone]");
  if (!dropzone) return;

  const endpoint = dropzone.getAttribute("data-upload-endpoint");
  const extractEndpoint = dropzone.getAttribute("data-extract-endpoint");
  const input = document.querySelector("[data-parser-file-input]");
  const statusEl = document.querySelector("[data-parser-status]");
  const previewEl = document.querySelector("[data-parser-preview]");
  const metaEl = document.querySelector("[data-parser-meta]");
  const extractBtnEl = document.querySelector("[data-parser-extract-table]");
  const tableCardEl = document.querySelector("[data-parser-table-card]");
  const tableEl = document.querySelector("[data-parser-table]");
  const tableMetaEl = document.querySelector("[data-parser-table-meta]");

  function setDragging(isDragging) {
    dropzone.classList.toggle("border-primary", isDragging);
    dropzone.classList.toggle("bg-primary-subtle", isDragging);
  }

  dropzone.addEventListener("click", () => {
    input?.click();
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(true);
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    uploadParserFile(file, { endpoint, statusEl, previewEl, metaEl, extractBtnEl, tableCardEl });
  });

  input?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    uploadParserFile(file, { endpoint, statusEl, previewEl, metaEl, extractBtnEl, tableCardEl });
  });

  extractBtnEl?.addEventListener("click", () => {
    const fileId = extractBtnEl.dataset.fileId;
    extractParserTable({
      endpoint: extractEndpoint || "/parser/extract-table",
      fileId,
      statusEl,
      tableCardEl,
      tableEl,
      tableMetaEl,
    });
  });
}

document.addEventListener("DOMContentLoaded", initParserDropzone);
