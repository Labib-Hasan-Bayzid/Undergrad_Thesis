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

  //
    // ✅ DB-backed data
  let salesDb = [];
  let bookingsDb = [];
  let subsDb = [];

  async function loadSubscriptions() {
  const rows = await api("/admin/records/subscriptions?limit=200");
  subsDb = Array.isArray(rows) ? rows : [];
}

  async function loadSalesFromDb(limit = 50) {
    const data = await api(`/admin/records/vehicle-sales?limit=${encodeURIComponent(limit)}`);
    salesDb = Array.isArray(data) ? data : [];
  }

  async function loadBookingsFromDb(limit = 50) {
    const data = await api(`/admin/records/bookings?limit=${encodeURIComponent(limit)}`);
    bookingsDb = Array.isArray(data) ? data : [];
  }


  

  // ----- Records (simple shapes, easy to map later) -----
  // Subscriptions: {user, plan, status(Active/Expired), ends, createdAt}
  const subsDefault = [
    { user: "Adnan", plan: "Premium", status: "Active", ends: "2026-03-10", createdAt: 1738450000000 },
    { user: "Rafi", plan: "Standard", status: "Active", ends: "2026-02-15", createdAt: 1738440000000 },
    { user: "Nabila", plan: "Standard", status: "Expired", ends: "2026-01-10", createdAt: 1737400000000 },
    { user: "Sadia", plan: "Premium", status: "Active", ends: "2026-04-01", createdAt: 1738460000000 },
    { user: "Fahim", plan: "Standard", status: "Expired", ends: "2025-12-29", createdAt: 1735000000000 }
  ];


  // ----- State -----
  let mode = "subscriptions"; // subscriptions | sales | bookings
  const state = {
    q: "",
    status: "all",
    sort: "recent"
  };
  // ----- DB-loaded data -----
let paymentsRecorded = 0;

async function loadMetrics() {
  const m = await api("/admin/metrics");
  paymentsRecorded = Number(m.paymentsRecorded || 0);
}

async function loadVehicleSales() {
  const rows = await api("/admin/records/vehicle-sales?limit=200");
  salesDb = Array.isArray(rows)
    ? rows.map(r => ({
        listing: r.listing || "—",
        seller: r.seller || "—",
        buyer: r.buyer || "—",
        status: r.status || "Sold",
        createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now()
      }))
    : [];
}

