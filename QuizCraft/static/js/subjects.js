(function(){
  let selectedSubject = null;
  let starting = false;

  async function init(){
    const user = await qcRequireAuth("student");
    if (!user) return;

    try{
      const subjects = await api.get("/subjects/");
      document.getElementById("loading-state").style.display = "none";
      const grid = document.getElementById("subject-grid");
      grid.style.display = "flex";

      if (!subjects.length){
        grid.innerHTML = `<div class="col-12"><div class="qc-empty"><i class="fa-solid fa-book"></i><h5>No subjects available yet.</h5><p>Ask faculty to add a subject.</p></div></div>`;
        return;
      }

      grid.innerHTML = subjects.map(s => `
        <div class="col-md-4">
          <div class="qc-card hoverlift h-100 d-flex flex-column">
            <i class="fa-solid fa-book-open fs-2 gradient-text mb-3"></i>
            <h5 class="fw-bold">${qcEscapeHtml(s.name)}</h5>
            <p class="text-muted flex-grow-1">${qcEscapeHtml(s.description || "No description provided.")}</p>
            <div class="d-flex justify-content-between align-items-center mt-2">
              <span class="chip">${s.question_count} question${s.question_count === 1 ? "" : "s"}</span>
              <button class="btn-gradient" ${s.question_count === 0 ? "disabled" : ""} data-subject="${qcEscapeHtml(s.name)}">
                ${s.question_count === 0 ? "No Questions Yet" : "Start Quiz"}
              </button>
            </div>
          </div>
        </div>`).join("");

      grid.querySelectorAll("button[data-subject]").forEach(btn => {
        btn.addEventListener("click", () => {
          selectedSubject = btn.dataset.subject;
          document.getElementById("confirmSubjectName").textContent = `Start "${selectedSubject}" quiz?`;
          new bootstrap.Modal(document.getElementById("confirmModal")).show();
        });
      });
    } catch(err){
      document.getElementById("loading-state").innerHTML =
        `<div class="qc-empty"><i class="fa-solid fa-triangle-exclamation"></i><h5>Could not load subjects</h5><p>${qcEscapeHtml(err.message)}</p></div>`;
    }
  }

  document.getElementById("confirmStartBtn").addEventListener("click", async () => {
    if (!selectedSubject || starting) return;
    starting = true;
    const btn = document.getElementById("confirmStartBtn");
    btn.disabled = true; btn.textContent = "Starting...";
    try{
      const data = await api.post("/quiz/start/", { subject: selectedSubject });
      sessionStorage.setItem("qc_active_attempt", data.attempt_id);
      window.location.href = `/quiz/?attempt=${data.attempt_id}`;
    } catch(err){
      qcToast(err.message, "error");
      btn.disabled = false; btn.textContent = "Start Quiz";
      starting = false;
    }
  });

  init();
})();
