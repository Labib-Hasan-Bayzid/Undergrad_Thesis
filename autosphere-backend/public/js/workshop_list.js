(function () {
  const listEl = document.getElementById("workshopList");
  const searchEl = document.getElementById("searchWorkshop");
  const btnClear = document.getElementById("btnClearSearch");
  const emptyState = document.getElementById("emptyState");
  const btnReset = document.getElementById("btnReset");
  const btnEmptyReset = document.getElementById("btnEmptyReset");
  const resultMeta = document.getElementById("resultMeta");

const API_BASE = "http://localhost:5001";
let workshops = [];

  // Same behavior as your current page
 

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function goToWorkshop(w) {
    const url =
      `workshop_profile_booking.html?workshop_id=${encodeURIComponent(w.id)}&name=${encodeURIComponent(w.name)}`;
    window.location.href = url;
  }

  function setMeta(count) {
    resultMeta.textContent = `${count} workshop${count === 1 ? "" : "s"}`;
  }

  //
  async function loadWorkshops() {
  const res = await fetch(`${API_BASE}/services/workshops`);
  if (!res.ok) throw new Error("Failed to load workshops");
  const data = await res.json();

  workshops = (Array.isArray(data) ? data : []).map((x) => ({
    id: x.id,
    name: x.name || "Workshop",
  }));
}
//

  function render(items) {
    listEl.innerHTML = "";
    setMeta(items.length);

    if (!items.length) {
      emptyState.hidden = false;
      listEl.hidden = true;
      return;
    }

    emptyState.hidden = true;
    listEl.hidden = false;

    items.forEach((w) => {
      const card = document.createElement("div");
      card.className = "card";
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");

      // Only workshop name shown (same as before)
      card.innerHTML = `
        <p class="name">${escapeHtml(w.name)}</p>
        <span class="chev" aria-hidden="true">›</span>
      `;

      card.addEventListener("click", () => goToWorkshop(w));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToWorkshop(w);
        }
      });

      listEl.appendChild(card);
    });
  }

  function applySearch() {
    const q = (searchEl.value || "").trim().toLowerCase();
    if (!q) return render(workshops);

    const filtered = workshops.filter((w) => w.name.toLowerCase().includes(q));
    render(filtered);
  }

  searchEl.addEventListener("input", applySearch);

  btnClear.addEventListener("click", () => {
    searchEl.value = "";
    render(workshops);
    searchEl.focus();
  });

  btnReset.addEventListener("click", () => {
    searchEl.value = "";
    render(workshops);
  });

  btnEmptyReset.addEventListener("click", () => {
    searchEl.value = "";
    render(workshops);
  });


// Init
loadWorkshops()
  .then(() => render(workshops))
  .catch((e) => {
    console.error(e);
    render([]);
  });

})();
