/* =========================================================
   QuizCraft — static/js/quiz.js
   ONE consistent question schema used throughout:
     { id, question_text, options: [...], subject, difficulty, marks }
   No "option1/option2/..." anywhere. Matches the backend's
   Question.to_public_dict() exactly.
   ========================================================= */
(function(){
  let attemptId = null;
  let currentQuestion = null;
  let selectedAnswer = null;
  let secondsRemaining = 0;
  let timerHandle = null;
  let submitting = false;
  let questionNumber = 1;
  let totalQuestions = 10;

  function qs(name){
    return new URLSearchParams(window.location.search).get(name);
  }

  async function init(){
    const user = await qcRequireAuth("student");
    if (!user) return;

    attemptId = qs("attempt") || sessionStorage.getItem("qc_active_attempt");
    if (!attemptId){
      qcToast("No active quiz found. Pick a subject to start.", "error");
      window.location.href = "/subjects/";
      return;
    }

    try{
      const state = await api.get(`/quiz/${attemptId}/`);
      if (state.status !== "in_progress"){
        window.location.href = `/result/?attempt=${attemptId}`;
        return;
      }
      totalQuestions = state.total_questions;
      questionNumber = state.answered_count + 1;
      secondsRemaining = state.seconds_remaining;
      renderQuestion(state.current_question, state.current_difficulty);
      document.getElementById("loading-state").style.display = "none";
      document.getElementById("quiz-content").style.display = "block";
      startTimer();
    } catch(err){
      qcToast(err.message, "error");
      document.getElementById("loading-state").innerHTML =
        `<div class="qc-empty"><i class="fa-solid fa-triangle-exclamation"></i><h5>Could not load quiz</h5><p>${qcEscapeHtml(err.message)}</p></div>`;
    }
  }

  function renderQuestion(question, difficulty){
    currentQuestion = question;
    selectedAnswer = null;
    document.getElementById("subject-chip").textContent = question.subject;
    const badge = document.getElementById("difficulty-badge");
    badge.textContent = difficulty;
    badge.className = `badge-diff ms-2 ${qcDifficultyBadgeClass(difficulty)}`;
    document.getElementById("question-text").textContent = question.question_text;
    document.getElementById("q-number").textContent = questionNumber;
    document.getElementById("q-total").textContent = totalQuestions;
    const pct = Math.round(((questionNumber - 1) / totalQuestions) * 100);
    document.getElementById("progress-bar").style.width = `${pct}%`;
    document.getElementById("q-progress-pct").textContent = `${pct}%`;

    const letters = ["A", "B", "C", "D"];
    const list = document.getElementById("options-list");
    list.innerHTML = question.options.map((opt, i) => `
      <div class="option-choice" data-option="${qcEscapeHtml(opt)}">
        <span class="opt-letter">${letters[i] || i + 1}</span>
        <span>${qcEscapeHtml(opt)}</span>
      </div>`).join("");

    list.querySelectorAll(".option-choice").forEach(el => {
      el.addEventListener("click", () => {
        list.querySelectorAll(".option-choice").forEach(o => o.classList.remove("selected"));
        el.classList.add("selected");
        selectedAnswer = el.dataset.option;
        document.getElementById("next-btn").disabled = false;
      });
    });
    document.getElementById("next-btn").disabled = true;
    document.getElementById("next-btn").innerHTML = questionNumber >= totalQuestions
      ? 'Finish Quiz <i class="fa-solid fa-flag-checkered ms-1"></i>'
      : 'Next <i class="fa-solid fa-arrow-right ms-1"></i>';
  }

  function startTimer(){
    updateTimerDisplay();
    clearInterval(timerHandle);
    timerHandle = setInterval(() => {
      secondsRemaining -= 1;
      if (secondsRemaining <= 0){
        secondsRemaining = 0;
        updateTimerDisplay();
        clearInterval(timerHandle);
        autoSubmit();
        return;
      }
      updateTimerDisplay();
    }, 1000);
  }

  function updateTimerDisplay(){
    const pill = document.getElementById("timer-pill");
    document.getElementById("timer-text").textContent = qcFormatSeconds(secondsRemaining);
    pill.classList.toggle("low", secondsRemaining <= 30);
  }

  async function autoSubmit(){
    if (submitting) return;
    submitting = true;
    qcToast("Time's up! Auto-submitting your quiz...", "info");
    try{
      await api.post(`/quiz/${attemptId}/submit/`);
    } catch(e){ /* backend may have already auto-submitted */ }
    sessionStorage.removeItem("qc_active_attempt");
    window.location.href = `/result/?attempt=${attemptId}`;
  }

  document.getElementById("next-btn").addEventListener("click", async () => {
    if (!selectedAnswer || submitting) return;
    submitting = true;
    const btn = document.getElementById("next-btn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    try{
      const result = await api.post(`/quiz/${attemptId}/answer/`, {
        question_id: currentQuestion.id,
        selected_answer: selectedAnswer,
      });
      if (result.finished){
        clearInterval(timerHandle);
        sessionStorage.removeItem("qc_active_attempt");
        window.location.href = `/result/?attempt=${attemptId}`;
        return;
      }
      questionNumber = result.question_number;
      secondsRemaining = result.seconds_remaining;
      renderQuestion(result.next_question, result.current_difficulty);
      submitting = false;
    } catch(err){
      qcToast(err.message, "error");
      if (err.status === 409){
        window.location.href = `/result/?attempt=${attemptId}`;
        return;
      }
      submitting = false;
      btn.disabled = false;
    }
  });

  document.getElementById("submit-early-btn").addEventListener("click", () => {
    new bootstrap.Modal(document.getElementById("submitModal")).show();
  });

  document.getElementById("confirmSubmitBtn").addEventListener("click", async () => {
    if (submitting) return;
    submitting = true;
    clearInterval(timerHandle);
    try{
      await api.post(`/quiz/${attemptId}/submit/`);
      sessionStorage.removeItem("qc_active_attempt");
      window.location.href = `/result/?attempt=${attemptId}`;
    } catch(err){
      qcToast(err.message, "error");
      submitting = false;
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (attemptId && !submitting){
      e.preventDefault();
      e.returnValue = "";
    }
  });

  init();
})();
