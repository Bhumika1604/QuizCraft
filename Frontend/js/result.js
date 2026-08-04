/* =========================================================
   QUIZCRAFT — js/result.js
   Reads the just-completed quiz result from the backend
   (GET /users/latest-result/) and renders the score ring,
   breakdown cards, and a Chart.js doughnut.

   No fabricated/placeholder result is ever shown: if this
   student hasn't completed a quiz yet, or the backend can't be
   reached, the page shows an honest empty/error state instead of
   fake demo numbers.
   ========================================================= */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {

    // BUG FIX: this used to fetch the single most recent result
    // across ALL students with no filter — two students opening
    // result.html back-to-back could see each other's scores. It
    // now sends the logged-in user's name (stored by
    // js/loginpage1.js) so the backend's ?student_name= filter in
    // get_latest_result() returns the right attempt.
    let currentUser = null;
    try {
      currentUser = JSON.parse(localStorage.getItem('quizcraft_user'));
    } catch (e) {
      currentUser = null;
    }
    const studentParam = currentUser && currentUser.name
      ? `?student_name=${encodeURIComponent(currentUser.name)}`
      : '';

    fetch(`http://127.0.0.1:8000/users/latest-result/${studentParam}`)
    .then(res => res.json())
    .then(data => {

        if (data.status === 'error') {
          // Genuinely no result saved yet for this student. Try the
          // REAL result js/quiz.js just wrote to localStorage right
          // after submitting (a fast-path in case the backend write
          // hasn't been indexed/queried yet) before falling back to
          // an honest "no result yet" empty state — never a
          // fabricated score.
          const justSubmitted = readJustSubmittedResult();
          if (justSubmitted) {
            renderSummary(justSubmitted);
            animateRing(justSubmitted.percentage);
            renderChart(justSubmitted);
            wireDownload(justSubmitted);
            return;
          }
          renderEmptyState();
          return;
        }

        const percentage = Math.round((data.score / data.total) * 100);

        // BUG FIX: wrongCount/unansweredCount used to be guessed as
        // (total - score) / 0 — now that submit_result() stores a
        // real dictionary breakdown (see js/quiz.js), we use the
        // actual counts when the backend provides them.
        const breakdown = data.breakdown;

        const result = {

            subject: data.subject,
            difficulty: data.difficulty,
            total: data.total,
            correctCount: breakdown ? breakdown.correct : data.score,
            wrongCount: breakdown ? breakdown.wrong : (data.total - data.score),
            unansweredCount: breakdown ? breakdown.unanswered : 0,
            percentage: percentage,
            timeTakenSeconds: data.time_taken_seconds,
            timestamp: data.attempted_at || new Date().toISOString()

        };

        renderSummary(result);
        animateRing(result.percentage);
        renderChart(result);
        wireDownload(result);

    })
    .catch((err) => {
      // BUG FIX: this used to silently substitute a fabricated
      // "80% on Python" sample result on ANY network failure,
      // including the backend simply being offline — indistinguishable
      // from a real score. It now shows an honest connection-error
      // state instead of fake data.
      console.log('Could not load the latest result:', err);
      renderErrorState();
    });

});

  /* Reads the REAL result js/quiz.js wrote to localStorage
     immediately after submitting — used only as a brief fast-path
     right after finishing a quiz, in case the backend hasn't yet
     reflected the write when this page's GET request runs. Returns
     null (never fabricated data) if nothing is there. */
  function readJustSubmittedResult() {
    try {
      const raw = localStorage.getItem('quizcraft_last_result');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /* Honest "you haven't taken a quiz yet" state — replaces the old
     fabricated FALLBACK_RESULT. */
  function renderEmptyState() {
    const card = document.querySelector('.result-score-card');
    if (card) {
      card.innerHTML = `
        <div style="text-align:center; padding:30px 20px; width:100%;">
          <i class="bi bi-clipboard-data" style="font-size:2.4rem; color:var(--text-muted); display:block; margin-bottom:14px;"></i>
          <h4 style="margin-bottom:10px;">No quiz result yet</h4>
          <p style="color:var(--text-muted); margin-bottom:22px;">Take a quiz to see your score, breakdown and performance chart here.</p>
          <a href="subjects.html" class="qc-btn qc-btn-primary qc-ripple"><i class="bi bi-play-circle"></i> Take a Quiz</a>
        </div>
      `;
    }
    document.querySelector('.result-breakdown-grid')?.classList.add('d-none');
    document.querySelector('.result-chart-panel')?.classList.add('d-none');
  }

  /* Honest "couldn't reach the server" state — replaces the old
     fabricated FALLBACK_RESULT that used to appear on any network
     failure too. */
  function renderErrorState() {
    const card = document.querySelector('.result-score-card');
    if (card) {
      card.innerHTML = `
        <div style="text-align:center; padding:30px 20px; width:100%;">
          <i class="bi bi-wifi-off" style="font-size:2.4rem; color:var(--text-muted); display:block; margin-bottom:14px;"></i>
          <h4 style="margin-bottom:10px;">Could not load your result</h4>
          <p style="color:var(--text-muted); margin-bottom:22px;">Make sure the Django backend and MongoDB are running, then refresh this page.</p>
          <a href="student_dashboard.html" class="qc-btn qc-btn-outline qc-ripple"><i class="bi bi-arrow-left"></i> Back to Dashboard</a>
        </div>
      `;
    }
    document.querySelector('.result-breakdown-grid')?.classList.add('d-none');
    document.querySelector('.result-chart-panel')?.classList.add('d-none');
  }

  function renderSummary(result) {
    document.getElementById('resultSubjectTitle').textContent = result.subject;
    document.getElementById('resultPercentValue').textContent = result.percentage + '%';
    document.getElementById('resultCorrectCount').textContent = result.correctCount;
    document.getElementById('resultWrongCount').textContent = result.wrongCount;
    document.getElementById('resultUnansweredCount').textContent = result.unansweredCount;

    const badge = document.getElementById('resultStatusBadge');
    const summaryText = document.getElementById('resultSummaryText');

    if (result.percentage >= 80) {
      badge.className = 'qc-badge qc-badge-green';
      badge.innerHTML = '<i class="bi bi-patch-check-fill"></i> Excellent Work';
      summaryText.textContent = `You scored ${result.percentage}% — strong grasp of ${result.subject}. The adaptive engine will raise the difficulty next round.`;
    } else if (result.percentage >= 50) {
      badge.className = 'qc-badge qc-badge-cyan';
      badge.innerHTML = '<i class="bi bi-graph-up-arrow"></i> Good Progress';
      summaryText.textContent = `You scored ${result.percentage}% on ${result.subject}. A quick review of the missed questions will push this higher.`;
    } else {
      badge.className = 'qc-badge qc-badge-orange';
      badge.innerHTML = '<i class="bi bi-arrow-repeat"></i> Keep Practicing';
      summaryText.textContent = `You scored ${result.percentage}% on ${result.subject}. The next attempt will focus on your weaker topics.`;
    }
  }

  function animateRing(percentage) {
    const ring = document.getElementById('resultRingFg');
    if (!ring) return;
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    ring.style.strokeDasharray = circumference.toFixed(2);
    ring.style.strokeDashoffset = circumference.toFixed(2);

    requestAnimationFrame(() => {
      const offset = circumference - (percentage / 100) * circumference;
      ring.style.strokeDashoffset = offset.toFixed(2);
    });
  }

  function renderChart(result) {
    const ctx = document.getElementById('resultChart');
    if (!ctx || typeof Chart === 'undefined') return;

    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Correct', 'Wrong', 'Unanswered'],
        datasets: [{
          data: [result.correctCount, result.wrongCount, result.unansweredCount],
          backgroundColor: ['#10B981', '#EF4444', '#94A3B8'],
          borderColor: '#fff',
          borderWidth: 3,
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 18, font: { family: 'Poppins' } } }
        }
      }
    });
  }

  function wireDownload(result) {
    const btn = document.getElementById('resultDownloadBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const lines = [
        'QuizCraft — Quiz Result',
        '========================',
        `Subject: ${result.subject}`,
        `Score: ${result.percentage}%`,
        `Correct Answers: ${result.correctCount}`,
        `Wrong Answers: ${result.wrongCount}`,
        `Unanswered: ${result.unansweredCount}`,
        `Total Questions: ${result.total}`,
        `Date: ${new Date(result.timestamp).toLocaleString()}`,
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'quizcraft-result.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
})();
