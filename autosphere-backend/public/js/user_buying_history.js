// ✅ Restore token after payment redirect
(function () {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("token");

  if (token) {
    localStorage.setItem("access_token", token);

    // clean URL
    url.searchParams.delete("token");
    window.history.replaceState({}, document.title, url.pathname + url.search);
  }
})();

(function () {
  const $ = (id) => document.getElementById(id);

  

  // Elements
  const searchInput = $("searchInput");
  const btnClearSearch = $("btnClearSearch");
  const typeFilter = $("typeFilter");
  const statusFilter = $("statusFilter");
  const methodFilter = $("methodFilter");
  const sortBy = $("sortBy");
  const activeChips = $("activeChips");

  const listViewBtn = $("listViewBtn");
  const gridViewBtn = $("gridViewBtn");
  const itemsWrap = $("itemsWrap");
  const resultCount = $("resultCount");
  const contentTitle = $("contentTitle");
  const emptyState = $("emptyState");
  const btnClearAll = $("btnClearAll");

  const btnLogout = $("btnLogout");

  // Topbar user UI
  const userBox = $("userBox");
  const uiUserName = $("uiUserName");
  const uiUserRole = $("uiUserRole");
  const btnEditProfile = $("btnEditProfile");

  // Edit modal
  const editModal = $("editModal");
  const editName = $("editName");
  const oldPass = $("oldPass");
  const newPass = $("newPass");
  const newPass2 = $("newPass2");
  const btnSaveProfile = $("btnSaveProfile");
  const editToast = $("editToast");

  // Modal: details
  const detailsModal = $("detailsModal");
  const detailsTitle = $("detailsTitle");
  const detailsSub = $("detailsSub");
  const dItem = $("dItem");
  const dSeller = $("dSeller");
  const dPills = $("dPills");
  const dType = $("dType");
  const dStatus = $("dStatus");
  const dMethod = $("dMethod");
  const dAmount = $("dAmount");
  const dDate = $("dDate");
  const dReceipt = $("dReceipt");
  const dNotes = $("dNotes");
  const btnCloseDetails = $("btnCloseDetails");

  const API_BASE = window.location.origin;
  const TOKEN_KEY = "access_token";

  let viewMode = "list";
  let allRows = [];
  let me = null;

  // ------------------- Init -------------------
  init();

  async function init() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return (window.location.href = "login.html");

    // Logout
    btnLogout?.addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = "login.html";
    });

    // Load user profile
    try {
      me = await fetchMe();
      renderMe(me);
    } catch (e) {
      // if token is invalid/expired
      console.error("fetchMe failed:", e);
      localStorage.removeItem(TOKEN_KEY);
      return (window.location.href = "login.html");
    }

    // Load history
    try {
      allRows = await fetchHistory();
      //statusFilter.value = "paid";
//statusFilter.disabled = false; // ✅ user can’t switch to pending/cancelled
    } catch (e) {
      allRows = [];
      console.error(e);
    }

    // Wire UI events
    [searchInput, typeFilter, statusFilter, methodFilter, sortBy].forEach((el) => {
      el.addEventListener("input", applyFilters);
      el.addEventListener("change", applyFilters);
    });

    btnClearSearch.addEventListener("click", () => {
      searchInput.value = "";
      applyFilters();
    });

    btnClearAll.addEventListener("click", () => {
      searchInput.value = "";
      typeFilter.value = "all";
      statusFilter.value = "all";
      methodFilter.value = "all";
      sortBy.value = "recent";
      applyFilters();
    });

    listViewBtn.addEventListener("click", () => setViewMode("list"));
    gridViewBtn.addEventListener("click", () => setViewMode("grid"));

    // Open edit modal
    btnEditProfile?.addEventListener("click", () => openEdit());

    // Save profile
    btnSaveProfile?.addEventListener("click", saveProfile);

    // Modal close handlers (details + edit)
    document.addEventListener("click", (e) => {
      const t = e.target;

      // Close by backdrop or X
      if (t?.dataset?.close) {
        const modal = $(t.dataset.close);
        if (modal) closeModal(modal);
        return;
      }

      // Details open
      const rowBtn = t?.closest?.("button[data-open]");
      if (rowBtn) openDetails(rowBtn.dataset.open);
    });

    btnCloseDetails.addEventListener("click", () => closeModal(detailsModal));

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (detailsModal.classList.contains("is-open")) closeModal(detailsModal);
      if (editModal.classList.contains("is-open")) closeModal(editModal);
    });

    applyFilters();
  }

  // ------------------- API helpers -------------------
  async function api(path, { method = "GET", body } = {}) {
    const token = localStorage.getItem(TOKEN_KEY);
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Request failed");
    return data;
  }

  async function fetchMe() {
    // ✅ You must have this endpoint in backend (I give code below)
    return api("/auth/me");
  }

  async function updateMyName(name) {
    // ✅ You must have this endpoint in backend
    return api("/auth/me", { method: "PATCH", body: { name } });
  }

  async function changeMyPassword(oldPassword, newPassword) {
    // ✅ You must have this endpoint in backend
    return api("/auth/change-password", {
      method: "POST",
      body: { oldPassword, newPassword },
    });
  }

  async function fetchHistory() {
    const data = await api("/payments/my");

    return (Array.isArray(data) ? data : []).map((x) => ({
      ...x,
      type: x.type === "part" ? "parts" : x.type,
      status: normalizeStatus(x.status),
      method: x.method === "card" ? "card" : "bkash",
      amount: Number(x.amount || 0),
      date: Number(x.date || Date.now()),
    }))
    .filter((x) => x.status === "paid"); // ✅ ONLY PAID
  }

  function normalizeStatus(s) {
    s = String(s || "cancel").toLowerCase();
    if (s === "canceled") return "cancelled";
    if (s === "failed") return "cancelled";
    return s;
  }

  // ------------------- User UI -------------------
  function renderMe(u) {
    if (!u) return;
    if (userBox) userBox.style.display = "flex";
    uiUserName.textContent = u.name || "User";
    uiUserRole.textContent = String(u.role || "user").replaceAll("_", " ");
  }

  function openEdit() {
    editName.value = (me?.name || "").trim();
    oldPass.value = "";
    newPass.value = "";
    newPass2.value = "";
    toast(editToast, "", "ok", true);
    openModal(editModal);
  }

  async function saveProfile() {
    const name = (editName.value || "").trim();
    const o = (oldPass.value || "").trim();
    const p1 = (newPass.value || "").trim();
    const p2 = (newPass2.value || "").trim();

    // Validate name
    if (!name) return toast(editToast, "Name is required.", "bad");

    // If user typed ANY password field → require full change-password validation
    const wantsPassChange = !!(o || p1 || p2);
    if (wantsPassChange) {
      if (!o) return toast(editToast, "Old password is required.", "bad");
      if (!p1 || p1.length < 6) return toast(editToast, "New password must be at least 6 characters.", "bad");
      if (p1 !== p2) return toast(editToast, "New passwords do not match.", "bad");
    }

    btnSaveProfile.disabled = true;

    try {
      // 1) Update name (only call if changed)
      if (me?.name !== name) {
        const updated = await updateMyName(name);
        // backend can return updated user or {ok:true}
        me = { ...(me || {}), ...(updated?.user || {}), name };
        renderMe(me);
      }

      // 2) Change password (optional)
      if (wantsPassChange) {
        await changeMyPassword(o, p1);
      }

      toast(editToast, "Saved successfully.", "ok");
      setTimeout(() => closeModal(editModal), 450);
    } catch (e) {
      toast(editToast, e?.message || "Save failed.", "bad");
    } finally {
      btnSaveProfile.disabled = false;
    }
  }

  // ------------------- Filters -------------------
  function getFilters() {
    const q = (searchInput.value || "").trim().toLowerCase();
    return {
      q,
      type: typeFilter.value,
      status: statusFilter.value,
      method: methodFilter.value,
      sort: sortBy.value,
    };
  }

  function applyFilters() {
    const { q, type, status, method, sort } = getFilters();

    let out = allRows.filter((x) => {
      const matchesQ =
        !q ||
        `${x.item} ${x.seller} ${x.receipt} ${x.type} ${x.status} ${x.method}`
          .toLowerCase()
          .includes(q);

      const matchesType = type === "all" ? true : x.type === type;
      const matchesStatus = status === "all" ? true : x.status === status;
      const matchesMethod = method === "all" ? true : x.method === method;

      return matchesQ && matchesType && matchesStatus && matchesMethod;
    });

    out.sort((a, b) => {
      if (sort === "recent") return (b.date || 0) - (a.date || 0);
      if (sort === "oldest") return (a.date || 0) - (b.date || 0);
      if (sort === "priceHigh") return (b.amount || 0) - (a.amount || 0);
      if (sort === "priceLow") return (a.amount || 0) - (b.amount || 0);
      return 0;
    });

    renderChips();
    renderItems(out);
  }

  // ------------------- Render -------------------
  function renderItems(rows) {
    itemsWrap.innerHTML = "";

    resultCount.textContent = `${rows.length} record${rows.length === 1 ? "" : "s"}`;
    contentTitle.textContent = rows.length ? "All Purchases" : "No Purchases";

    if (!rows.length) {
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    rows.forEach((x) => {
      const el = document.createElement("div");
      el.className = "history-item glass-soft";

      el.innerHTML = `
        <div class="left">
          <div class="ic">${escapeHtml(iconForType(x.type))}</div>
          <div class="info">
            <h4>${escapeHtml(x.item)}</h4>
            <p class="muted">${escapeHtml(labelType(x.type))} • ${escapeHtml(labelMethod(x.method))} • ${escapeHtml(formatDate(x.date))}</p>
            <div class="pill-row">
              ${pillStatus(x.status)}
              <span class="pill ghost">${escapeHtml(x.receipt || "-")}</span>
            </div>
          </div>
        </div>

        <div class="right">
          <div class="amt">${formatBDT(x.amount)}</div>
          <button class="btn btn-ghost" data-open="${escapeHtml(x.id)}">Details</button>
        </div>
      `;

      itemsWrap.appendChild(el);
    });

    setViewMode(viewMode);
  }

  function renderChips() {
    const { q, type, status, method } = getFilters();
    const chips = [];

    if (q) chips.push({ key: "q", label: `Search: "${q}"` });
    if (type !== "all") chips.push({ key: "type", label: `Category: ${labelType(type)}` });
    if (status !== "all") chips.push({ key: "status", label: `Status: ${status}` });
    if (method !== "all") chips.push({ key: "method", label: `Payment: ${labelMethod(method)}` });

    activeChips.innerHTML = "";
    chips.forEach((c) => {
      const el = document.createElement("div");
      el.className = "chip";
      el.innerHTML = `<span>${escapeHtml(c.label)}</span><button type="button">×</button>`;
      el.querySelector("button").addEventListener("click", () => {
        if (c.key === "q") searchInput.value = "";
        if (c.key === "type") typeFilter.value = "all";
        if (c.key === "status") statusFilter.value = "all";
        if (c.key === "method") methodFilter.value = "all";
        applyFilters();
      });
      activeChips.appendChild(el);
    });
  }

  // ------------------- Details Modal -------------------
  function openDetails(id) {
    const x = allRows.find((r) => r.id === id);
    if (!x) return;

    detailsTitle.textContent = "Purchase Details";
    detailsSub.textContent = x.id;

    dItem.textContent = x.item || "-";
    dSeller.textContent = x.seller || "-";

    dPills.innerHTML = `
      <span class="pill ghost">${escapeHtml(labelType(x.type))}</span>
      <span class="pill ghost">${escapeHtml(labelMethod(x.method))}</span>
      ${pillStatus(x.status)}
    `;

    dType.textContent = labelType(x.type);
    dStatus.textContent = String(x.status || "-");
    dMethod.textContent = labelMethod(x.method);
    dAmount.textContent = formatBDT(x.amount);
    dDate.textContent = formatDate(x.date);
    dReceipt.textContent = x.receipt || "-";
    dNotes.textContent = x.notes || "-";

    openModal(detailsModal);
  }

  function openModal(el) {
    el.classList.add("is-open");
    el.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeModal(el) {
    el.classList.remove("is-open");
    el.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  // ------------------- View mode -------------------
  function setViewMode(mode) {
    viewMode = mode;
    if (mode === "list") {
      itemsWrap.classList.remove("is-grid");
      listViewBtn.classList.add("is-active");
      gridViewBtn.classList.remove("is-active");
    } else {
      itemsWrap.classList.add("is-grid");
      gridViewBtn.classList.add("is-active");
      listViewBtn.classList.remove("is-active");
    }
  }

  // ------------------- Helpers -------------------
  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatBDT(n) {
    const s = Math.round(Number(n || 0)).toString();
    const withComma = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `BDT ${withComma}`;
  }

  function formatDate(ts) {
    const d = new Date(ts || Date.now());
    return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  }

  function pillStatus(status) {
    if (status === "paid") return `<span class="pill ok">Paid</span>`;
    if (status === "pending") return `<span class="pill warn">Pending</span>`;
    return `<span class="pill bad">Cancelled</span>`;
  }

  function labelType(type) {
    const map = { vehicle: "Vehicle", service: "Service", parts: "Spare Parts" };
    return map[type] || "Other";
  }

  function labelMethod(m) {
    if (m === "bkash") return "bKash";
    if (m === "card") return "Card";
    return "—";
  }

  function iconForType(type) {
    // icons are visually hidden by CSS anyway (kept for fallback)
    if (type === "vehicle") return "🚗";
    if (type === "service") return "🛠️";
    if (type === "parts") return "⚙️";
    return "🧾";
  }

  function toast(el, message, type = "ok", silent = false) {
    if (!el) return;
    if (silent) {
      el.textContent = "";
      el.classList.remove("ok", "bad", "show");
      return;
    }
    el.textContent = message;
    el.classList.remove("ok", "bad", "show");
    el.classList.add(type === "ok" ? "ok" : "bad", "show");
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => el.classList.remove("show"), 2200);
  }
})();
