/* =========================================================
   QUIZCRAFT — js/common.js
   Shared behavior loaded on every page: navbar scroll/burger,
   dark mode toggle, button ripple, scroll reveal, and a tiny
   helper namespace (QC) other page scripts build on.
   ========================================================= */

const QC = (function () {
  'use strict';

  let currentTheme = 'light'; // in-memory only — no browser storage APIs used

  function setYear(elId) {
    const el = document.getElementById(elId || 'qcYear');
    if (el) el.textContent = new Date().getFullYear();
  }

  function initNavbarScroll(navId) {
    const navbar = document.getElementById(navId || 'qcNavbar');
    if (!navbar) return;
    const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function initMobileMenu(burgerId, linksId) {
    const burger = document.getElementById(burgerId || 'qcBurger');
    const navLinks = document.getElementById(linksId || 'qcNavLinks');
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

  function initThemeToggle(toggleId) {
    const toggle = document.getElementById(toggleId || 'qcThemeToggle');
    if (!toggle) return;
    const icon = toggle.querySelector('i');

    toggle.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-qc-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-qc-theme');
        currentTheme = 'light';
      } else {
        document.documentElement.setAttribute('data-qc-theme', 'dark');
        currentTheme = 'dark';
      }
      if (icon) {
        icon.classList.toggle('bi-moon-stars-fill', currentTheme === 'light');
        icon.classList.toggle('bi-sun-fill', currentTheme === 'dark');
      }
      document.dispatchEvent(new CustomEvent('qc:theme-changed', { detail: { theme: currentTheme } }));
    });
  }

  function getTheme() {
    return currentTheme;
  }

  function initRipple(selector) {
    document.querySelectorAll(selector || '.qc-btn, .qc-ripple').forEach((btn) => {
      btn.addEventListener('click', function (e) {
        if (this.disabled) return;
        const rect = this.getBoundingClientRect();
        const ripple = document.createElement('span');
        const size = Math.max(rect.width, rect.height);

        ripple.className = 'qc-ripple-effect';
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';

        this.appendChild(ripple);
        setTimeout(() => ripple.remove(), 650);
      });
    });
  }

  function initScrollReveal(selector) {
    const items = document.querySelectorAll(selector || '[data-reveal]');
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
      { threshold: 0.12, rootMargin: '0px 0px -50px 0px' }
    );
    items.forEach((item) => observer.observe(item));
  }

  function initCounters(selector) {
    const counters = document.querySelectorAll(selector || '.qc-counter');
    if (!counters.length) return;

    const animate = (el) => {
      const target = Number(el.getAttribute('data-target')) || 0;
      const duration = 1400;
      const start = performance.now();
      const step = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.floor(eased * target).toLocaleString();
        if (progress < 1) requestAnimationFrame(step);
        else el.textContent = target.toLocaleString();
      };
      requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animate(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.6 }
    );
    counters.forEach((c) => observer.observe(c));
  }

  /* Runs the standard set every page needs. Page scripts call
     QC.initPage() once, then wire their own page-specific logic. */
  function initPage(opts) {
    opts = opts || {};
    setYear(opts.yearId);
    initNavbarScroll(opts.navId);
    initMobileMenu(opts.burgerId, opts.linksId);
    initThemeToggle(opts.toggleId);
    initRipple(opts.rippleSelector);
    initScrollReveal(opts.revealSelector);
    initCounters(opts.counterSelector);
    initAOS();
  }

  /* Pages that link the AOS library (faculty module + marketing
     pages) rely on this running, or every data-aos element stays
     permanently hidden. Guarded so pages without AOS are unaffected. */
  function initAOS() {
    if (typeof AOS === 'undefined') return;
    AOS.init({
      duration: 600,
      easing: 'ease-out-cubic',
      once: true,
      offset: 60,
    });
  }

  return {
    initPage,
    setYear,
    initNavbarScroll,
    initMobileMenu,
    initThemeToggle,
    initRipple,
    initScrollReveal,
    initCounters,
    initAOS,
    getTheme,
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  QC.initPage();
  applySession();
  initProfilePage();
  initContactForm();
  initSubjectCards();
});

