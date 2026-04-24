// js/payment_details.js
const AUTOSPHERE_API = "http://localhost:5001"; // AutoSphere backend

(() => {
  const paymentAlert = document.getElementById("paymentAlert");
  const homeBtn = document.getElementById("homeBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  const planCards = Array.from(document.querySelectorAll(".plan-card"));
  const chooseBtns = Array.from(document.querySelectorAll(".choosePlanBtn"));
  const selectedPlanText = document.getElementById("selectedPlanText");

  const payNowBtn = document.getElementById("payNowBtn");

  const confirmModal = document.getElementById("confirmModal");
  const confirmText = document.getElementById("confirmText");
  const confirmPayBtn = document.getElementById("confirmPayBtn");

  let selectedPlan = null; // { planId, amount }

  function showMessage(msg, type = "err") {
    paymentAlert.className = "payment-alert is-open " + (type === "err" ? "err" : "");
    paymentAlert.textContent = msg;
    window.clearTimeout(showMessage._t);
    showMessage._t = window.setTimeout(() => {
      paymentAlert.className = "payment-alert";
      paymentAlert.textContent = "";
    }, 2600);
  }

  function openModal() {
    confirmModal.classList.add("is-open");
    confirmModal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    confirmModal.classList.remove("is-open");
    confirmModal.setAttribute("aria-hidden", "true");
  }

  confirmModal.querySelectorAll("[data-close='modal']").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });

  function setSelectedPlan(planId, amount) {
    selectedPlan = { planId, amount: Number(amount) };

    planCards.forEach((c) => c.classList.remove("is-selected"));
    const active = planCards.find((c) => c.dataset.plan === planId);
    if (active) active.classList.add("is-selected");

    selectedPlanText.textContent = `Selected: ${planId.toUpperCase()} — ৳${selectedPlan.amount}/month`;
    payNowBtn.disabled = false;
  }

  chooseBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".plan-card");
      setSelectedPlan(card.dataset.plan, card.dataset.amount);
      showMessage("Plan selected.", "ok");
    });
  });

  homeBtn.addEventListener("click", () => {
    window.location.href = "dashboard.html";
  });

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("vault_user_id");
    window.location.href = "index.html";
  });

  payNowBtn.addEventListener("click", () => {
    if (!selectedPlan) return;
    confirmText.textContent = `You selected ${selectedPlan.planId.toUpperCase()} (৳${selectedPlan.amount}/month). Continue to payment?`;
    openModal();
  });

  // ✅ ONLY correct payment init (no JWT, uses x-cloudvault-key)
  async function startSubscription(planId) {
  const vaultUserId = localStorage.getItem("vault_user_id");
  if (!vaultUserId) throw new Error("No vault user id found. Please login again.");

  const vaultEmail = localStorage.getItem("vault_user_email") || "";

  const res = await fetch(`${AUTOSPHERE_API}/payments/mfs/sslcz/init-autovault`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cloudvault-key": "super-long-random-secret",
    },
    body: JSON.stringify({ planId, vaultUserId, vaultEmail }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Payment init failed");
  if (!data?.url) throw new Error("No payment URL returned");

  window.location.href = data.url;
}

  confirmPayBtn.addEventListener("click", async () => {
    if (!selectedPlan) return;

    try {
      confirmPayBtn.disabled = true;
      await startSubscription(selectedPlan.planId);
    } catch (e) {
      showMessage(e?.message || "Payment failed to start.", "err");
      closeModal();
      confirmPayBtn.disabled = false;
    }
  });
})();