// public/js/my_document_details.js
const API = "http://localhost:5000";

(() => {
  // ---------- auth ----------
  function getToken() {
    return localStorage.getItem("access_token");
  }

  function logout() {
    localStorage.removeItem("access_token");
    window.location.replace("index.html");
  }

  // ---------- url ----------
  function getParam(name) {
    const u = new URL(window.location.href);
    return u.searchParams.get(name);
  }

  // ---------- ui helpers ----------
  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtSize(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n)) return "—";
    if (n < 1024) return `${n} B`;
    const kb = n / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  }

  function onlyDigits6(s) {
    return /^[0-9]{6}$/.test(s);
  }

  // ---------- elements ----------
  const detailsAlert = document.getElementById("detailsAlert");
  const btnLogout = document.getElementById("btnLogout");
  const btnDownloadCenter = document.getElementById("btnDownloadCenter");
  const btnViewBank = document.getElementById("btnViewBank");

  const docPill = document.getElementById("docPill");
  const docNameInput = document.getElementById("docNameInput");

  const bankNameInput = document.getElementById("bankNameInput");
  const accHolderInput = document.getElementById("accHolderInput");
  const accNumberInput = document.getElementById("accNumberInput");
  const routingInput = document.getElementById("routingInput");

  // main modal
  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");
  const modalClose = document.getElementById("modalClose");

  // otp modal
  const otpModal = document.getElementById("otpModal");
  const otpTitle = document.getElementById("otpTitle");
  const otpClose = document.getElementById("otpClose");
  const otpInput = document.getElementById("otpInput");
  const otpSubmit = document.getElementById("otpSubmit");
  const otpResend = document.getElementById("otpResend");
  const otpMsg = document.getElementById("otpMsg");

  // file list containers (inside each card)
  const listEls = {
    DEED: document.querySelector(`.detail-card[data-category="DEED"] .file-list`),
    MUTATION: document.querySelector(`.detail-card[data-category="MUTATION"] .file-list`),
    TAX: document.querySelector(`.detail-card[data-category="TAX"] .file-list`),
    MORTGAGE: document.querySelector(`.detail-card[data-category="MORTGAGE"] .file-list`),
    NID: document.querySelector(`.detail-card[data-category="NID"] .file-list`),
    EVIDENCE: document.querySelector(`.detail-card[data-category="EVIDENCE"] .file-list`),
  };

  // ---------- small toast ----------
  function showMessage(msg, type = "ok") {
    if (!detailsAlert) return;
    detailsAlert.className = "details-alert is-open " + (type === "ok" ? "ok" : "err");
    detailsAlert.textContent = msg;

    window.clearTimeout(showMessage._t);
    showMessage._t = window.setTimeout(() => {
      detailsAlert.className = "details-alert";
      detailsAlert.textContent = "";
    }, 2400);
  }

  // ---------- main modal ----------
  function openModal(title, html) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modal.classList.add("open");
  }
  function closeModal() {
    modal.classList.remove("open");
  }
  modalClose?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // ---------- otp modal ----------
  function openOtpModal(title) {
    otpTitle.textContent = title;
    otpMsg.textContent = "";
    otpInput.value = "";
    otpModal.classList.add("is-open");
    otpModal.setAttribute("aria-hidden", "false");
    otpInput.focus();
  }
  function closeOtpModal() {
    otpModal.classList.remove("is-open");
    otpModal.setAttribute("aria-hidden", "true");
  }
  otpClose?.addEventListener("click", closeOtpModal);
  otpModal?.addEventListener("click", (e) => {
    if (e.target === otpModal) closeOtpModal();
  });

  // ---------- api helpers ----------
  async function apiJsonAuth(path, method, body, extraHeaders = {}) {
    const token = getToken();
    if (!token) throw new Error("No token");

    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = null;
    try { data = await res.json(); } catch {}

    if (!res.ok) {
      const msg = data?.message || data?.error || `Request failed (${res.status})`;
      throw new Error(Array.isArray(msg) ? msg.join(", ") : msg);
    }
    return data;
  }