/* =========================================================
   SUBJECT SELECTION -> QUIZ (subjects.html)
   -----------------------------------------------------------
   WHY: every subject card on subjects.html linked straight to
   registerpage1.html, even for a student who was already logged
   in — there was no way to actually start a quiz for a chosen
   subject, so quiz.html always fell back to its default ("Python").
   WHAT: intercepts clicks on ".fac-category-card[data-subject]".
   A logged-in user (any role) is sent to
   quiz.html?subject=<name>&difficulty=easy so the Adaptive Quiz
   Generator (users/views.py generate_adaptive_quiz) fetches THAT
   subject's questions. A signed-out visitor keeps the original
   behaviour and is sent to registerpage1.html to create an account
   first — this preserves the page's original marketing purpose
   for anonymous visitors while fixing the flow for real students.
   WHICH MODULE USES THIS: subjects.html.
   ========================================================= */
function initSubjectCards() {
  const cards = document.querySelectorAll('.fac-category-card[data-subject]');
  if (!cards.length) return;

  const user = getSessionUser();

  cards.forEach((card) => {
    card.addEventListener('click', (e) => {
      if (!user || !user.name) return; // not logged in — let the default registerpage1.html link fire

      e.preventDefault();
      const subject = card.getAttribute('data-subject');
      window.location.href = `quiz.html?subject=${encodeURIComponent(subject)}&difficulty=easy`;
    });
  });

  // BUG FIX: every card's question count ("132 Questions", "98
  // Questions", ...) used to be a hardcoded number with no relation
  // to what was actually in MongoDB. Replaced with the real count
  // per subject, matched case-insensitively since a subject can be
  // stored as "Python" or "python" depending on how it was added.
  fetch('http://127.0.0.1:8000/users/subject-question-counts/')
    .then((res) => res.json())
    .then((data) => {
      if (data.status !== 'success' || !data.counts) return;

      const countsLower = {};
      Object.keys(data.counts).forEach((key) => {
        countsLower[key.toLowerCase()] = data.counts[key];
      });

      cards.forEach((card) => {
        const subject = (card.getAttribute('data-subject') || '').toLowerCase();
        const countEl = card.querySelector('.fac-category-count');
        if (!countEl) return;
        const count = countsLower[subject] || 0;
        countEl.textContent = count === 1 ? '1 Question' : `${count} Questions`;
      });
    })
    .catch((err) => console.log('Could not load subject question counts:', err));
}

/* =========================================================
   SESSION HANDLING (shared across every page)
   -----------------------------------------------------------
   WHY: login/register used to have no concept of "who is
   currently logged in" once you left the login page — the
   dashboard, quiz, profile etc. always showed hardcoded demo
   names ("Aarav Mehta", "Prof. Neha Kulkarni") no matter who
   actually signed in, there was no logout button anywhere, and
   nothing stopped a student from opening a faculty-only page
   (or vice versa) by typing the URL directly.

   WHAT: js/loginpage1.js stores {name, email, role} under the
   localStorage key "quizcraft_user" on a successful login (this
   is a client-side session — QuizCraft has no server sessions/
   cookies, so localStorage is what "Store login session" means
   here). This function, run on every page via common.js:
     1. ROUTE GUARD — reads the <body data-require-role="..">
        attribute set on every logged-in page. "faculty" pages
        redirect non-faculty users back to the login page;
        "any" pages just require SOME logged-in user. Public
        marketing pages have no such attribute and are skipped.
     2. LOGOUT — wires the #qcLogoutBtn icon button (added next
        to the avatar on every logged-in page) to clear the
        session and return to the login page.
     3. AVATAR SYNC — replaces every ".qc-nav-avatar" element's
        initials/title with the REAL logged-in user's name,
        instead of the static demo text baked into the HTML.
        Page-specific scripts (e.g. dashboard.js, which fetches
        a fresh profile from MongoDB) still run afterward and
        may refine this further — this just guarantees no page
        is ever left showing someone else's name.

   WHICH MODULE USES THIS: every HTML page that loads
   js/common.js (all of them) — this function itself no-ops
   harmlessly on pages with no session-related markup.
   ========================================================= */
