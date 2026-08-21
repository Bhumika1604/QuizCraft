(function(){
  let allSubjects = [];

  async function init(){
    const user = await qcRequireAuth("student");
    if (!user) return;

    try{
      allSubjects = await api.get("/subjects/");
      const sel = document.getElementById("filter-subject");
      allSubjects.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.name; opt.textContent = s.name;
        sel.appendChild(opt);
      });
      await loadHistory();
    } catch(err){
      qcToast(err.message, "error");
    }
  }

  async function loadHistory(){
    const subject = document.getElementById("filter-subject").value;
    const difficulty = document.getElementById("filter-difficulty").value;
    const params = new URLSearchParams();
    if (subject) params.set("subject", subject);
    if (difficulty) params.set("difficulty", difficulty);

    try{
      const list = await api.get(`/student/history/?${params.toString()}`);
      document.getElementById("loading-state").style.display = "none";
      const wrap = document.getElementById("history-table-wrap");

      if (!list.length){
        wrap.style.display = "none";
        document.getElementById("loading-state").style.display = "block";
        document.getElementById("loading-state").innerHTML =
          `<div class="qc-empty"><i class="fa-solid fa-clock-rotate-left"></i><h5>No quiz attempts yet.</h5><p>Take your first quiz to see it here.</p></div>`;
        return;
      }
      wrap.style.display = "block";
      document.getElementById("history-tbody").innerHTML = list.map(a => `
        <tr>
          <td class="fw-semibold">${qcEscapeHtml(a.subject)}</td>
          <td>${a.score}/${a.total_marks} (${a.percentage}%)</td>
          <td>${(a.difficulty_progression || []).slice(-1).map(d => `<span class="badge-diff ${qcDifficultyBadgeClass(d)}">${d}</span>`).join("")}</td>
          <td>${qcFormatSeconds(a.time_taken_seconds)}</td>
          <td class="text-muted">${qcFormatDate(a.completed_at)}</td>
          <td>${a.passed ? '<span class="badge-pass">Passed</span>' : '<span class="badge-fail">Failed</span>'}</td>
          <td><a href="/result/?attempt=${a.attempt_id}" class="fw-semibold" style="color:var(--primary)">View <i class="fa-solid fa-arrow-right"></i></a></td>
        </tr>`).join("");
    } catch(err){
      qcToast(err.message, "error");
    }
  }

  document.getElementById("filter-subject").addEventListener("change", loadHistory);
  document.getElementById("filter-difficulty").addEventListener("change", loadHistory);
  document.getElementById("clear-filters-btn").addEventListener("click", () => {
    document.getElementById("filter-subject").value = "";
    document.getElementById("filter-difficulty").value = "";
    loadHistory();
  });

  init();
})();
