/* =========================================================
   QUIZCRAFT — MAIN.JS
   ========================================================= */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    setYear();
    initNavbarScroll();
    initMobileMenu();
    initThemeToggle();
    initSmoothScroll();
    initScrollReveal();
    initCounters();
    initRipple();
    initTypingBadge();
    initNewsletterForm();
  }

  /* ---------- Footer year ---------- */
  function setYear() {
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  }

  /* ---------- Navbar shrink + blur on scroll ---------- */
  function initNavbarScroll() {
    const navbar = document.getElementById('qcNavbar');
    if (!navbar) return;

    const onScroll = () => {
      if (window.scrollY > 40) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
      updateActiveNavLink();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Highlight active nav link based on section in view ---------- */
  function updateActiveNavLink() {
    const sections = ['home', 'features', 'subjects', 'about', 'contact'];
    const links = document.querySelectorAll('.qc-nav-links a');
    let current = sections[0];

    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.top <= 140) current = id;
    });

    links.forEach((link) => {
      const href = link.getAttribute('href').replace('#', '');
      link.classList.toggle('active', href === current);
    });
  }

  /* ---------- Mobile burger menu ---------- */
  function initMobileMenu() {
    const burger = document.getElementById('qcBurger');
    const navLinks = document.getElementById('qcNavLinks');
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

  /* ---------- Dark mode toggle ---------- */
  function initThemeToggle() {
    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;

    const icon = toggle.querySelector('i');
    const stored = getStoredTheme();

    if (stored === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      swapIcon(icon, true);
    }

    toggle.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        swapIcon(icon, false);
        setStoredTheme('light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        swapIcon(icon, true);
        setStoredTheme('dark');
      }
    });
  }

  function swapIcon(icon, isDark) {
    if (!icon) return;
    icon.classList.toggle('bi-moon-stars-fill', !isDark);
    icon.classList.toggle('bi-sun-fill', isDark);
  }

  // In-memory theme storage (no localStorage available in this environment)
  let currentTheme = 'light';
  function getStoredTheme() { return currentTheme; }
  function setStoredTheme(value) { currentTheme = value; }

  /* ---------- Smooth scroll for internal anchors ---------- */
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href');
        if (targetId.length < 2) return;
        const target = document.querySelector(targetId);
        if (!target) return;
        e.preventDefault();
        const navH = document.getElementById('qcNavbar')?.offsetHeight || 84;
        const top = target.getBoundingClientRect().top + window.pageYOffset - navH + 1;
        window.scrollTo({ top, behavior: 'smooth' });
      });
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
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    );

    items.forEach((item) => observer.observe(item));
  }

  /* ---------- Animated counters ---------- */
  function initCounters() {
    const counters = document.querySelectorAll('.counter');
    if (!counters.length) return;

    const animateCounter = (el) => {
      const target = Number(el.getAttribute('data-target')) || 0;
      const duration = 1600;
      const start = performance.now();

      const step = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        const value = Math.floor(eased * target);
        el.textContent = value.toLocaleString();
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          el.textContent = target.toLocaleString();
        }
      };
      requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.6 }
    );

    counters.forEach((counter) => observer.observe(counter));
  }

  /* ---------- Button ripple effect ---------- */
  function initRipple() {
    document.querySelectorAll('.ripple').forEach((btn) => {
      btn.addEventListener('click', function (e) {
        const rect = this.getBoundingClientRect();
        const ripple = document.createElement('span');
        const size = Math.max(rect.width, rect.height);

        ripple.className = 'ripple-effect';
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';

        this.appendChild(ripple);
        setTimeout(() => ripple.remove(), 650);
      });
    });
  }

  /* ---------- Typing effect on hero badge ---------- */
  function initTypingBadge() {
    const target = document.querySelector('.hero-badge');
    if (!target) return;

    const dot = target.querySelector('.badge-dot');
    const textNode = document.createElement('span');
    textNode.className = 'badge-typed-text';

    // Clear existing text but keep the dot
    target.textContent = '';
    target.appendChild(dot);
    target.appendChild(textNode);

    const phrases = ['AI Powered Learning', 'Adaptive by Design', 'Built for Focus'];
    let phraseIndex = 0;
    let charIndex = 0;
    let deleting = false;

    function tick() {
      const current = phrases[phraseIndex];

      if (!deleting) {
        charIndex++;
        textNode.textContent = current.slice(0, charIndex);
        if (charIndex === current.length) {
          deleting = true;
          return setTimeout(tick, 1600);
        }
      } else {
        charIndex--;
        textNode.textContent = current.slice(0, charIndex);
        if (charIndex === 0) {
          deleting = false;
          phraseIndex = (phraseIndex + 1) % phrases.length;
        }
      }
      setTimeout(tick, deleting ? 35 : 55);
    }

    tick();
  }

  /* ---------- Newsletter form (front-end only) ---------- */
  function initNewsletterForm() {
    const form = document.getElementById('newsletterForm');
    const msg = document.getElementById('newsletterMsg');
    const emailInput = document.getElementById('newsletterEmail');
    if (!form || !msg) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

      if (!valid) {
        msg.textContent = 'Please enter a valid email address.';
        msg.style.color = '#FCA5A5';
        return;
      }

      msg.textContent = `Thanks! We'll send updates to ${email}.`;
      msg.style.color = '#fff';
      form.reset();
    });
  }
})();
