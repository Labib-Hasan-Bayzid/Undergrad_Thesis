const AUTOSPHERE_API = "http://localhost:5001";

(async function () {
  const el = document.getElementById("subBanner");
  if (!el) return;

  const vaultUserId = localStorage.getItem("vault_user_id");
  if (!vaultUserId) {
    el.textContent = "Subscription: unknown";
    return;
  }

  try {
    const res = await fetch(
      `${AUTOSPHERE_API}/subscriptions/status?vaultUserId=${encodeURIComponent(vaultUserId)}`,
      {
        headers: { "x-cloudvault-key": "super-long-random-secret" },
      }
    );

    const data = await res.json().catch(() => null);
    if (!res.ok || !data) throw new Error(data?.message || "Status failed");

    el.textContent = data.active
      ? `${String(data.plan).toUpperCase()} active (ends: ${data.endsAt})`
      : "Subscription expired";
  } catch {
    el.textContent = "Subscription: unavailable";
  }
})();