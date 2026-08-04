/* =========================================================
   QUIZCRAFT — REGISTERPAGE1.JS
   Fully self-contained: navbar scroll/menu, dark mode,
   password show/hide (x2), scroll reveal, button ripple,
   password strength meter, and full client-side validation
   that disables Create Account until every rule passes.
   ========================================================= */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    setYear();
    initNavbarScroll();
    initMobileMenu();
    initThemeToggle();
    initScrollReveal();
    initPasswordToggles();
    initRipple();
    initGoogleButton();
    initRegisterValidation();
  }

  /* ---------- Footer year ---------- */
  function setYear() {
    const yearEl = document.getElementById('rp1Year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  }

  /* ---------- Navbar shrink on scroll ---------- */
  function initNavbarScroll() {
    const navbar = document.getElementById('rp1Navbar');
    if (!navbar) return;
    const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Mobile burger menu ---------- */
  function initMobileMenu() {
    const burger = document.getElementById('rp1Burger');
    const navLinks = document.getElementById('rp1NavLinks');
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
  let rp1CurrentTheme = 'light';

  function initThemeToggle() {
    const toggle = document.getElementById('rp1ThemeToggle');
    if (!toggle) return;
    const icon = toggle.querySelector('i');

    toggle.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-rp1-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-rp1-theme');
        rp1CurrentTheme = 'light';
      } else {
        document.documentElement.setAttribute('data-rp1-theme', 'dark');
        rp1CurrentTheme = 'dark';
      }
      if (icon) {
        icon.classList.toggle('bi-moon-stars-fill', rp1CurrentTheme === 'light');
        icon.classList.toggle('bi-sun-fill', rp1CurrentTheme === 'dark');
      }
    });
  }

  /* ---------- Scroll reveal (fade up) ---------- */
  function initScrollReveal() {
    const items = document.querySelectorAll('[data-reveal]');
    if (!items.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const delay = el.getAttribute('data-reveal-delay') || 0;
            setTimeout(() => el.classList.add('revealed'), Number(delay));
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    items.forEach((item) => observer.observe(item));
  }

  /* ---------- Show / hide password (both fields) ---------- */
  function initPasswordToggles() {
    wireToggle('rp1PasswordToggle', 'rp1Password');
    wireToggle('rp1ConfirmPasswordToggle', 'rp1ConfirmPassword');

    function wireToggle(btnId, inputId) {
      const toggleBtn = document.getElementById(btnId);
      const input = document.getElementById(inputId);
      if (!toggleBtn || !input) return;

      toggleBtn.addEventListener('click', () => {
        const icon = toggleBtn.querySelector('i');
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        toggleBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
        if (icon) {
          icon.classList.toggle('bi-eye', !isHidden);
          icon.classList.toggle('bi-eye-slash', isHidden);
        }
      });
    }
  }

  /* ---------- Button ripple ---------- */
  function initRipple() {
    document.querySelectorAll('.rp1-submit-btn, .rp1-google-btn').forEach((btn) => {
      btn.addEventListener('click', function (e) {
        if (this.disabled) return;
        const rect = this.getBoundingClientRect();
        const ripple = document.createElement('span');
        const size = Math.max(rect.width, rect.height);

        ripple.className = 'rp1-ripple-effect';
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';

        this.appendChild(ripple);
        setTimeout(() => ripple.remove(), 650);
      });
    });
  }

  /* =========================================================
     GOOGLE SIGN-IN (real, via Google Identity Services)
     -----------------------------------------------------------
     WHY: this used to just show a "UI only" alert. Same real flow
     as js/loginpage1.js: Google Identity Services opens Google's
     sign-in popup, hands back a signed ID token, and
     users/views.py's google_login() verifies it with Google before
     finding-or-creating the account and logging the user straight
     in — so "Continue with Google" on the register page skips the
     manual form entirely, same as most real sites.

     SETUP REQUIRED: see the matching note in js/loginpage1.js —
     GOOGLE_CLIENT_ID must be replaced with a real Client ID from
     Google Cloud Console, matching backend/settings.py.
     ========================================================= */
  const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com';

  function initGoogleButton() {
    const googleBtn = document.getElementById('rp1GoogleRegister');
    const alertBox = document.getElementById('rp1Alert');
    if (!googleBtn) return;

    function showAlert(message) {
      if (!alertBox) return;
      alertBox.textContent = message;
      alertBox.classList.remove('d-none');
    }

    function handleGoogleCredential(response) {
      fetch('http://127.0.0.1:8000/users/google-login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.status !== 'success') {
            showAlert(data.message || 'Google sign-up failed.');
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
      google.accounts.id.prompt();
    });
  }

  /* ---------- Full registration validation ---------- */
  function initRegisterValidation() {
    const form = document.getElementById('rp1RegisterForm');
    if (!form) return;

    const fullName = document.getElementById('rp1FullName');
    const email = document.getElementById('rp1Email');
    const phone = document.getElementById('rp1Phone');
    const role = document.getElementById('rp1Role');
    const password = document.getElementById('rp1Password');
    const confirmPassword = document.getElementById('rp1ConfirmPassword');
    const terms = document.getElementById('rp1Terms');
    const submitBtn = document.getElementById('rp1RegisterSubmit');
    const alertBox = document.getElementById('rp1Alert');

    const errors = {
      fullName: document.getElementById('rp1FullNameError'),
      email: document.getElementById('rp1EmailError'),
      phone: document.getElementById('rp1PhoneError'),
      role: document.getElementById('rp1RoleError'),
      password: document.getElementById('rp1PasswordError'),
      confirmPassword: document.getElementById('rp1ConfirmPasswordError'),
      terms: document.getElementById('rp1TermsError'),
    };

    const strengthFill = document.getElementById('rp1StrengthFill');
    const strengthLabel = document.getElementById('rp1StrengthLabel');
    const rulesList = document.getElementById('rp1RulesList');

    // Only allow digits in the phone field, capped at 10
    phone.addEventListener('input', () => {
      phone.value = phone.value.replace(/\D/g, '').slice(0, 10);
      validateAll();
    });

    function getPasswordRules(value) {
      return {
        length: value.length >= 8,
        upper: /[A-Z]/.test(value),
        lower: /[a-z]/.test(value),
        number: /[0-9]/.test(value),
        special: /[^A-Za-z0-9]/.test(value),
      };
    }

    function updateStrengthMeter(value) {
      const rules = getPasswordRules(value);
      const passedCount = Object.values(rules).filter(Boolean).length;

      if (rulesList) {
        rulesList.querySelectorAll('li').forEach((li) => {
          const rule = li.getAttribute('data-rule');
          li.classList.toggle('rule-met', !!rules[rule]);
        });
      }

      const percentages = [0, 20, 40, 60, 80, 100];
      const labels = ['Password strength', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
      const colors = ['#EF4444', '#EF4444', '#F59E0B', '#F59E0B', '#10B981', '#10B981'];

      if (strengthFill) {
        strengthFill.style.width = percentages[passedCount] + '%';
        strengthFill.style.background = colors[passedCount];
      }
      if (strengthLabel) {
        strengthLabel.textContent = value ? labels[passedCount] : 'Password strength';
      }

      return rules;
    }

    function isFullNameValid() {
      return fullName.value.trim().length >= 2;
    }
    function isEmailValid() {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
    }
    function isPhoneValid() {
      return /^[0-9]{10}$/.test(phone.value.trim());
    }
    function isRoleValid() {
      return role.value === 'student' || role.value === 'faculty';
    }
    function isPasswordValid() {
      const rules = getPasswordRules(password.value);
      return Object.values(rules).every(Boolean);
    }
    function isConfirmValid() {
      return confirmPassword.value.length > 0 && confirmPassword.value === password.value;
    }
    function isTermsValid() {
      return terms.checked;
    }

    function validateAll(showErrors) {
      updateStrengthMeter(password.value);

      const checks = {
        fullName: isFullNameValid(),
        email: isEmailValid(),
        phone: isPhoneValid(),
        role: isRoleValid(),
        password: isPasswordValid(),
        confirmPassword: isConfirmValid(),
        terms: isTermsValid(),
      };

      if (showErrors) {
        setError(fullName, errors.fullName, checks.fullName ? '' : 'Enter your full name (min 2 characters).');
        setError(email, errors.email, checks.email ? '' : 'Enter a valid email address.');
        setError(phone, errors.phone, checks.phone ? '' : 'Enter a valid 10-digit phone number.');
        setError(role, errors.role, checks.role ? '' : 'Select your role.');
        setError(password, errors.password, checks.password ? '' : 'Password does not meet all requirements.');
        setError(confirmPassword, errors.confirmPassword, checks.confirmPassword ? '' : 'Passwords do not match.');
        errors.terms.textContent = checks.terms ? '' : 'You must accept the Terms & Conditions.';
      } else {
        // Live-clear as the user types, but don't nag before first submit attempt
        [fullName, email, phone, role, password, confirmPassword].forEach((input) => {
          if (input.classList.contains('is-invalid') || input.classList.contains('is-valid')) {
            input.classList.remove('is-invalid', 'is-valid');
          }
        });
      }

      const allValid = Object.values(checks).every(Boolean);
      if (submitBtn) submitBtn.disabled = !allValid;

      return allValid;
    }

    function setError(input, errorEl, message) {
      if (input) input.classList.toggle('is-invalid', !!message);
      if (input && !message && input.value) input.classList.add('is-valid');
      if (errorEl) errorEl.textContent = message;
    }

    // Live validation as the user types (keeps submit button gated correctly)
    [fullName, email, phone, role, password, confirmPassword, terms].forEach((input) => {
      const evtName = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(evtName, () => validateAll(false));
    });

    // On submit, run the full check and show inline messages if anything fails
    form.addEventListener('submit', async (e) => {

    e.preventDefault();

    const valid = validateAll(true);

    if (!valid) {
        if (alertBox) {
            alertBox.textContent =
                "Please fix the highlighted fields before creating your account.";
            alertBox.classList.remove("d-none");
        }
        return;
    }

    try {

        const response = await fetch("http://127.0.0.1:8000/users/register/", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                name: fullName.value,

                email: email.value,

                password: password.value,

                role: role.value

            })

        });

        const data = await response.json();

        if (data.status === "success") {

            alert("Registration Successful!");

            window.location.href = "loginpage1.html";

        } else {

            alert(data.message);

        }

    } catch (err) {

        console.error(err);

        alert("Cannot connect to Django Server");

    }

});

    // Initial state: button disabled until the form is valid
    validateAll(false);
  }
})();
