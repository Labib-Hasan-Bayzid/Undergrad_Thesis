(function () {
  const $ = (id) => document.getElementById(id);

  // ====== CONFIG (match your backend port) ======
  const API_BASE = "http://localhost:5001";
  const TOKEN_KEY = "access_token";

  function token() {
    return localStorage.getItem(TOKEN_KEY);
  }
  function requireAuth() {
    if (!token()) window.location.replace("login.html");
  }

  async function api(path, { method = "GET", body, isForm = false } = {}) {
    requireAuth();

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token()}`,
        ...(isForm ? {} : { "Content-Type": "application/json" }),
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

  // Seller UI
  const sellerName = $("sellerName");
  const sellerPhone = $("sellerPhone");
  const sellerLocation = $("sellerLocation");
  const sellerAbout = $("sellerAbout");
  const sellerBadge = $("sellerBadge");

  const statActive = $("statActive");
  const statHidden = $("statHidden");

  // Tabs + panels
  const tabButtons = Array.from(document.querySelectorAll(".tab[data-tab]"));
  const panelService = $("panel-service");
  const panelPart = $("panel-part");

  // Form: service
  const svcTitle = $("svcTitle");
  const svcType = $("svcType");
  const svcVehicle = $("svcVehicle");
  const svcPrice = $("svcPrice");
  const svcCity = $("svcCity");
  const svcPhone = $("svcPhone");
  const svcLocation = $("svcLocation");
  const svcDesc = $("svcDesc");
  const svcImages = $("svcImages");
  const svcThumbs = $("svcThumbs");

  // Form: part
  const partTitle = $("partTitle");
  const partCategory = $("partCategory");
  const partVehicle = $("partVehicle");
  const partPrice = $("partPrice");
  const partStock = $("partStock");
  const partCondition = $("partCondition");
  const partCity = $("partCity");
  const partPhone = $("partPhone");
  const partLocation = $("partLocation");
  const partDesc = $("partDesc");
  const partImages = $("partImages");
  const partThumbs = $("partThumbs");

  // Buttons
  const btnResetForm = $("btnResetForm");
  const btnSaveListing = $("btnSaveListing");

  // My listings
  const myCount = $("myCount");
  const mySearch = $("mySearch");
  const btnClearMySearch = $("btnClearMySearch");
  const catFilter = $("catFilter");
  const statusFilter = $("statusFilter");
  const mySort = $("mySort");
  const myChips = $("myChips");
  const myGrid = $("myGrid");
  const myEmpty = $("myEmpty");
  const btnClearMyFilters = $("btnClearMyFilters");

  // Payments (leave for later)
  const methodFilter = $("methodFilter");
  const payCount = $("payCount");
  const payTbody = $("payTbody");
  const payEmpty = $("payEmpty");

  // Toast
  const toast = $("toast");
//
// =================== PROFILE EDIT (Name + Password) ===================
const btnEditProfile = document.getElementById("btnEditProfile");

let profileModal = null;

function ensureProfileModal() {
  if (profileModal) return;

  profileModal = document.createElement("div");
  profileModal.className = "modal";
  profileModal.id = "profileModal";
  profileModal.style.display = "none";

  profileModal.innerHTML = `
    <div class="modal-backdrop" data-close="profile"></div>
    <div class="modal-card glass" role="document" aria-labelledby="profileTitle">
      <div class="modal-head">
        <div>
          <h3 id="profileTitle">Edit Profile</h3>
          <p class="muted" style="margin:6px 0 0;">Update your name or change password</p>
        </div>
        <button class="icon-btn" type="button" data-close="profile" aria-label="Close">✕</button>
      </div>

      <div class="modal-body">
        <div class="box glass-soft" style="padding:12px; border-radius:16px;">
          <h4 style="margin:0 0 10px;">Update Name</h4>
          <div class="field">
            <label for="pfName">Full Name</label>
            <input id="pfName" type="text" placeholder="Your name" />
          </div>
          <div style="margin-top:10px; display:flex; gap:10px; justify-content:flex-end;">
            <button class="btn btn-primary" type="button" id="btnSaveName">Save Name</button>
          </div>
        </div>

        <div class="box glass-soft" style="padding:12px; border-radius:16px; margin-top:12px;">
          <h4 style="margin:0 0 10px;">Change Password</h4>

          <div class="field">
            <label for="pfOld">Old Password</label>
            <input id="pfOld" type="password" placeholder="Old password" autocomplete="current-password" />
          </div>

          <div class="field" style="margin-top:10px;">
            <label for="pfNew">New Password</label>
            <input id="pfNew" type="password" placeholder="New password" autocomplete="new-password" />
          </div>

          <div class="field" style="margin-top:10px;">
            <label for="pfNew2">Confirm New Password</label>
            <input id="pfNew2" type="password" placeholder="Confirm new password" autocomplete="new-password" />
          </div>

          <div style="margin-top:10px; display:flex; gap:10px; justify-content:flex-end;">
            <button class="btn btn-primary" type="button" id="btnChangePass">Change Password</button>
          </div>
        </div>
      </div>

      <div class="modal-foot" style="display:flex; justify-content:flex-end; gap:10px;">
        <button class="btn btn-ghost" type="button" data-close="profile">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(profileModal);

  // Close actions
  profileModal.addEventListener("click", (e) => {
    const t = e.target;
    if (t?.dataset?.close === "profile") closeProfileModal();
    if (t?.closest?.('[data-close="profile"]')) closeProfileModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && profileModal.style.display === "block") closeProfileModal();
  });

  // Buttons
  profileModal.querySelector("#btnSaveName").addEventListener("click", saveName);
  profileModal.querySelector("#btnChangePass").addEventListener("click", changePassword);
}

