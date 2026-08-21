(function(){
  let subjectModal;
  let currentSubjects = [];

  async function init(){
    const user = await qcRequireAuth("faculty");
    if (!user) return;
    subjectModal = new bootstrap.Modal(document.getElementById("subjectModal"));
    await loadSubjects();
    document.getElementById("subject-form").addEventListener("submit", onSave);
  }

  async function loadSubjects(){
    try{
      currentSubjects = await api.get("/subjects/");
      document.getElementById("loading-state").style.display = "none";
      if (!currentSubjects.length){
        document.getElementById("subjects-empty").style.display = "block";
        document.getElementById("subjects-grid").style.display = "none";
        return;
      }
      document.getElementById("subjects-empty").style.display = "none";
      const grid = document.getElementById("subjects-grid");
      grid.style.display = "flex";
      grid.innerHTML = currentSubjects.map(s => `
        <div class="col-md-6 col-lg-4">
          <div class="qc-card h-100">
            <div class="d-flex justify-content-between align-items-start">
              <h5 class="fw-bold mb-1">${qcEscapeHtml(s.name)}</h5>
              <span class="badge-medium">${s.question_count} question${s.question_count === 1 ? '' : 's'}</span>
            </div>
            <p class="text-muted small mb-3">${qcEscapeHtml(s.description || "No description")}</p>
            <div class="d-flex gap-2">
              <button class="btn-outline-gradient btn-sm flex-fill" onclick="qcEditSubject('${s.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
              <button class="btn btn-outline-danger btn-sm flex-fill" onclick="qcDeleteSubject('${s.id}')"><i class="fa-solid fa-trash"></i> Delete</button>
            </div>
          </div>
        </div>`).join("");
    } catch(err){
      qcToast(err.message, "error");
    }
  }

  window.qcOpenSubjectModal = function(){
    document.getElementById("subjectModalTitle").textContent = "Add Subject";
    document.getElementById("subject-id").value = "";
    document.getElementById("subject-name").value = "";
    document.getElementById("subject-description").value = "";
  };

  window.qcEditSubject = function(id){
    const s = currentSubjects.find(x => x.id === id);
    if (!s) return;
    document.getElementById("subjectModalTitle").textContent = "Edit Subject";
    document.getElementById("subject-id").value = s.id;
    document.getElementById("subject-name").value = s.name;
    document.getElementById("subject-description").value = s.description || "";
    subjectModal.show();
  };

  window.qcDeleteSubject = async function(id){
    if (!confirm("Delete this subject? All its questions will also be removed.")) return;
    try{
      await api.del(`/subjects/${id}/`);
      qcToast("Subject deleted.", "success");
      await loadSubjects();
    } catch(err){
      qcToast(err.message, "error");
    }
  };

  async function onSave(e){
    e.preventDefault();
    const id = document.getElementById("subject-id").value;
    const name = document.getElementById("subject-name").value.trim();
    const description = document.getElementById("subject-description").value.trim();
    try{
      if (id){
        await api.put(`/subjects/${id}/`, { name, description });
        qcToast("Subject updated.", "success");
      } else {
        await api.post("/subjects/", { name, description });
        qcToast("Subject added.", "success");
      }
      subjectModal.hide();
      await loadSubjects();
    } catch(err){
      qcToast(err.message, "error");
    }
  }

  init();
})();