/*
  async function apiDownloadAuth(path, actionToken) {
    const token = getToken();
    if (!token) throw new Error("No token");

    const res = await fetch(`${API}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-action-token": actionToken,
      },
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(t || `Download failed (${res.status})`);
    }
    return res;
  }
*/
//----------------------------------------------------------------
async function apiDownloadBlobAuth(path, actionToken) {
  const token = getToken();
  if (!token) throw new Error("No token");

  const res = await fetch(`${API}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-action-token": actionToken,
    },
  });

  // IMPORTANT: read body exactly once
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `Download failed (${res.status})`);
  }

  const blob = await res.blob();

  // filename from header if present
  const cd = res.headers.get("content-disposition") || "";
  let filename = null;
  const m = cd.match(/filename="([^"]+)"/i);
  if (m?.[1]) {
    try { filename = decodeURIComponent(m[1]); } catch { filename = m[1]; }
  }

  return { blob, filename };
}

//-----------------------------------------------------------------------------------
  function filenameFromContentDisposition(cd) {
    if (!cd) return null;
    const m = String(cd).match(/filename="([^"]+)"/i);
    if (!m?.[1]) return null;
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }

  // ---------- state ----------
  let CURRENT_RECORD = null;

  // tokens are memory-only (clears on page reload)
  const actionTokens = {
    FILE_VIEW: new Map(),      // fileId -> actionToken
    FILE_DOWNLOAD: new Map(),  // fileId -> actionToken
    BANK_VIEW: null,           // { recordId, token }
  };

  let bankUnlocked = false;

  function maskText(v) {
    if (!v) return "—";
    return "********";
  }
  function maskAcc(v) {
    const s = String(v ?? "");
    if (!s) return "—";
    const last4 = s.slice(-4);
    return "************" + last4;
  }

  // ---------- record fetch + render ----------
  async function fetchRecordById(recordId) {
    return apiJsonAuth(`/records/${encodeURIComponent(recordId)}`, "GET");
  }

  function groupFiles(filesArr) {
    const map = { DEED: [], MUTATION: [], TAX: [], MORTGAGE: [], NID: [], EVIDENCE: [] };
    if (!Array.isArray(filesArr)) return map;
    for (const f of filesArr) {
      const cat = String(f.category || "").toUpperCase();
      if (map[cat]) map[cat].push(f);
    }
    return map;
  }

  function renderFileList(listEl, files) {
    if (!listEl) return;

    if (!Array.isArray(files) || files.length === 0) {
      listEl.innerHTML = `
        <div class="file-item">
          <div class="file-left">
            <div class="file-name">No files</div>
            <div class="file-meta">—</div>
          </div>
        </div>`;
      return;
    }

    listEl.innerHTML = "";
    files.forEach((f) => {
      const row = document.createElement("div");
      row.className = "file-item";
      row.innerHTML = `
        <div class="file-left">
          <div class="file-name">${escapeHtml(f.originalName || "file")}</div>
          <div class="file-meta">${escapeHtml(f.mimeType || "file")} • ${escapeHtml(fmtSize(f.sizeBytes))}</div>
        </div>
      `;
      listEl.appendChild(row);
    });
  }

  function renderRecord(rec) {
    CURRENT_RECORD = rec;

    const name = rec.recordName || "—";
    docPill.textContent = `Record: ${name}`;
    docNameInput.value = name;

    if (!bankUnlocked) {
      bankNameInput.value = maskText(rec.bankName);
      accHolderInput.value = maskText(rec.accountHolderName);
      accNumberInput.value = rec.accountNumber ? maskAcc(rec.accountNumber) : "—";
      routingInput.value = maskText(rec.routingNumber);
    } else {
      bankNameInput.value = rec.bankName || "—";
      accHolderInput.value = rec.accountHolderName || "—";
      accNumberInput.value = rec.accountNumber || "—";
      routingInput.value = rec.routingNumber || "—";
    }

    const grouped = groupFiles(rec.files || []);
    renderFileList(listEls.DEED, grouped.DEED);
    renderFileList(listEls.MUTATION, grouped.MUTATION);
    renderFileList(listEls.TAX, grouped.TAX);
    renderFileList(listEls.MORTGAGE, grouped.MORTGAGE);
    renderFileList(listEls.NID, grouped.NID);
    renderFileList(listEls.EVIDENCE, grouped.EVIDENCE);
  }

  function firstFileIdInCategory(category) {
    const files = (CURRENT_RECORD?.files || []).filter(
      (f) => String(f.category).toUpperCase() === String(category).toUpperCase()
    );
    return files[0]?.id || null;
  }

  function fileNameFromRecord(fileId) {
    const f = (CURRENT_RECORD?.files || []).find((x) => x.id === fileId);
    return f?.originalName || null;
  }

  // ---------- OTP runner ----------
  async function requireOtpAndRun({ title, purpose, targetId, requestPath, verifyPath, onSuccess }) {
    // 1) use cached token if exists
    let cached = null;
    if (purpose === "BANK_VIEW") {
      cached = actionTokens.BANK_VIEW?.recordId === targetId ? actionTokens.BANK_VIEW.token : null;
    } else {
      cached = actionTokens[purpose]?.get(targetId) || null;
    }

    if (cached) {
      try {
        await onSuccess(cached);
        return;
      } catch {
        if (purpose === "BANK_VIEW") actionTokens.BANK_VIEW = null;
        else actionTokens[purpose].delete(targetId);
      }
    }

    // 2) request OTP
    await apiJsonAuth(requestPath, "POST", purpose === "BANK_VIEW" ? {} : { purpose });

    // 3) show modal and bind buttons
    openOtpModal(title);

    otpSubmit.onclick = async () => {
      const otp = otpInput.value.trim();
      if (!onlyDigits6(otp)) {
        otpMsg.textContent = "OTP must be 6 digits.";
        return;
      }

      otpSubmit.disabled = true;
      otpResend.disabled = true;
      otpMsg.textContent = "";

      try {
        const body = purpose === "BANK_VIEW" ? { otp } : { purpose, otp };
        const out = await apiJsonAuth(verifyPath, "POST", body);

        const actionToken = out?.actionToken;
        if (!actionToken) throw new Error("No actionToken returned");

        if (purpose === "BANK_VIEW") actionTokens.BANK_VIEW = { recordId: targetId, token: actionToken };
        else actionTokens[purpose].set(targetId, actionToken);

        closeOtpModal();
        await onSuccess(actionToken);
      } catch (e) {
        otpMsg.textContent = e.message || "Invalid OTP";
      } finally {
        otpSubmit.disabled = false;
        otpResend.disabled = false;
      }
    };

    otpResend.onclick = async () => {
      otpResend.disabled = true;
      otpMsg.textContent = "";
      try {
        await apiJsonAuth(requestPath, "POST", purpose === "BANK_VIEW" ? {} : { purpose });
        otpMsg.textContent = "OTP resent.";
      } catch (e) {
        otpMsg.textContent = e.message || "Failed to resend OTP";
      } finally {
        otpResend.disabled = false;
      }
    };
  }

  // ---------- click handlers ----------
  btnLogout?.addEventListener("click", logout);

  btnDownloadCenter?.addEventListener("click", () => {
    const items =
      (CURRENT_RECORD?.files || [])
        .map((f) => `- ${f.category}: ${f.originalName}`)
        .join("\n") || "No files";
    openModal("Download Center", `<pre style="white-space:pre-wrap; margin:0;">${escapeHtml(items)}</pre>`);
  });

  btnViewBank?.addEventListener("click", async () => {
    const recordId = getParam("id");
    if (!recordId) return showMessage("Missing record id in URL.", "err");

    try {
      await requireOtpAndRun({
        title: "OTP Required: View Bank Details",
        purpose: "BANK_VIEW",
        targetId: recordId,
        requestPath: `/records/${encodeURIComponent(recordId)}/bank/request-otp`,
        verifyPath: `/records/${encodeURIComponent(recordId)}/bank/verify-otp`,

                onSuccess: async (actionToken) => {
          const token = getToken();
          const res = await fetch(`${API}/records/${encodeURIComponent(recordId)}/bank/view`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "x-action-token": actionToken,
            },
          });

          if (!res.ok) {
            const t = await res.text().catch(() => "");
            throw new Error(t || "Failed to load bank details");
          }

          const bank = await res.json();

          bankUnlocked = true;
          bankNameInput.value = bank.bankName || "—";
          accHolderInput.value = bank.accountHolderName || "—";
          accNumberInput.value = bank.accountNumber || "—";
          routingInput.value = bank.routingNumber || "—";

          openModal(
            "Bank Details",
            `<pre style="white-space:pre-wrap; margin:0;">
Bank Name: ${escapeHtml(bank.bankName || "—")}
Account Holder: ${escapeHtml(bank.accountHolderName || "—")}
Account Number: ${escapeHtml(bank.accountNumber || "—")}
Routing Number: ${escapeHtml(bank.routingNumber || "—")}
</pre>`
          );
        },
        
      });
    } catch (e) {
      showMessage(e.message || "Bank OTP failed", "err");
    }
  });

  // Section view/download buttons
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action][data-category]");
    if (!btn) return;

    const action = btn.getAttribute("data-action"); // view|download
    const category = btn.getAttribute("data-category");
    const fileId = firstFileIdInCategory(category);

    if (!fileId) {
      showMessage("No file uploaded in this section.", "err");
      return;
    }

    const purpose = action === "download" ? "FILE_DOWNLOAD" : "FILE_VIEW";

    try {
      await requireOtpAndRun({
        title: action === "download" ? "OTP Required: Download File" : "OTP Required: View File",
        purpose,
        targetId: fileId,
        requestPath: `/records/files/${encodeURIComponent(fileId)}/request-otp`,
        verifyPath: `/records/files/${encodeURIComponent(fileId)}/verify-otp`,
        onSuccess: async (actionToken) => {
          if (action === "view") {
            const meta = await apiJsonAuth(
              `/records/files/${encodeURIComponent(fileId)}/meta`,
              "GET",
              null,
              { "x-action-token": actionToken }
            );

            openModal(
              "File Metadata",
              `<pre style="white-space:pre-wrap; margin:0;">
Name: ${escapeHtml(meta.originalName)}
Type: ${escapeHtml(meta.mimeType)}
Size: ${escapeHtml(String(meta.sizeBytes))} bytes
Category: ${escapeHtml(meta.category)}
Created: ${escapeHtml(String(meta.createdAt))}
CryptoMeta: ${escapeHtml(JSON.stringify(meta.cryptoMeta || {}, null, 2))}
</pre>`
            );
            return;
          }

        const { blob, filename: headerName } = await apiDownloadBlobAuth(
  `/records/files/${encodeURIComponent(fileId)}/download`,
  actionToken
);

const recordName = fileNameFromRecord(fileId);
const filename = headerName || recordName || "download.bin";

if (window.showSaveFilePicker) {
  const handle = await window.showSaveFilePicker({
    suggestedName: filename,
    types: [
      {
        description: "Files",
        accept: {
          [blob.type || "application/octet-stream"]: [`.${filename.split(".").pop() || "bin"}`],
        },
      },
    ],
  });

  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
} else {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

showMessage("Download started.", "ok");
        },
      });
    } catch (err) {
      showMessage(err.message || "OTP flow failed", "err");
    }
  });

  // ---------- init ----------
  (async () => {
    try {
      const token = getToken();
      if (!token) return logout();

      const recordId = getParam("id");
      if (!recordId) {
        showMessage("Missing record id in URL.", "err");
        return;
      }

      const rec = await fetchRecordById(recordId);
      renderRecord(rec);
      showMessage("Loaded document details.", "ok");
    } catch (err) {
      showMessage(err.message || "Unauthorized", "err");
      logout();
    }
  })();
})();