async function openProfileModal() {
  ensureProfileModal();

  // Load current name from backend
  try {
    const me = await api("/auth/me");
    profileModal.querySelector("#pfName").value = me?.name || "";
  } catch {
    profileModal.querySelector("#pfName").value = sellerName?.textContent || "";
  }

  profileModal.style.display = "block";
  document.body.style.overflow = "hidden";
}

function closeProfileModal() {
  if (!profileModal) return;
  profileModal.style.display = "none";
  document.body.style.overflow = "";
  // clear password fields (security)
  profileModal.querySelector("#pfOld").value = "";
  profileModal.querySelector("#pfNew").value = "";
  profileModal.querySelector("#pfNew2").value = "";
}

async function saveName() {
  const pfName = profileModal.querySelector("#pfName");
  const name = (pfName.value || "").trim();
  if (!name) return showToast("Name is required.", "bad");

  try {
    const res = await api("/auth/me", { method: "PATCH", body: { name } });
    // Update UI immediately
    sellerName.textContent = name;
    showToast("Name updated.", "ok");
  } catch (err) {
    showToast(err.message || "Failed to update name", "bad");
  }
}

async function changePassword() {
  const oldPassword = (profileModal.querySelector("#pfOld").value || "").trim();
  const newPassword = (profileModal.querySelector("#pfNew").value || "").trim();
  const newPassword2 = (profileModal.querySelector("#pfNew2").value || "").trim();

  if (!oldPassword) return showToast("Old password is required.", "bad");
  if (!newPassword || newPassword.length < 6) return showToast("New password must be at least 6 chars.", "bad");
  if (newPassword !== newPassword2) return showToast("New passwords do not match.", "bad");

  try {
    await api("/auth/change-password", {
      method: "POST",
      body: { oldPassword, newPassword },
    });

    // Clear fields
    profileModal.querySelector("#pfOld").value = "";
    profileModal.querySelector("#pfNew").value = "";
    profileModal.querySelector("#pfNew2").value = "";
    // mine
closeProfileModal();    

    showToast("Password changed.", "ok");
  } catch (err) {
    showToast(err.message || "Failed to change password", "bad");
  }
}

// Wire button
if (btnEditProfile) {
  btnEditProfile.addEventListener("click", (e) => {
    e.preventDefault();
    openProfileModal();
  });
}
// =================== END PROFILE EDIT ===================

