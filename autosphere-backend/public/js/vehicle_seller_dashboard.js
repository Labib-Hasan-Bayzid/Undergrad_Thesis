(function () {
  const $ = (id) => document.getElementById(id);

  // ================= CONFIG =================
  const API_BASE = "http://localhost:5001";
  const TOKEN_KEY = "access_token";
//
let payments = [];

  function token() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function requireAuth() {
    if (!token()) window.location.replace("login.html");
  }

 async function api(path, { method = "GET", body, isForm = false } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(isForm ? {} : { "Content-Type": "application/json" }), // ✅ IMPORTANT
    },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.replace("login.html");
    return;
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }

  if (!res.ok) throw new Error((data && data.message) ? data.message : "Request failed");
  return data;
}


  // ================= Seller UI =================
  const sellerName = $("sellerName");
  const sellerPhone = $("sellerPhone");
  const sellerLocation = $("sellerLocation");
  const sellerAbout = $("sellerAbout");
  const sellerBadge = $("sellerBadge");

  const statActive = $("statActive");
  const statSold = $("statSold");
  const statHidden = $("statHidden");

  // Add form
  const vTitle = $("vTitle");
  const vType = $("vType");
  const vBrand = $("vBrand");
  const vYear = $("vYear");
  const vCondition = $("vCondition");
  const vPrice = $("vPrice");
  const vCity = $("vCity");
  const vPhone = $("vPhone");
  const vLocation = $("vLocation");
  const vDesc = $("vDesc");
  //const vImages = $("vImages");
  const vThumbs = $("vThumbs");
  const MAX_IMAGES = 4;

  const btnResetForm = $("btnResetForm");
  const btnSaveListing = $("btnSaveListing");

  // My listings
  const myCount = $("myCount");
  const mySearch = $("mySearch");
  const btnClearMySearch = $("btnClearMySearch");
  const statusFilter = $("statusFilter");
  const mySort = $("mySort");
  const myChips = $("myChips");
  const myGrid = $("myGrid");
  const myEmpty = $("myEmpty");
  const btnClearMyFilters = $("btnClearMyFilters");

  // Payments (leave UI; we won't use yet)
  const methodFilter = $("methodFilter");
  const payCount = $("payCount");
  const payTbody = $("payTbody");
  const payEmpty = $("payEmpty");

  // Edit modal
  const editModal = $("editModal");
  const eTitle = $("eTitle");
  const eType = $("eType");
  const eBrand = $("eBrand");
  const eYear = $("eYear");
  const eCondition = $("eCondition");
  const ePrice = $("ePrice");
  const eCity = $("eCity");
  const ePhone = $("ePhone");
  const eLocation = $("eLocation");
  const eDesc = $("eDesc");
  const btnSaveEdit = $("btnSaveEdit");