function getSessionUser() {
  try {
    return JSON.parse(localStorage.getItem('quizcraft_user'));
  } catch (e) {
    return null;
  }
}

function clearSessionUser() {
  try {
    localStorage.removeItem('quizcraft_user');
  } catch (e) {
    /* localStorage unavailable — nothing to clear */
  }
}

// =========================================================
// ROLE-BASED NAVBAR (new)
// -----------------------------------------------------------
// WHY: profile.html is shared by both students and faculty, but
// its <nav> was hardcoded with the STUDENT link set (Dashboard ->
// student_dashboard.html, Take a Quiz, History, Subjects) baked
// directly into the HTML. A faculty member visiting their own
// profile saw a navbar pointing at pages meant for students —
// "Faculty navbar should never change into the Student navbar"
// was actually the reverse bug: the shared page never HAD a
// faculty navbar to begin with.
//
// WHAT: on every page, once we know the logged-in user's role,
// the #qcNavLinks list is rebuilt from one of these two
// definitions — always the correct set for that role, on every
// page, including shared ones. Faculty-specific pages
// (faculty_dashboard.html etc.) already ship the faculty set
// baked in, so this just confirms/re-renders the same thing
// there; on shared pages like profile.html it's what actually
// fixes the bug.
const STUDENT_NAV_LINKS = [
  { href: 'student_dashboard.html', label: 'Dashboard' },
  { href: 'quiz.html', label: 'Take a Quiz' },
  { href: 'history.html', label: 'History' },
  { href: 'subjects.html', label: 'Subjects' },
  { href: 'profile.html', label: 'Profile' },
];
const FACULTY_NAV_LINKS = [
  { href: 'faculty_dashboard.html', label: 'Dashboard' },
  { href: 'manage_questions.html', label: 'Manage Questions' },
  { href: 'add_question.html', label: 'Add Question' },
  { href: 'view_results.html', label: 'Results' },
  { href: 'profile.html', label: 'Profile' },
];

function applyRoleBasedNavbar(role) {
  const navLinks = document.getElementById('qcNavLinks');
  if (!navLinks) return;

  const links = role === 'faculty' ? FACULTY_NAV_LINKS : STUDENT_NAV_LINKS;
  const currentPage = location.pathname.split('/').pop() || 'index.html';

  navLinks.innerHTML = links.map((l) =>
    `<a href="${l.href}"${l.href === currentPage ? ' class="active"' : ''}>${l.label}</a>`
  ).join('\n      ');
}