//
  // State
  let seller = null;
  let activeTab = "service"; // service | part
  let svcImageFiles = [];
  let partImageFiles = [];
  let listings = [];
  // ===== Edit Modal (injected) =====
let editingId = null;

const editModal = document.createElement("div");
editModal.id = "editModalSvc";
editModal.className = "modal";
editModal.style.display = "none";
editModal.innerHTML = `
  <div class="modal-backdrop" data-close="1"></div>
  <div class="modal-card">
    <div class="modal-head">
      <h3>Edit Listing</h3>
      <button class="icon-btn" data-close="1">✕</button>
    </div>

    <div class="modal-body">
      <div class="grid">
        <label>Title <input id="eTitleSvc" type="text" /></label>
        <label>Price <input id="ePriceSvc" type="number" min="0" /></label>
        <label>City <input id="eCitySvc" type="text" /></label>
        <label>Phone <input id="ePhoneSvc" type="text" /></label>
        <label>Location <input id="eLocationSvc" type="text" /></label>
        <label id="eStockWrapSvc" style="display:none;">
    Stock <input id="eStockSvc" type="number" min="0" />
  </label>
      </div>

      <label style="margin-top:10px;">Description
        <textarea id="eDescSvc" rows="3"></textarea>
      </label>

      <p class="hint" id="eHintSvc" style="margin-top:10px; opacity:.8;"></p>
    </div>

    <div class="modal-foot">
      <button class="btn btn-ghost" data-close="1">Cancel</button>
      <button class="btn btn-primary" id="btnSaveEditSvc">Save Changes</button>
    </div>
  </div>
`;
document.body.appendChild(editModal);
const eStockWrapSvc = editModal.querySelector("#eStockWrapSvc");
const eStockSvc = editModal.querySelector("#eStockSvc");
const eTitleSvc = editModal.querySelector("#eTitleSvc");
const ePriceSvc = editModal.querySelector("#ePriceSvc");
const eCitySvc = editModal.querySelector("#eCitySvc");
const ePhoneSvc = editModal.querySelector("#ePhoneSvc");
const eLocationSvc = editModal.querySelector("#eLocationSvc");
const eDescSvc = editModal.querySelector("#eDescSvc");
const eHintSvc = editModal.querySelector("#eHintSvc");
const btnSaveEditSvc = editModal.querySelector("#btnSaveEditSvc");

function openEditModal(item) {
  editingId = item.id;

  eTitleSvc.value = item.title || "";
  ePriceSvc.value = String(item.price || 0);
  eCitySvc.value = item.city || "";
  ePhoneSvc.value = item.phone || "";
  eLocationSvc.value = item.location || "";
  eDescSvc.value = item.desc || "";


  // tell user what they are editing
  eHintSvc.textContent =
    item.category === "service"
      ? `Category: Service • Type: ${item.serviceType || "-"} • Support: ${item.vehicleSupport}`
      : `Category: Spare Parts • Part: ${item.partCategory || "-"} • Condition: ${item.partCondition || "-"} • Stock: ${item.stock ?? "-"}`;

  editModal.style.display = "block";
  document.body.style.overflow = "hidden";
  if (item.category === "part") {
  eStockWrapSvc.style.display = "block";
  eStockSvc.value = String(item.stock ?? 0);
} else {
  eStockWrapSvc.style.display = "none";
  eStockSvc.value = "";
}

}

function closeEditModal() {
  editModal.style.display = "none";
  document.body.style.overflow = "";
  editingId = null;
}