// Profile
const btnEditProfile = document.getElementById("btnEditProfile");
const profileModal = document.getElementById("profileModal");
const pName = document.getElementById("pName");
const pEmail = document.getElementById("pEmail");
const pOld = document.getElementById("pOld");
const pNew = document.getElementById("pNew");
const pNew2 = document.getElementById("pNew2");
const btnSaveProfile = document.getElementById("btnSaveProfile");

  // Toast
  const toast = $("toast");

  // ================= State =================
  let seller = null;
  let imageFiles = []; // thumbnails only (images backend step later)
  let listings = [];
  let editingId = null;

  // ================= Boot =================
  bindEvents();
  boot();

  async function boot() {
    await loadSeller();
    await loadListings();
    renderMyListings();
    renderPayments(); // still local empty
  }

  // ================= Seller =================
  async function loadSeller() {
  const me = await api("/auth/me");
  seller = me;

  if (
    (me.role === "vehicle_seller" || me.role === "service_seller" || me.role === "spare_parts_seller") &&
    !me.isVerified
  ) {
    alert("Your seller account is pending admin verification.");
    localStorage.removeItem("access_token");
    window.location.replace("login.html");
    return;
  }

  sellerName.textContent = me.name || "Vehicle Seller";
  sellerPhone.textContent = me.phone || "—";
  sellerLocation.textContent = me.sellerLocation || me.city || "—";
  sellerAbout.textContent = "Vehicle listings • Reliable deals";
  sellerBadge.textContent = "Vehicle Seller";
}

  // ================= Vehicles API =================
  async function loadListings() {
    listings = await api("/vehicles/my");
    // normalize for existing renderer keys
    listings = (listings || []).map((x) => ({
      id: x.id,
      sellerId: x.sellerId,
      title: x.title,
      vehicleType: x.vehicleType,
      brand: x.brand,
      year: x.year,
      condition: x.condition,
      price: x.price,
      city: x.city,
      phone: x.phone,
      location: x.location,
      desc: x.description ?? x.desc ?? "",
      status: x.status,
      createdAt: x.createdAt ? new Date(x.createdAt).getTime() : Date.now(),
    //  images: [], // images later
      coverImageUrl: x.coverImageUrl || null,
images: (() => {
  const urls = Array.isArray(x.imageUrls)
    ? x.imageUrls
    : (x.coverImageUrl ? [x.coverImageUrl] : []);

  return urls
    .filter(Boolean)
    .map((u) => u.startsWith("http") ? u : `${API_BASE}${u}`);
})(),



    }));
  }

  // ================= Events =================
  function bindEvents() {
    btnResetForm.addEventListener("click", resetForm);
    btnSaveListing.addEventListener("click", saveListing);

    

    mySearch.addEventListener("input", renderMyListings);
    statusFilter.addEventListener("change", renderMyListings);
    mySort.addEventListener("change", renderMyListings);

    btnClearMySearch.addEventListener("click", () => {
      mySearch.value = "";
      renderMyListings();
    });

    btnClearMyFilters.addEventListener("click", () => {
      mySearch.value = "";
      statusFilter.value = "all";
      mySort.value = "latest";
      renderMyListings();
    });

    methodFilter.addEventListener("change", renderPayments);

    // Card action buttons
    document.addEventListener("click", async (e) => {
      const btn = e.target.closest && e.target.closest("button[data-act]");
      if (!btn) return;

      const act = btn.dataset.act;
      const id = btn.dataset.id;

      const idx = listings.findIndex((x) => x.id === id);
      if (idx < 0) return;

      try {
        if (act === "delete") {
const ok = confirm("Are you sure you want to delete this listing? This cannot be undone.");
if (!ok) return;
await api(`/vehicles/${id}`, { method: "DELETE" });          await loadListings();
          renderMyListings();
          showToast("Listing deleted.", "ok");
          return;
        }

        if (act === "markSold") {
  const v = listings.find((x) => x.id === id);
  const next = v && v.status === "sold" ? "available" : "sold";
  await api(`/vehicles/${id}/status/${next}`, { method: "PATCH" });
  await loadListings();
  renderMyListings();
  showToast(next === "sold" ? "Marked as sold." : "Marked as active.", "ok");
  return;
}
        if (act === "toggleHide") {
          const next = listings[idx].status === "hidden" ? "available" : "hidden";
          await api(`/vehicles/${id}/status/${next}`, { method: "PATCH" });
          await loadListings();
          renderMyListings();
          showToast(next === "hidden" ? "Hidden." : "Visible.", "ok");
          return;
        }

        if (act === "edit") {
          openEditModal(listings[idx]);
          return;
        }
      } catch (err) {
        showToast(err.message || "Action failed", "bad");
      }
    });

    // Modal close
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (t?.dataset?.close) {
        const m = $(t.dataset.close);
        if (m) closeModal(m);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (editModal.classList.contains("is-open")) closeModal(editModal);
    });

    btnSaveEdit.addEventListener("click", saveEdit);

    //
    if (btnEditProfile) {
  btnEditProfile.addEventListener("click", () => {
    // Prefill from already loaded `seller` (me)
    pName.value = (seller && seller.name) ? seller.name : "";
    pEmail.value = (seller && seller.email) ? seller.email : "";
    pOld.value = ""; pNew.value = ""; pNew2.value = "";
    openModal(profileModal);
  });
}

