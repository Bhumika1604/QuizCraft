/* =========================================================
   QuizCraft — static/js/navbar.js
   Renders nav links based on current auth state (guest / student /
   faculty). Does NOT decide access — that's enforced server-side by
   the DRF permission classes on every API call. This just improves UX.
   ========================================================= */
(function(){
  const path = window.location.pathname;
  const linksEl = document.getElementById("qc-nav-links");
  const actionsEl = document.getElementById("qc-nav-actions");
  const mobileEl = document.getElementById("qc-nav-mobile");
  const toggleBtn = document.getElementById("qc-nav-toggle");

  function link(href, label){
    const active = path === href ? "active" : "";
    return `<a href="${href}" class="${active}">${label}</a>`;
  }

  function render(user){
    let links = "";
    let actions = "";

    if (!user){
      links = link("/", "Home") + link("/features/", "Features") + link("/about/", "About") + link("/contact/", "Contact");
      actions = `<a href="/login/" class="btn-outline-gradient me-2">Login</a><a href="/register/" class="btn-gradient">Get Started</a>`;
    } else if (user.role === "student"){
      links = link("/dashboard/", "Dashboard") + link("/subjects/", "Take a Quiz") +
              link("/history/", "History") + link("/analytics/", "Analytics") + link("/profile/", "Profile");
      actions = `<span class="chip me-2 d-none d-md-inline"><i class="fa-solid fa-user"></i> ${qcEscapeHtml(user.full_name)}</span>
                 <button class="btn-outline-gradient" onclick="qcLogout()">Logout</button>`;
    } else {
      links = link("/faculty/dashboard/", "Dashboard") + link("/faculty/questions/", "Questions") +
              link("/faculty/subjects/", "Subjects") + link("/faculty/results/", "Results") +
              link("/faculty/analytics/", "Analytics") + link("/profile/", "Profile");
      actions = `<span class="chip me-2 d-none d-md-inline"><i class="fa-solid fa-chalkboard-user"></i> ${qcEscapeHtml(user.full_name)}</span>
                 <button class="btn-outline-gradient" onclick="qcLogout()">Logout</button>`;
    }
    linksEl.innerHTML = links;
    actionsEl.innerHTML = actions;
    mobileEl.innerHTML = `<div class="d-flex flex-column gap-2 py-2">${links}</div>`;
  }

  render(qcGetUser());

  const token = qcGetToken();
  if (token){
    api.get("/auth/me/").then(user => { qcSetUser(user); render(user); }).catch(() => { qcClearToken(); render(null); });
  }

  if (toggleBtn){
    toggleBtn.addEventListener("click", () => {
      mobileEl.style.display = mobileEl.style.display === "none" ? "block" : "none";
    });
  }
})();
