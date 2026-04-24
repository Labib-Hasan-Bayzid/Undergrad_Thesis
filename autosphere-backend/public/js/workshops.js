(function () {
  const $ = (id) => document.getElementById(id);
const role = localStorage.getItem("user_role");

  // ---------- Data ----------
  // ---------- Data ----------
//
// ================== PAYMENTS (Stripe + SSLCommerz) ==================
const API_BASE = window.location.origin; // since frontend is served by Nest on :5001

async function startPayment({ provider, mfsProvider, source, items }) {
  const endpoint =
    provider === "card"
      ? `${API_BASE}/payments/stripe/checkout`
      : `${API_BASE}/payments/mfs/sslcz/init`;

  const payload = { source, items };

  // only for SSLCommerz MFS selection (bkash/nagad/rocket)
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


  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Payment init failed");

  if (!data?.url) throw new Error("No payment URL returned from server");
  window.location.href = data.url; // redirect to Stripe or SSLCommerz hosted page
}
// ================================================================

//

// these will be filled from DB
let services = [];
let parts = [];

async function loadRealWorkshopsData() {
  const res = await fetch(`${API_BASE}/services`);
  if (!res.ok) throw new Error("Failed to load services from server");
  const data = await res.json();

  const normalize = (x) => ({
    id: x.id,
    mode: x.category, // "service" | "part"
    title: x.title,
    tag: x.category === "service" ? (x.serviceType || "service") : (x.partCategory || "part"),
    vehicle: x.vehicleSupport || "car", // "car" | "bike" | "both"
    price: Number(x.price || 0),
    city: x.city || "Dhaka",
    provider: x.category === "service" ? "Service Seller" : "Parts Seller", // until workshop profiles
    phone: x.phone || "",
    location: x.location || "",
    desc: x.description || "",
    images: Array.isArray(x.imageUrls)
      ? x.imageUrls.map((u) => `${API_BASE}${u}`)
      : (x.coverImageUrl ? [`${API_BASE}${x.coverImageUrl}`] : []),
    recommended: 90, // keep your UI compatible
  });

  const all = Array.isArray(data) ? data.map(normalize) : [];

  services = all.filter((x) => x.mode === "service");
  parts = all.filter((x) => x.mode === "part");
}


  let mode = "service"; // service | part
  let items = [...services];

  // ---------- Elements ----------
  const tabServices = $("tabServices");
  const tabParts = $("tabParts");
  const contentTitle = $("contentTitle");

  const searchInput = $("searchInput");
  const btnClearSearch = $("btnClearSearch");

  const vehicleFilter = $("vehicleFilter");
  const cityFilter = $("cityFilter");
  const sortBy = $("sortBy");
  const quickFilter = $("quickFilter");

  const activeChips = $("activeChips");

  const gridViewBtn = $("gridViewBtn");
  const listViewBtn = $("listViewBtn");
  const itemsGrid = $("itemsGrid");

  const resultCount = $("resultCount");
  const emptyState = $("emptyState");
  const btnClearAll = $("btnClearAll");

  // NEW: View All Workshops button
  const btnViewAllWorkshops = $("btnViewAllWorkshops");

  // Details modal
  const detailsModal = $("detailsModal");
  const detailsTitle = $("detailsTitle");
  const detailsSub = $("detailsSub");
  const detailsMedia = $("detailsMedia");
  const detailsPills = $("detailsPills");
  const dProvider = $("dProvider");
  const dPhone = $("dPhone");
  const dLocation = $("dLocation");
  const dPrice = $("dPrice");
  const dDesc = $("dDesc");
  const btnCallProvider = $("btnCallProvider");
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

  let selectedItem = null;

  // ---------- Payment store ----------
  const PAY_KEY = "workshops_payments_v1";
  function loadPayments() {
    try {
      const raw = localStorage.getItem(PAY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  function savePayments(arr) {
    localStorage.setItem(PAY_KEY, JSON.stringify(arr));
  }

  // ---------- Helpers ----------
  function formatBDT(n) {
    const s = Math.round(Number(n || 0)).toString();
    const withComma = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `BDT ${withComma}`;
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
  function showToast(msg, type="ok") {
    toast.textContent = msg;
    toast.classList.remove("ok", "bad", "show");
    toast.classList.add(type === "ok" ? "ok" : "bad", "show");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function escapeAttr(str) {
    return escapeHtml(str).replaceAll("`", "&#096;");
  }
  function capitalize(s) {
    const x = String(s || "");
    return x ? x[0].toUpperCase() + x.slice(1) : x;
  }
  function cryptoId() {
    return "TX-" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function tagLabel(tag) {
    const map = {
      oil: "Oil Change",
      brake: "Brake",
      battery: "Battery",
      tire: "Tire",
      diagnostic: "Diagnostics"
    };
    return map[tag] || "Service";
  }

  // ---------- Mode switch ----------
  function setMode(next) {
    mode = next;
    items = next === "service" ? [...services] : [...parts];

    tabServices.classList.toggle("is-active", next === "service");
    tabParts.classList.toggle("is-active", next === "part");
    contentTitle.textContent = next === "service" ? "Services" : "Spare Parts";

    quickFilter.value = "all";
    applyFilters();
  }

  // ---------- Filters ----------
  function getFilters() {
    const q = (searchInput.value || "").trim().toLowerCase();
    return {
      q,
      vehicle: vehicleFilter.value,
      city: cityFilter.value,
      sort: sortBy.value,
      quick: quickFilter.value
    };
  }

  function applyFilters() {
    const { q, vehicle, city, sort, quick } = getFilters();

    let out = items.filter((x) => {
      const matchesQ = !q ? true : (
        `${x.title} ${x.provider} ${x.location} ${x.city} ${x.vehicle} ${x.tag}`
      ).toLowerCase().includes(q);

const matchesVehicle =
  vehicle === "all" ? true : (x.vehicle === vehicle || x.vehicle === "both");
      const matchesCity = city === "all" ? true : x.city === city;
      const matchesQuick = quick === "all" ? true : x.tag === quick;

      return matchesQ && matchesVehicle && matchesCity && matchesQuick;
    });

    out.sort((a, b) => {
      if (sort === "recommended") return (b.recommended || 0) - (a.recommended || 0);
      if (sort === "priceLow") return a.price - b.price;
      if (sort === "priceHigh") return b.price - a.price;
      return 0;
    });

    renderChips();
    renderItems(out);
  }

  function renderChips() {
    const { q, vehicle, city, quick } = getFilters();
    const chips = [];

    if (q) chips.push({ key: "q", label: `Search: "${q}"` });
    if (vehicle !== "all") chips.push({ key: "vehicle", label: `Vehicle: ${vehicle}` });
    if (city !== "all") chips.push({ key: "city", label: `City: ${city}` });
    if (quick !== "all") chips.push({ key: "quick", label: `Filter: ${tagLabel(quick)}` });

    activeChips.innerHTML = "";
    chips.forEach((c) => {
      const el = document.createElement("div");
      el.className = "chip";
      el.innerHTML = `
        <span>${escapeHtml(c.label)}</span>
        <button type="button" aria-label="Remove filter">×</button>
      `;
      el.querySelector("button").addEventListener("click", () => {
        if (c.key === "q") searchInput.value = "";
        if (c.key === "vehicle") vehicleFilter.value = "all";
        if (c.key === "city") cityFilter.value = "all";
        if (c.key === "quick") quickFilter.value = "all";
        applyFilters();
      });
      activeChips.appendChild(el);
    });
  }

  // ---------- View toggle ----------
  function setViewMode(mode) {
    if (mode === "grid") {
      itemsGrid.classList.remove("is-list");
      gridViewBtn.classList.add("is-active");
      listViewBtn.classList.remove("is-active");
      gridViewBtn.setAttribute("aria-pressed", "true");
      listViewBtn.setAttribute("aria-pressed", "false");
    } else {
      itemsGrid.classList.add("is-list");
      listViewBtn.classList.add("is-active");
      gridViewBtn.classList.remove("is-active");
      listViewBtn.setAttribute("aria-pressed", "true");
      gridViewBtn.setAttribute("aria-pressed", "false");
    }
  }

  // ---------- Render items ----------
  function renderItems(list) {
    itemsGrid.innerHTML = "";
    resultCount.textContent = `${list.length} result${list.length === 1 ? "" : "s"}`;

    if (list.length === 0) {
      emptyState.hidden = false;
      itemsGrid.hidden = true;
      return;
    }

    emptyState.hidden = true;
    itemsGrid.hidden = false;

    list.forEach((x) => {
      const cover = x.images && x.images[0] ? x.images[0] : "";
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <div class="card-media">
          ${cover ? `<img src="${cover}" alt="${escapeAttr(x.title)}" loading="lazy" />` : ""}
          <div class="badge">
            <span class="pill type">${x.vehicle.toUpperCase()}</span>
            <span class="pill tag">${escapeHtml(tagLabel(x.tag))}</span>
          </div>
        </div>

        <div class="card-body">
          <div>
            <h3 class="card-title">${escapeHtml(x.title)}</h3>
            <p class="card-sub">${escapeHtml(x.provider)} • ${escapeHtml(x.city)}</p>
          </div>

          <div class="row">
            <div class="price">${formatBDT(x.price)}</div>
            <div class="small">${escapeHtml(x.id)}</div>
          </div>

          <div class="card-actions">
            <button class="btn btn-ghost" data-action="view" data-id="${escapeAttr(x.id)}" type="button">View</button>
${role === "user" ? 
`<button class="btn btn-primary" data-action="pay" data-id="${escapeAttr(x.id)}" type="button">Pay Now</button>` 
: ""}
          </div>
        </div>
      `;
      itemsGrid.appendChild(card);
    });
  }

  // ---------- Details ----------
  function openDetailsById(id) {
    const x = items.find((a) => a.id === id);
    if (!x) return;

    selectedItem = x;

    detailsTitle.textContent = x.title;
    detailsSub.textContent = `${capitalize(x.vehicle)} • ${tagLabel(x.tag)} • ${x.id}`;

    dProvider.textContent = x.provider;
    dPhone.textContent = x.phone;
    dLocation.textContent = x.location;
    dPrice.textContent = formatBDT(x.price);
    dDesc.textContent = x.desc;

    btnCallProvider.textContent = "Call Provider";
    btnCallProvider.setAttribute("href", `tel:${x.phone.replace(/\s/g, "")}`);

    detailsMedia.innerHTML = "";
    const imgs = (x.images || []).slice(0, 4);
    if (imgs.length === 0) {
      const tile = document.createElement("div");
      tile.className = "media-tile";
      tile.innerHTML = `<div style="padding:14px;color:rgba(255,255,255,0.65);font-size:13px;">No images</div>`;
      detailsMedia.appendChild(tile);
    } else {
      imgs.forEach((src) => {
        const tile = document.createElement("div");
        tile.className = "media-tile";
        tile.innerHTML = `<img src="${src}" alt="${escapeAttr(x.title)}" loading="lazy" />`;
        detailsMedia.appendChild(tile);
      });
    }

    detailsPills.innerHTML = "";
    const pills = [
      { text: x.vehicle.toUpperCase(), cls: "pill type" },
      { text: tagLabel(x.tag), cls: "pill tag" }
    ];
    pills.forEach((p) => {
      const span = document.createElement("span");
      span.className = p.cls;
      span.textContent = p.text;
      detailsPills.appendChild(span);
    });

    openModal(detailsModal);
  }

  // ---------- Payment ----------
  function openPaymentForItem(x) {
    selectedItem = x;
    payFor.textContent = `${x.title} (${x.id})`;
    payAmount.textContent = formatBDT(x.price);
    if (payRef) payRef.value = "";
if (receiptFile) receiptFile.value = "";
    openModal(paymentModal);
  }
async function proceedPayment() {
  if (!selectedItem) return showToast("No item selected.", "bad");

  const provider = "mfs";
const mfsProvider = "bkash";
  try {
    await startPayment({
      provider,
      mfsProvider,
      source: "workshops",
      items: [{ kind: selectedItem.mode, id: selectedItem.id, qty: 1 }],
    });
  } catch (e) {
    showToast(e.message || "Payment failed", "bad");
  }
  finally {
    // ✅ ensures 2nd time you can click Pay again
    btnProceedPay.disabled = false;
  }
}



  function saveReceipt() {
    const method = document.querySelector('input[name="payMethod"]:checked')?.value || "bkash";
    const ref = (payRef.value || "").trim();
    const file = receiptFile.files && receiptFile.files[0] ? receiptFile.files[0] : null;

    if (!selectedItem) return showToast("No item selected.", "bad");
    if (!ref) return showToast("Enter Payment Reference ID.", "bad");
    if (!file) return showToast("Select a receipt file.", "bad");

    const tx = loadPayments();
    tx.unshift({
      id: cryptoId(),
      itemId: selectedItem.id,
      title: selectedItem.title,
      amount: selectedItem.price,
      method,
      ref,
      fileName: file.name,
      savedAt: Date.now()
    });
    savePayments(tx);

    showToast("Receipt saved successfully.", "ok");
  }

  // ---------- Events ----------
  tabServices.addEventListener("click", () => setMode("service"));
  tabParts.addEventListener("click", () => setMode("part"));

  [searchInput, vehicleFilter, cityFilter, sortBy, quickFilter].forEach((el) => {
    el.addEventListener("input", applyFilters);
    el.addEventListener("change", applyFilters);
  });

  btnClearSearch.addEventListener("click", () => {
    searchInput.value = "";
    applyFilters();
  });

  btnClearAll.addEventListener("click", () => {
    searchInput.value = "";
    vehicleFilter.value = "all";
    cityFilter.value = "all";
    sortBy.value = "recommended";
    quickFilter.value = "all";
    applyFilters();
  });

  gridViewBtn.addEventListener("click", () => setViewMode("grid"));
  listViewBtn.addEventListener("click", () => setViewMode("list"));

  btnPayNowFromDetails.addEventListener("click", () => {
    if (!selectedItem) return;
    closeModal(detailsModal);
    openPaymentForItem(selectedItem);
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
        const x = items.find((a) => a.id === id);
        if (x) openPaymentForItem(x);
      }
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    [detailsModal, paymentModal].forEach((m) => {
      if (m.classList.contains("is-open")) closeModal(m);
    });
  });

  // ✅ NEW: Ensure the button always redirects (even if later changed to <button>)
  if (btnViewAllWorkshops) {
    btnViewAllWorkshops.addEventListener("click", (e) => {
      // If it is an <a>, let it work normally
      // If later you change to <button>, this still works
      if (btnViewAllWorkshops.tagName.toLowerCase() !== "a") {
        e.preventDefault();
        window.location.href = "workshop_list.html";
      }
    });
  }

  // ---------- Init ----------
 // ---------- Init ----------
(async function init() {
  try {
    await loadRealWorkshopsData();
    setViewMode("grid");
    setMode("service");
  } catch (e) {
    console.error(e);
    setViewMode("grid");
    setMode("service");
    // optional: showToast("Failed to load from server", "bad");
  }
  const btnHistory = document.getElementById("btnBuyingHistory");
if (btnHistory && role === "user") {
  btnHistory.style.display = "inline-flex";
}

})();

})();
