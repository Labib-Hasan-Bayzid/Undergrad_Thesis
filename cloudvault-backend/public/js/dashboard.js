// js/dashboard.js
const API = "http://localhost:5000";

(() => {
  const dashAlert = document.getElementById("dashAlert");
  const btnLogout = document.getElementById("btnLogout");
  btnLogout.addEventListener("click", logout);

function logout() {
  localStorage.removeItem("access_token");
  window.location.replace("index.html");
}

  const subscribeBtn = document.getElementById("subscribeBtn");
  const vaultForm = document.getElementById("vaultForm");
  const clearAll = document.getElementById("clearAll");
  const countPill = document.getElementById("countPill");

  // Document name input
  const docName = document.getElementById("docName");

  // File inputs
  const fileInputs = {
    deed: document.getElementById("deedInput"),
    mutation: document.getElementById("mutationInput"),
    tax: document.getElementById("taxInput"),
    mortgage: document.getElementById("mortgageInput"),
    nid: document.getElementById("nidInput"),
    evidence: document.getElementById("evidenceInput"),
  };

  const meta = {
    deed: document.getElementById("deedMeta"),
    mutation: document.getElementById("mutationMeta"),
    tax: document.getElementById("taxMeta"),
    mortgage: document.getElementById("mortgageMeta"),
    nid: document.getElementById("nidMeta"),
    evidence: document.getElementById("evidenceMeta"),
  };

  // Bank (optional)
  const bankName = document.getElementById("bankName");
  const accHolder = document.getElementById("accHolder");
  const accNumber = document.getElementById("accNumber");
  const routing = document.getElementById("routing");
  const toggleAccMask = document.getElementById("toggleAccMask");

  // State: selected files per category
  const selectedFiles = {
  deed: null,
  mutation: null,
  tax: null,
  mortgage: null,
  nid: null,
  evidence: null,
};

  // Masking state
  let accMasked = false;
  let accRealValue = "";

  function showMessage(msg, type = "ok") {
    dashAlert.className = "dash-alert is-open " + (type === "ok" ? "ok" : "err");
    dashAlert.textContent = msg;
    window.clearTimeout(showMessage._t);
    showMessage._t = window.setTimeout(() => {
      dashAlert.className = "dash-alert";
      dashAlert.textContent = "";
    }, 2400);
  }

  function updateTotalCount() {
  const total = Object.values(selectedFiles).reduce((sum, f) => sum + (f ? 1 : 0), 0);
  countPill.textContent = `${total} file${total === 1 ? "" : "s"} selected`;
}

  function fmtSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  }

  function trimName(name, max) {
    return name.length <= max ? name : (name.slice(0, max - 1) + "…");
  }

  function escapeHtml(str) {
    return str
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderList(key) {
  const container = meta[key];
  const f = selectedFiles[key];

  container.innerHTML = "";

  if (!f) {
    const empty = document.createElement("div");
    empty.className = "file-empty";
    empty.textContent = "No file selected";
    container.appendChild(empty);
    return;
  }

  const item = document.createElement("div");
  item.className = "file-item";
  item.innerHTML = `
    <div class="file-left">
      <div class="file-name" title="${escapeHtml(f.name)}">${escapeHtml(trimName(f.name, 44))}</div>
      <div class="file-meta">${fmtSize(f.size)} • ${escapeHtml(f.type || "file")}</div>
    </div>
    <button type="button" class="file-remove" aria-label="Remove file">✕</button>
  `;

  item.querySelector(".file-remove").addEventListener("click", () => {
    selectedFiles[key] = null;
    if (fileInputs[key]) fileInputs[key].value = "";
    renderList(key);
    updateTotalCount();
  });

  container.appendChild(item);
}

  //
  function setSingleFile(key, file) {
  if (selectedFiles[key]) {
    showMessage("Only 1 file allowed here. Click Clear to change it.", "err");
    return false;
  }
  selectedFiles[key] = file;
  renderList(key);
  updateTotalCount();
  return true;
}

  // Select buttons
 document.querySelectorAll("[data-select]").forEach(btn => {
  btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-select");
    const input = fileInputs[key];
    if (!input) return;

    if (selectedFiles[key]) {
      showMessage("Already selected. Click Clear to change.", "err");
      return;
    }
    input.click();
  });
});

  // Clear section buttons
 document.querySelectorAll("[data-clear]").forEach(btn => {
  btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-clear");
    if (!(key in selectedFiles)) return;

    selectedFiles[key] = null;
    if (fileInputs[key]) fileInputs[key].value = "";
    renderList(key);
    updateTotalCount();
    showMessage("Cleared selection.", "ok");
  });
});

  // File input change => add (append) files
  Object.keys(fileInputs).forEach(key => {
  fileInputs[key].addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // take only first file (even if browser gives more)
    const ok = setSingleFile(key, files[0]);

    // prevent "select again to replace" unless user clears
    e.target.value = "";

    if (ok) showMessage("File selected.", "ok");
  });
});

  // Account masking (optional)
  accNumber.addEventListener("blur", () => {
    const val = accNumber.value.trim();
    if (!val) return;

    accRealValue = val;
    accMasked = true;

    accNumber.value = maskAccount(val);
    toggleAccMask.textContent = "Show";
  });

  toggleAccMask.addEventListener("click", () => {
    const current = (accMasked ? accRealValue : accNumber.value).trim();
    if (!current) return;

    if (accMasked) {
      accNumber.value = accRealValue;
      accMasked = false;
      toggleAccMask.textContent = "Hide";
      accNumber.focus();
    } else {
      accRealValue = accNumber.value.trim();
      accMasked = true;
      accNumber.value = maskAccount(accRealValue);
      toggleAccMask.textContent = "Show";
    }
  });

  function maskAccount(value) {
    const cleaned = value.replace(/\s+/g, "");
    if (cleaned.length <= 4) return "****";
    return "************" + cleaned.slice(-4);
  }

  // Clear all
  clearAll.addEventListener("click", () => {
Object.keys(selectedFiles).forEach(k => selectedFiles[k] = null);    Object.keys(meta).forEach(renderList);
    Object.keys(fileInputs).forEach(k => fileInputs[k].value = "");

    docName.value = "";
    bankName.value = "";
    accHolder.value = "";
    accNumber.value = "";
    routing.value = "";

    accMasked = false;
    accRealValue = "";
    toggleAccMask.textContent = "Hide";

    updateTotalCount();
    showMessage("All cleared.", "ok");
  });
