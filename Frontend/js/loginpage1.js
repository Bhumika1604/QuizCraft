/* =========================================================
   QUIZCRAFT — LOGINPAGE1.JS
   Fully self-contained: navbar scroll/menu, dark mode,
   password show/hide, button ripple, and client-side
   validation before a Django backend takes over the POST.
   ========================================================= */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    setYear();
    initNavbarScroll();
    initMobileMenu();
    initThemeToggle();
    initPasswordToggle();
    initRipple();
    initLoginValidation();
    initGoogleButton();
    initForgotPasswordLink();
  }

  /* ---------- Forgot password (see the BUG FIX comment on the link in loginpage1.html) ---------- */
  function initForgotPasswordLink() {
    const link = document.getElementById('lp1ForgotPassword');
    const alertBox = document.getElementById('lp1Alert');
    if (!link) return;

    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (!alertBox) return;
      alertBox.textContent = 'Self-service password reset isn\'t available yet — please contact your faculty administrator to reset your password.';
      alertBox.classList.remove('d-none');
    });
  }

  /* ---------- Footer year ---------- */
  function setYear() {
    const yearEl = document.getElementById('lp1Year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  }

  /* ---------- Navbar shrink on scroll ---------- */
  function initNavbarScroll() {
    const navbar = document.getElementById('lp1Navbar');
    if (!navbar) return;

    const onScroll = () => {
      navbar.classList.toggle('scrolled', window.scrollY > 40);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Mobile burger menu ---------- */
  function initMobileMenu() {
    const burger = document.getElementById('lp1Burger');
    const navLinks = document.getElementById('lp1NavLinks');
    if (!burger || !navLinks) return;

    burger.addEventListener('click', () => {
      burger.classList.toggle('open');
      navLinks.classList.toggle('open');
    });

    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        burger.classList.remove('open');
        navLinks.classList.remove('open');
      });
    });
  }

  /* ---------- Dark mode toggle (in-memory; no storage APIs used) ---------- */
  let lp1CurrentTheme = 'light';

  function initThemeToggle() {
    const toggle = document.getElementById('lp1ThemeToggle');
    if (!toggle) return;
    const icon = toggle.querySelector('i');

    toggle.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-lp1-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-lp1-theme');
        lp1CurrentTheme = 'light';
      } else {
        document.documentElement.setAttribute('data-lp1-theme', 'dark');
        lp1CurrentTheme = 'dark';
      }
      if (icon) {
        icon.classList.toggle('bi-moon-stars-fill', lp1CurrentTheme === 'light');
        icon.classList.toggle('bi-sun-fill', lp1CurrentTheme === 'dark');
      }
    });
  }

  /* ---------- Show / hide password ---------- */
  function initPasswordToggle() {
    const toggleBtn = document.getElementById('lp1PasswordToggle');
    const passwordInput = document.getElementById('lp1Password');
    if (!toggleBtn || !passwordInput) return;

    toggleBtn.addEventListener('click', () => {
      const icon = toggleBtn.querySelector('i');
      const isHidden = passwordInput.type === 'password';

      passwordInput.type = isHidden ? 'text' : 'password';
      toggleBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');

      if (icon) {
        icon.classList.toggle('bi-eye', !isHidden);
        icon.classList.toggle('bi-eye-slash', isHidden);
      }
    });
  }

  /* ---------- Button ripple ---------- */
  function initRipple() {
    document.querySelectorAll('.lp1-submit-btn, .lp1-google-btn').forEach((btn) => {
      btn.addEventListener('click', function (e) {
        const rect = this.getBoundingClientRect();
        const ripple = document.createElement('span');
        const size = Math.max(rect.width, rect.height);

        ripple.className = 'lp1-ripple-effect';
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';

        this.appendChild(ripple);
        setTimeout(() => ripple.remove(), 650);
      });
    });
  }

  /* ---------- Client-side validation (Django takes over the POST) ---------- */
  function initLoginValidation() {
    const form = document.getElementById('lp1LoginForm');
    const emailInput = document.getElementById('lp1Email');
    const passwordInput = document.getElementById('lp1Password');
    const emailError = document.getElementById('lp1EmailError');
    const passwordError = document.getElementById('lp1PasswordError');
    const alertBox = document.getElementById('lp1Alert');
    if (!form) return;

    form.addEventListener("submit", function(e){

    e.preventDefault();

    let valid = true;

    clearFieldError(emailInput, emailError);
    clearFieldError(passwordInput, passwordError);
    hideAlert(alertBox);

    const emailValue = emailInput.value.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if(!emailPattern.test(emailValue)){
        setFieldError(emailInput, emailError, "Enter valid email");
        valid = false;
    }

    if(passwordInput.value === ""){
        setFieldError(passwordInput, passwordError, "Enter password");
        valid = false;
    }

    if(!valid) return;

    fetch("http://127.0.0.1:8000/users/login/",{
        method:"POST",
        headers:{
            "Content-Type":"application/json"
        },
        body:JSON.stringify({
            email: emailValue,
            password: passwordInput.value
        })
    })
    .then(res => res.json())
    .then(data => {
        if(data.status === "success"){
            // BUG FIX: previously nothing about the logged-in user was
            // kept after login, so every other page had no way to know
            // WHO was using it (js/dashboard.js always showed the first
            // user in MongoDB, js/quiz.js hardcoded "Bhumika" as the
            // student name on every submission). We now stash the
            // profile the backend just returned so later pages
            // (student_dashboard.html, quiz.html, faculty pages) can
            // read it back with QC-style localStorage, same in-memory-
            // safe pattern already used elsewhere in this project.
            try {
                localStorage.setItem("quizcraft_user", JSON.stringify({
                    name: data.name,
                    email: data.email,
                    role: data.role
                }));
            } catch (e) {
                // localStorage unavailable (private browsing etc.) —
                // login still succeeds, later pages just fall back to
                // their own defaults.
            }

            alert("Login Successful");

            // BUG FIX: login always redirected to student_dashboard.html
            // even for faculty accounts. Route based on the role the
            // backend returned instead.
            window.location.href = data.role === "faculty"
                ? "faculty_dashboard.html"
                : "student_dashboard.html";
        } else {
            alert(data.message);
        }
    })
    .catch(err => {
        console.log(err);
        alert("Server Error");
    });

});   // <-- इथेच eventListener संपतो

[emailInput, passwordInput].forEach((input) => {
    if (!input) return;
    const errorEl = input === emailInput ? emailError : passwordError;
    input.addEventListener("input", () => clearFieldError(input, errorEl));
});

}   // <-- initLoginValidation() function इथे संपते

  function setFieldError(input, errorEl, message) {
    if (input) input.classList.add('is-invalid');
    if (errorEl) errorEl.textContent = message;
  }
  function clearFieldError(input, errorEl) {
    if (input) input.classList.remove('is-invalid');
    if (errorEl) errorEl.textContent = '';
  }
  function hideAlert(alertEl) {
    if (!alertEl) return;
    alertEl.classList.add('d-none');
    alertEl.textContent = '';
  }

  /* =========================================================
     GOOGLE SIGN-IN (real, via Google Identity Services)
     -----------------------------------------------------------
     WHY: this used to just show a "UI only" alert. Google
     Identity Services (loaded in loginpage1.html via
     https://accounts.google.com/gsi/client) opens Google's own
     real sign-in popup and hands back a signed ID token — we send
     that token to users/views.py's google_login(), which asks
     Google to confirm it's genuine before logging the user in.

     SETUP REQUIRED: GOOGLE_CLIENT_ID below is a placeholder. Get a
     real one from https://console.cloud.google.com/apis/credentials
     (OAuth 2.0 Client ID, type "Web application") and paste it here
     AND into the matching constant in backend/settings.py — both
     must be the same value for verification to succeed.
     ========================================================= */
  const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com';

  function initGoogleButton() {
    const googleBtn = document.getElementById('lp1GoogleLogin');
    const alertBox = document.getElementById('lp1Alert');
    if (!googleBtn) return;

    function showAlert(message) {
      if (!alertBox) return;
      alertBox.textContent = message;
      alertBox.classList.remove('d-none');
    }

    // Sends the Google ID token to the backend for verification +
    // login, then follows the exact same "store session, route by
    // role" path as a normal password login (see the login fetch
    // handler above).
    function handleGoogleCredential(response) {
      fetch('http://127.0.0.1:8000/users/google-login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.status !== 'success') {
            showAlert(data.message || 'Google sign-in failed.');
            return;
          }

          try {
            localStorage.setItem('quizcraft_user', JSON.stringify({
              name: data.name,
              email: data.email,
              role: data.role,
            }));
          } catch (e) { /* localStorage unavailable */ }

          window.location.href = data.role === 'faculty'
            ? 'faculty_dashboard.html'
            : 'student_dashboard.html';
        })
        .catch((err) => {
          console.log(err);
          showAlert('Network error — could not reach the server.');
        });
    }

    googleBtn.addEventListener('click', () => {
      // window.google is injected by the GSI <script> tag in
      // loginpage1.html. If it hasn't loaded yet (slow network, or
      // ad-blockers commonly block Google's script), fail gracefully
      // instead of throwing a console error.
      if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
        showAlert('Google Sign-In is still loading — please try again in a moment.');
        return;
      }

      if (GOOGLE_CLIENT_ID.indexOf('YOUR_GOOGLE_OAUTH_CLIENT_ID') === 0) {
        showAlert('Google Sign-In needs a Client ID configured by the site owner before it can be used.');
        return;
      }

      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
      });
      google.accounts.id.prompt(); // opens Google's real sign-in popup/One Tap
    });
  }
})();
