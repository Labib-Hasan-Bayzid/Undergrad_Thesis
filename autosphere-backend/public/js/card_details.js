(() => {
  const API_BASE = window.location.origin;
  const TOKEN_KEY = "access_token";
  const FALLBACK_KEY = "autosphere_saved_cards_demo";

  const $ = (id) => document.getElementById(id);

  const btnLogout = $("btnLogout");
  const cardForm = $("cardForm");
  const btnClearForm = $("btnClearForm");
  const btnRefreshCards = $("btnRefreshCards");

  const cardLabel = $("cardLabel");
  const cardHolder = $("cardHolder");
  const cardNumber = $("cardNumber");
  const expMonth = $("expMonth");
  const expYear = $("expYear");
  const cvv = $("cvv");
  const billingAddress = $("billingAddress");

  const cardsList = $("cardsList");
  const cardsEmpty = $("cardsEmpty");
  const savedCount = $("savedCount");
  const toast = $("toast");

  init();

  function init() {
    btnLogout?.addEventListener("click", logout);
    btnClearForm?.addEventListener("click", clearForm);
    btnRefreshCards?.addEventListener("click", loadCards);
    cardForm?.addEventListener("submit", onSaveCard);
    cardNumber?.addEventListener("input", onCardNumberInput);
    cvv?.addEventListener("input", onCvvInput);
    expYear?.addEventListener("input", onYearInput);

    loadCards();
  }

  function token() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function logout(e) {
    e?.preventDefault();
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = "login.html";
  }

  function onCardNumberInput() {
    const digits = onlyDigits(cardNumber.value).slice(0, 16);
    cardNumber.value = formatCardNumber(digits);
  }

  function onCvvInput() {
    cvv.value = onlyDigits(cvv.value).slice(0, 4);
  }

  function onYearInput() {
    expYear.value = onlyDigits(expYear.value).slice(0, 4);
  }

  async function onSaveCard(e) {
    e.preventDefault();

    const payload = collectForm();
    const err = validate(payload);
    if (err) {
      showToast(err, "bad");
      return;
    }

    try {
      // backend-ready attempt
      const res = await fetch(`${API_BASE}/cards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast("Card saved successfully.", "ok");
        clearForm();
        loadCards();
        return;
      }

      // fallback for frontend-only stage
      saveToLocal(payload);
      showToast("Card saved locally for frontend testing.", "ok");
      clearForm();
      loadCards();
    } catch {
      saveToLocal(payload);
      showToast("Card saved locally for frontend testing.", "ok");
      clearForm();
      loadCards();
    }
  }

  function collectForm() {
    return {
      label: cardLabel.value.trim(),
      holderName: cardHolder.value.trim(),
      cardNumber: onlyDigits(cardNumber.value),
      expMonth: expMonth.value,
      expYear: expYear.value.trim(),
      cvv: onlyDigits(cvv.value),
      billingAddress: billingAddress.value.trim(),
    };
  }

  function validate(data) {
    if (!data.label) return "Card label is required.";
    if (!data.holderName) return "Card holder name is required.";
    if (!/^\d{13,16}$/.test(data.cardNumber)) return "Enter a valid card number.";
    if (!data.expMonth) return "Expiry month is required.";
    if (!/^\d{4}$/.test(data.expYear)) return "Enter a valid expiry year.";
    if (!/^\d{3,4}$/.test(data.cvv)) return "Enter a valid CVV.";
    return "";
  }

  async function loadCards() {
    try {
      const res = await fetch(`${API_BASE}/cards`, {
        headers: {
          ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        },
      });

      if (res.ok) {
        const list = await res.json();
        renderCards(Array.isArray(list) ? list : []);
        return;
      }
    } catch {}

    const local = getLocalCards();
    renderCards(local);
  }

  function renderCards(items) {
    cardsList.innerHTML = "";
    savedCount.textContent = `${items.length} card${items.length === 1 ? "" : "s"}`;

    if (!items.length) {
      cardsEmpty.hidden = false;
      return;
    }

    cardsEmpty.hidden = true;

    items.forEach((item, idx) => {
      const el = document.createElement("article");
      el.className = "card-item";

      const maskedNumber = maskCard(item.cardNumber || "");
      const expiry = `${item.expMonth || "--"}/${item.expYear || "----"}`;

      el.innerHTML = `
        <div class="card-top">
          <div>
            <h3 class="card-title">${escapeHtml(item.label || "Saved Card")}</h3>
            <p class="card-sub">${escapeHtml(item.holderName || "—")}</p>
          </div>
          <span class="badge">Saved</span>
        </div>

        <div class="card-meta">
          <div class="meta-box">
            <div class="meta-label">Card Number</div>
            <div class="meta-value">${escapeHtml(maskedNumber)}</div>
          </div>

          <div class="meta-box">
            <div class="meta-label">Expiry</div>
            <div class="meta-value">${escapeHtml(expiry)}</div>
          </div>

          <div class="meta-box">
            <div class="meta-label">CVV</div>
            <div class="meta-value">***</div>
          </div>

          <div class="meta-box">
            <div class="meta-label">Billing Address</div>
            <div class="meta-value">${escapeHtml(item.billingAddress || "—")}</div>
          </div>
        </div>

                <div class="card-actions">
  ${item.canView ? `<button class="btn btn-primary" type="button" data-view="${item.id}">View</button>` : ""}
  <button class="btn btn-ghost" type="button" data-del="${idx}">Delete</button>
</div>
      `;
     

            el.querySelector("[data-del]")?.addEventListener("click", async () => {
  const ok = window.confirm("Are you sure you want to delete this saved card?");
  if (!ok) return;

  try {
    const auth = token();
    if (!auth) {
      showToast("Please login again.", "bad");
      return;
    }

    const targetId = item.id;
    const res = await fetch(`${API_BASE}/cards/${targetId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${auth}`,
      },
    });

    if (!res.ok) {
      throw new Error("Delete failed");
    }

    showToast("Saved card removed.", "ok");
    loadCards();
  } catch (err) {
    console.error(err);
    showToast("Could not delete saved card.", "bad");
  }
});

//
      el.querySelector("[data-view]")?.addEventListener("click", async () => {
  const targetId = item.id;
  if (!targetId) {
    showToast("No model file available for this card.", "bad");
    return;
  }

  const auth = token();
  if (!auth) {
    showToast("Please login again.", "bad");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/cards/${targetId}/view`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${auth}`,
      },
    });

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "View failed");
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${item.label || "card-details"}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(url);
    showToast("Decrypted file downloaded.", "ok");
  } catch (err) {
    console.error(err);
    showToast("Could not download decrypted file.", "bad");
  }
});



      cardsList.appendChild(el);
    });
  }

  function clearForm() {
    cardForm.reset();
    cardNumber.value = "";
    cvv.value = "";
    expYear.value = "";
  }

  function saveToLocal(data) {
    const cards = getLocalCards();
    cards.unshift({
      ...data,
      createdAt: Date.now(),
    });
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(cards));
  }

  function getLocalCards() {
    try {
      return JSON.parse(localStorage.getItem(FALLBACK_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function deleteLocalCard(index) {
    const cards = getLocalCards();
    cards.splice(index, 1);
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(cards));
  }

  function onlyDigits(v) {
    return String(v || "").replace(/\D/g, "");
  }

  function formatCardNumber(v) {
    return v.replace(/(.{4})/g, "$1 ").trim();
  }

  function maskCard(v) {
    const s = onlyDigits(v);
    if (!s) return "—";
    const last4 = s.slice(-4);
    return `**** **** **** ${last4}`;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showToast(message, type = "ok") {
    toast.textContent = message;
    toast.className = `floating-toast ${type === "ok" ? "ok" : "bad"} show`;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.className = "floating-toast";
    }, 2200);
  }
})();