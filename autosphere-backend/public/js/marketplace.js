(function () {
  const $ = (id) => document.getElementById(id);

  // ============================================================
  // API + PAYMENTS (Stripe + SSLCommerz)
  // ============================================================
  const API_BASE = window.location.origin; // IMPORTANT: works for localhost + ngrok

  async function api(path) {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const body = ct.includes("application/json") ? await res.json().catch(() => ({})) : null;

    if (!res.ok) {
      const msg = body?.message || body?.error || "Request failed";
      throw new Error(msg);
    }
    return body ?? {};
  }

  async function startPayment({ provider, mfsProvider, source, items }) {
  const endpoint =
    provider === "card"
      ? `${API_BASE}/payments/stripe/checkout`
      : `${API_BASE}/payments/mfs/sslcz/init`;

  const payload = { source, items };
  if (provider === "mfs") payload.mfsProvider = mfsProvider || "bkash";

  const token = localStorage.getItem("access_token");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; }
  catch { data = { message: text }; }

  if (!res.ok) {
    console.error("Payment init failed response:", { status: res.status, data });
    throw new Error(data?.message || "Payment init failed");
  }

  if (!data?.url) throw new Error("No payment URL returned from server");

  console.log("Redirecting to:", data.url);
  window.location.href = data.url;
}

  // If user returns from gateway using Back button, bfcache may restore disabled button state
  window.addEventListener("pageshow", () => {
    const btn = document.getElementById("btnProceedPay");
    if (btn) btn.disabled = false;
  });

  // ============================================================
  // DATA LOAD (Vehicles + Services/Parts)
  // ============================================================
  let listings = [];

  async function loadMarketplace() {
    const [vehicles, services] = await Promise.all([api("/vehicles"), api("/services")]);

    const vehicleItems = (Array.isArray(vehicles) ? vehicles : []).map((v) => ({
      id: v.id,
      type: v.vehicleType, // car | bike
      condition: v.condition,
      title: v.title,
      price: Number(v.price || 0),
      location: v.city,
      seller: "Vehicle Seller",
      phone: v.phone,
      desc: v.description || "",
      images: (v.imageUrls || []).map((u) => `${API_BASE}${u}`),
      createdAt: new Date(v.createdAt).getTime(),
      source: "vehicle", // IMPORTANT
    }));

    const serviceItems = (Array.isArray(services) ? services : []).map((s) => ({
      id: s.id,
      type: s.vehicleSupport === "both" ? "car" : s.vehicleSupport,
      condition: s.category === "part" ? s.partCondition || "used" : "service",
      title: s.title,
      price: Number(s.price || 0),
      location: s.city,
      seller: s.category === "service" ? "Service Provider" : "Parts Seller",
      phone: s.phone,
      desc: s.description || "",
      images: (s.imageUrls || []).map((u) => `${API_BASE}${u}`),
      createdAt: new Date(s.createdAt).getTime(),
      source: s.category, // "service" | "part"
    }));

listings = [...vehicleItems]; // ONLY vehicles
  }

  // ============================================================
  // UI ELEMENTS
  // ============================================================
  const listingGrid = $("listingGrid");
  const emptyState = $("emptyState");
  const resultCount = $("resultCount");

  const searchInput = $("searchInput");
  const btnClearSearch = $("btnClearSearch");

  const typeFilter = $("typeFilter");
  const conditionFilter = $("conditionFilter");
  const priceFilter = $("priceFilter");
  const sortBy = $("sortBy");
  const activeChips = $("activeChips");

  const gridViewBtn = $("gridViewBtn");
  const listViewBtn = $("listViewBtn");

  const btnEmptyClear = $("btnEmptyClear");

  // Details modal
  const detailsModal = $("detailsModal");
  const detailsTitle = $("detailsTitle");
  const detailsSub = $("detailsSub");
  const detailsMedia = $("detailsMedia");
  const detailsPills = $("detailsPills");
  const dSeller = $("dSeller");
  const dPhone = $("dPhone");
  const dLocation = $("dLocation");
  const dPrice = $("dPrice");
  const dDesc = $("dDesc");
  const btnCallSeller = $("btnCallSeller");
  const btnPayNowFromDetails = $("btnPayNowFromDetails");

  // Payment modal
  const paymentModal = $("paymentModal");
  const payFor = $("payFor");
  const payAmount = $("payAmount");
  const btnProceedPay = $("btnProceedPay");
  const payRef = $("payRef");
  const receiptFile = $("receiptFile");
  const btnSaveReceipt = $("btnSaveReceipt");
  const toast = $("toast");

  // State
  let selectedListing = null;
  let viewMode = "grid";

  // ============================================================
  // INIT
  // ============================================================
  init();
const role = localStorage.getItem("user_role");

  async function init() {
    try {
      await loadMarketplace();
      applyFilters();
    } catch (e) {
      showToast(e.message || "Failed to load marketplace", "bad");
    }

    [searchInput, typeFilter, conditionFilter, priceFilter, sortBy].forEach((el) => {
      el.addEventListener("input", applyFilters);
      el.addEventListener("change", applyFilters);
    });

    const btnHistory = document.getElementById("btnBuyingHistory");
if (btnHistory && role === "user") {
  btnHistory.style.display = "inline-flex";
}


    btnClearSearch.addEventListener("click", () => {
      searchInput.value = "";
      applyFilters();
    });

    btnEmptyClear.addEventListener("click", () => {
      searchInput.value = "";
      typeFilter.value = "all";
      conditionFilter.value = "all";
      priceFilter.value = "all";
      sortBy.value = "recommended";
      applyFilters();
    });

    gridViewBtn.addEventListener("click", () => setViewMode("grid"));
    listViewBtn.addEventListener("click", () => setViewMode("list"));

    btnPayNowFromDetails.addEventListener("click", () => {
      if (!selectedListing) return;
      closeModal(detailsModal);
      openPaymentForListing(selectedListing);
    });

    btnProceedPay.addEventListener("click", proceedPayment);
btnSaveReceipt?.addEventListener("click", saveReceipt);
    document.addEventListener("click", (e) => {
      const t = e.target;

      if (t?.dataset?.close) {
        const modal = $(t.dataset.close);
        if (modal) closeModal(modal);
        return;
      }

      const btn = t.closest && t.closest("button[data-action]");
      if (btn) {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === "view") openDetailsById(id);
        if (action === "pay") {
          const x = listings.find((a) => a.id === id);
          if (x) openPaymentForListing(x);
        }
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      [detailsModal, paymentModal].forEach((m) => {
        if (m?.classList?.contains("is-open")) closeModal(m);
      });
    });
  }

  // ============================================================
  // FILTERS + RENDER
  // ============================================================
  function applyFilters() {
    let arr = [...listings];
    const q = (searchInput.value || "").trim().toLowerCase();

    if (q) {
      arr = arr.filter((x) => {
        const hay = `${x.title} ${x.location} ${x.type} ${x.condition}`.toLowerCase();
        return hay.includes(q);
      });
    }

    const t = typeFilter.value;
    if (t !== "all") arr = arr.filter((x) => x.type === t);

    const c = conditionFilter.value;
    if (c !== "all") arr = arr.filter((x) => x.condition === c);

    const p = priceFilter.value;
    if (p !== "all") {
      arr = arr.filter((x) => {
        const price = Number(x.price || 0);
        if (p === "lt50k") return price < 50000;
        if (p === "50k_200k") return price >= 50000 && price <= 200000;
        if (p === "200k_1m") return price > 200000 && price <= 1000000;
        if (p === "gt1m") return price > 1000000;
        return true;
      });
    }

    const s = sortBy.value;
    if (s === "newest") arr.sort((a, b) => b.createdAt - a.createdAt);
    if (s === "price_low") arr.sort((a, b) => Number(a.price) - Number(b.price));
    if (s === "price_high") arr.sort((a, b) => Number(b.price) - Number(a.price));

    renderListings(arr);
    renderChips();
  }

  function renderListings(arr) {
    listingGrid.innerHTML = "";
    resultCount.textContent = `${arr.length} result${arr.length === 1 ? "" : "s"}`;

    if (!arr.length) {
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    arr.forEach((x) => {
      const card = document.createElement("div");
      card.className = `card ${viewMode === "list" ? "is-list" : ""}`;

      const img = (x.images && x.images[0]) ? x.images[0] : "";

      card.innerHTML = `
        <div class="card-media">${img ? `<img src="${img}" alt="">` : `<div class="ph"></div>`}</div>
        <div class="card-body">
          <h4 class="card-title">${escapeHtml(x.title)}</h4>
          <div class="card-sub">${escapeHtml(x.location || "")} • ${escapeHtml(String(x.type || "").toUpperCase())}</div>
          <div class="card-row">
            <div class="price">${formatBDT(x.price)}</div>
            <div class="actions">
              <button data-action="view" data-id="${x.id}">View</button>
${role === "user" ? `<button data-action="pay" data-id="${x.id}">Pay</button>` : ""}
            </div>
          </div>
        </div>
      `;
      listingGrid.appendChild(card);
    });
  }

  function renderChips() {
    activeChips.innerHTML = "";

    const chips = [];
    if (searchInput.value) chips.push(`Search: ${searchInput.value}`);
    if (typeFilter.value !== "all") chips.push(`Type: ${typeFilter.value}`);
    if (conditionFilter.value !== "all") chips.push(`Condition: ${conditionFilter.value}`);
    if (priceFilter.value !== "all") chips.push(`Price: ${priceFilter.value}`);
    if (sortBy.value !== "recommended") chips.push(`Sort: ${sortBy.value}`);

    chips.forEach((c) => {
      const span = document.createElement("span");
      span.className = "chip";
      span.textContent = c;
      activeChips.appendChild(span);
    });
  }

  function setViewMode(m) {
    viewMode = m;
    gridViewBtn.classList.toggle("is-active", m === "grid");
    listViewBtn.classList.toggle("is-active", m === "list");
     listingGrid.classList.toggle("is-list", m === "list");
    applyFilters();
  }

  // ============================================================
  // DETAILS MODAL
  // ============================================================
  function openDetailsById(id) {
    const x = listings.find((a) => a.id === id);
    if (!x) return;

    selectedListing = x;

    detailsTitle.textContent = x.title;
    detailsSub.textContent = `${x.location || ""} • ${String(x.type || "").toUpperCase()}`;

    dSeller.textContent = x.seller || "-";
    dPhone.textContent = x.phone || "-";
    dLocation.textContent = x.location || "-";
    dPrice.textContent = formatBDT(x.price);
    dDesc.textContent = x.desc || "-";

    btnCallSeller.onclick = () => {
      if (!x.phone) return;
      window.location.href = `tel:${x.phone}`;
    };

    detailsMedia.innerHTML = "";
    (x.images || []).slice(0, 6).forEach((src) => {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      detailsMedia.appendChild(img);
    });

    detailsPills.innerHTML = "";
    [
      { text: (x.source || "").toUpperCase(), cls: "pill type" },
      { text: capitalize(x.condition), cls: "pill" },
    ].forEach((p) => {
      const span = document.createElement("span");
      span.className = p.cls;
      span.textContent = p.text;
      detailsPills.appendChild(span);
    });

    openModal(detailsModal);
  }

  // ============================================================
  // PAYMENT MODAL + REDIRECT
  // ============================================================
  function openPaymentForListing(x) {
    selectedListing = x;
    payFor.textContent = `${x.title} (${x.id})`;
    payAmount.textContent = formatBDT(x.price);

    if (payRef) payRef.value = "";
if (receiptFile) receiptFile.value = "";

    // IMPORTANT: If user previously went to gateway and came back, ensure this isn't stuck disabled
    btnProceedPay.disabled = false;

    openModal(paymentModal);
  }

  async function proceedPayment() {
  try {
    console.log("Proceed clicked ✅", { selectedListing });

    if (!selectedListing) {
      showToast("No listing selected.", "bad");
      return;
    }

    const price = Number(selectedListing.price || 0);
    if (!Number.isFinite(price) || price <= 0) {
      showToast("Invalid price for this item. Please reload the page.", "bad");
      return;
    }

    // ✅ IMPORTANT: backend expects kind = "vehicle" for VehicleEntity
    const kind = (selectedListing.source === "vehicle") ? "vehicle" : selectedListing.source;

    const token = localStorage.getItem("access_token");
    if (!token) {
      showToast("You are not logged in. Please login again.", "bad");
      return;
    }

    btnProceedPay.disabled = true;

    console.log("Starting payment payload ✅", {
      provider: "mfs",
      mfsProvider: "bkash",
      source: "marketplace",
      items: [{ kind, id: selectedListing.id, qty: 1 }],
    });

    await startPayment({
      provider: "mfs",
      mfsProvider: "bkash",
      source: "marketplace",
      items: [{ kind, id: selectedListing.id, qty: 1 }],
    });

  } catch (e) {
    console.error("Marketplace proceedPayment error ❌", e);
    showToast(e?.message || "Payment init failed", "bad");
    btnProceedPay.disabled = false;
  }
}

  // ============================================================
  // LOCAL RECEIPT SAVE (unchanged)
  // ============================================================
  const PAY_KEY = "marketplace_payments_v1";

  function loadPayments() {
    try {
      return JSON.parse(localStorage.getItem(PAY_KEY) || "[]");
    } catch {
      return [];
    }
  }
  function savePayments(arr) {
    localStorage.setItem(PAY_KEY, JSON.stringify(arr || []));
  }

  function saveReceipt() {
    const method =
      document.querySelector('input[name="payMethod"]:checked')?.value || "bkash";
    const ref = (payRef.value || "").trim();
    const file = receiptFile.files && receiptFile.files[0] ? receiptFile.files[0] : null;

    if (!selectedListing) return showToast("No listing selected.", "bad");
    if (!ref) return showToast("Enter Payment Reference ID.", "bad");
    if (!file) return showToast("Select a receipt file.", "bad");

    const payments = loadPayments();
    payments.unshift({
      id: cryptoId(),
      listingId: selectedListing.id,
      title: selectedListing.title,
      amount: Number(selectedListing.price || 0),
      method,
      ref,
      fileName: file.name,
      savedAt: Date.now(),
    });
    savePayments(payments);

    showToast("Receipt saved successfully.", "ok");
  }

  // ============================================================
  // MODAL HELPERS
  // ============================================================
  function openModal(el) {
    if (!el) return;
    el.classList.add("is-open");
    el.setAttribute("aria-hidden", "false");
  }
  function closeModal(el) {
    if (!el) return;
    el.classList.remove("is-open");
    el.setAttribute("aria-hidden", "true");

    // IMPORTANT: always re-enable pay button when closing payment modal
    if (el === paymentModal) btnProceedPay.disabled = false;
  }

  // ============================================================
  // UTIL
  // ============================================================
  function showToast(message, type) {
    toast.textContent = message;
    toast.classList.remove("ok", "bad", "show");
    toast.classList.add(type === "ok" ? "ok" : "bad", "show");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function formatBDT(n) {
    const s = Math.round(Number(n || 0)).toString();
    const withComma = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `BDT ${withComma}`;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cryptoId() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function capitalize(s) {
    s = String(s || "");
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  }
})();
