(function(){
  let role = null;

  async function init(){
    const user = await qcRequireAuth(null);
    if (!user) return;
    role = user.role;

    try{
      const profile = await api.get(role === "faculty" ? "/faculty/profile/" : "/student/profile/");
      document.getElementById("loading-state").style.display = "none";
      document.getElementById("profile-content").style.display = "block";
      render(profile);
    } catch(err){
      qcToast(err.message, "error");
    }
  }

  function render(p){
    document.getElementById("avatar-initial").textContent = p.full_name.charAt(0).toUpperCase();
    document.getElementById("profile-name").textContent = p.full_name;
    document.getElementById("profile-role").textContent = p.role === "faculty" ? "Faculty" : "Student";
    document.getElementById("profile-since").textContent = p.created_at ? `Member since ${qcFormatDate(p.created_at)}` : "";
    document.getElementById("edit-full_name").value = p.full_name;
    document.getElementById("edit-email").value = p.email;
    document.getElementById("edit-phone").value = p.phone || "";

    const s = p.stats;
    const statsEl = document.getElementById("profile-stats");
    if (p.role === "faculty"){
      statsEl.innerHTML = `
        <div class="col-6 col-lg-3"><div class="metric-card"><i class="fa-solid fa-database"></i><div class="metric-label">Questions in Bank</div><div class="metric-value">${s.questions_in_bank}</div></div></div>
        <div class="col-6 col-lg-3"><div class="metric-card alt"><i class="fa-solid fa-book"></i><div class="metric-label">Subjects Managed</div><div class="metric-value">${s.subjects_managed}</div></div></div>
        <div class="col-6 col-lg-3"><div class="metric-card green"><i class="fa-solid fa-user-graduate"></i><div class="metric-label">Total Students</div><div class="metric-value">${s.total_students}</div></div></div>
        <div class="col-6 col-lg-3"><div class="metric-card warm"><i class="fa-solid fa-list-check"></i><div class="metric-label">Total Attempts</div><div class="metric-value">${s.total_quiz_attempts}</div></div></div>`;
    } else {
      const rank = s.leaderboard_rank ? `#${s.leaderboard_rank}` : "No ranking yet";
      statsEl.innerHTML = `
        <div class="col-6 col-lg-4"><div class="metric-card"><i class="fa-solid fa-list-check"></i><div class="metric-label">Quizzes Attempted</div><div class="metric-value">${s.quizzes_attempted}</div></div></div>
        <div class="col-6 col-lg-4"><div class="metric-card alt"><i class="fa-solid fa-percent"></i><div class="metric-label">Average Score</div><div class="metric-value">${s.average_score}%</div></div></div>
        <div class="col-6 col-lg-4"><div class="metric-card warm"><i class="fa-solid fa-trophy"></i><div class="metric-label">Leaderboard Rank</div><div class="metric-value" style="font-size:1.3rem;">${rank}</div></div></div>`;
    }
  }

  document.getElementById("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("profile-error");
    errEl.textContent = "";
    try{
      const updated = await api.put(role === "faculty" ? "/faculty/profile/" : "/student/profile/", {
        full_name: document.getElementById("edit-full_name").value.trim(),
        phone: document.getElementById("edit-phone").value.trim(),
      });
      qcSetUser({ ...qcGetUser(), full_name: updated.full_name, phone: updated.phone });
      qcToast("Profile updated.", "success");
      document.getElementById("profile-name").textContent = updated.full_name;
      document.getElementById("avatar-initial").textContent = updated.full_name.charAt(0).toUpperCase();
    } catch(err){
      errEl.textContent = err.message;
    }
  });

  document.getElementById("password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("password-error");
    errEl.textContent = "";
    try{
      await api.post(role === "faculty" ? "/faculty/change-password/" : "/student/change-password/", {
        old_password: document.getElementById("old_password").value,
        new_password: document.getElementById("new_password").value,
      });
      qcToast("Password updated.", "success");
      document.getElementById("password-form").reset();
    } catch(err){
      errEl.textContent = err.message;
    }
  });

  init();
})();
