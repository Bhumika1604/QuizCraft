(function(){
  function qs(name){ return new URLSearchParams(window.location.search).get(name); }

  async function init(){
    const user = await qcRequireAuth("student");
    if (!user) return;

    const attemptId = qs("attempt");
    if (!attemptId){ window.location.href = "/history/"; return; }

    try{
      const r = await api.get(`/results/${attemptId}/`);
      document.getElementById("loading-state").style.display = "none";
      document.getElementById("result-content").style.display = "block";
      render(r);
    } catch(err){
      qcToast(err.message, "error");
      document.getElementById("loading-state").innerHTML =
        `<div class="qc-empty"><i class="fa-solid fa-triangle-exclamation"></i><h5>Could not load result</h5><p>${qcEscapeHtml(err.message)}</p></div>`;
    }
  }

  function render(r){
    document.getElementById("subject-chip").textContent = r.subject;
    document.getElementById("correct-count").textContent = r.correct_count;
    document.getElementById("wrong-count").textContent = r.wrong_count;
    document.getElementById("time-taken").textContent = qcFormatSeconds(r.time_taken_seconds);

    const pct = r.percentage;
    document.getElementById("score-pct-text").textContent = `${pct}%`;
    const circumference = 327;
    const offset = circumference - (circumference * Math.min(100, pct) / 100);
    const circle = document.getElementById("score-circle");
    setTimeout(() => { circle.style.transition = "stroke-dashoffset 1s ease"; circle.setAttribute("stroke-dashoffset", offset); }, 100);

    const badgeEl = document.getElementById("pass-fail-badge");
    badgeEl.innerHTML = r.passed
      ? `<span class="badge-pass fs-6"><i class="fa-solid fa-circle-check"></i> Passed</span>`
      : `<span class="badge-fail fs-6"><i class="fa-solid fa-circle-xmark"></i> Not Passed</span>`;

    let message;
    if (pct >= 85) message = "Excellent work! You've mastered this material.";
    else if (pct >= 60) message = "Good job! A bit more practice will make you even stronger.";
    else message = "Needs improvement — review the topics and try again.";
    document.getElementById("performance-message").textContent = message;

    const prog = r.difficulty_progression || [];
    document.getElementById("difficulty-progression").innerHTML = prog.map((d, i) => `
      <span class="badge-diff ${d === 'Easy' ? 'badge-easy' : d === 'Hard' ? 'badge-hard' : 'badge-medium'}">
        Q${i + 1}: ${d}
      </span>`).join("");
  }

  init();
})();
