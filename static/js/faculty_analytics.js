(function(){
  async function init(){
    const user = await qcRequireAuth("faculty");
    if (!user) return;

    try{
      const a = await api.get("/faculty/analytics/");
      document.getElementById("loading-state").style.display = "none";

      if (!a.has_data){
        document.getElementById("empty-state").style.display = "block";
        document.getElementById("empty-state").innerHTML =
          `<div class="qc-empty"><i class="fa-solid fa-chart-pie"></i><h5>No results available yet.</h5><p>Once students complete quizzes, analytics will appear here automatically.</p></div>`;
        return;
      }

      document.getElementById("analytics-content").style.display = "block";
      renderSubjects(a.average_score_by_subject);
      renderPassFail(a.pass_fail_distribution);
      renderTime(a.attempts_over_time);
      renderDifficulty(a.difficulty_distribution);
      renderStudents(a.student_performance);
    } catch(err){
      qcToast(err.message, "error");
      document.getElementById("loading-state").innerHTML =
        `<div class="qc-empty"><i class="fa-solid fa-triangle-exclamation"></i><h5>Could not load analytics</h5><p>${qcEscapeHtml(err.message)}</p></div>`;
    }
  }

  const gridColor = "#E7E5F5";
  const commonOpts = { responsive: true, plugins: { legend: { display: false } } };

  function renderSubjects(list){
    new Chart(document.getElementById("subjectChart"), {
      type: "bar",
      data: { labels: list.map(s => s.subject), datasets: [{ label: "Avg %", data: list.map(s => s.average_percentage),
        backgroundColor: "#4F46E5", borderRadius: 6 }] },
      options: { ...commonOpts, scales: { y: { min: 0, max: 100, grid: { color: gridColor } }, x: { grid: { display: false } } } },
    });
  }

  function renderPassFail(pf){
    new Chart(document.getElementById("passFailChart"), {
      type: "doughnut",
      data: { labels: ["Passed", "Failed"], datasets: [{ data: [pf.pass, pf.fail], backgroundColor: ["#16A34A", "#DC2626"] }] },
      options: { plugins: { legend: { position: "bottom" } } },
    });
  }

  function renderTime(list){
    new Chart(document.getElementById("timeChart"), {
      type: "line",
      data: { labels: list.map(d => d.date), datasets: [{ label: "Attempts", data: list.map(d => d.count),
        borderColor: "#7C3AED", backgroundColor: "rgba(124,58,237,.12)", fill: true, tension: .35 }] },
      options: { ...commonOpts, scales: { y: { beginAtZero: true, grid: { color: gridColor } }, x: { grid: { display: false } } } },
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

  function renderStudents(list){
    const el = document.getElementById("student-performance");
    if (!list.length){
      el.innerHTML = `<p class="text-muted mb-0">No student attempts yet.</p>`;
      return;
    }
    el.innerHTML = list.map((s, i) => `
      <div class="d-flex justify-content-between align-items-center py-2" style="border-bottom:1px solid var(--border);">
        <div><span class="fw-bold me-2">#${i + 1}</span>${qcEscapeHtml(s.student_name)} <span class="text-muted small">(${s.attempts} attempt${s.attempts === 1 ? '' : 's'})</span></div>
        <div class="fw-bold">${s.average_percentage}%</div>
      </div>`).join("");
  }

  init();
})();
