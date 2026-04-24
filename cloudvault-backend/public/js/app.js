// js/app.js
const API = "http://localhost:5000";

/** Helper: JSON API call (throws readable Error on non-2xx) */
async function apiJson(path, method, bodyObj) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch {}

  if (!res.ok) {
    const msg = data?.message || data?.error || `Request failed (${res.status})`;
    throw new Error(Array.isArray(msg) ? msg.join(", ") : msg);
  }
  return data;
}

function decodeJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  try {
    const json = atob(payload);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

(() => {
  const tabs = document.querySelectorAll(".tab");
  const views = document.querySelectorAll(".view");
  const alertBox = document.getElementById("alert");

  const forgotModal = document.getElementById("forgotModal");

  const formLogin = document.getElementById("form-login");
  const formSignup = document.getElementById("form-signup");
  const formForgot = document.getElementById("form-forgot");

  const formReset = document.getElementById("form-reset");
  const resetOtpInput = document.getElementById("resetOtp");
  const resetNewPasswordInput = document.getElementById("resetNewPassword");

  let resetEmailCache = null;

  function showAlert(message, type = "ok") {
    alertBox.className = "alert";
    if (type === "error") alertBox.classList.add("is-error");
    else alertBox.classList.add("is-ok");
    alertBox.textContent = message;
  }

  function clearAlert() {
    alertBox.className = "alert";
    alertBox.textContent = "";
  }

  function switchView(viewName) {
    clearAlert();
    tabs.forEach((t) => {
      const isActive = t.dataset.view === viewName;
      t.classList.toggle("is-active", isActive);
      t.setAttribute("aria-selected", String(isActive));
    });
    views.forEach((v) => {
      v.classList.toggle("is-visible", v.dataset.view === viewName);
    });
  }

  function isValidEmail(email) {
    const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/;
    if (!re.test(email)) return false;
    const tld = email.split(".").pop();
    if (!tld || tld.length < 2) return false;
    return true;
  }

  function resetForgotFlowUI() {
    resetEmailCache = null;
    if (formForgot) formForgot.classList.remove("hidden");
    if (formReset) formReset.classList.add("hidden");

    const forgotEmail = document.getElementById("forgotEmail");
    if (forgotEmail) forgotEmail.value = "";
    if (resetOtpInput) resetOtpInput.value = "";
    if (resetNewPasswordInput) resetNewPasswordInput.value = "";
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));

  document.querySelectorAll("[data-switch]").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.switch));
  });

  document.querySelectorAll("[data-open='forgot']").forEach((btn) => {
    btn.addEventListener("click", () => {
      clearAlert();
      resetForgotFlowUI();
      forgotModal.classList.add("is-open");
      forgotModal.setAttribute("aria-hidden", "false");
      document.getElementById("forgotEmail")?.focus();
    });
  });

  document.querySelectorAll("[data-close='forgot']").forEach((btn) => {
    btn.addEventListener("click", () => {
      resetForgotFlowUI();
      forgotModal.classList.remove("is-open");
      forgotModal.setAttribute("aria-hidden", "true");
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && forgotModal.classList.contains("is-open")) {
      resetForgotFlowUI();
      forgotModal.classList.remove("is-open");
      forgotModal.setAttribute("aria-hidden", "true");
    }
  });

  document.querySelectorAll("[data-toggle='password']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.parentElement.querySelector("input");
      if (!input) return;
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      btn.textContent = isPassword ? "Hide" : "Show";
    });
  });

  // LOGIN
  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAlert();

    const email = document.getElementById("loginEmail").value.trim();
    const pass = document.getElementById("loginPassword").value;

    if (!email || !pass) return showAlert("Please fill in all fields.", "error");
    if (!isValidEmail(email)) return showAlert("Please enter a valid email.", "error");

    try {
      const data = await apiJson("/auth/login", "POST", { email, password: pass });

      // ✅ store token
      localStorage.setItem("access_token", data.access_token);

      // ✅ NEW: store vault user id + email (MUST be here, not top-level)
      const decoded = decodeJwt(data.access_token);
      if (decoded?.sub) localStorage.setItem("vault_user_id", decoded.sub);
      if (decoded?.email) localStorage.setItem("vault_user_email", decoded.email);

      showAlert("Login successful.", "ok");
      setTimeout(() => (window.location.href = "dashboard.html"), 100);
    } catch (err) {
      showAlert(err.message || "Login failed", "error");
    }
  });

  // SIGNUP
  formSignup.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAlert();

    const name = document.getElementById("fullName").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const pass = document.getElementById("signupPassword").value;
    const cpass = document.getElementById("confirmPassword").value;
    const agree = document.getElementById("agree").checked;

    if (!name || !phone || !email || !pass || !cpass) return showAlert("Please fill in all fields.", "error");
    if (!isValidEmail(email)) return showAlert("Please enter a valid email.", "error");
    if (pass.length < 8) return showAlert("Password must be at least 8 characters.", "error");
    if (pass !== cpass) return showAlert("Passwords do not match.", "error");
    if (!agree) return showAlert("Please agree to the terms and privacy policy.", "error");

    try {
      await apiJson("/auth/register", "POST", {
        fullName: name,
        phone,
        email,
        password: pass,
        confirmPassword: cpass,
      });
      showAlert("Account created. Please login.", "ok");
      switchView("login");
    } catch (err) {
      showAlert(err.message || "Registration failed.", "error");
    }
  });

  // FORGOT -> send OTP
  formForgot.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAlert();

    const email = document.getElementById("forgotEmail").value.trim();
    if (!email) return showAlert("Please enter your email.", "error");
    if (!isValidEmail(email)) return showAlert("Please enter a valid email.", "error");

    try {
      await apiJson("/auth/forgot-password", "POST", { email });

      resetEmailCache = email;
      formForgot.classList.add("hidden");
      formReset.classList.remove("hidden");
      showAlert("OTP sent to your email.", "ok");
    } catch (err) {
      showAlert(err.message || "Failed to send OTP.", "error");
    }
  });

  // RESET with OTP
  formReset.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAlert();

    const otp = (resetOtpInput?.value || "").trim();
    const newPassword = resetNewPasswordInput?.value || "";

    if (!resetEmailCache) return showAlert("Missing email. Please try again.", "error");
    if (!otp) return showAlert("Please enter OTP.", "error");
    if (newPassword.length < 8) return showAlert("Password must be at least 8 characters.", "error");

    try {
      await apiJson("/auth/reset-password", "POST", {
        email: resetEmailCache,
        otp,
        newPassword,
      });

      showAlert("Password reset successful. Please login.", "ok");

      setTimeout(() => {
        resetForgotFlowUI();
        forgotModal.classList.remove("is-open");
        forgotModal.setAttribute("aria-hidden", "true");
        switchView("login");
      }, 250);
    } catch (err) {
      showAlert(err.message || "OTP verification failed.", "error");
    }
  });

  switchView("login");
})();