//
function resetUIAfterUpload() {
  Object.keys(selectedFiles).forEach(k => selectedFiles[k] = null);
  Object.keys(meta).forEach(renderList);
  Object.keys(fileInputs).forEach(k => fileInputs[k].value = "");

  docName.value = "";
  bankName.value = "";
  accHolder.value = "";
  accNumber.value = "";
  routing.value = "";

  accMasked = false;
  accRealValue = "";
  toggleAccMask.textContent = "Hide";

  updateTotalCount();
}
  // Upload (allowed anytime)
 vaultForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const token = localStorage.getItem("access_token");
  if (!token) {
    showMessage("You are not logged in. Please login again.", "err");
    window.location.href = "index.html";
    return;
  }

const totalFiles = Object.values(selectedFiles).reduce((sum, f) => sum + (f ? 1 : 0), 0);
  const recordName = docName.value.trim();
  if (!recordName) {
    showMessage("Document Name is required (recordName).", "err");
    return;
  }

  // Build multipart/form-data
  const fd = new FormData();
  fd.append("recordName", recordName);

  // optional bank fields (only if user typed something)
  const bankNameVal = bankName.value.trim();
  const accHolderVal = accHolder.value.trim();
  const accNumberVal = (accMasked ? accRealValue : accNumber.value).trim();
  const routingVal = routing.value.trim();

  if (bankNameVal) fd.append("bankName", bankNameVal);
  if (accHolderVal) fd.append("accountHolderName", accHolderVal);
  if (accNumberVal) fd.append("accountNumber", accNumberVal);
  if (routingVal) fd.append("routingNumber", routingVal);

  // Append files with EXACT backend field names
  if (selectedFiles.deed) fd.append("deedFiles", selectedFiles.deed);
if (selectedFiles.mutation) fd.append("mutationFiles", selectedFiles.mutation);
if (selectedFiles.tax) fd.append("taxFiles", selectedFiles.tax);
if (selectedFiles.mortgage) fd.append("mortgageFiles", selectedFiles.mortgage);
if (selectedFiles.nid) fd.append("nidFiles", selectedFiles.nid);
if (selectedFiles.evidence) fd.append("evidenceFiles", selectedFiles.evidence);

  if (!totalFiles && !(bankNameVal || accHolderVal || accNumberVal || routingVal)) {
    showMessage("Select at least one file or enter bank details.", "err");
    return;
  }

  try {
    const res = await fetch(`${API}/records`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        // DO NOT set Content-Type manually for FormData
      },
      body: fd,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showMessage(data.message || "Upload failed.", "err");
      return;
    }

    showMessage("Upload successful.", "ok");
    console.log("Created record:", data);

    // Optional: clear UI after success
    resetUIAfterUpload();
  } catch (err) {
    showMessage("Network error. Is backend running?", "err");
  }
});



  // Logout
  btnLogout.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // Subscribe
  subscribeBtn.addEventListener("click", () => {
    window.location.href = "payment_details.html";
  });

  // Init
  Object.keys(meta).forEach(renderList);
  updateTotalCount();
})(); 