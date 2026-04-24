// js/view_download.js
const API = "http://localhost:5000";

(() => {
  const recordSelect = document.getElementById("recordSelect");
  const itemsPill = document.getElementById("itemsPill");
  const downloadGrid = document.getElementById("downloadGrid");
  const emptyState = document.getElementById("emptyState");
  const refreshBtn = document.getElementById("refreshBtn");
  const btnLogout = document.getElementById("btnLogout");
  const recordHint = document.getElementById("recordHint");

  /**
   * FRONTEND DEMO STORAGE (replace with API later):
   * - pv_document_names: list of records [{id,name,createdAt}]
   * - pv_record_files: map recordId -> files per category
   *
   * Structure:
   * pv_record_files = {
   *   "<recordId>": {
   *     deed: [{name,size,type,url}],
   *     mutation: [...],
   *     ...
   *     bank: { bankName, accountHolder, accountNumber, routingNumber }
   *   }
   * }
   */
  const NAMES_KEY = "pv_document_names";
  const FILES_KEY = "pv_record_files";

  const categories = [
    { key: "deed", title: "Deed / Title Papers", hint: "PDF" },
    { key: "mutation", title: "Mutation Documents", hint: "PDF or image" },
    { key: "tax", title: "Tax Receipts", hint: "PDF or image" },
    { key: "mortgage", title: "Mortgage Papers", hint: "PDF" },
    { key: "nid", title: "Identity Docs: NID", hint: "Image or PDF" },
    { key: "evidence", title: "Evidence Photos", hint: "Images" },
    { key: "bank", title: "Bank Details", hint: "Sensitive info" },
  ];

  function escapeHtml(str){
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtSize(bytes){
    if (typeof bytes !== "number") return "—";
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  }

  function loadJson(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    }catch{
      return fallback;
    }
  }

  function saveJson(key, value){
    localStorage.setItem(key, JSON.stringify(value));
  }

  // Demo seed to show download cards
  function seedIfEmpty(){
    const names = loadJson(NAMES_KEY, []);
    if (!Array.isArray(names) || names.length === 0) {
      const now = new Date().toISOString();
      const seedNames = [
        { id: "rec1", name: "Mirpur Land 2", createdAt: now },
        { id: "rec2", name: "Dhanmondi Flat 5B", createdAt: now },
        { id: "rec3", name: "Gulshan Plot A", createdAt: now },
      ];
      saveJson(NAMES_KEY, seedNames);
    }

    const files = loadJson(FILES_KEY, {});
    if (Object.keys(files).length === 0){
      files["rec1"] = {
        deed: [{ name: "deed_mirpur.pdf", size: 482118, type: "application/pdf", url: "#" }],
        mutation: [{ name: "mutation_scan.jpg", size: 220118, type: "image/jpeg", url: "#" }],
        tax: [{ name: "tax_2024.pdf", size: 182118, type: "application/pdf", url: "#" }],
        mortgage: [],
        nid: [{ name: "nid_front.png", size: 141122, type: "image/png", url: "#" }],
        evidence: [{ name: "boundary_marker.jpg", size: 331008, type: "image/jpeg", url: "#" }],
        bank: {
          bankName: "Example Bank",
          accountHolder: "Abdullah Adnan",
          accountNumber: "************1234",
          routingNumber: "1203456"
        }
      };
      files["rec2"] = { deed: [], mutation: [], tax: [], mortgage: [], nid: [], evidence: [], bank: {} };
      files["rec3"] = { deed: [], mutation: [], tax: [], mortgage: [], nid: [], evidence: [], bank: {} };
      saveJson(FILES_KEY, files);
    }
  }

  function populateRecords(){
    const names = loadJson(NAMES_KEY, []);
    recordSelect.innerHTML = "";

    if (!Array.isArray(names) || names.length === 0){
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No records found";
      recordSelect.appendChild(opt);
      recordSelect.disabled = true;
      return;
    }

    recordSelect.disabled = false;

    names.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name;
      recordSelect.appendChild(opt);
    });
  }

  function countAllItems(recordData){
    let count = 0;
    categories.forEach(c => {
      if (c.key === "bank"){
        const b = recordData.bank || {};
        if (b.bankName || b.accountHolder || b.accountNumber || b.routingNumber) count += 1; // bank counts as 1
      } else {
        count += Array.isArray(recordData[c.key]) ? recordData[c.key].length : 0;
      }
    });
    return count;
  }

  function buildCard(category, recordData){
    const key = category.key;

    const card = document.createElement("div");
    card.className = "dl-card";

    // bar
    const bar = document.createElement("div");
    bar.className = "dl-bar";
    bar.innerHTML = `
      <div class="dl-title">
        <h4>${escapeHtml(category.title)}</h4>
        <p>${escapeHtml(category.hint)}</p>
      </div>
    `;

    const body = document.createElement("div");
    body.className = "dl-body";

    // Bank special rendering
    if (key === "bank"){
      const b = recordData.bank || {};
      const hasAny = b.bankName || b.accountHolder || b.accountNumber || b.routingNumber;

      body.innerHTML = `
        <div class="file-lines">
          ${hasAny ? `
            <div class="file-row">
              <div class="file-left">
                <div class="file-name">${escapeHtml(b.bankName || "—")}</div>
                <div class="file-meta">Bank Name</div>
              </div>
              <div class="file-actions">
                <button type="button" class="icon-pill" data-action="viewBank">View</button>
              </div>
            </div>

            <div class="file-row">
              <div class="file-left">
                <div class="file-name">${escapeHtml(b.accountHolder || "—")}</div>
                <div class="file-meta">Account Holder</div>
              </div>
              <div class="file-actions">
                <button type="button" class="icon-pill" data-action="viewBank">View</button>
              </div>
            </div>

            <div class="file-row">
              <div class="file-left">
                <div class="file-name">${escapeHtml(b.accountNumber || "—")}</div>
                <div class="file-meta">Account Number</div>
              </div>
              <div class="file-actions">
                <button type="button" class="icon-pill" data-action="viewBank">View</button>
              </div>
            </div>

            <div class="file-row">
              <div class="file-left">
                <div class="file-name">${escapeHtml(b.routingNumber || "—")}</div>
                <div class="file-meta">Routing Number</div>
              </div>
              <div class="file-actions">
                <button type="button" class="icon-pill" data-action="viewBank">View</button>
              </div>
            </div>
          ` : `
            <div class="file-row">
              <div class="file-left">
                <div class="file-name">No data available</div>
                <div class="file-meta">Bank details not stored for this record</div>
              </div>
            </div>
          `}
        </div>
      `;

      body.querySelectorAll('[data-action="viewBank"]').forEach(btn => {
        btn.addEventListener("click", () => {
          alert(
            `Bank Name: ${b.bankName || "—"}\n` +
            `Account Holder: ${b.accountHolder || "—"}\n` +
            `Account Number: ${b.accountNumber || "—"}\n` +
            `Routing Number: ${b.routingNumber || "—"}`
          );
        });
      });

      card.appendChild(bar);
      card.appendChild(body);
      return card;
    }

    // Files rendering
    const files = Array.isArray(recordData[key]) ? recordData[key] : [];
    const lines = document.createElement("div");
    lines.className = "file-lines";

    if (!files.length){
      const row = document.createElement("div");
      row.className = "file-row";
      row.innerHTML = `
        <div class="file-left">
          <div class="file-name">No files available</div>
          <div class="file-meta">Nothing uploaded for this section</div>
        </div>
      `;
      lines.appendChild(row);
    } else {
      files.forEach((f) => {
        const row = document.createElement("div");
        row.className = "file-row";
        row.innerHTML = `
          <div class="file-left">
            <div class="file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
            <div class="file-meta">${escapeHtml(fmtSize(f.size))} • ${escapeHtml(f.type || "file")}</div>
          </div>
          <div class="file-actions">
            <button type="button" class="icon-pill" data-view>View</button>
            <button type="button" class="icon-pill" data-download>Download</button>
          </div>
        `;

        // For now: View/Download are placeholders (backend will provide real URLs)
        row.querySelector("[data-view]").addEventListener("click", () => {
          alert(`View: ${f.name}\n(Connect backend/file URL to open preview)`);
        });

        row.querySelector("[data-download]").addEventListener("click", () => {
          // If you later set f.url to a real URL, you can trigger real download.
          // For now: simulate
          alert(`Download: ${f.name}\n(Connect backend/file URL to download)`);
        });

        lines.appendChild(row);
      });
    }

    body.appendChild(lines);
    card.appendChild(bar);
    card.appendChild(body);
    return card;
  }

  function renderGrid(){
    const recordId = recordSelect.value;
    const allFiles = loadJson(FILES_KEY, {});
    const recordData = allFiles[recordId] || {};

    downloadGrid.innerHTML = "";

    const totalItems = countAllItems(recordData);
    itemsPill.textContent = `${totalItems} item${totalItems === 1 ? "" : "s"}`;

    if (!recordId){
      emptyState.classList.add("is-open");
      recordHint.textContent = "No record selected.";
      return;
    }

    recordHint.textContent = "Loaded record data from storage (replace with database/API later).";

    let anyContent = totalItems > 0;

    categories.forEach(cat => {
      const card = buildCard(cat, recordData);
      downloadGrid.appendChild(card);
    });

    emptyState.classList.toggle("is-open", !anyContent);
  }

  function refreshAll(){
    populateRecords();
    renderGrid();
  }

  // Events
  recordSelect.addEventListener("change", renderGrid);
  refreshBtn.addEventListener("click", refreshAll);

  btnLogout.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // init
  seedIfEmpty();
  refreshAll();
})();
