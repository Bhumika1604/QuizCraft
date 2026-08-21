(function(){
  async function init(){
    const user = await qcRequireAuth("faculty");
    if (!user) return;
    document.getElementById("welcome-heading").textContent = `Welcome, ${user.full_name.split(" ")[0]}`;

    try{
      const d = await api.get("/faculty/dashboard/");
      document.getElementById("loading-state").style.display = "none";
      document.getElementById("dashboard-content").style.display = "block";

      document.getElementById("metric-cards").innerHTML = `
        <div class="col-6 col-lg-3"><div class="metric-card"><i class="fa-solid fa-database"></i><div class="metric-label">Total Questions</div><div class="metric-value">${d.total_questions}</div></div></div>
        <div class="col-6 col-lg-3"><div class="metric-card alt"><i class="fa-solid fa-book"></i><div class="metric-label">Total Subjects</div><div class="metric-value">${d.total_subjects}</div></div></div>
        <div class="col-6 col-lg-3"><div class="metric-card green"><i class="fa-solid fa-user-graduate"></i><div class="metric-label">Total Students</div><div class="metric-value">${d.total_students}</div></div></div>
        <div class="col-6 col-lg-3"><div class="metric-card warm"><i class="fa-solid fa-list-check"></i><div class="metric-label">Quiz Attempts</div><div class="metric-value">${d.total_quiz_attempts}</div></div></div>`;

      document.getElementById("pass-rate-bar").style.width = `${d.pass_rate}%`;
      document.getElementById("pass-rate-text").textContent = `${d.pass_rate}%`;
      document.getElementById("most-attempted").textContent = d.most_attempted_subject || "No attempts yet";

      const list = d.recent_attempts || [];
      document.getElementById("recent-attempts").innerHTML = list.length ? list.map(a => `
        <div class="d-flex justify-content-between align-items-center py-2" style="border-bottom:1px solid var(--border);">
          <div><div class="fw-semibold">${qcEscapeHtml(a.student_name)}</div><div class="text-muted small">${qcEscapeHtml(a.subject)} · ${qcFormatDate(a.completed_at)}</div></div>
          <div class="text-end"><div class="fw-bold">${a.percentage}%</div><span class="${a.passed ? 'badge-pass' : 'badge-fail'}">${a.passed ? 'Passed' : 'Failed'}</span></div>
        </div>`).join("") : `<div class="qc-empty py-4"><i class="fa-solid fa-inbox"></i><h5>No results yet.</h5></div>`;
    } catch(err){
      qcToast(err.message, "error");
    }
  }
  init();
})();
