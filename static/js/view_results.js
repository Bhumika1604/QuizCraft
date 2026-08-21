(function(){
  async function init(){
    const user = await qcRequireAuth("faculty");
    if (!user) return;

    try{
      const subjects = await api.get("/subjects/");
      const sel = document.getElementById("filter-subject");
      subjects.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.name; opt.textContent = s.name;
        sel.appendChild(opt);
      });
    } catch(e){ /* non-fatal */ }

    document.getElementById("apply-filters").addEventListener("click", loadResults);
    document.getElementById("search-student").addEventListener("keydown", e => { if (e.key === "Enter") loadResults(); });
    await loadResults();
  }

  async function loadResults(){
    const student = document.getElementById("search-student").value.trim();
    const subject = document.getElementById("filter-subject").value;
    const params = new URLSearchParams();
    if (student) params.set("student", student);
    if (subject) params.set("subject", subject);

    try{
      const results = await api.get(`/faculty/results/?${params.toString()}`);
      document.getElementById("loading-state").style.display = "none";
      if (!results.length){
        document.getElementById("results-empty").style.display = "block";
        document.getElementById("results-table-wrap").style.display = "none";
        return;
      }
      document.getElementById("results-empty").style.display = "none";
      document.getElementById("results-table-wrap").style.display = "block";
      document.getElementById("results-body").innerHTML = results.map(r => `
        <tr>
          <td><div class="fw-semibold">${qcEscapeHtml(r.student_name)}</div><div class="text-muted small">${qcEscapeHtml(r.student_email)}</div></td>
          <td>${qcEscapeHtml(r.subject)}</td>
          <td>${r.score} / ${r.total_marks}</td>
          <td class="fw-bold">${r.percentage}%</td>
          <td>${(r.difficulty_progression || []).slice(-1)[0] || "-"}</td>
          <td>${qcFormatSeconds(r.time_taken_seconds)}</td>
          <td>${qcFormatDate(r.completed_at)}</td>
          <td><span class="${r.passed ? 'badge-pass' : 'badge-fail'}">${r.passed ? 'Passed' : 'Failed'}</span></td>
        </tr>`).join("");
    } catch(err){
      qcToast(err.message, "error");
    }
  }

  init();
})();
