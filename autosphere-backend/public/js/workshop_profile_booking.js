(function () {
  const $ = (id) => document.getElementById(id);
//
const role = localStorage.getItem("user_role");

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
async function api(path, { method = "GET", body } = {}) {
  const token = localStorage.getItem("access_token");

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const ct = res.headers.get("content-type") || "";
  const text = await res.text();

  let data = null;
  try { data = text ? JSON.parse(text) : null; }
  catch { data = { message: text }; }

  if (!res.ok) throw new Error(data?.message || "Request failed");
  if (!ct.includes("application/json")) throw new Error("API did not return JSON");

  return data;
}

//



function supportLabel(v) {
  if (v === "both") return "Car & Bike";
  if (v === "car") return "Car";
  if (v === "bike") return "Bike";
  return "Car & Bike";
}

function iconForServiceType(t) {
  const s = (t || "").toLowerCase();
  if (s.includes("maintenance")) return "🛠️";
  if (s.includes("repair")) return "🔧";
  if (s.includes("diagnostic")) return "🩺";
  if (s.includes("wash")) return "🧼";
  return "🔧";
}



  const RECEIPTS_KEY = "workshop_receipts_v1";
  const BOOKING_KEY = "workshop_bookings_v1";

  // Workshop UI
  const wsName = $("wsName");
  const wsPhone = $("wsPhone");
  const wsLocation = $("wsLocation");
  const wsAbout = $("wsAbout");
  const wsHours = $("wsHours");
  const wsBadge = $("wsBadge");

  const statServices = $("statServices");
  const statRating = $("statRating");
  const statBookings = $("statBookings");

  // Services list
  const svcList = $("svcList");
  const svcEmpty = $("svcEmpty");
  const svcSearch = $("svcSearch");
  const btnClearSearch = $("btnClearSearch");

  // Booking form
  const selectedPill = $("selectedPill");
  const selectedService = $("selectedService");
  const custName = $("custName");
  const custPhone = $("custPhone");
  const vehType = $("vehType");
  const vehInfo = $("vehInfo");
  const bookDate = $("bookDate");
  const bookTime = $("bookTime");
  const note = $("note");
  const totalAmount = $("totalAmount");
  const btnReset = $("btnReset");
  const btnPay = $("btnPay");

  // Modal
  const payModal = $("payModal");
  const btnCloseModal = $("btnCloseModal");
  const modalAmount = $("modalAmount");
  const btnConfirmPay = $("btnConfirmPay");
  //
  const payFor = $("payFor");
const btnCancelPay = $("btnCancelPay");

  // Receipts
  const rcCount = $("rcCount");
  const rcTbody = $("rcTbody");
  const rcEmpty = $("rcEmpty");
  const btnClearReceipts = $("btnClearReceipts");

  // Toast
  const toast = $("toast");

  // State
  let workshop = {
    id: null,
    name: "Workshop",
    phone: "+8801XXXXXXXXX",
    location: "Dhaka",
    about: "Reliable service and spare parts support.",
    hours: "10:00 AM – 9:00 PM",
    badge: "Verified Workshop",
    rating: 4.8
  };

  let services = []; // will be loaded from DB


  let selected = null;
  let payMethod = "bkash";

  // ---------- Init ----------
  init();

  function init() {
    // Time slots
    fillTimeSlots();

    // Date min = today
    bookDate.min = toISODate(new Date());
    bookDate.value = toISODate(new Date(Date.now() + 86400000)); // tomorrow

    // Workshop load (optional)
   loadWorkshopFromQueryOrCache();
applyWorkshopUI();

// ✅ load real listings for this workshop (seller) from DB
loadServicesFromDb()
  .then(() => {
    applyWorkshopUI();   // refresh stats count
    renderServices();    // render the loaded services
  })
  .catch(() => {
    services = [];
    applyWorkshopUI();
    renderServices();
    showToast("Failed to load workshop services from server.", "bad");
  });


    // Search
    svcSearch.addEventListener("input", renderServices);
    btnClearSearch.addEventListener("click", () => {
      svcSearch.value = "";
      renderServices();
    });
    //
    const btnHistory = document.getElementById("btnBuyingHistory");
if (btnHistory && role === "user") {
  btnHistory.style.display = "inline-flex";
}


    // Booking actions
    btnReset.addEventListener("click", clearForm);
if (role === "user") {
  btnPay.addEventListener("click", openPay);
} else {
  btnPay.style.display = "none";
}

    // Modal actions
    btnCloseModal?.addEventListener("click", closePay);
payModal?.addEventListener("click", (e) => { if (e.target === payModal) closePay(); });

btnConfirmPay?.addEventListener("click", confirmPay);
btnCancelPay?.addEventListener("click", closePay);

    // Card formatting

    // Receipts
    btnClearReceipts.addEventListener("click", () => {
      localStorage.removeItem(RECEIPTS_KEY);
      renderReceipts();
      showToast("Receipts cleared.", "ok");
    });

    renderReceipts();
    updateTotals();
  }

  // ---------- Workshop data ----------
//
async function loadServicesFromDb() {
  const params = new URLSearchParams(location.search);
  const sellerId = params.get("workshop_id");
  if (!sellerId) {
    services = [];
    return;
  }

  // Backend endpoint you added
  const data = await api(`/services/workshops/${sellerId}/listings`);

  const arr = Array.isArray(data) ? data : [];

  services = arr.map((x) => {
    // x.category: "service" | "part"
    if (x.category === "service") {
      return {
        id: x.id,
        mode: "service",
        title: x.title,
        type: x.serviceType || "Service",
        support: supportLabel(x.vehicleSupport),
        price: Number(x.price || 0),
        duration: "30–60 min",
        icon: iconForServiceType(x.serviceType),
        

      };
    }

    // part listing: show as selectable too (optional, but useful)
    return {
      id: x.id,
      mode: "part",
      title: x.title,
      type: x.partCategory || "Spare Part",
      support: supportLabel(x.vehicleSupport),
      price: Number(x.price || 0),
      duration: `Stock: ${x.stock ?? 0}`,
      icon: "🧩",
    };
  });
}
    
  //
  function loadWorkshopFromQueryOrCache() {
    const params = new URLSearchParams(location.search);
    const id = params.get("workshop_id");
    const cacheKey = id ? `workshop_profile_cache_${id}` : "workshop_profile_cache_default";

    const cached = safeJson(localStorage.getItem(cacheKey));
    if (cached) workshop = normalizeWorkshop(cached);

    // If you fetch from your API, keep same IDs in UI and it will render automatically
    // (No extra words in UI)
  }

  function normalizeWorkshop(d) {
    return {
      id: d?.id ?? d?.workshop_id ?? d?.workshopId ?? null,
      name: d?.name ?? d?.shop_name ?? d?.shopName ?? "Workshop",
      phone: d?.phone ?? d?.contact ?? "+8801XXXXXXXXX",
      location: d?.location ?? d?.city ?? "Dhaka",
      about: d?.about ?? d?.description ?? "Reliable service and spare parts support.",
      hours: d?.hours ?? "10:00 AM – 9:00 PM",
      badge: d?.badge ?? "Verified Workshop",
      rating: Number(d?.rating ?? 4.8)
    };
  }

  function applyWorkshopUI() {
    wsName.textContent = workshop.name || "Workshop";
    wsPhone.textContent = workshop.phone || "—";
    wsLocation.textContent = workshop.location || "—";
    wsAbout.textContent = workshop.about || "—";
    wsHours.textContent = workshop.hours || "—";
    wsBadge.textContent = workshop.badge || "Verified Workshop";

    statServices.textContent = String(services.length);
    statRating.textContent = String(isFinite(workshop.rating) ? workshop.rating.toFixed(1) : "4.8");
    statBookings.textContent = String(loadBookings().length);
  }

  // ---------- Services list ----------
  function renderServices() {
    const q = (svcSearch.value || "").trim().toLowerCase();

    const list = services.filter((s) => {
      const t = `${s.title} ${s.type} ${s.support} ${s.duration}`.toLowerCase();
      return !q || t.includes(q);
    });

    svcList.innerHTML = "";

    if (list.length === 0) {
      svcEmpty.hidden = false;
      return;
    }
    svcEmpty.hidden = true;

    list.forEach((s) => {
      const el = document.createElement("div");
      el.className = "svc" + (selected && selected.id === s.id ? " is-active" : "");
      el.setAttribute("role", "button");
      el.tabIndex = 0;

      el.innerHTML = `
        <div class="svc-ic" aria-hidden="true"><span>${escapeHtml(s.icon || "🔧")}</span></div>
        <div class="svc-body">
          <h5 class="svc-title">${escapeHtml(s.title)}</h5>
          <div class="svc-sub">${escapeHtml(s.type)} • ${escapeHtml(s.support)} • ${escapeHtml(s.duration)}</div>
          <div class="svc-row">
            <div class="price">${formatBDT(s.price)}</div>
            <span class="tag">${escapeHtml(s.id)}</span>
          </div>
        </div>
      `;

      el.addEventListener("click", () => selectService(s.id));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectService(s.id);
        }
      });

      svcList.appendChild(el);
    });
  }

  function selectService(id) {
    selected = services.find((x) => x.id === id) || null;
    updateTotals();

    selectedPill.textContent = selected ? "Service selected" : "No service selected";
    selectedService.textContent = selected ? `${selected.title} • ${formatBDT(selected.price)}` : "—";

    renderServices();
  }

  function updateTotals() {
  const amt = selected ? selected.price : 0;
  totalAmount.textContent = formatBDT(amt);
  modalAmount.textContent = formatBDT(amt);

  if (payFor) {
    payFor.textContent = selected ? `${selected.title} (${selected.id})` : "—";
  }
}

  // ---------- Booking ----------
  function validateBooking() {
    if (!selected) return { ok: false, msg: "Please select a service." };

    const name = (custName.value || "").trim();
    const phone = (custPhone.value || "").trim();
    const vinfo = (vehInfo.value || "").trim();
    const date = (bookDate.value || "").trim();
    const time = (bookTime.value || "").trim();

    if (!name) return { ok: false, msg: "Your name is required." };
    if (!phone) return { ok: false, msg: "Phone is required." };
    if (!vinfo) return { ok: false, msg: "Vehicle info is required." };
    if (!date) return { ok: false, msg: "Date is required." };
    if (!time) return { ok: false, msg: "Time is required." };

    return { ok: true };
  }

  function openPay() {
    const v = validateBooking();
    if (!v.ok) return showToast(v.msg, "bad");

    payModal.classList.add("show");
    payModal.setAttribute("aria-hidden", "false");
  }

  function closePay() {
    payModal.classList.remove("show");
    payModal.setAttribute("aria-hidden", "true");
  }

  

 async function confirmPay() {
  const v = validateBooking();
  if (!v.ok) return showToast(v.msg, "bad");
  if (!selected) return showToast("Please select a service.", "bad");


  //
const params = new URLSearchParams(location.search);
const workshopId = workshop.id || params.get("workshop_id"); // ✅ fallback
const serviceId = selected?.id;



  const provider = "mfs";
  const mfsProvider = "bkash";

  btnConfirmPay.disabled = true;

  try {
    // 1️⃣ Create pending booking in DB

    

if (!workshopId) return showToast("Missing workshop id (workshop_id).", "bad");
if (!serviceId) return showToast("Missing service id. Please select a service.", "bad");
    const bookingPayload = {
  workshopId,                 // ✅ always set
  serviceId,                  // ✅ always set
  kind: selected.mode || "service",
  amount: Number(selected.price || 0),

  customerName: (custName.value || "").trim(),
  customerPhone: (custPhone.value || "").trim(),
  vehicleType: vehType.value,
  vehicleInfo: (vehInfo.value || "").trim(),
  date: (bookDate.value || "").trim(),
  time: (bookTime.value || "").trim(),
  note: (note.value || "").trim(),
};

    const created = await api("/workshop-bookings", {
      method: "POST",
      body: bookingPayload,
    });

    const bookingId = created?.id;
    if (!bookingId) throw new Error("Booking creation failed");

    // 2️⃣ Close modal before redirect
    closePay();

    // 3️⃣ Create PaymentOrder + redirect to SSLCommerz
    await startPayment({
      provider,
      mfsProvider,
      source: "workshops",
      items: [{
        kind: bookingPayload.kind,
        id: bookingPayload.serviceId,
        qty: 1,

        // ✅ stored in payment_orders.items (jsonb)
        bookingId,
        workshopId: bookingPayload.workshopId,
        date: bookingPayload.date,
        time: bookingPayload.time,
      }],
    });

  } catch (e) {
    showToast(e?.message || "Payment init failed", "bad");
  } finally {
    btnConfirmPay.disabled = false;
  }
}

  function clearForm() {
    selected = null;
    selectedPill.textContent = "No service selected";
    selectedService.textContent = "—";

    custName.value = "";
    custPhone.value = "";
    vehType.value = "car";
    vehInfo.value = "";
    bookDate.value = toISODate(new Date(Date.now() + 86400000));
    bookTime.value = bookTime.options.length ? bookTime.options[0].value : "";
    note.value = "";

    updateTotals();
    renderServices();
  }

  function clearPaymentInputs() {
    bkashNumber.value = "";
    bkashTrx.value = "";

    cardName.value = "";
    cardNumber.value = "";
    cardExp.value = "";
    cardCvv.value = "";
    setPayMethod("bkash");
  }

  function fillTimeSlots() {
    const slots = [
      "10:00", "10:30", "11:00", "11:30",
      "12:00", "12:30", "13:00", "13:30",
      "14:00", "14:30", "15:00", "15:30",
      "16:00", "16:30", "17:00", "17:30",
      "18:00", "18:30", "19:00", "19:30",
      "20:00", "20:30"
    ];
    bookTime.innerHTML = "";
    slots.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = to12h(t);
      bookTime.appendChild(opt);
    });
    bookTime.value = slots[0];
  }

  // ---------- Receipts ----------
  function loadReceipts() {
    return safeJson(localStorage.getItem(RECEIPTS_KEY)) || [];
  }
  function loadBookings() {
    return safeJson(localStorage.getItem(BOOKING_KEY)) || [];
  }

  function renderReceipts() {
    const rows = loadReceipts();
    rcCount.textContent = `${rows.length} record${rows.length === 1 ? "" : "s"}`;
    rcTbody.innerHTML = "";

    if (!rows.length) {
      rcEmpty.hidden = false;
      return;
    }
    rcEmpty.hidden = true;

    rows.slice(0, 50).forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r.serviceTitle)}</td>
        <td>${escapeHtml(r.workshopName)}</td>
        <td>${formatBDT(r.amount)}</td>
        <td>${escapeHtml(String(r.method || "").toUpperCase())}</td>
        <td>${escapeHtml(r.reference || "-")}</td>
        <td>${escapeHtml(formatDateTime(r.createdAt))}</td>
      `;
      rcTbody.appendChild(tr);
    });
  }

  // ---------- Helpers ----------
  function safeJson(raw) {
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }

  function formatBDT(n) {
    const s = Math.round(Number(n || 0)).toString();
    const withComma = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `BDT ${withComma}`;
  }

  function showToast(message, type) {
    toast.textContent = message;
    toast.classList.remove("ok", "bad", "show");
    toast.classList.add(type === "ok" ? "ok" : "bad", "show");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function genId(prefix) {
    return `${prefix}-` + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }

  function to12h(hhmm) {
    const [hStr, mStr] = hhmm.split(":");
    let h = Number(hStr);
    const m = mStr;
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
  }

  function formatDateTime(ts) {
    const d = new Date(ts || Date.now());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${da} ${hh}:${mm}`;
  }

  // Card formatting/validation
  function formatCardNumber() {
    const digits = (cardNumber.value || "").replace(/\D/g, "").slice(0, 16);
    const parts = digits.match(/.{1,4}/g) || [];
    cardNumber.value = parts.join(" ");
  }

  function formatExpiry() {
    const v = (cardExp.value || "").replace(/\D/g, "").slice(0, 4);
    if (v.length <= 2) cardExp.value = v;
    else cardExp.value = v.slice(0, 2) + "/" + v.slice(2);
  }

  function isValidCardNumber(v) {
    const digits = String(v || "").replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 16) return false;
    return luhnCheck(digits);
  }

  function luhnCheck(num) {
    let sum = 0;
    let alt = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let n = Number(num[i]);
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  function isValidExpiry(exp) {
    const m = String(exp || "").match(/^(\d{2})\/(\d{2})$/);
    if (!m) return false;
    const mm = Number(m[1]);
    const yy = Number(m[2]);
    if (mm < 1 || mm > 12) return false;

    const now = new Date();
    const curYY = Number(String(now.getFullYear()).slice(-2));
    const curMM = now.getMonth() + 1;

    if (yy < curYY) return false;
    if (yy === curYY && mm < curMM) return false;
    return true;
  }

  function maskedCard(v) {
    const digits = String(v || "").replace(/\D/g, "");
    const last4 = digits.slice(-4) || "0000";
    return `CARD •••• ${last4}`;
  }
})();

