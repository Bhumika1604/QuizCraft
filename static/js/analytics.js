(function(){
  async function init(){
    const user = await qcRequireAuth("student");
    if (!user) return;

    try{
      const a = await api.get("/student/analytics/");
      document.getElementById("loading-state").style.display = "none";

      if (!a.has_data){
        document.getElementById("empty-state").style.display = "block";
        document.getElementById("empty-state").innerHTML =
          `<div class="qc-empty"><i class="fa-solid fa-chart-line"></i><h5>No quiz attempts yet.</h5><p>Take your first quiz to unlock analytics.</p>
           <a href="/subjects/" class="btn-gradient mt-2">Take a Quiz</a></div>`;
        return;
      }

      document.getElementById("analytics-content").style.display = "block";
      renderStatCards(a.score_stats);
      renderTrend(a.performance_trend);
      renderCorrect(a.correct_vs_incorrect);
      renderSubjects(a.subject_performance);
      renderDifficulty(a.difficulty_distribution);
      renderAdaptive(a.adaptive_summary);
      renderStrongWeak(a.strong_subjects, a.weak_subjects, a.improvement_percentage);
    } catch(err){
      qcToast(err.message, "error");
      document.getElementById("loading-state").innerHTML =
        `<div class="qc-empty"><i class="fa-solid fa-triangle-exclamation"></i><h5>Could not load analytics</h5><p>${qcEscapeHtml(err.message)}</p></div>`;
    }
  }

  function renderStatCards(s){
    document.getElementById("stat-cards").innerHTML = `
      <div class="col-6 col-lg-3"><div class="metric-card"><i class="fa-solid fa-chart-simple"></i><div class="metric-label">Average Score</div><div class="metric-value">${s.average}%</div></div></div>
      <div class="col-6 col-lg-3"><div class="metric-card green"><i class="fa-solid fa-arrow-up"></i><div class="metric-label">Highest Score</div><div class="metric-value">${s.highest}%</div></div></div>
      <div class="col-6 col-lg-3"><div class="metric-card warm"><i class="fa-solid fa-arrow-down"></i><div class="metric-label">Lowest Score</div><div class="metric-value">${s.lowest}%</div></div></div>
      <div class="col-6 col-lg-3"><div class="metric-card alt"><i class="fa-solid fa-list-ol"></i><div class="metric-label">Total Attempts</div><div class="metric-value">${s.total_attempts}</div></div></div>`;
  }

  const gridColor = "#E7E5F5";
  const commonOpts = { responsive: true, plugins: { legend: { display: false } } };

  function renderTrend(trend){
    new Chart(document.getElementById("trendChart"), {
      type: "line",
      data: {
        labels: trend.map(t => t.date),
        datasets: [{ label: "Score %", data: trend.map(t => t.percentage), borderColor: "#4F46E5",
          backgroundColor: "rgba(79,70,229,.12)", fill: true, tension: .35, pointBackgroundColor: "#4F46E5" }],
      },
      options: { ...commonOpts, scales: { y: { min: 0, max: 100, grid: { color: gridColor } }, x: { grid: { display: false } } } },
    });
  }

  function renderCorrect(c){
    new Chart(document.getElementById("correctChart"), {
      type: "doughnut",
      data: {
        labels: ["Correct", "Wrong", "Unanswered"],
        datasets: [{ data: [c.correct, c.wrong, c.unanswered], backgroundColor: ["#16A34A", "#DC2626", "#E7E5F5"] }],
      },
      options: { plugins: { legend: { position: "bottom" } } },
    });
  }

  function renderSubjects(list){
    new Chart(document.getElementById("subjectChart"), {
      type: "bar",
      data: { labels: list.map(s => s.subject), datasets: [{ label: "Avg %", data: list.map(s => s.average_percentage),
        backgroundColor: "#7C3AED", borderRadius: 6 }] },
      options: { ...commonOpts, scales: { y: { min: 0, max: 100, grid: { color: gridColor } }, x: { grid: { display: false } } } },
    });
  }

  function renderDifficulty(dist){
    new Chart(document.getElementById("difficultyChart"), {
      type: "doughnut",
      data: { labels: ["Easy", "Medium", "Hard"], datasets: [{ data: [dist.Easy, dist.Medium, dist.Hard],
        backgroundColor: ["#16A34A", "#F59E0B", "#DC2626"] }] },
      options: { plugins: { legend: { position: "bottom" } } },
    });
  }

  function renderAdaptive(s){
    const d = s.questions_by_difficulty, acc = s.accuracy_by_difficulty;
    document.getElementById("adaptive-summary").innerHTML = `
      <p class="mb-3">Recommended next difficulty: <span class="badge-diff ${qcDifficultyBadgeClass(s.current_recommended_difficulty)}">${s.current_recommended_difficulty}</span></p>
      ${["Easy", "Medium", "Hard"].map(diff => `
        <div class="mb-3">
          <div class="d-flex justify-content-between mb-1">
            <span class="fw-semibold">${diff} <span class="text-muted">(${d[diff]} questions)</span></span>
            <span class="text-muted">${acc[diff]}% accuracy</span>
          </div>
          <div class="qc-progress"><div style="width:${acc[diff]}%"></div></div>
        </div>`).join("")}`;
  }

  function renderStrongWeak(strong, weak, improvement){
    const trendIcon = improvement > 0 ? "fa-arrow-trend-up text-success" : improvement < 0 ? "fa-arrow-trend-down text-danger" : "fa-minus";
    document.getElementById("strong-weak").innerHTML = `
      <p class="mb-2"><strong>Strong subjects:</strong> ${strong.length ? strong.map(s => `<span class="chip me-1">${qcEscapeHtml(s)}</span>`).join("") : '<span class="text-muted">Not enough data yet</span>'}</p>
      <p class="mb-3"><strong>Needs work:</strong> ${weak.length ? weak.map(s => `<span class="chip me-1" style="background:#FEF3C7;color:#92400E;">${qcEscapeHtml(s)}</span>`).join("") : '<span class="text-muted">Not enough data yet</span>'}</p>
      <p class="mb-0"><i class="fa-solid ${trendIcon}"></i> Improvement trend: <strong>${improvement > 0 ? "+" : ""}${improvement}%</strong> (recent vs earlier attempts)</p>`;
  }

  init();
})();
