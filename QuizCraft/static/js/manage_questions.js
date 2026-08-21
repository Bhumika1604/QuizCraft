(function(){
  let deleteTargetId = null;
  let searchTimer = null;

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

    await loadQuestions();
  }

  async function loadQuestions(){
    const search = document.getElementById("search-input").value.trim();
    const subject = document.getElementById("filter-subject").value;
    const difficulty = document.getElementById("filter-difficulty").value;
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (subject) params.set("subject", subject);
    if (difficulty) params.set("difficulty", difficulty);

    try{
      const data = await api.get(`/questions/?${params.toString()}`);
      document.getElementById("loading-state").style.display = "none";
      const wrap = document.getElementById("questions-wrap");
      wrap.style.display = "block";

      if (!data.questions.length){
        wrap.innerHTML = `<div class="qc-empty"><i class="fa-solid fa-database"></i><h5>No questions found.</h5><p>Try clearing filters or add a new question.</p></div>`;
        return;
      }

      wrap.innerHTML = `<div class="qc-card" style="overflow-x:auto;"><table class="qc-table">
        <thead><tr><th>Question</th><th>Subject</th><th>Difficulty</th><th>Marks</th><th></th></tr></thead>
        <tbody>${data.questions.map(q => `
          <tr>
            <td style="max-width:340px;">${qcEscapeHtml(q.question_text)}</td>
            <td>${qcEscapeHtml(q.subject)}</td>
            <td><span class="badge-diff ${qcDifficultyBadgeClass(q.difficulty)}">${q.difficulty}</span></td>
            <td>${q.marks}</td>
            <td class="text-end">
              <a href="/faculty/questions/edit/?id=${q.id}" class="btn-outline-gradient btn-sm px-3 py-1 me-1">Edit</a>
              <button class="btn-danger-soft btn-sm px-3 py-1" data-id="${q.id}">Delete</button>
            </td>
          </tr>`).join("")}</tbody></table>
        <div class="text-muted small mt-2">Showing ${data.questions.length} of ${data.total} question(s).</div>
      </div>`;

      wrap.querySelectorAll("button[data-id]").forEach(btn => {
        btn.addEventListener("click", () => {
          deleteTargetId = btn.dataset.id;
          new bootstrap.Modal(document.getElementById("deleteModal")).show();
        });
      });
    } catch(err){
      document.getElementById("loading-state").innerHTML =
        `<div class="qc-empty"><i class="fa-solid fa-triangle-exclamation"></i><h5>Could not load questions</h5><p>${qcEscapeHtml(err.message)}</p></div>`;
    }
  }

  document.getElementById("confirmDeleteBtn").addEventListener("click", async () => {
    if (!deleteTargetId) return;
    try{
      await api.del(`/questions/${deleteTargetId}/`);
      qcToast("Question deleted.", "success");
      bootstrap.Modal.getInstance(document.getElementById("deleteModal")).hide();
      loadQuestions();
    } catch(err){
      qcToast(err.message, "error");
    }
  });

  document.getElementById("search-input").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadQuestions, 350);
  });
  document.getElementById("filter-subject").addEventListener("change", loadQuestions);
  document.getElementById("filter-difficulty").addEventListener("change", loadQuestions);
  document.getElementById("clear-btn").addEventListener("click", () => {
    document.getElementById("search-input").value = "";
    document.getElementById("filter-subject").value = "";
    document.getElementById("filter-difficulty").value = "";
    loadQuestions();
  });

  init();
})();