async function loadWorkshopBookings() {
  const rows = await api("/admin/records/bookings?limit=200");
  bookingsDb = Array.isArray(rows)
    ? rows.map(r => ({
        item: r.service || r.item || "—",
        workshop: r.workshop || "—",
        user: r.user || "—",
        status: r.status || "Completed",
        createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now()
      }))
    : [];
}


  // ----- Helpers -----
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

  function badge(status) {
    const s = String(status || "").toLowerCase();
    if (s === "active") return `<span class="badge ok">Active</span>`;
    if (s === "expired") return `<span class="badge danger">Expired</span>`;
    if (s === "sold") return `<span class="badge info">Sold</span>`;
    if (s === "requested") return `<span class="badge warn">Requested</span>`;
    if (s === "confirmed") return `<span class="badge ok">Confirmed</span>`;
    if (s === "completed") return `<span class="badge info">Completed</span>`;
    if (s === "pending") return `<span class="badge warn">Pending</span>`;
    return `<span class="badge">${escapeHtml(status)}</span>`;
  }

  function normalizeStatusForFilter(status) {
    // Convert UI filter values into matching values
    const s = String(status || "").toLowerCase();
    return s;
  }

  function matchesQuery(obj, q) {
    const text = Object.values(obj).join(" ").toLowerCase();
    return text.includes(q);
  }

  function sortList(list) {
    const out = [...list];
    if (state.sort === "recent") out.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    if (state.sort === "nameAsc") {
      out.sort((a,b) => {
        const ax = (a.user || a.listing || a.item || "").toString();
        const bx = (b.user || b.listing || b.item || "").toString();
        return ax.localeCompare(bx);
      });
    }
    if (state.sort === "nameDesc") {
      out.sort((a,b) => {
        const ax = (a.user || a.listing || a.item || "").toString();
        const bx = (b.user || b.listing || b.item || "").toString();
        return bx.localeCompare(ax);
      });
    }
    return out;
  }

  // ----- Filtering by mode -----
  function getFiltered() {
    const q = (state.q || "").trim().toLowerCase();
    const st = normalizeStatusForFilter(state.status);

    if (mode === "subscriptions") {
let list = [...subsDb];
      if (q) list = list.filter(x => matchesQuery(x, q));
      if (st !== "all") {
        list = list.filter(x => x.status.toLowerCase() === st);
      }
      return sortList(list);
    }

    if (mode === "sales") {
      let list = [...salesDb];

      if (q) list = list.filter(x => matchesQuery(x, q));
      if (st !== "all") {
        list = list.filter(x => x.status.toLowerCase() === st);
      }
      return sortList(list);
    }

    // bookings
    let list = [...bookingsDb];
    if (q) list = list.filter(x => matchesQuery(x, q));
    if (st !== "all") {
      list = list.filter(x => x.status.toLowerCase() === st);
    }
    return sortList(list);
  }

  // ----- Render rows -----
  function renderSubscriptions(list) {
    const root = $("subsRows");
    const empty = $("subsEmpty");
    root.innerHTML = "";

    if (list.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    list.forEach(x => {
      const row = document.createElement("div");
      row.className = "trow";
      row.innerHTML = `
        <div class="tcell" data-label="User">${escapeHtml(x.user)}</div>
        <div class="tcell" data-label="Plan">${escapeHtml(x.plan)}</div>
        <div class="tcell" data-label="Status">${badge(x.status)}</div>
        <div class="tcell" data-label="Ends">${escapeHtml(x.ends)}</div>
      `;
      root.appendChild(row);
    });
  }

  function renderSales(list) {
    const root = $("salesRows");
    const empty = $("salesEmpty");
    root.innerHTML = "";

    if (list.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    list.forEach(x => {
      const row = document.createElement("div");
      row.className = "trow";
      row.innerHTML = `
        <div class="tcell" data-label="Listing">${escapeHtml(x.listing)}</div>
        <div class="tcell" data-label="Seller">${escapeHtml(x.seller)}</div>
        <div class="tcell" data-label="Buyer">${escapeHtml(x.buyer)}</div>
        <div class="tcell" data-label="Status">${badge(x.status)}</div>
      `;
      root.appendChild(row);
    });
  }

  function renderBookings(list) {
    const root = $("bookingRows");
    const empty = $("bookingsEmpty");
    root.innerHTML = "";

    if (list.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    list.forEach(x => {
      const row = document.createElement("div");
      row.className = "trow";
      row.innerHTML = `
        <div class="tcell" data-label="Service / Item">${escapeHtml(x.item || x.service || "—")}</div>
        <div class="tcell" data-label="Workshop">${escapeHtml(x.workshop)}</div>
        <div class="tcell" data-label="User">${escapeHtml(x.user)}</div>
        <div class="tcell" data-label="Status">${badge(x.status)}</div>
      `;
      root.appendChild(row);
    });
  }

  // ----- KPIs -----
  function renderKpis(list) {
const payments = paymentsRecorded;

    if (mode === "subscriptions") {
      const active = list.filter(x => x.status === "Active").length;
      const expired = list.filter(x => x.status === "Expired").length;

      $("kpiLabel1").textContent = "Subscriptions";
      $("kpiValue1").textContent = String(list.length);
      $("kpiSub1").textContent = "Total records";

      $("kpiLabel2").textContent = "Active";
      $("kpiValue2").textContent = String(active);
      $("kpiSub2").textContent = `${expired} expired`;

      $("kpiLabel3").textContent = "Recorded Payments";
      $("kpiValue3").textContent = String(payments);
      $("kpiSub3").textContent = "Saved receipts";
      return;
    }

    if (mode === "sales") {
      const sold = list.filter(x => x.status === "Sold").length;
      const active = list.filter(x => x.status === "Active").length;

      $("kpiLabel1").textContent = "Listings";
      $("kpiValue1").textContent = String(list.length);
      $("kpiSub1").textContent = "Total records";

      $("kpiLabel2").textContent = "Sold";
      $("kpiValue2").textContent = String(sold);
      $("kpiSub2").textContent = `${active} active`;

      $("kpiLabel3").textContent = "Recorded Payments";
      $("kpiValue3").textContent = String(payments);
      $("kpiSub3").textContent = "Saved receipts";
      return;
    }

    // bookings
    const requested = list.filter(x => x.status === "Requested").length;
    const completed = list.filter(x => x.status === "Completed").length;

    $("kpiLabel1").textContent = "Bookings";
    $("kpiValue1").textContent = String(list.length);
    $("kpiSub1").textContent = "Total records";

    $("kpiLabel2").textContent = "Completed";
    $("kpiValue2").textContent = String(completed);
    $("kpiSub2").textContent = `${requested} requested • ${completed} completed`;

    $("kpiLabel3").textContent = "Recorded Payments";
    $("kpiValue3").textContent = String(payments);
    $("kpiSub3").textContent = "Saved receipts";
  }

  // ----- Mode switch UI -----
  function setMode(next) {
  mode = next;

  $("tabSubscriptions")?.classList.toggle("is-active", next === "subscriptions");
  $("tabVehicleSales")?.classList.toggle("is-active", next === "sales");
  $("tabBookings")?.classList.toggle("is-active", next === "bookings");

  const subs = $("subscriptions");
  const sales = $("vehicle_sales");
  const bookings = $("bookings");

  if (subs) { subs.hidden = next !== "subscriptions"; subs.style.display = subs.hidden ? "none" : ""; }
  if (sales) { sales.hidden = next !== "sales"; sales.style.display = sales.hidden ? "none" : ""; }
  if (bookings) { bookings.hidden = next !== "bookings"; bookings.style.display = bookings.hidden ? "none" : ""; }

  // Load data only for the selected tab (keep your existing logic)
  (async () => {
    try {
      if (next === "sales") await loadSalesFromDb(200);
      if (next === "bookings") await loadBookingsFromDb(200);
      if (next === "subscriptions") await loadSubscriptions();
    } catch (e) {
      console.error(e);
      showToast("Failed to load records from server", "bad");
    }
    renderAll();
  })();
}

  function renderAll() {
    const list = getFiltered();
    renderKpis(list);

    if (mode === "subscriptions") renderSubscriptions(list);
    if (mode === "sales") renderSales(list);
    if (mode === "bookings") renderBookings(list);
  }

  // ----- Events -----
  function bind() {
    $("tabSubscriptions").addEventListener("click", () => setMode("subscriptions"));
    $("tabVehicleSales").addEventListener("click", () => setMode("sales"));
    $("tabBookings").addEventListener("click", () => setMode("bookings"));

    $("btnClearSearch").addEventListener("click", () => {
      $("searchInput").value = "";
      state.q = "";
      renderAll();
    });

    $("searchInput").addEventListener("input", () => {
      state.q = $("searchInput").value || "";
      renderAll();
    });

    $("statusFilter").addEventListener("change", () => {
      state.status = $("statusFilter").value;
      renderAll();
    });

    $("sortBy").addEventListener("change", () => {
      state.sort = $("sortBy").value;
      renderAll();
    });

    $("btnApply").addEventListener("click", () => {
      state.q = $("searchInput").value || "";
      state.status = $("statusFilter").value;
      state.sort = $("sortBy").value;
      renderAll();
      showToast("Filters applied", "ok");
    });

   $("btnRefreshSubs").addEventListener("click", async () => {
  if (mode !== "subscriptions") setMode("subscriptions");
  try {
    await loadSubscriptions();
    renderAll();
    showToast("Subscriptions updated", "ok");
  } catch (e) {
    console.error(e);
    showToast("Failed to load subscriptions", "bad");
  }
});

        $("btnRefreshSales").addEventListener("click", async () => {
      if (mode !== "sales") setMode("sales");
      try {
        await loadSalesFromDb(200);
        renderAll();
        showToast("Vehicle sales updated", "ok");
      } catch (e) {
        console.error(e);
        showToast("Failed to load vehicle sales", "bad");
      }
    });


        $("btnRefreshBookings").addEventListener("click", async () => {
      if (mode !== "bookings") setMode("bookings");
      try {
        await loadBookingsFromDb(200);
        renderAll();
        showToast("Workshop sales updated", "ok");
      } catch (e) {
        console.error(e);
        showToast("Failed to load workshop sales", "bad");
      }
    });


    // Deep-link: #subscriptions
    window.addEventListener("hashchange", () => {
      const h = (location.hash || "").replace("#", "");
      if (h === "subscriptions") setMode("subscriptions");
      if (h === "vehicle_sales") setMode("sales");
      if (h === "bookings") setMode("bookings");
    });
  }

  // Init
  // Init
bind();

(async () => {
  await loadMetrics();
  await Promise.all([loadVehicleSales(), loadWorkshopBookings(),loadSubscriptions()]);

  const hash = (location.hash || "").replace("#", "");
  if (hash === "vehicle_sales") setMode("sales");
  else if (hash === "bookings") setMode("bookings");
  else setMode("subscriptions");

  renderAll();
})();

})();
