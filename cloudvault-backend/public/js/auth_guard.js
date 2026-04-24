// js/auth_guard.js
(function () {
  const token = localStorage.getItem("access_token");

  if (!token) {
    // No token → force login
    window.location.replace("index.html");
    return;
  }

  // Optional: basic JWT shape check (not full validation)
  const parts = token.split(".");
  if (parts.length !== 3) {
    localStorage.removeItem("access_token");
    window.location.replace("index.html");
  }
})();