function applySession() {
  const requiredRole = document.body.getAttribute('data-require-role');
  const user = getSessionUser();

  // ROUTE GUARD: only pages explicitly marked with data-require-role
  // are protected — public/marketing pages (index, subjects, about,
  // login, register, contact, features) have no such attribute and
  // are left alone.
  if (requiredRole) {
    if (!user || !user.name) {
      window.location.href = 'loginpage1.html';
      return;
    }
    if (requiredRole === 'faculty' && user.role !== 'faculty') {
      // A student trying to open a faculty-only page — send them
      // to their own dashboard instead of a 403/blank page.
      window.location.href = 'student_dashboard.html';
      return;
    }
    // A faculty account landing on a student-only page (e.g. quiz.html,
    // history.html) would be just as wrong the other way around —
    // faculty accounts don't take quizzes, so send them back to
    // their own dashboard too instead of showing a broken/mismatched
    // page. requiredRole === 'any' pages (profile.html) are fine for
    // both roles and are intentionally excluded from this check.
    if (requiredRole === 'student' && user.role === 'faculty') {
      window.location.href = 'faculty_dashboard.html';
      return;
    }
  }

  // LOGOUT: present on every logged-in page (see the
  // "Logout icon button" added next to .qc-nav-avatar).
  const logoutBtn = document.getElementById('qcLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearSessionUser();
      window.location.href = 'loginpage1.html';
    });
  }

  if (!user || !user.name) return;

  // Rebuild the navbar to match this user's real role — see
  // applyRoleBasedNavbar() above. Runs for every logged-in user on
  // every page that has a #qcNavLinks list.
  applyRoleBasedNavbar(user.role);

  // AVATAR SYNC: derive up to 2 initials from the real name
  // ("Priya Sharma" -> "PS") and stamp them onto every avatar
  // badge on the page, replacing whatever demo text shipped in
  // the HTML.
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  document.querySelectorAll('.qc-nav-avatar').forEach((el) => {
    // Don't overwrite an avatar that already shows an uploaded
    // photo (profile.html's avatar preview sets a background-image).
    if (el.querySelector('img') || el.style.backgroundImage) return;
    if (initials) el.textContent = initials;
    el.setAttribute('title', user.name);
  });
}

/* =========================================================
   PROFILE PAGE (profile.html)
   Guarded on element presence so this safely no-ops on
   every other page that loads common.js.
   ========================================================= */
/* Animates one of profile.html's stat-card numbers up from 0 to the
   real value fetched from get-profile/. Shows "—" instead of
   animating to nothing when the value is null (e.g. leaderboard
   rank for a student who hasn't attempted any quiz yet). */
function animateProfileCounter(elId, value) {
  const el = document.getElementById(elId);
  if (!el) return;

  if (value === null || value === undefined) {
    el.textContent = '—';
    return;
  }

  const target = Number(value) || 0;
  const duration = 900;
  const start = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(target * eased);
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target;
  }
  requestAnimationFrame(step);
}