if (btnSaveProfile) {
  btnSaveProfile.addEventListener("click", saveProfile);
}
//
  }

  // ================= Images preview (upload later) =================
  const vImages = document.getElementById("vImages");
  function onImagesSelected() {
  const picked = Array.from(vImages.files || []);
  if (!picked.length) return;

  const remaining = MAX_IMAGES - imageFiles.length;

  if (remaining <= 0) {
    showToast(`You can upload up to ${MAX_IMAGES} images only. Remove one to add another.`, "bad");
    vImages.value = "";
    return;
  }

  // take only what we can still accept
  const allowed = picked.slice(0, remaining);

  // if user selected more than allowed, tell them
  if (picked.length > allowed.length) {
    showToast(`Only ${MAX_IMAGES} images allowed. Added ${allowed.length}, ignored ${picked.length - allowed.length}.`, "bad");
  }

  for (const f of allowed) {
    // optional: prevent duplicates by name+size
    const dup = imageFiles.some(x => x.file.name === f.name && x.file.size === f.size);
    if (dup) continue;

    const url = URL.createObjectURL(f);
    imageFiles.push({ file: f, url });
  }

  vImages.value = "";
  renderThumbs();
}
  // images: preview only (we'll upload later)
    vImages.addEventListener("change", onImagesSelected);

  function renderThumbs() {
    vThumbs.innerHTML = "";
    if (imageFiles.length === 0) return;

    imageFiles.forEach((x, idx) => {
      const el = document.createElement("div");
      el.className = "thumb";
      el.innerHTML = `
        <img src="${x.url}" alt="Image ${idx + 1}" />
        <button type="button" title="Remove">✕</button>
      `;
      el.querySelector("button").addEventListener("click", () => {
        URL.revokeObjectURL(x.url);
        imageFiles.splice(idx, 1);
        renderThumbs();
      });
      vThumbs.appendChild(el);
    });
  }

  // ================= Add listing =================
  async function saveListing() {
    const title = (vTitle.value || "").trim();
    const brand = (vBrand.value || "").trim();
    const year = vYear.value ? Number(vYear.value) : null;
    const condition = vCondition.value;
    const price = Number(vPrice.value || 0);
    const city = (vCity.value || "").trim();
    const phone = (vPhone.value || "").trim();
    const location = (vLocation.value || "").trim();
    const desc = (vDesc.value || "").trim();

    if (!title) return showToast("Title is required.", "bad");
    if (!price || price < 0) return showToast("Enter a valid price.", "bad");
    if (!phone) return showToast("Contact is required.", "bad");
    if (!location) return showToast("Location is required.", "bad");
    if (!city) return showToast("City is required.", "bad");

    //
    console.log("imageFiles length:", imageFiles.length);


    try {
     const fd = new FormData();
fd.append("title", title);
fd.append("vehicleType", vType.value);

if (brand) fd.append("brand", brand);
if (year !== null && year !== undefined && year !== "") fd.append("year", String(year));

fd.append("condition", condition);
fd.append("price", String(price));
fd.append("city", city);
fd.append("phone", phone);
fd.append("location", location);

if (desc) fd.append("description", desc);

if (imageFiles.length > MAX_IMAGES) {
  return showToast(`Max ${MAX_IMAGES} images allowed. Remove extra images.`, "bad");
}
// ✅ files must be appended using key name "images"
for (const it of imageFiles) {
  fd.append("images", it.file);
}

// ✅ IMPORTANT: send as form-data
await api("/vehicles", { method: "POST", body: fd, isForm: true });


      await loadListings();
      renderMyListings();
      showToast("Listing saved.", "ok");
      resetForm();
    } catch (err) {
      showToast(err.message || "Failed to save", "bad");
    }
  }

  function resetForm() {
    vTitle.value = "";
    vType.value = "car";
    vBrand.value = "";
    vYear.value = "";
    vCondition.value = "used";
    vPrice.value = "";
    vCity.value = "";
    vPhone.value = "";
    vLocation.value = "";
    vDesc.value = "";

    imageFiles.forEach((x) => {
      try { URL.revokeObjectURL(x.url); } catch {}
    });
    imageFiles = [];
    renderThumbs();
  }

  // ================= My listings render (same UI logic) =================
  function renderMyListings() {
    const mine = listings;

    const q = (mySearch.value || "").trim().toLowerCase();
    const st = statusFilter.value;
    const sort = mySort.value;

    let out = mine.filter((x) => {
      const text = `${x.title} ${x.vehicleType} ${x.brand || ""} ${x.city} ${x.location} ${x.status}`.toLowerCase();
      const okQ = !q ? true : text.includes(q);
      const okSt = st === "all" ? true : x.status === st;
      return okQ && okSt;
    });

    if (sort === "latest") out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (sort === "priceLow") out.sort((a, b) => (a.price || 0) - (b.price || 0));
    if (sort === "priceHigh") out.sort((a, b) => (b.price || 0) - (a.price || 0));

    renderChips({ q, status: st });

    myCount.textContent = `${out.length} item${out.length === 1 ? "" : "s"}`;
    myGrid.innerHTML = "";

    if (out.length === 0) {
      myEmpty.hidden = false;
      updateStats(mine);
      return;
    }
    myEmpty.hidden = true;

    out.forEach((x) => {
const cover =
  (x.images && x.images[0]) ||
  (x.coverImageUrl ? `${API_BASE}${x.coverImageUrl}` : "");      const status = statusPill(x.status);

      const parts = [
        x.vehicleType ? capitalize(x.vehicleType) : "",
        x.brand ? x.brand : "",
        x.year ? String(x.year) : "",
        x.city ? x.city : ""
      ].filter(Boolean);

      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <div class="card-media">
          ${cover ? `<img src="${cover}" alt="${escapeAttr(x.title)}" loading="lazy" />` : ""}
          <div class="badge-row">
            <span class="pill ${status.cls}">${status.label}</span>
          </div>
        </div>

        <div class="card-body">
          <div>
            <h4 class="card-title">${escapeHtml(x.title)}</h4>
            <p class="card-sub">${escapeHtml(parts.join(" • "))}</p>
          </div>

          <div class="row2">
            <div class="price">${formatBDT(x.price || 0)}</div>
            <div class="small">${escapeHtml(x.id)}</div>
          </div>

          <div class="card-actions">
            <button class="btn btn-ghost" type="button" data-act="edit" data-id="${escapeAttr(x.id)}">Edit</button>
            <button class="btn btn-ghost" type="button" data-act="toggleHide" data-id="${escapeAttr(x.id)}">${x.status === "hidden" ? "Unhide" : "Hide"}</button>
${x.status === "sold"
  ? `<button class="btn btn-ghost" type="button" data-act="markSold" data-id="${escapeAttr(x.id)}">Undo Sold</button>`
  : `<button class="btn btn-primary" type="button" data-act="markSold" data-id="${escapeAttr(x.id)}">Mark Sold</button>`
}
            <button class="btn btn-danger" type="button" data-act="delete" data-id="${escapeAttr(x.id)}">Delete</button>
          </div>
        </div>
      `;
      myGrid.appendChild(card);
    });

    updateStats(mine);
  }

  function updateStats(mine) {
    const active = mine.filter((x) => x.status === "available").length;
    const sold = mine.filter((x) => x.status === "sold").length;
    const hidden = mine.filter((x) => x.status === "hidden").length;

    statActive.textContent = String(active);
    statSold.textContent = String(sold);
    statHidden.textContent = String(hidden);
  }

  function renderChips(filters) {
    const chips = [];
    if (filters.q) chips.push({ key: "q", label: `Search: "${filters.q}"` });
    if (filters.status && filters.status !== "all") {
      chips.push({ key: "status", label: `Status: ${filters.status}` });
    }

    myChips.innerHTML = "";
    chips.forEach((c) => {
      const el = document.createElement("div");
      el.className = "chip";
      el.innerHTML = `
        <span>${escapeHtml(c.label)}</span>
        <button type="button" aria-label="Remove">×</button>
      `;
      el.querySelector("button").addEventListener("click", () => {
        if (c.key === "q") mySearch.value = "";
        if (c.key === "status") statusFilter.value = "all";
        renderMyListings();
      });
      myChips.appendChild(el);
    });
  }

  // ================= Edit modal =================
  function openEditModal(item) {
    editingId = item.id;

    eTitle.value = item.title || "";
    eType.value = item.vehicleType || "car";
    eBrand.value = item.brand || "";
    eYear.value = item.year ? String(item.year) : "";
    eCondition.value = item.condition || "used";
    ePrice.value = String(item.price || 0);
    eCity.value = item.city || "";
    ePhone.value = item.phone || "";
    eLocation.value = item.location || "";
    eDesc.value = item.desc || "";

    openModal(editModal);
  }

  async function saveEdit() {
    if (!editingId) return;

    const t = (eTitle.value || "").trim();
    const p = Number(ePrice.value || 0);
    const ph = (ePhone.value || "").trim();
    const loc = (eLocation.value || "").trim();
    const c = (eCity.value || "").trim();

    if (!t) return showToast("Title is required.", "bad");
    if (!p || p < 0) return showToast("Enter a valid price.", "bad");
    if (!ph) return showToast("Contact is required.", "bad");
    if (!loc) return showToast("Location is required.", "bad");
    if (!c) return showToast("City is required.", "bad");

    try {
      await api(`/vehicles/${editingId}`, {
        method: "PATCH",
        body: {
          title: t,
          vehicleType: eType.value,
          brand: (eBrand.value || "").trim() || null,
          year: eYear.value ? Number(eYear.value) : null,
          condition: eCondition.value,
          price: p,
          city: c,
          phone: ph,
          location: loc,
          description: (eDesc.value || "").trim() || null,
        },
      });

      closeModal(editModal);
      await loadListings();
      renderMyListings();
      showToast("Changes saved.", "ok");
    } catch (err) {
      showToast(err.message || "Update failed", "bad");
    }
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
    editingId = null;
  }

  // ================= Payments (not wired yet) =================
  async function renderPayments() {
  try {
    const list = await api("/payments/seller/vehicle?limit=200");
    payments = Array.isArray(list) ? list : [];

    const f = (methodFilter.value || "all").toLowerCase();
    const filtered = f === "all" ? payments : payments.filter(x => (x.method || "").toLowerCase() === f);

    payTbody.innerHTML = "";

    if (!filtered.length) {
      payCount.textContent = `0 records`;
      payEmpty.hidden = false;
      return;
    }

    payCount.textContent = `${filtered.length} record${filtered.length === 1 ? "" : "s"}`;
    payEmpty.hidden = true;

    filtered.slice(0, 50).forEach((x) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(x.vehicle || "—")}</td>
        <td>${escapeHtml(formatBDT(x.amount || 0))}</td>
        <td>${escapeHtml((x.method || "—").toUpperCase())}</td>
        <td>${escapeHtml(x.reference || "—")}</td>
        <td>${escapeHtml(x.date ? new Date(x.date).toLocaleDateString() : "—")}</td>
        
      `;
      payTbody.appendChild(tr);
    });
  } catch (e) {
    payTbody.innerHTML = "";
    payCount.textContent = `0 records`;
    payEmpty.hidden = false;
    showToast(e?.message || "Failed to load payments", "bad");
  }
}

  // ================= Helpers =================
  function formatBDT(n) {
    const x = Number(n || 0);
    try {
      return x.toLocaleString("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 });
    } catch {
      return `BDT ${Math.round(x).toLocaleString("en-US")}`;
    }
  }

  function capitalize(s) {
    const t = String(s || "");
    return t ? (t.charAt(0).toUpperCase() + t.slice(1)) : "";
  }

  function statusPill(status) {
    const s = (status || "").toLowerCase();
    if (s === "available") return { cls: "good", label: "Active" };
    if (s === "sold") return { cls: "warn", label: "Sold" };
    if (s === "hidden") return { cls: "bad", label: "Hidden" };
    return { cls: "", label: status || "—" };
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replaceAll("`", "&#096;");
  }

  let toastTimer = null;
  function showToast(msg, type) {
    toast.className = "floating-toast";
    if (type === "ok") toast.classList.add("ok");
    if (type === "bad") toast.classList.add("bad");
    toast.textContent = msg;

    requestAnimationFrame(() => toast.classList.add("is-show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("is-show");
    }, 2200);
  }
  //
  async function saveProfile() {
  try {
    // 1) Update name (if changed)
    const newName = (pName.value || "").trim();
    if (newName && seller && newName !== seller.name) {
      await api("/auth/me", { method: "PATCH", body: { name: newName } });
      seller.name = newName;
      sellerName.textContent = newName;
    }

    // 2) Change password (only if user typed something)
    const oldPass = (pOld.value || "").trim();
    const newPass = (pNew.value || "").trim();
    const newPass2 = (pNew2.value || "").trim();

    const wantsPassChange = oldPass || newPass || newPass2;
    if (wantsPassChange) {
      if (!oldPass) return showToast("Old password required.", "bad");
      if (!newPass) return showToast("New password required.", "bad");
      if (newPass.length < 6) return showToast("New password too short.", "bad");
      if (newPass !== newPass2) return showToast("New passwords do not match.", "bad");

      await api("/auth/change-password", {
        method: "POST",
        body: { oldPassword: oldPass, newPassword: newPass },
      });
    }

    closeModal(profileModal);
    showToast("Profile updated.", "ok");
  } catch (err) {
    showToast(err.message || "Update failed", "bad");
  }
}

  //
})();
