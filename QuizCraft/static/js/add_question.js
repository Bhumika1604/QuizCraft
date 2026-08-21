(function(){
  function setErr(field, msg){ const el = document.getElementById(`err-${field}`); if (el) el.textContent = msg || ""; }

  function optionInputs(){
    return ["opt0", "opt1", "opt2", "opt3"].map(id => document.getElementById(id));
  }

  function syncCorrectAnswerOptions(){
    const sel = document.getElementById("correct_answer_select");
    const current = sel.value;
    const values = optionInputs().map(el => el.value.trim()).filter(Boolean);
    sel.innerHTML = values.length
      ? values.map(v => `<option value="${qcEscapeHtml(v)}">${qcEscapeHtml(v)}</option>`).join("")
      : `<option value="">Fill in options first</option>`;
    if (values.includes(current)) sel.value = current;
  }

  async function init(){
    const user = await qcRequireAuth("faculty");
    if (!user) return;

    try{
      const subjects = await api.get("/subjects/");
      const sel = document.getElementById("subject");
      if (!subjects.length){
        sel.innerHTML = `<option value="">No subjects yet — add one first</option>`;
      } else {
        sel.innerHTML = subjects.map(s => `<option value="${qcEscapeHtml(s.name)}">${qcEscapeHtml(s.name)}</option>`).join("");
      }
    } catch(err){
      qcToast(err.message, "error");
    }

    optionInputs().forEach(el => el.addEventListener("input", syncCorrectAnswerOptions));
    syncCorrectAnswerOptions();
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
      await api.post("/questions/", { subject, question_text, options, correct_answer, difficulty, marks });
      qcToast("Question added.", "success");
      window.location.href = "/faculty/questions/";
    } catch(err){
      qcToast(err.message, "error");
      btn.disabled = false; btn.textContent = "Save Question";
    }
  });

  init();
})();
