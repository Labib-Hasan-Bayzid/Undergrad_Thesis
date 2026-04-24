const API_BASE = "http://localhost:5001";

async function api(path, opts = {}) {
  const token = localStorage.getItem("access_token");
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401) window.location.replace("login.html");
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}



(function () {
  const $ = (id) => document.getElementById(id);

  // Simple backend mapping fields:
  // user_id, name, phone, city, subscription_status(active/expired/none), blocked(boolean)
  const USERS_KEY = "admin_users_v1";

  const defaultUsers = [
    { user_id: "U-1001", name: "Adnan", phone: "+8801XXXXXXXXX", city: "Dhaka", subscription_status: "active", blocked: false, createdAt: 1738469000000 },
    { user_id: "U-1002", name: "Rafi", phone: "+8801XXXXXXXXX", city: "Chattogram", subscription_status: "active", blocked: false, createdAt: 1738466000000 },
    { user_id: "U-1003", name: "Nabila", phone: "+8801XXXXXXXXX", city: "Sylhet", subscription_status: "expired", blocked: false, createdAt: 1738459000000 },
    { user_id: "U-1004", name: "Sadia", phone: "+8801XXXXXXXXX", city: "Rajshahi", subscription_status: "none", blocked: false, createdAt: 1738455000000 },
    { user_id: "U-1005", name: "Fahim", phone: "+8801XXXXXXXXX", city: "Dhaka", subscription_status: "none", blocked: true, createdAt: 1738449000000 }
  ];

 async function loadUsersFromDb() {
  const data = await api("/admin/users");
  return (Array.isArray(data) ? data : []).map(x => ({
    user_id: x.id,
    name: x.name,
    phone: x.phone || "",
    city: x.city || "",
    subscription_status: x.subscriptionStatus || "none",
    blocked: !!x.isBlocked,
    createdAt: new Date(x.createdAt).getTime(),
  }));
}


  function saveUsers(arr) {
    localStorage.setItem(USERS_KEY, JSON.stringify(arr));
  }

  let users = loadUsers();

  const state = {
    q: "",
    sub: "all",
    access: "all",
    sort: "recent"
  };

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function badgeSub(st) {
    const s = String(st || "").toLowerCase();
    if (s === "active") return `<span class="badge ok">Active</span>`;
    if (s === "expired") return `<span class="badge danger">Expired</span>`;
    return `<span class="badge warn">None</span>`;
  }

  function badgeAccess(blocked) {
    return blocked
      ? `<span class="badge danger">Blocked</span>`
      : `<span class="badge ok">Active</span>`;
  }

  function showToast(msg, type="ok") {
    const toast = $("toast");
    toast.textContent = msg;
    toast.classList.remove("ok", "bad", "show");
    toast.classList.add(type === "ok" ? "ok" : "bad", "show");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function getFiltered() {
    let out = [...users];

    const q = (state.q || "").trim().toLowerCase();
    if (q) {
      out = out.filter(u => `${u.name} ${u.phone} ${u.city} ${u.user_id}`.toLowerCase().includes(q));
    }

    if (state.sub !== "all") {
      out = out.filter(u => (u.subscription_status || "none") === state.sub);
    }

    if (state.access !== "all") {
      if (state.access === "blocked") out = out.filter(u => u.blocked);
      if (state.access === "active") out = out.filter(u => !u.blocked);
    }

    if (state.sort === "recent") out.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    if (state.sort === "nameAsc") out.sort((a,b) => (a.name||"").localeCompare(b.name||""));
    if (state.sort === "nameDesc") out.sort((a,b) => (b.name||"").localeCompare(a.name||""));

    return out;
  }

  function renderKpis(list) {
    const total = list.length;
    const activeSub = list.filter(u => u.subscription_status === "active").length;
    const blocked = list.filter(u => u.blocked).length;

    $("kpiTotal").textContent = String(total);
    $("kpiActiveSub").textContent = String(activeSub);
    $("kpiBlocked").textContent = String(blocked);

    $("kpiTotalSub").textContent = "Filtered results";
    $("kpiActiveSubSub").textContent = "With active subscription";
    $("kpiBlockedSub").textContent = "Access disabled";
  }

  function renderRows(list) {
    const root = $("userRows");
    const empty = $("emptyState");

    root.innerHTML = "";

    if (list.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    list.forEach(u => {
      const btnClass = u.blocked ? "btn btn-mini btn-unblock" : "btn btn-mini btn-block";
      const btnText = u.blocked ? "Unblock" : "Block";

      const row = document.createElement("div");
      row.className = "trow";
      row.innerHTML = `
        <div class="tcell" data-label="User">${escapeHtml(u.name)} <span class="muted">(${escapeHtml(u.user_id)})</span></div>
        <div class="tcell" data-label="Phone">${escapeHtml(u.phone)}</div>
        <div class="tcell" data-label="City">${escapeHtml(u.city)}</div>
        <div class="tcell" data-label="Subscription">${badgeSub(u.subscription_status)}</div>
        <div class="tcell" data-label="Access">${badgeAccess(u.blocked)}</div>
        <div class="tcell" data-label="Action">
          <div class="action-row">
            <button class="${btnClass}" type="button" data-action="toggle" data-id="${escapeHtml(u.user_id)}">${btnText}</button>
          </div>
        </div>
      `;
      root.appendChild(row);
    });
  }

  function renderAll() {
    const list = getFiltered();
    renderKpis(list);
    renderRows(list);
  }

  async function toggleBlock(userId) {
  const u = users.find(x => x.user_id === userId);
  if (!u) return;

  const next = !u.blocked;
  await api(`/admin/users/${userId}/block`, {
    method: "PATCH",
    body: JSON.stringify({ blocked: next }),
  });

  u.blocked = next;
  showToast(next ? "User blocked" : "User unblocked", "ok");
  renderAll();
}


  function bind() {
    $("btnClearSearch").addEventListener("click", () => {
      $("searchInput").value = "";
      state.q = "";
      renderAll();
    });

    $("searchInput").addEventListener("input", () => {
      state.q = $("searchInput").value || "";
      renderAll();
    });

    $("subFilter").addEventListener("change", () => {
      state.sub = $("subFilter").value;
      renderAll();
    });

    $("accessFilter").addEventListener("change", () => {
      state.access = $("accessFilter").value;
      renderAll();
    });

    $("sortBy").addEventListener("change", () => {
      state.sort = $("sortBy").value;
      renderAll();
    });

    $("btnApply").addEventListener("click", () => {
      state.q = $("searchInput").value || "";
      state.sub = $("subFilter").value;
      state.access = $("accessFilter").value;
      state.sort = $("sortBy").value;
      showToast("Filters applied", "ok");
      renderAll();
    });

    $("btnRefresh").addEventListener("click", () => {
      users = loadUsers();
      renderAll();
      showToast("Users updated", "ok");
    });

    $("btnClearAll").addEventListener("click", () => {
      $("searchInput").value = "";
      $("subFilter").value = "all";
      $("accessFilter").value = "all";
      $("sortBy").value = "recent";
      state.q = "";
      state.sub = "all";
      state.access = "all";
      state.sort = "recent";
      renderAll();
    });

    document.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      if (btn.dataset.action !== "toggle") return;
      toggleBlock(btn.dataset.id);
    });
  }

  bind();
  renderAll();
})();
