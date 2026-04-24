(function () {
  const $ = (id) => document.getElementById(id);

  // ===================== CONFIG =====================
  const API_BASE = "http://localhost:5001";
  const TOKEN_KEY = "access_token"; // used by dashboards

  async function api(path, { method = "GET", body, headers = {}, isForm = false } = {}) {
    const token = localStorage.getItem(TOKEN_KEY);

    const h = { ...headers };
    if (!isForm) h["Content-Type"] = "application/json";
    if (token) h["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: h,
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    });

    // try parse json, else text
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }

    if (!res.ok) {
      const msg = (data && (data.message || data.error)) ? (data.message || data.error) : "Request failed";
      throw new Error(msg);
    }

    return data;
  }

  function normalizeEmail(x) {
    return String(x || "").trim().toLowerCase();
  }

  function showToast(msg, type = "ok") {
    const toast = $("toast");
    toast.textContent = msg;
    toast.classList.remove("ok", "bad", "show");
    toast.classList.add(type === "ok" ? "ok" : "bad", "show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function setActiveTab(which) {
    const btnTabLogin = $("btnTabLogin");
    const btnTabSignup = $("btnTabSignup");
    const btnTabForgot = $("btnTabForgot");

    const panelLogin = $("panelLogin");
    const panelSignup = $("panelSignup");
    const panelForgot = $("panelForgot");

    [btnTabLogin, btnTabSignup, btnTabForgot].forEach(b => b.classList.remove("is-active"));
    [btnTabLogin, btnTabSignup, btnTabForgot].forEach(b => b.setAttribute("aria-selected", "false"));

    panelLogin.hidden = true;
    panelSignup.hidden = true;
    panelForgot.hidden = true;

    if (which === "login") {
      btnTabLogin.classList.add("is-active");
      btnTabLogin.setAttribute("aria-selected", "true");
      panelLogin.hidden = false;
    } else if (which === "signup") {
      btnTabSignup.classList.add("is-active");
      btnTabSignup.setAttribute("aria-selected", "true");
      panelSignup.hidden = false;
    } else {
      btnTabForgot.classList.add("is-active");
      btnTabForgot.setAttribute("aria-selected", "true");
      panelForgot.hidden = false;
    }
  }

  function togglePassword(inputEl, btnEl) {
    const isPass = inputEl.type === "password";
    inputEl.type = isPass ? "text" : "password";
    btnEl.textContent = isPass ? "Hide" : "Show";
  }

  function isSellerRole(role) {
    return role === "vehicle_seller" || role === "service_seller" || role === "spare_parts_seller";
  }

  function goByRole(role) {
    // Adjust these pages if your filenames differ
    if (role === "admin") return (window.location.href = "admin_dashboard.html");
    if (role === "vehicle_seller") return (window.location.href = "vehicle_seller_dashboard.html");
    if (role === "service_seller" || role === "spare_parts_seller") return (window.location.href = "services_seller_dashboard.html");
    return (window.location.href = "marketplace.html");
  }

  // ===================== ELEMENTS =====================
  // Tabs
  const btnTabLogin = $("btnTabLogin");
  const btnTabSignup = $("btnTabSignup");
  const btnTabForgot = $("btnTabForgot");

  // Quick links
  $("btnGotoForgot")?.addEventListener("click", () => setActiveTab("forgot"));
  $("btnGotoSignup")?.addEventListener("click", () => setActiveTab("signup"));
  $("btnGotoLogin")?.addEventListener("click", () => setActiveTab("login"));
  $("btnForgotToLogin")?.addEventListener("click", () => setActiveTab("login"));

  btnTabLogin?.addEventListener("click", () => setActiveTab("login"));
  btnTabSignup?.addEventListener("click", () => setActiveTab("signup"));
  btnTabForgot?.addEventListener("click", () => setActiveTab("forgot"));

  // Login
  const loginForm = $("loginForm");
  const loginRole = $("loginRole");
  const loginEmail = $("loginEmail");
  const loginPassword = $("loginPassword");
  const btnLoginToggle = $("btnLoginToggle");
  const rememberMe = $("rememberMe");

  btnLoginToggle?.addEventListener("click", () => togglePassword(loginPassword, btnLoginToggle));

  // Signup
  const signupForm = $("signupForm");
  const signupRole = $("signupRole");
  const sellerFields = $("sellerFields");
  const signupPassword = $("signupPassword");
  const btnSignupToggle = $("btnSignupToggle");

  btnSignupToggle?.addEventListener("click", () => togglePassword(signupPassword, btnSignupToggle));

  // Seller fields
  const sellerLocation = $("sellerLocation");
  const sellerContact = $("sellerContact");
  const sellerTin = $("sellerTin");

  // Uploads
  const tradeFile = $("tradeFile");
  const taxFile = $("taxFile");
  const btnTradeUpload = $("btnTradeUpload");
  const btnTaxUpload = $("btnTaxUpload");
  const tradeFileName = $("tradeFileName");
  const taxFileName = $("taxFileName");

  btnTradeUpload?.addEventListener("click", () => tradeFile?.click());
  btnTaxUpload?.addEventListener("click", () => taxFile?.click());

  tradeFile?.addEventListener("change", () => {
    const f = tradeFile.files && tradeFile.files[0] ? tradeFile.files[0] : null;
    tradeFileName.textContent = f ? f.name : "No file selected";
  });
  taxFile?.addEventListener("change", () => {
    const f = taxFile.files && taxFile.files[0] ? taxFile.files[0] : null;
    taxFileName.textContent = f ? f.name : "No file selected";
  });

  function updateSellerFields() {
    const role = signupRole.value;
    const seller = isSellerRole(role);
    sellerFields.hidden = !seller;

    [sellerLocation, sellerContact, sellerTin].forEach((el) => {
      if (!el) return;
      el.required = seller;
    });

    if (tradeFile) tradeFile.required = seller;
    if (taxFile) taxFile.required = seller;

    if (!seller) {
      if (tradeFile) tradeFile.value = "";
      if (taxFile) taxFile.value = "";
      if (tradeFileName) tradeFileName.textContent = "No file selected";
      if (taxFileName) taxFileName.textContent = "No file selected";
    }
  }

  signupRole?.addEventListener("change", updateSellerFields);

  // Forgot/OTP/Reset (same panel)
  const forgotForm = $("forgotForm");
  const forgotRole = $("forgotRole");
  const forgotEmail = $("forgotEmail");

  const otpBox = $("otpBox");
  const otpInput = $("otpInput");
  const newPass = $("newPass");
  const newPass2 = $("newPass2");
  const btnVerifyOtp = $("btnVerifyOtp");
  const btnResetPass = $("btnResetPass");

  let pendingResetToken = null; // received after OTP verification

  // ===================== LOGIN SUBMIT =====================
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const role = loginRole.value;
    const email = normalizeEmail(loginEmail.value);
    const password = (loginPassword.value || "").trim();

    if (!role || !email || !password) {
      showToast("Enter role, email, and password.", "bad");
      return;
    }

    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: { email, password, role },
      });

      // Save token for dashboards
      localStorage.setItem(TOKEN_KEY, data.accessToken);

      // Optional: remember role/email for convenience
      localStorage.setItem("last_role", role);
      localStorage.setItem("last_email", email);
      localStorage.setItem("user_role", role); // IMPORTANT

      showToast("Login successful.", "ok");
      setTimeout(() => goByRole(role), 350);
    } catch (err) {
      showToast(err.message || "Invalid credentials.", "bad");
    }
  });

  // ===================== SIGNUP SUBMIT =====================
  signupForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const role = signupRole.value;
    const name = ($("signupName").value || "").trim();
    const email = normalizeEmail($("signupEmail").value);
    const phone = ($("signupPhone").value || "").trim();
    const city = ($("signupCity").value || "").trim();
    const password = (signupPassword.value || "").trim();

    if (!role || !name || !email || !phone || !city || !password) {
      showToast("Please fill all required fields.", "bad");
      return;
    }

    // Build multipart form-data (works for both normal users & sellers)
    const fd = new FormData();
    fd.append("role", role);
    fd.append("name", name);
    fd.append("email", email);
    fd.append("phone", phone);
    fd.append("city", city);
    fd.append("password", password);

    if (isSellerRole(role)) {
      const loc = (sellerLocation.value || "").trim();
      const contact = (sellerContact.value || "").trim();
      const tin = (sellerTin.value || "").trim();
      const trade = tradeFile?.files?.[0] || null;
      const tax = taxFile?.files?.[0] || null;

      if (!loc || !contact || !tin) {
        showToast("Please complete all seller information.", "bad");
        return;
      }
      if (!trade) {
        showToast("Upload trade license file.", "bad");
        return;
      }
      if (!tax) {
        showToast("Upload income tax file.", "bad");
        return;
      }

      fd.append("sellerLocation", loc);
      fd.append("sellerContact", contact);
      fd.append("sellerTin", tin);

      // MUST match backend keys:
      fd.append("tradeLicenseFile", trade);
      fd.append("incomeTaxFile", tax);
    }

    try {
      const data = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        body: fd,
      }).then(async (r) => {
        const t = await r.text();
        let j = null;
        try { j = t ? JSON.parse(t) : null; } catch { j = { message: t }; }
        if (!r.ok) throw new Error((j && j.message) ? j.message : "Register failed");
        return j;
      });

      // Save token so user is immediately logged in (optional)
      localStorage.setItem(TOKEN_KEY, data.accessToken);
      localStorage.setItem("last_role", role);
      localStorage.setItem("last_email", email);
      localStorage.setItem("user_role", role); // IMPORTANT

      showToast("Account created.", "ok");
      setTimeout(() => goByRole(role), 350);
    } catch (err) {
      showToast(err.message || "Register failed.", "bad");
    }
  });

  // ===================== FORGOT: SEND OTP =====================
  forgotForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const role = forgotRole.value;
    const email = normalizeEmail(forgotEmail.value);

    if (!role || !email) {
      showToast("Enter role and email.", "bad");
      return;
    }

    try {
      await api("/auth/forgot-password", {
        method: "POST",
        body: { role, email },
      });

      // show OTP + reset inputs
      if (otpBox) otpBox.hidden = false;
      pendingResetToken = null;
      showToast("OTP sent to your email.", "ok");
    } catch (err) {
      showToast(err.message || "Account not found.", "bad");
    }
  });

  // ===================== VERIFY OTP =====================
  btnVerifyOtp?.addEventListener("click", async () => {
    const role = forgotRole.value;
    const email = normalizeEmail(forgotEmail.value);
    const otp = (otpInput.value || "").trim();

    if (!otp) return showToast("Enter OTP.", "bad");

    try {
      const data = await api("/auth/verify-otp", {
        method: "POST",
        body: { role, email, otp },
      });

      pendingResetToken = data.resetToken;
      showToast("OTP verified. Now set a new password.", "ok");
    } catch (err) {
      showToast(err.message || "Invalid OTP.", "bad");
    }
  });

  // ===================== RESET PASSWORD =====================
  btnResetPass?.addEventListener("click", async () => {
    const p1 = (newPass.value || "").trim();
    const p2 = (newPass2.value || "").trim();

    if (!pendingResetToken) return showToast("Verify OTP first.", "bad");
    if (!p1 || p1.length < 6) return showToast("Password must be at least 6 chars.", "bad");
    if (p1 !== p2) return showToast("Passwords do not match.", "bad");

    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: { resetToken: pendingResetToken, newPassword: p1 },
      });

      // clear fields and return to login
      otpInput.value = "";
      newPass.value = "";
      newPass2.value = "";
      pendingResetToken = null;
      if (otpBox) otpBox.hidden = true;

      showToast("Password reset successful.", "ok");
      setTimeout(() => setActiveTab("login"), 400);
    } catch (err) {
      showToast(err.message || "Reset failed.", "bad");
    }
  });

  // ===================== INIT =====================
  setActiveTab("login");
  updateSellerFields();

  // optional: preload last email/role
  const lastRole = localStorage.getItem("last_role");
  const lastEmail = localStorage.getItem("last_email");
  if (lastRole && loginRole) loginRole.value = lastRole;
  if (lastEmail && loginEmail) loginEmail.value = lastEmail;
})();
