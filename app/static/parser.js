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

async function uploadParserFile(file, opts) {
  const { endpoint, statusEl, previewEl, metaEl } = opts;

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
}

function initParserDropzone() {
  const dropzone = document.querySelector("[data-parser-dropzone]");
  if (!dropzone) return;

  const endpoint = dropzone.getAttribute("data-upload-endpoint");
  const input = document.querySelector("[data-parser-file-input]");
  const statusEl = document.querySelector("[data-parser-status]");
  const previewEl = document.querySelector("[data-parser-preview]");
  const metaEl = document.querySelector("[data-parser-meta]");

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
    uploadParserFile(file, { endpoint, statusEl, previewEl, metaEl });
  });

  input?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    uploadParserFile(file, { endpoint, statusEl, previewEl, metaEl });
  });
}

document.addEventListener("DOMContentLoaded", initParserDropzone);
