(function(){
  async function init(){
    const user = await qcRequireAuth("student");
    if (!user) return;
    document.getElementById("welcome-heading").textContent = `Welcome back, ${user.full_name.split(" ")[0]}!`;

    try{
      const d = await api.get("/student/dashboard/");
      document.getElementById("loading-state").style.display = "none";
      document.getElementById("dashboard-content").style.display = "block";
      renderMetrics(d);
      renderRecent(d.recent_quizzes || []);
      renderSubjects(d.subject_performance || []);
    } catch(err){
      qcToast(err.message, "error");
      document.getElementById("loading-state").innerHTML =
        `<div class="qc-empty"><i class="fa-solid fa-triangle-exclamation"></i><h5>Could not load dashboard</h5><p>${qcEscapeHtml(err.message)}</p></div>`;
    }
  }

  function renderMetrics(d){
    const rank = d.leaderboard_rank ? `#${d.leaderboard_rank}` : "No ranking yet";
    document.getElementById("metric-cards").innerHTML = `
      <div class="col-6 col-lg-3"><div class="metric-card"><i class="fa-solid fa-list-check"></i>
        <div class="metric-label">Quizzes Attempted</div><div class="metric-value">${d.quizzes_attempted}</div></div></div>
      <div class="col-6 col-lg-3"><div class="metric-card alt"><i class="fa-solid fa-percent"></i>
        <div class="metric-label">Average Score</div><div class="metric-value">${d.average_score}%</div></div></div>
      <div class="col-6 col-lg-3"><div class="metric-card green"><i class="fa-solid fa-fire"></i>
        <div class="metric-label">Day Streak</div><div class="metric-value">${d.day_streak}</div></div></div>
      <div class="col-6 col-lg-3"><div class="metric-card warm"><i class="fa-solid fa-trophy"></i>
        <div class="metric-label">Leaderboard Rank</div><div class="metric-value">${rank}</div></div></div>`;
  }

  function renderRecent(list){
    const el = document.getElementById("recent-quizzes");
    if (!list.length){
      el.innerHTML = `<div class="qc-empty py-4"><i class="fa-solid fa-inbox"></i><h5>No quiz attempts yet.</h5><p>Take your first quiz to see it here.</p></div>`;
      return;
    }
    el.innerHTML = list.map(q => `
      <div class="d-flex justify-content-between align-items-center py-2" style="border-bottom:1px solid var(--border);">
        <div>
          <div class="fw-semibold">${qcEscapeHtml(q.subject)}</div>
          <div class="text-muted small">${qcFormatDate(q.completed_at)}</div>
        </div>
        <div class="text-end">
          <div class="fw-bold">${q.percentage}%</div>
          <span class="${q.passed ? 'badge-pass' : 'badge-fail'}">${q.passed ? 'Passed' : 'Failed'}</span>
        </div>
      </div>`).join("");
  }

  function renderSubjects(list){
    const el = document.getElementById("subject-performance");
    if (!list.length){
      el.innerHTML = `<div class="qc-empty py-4"><i class="fa-solid fa-chart-simple"></i><h5>No data yet.</h5></div>`;
      return;
    }
    el.innerHTML = list.map(s => `
      <div class="mb-3">
        <div class="d-flex justify-content-between mb-1"><span class="fw-semibold">${qcEscapeHtml(s.subject)}</span><span class="text-muted">${s.average_percentage}%</span></div>
        <div class="qc-progress"><div style="width:${s.average_percentage}%"></div></div>
      </div>`).join("");
  }

  init();
})();
