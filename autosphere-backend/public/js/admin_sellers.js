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

  // Data structure is simple for backend mapping:
  // seller_id, type(vehicle/workshop), name, phone, city, is_verified
  const SELLERS_KEY = "admin_sellers_v1";

  const defaultSellers = [
    { seller_id: "SV-2001", type: "vehicle", name: "Metro Auto House", phone: "+8801XXXXXXXXX", city: "Dhaka", is_verified: true },
    { seller_id: "SV-2002", type: "vehicle", name: "City Wheels BD", phone: "+8801XXXXXXXXX", city: "Chattogram", is_verified: false },
    { seller_id: "SV-2003", type: "vehicle", name: "Prime Motors", phone: "+8801XXXXXXXXX", city: "Sylhet", is_verified: true },
    { seller_id: "SV-2004", type: "vehicle", name: "RoadMaster Hub", phone: "+8801XXXXXXXXX", city: "Rajshahi", is_verified: false },

    { seller_id: "SW-3001", type: "workshop", name: "AutoCare Dhaka", phone: "+8801XXXXXXXXX", city: "Dhaka", is_verified: true },
    { seller_id: "SW-3002", type: "workshop", name: "BrakePro Center", phone: "+8801XXXXXXXXX", city: "Chattogram", is_verified: false },
    { seller_id: "SW-3003", type: "workshop", name: "BikeLab Sylhet", phone: "+8801XXXXXXXXX", city: "Sylhet", is_verified: true },
    { seller_id: "SW-3004", type: "workshop", name: "PowerFix Garage", phone: "+8801XXXXXXXXX", city: "Rajshahi", is_verified: false }
  ];

  async function loadSellersFromDb() {
  const data = await api("/admin/sellers?type=all");
  return (Array.isArray(data) ? data : []).map(x => ({
    seller_id: x.id,
    type: x.type,
    name: x.name,
    phone: x.phone || "",
    city: x.city || "",
    is_verified: !!x.isVerified,

    hasTradeLicense: !!x.hasTradeLicense,
    tradeLicenseName: x.tradeLicenseName || "",
    hasIncomeTax: !!x.hasIncomeTax,
    incomeTaxName: x.incomeTaxName || "",
  }));
}


  function saveSellers(arr) {
    localStorage.setItem(SELLERS_KEY, JSON.stringify(arr));
  }

