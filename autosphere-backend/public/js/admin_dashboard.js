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

  // ---------- Mock data (replace later with fetched data) ----------
  const users = [
    { id: "U-101", name: "Adnan", role: "user" },
    { id: "U-102", name: "Rafi", role: "user" },
    { id: "U-103", name: "Nabila", role: "user" },
    { id: "U-104", name: "Fahim", role: "seller" },
    { id: "U-105", name: "Sadia", role: "seller" }
  ];

  const subscriptions = [
    { user: "Adnan", plan: "Premium", status: "Active", ends: "2026-03-10" },
    { user: "Rafi", plan: "Standard", status: "Active", ends: "2026-02-15" },
    { user: "Nabila", plan: "Standard", status: "Expired", ends: "2026-01-10" },
    { user: "Sadia", plan: "Premium", status: "Active", ends: "2026-04-01" },
    { user: "Fahim", plan: "Standard", status: "Expired", ends: "2025-12-29" }
  ];

  const sellers = [
    { id: "SV-2001", type: "vehicle", name: "Metro Auto House", verified: true },
    { id: "SV-2002", type: "vehicle", name: "City Wheels BD", verified: false },
    { id: "SV-2003", type: "vehicle", name: "Prime Motors", verified: true },
    { id: "SW-3001", type: "workshop", name: "AutoCare Dhaka", verified: true },
    { id: "SW-3002", type: "workshop", name: "BrakePro Center", verified: false },
    { id: "SW-3003", type: "workshop", name: "BikeLab Sylhet", verified: true }
  ];

  const vehicleListings = [
    { id: "L-5001", title: "Toyota Axio 2018", status: "active" },
    { id: "L-5002", title: "Honda Vezel 2017", status: "sold" },
    { id: "L-5003", title: "Yamaha FZ V3", status: "active" },
    { id: "L-5004", title: "Suzuki Gixxer", status: "sold" }
  ];

  const vehicleSales = [
    { listing: "Honda Vezel 2017", seller: "Prime Motors", buyer: "Adnan", status: "Sold" },
    { listing: "Suzuki Gixxer", seller: "Metro Auto House", buyer: "Rafi", status: "Sold" },
    { listing: "Toyota Axio 2018", seller: "Metro Auto House", buyer: "—", status: "Active" },
    { listing: "Yamaha FZ V3", seller: "City Wheels BD", buyer: "—", status: "Active" }
  ];

  const workshopItems = [
    { id: "S-2001", type: "service", title: "Engine Oil Change" },
    { id: "S-2002", type: "service", title: "Brake Service" },
    { id: "P-3001", type: "part", title: "Brake Pad Set" },
    { id: "P-3002", type: "part", title: "Bike Tire (Tubeless)" }
  ];

  const bookings = [
    { service: "Engine Oil Change", workshop: "AutoCare Dhaka", user: "Adnan", status: "Confirmed" },
    { service: "Brake Service", workshop: "BrakePro Center", user: "Rafi", status: "Requested" },
    { service: "Brake Pad Set", workshop: "AutoCare Dhaka", user: "Nabila", status: "Completed" },
    { service: "Bike Tire (Tubeless)", workshop: "BikeLab Sylhet", user: "Adnan", status: "Requested" }
  ];

  // Optional: read payments from your existing pages if stored in localStorage
  const PAYMENT_KEYS = ["workshops_payments_v1", "marketplace_payments_v1"];
  function countPayments() {
    let total = 0;
    for (const k of PAYMENT_KEYS) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) total += arr.length;
      } catch {}
    }
    return total;
  }

  // ---------- UI helpers ----------
  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function badge(status) {
    const s = String(status || "").toLowerCase();
    if (s === "active") return `<span class="badge ok">Active</span>`;
    if (s === "expired") return `<span class="badge danger">Expired</span>`;
    if (s === "sold") return `<span class="badge info">Sold</span>`;
    if (s === "confirmed") return `<span class="badge ok">Confirmed</span>`;
    if (s === "requested") return `<span class="badge warn">Requested</span>`;
    if (s === "completed") return `<span class="badge info">Completed</span>`;
    return `<span class="badge">${escapeHtml(status)}</span>`;
  }

  function showToast(msg, type = "ok") {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.remove("ok", "bad", "show");
    t.classList.add(type === "ok" ? "ok" : "bad", "show");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- Compute metrics ----------
  function compute() {
    const totalUsers = users.filter(u => u.role === "user").length;
    const totalSellers = users.filter(u => u.role === "seller").length;

    const verifiedSellers = sellers.filter(s => s.verified).length;
    const pendingSellers = sellers.filter(s => !s.verified).length;

    const activeListings = vehicleListings.filter(l => l.status === "active").length;
    const soldListings = vehicleListings.filter(l => l.status === "sold").length;

    const avActive = subscriptions.filter(x => x.status === "Active").length;
    const avExpired = subscriptions.filter(x => x.status === "Expired").length;
    const avPlans = new Set(subscriptions.map(x => x.plan)).size;

    const vehicleSellerCount = sellers.filter(s => s.type === "vehicle").length;
    const vehiclePending = sellers.filter(s => s.type === "vehicle" && !s.verified).length;

    const workshopSellerCount = sellers.filter(s => s.type === "workshop").length;
    const wsBookings = bookings.length;
    const wsItems = workshopItems.length;

    const payments = countPayments();

    return {
      totalUsers,
      totalSellers,
      verifiedSellers,
      pendingSellers,
      activeListings,
      soldListings,
      avActive,
      avExpired,
      avPlans,
      vehicleSellerCount,
      vehiclePending,
      workshopSellerCount,
      wsBookings,
      wsItems,
      payments
    };
  }

  // ---------- Render tables ----------
 function renderSubscriptions(list) {
  const root = $("subsRows");
  if (!root) return;
  root.innerHTML = "";

  const rows = Array.isArray(list) ? list : [];
  rows.slice(0, 5).forEach((x) => {
    const row = document.createElement("div");
    row.className = "trow";
    row.innerHTML = `
      <div class="tcell">${escapeHtml(x.user)}</div>
      <div class="tcell">${escapeHtml(x.plan)}</div>
      <div class="tcell">${badge(x.status)}</div>
      <div class="tcell">${escapeHtml(x.ends)}</div>
    `;
    root.appendChild(row);
  });
}

  function renderSales(list) {
  const root = $("salesRows");
  if (!root) return;
  root.innerHTML = "";

  const rows = Array.isArray(list) ? list : [];

  rows.slice(0, 5).forEach((x) => {
    const row = document.createElement("div");
    row.className = "trow";
    row.innerHTML = `
      <div class="tcell">${escapeHtml(x.listing || "—")}</div>
      <div class="tcell">${escapeHtml(x.seller || "—")}</div>
      <div class="tcell">${escapeHtml(x.buyer || "—")}</div>
      <div class="tcell">${badge(x.status || "Sold")}</div>
    `;
    root.appendChild(row);
  });
}




  function renderBookings(list = []) {
  const root = $("bookingRows");
  if (!root) return;
  root.innerHTML = "";

  (list || []).slice(0, 5).forEach((x) => {
    const row = document.createElement("div");
    row.className = "trow";
    row.innerHTML = `
      <div class="tcell">${escapeHtml(x.service)}</div>
      <div class="tcell">${escapeHtml(x.workshop)}</div>
      <div class="tcell">${escapeHtml(x.user)}</div>
      <div class="tcell">${badge(x.status)}</div>
    `;
    root.appendChild(row);
  });
}


  // ---------- Render KPIs + minis ----------
  async function renderAll() {
  const m = await api("/admin/metrics");

  $("kpiUsers").textContent = String(m.totalUsers || 0);
  $("kpiVerified").textContent = String(m.verifiedSellers || 0);
  $("kpiActiveListings").textContent = String(m.activeListings || 0);
  $("kpiPayments").textContent = String(m.paymentsRecorded || 0);

  $("avActive").textContent = String(m.avActive || 0);
  $("avExpired").textContent = String(m.avExpired || 0);
  $("avPlans").textContent = String(m.avPlans || 0);

  $("vmSellers").textContent = String(m.vmSellers || 0);
$("vmAvailable").textContent = String(m.vmAvailable || 0);
  $("vmSold").textContent = String(m.vmSold || 0);

  $("wsSellers").textContent = String(m.wsSellers || 0);
  $("wsBookings").textContent = String(m.wsBookings || 0);
  $("wsItems").textContent = String(m.wsItems || 0);
$("vmAvailable") && ($("vmAvailable").textContent = String(m.vmAvailable || 0));


  // tables:
  const subs = await api("/admin/records/subscriptions?limit=5");
  const sales = await api("/admin/records/vehicle-sales?limit=5");
  const bookings = await api("/admin/records/bookings?limit=5");

  renderSubscriptions(subs);
  renderSales(sales);
  renderBookings(bookings);
}


  // ---------- Events ----------
  function bind() {
    $("btnRefreshSubs")?.addEventListener("click", async () => {
  try {
    const subs = await api("/admin/records/subscriptions?limit=5");
    renderSubscriptions(subs);
    showToast("Subscriptions updated", "ok");
  } catch {
    showToast("Failed to load subscriptions", "bad");
  }
});

  $("btnRefreshSales")?.addEventListener("click", async () => {
  try {
    const sales = await api("/admin/records/vehicle-sales?limit=5");
    renderSales(sales);
    showToast("Sales updated", "ok");
  } catch (e) {
    showToast("Failed to load sales", "bad");
  }
});




    $("btnRefreshBookings")?.addEventListener("click", async () => {
  const bookings = await api("/admin/records/bookings?limit=5");
  renderBookings(bookings);
  showToast("Bookings updated", "ok");
});


    $("btnResetData")?.addEventListener("click", () => {
      renderAll();
      showToast("View reset", "ok");
    });

    $("btnQuickReview")?.addEventListener("click", () => {
      const m = compute();
      const msg = `Pending: ${m.pendingSellers} sellers • Active: ${m.avActive} subscriptions • Sold: ${m.soldListings} vehicles`;
      showToast(msg, "ok");
    });

    // Optional: logout just redirects (no extra logic)
    $("btnLogout")?.addEventListener("click", () => {
      showToast("Logging out...", "ok");
    });
  }

  // ---------- Init ----------
  renderAll();
  bind();
})();
