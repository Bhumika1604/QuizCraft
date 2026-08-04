/* =========================================================
   QUIZCRAFT — js/history.js
   Powers history.html: search/filter/paginate the student's
   own quiz attempts, render an accuracy trend chart, and
   let them download an individual attempt's result.

   NOTE: HISTORY_DATA is a front-end demo data set. Once
   wired to Django, fetch this from something like
   GET /api/students/<id>/history/ instead.
   ========================================================= */
(function () {
  'use strict';

  const SUBJECT_LABELS = { python: 'Python', java: 'Java', cpp: 'C++', webdev: 'Web Development', dbms: 'DBMS', ml: 'Machine Learning' };

  let HISTORY_DATA = [];

  document.addEventListener("DOMContentLoaded", () => {

    // BUG FIX: this used to fetch EVERY student's history with no
    // filter, so a student could see other students' attempts in
    // their own history table. It now passes the logged-in user's
    // name (stored by js/loginpage1.js) to the backend's new
    // ?student_name= filter on get_history().
    let currentUser = null;
    try {
      currentUser = JSON.parse(localStorage.getItem('quizcraft_user'));
    } catch (e) {
      currentUser = null;
    }
    const studentParam = currentUser && currentUser.name
      ? `?student_name=${encodeURIComponent(currentUser.name)}`
      : '';

    fetch(`http://127.0.0.1:8000/users/history/${studentParam}`)
    .then(res => res.json())
    .then(data => {

        // BUG FIX: difficulty used to be hardcoded as "Medium" for
        // every row (capitalized, too — it never matched the
        // lowercase 'easy'/'medium'/'hard' filter dropdown values or
        // the qp-diff-badge.<level> CSS classes, so the badge colour
        // was always wrong). The date was hardcoded to "today" for
        // every attempt as well. Both now come from the real
        // MongoDB document via users/views.py's get_history().
        HISTORY_DATA = (Array.isArray(data) ? data : []).map(item => ({

            topic: item.subject,
            subject: (item.subject || '').toLowerCase().replace(/\s+/g, ""),
            score: item.score,
            total: item.total,
            difficulty: (item.difficulty || 'easy').toLowerCase(),
            date: item.attempted_at ? item.attempted_at.split("T")[0] : new Date().toISOString().split("T")[0]

        }));

        renderTrendChart();

        initTable(document.getElementById("histTableBody"));

    })
    .catch((err) => {
      console.log('Could not load history:', err);
      HISTORY_DATA = [];
      renderTrendChart();
      initTable(document.getElementById("histTableBody"));
    });

});
  function renderTrendChart() {
    const ctx = document.getElementById('historyTrendChart');
    if (!ctx || typeof Chart === 'undefined') return;

    const ordered = [...HISTORY_DATA].reverse(); // oldest to newest
    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, 'rgba(37,99,235,0.35)');
    gradient.addColorStop(1, 'rgba(37,99,235,0)');

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ordered.map((h) => new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })),
        datasets: [{
          label: 'Score %',
          data: ordered.map((h) => Math.round((h.score / h.total) * 100)),
          borderColor: '#2563EB',
          backgroundColor: gradient,
          borderWidth: 3,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#2563EB',
          pointBorderWidth: 2,
          pointRadius: 4,
          tension: 0.4,
          fill: true,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 100, grid: { color: 'rgba(148,163,184,.15)' }, ticks: { callback: (v) => v + '%' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function initTable(tableBody) {
    const searchInput = document.getElementById('histSearchInput');
    const subjectFilter = document.getElementById('histSubjectFilter');
    const difficultyFilter = document.getElementById('histDifficultyFilter');
    const paginationInfo = document.getElementById('histPaginationInfo');
    const paginationButtons = document.getElementById('histPaginationButtons');

    const PAGE_SIZE = 6;
    let currentPage = 1;

    function getFiltered() {
      const query = (searchInput.value || '').trim().toLowerCase();
      const subject = subjectFilter.value;
      const difficulty = difficultyFilter.value;

      return HISTORY_DATA.filter((h) => {
        const matchesQuery = !query || h.topic.toLowerCase().includes(query);
        const matchesSubject = subject === 'all' || h.subject === subject;
        const matchesDifficulty = difficulty === 'all' || h.difficulty === difficulty;
        return matchesQuery && matchesSubject && matchesDifficulty;
      });
    }

    function render() {
      const filtered = getFiltered();
      const totalPages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
      currentPage = Math.min(currentPage, totalPages);
      const start = (currentPage - 1) * PAGE_SIZE;
      const pageItems = filtered.slice(start, start + PAGE_SIZE);

      tableBody.innerHTML = '';

      if (!pageItems.length) {
        tableBody.innerHTML = '<tr class="qp-empty-row"><td colspan="6"><i class="bi bi-inbox" style="font-size:1.8rem; display:block; margin-bottom:8px;"></i>No attempts match your filters.</td></tr>';
      } else {
        pageItems.forEach((h, idx) => {
          const percentage = Math.round((h.score / h.total) * 100);
          const formattedDate = new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          const globalIndex = HISTORY_DATA.indexOf(h);

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td class="qp-question-cell"><p>${h.topic}</p><span>${SUBJECT_LABELS[h.subject] || h.subject}</span></td>
            <td class="qp-score-cell">${h.score}/${h.total}</td>
            <td>
              <div class="qp-percentage-bar">
                <div class="qc-progress-track"><div class="qc-progress-fill" style="width:${percentage}%; background:${percentage >= 50 ? 'var(--grad-accent)' : 'linear-gradient(135deg,#F87171,#EF4444)'};"></div></div>
                <span>${percentage}%</span>
              </div>
            </td>
            <td><span class="qc-badge qp-diff-badge ${h.difficulty}">${capitalize(h.difficulty)}</span></td>
            <td>${formattedDate}</td>
            <td>
              <button class="qp-icon-btn view hist-download-btn" data-index="${globalIndex}" title="Download result" aria-label="Download result">
                <i class="bi bi-download"></i>
              </button>
            </td>
          `;
          tableBody.appendChild(tr);
        });
      }

      paginationInfo.textContent = filtered.length
        ? `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length} attempts`
        : 'Showing 0 of 0 attempts';

      renderPagination(paginationButtons, currentPage, totalPages, (page) => { currentPage = page; render(); });
      wireDownloadButtons();
    }

    function wireDownloadButtons() {
      tableBody.querySelectorAll('.hist-download-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const h = HISTORY_DATA[Number(btn.getAttribute('data-index'))];
          if (!h) return;
          downloadAttempt(h);
        });
      });
    }

    searchInput.addEventListener('input', () => { currentPage = 1; render(); });
    subjectFilter.addEventListener('change', () => { currentPage = 1; render(); });
    difficultyFilter.addEventListener('change', () => { currentPage = 1; render(); });

    render();
  }

  function downloadAttempt(h) {
    const percentage = Math.round((h.score / h.total) * 100);
    const lines = [
      'QuizCraft — Quiz Attempt',
      '=========================',
      `Topic: ${h.topic}`,
      `Score: ${h.score}/${h.total} (${percentage}%)`,
      `Difficulty: ${capitalize(h.difficulty)}`,
      `Date: ${new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quizcraft-${h.subject}-${h.date}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function renderPagination(container, currentPage, totalPages, onPageChange) {
    container.innerHTML = '';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'qp-page-btn';
    prevBtn.innerHTML = '<i class="bi bi-chevron-left"></i>';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => onPageChange(currentPage - 1));
    container.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.className = 'qp-page-btn' + (i === currentPage ? ' active' : '');
      btn.textContent = i;
      btn.addEventListener('click', () => onPageChange(i));
      container.appendChild(btn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'qp-page-btn';
    nextBtn.innerHTML = '<i class="bi bi-chevron-right"></i>';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener('click', () => onPageChange(currentPage + 1));
    container.appendChild(nextBtn);
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
})();