editModal.addEventListener("click", (e) => {
  const t = e.target;
  if (t && t.dataset && t.dataset.close) closeEditModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && editModal.style.display === "block") closeEditModal();
});
btnSaveEditSvc.addEventListener("click", async () => {
  if (!editingId) return;

  const title = (eTitleSvc.value || "").trim();
  const price = Number(ePriceSvc.value || 0);
  const city = (eCitySvc.value || "").trim();
  const phone = (ePhoneSvc.value || "").trim();
  const location = (eLocationSvc.value || "").trim();
  const description = (eDescSvc.value || "").trim();

  if (!title) return showToast("Title is required.", "bad");
  if (!Number.isFinite(price) || price < 0) return showToast("Enter a valid price.", "bad");
  if (!city) return showToast("City is required.", "bad");
  if (!phone) return showToast("Phone is required.", "bad");
  if (!location) return showToast("Location is required.", "bad");
  const item = listings.find((x) => x.id === editingId);


  try {
    const patchBody = {
  title,
  price,
  city,
  phone,
  location,
  description: description || null,
};

if (item && item.category === "part") {
  const stock = Number(eStockSvc.value || 0);
  if (!Number.isFinite(stock) || stock < 0) return showToast("Enter valid stock.", "bad");
  patchBody.stock = stock;
}

await api(`/services/${editingId}`, {
  method: "PATCH",
  body: patchBody,
});


    closeEditModal();
    await loadListings();
    renderMyListings();
    showToast("Updated.", "ok");
  } catch (err) {
    showToast(err.message || "Update failed", "bad");
  }
});


  bind();
  boot();

  async function boot() {
    await loadSeller();
    await loadListings();
    setTab("service");
    renderMyListings();
    renderPayments();
  }
    

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

  sellerName.textContent = me.name || "—";
  sellerPhone.textContent = me.phone || "—";
  sellerLocation.textContent = me.sellerLocation || me.city || "—";
  sellerAbout.textContent = "Services, spare parts, and support.";
  sellerBadge.textContent = "Service Provider";

  if (sellerLocation.textContent && sellerLocation.textContent !== "—") {
    svcCity.value = sellerLocation.textContent;
    partCity.value = sellerLocation.textContent;
  }
  if (sellerPhone.textContent && sellerPhone.textContent !== "—") {
    svcPhone.value = sellerPhone.textContent;
    partPhone.value = sellerPhone.textContent;
  }
}

  async function loadListings() {
    const data = await api("/services/my");
    listings = (data || []).map((x) => ({
      id: x.id,
      sellerId: x.sellerId,
      category: x.category,
      title: x.title,
      serviceType: x.serviceType,
      partCategory: x.partCategory,
      partCondition: x.partCondition,
      stock: x.stock,
      vehicleSupport: x.vehicleSupport,
      price: x.price,
      city: x.city,
      phone: x.phone,
      location: x.location,
      desc: x.description || "",
      status: x.status,
      createdAt: x.createdAt ? new Date(x.createdAt).getTime() : Date.now(),
      images: Array.isArray(x.imageUrls)
        ? x.imageUrls.filter(Boolean).map((u) => `${API_BASE}${u}`)
        : (x.coverImageUrl ? [`${API_BASE}${x.coverImageUrl}`] : []),
    }));
  }

  function bind() {
    tabButtons.forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

    svcImages.addEventListener("change", () => {
      const files = Array.from(svcImages.files || []);
      files.forEach((f) => svcImageFiles.push({ file: f, url: URL.createObjectURL(f) }));
      svcImages.value = "";
      renderThumbs(svcThumbs, svcImageFiles, "svc");
    });

    partImages.addEventListener("change", () => {
      const files = Array.from(partImages.files || []);
      files.forEach((f) => partImageFiles.push({ file: f, url: URL.createObjectURL(f) }));
      partImages.value = "";
      renderThumbs(partThumbs, partImageFiles, "part");
    });

    document.addEventListener("click", (e) => {
      const btn = e.target.closest && e.target.closest(".thumb button[data-type]");
      if (!btn) return;

      const type = btn.dataset.type;
      const idx = Number(btn.dataset.idx);

      if (type === "svc" && svcImageFiles[idx]) {
        URL.revokeObjectURL(svcImageFiles[idx].url);
        svcImageFiles.splice(idx, 1);
        renderThumbs(svcThumbs, svcImageFiles, "svc");
      }
      if (type === "part" && partImageFiles[idx]) {
        URL.revokeObjectURL(partImageFiles[idx].url);
        partImageFiles.splice(idx, 1);
        renderThumbs(partThumbs, partImageFiles, "part");
      }
    });

    btnResetForm.addEventListener("click", resetForm);
    btnSaveListing.addEventListener("click", saveListing);

    mySearch.addEventListener("input", renderMyListings);
    catFilter.addEventListener("change", renderMyListings);
    statusFilter.addEventListener("change", renderMyListings);
    mySort.addEventListener("change", renderMyListings);

    btnClearMySearch.addEventListener("click", () => { mySearch.value = ""; renderMyListings(); });
    btnClearMyFilters.addEventListener("click", () => {
      mySearch.value = "";
      catFilter.value = "all";
      statusFilter.value = "all";
      mySort.value = "latest";
      renderMyListings();
    });
    


    methodFilter.addEventListener("change", renderPayments);

    document.addEventListener("click", async (e) => {
      const btn = e.target.closest && e.target.closest("button[data-act]");
      if (!btn) return;

      const act = btn.dataset.act;
      const id = btn.dataset.id;

      try {
      if (act === "edit") {
  const item = listings.find((x) => x.id === id);
  if (!item) return;
  openEditModal(item);
  return;
}

        if (act === "delete") {
          if (!confirm("Delete this listing? This cannot be undone.")) return;
          await api(`/services/${id}`, { method: "DELETE" });
          await loadListings();
          renderMyListings();
          showToast("Listing deleted.", "ok");
          return;
        }

        

        if (act === "toggleHide") {
          const item = listings.find((x) => x.id === id);
          const next = item && item.status === "hidden" ? "available" : "hidden";
          await api(`/services/${id}/status/${next}`, { method: "PATCH" });
          await loadListings();
          renderMyListings();
          showToast(next === "hidden" ? "Hidden." : "Visible.", "ok");
          return;
        }
      } catch (err) {
        showToast(err.message || "Action failed", "bad");
      }
    });
  }

  function setTab(tab) {
    activeTab = (tab === "part") ? "part" : "service";

    tabButtons.forEach((b) => {
      const on = b.dataset.tab === activeTab;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });

    if (activeTab === "service") {
      panelService.hidden = false;
      panelService.classList.add("is-active");
      panelPart.hidden = true;
      panelPart.classList.remove("is-active");
    } else {
      panelPart.hidden = false;
      panelPart.classList.add("is-active");
      panelService.hidden = true;
      panelService.classList.remove("is-active");
    }
  }

  function renderThumbs(container, list, type) {
    container.innerHTML = "";
    list.forEach((x, idx) => {
      const el = document.createElement("div");
      el.className = "thumb";
      el.innerHTML = `
        <img src="${x.url}" alt="Image ${idx + 1}" />
        <button type="button" title="Remove" data-type="${type}" data-idx="${idx}">✕</button>
      `;
      container.appendChild(el);
    });
  }

  function resetForm() {
    // service
    svcTitle.value = "";
    svcType.value = "maintenance";
    svcVehicle.value = "car";
    svcPrice.value = "";
    svcLocation.value = "";
    svcDesc.value = "";
    svcImageFiles.forEach((x) => URL.revokeObjectURL(x.url));
    svcImageFiles = [];
    svcThumbs.innerHTML = "";

    // part
    partTitle.value = "";
    partCategory.value = "engine";
    partVehicle.value = "car";
    partPrice.value = "";
    partStock.value = "";
    partCondition.value = "new";
    partLocation.value = "";
    partDesc.value = "";
    partImageFiles.forEach((x) => URL.revokeObjectURL(x.url));
    partImageFiles = [];
    partThumbs.innerHTML = "";

    showToast("Cleared.", "ok");
  }

  async function saveListing() {
    try {
      if (activeTab === "service") {
        const title = (svcTitle.value || "").trim();
        const price = Number(svcPrice.value || 0);
        const phone = (svcPhone.value || "").trim();
        const city = (svcCity.value || "").trim();
        const location = (svcLocation.value || "").trim();

        if (!title) return showToast("Service title is required.", "bad");
        if (!price || price < 0) return showToast("Enter a valid price.", "bad");
        if (!phone) return showToast("Phone is required.", "bad");
        if (!city) return showToast("City is required.", "bad");
        if (!location) return showToast("Location is required.", "bad");

        const fd = new FormData();
        fd.append("category", "service");
        fd.append("title", title);
        fd.append("serviceType", svcType.value);
        fd.append("vehicleSupport", svcVehicle.value);
        fd.append("price", String(price));
        fd.append("city", city);
        fd.append("phone", phone);
        fd.append("location", location);
        const d = (svcDesc.value || "").trim();
        if (d) fd.append("description", d);

        for (const it of svcImageFiles) fd.append("images", it.file);

        await api("/services", { method: "POST", body: fd, isForm: true });
        await loadListings();
        renderMyListings();
        showToast("Listing saved.", "ok");
        resetForm();
        setTab("service");
        return;
      }

      // part
      const title = (partTitle.value || "").trim();
      const price = Number(partPrice.value || 0);
      const stock = Number(partStock.value || 0);
      const phone = (partPhone.value || "").trim();
      const city = (partCity.value || "").trim();
      const location = (partLocation.value || "").trim();

      if (!title) return showToast("Part name is required.", "bad");
      if (!price || price < 0) return showToast("Enter a valid price.", "bad");
      if (stock < 0) return showToast("Enter a valid stock.", "bad");
      if (!phone) return showToast("Phone is required.", "bad");
      if (!city) return showToast("City is required.", "bad");
      if (!location) return showToast("Location is required.", "bad");

      const fd = new FormData();
      fd.append("category", "part");
      fd.append("title", title);
      fd.append("partCategory", partCategory.value);
      fd.append("partCondition", partCondition.value);
      fd.append("stock", String(stock));
      fd.append("vehicleSupport", partVehicle.value);
      fd.append("price", String(price));
      fd.append("city", city);
      fd.append("phone", phone);
      fd.append("location", location);
      const d = (partDesc.value || "").trim();
      if (d) fd.append("description", d);

      for (const it of partImageFiles) fd.append("images", it.file);

      await api("/services", { method: "POST", body: fd, isForm: true });
      await loadListings();
      renderMyListings();
      showToast("Listing saved.", "ok");
      resetForm();
      setTab("part");
    } catch (err) {
      showToast(err.message || "Save failed", "bad");
    }
  }

  function renderMyListings() {
    const q = (mySearch.value || "").trim().toLowerCase();
    const cat = catFilter.value;
    const st = statusFilter.value;
    const sort = mySort.value;

    let out = (listings || []).filter((x) => {
      const text = `${x.title} ${x.category} ${x.serviceType || ""} ${x.partCategory || ""} ${x.vehicleSupport || ""} ${x.city} ${x.location} ${x.status}`.toLowerCase();
      const okQ = !q ? true : text.includes(q);
      const okCat = cat === "all" ? true : x.category === cat;
      const okSt = st === "all" ? true : x.status === st;
      return okQ && okCat && okSt;
    });

    out.sort((a, b) => {
      if (sort === "latest") return (b.createdAt || 0) - (a.createdAt || 0);
      if (sort === "priceLow") return (a.price || 0) - (b.price || 0);
      if (sort === "priceHigh") return (b.price || 0) - (a.price || 0);
      return 0;
    });

    renderChips({ q, cat, status: st });

    myCount.textContent = `${out.length} item${out.length === 1 ? "" : "s"}`;
    myGrid.innerHTML = "";

    if (out.length === 0) {
      myEmpty.hidden = false;
      updateStats(listings);
      return;
    }
    myEmpty.hidden = true;

    out.forEach((x) => {
      const cover = x.images && x.images[0] ? x.images[0] : "";
      const status = statusPill(x.status);

      const subtitle = x.category === "service"
        ? `${capitalize(x.serviceType)} • ${supportLabel(x.vehicleSupport)} • ${x.city}`
        : `${capitalize(x.partCategory)} • ${supportLabel(x.vehicleSupport)} • ${x.city}`;

      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <div class="card-media">
          ${cover ? `<img src="${cover}" alt="${escapeAttr(x.title)}" loading="lazy" />` : ""}
          <div class="badge-row">
            <span class="pill cat">${x.category === "service" ? "Service" : "Spare Parts"}</span>
            <span class="pill ${status.cls}">${status.label}</span>
          </div>
        </div>

        <div class="card-body">
          <div>
            <h4 class="card-title">${escapeHtml(x.title)}</h4>
            <p class="card-sub">${escapeHtml(subtitle)}</p>
          </div>

          <div class="row2">
            <div class="price">${formatBDT(x.price || 0)}</div>
            <div class="small">${escapeHtml(x.id)}</div>
          </div>

          <div class="card-actions">
  <button class="btn btn-ghost" type="button" data-act="edit" data-id="${escapeAttr(x.id)}">Edit</button>
  <button class="btn btn-ghost" type="button" data-act="toggleHide" data-id="${escapeAttr(x.id)}">${x.status === "hidden" ? "Unhide" : "Hide"}</button>
  <button class="btn btn-danger" type="button" data-act="delete" data-id="${escapeAttr(x.id)}">Delete</button>
</div>

        </div>
      `;
      myGrid.appendChild(card);
    });

    updateStats(listings);
  }

  function renderChips(filters) {
    const chips = [];
    if (filters.q) chips.push({ key: "q", label: `Search: "${filters.q}"` });
    if (filters.cat !== "all") chips.push({ key: "cat", label: `Category: ${filters.cat === "part" ? "Spare Parts" : "Service"}` });
    if (filters.status !== "all") chips.push({ key: "status", label: `Status: ${filters.status}` });

    myChips.innerHTML = "";
    chips.forEach((c) => {
      const el = document.createElement("div");
      el.className = "chip";
      el.innerHTML = `<span>${escapeHtml(c.label)}</span><button type="button" aria-label="Remove">×</button>`;
      el.querySelector("button").addEventListener("click", () => {
        if (c.key === "q") mySearch.value = "";
        if (c.key === "cat") catFilter.value = "all";
        if (c.key === "status") statusFilter.value = "all";
        renderMyListings();
      });
      myChips.appendChild(el);
    });
  }

  function updateStats(all) {
    const active = all.filter((x) => x.status === "available").length;
    const hidden = all.filter((x) => x.status === "hidden").length;

    statActive.textContent = String(active);
    statHidden.textContent = String(hidden);
  }

  async function renderPayments() {
  try {
    const list = await api("/payments/seller/services?limit=200");
    const payments = Array.isArray(list) ? list : [];

    const f = (methodFilter.value || "all").toLowerCase();
    const filtered = (f === "all")
      ? payments
      : payments.filter(x => (x.method || "").toLowerCase() === f);

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
        <td>${escapeHtml(x.item || "—")}</td>
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

  // utils
  function formatBDT(n) {
    const s = Math.round(Number(n || 0)).toString();
    const withComma = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `BDT ${withComma}`;
  }

  function statusPill(status) {
    if (status === "available") return { label: "Active", cls: "ok" };
    if (status === "sold") return { label: "Completed", cls: "warn" };
    if (status === "hidden") return { label: "Hidden", cls: "bad" };
    return { label: "Status", cls: "" };
  }

  function supportLabel(v) {
    if (v === "both") return "Car & Bike";
    return v === "bike" ? "Bike" : "Car";
  }

  function capitalize(s) {
    const x = String(s || "");
    return x ? x[0].toUpperCase() + x.slice(1) : x;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function escapeAttr(str) { return escapeHtml(str).replaceAll("`", "&#096;"); }

  function showToast(message, type) {
    toast.textContent = message;
    toast.classList.remove("ok", "bad", "show");
    toast.classList.add(type === "ok" ? "ok" : "bad", "show");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => toast.classList.remove("show"), 2200);
  }
})();
