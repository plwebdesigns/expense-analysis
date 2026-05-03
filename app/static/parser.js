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

function normalizeTableRows(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  let maxCols = 0;
  for (const r of safeRows) {
    const len = Array.isArray(r) ? r.length : 0;
    if (len > maxCols) maxCols = len;
  }
  if (maxCols === 0) return [];
  return safeRows.map((r) => {
    const row = Array.isArray(r) ? [...r] : [];
    while (row.length < maxCols) row.push("");
    return row.map((c) => (c == null ? "" : String(c)));
  });
}

function cellInputAttrs(rowIdx, colIdx, isHeader) {
  const role = isHeader ? "Header" : `Row ${rowIdx}`;
  const label = `${role}, column ${colIdx + 1}`;
  return `class="form-control form-control-sm" type="text" data-parser-cell-input autocomplete="off" aria-label="${escapeHtml(label)}"`;
}

function renderReadOnlyTable(tableEl, rows) {
  if (!tableEl) return;
  const normalized = normalizeTableRows(rows);
  if (normalized.length === 0) {
    tableEl.innerHTML = "";
    delete tableEl.dataset.parserColCount;
    delete tableEl.dataset.parserLocked;
    return;
  }

  const head = normalized[0];
  const body = normalized.slice(1);
  tableEl.dataset.parserColCount = String(head.length);
  tableEl.dataset.parserLocked = "1";

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

function renderEditableTable(tableEl, rows) {
  if (!tableEl) return;
  const normalized = normalizeTableRows(rows);
  if (normalized.length === 0) {
    tableEl.innerHTML = "";
    delete tableEl.dataset.parserColCount;
    delete tableEl.dataset.parserLocked;
    return;
  }

  delete tableEl.dataset.parserLocked;

  const head = normalized[0];
  const body = normalized.slice(1);
  const colCount = head.length;
  tableEl.dataset.parserColCount = String(colCount);

  const headerCells = head
    .map((val, j) => `<th scope="col"><input value="${escapeHtml(val)}" ${cellInputAttrs(1, j, true)} /></th>`)
    .join("");
  const tbodyRows = body
    .map((r, i) => {
      const rowNum = i + 2;
      const cells = r
        .map((val, j) => `<td><input value="${escapeHtml(val)}" ${cellInputAttrs(rowNum, j, false)} /></td>`)
        .join("");
      const removeBtn = `<button type="button" class="btn btn-outline-danger btn-sm" data-parser-remove-row aria-label="Remove row">Remove</button>`;
      return `<tr>${cells}<td class="text-end align-middle">${removeBtn}</td></tr>`;
    })
    .join("");

  const headerActions = `<th scope="col" class="border-0 bg-transparent" style="width: 6rem;" aria-hidden="true"></th>`;
  const theadFixed = `<thead><tr>${headerCells}${headerActions}</tr></thead>`;

  tableEl.innerHTML = `${theadFixed}<tbody>${tbodyRows}</tbody>`;
}

function collectReadOnlyTableRows(tableEl) {
  if (!tableEl) return [];
  const rows = [];
  const theadRow = tableEl.querySelector("thead tr");
  if (theadRow) {
    rows.push(Array.from(theadRow.querySelectorAll("th"), (th) => th.textContent.trim()));
  }
  tableEl.querySelectorAll("tbody tr").forEach((tr) => {
    rows.push(Array.from(tr.querySelectorAll("td"), (td) => td.textContent.trim()));
  });
  return rows;
}

function collectTableRows(tableEl) {
  if (!tableEl) return [];
  if (tableEl.dataset.parserLocked === "1") {
    return collectReadOnlyTableRows(tableEl);
  }
  const rows = [];
  const theadRow = tableEl.querySelector("thead tr");
  if (theadRow) {
    const inputs = theadRow.querySelectorAll("th:not(:last-child) input[data-parser-cell-input]");
    rows.push(Array.from(inputs, (inp) => inp.value));
  }
  const bodyRows = tableEl.querySelectorAll("tbody tr");
  bodyRows.forEach((tr) => {
    const inputs = tr.querySelectorAll("td:not(:last-child) input[data-parser-cell-input]");
    rows.push(Array.from(inputs, (inp) => inp.value));
  });
  return rows;
}

function updateParserTableChrome(locked) {
  const headingEl = document.querySelector("[data-parser-table-heading]");
  const addRowBtn = document.querySelector("[data-parser-add-row]");
  const setTableBtn = document.querySelector("[data-parser-set-table]");
  if (headingEl) {
    headingEl.textContent = locked ? "Extracted table" : "Extracted table (edit below)";
  }
  addRowBtn?.classList.toggle("d-none", !!locked);
  setTableBtn?.classList.toggle("d-none", !!locked);
}

function encodeCsvField(s) {
  const str = String(s ?? "");
  if (/[",\r\n]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

function rowsToCsv(rows) {
  const lines = rows.map((r) => r.map(encodeCsvField).join(","));
  return lines.join("\r\n");
}

function triggerCsvDownload(csvText, filename) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "extracted-table.csv";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function appendEmptyBodyRow(tableEl) {
  if (!tableEl || tableEl.dataset.parserLocked === "1") return;
  const colCount = parseInt(tableEl.dataset.parserColCount || "0", 10);
  if (!colCount || colCount < 1) return;

  const tbody = tableEl.querySelector("tbody");
  if (!tbody) return;

  const existingBodyRows = tbody.querySelectorAll("tr").length;
  const rowNum = existingBodyRows + 2;

  const cells = Array.from({ length: colCount }, (_, j) => {
    return `<td><input ${cellInputAttrs(rowNum, j, false)} /></td>`;
  }).join("");
  const removeBtn = `<button type="button" class="btn btn-outline-danger btn-sm" data-parser-remove-row aria-label="Remove row">Remove</button>`;
  tbody.insertAdjacentHTML("beforeend", `<tr>${cells}<td class="text-end align-middle">${removeBtn}</td></tr>`);
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

  const best = tables.reduce((a, b) => ((b?.length || 0) > (a?.length || 0) ? b : a), tables[0]);

  renderEditableTable(tableEl, best);
  updateParserTableChrome(false);
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
  const addRowBtn = document.querySelector("[data-parser-add-row]");
  const setTableBtn = document.querySelector("[data-parser-set-table]");
  const downloadCsvBtn = document.querySelector("[data-parser-download-csv]");

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

  tableEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-parser-remove-row]");
    if (!btn || !tableEl.contains(btn)) return;
    const tr = btn.closest("tr");
    if (!tr || tr.parentElement?.tagName !== "TBODY") return;
    tr.remove();
  });

  addRowBtn?.addEventListener("click", () => {
    appendEmptyBodyRow(tableEl);
  });

  setTableBtn?.addEventListener("click", () => {
    const rows = collectTableRows(tableEl);
    if (rows.length === 0) {
      setStatus(statusEl, "Nothing to set.", "warning");
      return;
    }
    renderReadOnlyTable(tableEl, rows);
    updateParserTableChrome(true);
    setStatus(statusEl, "Table set.", "success");
  });

  downloadCsvBtn?.addEventListener("click", () => {
    const rows = collectTableRows(tableEl);
    if (rows.length === 0) {
      setStatus(statusEl, "Nothing to download.", "warning");
      return;
    }
    const csv = rowsToCsv(rows);
    triggerCsvDownload(csv, "extracted-table.csv");
    setStatus(statusEl, "CSV downloaded.", "success");
  });
}

document.addEventListener("DOMContentLoaded", initParserDropzone);
