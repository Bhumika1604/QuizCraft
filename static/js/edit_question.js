(function(){
  let questionId = null;

  function qs(name){ return new URLSearchParams(window.location.search).get(name); }
  function setErr(field, msg){ const el = document.getElementById(`err-${field}`); if (el) el.textContent = msg || ""; }
  function optionInputs(){ return ["opt0", "opt1", "opt2", "opt3"].map(id => document.getElementById(id)); }

  function syncCorrectAnswerOptions(selected){
    const sel = document.getElementById("correct_answer_select");
    const current = selected !== undefined ? selected : sel.value;
    const values = optionInputs().map(el => el.value.trim()).filter(Boolean);
    sel.innerHTML = values.length
      ? values.map(v => `<option value="${qcEscapeHtml(v)}">${qcEscapeHtml(v)}</option>`).join("")
      : `<option value="">Fill in options first</option>`;
    if (values.includes(current)) sel.value = current;
  }

  async function init(){
    const user = await qcRequireAuth("faculty");
    if (!user) return;

    questionId = qs("id");
    if (!questionId){
      qcToast("No question specified.", "error");
      window.location.href = "/faculty/questions/";
      return;
    }

    try{
      const subjects = await api.get("/subjects/");
      const sel = document.getElementById("subject");
      sel.innerHTML = subjects.map(s => `<option value="${qcEscapeHtml(s.name)}">${qcEscapeHtml(s.name)}</option>`).join("");

      const q = await api.get(`/questions/${questionId}/`);
      sel.value = q.subject;
      document.getElementById("question_text").value = q.question_text;
      optionInputs().forEach((el, i) => { el.value = q.options[i] || ""; });
      document.getElementById("difficulty").value = q.difficulty;
      document.getElementById("marks").value = q.marks;
      syncCorrectAnswerOptions(q.correct_answer);

      document.getElementById("loading-state").style.display = "none";
      document.getElementById("form-wrap").style.display = "block";
    } catch(err){
      qcToast(err.message, "error");
      document.getElementById("loading-state").innerHTML =
        `<div class="qc-empty"><i class="fa-solid fa-triangle-exclamation"></i><h5>Could not load question</h5><p>${qcEscapeHtml(err.message)}</p></div>`;
      return;
    }

    optionInputs().forEach(el => el.addEventListener("input", () => syncCorrectAnswerOptions()));
  }

  document.getElementById("question-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    ["subject", "question_text", "options", "correct_answer", "marks"].forEach(f => setErr(f, ""));

    const subject = document.getElementById("subject").value;
    const question_text = document.getElementById("question_text").value.trim();
    const options = optionInputs().map(el => el.value.trim());
    const correct_answer = document.getElementById("correct_answer_select").value;
    const difficulty = document.getElementById("difficulty").value;
    const marks = document.getElementById("marks").value;

    let ok = true;
    if (!subject){ setErr("subject", "Select a subject."); ok = false; }
    if (question_text.length < 5){ setErr("question_text", "Question text is required."); ok = false; }
    if (options.some(o => !o) || new Set(options).size !== 4){ setErr("options", "Enter 4 unique, non-empty options."); ok = false; }
    if (!correct_answer){ setErr("correct_answer", "Choose the correct answer."); ok = false; }
    if (!ok) return;

    const btn = document.getElementById("submit-btn");
    btn.disabled = true; btn.textContent = "Saving...";
    try{
      await api.put(`/questions/${questionId}/`, { subject, question_text, options, correct_answer, difficulty, marks });
      qcToast("Question updated.", "success");
      window.location.href = "/faculty/questions/";
    } catch(err){
      qcToast(err.message, "error");
      btn.disabled = false; btn.textContent = "Update Question";
    }
  });

  init();
})();