let sellers = [];

  // State
  let scope = "all"; // all | vehicle | workshop
  const state = {
    q: "",
    status: "all", // all | verified | pending
    sort: "recommended"
  };

  // Helpers
  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showToast(msg, type="ok") {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove("ok", "bad", "show");
    toast.classList.add(type === "ok" ? "ok" : "bad", "show");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function badgeVerified(v) {
    return v
      ? `<span class="badge ok">Verified</span>`
      : `<span class="badge warn">Pending</span>`;
  }

  function applyFilters(list, type) {
    let out = list.filter(s => s.type === type);

    if (scope !== "all") out = out.filter(s => s.type === scope);

    const q = (state.q || "").trim().toLowerCase();
    if (q) {
      out = out.filter(s =>
        `${s.name} ${s.phone} ${s.city} ${s.seller_id}`.toLowerCase().includes(q)
      );
    }

    if (state.status === "verified") out = out.filter(s => s.is_verified);
    if (state.status === "pending") out = out.filter(s => !s.is_verified);

    out.sort((a,b) => {
      if (state.sort === "nameAsc") return a.name.localeCompare(b.name);
      if (state.sort === "nameDesc") return b.name.localeCompare(a.name);
      // recommended: verified first, then name
      if (a.is_verified !== b.is_verified) return a.is_verified ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return out;
  }

 function renderRow(s) {
  const btnClass = s.is_verified ? "btn btn-mini btn-unverify" : "btn btn-mini btn-verify";
  const btnText = s.is_verified ? "Unverify" : "Verify";

  return `
    <div class="trow" data-id="${escapeHtml(s.seller_id)}">
      <div class="tcell" data-label="Seller">${escapeHtml(s.name)} <span class="muted">(${escapeHtml(s.seller_id)})</span></div>
      <div class="tcell" data-label="Phone">${escapeHtml(s.phone)}</div>
      <div class="tcell" data-label="City">${escapeHtml(s.city)}</div>
      <div class="tcell" data-label="Status">${badgeVerified(s.is_verified)}</div>
      <div class="tcell" data-label="Action">
        <div class="action-row" style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-mini btn-ghost" type="button" data-action="downloadTrade" data-id="${escapeHtml(s.seller_id)}" ${s.hasTradeLicense ? "" : "disabled"}>
            Trade License
          </button>
          <button class="btn btn-mini btn-ghost" type="button" data-action="downloadTax" data-id="${escapeHtml(s.seller_id)}" ${s.hasIncomeTax ? "" : "disabled"}>
            Income Tax
          </button>
          <button class="${btnClass}" type="button" data-action="toggle" data-id="${escapeHtml(s.seller_id)}">
            ${btnText}
          </button>
        </div>
      </div>
    </div>
  `;
}

//
async function downloadSellerDoc(sellerId, kind) {
  const token = localStorage.getItem("access_token");

  const res = await fetch(`${API_BASE}/admin/sellers/${sellerId}/document/${kind}`, {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("access_token");
    window.location.replace("login.html");
    return;
  }

  if (!res.ok) throw new Error("Download failed");

  const blob = await res.blob();

  let filename = `${kind}.bin`;
  const cd = res.headers.get("content-disposition") || "";
  const m = cd.match(/filename="([^"]+)"/i);
  if (m?.[1]) filename = m[1];

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

//
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  try {
    if (action === "toggle") {
      await toggleVerify(id);
      return;
    }

    if (action === "downloadTrade") {
      await downloadSellerDoc(id, "trade");
      showToast("Trade license download started", "ok");
      return;
    }

    if (action === "downloadTax") {
      await downloadSellerDoc(id, "tax");
      showToast("Income tax download started", "ok");
      return;
    }
  } catch (e) {
    showToast(e.message || "Action failed", "bad");
  }
});
//

  function renderTables() {
    const vehicleList = applyFilters(sellers, "vehicle");
    const workshopList = applyFilters(sellers, "workshop");

    const vRoot = $("vehicleRows");
    const wRoot = $("workshopRows");
    const vEmpty = $("vehicleEmpty");
    const wEmpty = $("workshopEmpty");

    if (vRoot) vRoot.innerHTML = vehicleList.map(renderRow).join("");
    if (wRoot) wRoot.innerHTML = workshopList.map(renderRow).join("");

    if (vEmpty) vEmpty.hidden = vehicleList.length !== 0;
    if (wEmpty) wEmpty.hidden = workshopList.length !== 0;

    // KPIs based on current scope+filters (overall)
    const current = (() => {
      let all = [...sellers];
      if (scope !== "all") all = all.filter(s => s.type === scope);

      const q = (state.q || "").trim().toLowerCase();
      if (q) all = all.filter(s => `${s.name} ${s.phone} ${s.city} ${s.seller_id}`.toLowerCase().includes(q));

      if (state.status === "verified") all = all.filter(s => s.is_verified);
      if (state.status === "pending") all = all.filter(s => !s.is_verified);

      return all;
    })();

    const total = current.length;
    const verified = current.filter(s => s.is_verified).length;
    const pending = total - verified;

    $("kpiTotal").textContent = String(total);
    $("kpiVerified").textContent = String(verified);
    $("kpiPending").textContent = String(pending);

    $("kpiTotalSub").textContent = scope === "all" ? "Vehicle + Workshop" : (scope === "vehicle" ? "Vehicle sellers" : "Workshop sellers");
    $("kpiVerifiedSub").textContent = "Approved sellers";
    $("kpiPendingSub").textContent = "Needs review";
  }

  function setScope(next) {
    scope = next;

    $("segAll")?.classList.toggle("is-active", next === "all");
    $("segVehicle")?.classList.toggle("is-active", next === "vehicle");
    $("segWorkshop")?.classList.toggle("is-active", next === "workshop");

    // smooth jump when using hash links
    if (next === "vehicle") location.hash = "#vehicle";
    if (next === "workshop") location.hash = "#workshop";

    renderTables();
  }

 async function toggleVerify(sellerId) {
  const s = sellers.find(x => x.seller_id === sellerId);
  if (!s) return;

  const next = !s.is_verified;
  await api(`/admin/sellers/${sellerId}/verify`, {
    method: "PATCH",
    body: JSON.stringify({ verified: next }),
  });

  s.is_verified = next;
  showToast(next ? "Seller verified" : "Seller set to pending", "ok");
  renderTables();
}


  // Events
  function bind() {
    $("btnLogout")?.addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.removeItem("access_token");
  window.location.replace("login.html");
});

    $("segAll")?.addEventListener("click", () => setScope("all"));
    $("segVehicle")?.addEventListener("click", () => setScope("vehicle"));
    $("segWorkshop")?.addEventListener("click", () => setScope("workshop"));

    $("btnClearSearch")?.addEventListener("click", () => {
      $("searchInput").value = "";
      state.q = "";
      renderTables();
    });

    $("btnApply")?.addEventListener("click", () => {
      state.q = $("searchInput").value || "";
      state.status = $("statusFilter").value;
      state.sort = $("sortBy").value;
      renderTables();
    });

    $("searchInput")?.addEventListener("input", () => {
      state.q = $("searchInput").value || "";
      renderTables();
    });

    $("statusFilter")?.addEventListener("change", () => {
      state.status = $("statusFilter").value;
      renderTables();
    });

    $("sortBy")?.addEventListener("change", () => {
      state.sort = $("sortBy").value;
      renderTables();
    });

   async function refreshFromDb(msg) {
  try {
    sellers = await loadSellersFromDb();
    renderTables();
    showToast(msg, "ok");
  } catch (e) {
    showToast("Refresh failed", "bad");
  }
}

$("btnRefreshVehicle")?.addEventListener("click", () => refreshFromDb("Vehicle sellers updated"));
$("btnRefreshWorkshop")?.addEventListener("click", () => refreshFromDb("Workshop sellers updated"));



    document.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === "toggle") toggleVerify(id);
    });

    // Hash deep-link support
    window.addEventListener("hashchange", () => {
      const h = (location.hash || "").replace("#", "");
      if (h === "vehicle") setScope("vehicle");
      if (h === "workshop") setScope("workshop");
    });
  }

  // Init
loadSellersFromDb()
  .then(arr => { sellers = arr; renderTables(); })
  .catch(() => showToast("Failed to load sellers", "bad"));

  bind();
  const hash = (location.hash || "").replace("#", "");
  if (hash === "vehicle") setScope("vehicle");
  else if (hash === "workshop") setScope("workshop");
  else setScope("all");
})();