function initProfilePage() {
  const tabButtons = document.querySelectorAll('.auth-tab-btn');
  if (!tabButtons.length) return;

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      document.querySelectorAll('.auth-tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.auth-tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + target)?.classList.add('active');
    });
  });

  // Avatar upload preview
  const avatarUpload = document.getElementById('profileAvatarUpload');
  const avatarEl = document.getElementById('profileAvatarInitials');
  if (avatarUpload && avatarEl) {
    avatarUpload.addEventListener('change', () => {
      const file = avatarUpload.files && avatarUpload.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        avatarEl.style.backgroundImage = `url(${e.target.result})`;
        avatarEl.style.backgroundSize = 'cover';
        avatarEl.style.backgroundPosition = 'center';
        avatarEl.textContent = '';
      };
      reader.readAsDataURL(file);
    });
  }

  const infoForm = document.getElementById('profileInfoForm');
  const successAlert = document.getElementById('profileSuccessAlert');
  const successText = document.getElementById('profileSuccessText');
  const fullNameInput = document.getElementById('profFullName');
  const emailInput = document.getElementById('profEmail');
  const phoneInput = document.getElementById('profPhone');
  const bioInput = document.getElementById('profBio');
  const roleSelect = document.getElementById('profRole');

  // BUG FIX: profile.html used to ship with the hardcoded demo
  // values "Aarav Mehta" / "aarav.mehta@example.com" baked directly
  // into the HTML — every visitor saw the same fake profile. On
  // load we now fetch the REAL logged-in user's record from
  // MongoDB (via the email stored in the client-side session) and
  // populate every field, including the avatar initials and the
  // header (name/email/member-since/role badge).
  const headerName = document.getElementById('profileHeaderName');
  const headerEmail = document.getElementById('profileHeaderEmail');
  const headerMemberSince = document.getElementById('profileHeaderMemberSince');
  const roleBadgeText = document.getElementById('profileRoleBadgeText');

  const sessionUser = getSessionUser();
  if (sessionUser && sessionUser.email && fullNameInput) {
    fetch(`http://127.0.0.1:8000/users/get-profile/?email=${encodeURIComponent(sessionUser.email)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status !== 'success') {
          if (headerName) headerName.textContent = sessionUser.name || 'Unknown user';
          return;
        }
        fullNameInput.value = data.name || '';
        if (emailInput) emailInput.value = data.email || '';
        if (phoneInput) phoneInput.value = data.phone || '';
        if (bioInput) bioInput.value = data.bio || '';
        if (roleSelect) {
          // role is intentionally read-only here — changing your own
          // role from the profile page would be a privilege-escalation
          // bug, so the <select> stays disabled (see profile.html) and
          // we only ever populate it, never submit it back.
          const match = [...roleSelect.options].find((o) => o.value === data.role);
          if (match) roleSelect.value = match.value;
        }

        // Header card: was hardcoded "Aarav Mehta" / a fake email /
        // "Member since Jan 2026" regardless of who was logged in.
        if (headerName) headerName.textContent = data.name || 'Unknown user';
        if (headerEmail) headerEmail.textContent = data.email || '';
        if (roleBadgeText) roleBadgeText.textContent = data.role === 'faculty' ? 'Faculty' : 'Student';
        if (headerMemberSince) {
          if (data.created_at) {
            const joined = new Date(data.created_at);
            const label = joined.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            headerMemberSince.textContent = `Member since ${label}`;
          } else {
            headerMemberSince.textContent = 'Member since —';
          }
        }

        const avatarEl2 = document.getElementById('profileAvatarInitials');
        if (avatarEl2 && !avatarEl2.style.backgroundImage) {
          const initials = (data.name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
          if (initials) avatarEl2.textContent = initials;
        }

        // 4th stat card: was hardcoded "Jan 2026" for every account.
        const memberSinceStat = document.getElementById('profStatMemberSince');
        if (memberSinceStat) {
          memberSinceStat.textContent = data.created_at
            ? new Date(data.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            : '—';
        }

        // BUG FIX: "Faculty Profile should open from the Faculty
        // navbar (not Student Profile)" — profile.html is one shared
        // page, and its 3 main stat cards used to always show
        // "Quizzes Attempted" / "Average Score" / "Leaderboard Rank"
        // (hardcoded 48 / 82% / #12) even for faculty accounts, for
        // whom none of those numbers mean anything. They're now
        // relabeled and re-sourced per role.
        const label1 = document.getElementById('profStatLabel1');
        const label2 = document.getElementById('profStatLabel2');
        const label3 = document.getElementById('profStatLabel3');
        const icon1 = document.getElementById('profStatIcon1');
        const icon2 = document.getElementById('profStatIcon2');
        const icon3 = document.getElementById('profStatIcon3');
        const suffix2 = document.getElementById('profStatSuffix2');
        const prefix3 = document.getElementById('profStatPrefix3');

        if (data.role === 'faculty') {
          if (label1) label1.textContent = 'Questions in Bank';
          if (label2) label2.textContent = 'Subjects Managed';
          if (label3) label3.textContent = 'Total Students';
          if (icon1) icon1.className = 'bi bi-question-circle';
          if (icon2) icon2.className = 'bi bi-collection';
          if (icon3) icon3.className = 'bi bi-people';
          if (suffix2) suffix2.textContent = '';
          if (prefix3) prefix3.textContent = '';

          animateProfileCounter('profStatQuizzes', data.total_questions);
          animateProfileCounter('profStatAvgScore', data.total_subjects);
          animateProfileCounter('profStatRank', data.total_students);
        } else {
          // Reset back to the student labels/icons in case this
          // browser previously rendered the page as faculty (e.g. an
          // account switch in the same session/tab).
          if (label1) label1.textContent = 'Quizzes Attempted';
          if (label2) label2.textContent = 'Average Score';
          if (label3) label3.textContent = 'Leaderboard Rank';
          if (icon1) icon1.className = 'bi bi-collection-play';
          if (icon2) icon2.className = 'bi bi-graph-up-arrow';
          if (icon3) icon3.className = 'bi bi-trophy';
          if (suffix2) suffix2.textContent = '%';
          if (prefix3) prefix3.textContent = '#';

          animateProfileCounter('profStatQuizzes', data.quizzes_attempted);
          animateProfileCounter('profStatAvgScore', data.average_score);
          animateProfileCounter('profStatRank', data.leaderboard_rank);
        }
      })
      .catch((err) => {
        console.log('Could not load profile:', err);
        // Honest failure state instead of leaving the header stuck on
        // the static "Loading…" placeholder forever.
        if (headerName) headerName.textContent = 'Could not load profile';
        if (headerMemberSince) headerMemberSince.textContent = 'Check your connection and refresh';
      });
  }

  // Personal info form — saves to MongoDB via update-profile/.
  if (infoForm) {
    infoForm.addEventListener('submit', (e) => {
      e.preventDefault();

      if (!sessionUser || !sessionUser.email) {
        alert('You are not logged in.');
        return;
      }

      fetch('http://127.0.0.1:8000/users/update-profile/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_email: sessionUser.email,
          name: fullNameInput.value.trim(),
          email: emailInput.value.trim(),
          phone: phoneInput.value.trim(),
          bio: bioInput.value.trim(),
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.status !== 'success') {
            alert(data.message || 'Could not update your profile.');
            return;
          }

          // Keep the client-side session in sync in case name/email
          // just changed, and refresh every navbar avatar on this
          // page to match immediately.
          try {
            localStorage.setItem('quizcraft_user', JSON.stringify({
              name: data.name,
              email: data.email,
              role: data.role,
            }));
          } catch (err) { /* localStorage unavailable */ }
          applySession();

          // BUG FIX: the header card (name/email) previously only
          // reflected whatever was loaded on page load — saving new
          // values here left it showing the OLD name/email until a
          // manual refresh. Update it immediately with what was just saved.
          if (headerName) headerName.textContent = data.name || '';
          if (headerEmail) headerEmail.textContent = data.email || '';
          const avatarEl3 = document.getElementById('profileAvatarInitials');
          if (avatarEl3 && !avatarEl3.style.backgroundImage) {
            const initials2 = (data.name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
            if (initials2) avatarEl3.textContent = initials2;
          }

          if (successAlert) {
            successText.textContent = 'Your personal information was updated successfully.';
            successAlert.classList.remove('d-none');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => successAlert.classList.add('d-none'), 4000);
          }
        })
        .catch((err) => {
          console.log(err);
          alert('Network error — could not reach the server.');
        });
    });
  }

  // Password toggles (current / new / confirm)
  wirePasswordToggle('profCurrentPasswordToggle', 'profCurrentPassword');
  wirePasswordToggle('profNewPasswordToggle', 'profNewPassword');
  wirePasswordToggle('profConfirmPasswordToggle', 'profConfirmPassword');

  function wirePasswordToggle(btnId, inputId) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
      const icon = btn.querySelector('i');
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      if (icon) {
        icon.classList.toggle('bi-eye', !isHidden);
        icon.classList.toggle('bi-eye-slash', isHidden);
      }
    });
  }

  // Password strength meter + confirm match + submit gating
  const newPassword = document.getElementById('profNewPassword');
  const confirmPassword = document.getElementById('profConfirmPassword');
  const currentPassword = document.getElementById('profCurrentPassword');
  const strengthFill = document.getElementById('profStrengthFill');
  const strengthLabel = document.getElementById('profStrengthLabel');
  const rulesList = document.getElementById('profRulesList');
  const confirmError = document.getElementById('profConfirmPasswordError');
  const updateBtn = document.getElementById('profUpdatePasswordBtn');
  const passwordForm = document.getElementById('profilePasswordForm');

  function getPasswordRules(value) {
    return {
      length: value.length >= 8,
      upper: /[A-Z]/.test(value),
      lower: /[a-z]/.test(value),
      number: /[0-9]/.test(value),
      special: /[^A-Za-z0-9]/.test(value),
    };
  }

  function validatePasswordTab() {
    if (!newPassword) return;
    const rules = getPasswordRules(newPassword.value);
    const passedCount = Object.values(rules).filter(Boolean).length;

    if (rulesList) {
      rulesList.querySelectorAll('li').forEach((li) => {
        li.classList.toggle('rule-met', !!rules[li.getAttribute('data-rule')]);
      });
    }

    const percentages = [0, 20, 40, 60, 80, 100];
    const labels = ['Password strength', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
    const colors = ['#EF4444', '#EF4444', '#F59E0B', '#F59E0B', '#10B981', '#10B981'];
    if (strengthFill) { strengthFill.style.width = percentages[passedCount] + '%'; strengthFill.style.background = colors[passedCount]; }
    if (strengthLabel) strengthLabel.textContent = newPassword.value ? labels[passedCount] : 'Password strength';

    const passwordValid = Object.values(rules).every(Boolean);
    const confirmValid = confirmPassword.value.length > 0 && confirmPassword.value === newPassword.value;
    const currentFilled = currentPassword.value.length > 0;

    confirmError.textContent = confirmPassword.value && !confirmValid ? 'Passwords do not match.' : '';

    if (updateBtn) updateBtn.disabled = !(passwordValid && confirmValid && currentFilled);
  }

  [currentPassword, newPassword, confirmPassword].forEach((input) => {
    input?.addEventListener('input', validatePasswordTab);
  });

  if (passwordForm) {
    passwordForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const user = getSessionUser();
      if (!user || !user.email) {
        alert('You are not logged in.');
        return;
      }

      fetch('http://127.0.0.1:8000/users/change-password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          current_password: currentPassword.value,
          new_password: newPassword.value,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.status !== 'success') {
            // Surface the backend's specific reason (e.g. "Current
            // password is incorrect") under the current-password
            // field instead of a generic alert.
            if (confirmError) confirmError.textContent = data.message || 'Could not update password.';
            return;
          }

          if (successAlert) {
            successText.textContent = 'Your password was updated successfully.';
            successAlert.classList.remove('d-none');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => successAlert.classList.add('d-none'), 4000);
          }
          passwordForm.reset();
          validatePasswordTab();
        })
        .catch((err) => {
          console.log(err);
          alert('Network error — could not reach the server.');
        });
    });
  }
}

/* =========================================================
   CONTACT FORM (contact.html)
   Guarded on element presence.
   ========================================================= */
function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;

  const nameInput = document.getElementById('contactName');
  const emailInput = document.getElementById('contactEmail');
  const subjectInput = document.getElementById('contactSubject');
  const messageInput = document.getElementById('contactMessage');
  const successAlert = document.getElementById('contactSuccessAlert');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let valid = true;

    [nameInput, emailInput, subjectInput, messageInput].forEach((input) => {
      if (!input) return;
      const filled = input.value.trim().length > 0;
      input.classList.toggle('is-invalid', !filled);
      if (!filled) valid = false;
    });

    if (emailInput && emailInput.value.trim()) {
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value.trim());
      emailInput.classList.toggle('is-invalid', !validEmail);
      if (!validEmail) valid = false;
    }

    if (!valid) return;

    // Front-end demo only — replace with a POST to your Django contact endpoint.
    if (successAlert) {
      successAlert.classList.remove('d-none');
      setTimeout(() => successAlert.classList.add('d-none'), 5000);
    }
    form.reset();
  });
}
