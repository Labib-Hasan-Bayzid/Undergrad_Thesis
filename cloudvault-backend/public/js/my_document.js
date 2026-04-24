// js/my_document.js
const API = "http://localhost:5000";

function getToken() {
  return localStorage.getItem("access_token");
}
function logout() {
  localStorage.removeItem("access_token");
  window.location.replace("index.html");
}


async function apiGet(path) {
  const token = getToken();
  if (!token) throw new Error("No token. Please login again.");

  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  let data = null;
  try { data = await res.json(); } catch {}

  if (!res.ok) {
    const msg = data?.message || data?.error || `Request failed (${res.status})`;
    throw new Error(Array.isArray(msg) ? msg.join(", ") : msg);
  }
  return data;
}

(() => {
  const searchInput = document.getElementById("searchInput");
  const clearSearch = document.getElementById("clearSearch");
  const scrollArea = document.getElementById("scrollArea");
  const emptyState = document.getElementById("emptyState");
  const totalPill = document.getElementById("totalPill");
  const matchPill = document.getElementById("matchPill");
  const refreshBtn = document.getElementById("refreshBtn");
  const btnLogout = document.getElementById("btnLogout");
  btnLogout.addEventListener("click", logout);

  const subscribeBtn = document.getElementById("subscribeBtn");

  let records = [];

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return "—"; }
  }

  function setStats(total, matches) {
    totalPill.textContent = `${total} total`;
    matchPill.textContent = `${matches} matches`;
  }

  function updateClearButton() {
    clearSearch.style.opacity = searchInput.value.trim() ? "1" : ".55";
  }

  function render(list, query = "") {
  scrollArea.innerHTML = "";

  const q = query.trim().toLowerCase();
  const filtered = q
    ? list.filter(x => (x.recordName || "").toLowerCase().includes(q))
    : list;

  setStats(list.length, filtered.length);

  if (!filtered.length) {
    emptyState.classList.add("is-open");
    return;
  }
  emptyState.classList.remove("is-open");

  filtered.forEach((rec, idx) => {
    const row = document.createElement("div");
    row.className = "doc-row";
    row.setAttribute("role", "listitem");
    row.setAttribute("tabindex", "0");

    row.innerHTML = `
      <div class="doc-left">
        <div class="doc-name">${escapeHtml(rec.recordName || "Untitled")}</div>
        <div class="doc-sub">Created: ${escapeHtml(fmtDate(rec.createdAt))}</div>
      </div>
      <div class="doc-right">
        <span class="badge">#${idx + 1}</span>
        <span class="chev">›</span>
      </div>
    `;

    const openDoc = () => {
      const rid = rec.recordId || rec.id; // use rec (NOT doc)
      if (!rid) return alert("Missing recordId/id from API");
      window.location.href = `my_document_details.html?id=${encodeURIComponent(rid)}`;
    };

    // whole row clickable
    row.addEventListener("click", openDoc);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") openDoc();
    });

    // arrow area clickable too
    const arrow = row.querySelector(".doc-right");
    if (arrow) {
      arrow.style.cursor = "pointer";
      arrow.addEventListener("click", (e) => {
        e.stopPropagation();
        openDoc();
      });
    }

    scrollArea.appendChild(row);
  });
}


  async function refresh() {
    try {
      records = await apiGet("/records"); // ✅ DATABASE
      // newest first
      records.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      render(records, searchInput.value);
      updateClearButton();
    } catch (e) {
      alert(e.message || "Session expired. Please login again.");
      window.location.href = "index.html";
    }
  }

  searchInput.addEventListener("input", () => {
    render(records, searchInput.value);
    updateClearButton();
  });

  clearSearch.addEventListener("click", () => {
    searchInput.value = "";
    render(records, "");
    updateClearButton();
    searchInput.focus();
  });

  refreshBtn.addEventListener("click", refresh);

  btnLogout.addEventListener("click", () => {
    localStorage.removeItem("access_token");
    window.location.href = "index.html";
  });

  if (subscribeBtn) {
    subscribeBtn.addEventListener("click", () => {
      window.location.href = "payment_details.html";
    });
  }

  refresh();
})();
