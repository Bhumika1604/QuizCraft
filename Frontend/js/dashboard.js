/* =========================================================
   QUIZCRAFT — js/dashboard.js
   Student dashboard charts (Chart.js). Common navbar/theme/
   reveal/counter behavior already runs from common.js.
   ========================================================= */
(function () {
  'use strict';

 document.addEventListener("DOMContentLoaded", () => {

    loadDashboard();
    loadSubjects();
    loadLeaderboard();

    if(typeof Chart !== "undefined"){
        loadPerformanceCharts();
    }

});

function loadSubjects() {

    // BUG FIX: progress used to be a single shared counter identical
    // for every student. Passing the logged-in student's name makes
    // the backend compute THEIR own average score per subject instead.
    let currentUser = null;
    try {
        currentUser = JSON.parse(localStorage.getItem("quizcraft_user"));
    } catch (e) {
        currentUser = null;
    }
    const studentParam = currentUser && currentUser.name
        ? `?student_name=${encodeURIComponent(currentUser.name)}`
        : "";

    fetch(`http://127.0.0.1:8000/users/subjects/${studentParam}`)
    .then(res => res.json())
    .then(subjects => {

        const container = document.getElementById("subjectsContainer");

        // BUG FIX: this used to run unconditionally with debug
        // console.log()/alert() calls left in from development —
        // removed the noisy alert() and the two console.log() calls
        // that leaked internal fetch data into the browser console.
        if (!container) {
            return;
        }

        container.innerHTML = "";

        subjects.forEach(subject => {

            container.innerHTML += `
                <div class="col-6 col-md-4 col-lg-2">
                    <div class="dash-subject-card">
                        <i class="bi bi-book-fill"></i>
                        <h6>${subject.subject_name}</h6>
                        <div class="qc-progress-track">
                            <div class="qc-progress-fill" style="width:${subject.progress}%"></div>
                        </div>
                        <span>${subject.progress}%</span>
                    </div>
                </div>
            `;
        });

    })
    .catch(err => console.log(err));
}


  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // Shared helper — several functions on this page (dashboard header,
  // leaderboard highlighting, performance charts) all need to know
  // who is currently logged in.
  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem("quizcraft_user"));
    } catch (e) {
      return null;
    }
  }

  function loadDashboard(){

    // BUG FIX: /users/dashboard/ used to be called with no
    // identifying info at all, so the backend just returned
    // whichever user happened to be first in MongoDB — every
    // student saw the same name. We now read the profile
    // js/loginpage1.js stored on login and pass its email along so
    // the backend looks up THAT specific student.
    const currentUser = getCurrentUser();

    const emailParam = currentUser && currentUser.email
        ? `?email=${encodeURIComponent(currentUser.email)}`
        : "";

    fetch(`http://127.0.0.1:8000/users/dashboard/${emailParam}`)

    .then(res=>res.json())

    .then(data=>{

        if(data.status==="success"){

            document.getElementById("studentName").innerHTML=data.name;

            document.getElementById("studentAvatar").innerHTML=
            data.name.charAt(0).toUpperCase();

        }

    });

}

  /* =========================================================
     LEADERBOARD (student_dashboard.html — new)
     -----------------------------------------------------------
     WHY: used to be 3 hardcoded rows, including a fake
     "Aarav Mehta (You)" entry that claimed to be whoever was
     looking at the page. Now fetches the real ranking from
     GET /users/leaderboard/ (aggregated from MongoDB results) and
     highlights whichever row actually matches the logged-in user.
     ========================================================= */
  function loadLeaderboard() {
    const list = document.getElementById('studentLeaderboardList');
    if (!list) return;

    const currentUser = getCurrentUser();

    fetch("http://127.0.0.1:8000/users/leaderboard/")
      .then((res) => res.json())
      .then((data) => {
        const rows = (data.status === 'success' && Array.isArray(data.leaderboard)) ? data.leaderboard : [];

        if (!rows.length) {
          list.innerHTML = '<li><span class="lb-name">No quiz attempts yet — be the first!</span></li>';
          return;
        }

        const top = rows.slice(0, 2);
        const you = currentUser ? rows.find((r) => r.name === currentUser.name) : null;

        // Show the top 2, then the logged-in student's own row (even
        // if they're outside the top 2) so they can always see where
        // they stand — same UX intent as the original hardcoded markup,
        // just backed by real data now.
        let displayRows = [...top];
        if (you && !top.some((r) => r.rank === you.rank)) {
          displayRows.push(you);
        } else if (!you && rows.length > 2) {
          displayRows = rows.slice(0, 3);
        }

        list.innerHTML = displayRows.map((r) => {
          const initials = (r.name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
          const isYou = currentUser && r.name === currentUser.name;
          const rankClass = r.rank === 1 ? 'rank gold' : r.rank === 2 ? 'rank silver' : 'rank';
          const nameLabel = isYou ? `${r.name} (You)` : r.name;
          return `
            <li${isYou ? ' class="is-you"' : ''}>
              <span class="${rankClass}">${r.rank}</span>
              <span class="lb-avatar">${initials}</span>
              <span class="lb-name">${nameLabel}</span>
              <span class="lb-score">${r.average_score}%</span>
            </li>
          `;
        }).join('');
      })
      .catch((err) => {
        console.log('Could not load leaderboard:', err);
        list.innerHTML = '<li><span class="lb-name">Could not load leaderboard.</span></li>';
      });
  }

  /* =========================================================
     PERFORMANCE CHARTS (student_dashboard.html — new)
     -----------------------------------------------------------
     WHY: both charts used to be hardcoded — a fixed 7-point
     accuracy line ([58,64,61,70,75,78,82]) and a fixed Easy/
     Medium/Hard split ([20,48,32]) shown to every student
     regardless of what they'd actually done. Both are now driven
     by GET /users/student-performance/?student_name=..., which
     aggregates THIS student's own results from MongoDB.
     ========================================================= */
  function animateCount(el, target) {
    if (!el || target === undefined || target === null) return;
    const duration = 900;
    const start = performance.now();
    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(target * eased);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  function loadPerformanceCharts() {
    const perfCtx = document.getElementById('performanceChart');
    const diffCtx = document.getElementById('adaptiveChart');

    // BUG FIX: these 4 stat cards used to show hardcoded 48/82%/7/#12
    // for every student regardless of what they'd actually done.
    const quizzesEl = document.getElementById('studStatQuizzes');
    const avgScoreEl = document.getElementById('studStatAvgScore');
    const streakEl = document.getElementById('studStatStreak');
    const rankEl = document.getElementById('studStatRank');

    if (!perfCtx && !diffCtx && !quizzesEl && !avgScoreEl && !streakEl && !rankEl) return;

    const currentUser = getCurrentUser();
    if (!currentUser || !currentUser.name) {
      renderEmptyPerformanceCharts(perfCtx, diffCtx, 'Log in to see your performance.');
      return;
    }

    fetch(`http://127.0.0.1:8000/users/student-performance/?student_name=${encodeURIComponent(currentUser.name)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status !== 'success' || !data.total_attempts) {
          renderEmptyPerformanceCharts(perfCtx, diffCtx, 'Take your first quiz to see performance charts here.');
          // Stat cards stay at their honest default of 0 (see the
          // data-target="0" fallback already in the HTML) rather than
          // animating to a fabricated number.
          return;
        }

        animateCount(quizzesEl, data.quizzes_attempted);
        animateCount(avgScoreEl, data.average_score);
        animateCount(streakEl, data.day_streak);
        if (rankEl) {
          if (data.leaderboard_rank === null || data.leaderboard_rank === undefined) {
            rankEl.textContent = '—';
          } else {
            animateCount(rankEl, data.leaderboard_rank);
          }
        }

        if (perfCtx && data.accuracy_series && data.accuracy_series.length) {
          const gradient = perfCtx.getContext('2d').createLinearGradient(0, 0, 0, 240);
          gradient.addColorStop(0, 'rgba(37,99,235,0.35)');
          gradient.addColorStop(1, 'rgba(37,99,235,0)');

          new Chart(perfCtx, {
            type: 'line',
            data: {
              labels: data.accuracy_series.map((p) => p.label),
              datasets: [{
                label: 'Accuracy %',
                data: data.accuracy_series.map((p) => p.percentage),
                borderColor: cssVar('--primary') || '#2563EB',
                backgroundColor: gradient,
                borderWidth: 3,
                pointBackgroundColor: '#fff',
                pointBorderColor: cssVar('--primary') || '#2563EB',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
                tension: 0.4,
                fill: true,
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: {
                  min: 0, max: 100,
                  grid: { color: 'rgba(148,163,184,.15)' },
                  ticks: { callback: (v) => v + '%' }
                },
                x: { grid: { display: false } }
              }
            }
          });
        }

        if (diffCtx && data.difficulty_counts) {
          const counts = data.difficulty_counts;
          new Chart(diffCtx, {
            type: 'doughnut',
            data: {
              labels: ['Easy', 'Medium', 'Hard'],
              datasets: [{
                data: [counts.easy || 0, counts.medium || 0, counts.hard || 0],
                backgroundColor: ['#10B981', '#F59E0B', '#EF4444'],
                borderColor: cssVar('--surface') || '#fff',
                borderWidth: 3,
                hoverOffset: 6,
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              cutout: '68%',
              plugins: { legend: { display: false } }
            }
          });
        }
      })
      .catch((err) => {
        console.log('Could not load performance data:', err);
        renderEmptyPerformanceCharts(perfCtx, diffCtx, 'Could not load your performance data.');
      });
  }

  function renderEmptyPerformanceCharts(perfCtx, diffCtx, message) {
    [perfCtx, diffCtx].forEach((ctx) => {
      if (!ctx) return;
      const wrap = ctx.closest('.dash-chart-wrap') || ctx.parentElement;
      if (wrap) {
        wrap.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:30px 10px; margin:0;">${message}</p>`;
      }
    });
  }
})();
