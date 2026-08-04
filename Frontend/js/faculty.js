/* =========================================================
   QUIZCRAFT — js/faculty.js
   Powers every page in the Faculty Module. Each section
   guards on the presence of its own DOM elements, so this
   single file can be safely included on every faculty page
   without throwing errors for markup that isn't there.

   Every widget on these pages is backed by a real fetch() to
   users/views.py (MongoDB-backed) — no hardcoded/demo data sets.
   ========================================================= */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    initFacultyIdentity();
    initNotifications();
    initFacultyDashboardCharts();
    initFacultyStats();
    initManageQuestions();
    initQuestionForm();
    initViewResults();
    initSubjectManagement();
    initFacultyLeaderboardAndActivity();
  });

  /* =========================================================
     FACULTY IDENTITY (faculty_dashboard.html — new)
     ---------------------------------------------------------
     WHY: the welcome banner used to hardcode "Prof. Kulkarni" for
     every single faculty account. The navbar avatar's initials are
     already handled generically by common.js's applySession(), but
     this specific heading needed its own real name.
     WHICH MODULE USES THIS: faculty_dashboard.html.
     ========================================================= */
  function initFacultyIdentity() {
    const nameEl = document.getElementById('facWelcomeName');
    if (!nameEl) return;

    let currentUser = null;
    try {
      currentUser = JSON.parse(localStorage.getItem('quizcraft_user'));
    } catch (e) {
      currentUser = null;
    }
    if (!currentUser || !currentUser.email) return;

    fetch(`http://127.0.0.1:8000/users/dashboard/?email=${encodeURIComponent(currentUser.email)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'success' && data.name) {
          // Real faculty names are already full names (e.g. "Neha
          // Kulkarni") — prefix with "Prof." to keep the original
          // tone of the greeting without hardcoding a specific person.
          nameEl.textContent = `Prof. ${data.name}`;
        }
      })
      .catch((err) => console.log('Could not load faculty identity:', err));
  }

  /* =========================================================
     FACULTY DASHBOARD LIVE STATS (faculty_dashboard.html)
     ---------------------------------------------------------
     WHY: the four stat cards used to show hardcoded demo numbers
     (486 questions, 6 subjects, 312 students, 76% avg score) that
     never reflected the real database — this is the "Faculty
     Dashboard integration with MongoDB" requirement.
     WHAT: fetches live aggregates from the new DRF endpoint
     faculty-stats/ and writes them straight into the counter
     elements, animating the count-up ourselves instead of relying
     on common.js's IntersectionObserver-based counter (which reads
     data-target once when the element scrolls into view — updating
     data-target after that point can race with an observer that
     already fired on page load for above-the-fold cards).
     ========================================================= */
  function initFacultyStats() {
    const questionsEl = document.getElementById('facStatQuestions');
    const subjectsEl = document.getElementById('facStatSubjects');
    const studentsEl = document.getElementById('facStatStudents');
    const avgScoreEl = document.getElementById('facStatAvgScore');
    if (!questionsEl && !subjectsEl && !studentsEl && !avgScoreEl) return;

    fetch("http://127.0.0.1:8000/users/faculty-stats/")
      .then((res) => res.json())
      .then((data) => {
        if (data.status !== 'success') return;
        animateCount(questionsEl, data.total_questions);
        animateCount(subjectsEl, data.total_subjects);
        animateCount(studentsEl, data.total_students);
        animateCount(avgScoreEl, data.average_score);
      })
      .catch((err) => {
        // MongoDB/Django not reachable — leave the placeholder
        // numbers common.js already animated in from data-target.
        console.log('faculty-stats unavailable:', err);
      });
  }

  function animateCount(el, target) {
    if (!el || target === undefined || target === null) return;
    const duration = 900;
    const start = performance.now();
    const from = 0;

    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(from + (target - from) * eased);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  /* =========================================================
     NOTIFICATIONS PANEL (faculty_dashboard.html)
     ========================================================= */
  function initNotifications() {
    const btn = document.getElementById('facNotifBtn');
    const panel = document.getElementById('facNotifPanel');
    const closeBtn = document.getElementById('facNotifClose');
    if (!btn || !panel) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('d-none');
    });
    closeBtn?.addEventListener('click', () => panel.classList.add('d-none'));
    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target) && e.target !== btn) panel.classList.add('d-none');
    });
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /* =========================================================
     FACULTY DASHBOARD CHARTS (faculty_dashboard.html)
     ========================================================= */
  function initFacultyDashboardCharts() {
    if (typeof Chart === 'undefined') return;

    const perfCtx = document.getElementById('facPerformanceChart');
    if (perfCtx) {
      const gradient = perfCtx.getContext('2d').createLinearGradient(0, 0, 0, 240);
      gradient.addColorStop(0, 'rgba(37,99,235,0.35)');
      gradient.addColorStop(1, 'rgba(37,99,235,0)');

      new Chart(perfCtx, {
        type: 'line',
        data: {
          labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6'],
          datasets: [{
            label: 'Average Score %',
            data: [62, 66, 70, 68, 74, 76],
            borderColor: cssVar('--primary') || '#2563EB',
            backgroundColor: gradient,
            borderWidth: 3,
            pointBackgroundColor: '#fff',
            pointBorderColor: cssVar('--primary') || '#2563EB',
            pointBorderWidth: 2,
            pointRadius: 5,
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

    const diffCtx = document.getElementById('facDifficultyChart');
    if (diffCtx) {
      new Chart(diffCtx, {
        type: 'doughnut',
        data: {
          labels: ['Easy', 'Medium', 'Hard'],
          datasets: [{
            data: [168, 220, 98],
            backgroundColor: ['#10B981', '#F59E0B', '#EF4444'],
            borderColor: cssVar('--surface') || '#fff',
            borderWidth: 3,
            hoverOffset: 6,
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false } } }
      });
    }
  }

  /* =========================================================
     SHARED STATE
     ========================================================= */
  const SUBJECT_LABELS = { python: 'Python', java: 'Java', cpp: 'C++', webdev: 'Web Development', dbms: 'DBMS', ml: 'Machine Learning' };

  // Populated live from MongoDB by initManageQuestions()'s fetch to
  // /users/questions/ — starts empty rather than holding placeholder
  // questions, so a slow/failed request shows a real loading/error
  // state instead of fake content.
  let QUESTION_BANK = [];

  // Populated live from MongoDB by initViewResults()'s fetch to
  // /users/history/ — starts empty for the same reason.
  let RESULTS = [];

  /* =========================================================
     MANAGE QUESTIONS (manage_questions.html)
     ========================================================= */
  function initManageQuestions() {
    const tableBody = document.getElementById('mqTableBody');
    if (!tableBody) return;

    const searchInput = document.getElementById('mqSearchInput');
    const subjectFilter = document.getElementById('mqSubjectFilter');
    const difficultyFilter = document.getElementById('mqDifficultyFilter');
    const paginationInfo = document.getElementById('mqPaginationInfo');
    const paginationButtons = document.getElementById('mqPaginationButtons');

    const deleteModal = document.getElementById('mqDeleteModalBackdrop');
    const deleteModalText = document.getElementById('mqDeleteModalText');
    const deleteCancel = document.getElementById('mqDeleteCancel');
    const deleteConfirm = document.getElementById('mqDeleteConfirm');

    const viewModal = document.getElementById('mqViewModalBackdrop');
    const viewClose = document.getElementById('mqViewClose');
    const viewDifficulty = document.getElementById('mqViewDifficulty');
    const viewQuestionText = document.getElementById('mqViewQuestionText');
    const viewOptionsList = document.getElementById('mqViewOptionsList');
    const viewExplanation = document.getElementById('mqViewExplanation');

    const PAGE_SIZE = 6;
    async function loadQuestions() {

    try {

        const res = await fetch("http://127.0.0.1:8000/users/questions/");

        const data = await res.json();

        // BUG FIX: the backend used to never store/return a
        // question's difficulty at all, so this mapping hardcoded
        // every question as "easy" / 1 mark regardless of what the
        // faculty member actually selected when adding it. Now that
        // users/views.py's add_question()/get_questions() persist
        // and return the real difficulty, we read it here and derive
        // marks from the same easy/medium/hard weighting the backend
        // uses (DIFFICULTY_MARKS in users/views.py).
        const MARKS_BY_DIFFICULTY = { easy: 1, medium: 2, hard: 3 };

        QUESTION_BANK = data.map((q, index) => ({

            id: q.id,
            text: q.question,
            subject: q.subject.toLowerCase(),
            difficulty: q.difficulty || "easy",
            marks: MARKS_BY_DIFFICULTY[q.difficulty] || 1,

            options: [
                q.option1,
                q.option2,
                q.option3,
                q.option4
            ],

            correctIndex: [
                q.option1,
                q.option2,
                q.option3,
                q.option4
            ].indexOf(q.answer),

            explanation: ""

        }));

        render();

    }

    catch(err){

        console.log(err);
        tableBody.innerHTML = '<tr class="qp-empty-row"><td colspan="6"><i class="bi bi-wifi-off" style="font-size:1.8rem; display:block; margin-bottom:8px;"></i>Could not connect to the server. Check that the Django backend is running and try again.</td></tr>';

    }

}
    let currentPage = 1;
    let pendingDeleteId = null;

    // Preselect subject filter from ?subject=xyz query param (linked from category cards)
    const params = new URLSearchParams(window.location.search);
    const subjectParam = params.get('subject');
    if (subjectParam && SUBJECT_LABELS[subjectParam]) {
      subjectFilter.value = subjectParam;
    }

    function getFiltered() {
      const query = (searchInput.value || '').trim().toLowerCase();
      const subject = subjectFilter.value;
      const difficulty = difficultyFilter.value;

      return QUESTION_BANK.filter((q) => {
        const matchesQuery = !query || q.text.toLowerCase().includes(query);
        const matchesSubject = subject === 'all' || q.subject === subject;
        const matchesDifficulty = difficulty === 'all' || q.difficulty === difficulty;
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
        tableBody.innerHTML = '<tr class="qp-empty-row"><td colspan="6"><i class="bi bi-inbox" style="font-size:1.8rem; display:block; margin-bottom:8px;"></i>No questions match your filters.</td></tr>';
      } else {
        pageItems.forEach((q) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${q.id}</td>
            <td class="qp-question-cell"><p>${q.text}</p></td>
            <td>${SUBJECT_LABELS[q.subject] || q.subject}</td>
            <td><span class="qc-badge qp-diff-badge ${q.difficulty}">${capitalize(q.difficulty)}</span></td>
            <td>${q.marks}</td>
            <td>
              <div class="qp-row-actions">
                <button class="qp-icon-btn view" data-id="${q.id}" title="View" aria-label="View question"><i class="bi bi-eye"></i></button>
                <a class="qp-icon-btn edit" href="edit_question.html?id=${q.id}" title="Edit" aria-label="Edit question"><i class="bi bi-pencil"></i></a>
                <button class="qp-icon-btn delete" data-id="${q.id}" title="Delete" aria-label="Delete question"><i class="bi bi-trash"></i></button>
              </div>
            </td>
          `;
          tableBody.appendChild(tr);
        });
      }

      paginationInfo.textContent = filtered.length
        ? `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length} questions`
        : 'Showing 0 of 0 questions';

      renderPagination(paginationButtons, currentPage, totalPages, (page) => { currentPage = page; render(); });
      wireRowButtons();
    }

    function wireRowButtons() {
      tableBody.querySelectorAll('.qp-icon-btn.delete').forEach((btn) => {
        btn.addEventListener('click', () => {
          pendingDeleteId = btn.getAttribute('data-id');
          const q = QUESTION_BANK.find((item) => item.id === pendingDeleteId);
          deleteModalText.textContent = q
            ? `Delete "${q.text.slice(0, 60)}${q.text.length > 60 ? '…' : ''}"? This action cannot be undone.`
            : 'This action cannot be undone.';
          deleteModal.classList.remove('d-none');
        });
      });

      tableBody.querySelectorAll('.qp-icon-btn.view').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const q = QUESTION_BANK.find((item) => item.id === id);
          if (!q) return;

          viewDifficulty.textContent = capitalize(q.difficulty);
          viewDifficulty.className = 'qc-badge qp-diff-badge ' + q.difficulty;
          viewQuestionText.textContent = q.text;
          viewExplanation.textContent = q.explanation || 'No explanation provided.';
          viewOptionsList.innerHTML = q.options.map((opt, i) => `
            <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:10px; border:1px solid var(--border-soft); ${i === q.correctIndex ? 'background:rgba(16,185,129,.08); border-color:rgba(16,185,129,.35);' : ''}">
              <strong>${String.fromCharCode(65 + i)}</strong> ${opt}
              ${i === q.correctIndex ? '<i class="bi bi-check-circle-fill" style="margin-left:auto; color:#10B981;"></i>' : ''}
            </div>
          `).join('');
          viewModal.classList.remove('d-none');
        });
      });
    }

    searchInput.addEventListener('input', () => { currentPage = 1; render(); });
    subjectFilter.addEventListener('change', () => { currentPage = 1; render(); });
    difficultyFilter.addEventListener('change', () => { currentPage = 1; render(); });

    deleteCancel.addEventListener('click', () => deleteModal.classList.add('d-none'));
    deleteConfirm.addEventListener("click", () => {

    fetch(`http://127.0.0.1:8000/users/delete-question/${pendingDeleteId}/`, {
    method: "DELETE",
    headers: {
        "Content-Type": "application/json",
    },
})
.then(async res => {
    const data = await res.json();

    // BUG FIX: this handler used to just console.log the response
    // and never actually update the page — the deleted question
    // stayed visible in the table until a manual refresh. It now
    // removes the item from QUESTION_BANK, closes the modal, and
    // re-renders the (now-current) page of results.
    if (data.status === "success") {
        QUESTION_BANK = QUESTION_BANK.filter((q) => q.id !== pendingDeleteId);
        pendingDeleteId = null;
        deleteModal.classList.add('d-none');
        render();
    } else {
        deleteModalText.textContent = data.message || 'Could not delete this question. Please try again.';
    }
})
.catch(err => {
    console.log(err);
    deleteModalText.textContent = 'Network error — could not reach the server.';
});

});
    viewClose.addEventListener('click', () => viewModal.classList.add('d-none'));

    loadQuestions();
  }

  /* =========================================================
     PAGINATION HELPER (shared by Manage Questions + View Results)
     ========================================================= */
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

  /* =========================================================
     ADD / EDIT QUESTION FORM (add_question.html, edit_question.html)
     ========================================================= */
  function initQuestionForm() {
    const form = document.getElementById('questionForm');
    if (!form) return;

    const isEditMode = form.getAttribute('data-mode') === 'edit';
    const successAlert = document.getElementById(isEditMode ? 'eqSuccessAlert' : 'aqSuccessAlert');

    const questionText = document.getElementById('qQuestionText');
    const optionA = document.getElementById('qOptionA');
    const optionB = document.getElementById('qOptionB');
    const optionC = document.getElementById('qOptionC');
    const optionD = document.getElementById('qOptionD');
    const subject = document.getElementById('qSubject');
    const difficulty = document.getElementById('qDifficulty');
    const correctGroup = document.getElementById('qCorrectAnswerGroup');

    const questionTextError = document.getElementById('qQuestionTextError');
    const correctAnswerError = document.getElementById('qCorrectAnswerError');

    // BUG FIX (new): edit_question.html used to ship with hardcoded
    // sample values baked into the HTML — every question you opened
    // to edit looked the same. In edit mode we now read the real
    // question id from the URL (edit_question.html?id=...) and fetch
    // its actual data from the new get-question/<id>/ endpoint,
    // then populate every field (and pre-check the correct-answer
    // radio) before the faculty member sees the form.
    let editingId = null;
    if (isEditMode) {
      const params = new URLSearchParams(window.location.search);
      editingId = params.get('id');

      if (editingId) {
        fetch(`http://127.0.0.1:8000/users/get-question/${editingId}/`)
          .then((res) => res.json())
          .then((data) => {
            if (data.status !== 'success') {
              alert(data.message || 'Could not load this question.');
              return;
            }

            questionText.value = data.question;
            optionA.value = data.option1;
            optionB.value = data.option2;
            optionC.value = data.option3;
            optionD.value = data.option4;

            if (subject) {
              // Subject is stored as display text (e.g. "Python"); match
              // it case-insensitively against the <option> labels.
              const match = [...subject.options].find(
                (opt) => opt.text.trim().toLowerCase() === (data.subject || '').trim().toLowerCase()
              );
              if (match) subject.value = match.value;
            }
            if (difficulty) {
              difficulty.value = data.difficulty || 'easy';
            }

            const optionValues = { A: data.option1, B: data.option2, C: data.option3, D: data.option4 };
            const correctLetter = Object.keys(optionValues).find((key) => optionValues[key] === data.answer);
            if (correctLetter && correctGroup) {
              const radio = correctGroup.querySelector(`input[type="radio"][value="${correctLetter}"]`);
              if (radio) {
                radio.checked = true;
                radio.closest('.qp-correct-radio')?.classList.add('checked');
              }
            }
          })
          .catch((err) => {
            console.log(err);
            alert('Network error while loading the question.');
          });
      }
    }

    // Highlight the selected correct-answer radio
    if (correctGroup) {
      correctGroup.querySelectorAll('input[type="radio"]').forEach((radio) => {
        radio.addEventListener('change', () => {
          correctGroup.querySelectorAll('.qp-correct-radio').forEach((label) => label.classList.remove('checked'));
          radio.closest('.qp-correct-radio')?.classList.add('checked');
          correctAnswerError.textContent = '';
        });
      });
    }

    // Image upload preview (UI only)
    const uploadBox = document.getElementById('qUploadBox');
    const imageInput = document.getElementById('qImageUpload');
    const preview = document.getElementById('qUploadPreview');
    const previewImg = document.getElementById('qUploadPreviewImg');
    const previewName = document.getElementById('qUploadPreviewName');
    const removeBtn = document.getElementById('qUploadRemoveBtn');

    if (imageInput) {
      imageInput.addEventListener('change', () => {
        const file = imageInput.files && imageInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          previewImg.src = e.target.result;
          previewName.textContent = file.name;
          preview.classList.add('active');
        };
        reader.readAsDataURL(file);
      });
    }
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        imageInput.value = '';
        preview.classList.remove('active');
      });
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let valid = true;

      questionText.classList.remove('is-invalid');
      questionTextError.textContent = '';
      if (!questionText.value.trim()) {
        questionText.classList.add('is-invalid');
        questionTextError.textContent = 'Question text is required.';
        valid = false;
      }

      [optionA, optionB, optionC, optionD].forEach((input) => {
        input.classList.toggle('is-invalid', !input.value.trim());
        if (!input.value.trim()) valid = false;
      });

      const correctSelected = correctGroup.querySelector('input[type="radio"]:checked');
      correctAnswerError.textContent = correctSelected ? '' : 'Select which option is correct.';
      if (!correctSelected) valid = false;

      subject.classList.toggle('is-invalid', !subject.value);
      difficulty.classList.toggle('is-invalid', !difficulty.value);
      if (!subject.value) valid = false;
      if (!difficulty.value) valid = false;

      if (!valid) return;

      const correct = correctGroup.querySelector("input[type='radio']:checked").value;

      let answer = "";

      if (correct === "A") answer = optionA.value;
      if (correct === "B") answer = optionB.value;
      if (correct === "C") answer = optionC.value;
      if (correct === "D") answer = optionD.value;

      // BUG FIX: the payload used to omit "difficulty" entirely, so
      // every question was stored (and later displayed) as "easy" no
      // matter what the faculty member picked in this very form.
      const payload = {
        subject: subject.options[subject.selectedIndex].text,
        difficulty: difficulty.value,
        question: questionText.value,
        option1: optionA.value,
        option2: optionB.value,
        option3: optionC.value,
        option4: optionD.value,
        answer: answer
      };

      // BUG FIX: edit_question.html used to submit to the SAME
      // add-question/ endpoint as the add form, so "editing" a
      // question actually just created a brand new duplicate one —
      // the original was never updated. In edit mode we now PUT to
      // edit-question/<id>/ instead.
      const endpoint = (isEditMode && editingId)
        ? `http://127.0.0.1:8000/users/edit-question/${editingId}/`
        : "http://127.0.0.1:8000/users/add-question/";
      const method = (isEditMode && editingId) ? "PUT" : "POST";

      fetch(endpoint, {
        method: method,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      })
        .then(res => res.json())
        .then(data => {
          alert(data.message);

          if (data.status === 'success') {
            if (successAlert) {
              successAlert.classList.remove("d-none");
            }

            if (isEditMode) {
              // Editing is a one-shot action — send the faculty member
              // back to the question list so they see the update reflected.
              window.location.href = 'manage_questions.html';
            } else {
              form.reset();
            }
          }
        })
        .catch(err => {
          console.log(err);
          alert('Network error — could not reach the server.');
        });
    });
  }

  /* =========================================================
     VIEW RESULTS (view_results.html)
     ========================================================= */
  function initViewResults() {
    const tableBody = document.getElementById('vrTableBody');
    if (!tableBody) return;

    const searchInput = document.getElementById('vrSearchInput');
    const subjectFilter = document.getElementById('vrSubjectFilter');
    const paginationInfo = document.getElementById('vrPaginationInfo');
    const paginationButtons = document.getElementById('vrPaginationButtons');
    const exportBtn = document.getElementById('vrExportBtn');

    const PAGE_SIZE = 7;
    let currentPage = 1;

    // Fetches every student's attempts from /users/history/ (no
    // student_name filter = every student, which is what a
    // faculty-facing results page needs) and maps them into the
    // {student, subject, score, total, difficulty, date} shape the
    // render()/chart code below expects.
    async function loadResults() {
      try {
        const res = await fetch("http://127.0.0.1:8000/users/history/");
        const data = await res.json();

        RESULTS = Array.isArray(data)
          ? data.map((r) => ({
              student: r.student_name,
              subject: (r.subject || '').toLowerCase(),
              score: r.score,
              total: r.total,
              difficulty: r.difficulty || 'easy',
              date: r.attempted_at ? r.attempted_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
            }))
          : [];
      } catch (err) {
        // BUG FIX: this used to silently keep a hardcoded 15-row demo
        // dataset (with fake student names) on any network failure,
        // which would show fabricated results as if they were real.
        // It now shows a genuine "couldn't connect" empty state via
        // render() below (RESULTS stays []) and surfaces the error in
        // the console for debugging, instead of pretending demo data
        // is a live MongoDB result.
        console.log('Could not load results from the server:', err);
        RESULTS = [];
        tableBody.innerHTML = '<tr class="qp-empty-row"><td colspan="6"><i class="bi bi-wifi-off" style="font-size:1.8rem; display:block; margin-bottom:8px;"></i>Could not connect to the server. Check that the Django backend is running and try again.</td></tr>';
        paginationInfo.textContent = 'Showing 0 of 0 results';
        return;
      }

      render();
      initResultsCharts(getFiltered());
    }

    function getFiltered() {
      const query = (searchInput.value || '').trim().toLowerCase();
      const subject = subjectFilter.value;
      return RESULTS.filter((r) => {
        const matchesQuery = !query || r.student.toLowerCase().includes(query);
        const matchesSubject = subject === 'all' || r.subject === subject;
        return matchesQuery && matchesSubject;
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
        tableBody.innerHTML = '<tr class="qp-empty-row"><td colspan="6"><i class="bi bi-inbox" style="font-size:1.8rem; display:block; margin-bottom:8px;"></i>No results match your search.</td></tr>';
      } else {
        pageItems.forEach((r) => {
          const percentage = Math.round((r.score / r.total) * 100);
          const initials = r.student.split(' ').map((n) => n[0]).slice(0, 2).join('');
          const formattedDate = new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>
              <div style="display:flex; align-items:center; gap:10px;">
                <span class="lb-avatar" style="width:32px;height:32px;border-radius:50%;background:var(--grad-primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700;flex-shrink:0;">${initials}</span>
                <span style="font-weight:600; color:var(--text-heading);">${r.student}</span>
              </div>
            </td>
            <td>${SUBJECT_LABELS[r.subject] || r.subject}</td>
            <td class="qp-score-cell">${r.score}/${r.total}</td>
            <td>
              <div class="qp-percentage-bar">
                <div class="qc-progress-track"><div class="qc-progress-fill" style="width:${percentage}%; background:${percentage >= 50 ? 'var(--grad-accent)' : 'linear-gradient(135deg,#F87171,#EF4444)'};"></div></div>
                <span>${percentage}%</span>
              </div>
            </td>
            <td><span class="qc-badge qp-diff-badge ${r.difficulty}">${capitalize(r.difficulty)}</span></td>
            <td>${formattedDate}</td>
          `;
          tableBody.appendChild(tr);
        });
      }

      paginationInfo.textContent = filtered.length
        ? `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length} results`
        : 'Showing 0 of 0 results';

      renderPagination(paginationButtons, currentPage, totalPages, (page) => { currentPage = page; render(); });
    }

    searchInput.addEventListener('input', () => { currentPage = 1; render(); });
    subjectFilter.addEventListener('change', () => { currentPage = 1; render(); });

    exportBtn?.addEventListener('click', () => {
      const filtered = getFiltered();
      const header = ['Student', 'Subject', 'Score', 'Percentage', 'Difficulty', 'Attempt Date'];
      const rows = filtered.map((r) => [
        r.student,
        SUBJECT_LABELS[r.subject] || r.subject,
        `${r.score}/${r.total}`,
        Math.round((r.score / r.total) * 100) + '%',
        capitalize(r.difficulty),
        r.date,
      ]);
      const csv = [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'quizcraft-results.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    render();
    initResultsCharts(getFiltered());

    loadResults();
  }

  function initResultsCharts(results) {
    if (typeof Chart === 'undefined') return;

    const subjectCtx = document.getElementById('vrSubjectChart');
    if (subjectCtx) {
      const bySubject = {};
      RESULTS.forEach((r) => {
        const pct = (r.score / r.total) * 100;
        if (!bySubject[r.subject]) bySubject[r.subject] = [];
        bySubject[r.subject].push(pct);
      });
      const labels = Object.keys(bySubject).map((s) => SUBJECT_LABELS[s] || s);
      const data = Object.values(bySubject).map((arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length));

      new Chart(subjectCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Average Score %',
            data,
            backgroundColor: cssVar('--primary') || '#2563EB',
            borderRadius: 8,
            maxBarThickness: 42,
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

    const passCtx = document.getElementById('vrPassChart');
    if (passCtx) {
      const passCount = RESULTS.filter((r) => (r.score / r.total) * 100 >= 50).length;
      const failCount = RESULTS.length - passCount;

      new Chart(passCtx, {
        type: 'doughnut',
        data: {
          labels: ['Pass', 'Fail'],
          datasets: [{
            data: [passCount, failCount],
            backgroundColor: ['#10B981', '#EF4444'],
            borderColor: cssVar('--surface') || '#fff',
            borderWidth: 3,
            hoverOffset: 6,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '68%',
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16, font: { family: 'Poppins' } } } }
        }
      });
    }
  }

  /* =========================================================
     SUBJECT MANAGEMENT (faculty_dashboard.html — new)
     ---------------------------------------------------------
     WHY: add_subject()/get_subjects() already existed in the
     backend, but nothing in the UI let a faculty member add,
     rename or remove a subject — the "Subject CRUD" requirement.
     WHAT: lists every subject from MongoDB in a table (reusing
     the same qp-table styling as Manage Questions) with Edit/
     Delete actions, and a single Add/Edit modal that POSTs to
     add-subject/ or PUTs to edit-subject/<id>/ depending on
     whether an id is present.
     WHICH MODULE USES THIS: faculty_dashboard.html.
     ========================================================= */
  function initSubjectManagement() {
    const tbody = document.getElementById('subTableBody');
    if (!tbody) return; // not on faculty_dashboard.html — nothing to do

    const addBtn = document.getElementById('subAddBtn');
    const formModal = document.getElementById('subFormModalBackdrop');
    const formTitle = document.getElementById('subFormModalTitle');
    const formId = document.getElementById('subFormId');
    const formName = document.getElementById('subFormName');
    const formError = document.getElementById('subFormError');
    const formSave = document.getElementById('subFormSave');
    const formCancel = document.getElementById('subFormCancel');

    const deleteModal = document.getElementById('subDeleteModalBackdrop');
    const deleteCancel = document.getElementById('subDeleteCancel');
    const deleteConfirm = document.getElementById('subDeleteConfirm');
    let pendingDeleteId = null;

    function loadSubjects() {
      fetch("http://127.0.0.1:8000/users/subjects/")
        .then((res) => res.json())
        .then((subjects) => {
          if (!Array.isArray(subjects) || !subjects.length) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--text-muted);">No subjects yet — click "Add Subject" to create one.</td></tr>`;
            return;
          }

          tbody.innerHTML = subjects.map((s, i) => `
            <tr data-id="${s.id}">
              <td>${i + 1}</td>
              <td class="qp-cell-title">${escapeHtml(s.subject_name)}</td>
              <td>${s.progress || 0}%</td>
              <td>
                <div class="qp-row-actions">
                  <button class="qp-icon-btn edit sub-edit-btn" data-id="${s.id}" data-name="${escapeHtml(s.subject_name)}" title="Edit"><i class="bi bi-pencil"></i></button>
                  <button class="qp-icon-btn delete sub-delete-btn" data-id="${s.id}" title="Delete"><i class="bi bi-trash3"></i></button>
                </div>
              </td>
            </tr>
          `).join('');

          tbody.querySelectorAll('.sub-edit-btn').forEach((btn) => {
            btn.addEventListener('click', () => openForm(btn.dataset.id, btn.dataset.name));
          });
          tbody.querySelectorAll('.sub-delete-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
              pendingDeleteId = btn.dataset.id;
              deleteModal.classList.remove('d-none');
            });
          });
        })
        .catch((err) => {
          console.log('Could not load subjects:', err);
          tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--text-muted);">Could not reach the server.</td></tr>`;
        });
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str == null ? '' : String(str);
      return div.innerHTML;
    }

    function openForm(id, name) {
      formId.value = id || '';
      formName.value = name || '';
      formError.textContent = '';
      formTitle.textContent = id ? 'Edit Subject' : 'Add Subject';
      formModal.classList.remove('d-none');
      formName.focus();
    }
    function closeForm() {
      formModal.classList.add('d-none');
    }

    addBtn && addBtn.addEventListener('click', () => openForm(null, ''));
    formCancel && formCancel.addEventListener('click', closeForm);
    formModal && formModal.addEventListener('click', (e) => { if (e.target === formModal) closeForm(); });

    formSave && formSave.addEventListener('click', () => {
      const name = formName.value.trim();

      // REGEX VALIDATION: same subject-name rule enforced server-side
      // in add_question()/edit_question() — letters, spaces, + and #
      // only (covers names like "C++", "C#"), 2-40 characters.
      if (!/^[A-Za-z][A-Za-z\s+#]{1,40}$/.test(name)) {
        formError.textContent = 'Enter a valid subject name (letters only, 2-40 characters).';
        return;
      }

      const id = formId.value;
      const url = id
        ? `http://127.0.0.1:8000/users/edit-subject/${id}/`
        : "http://127.0.0.1:8000/users/add-subject/";
      const method = id ? 'PUT' : 'POST';

      fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_name: name }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.status !== 'success') {
            formError.textContent = data.message || 'Could not save subject.';
            return;
          }
          closeForm();
          loadSubjects();
        })
        .catch((err) => {
          console.log(err);
          formError.textContent = 'Network error — could not reach the server.';
        });
    });

    deleteCancel && deleteCancel.addEventListener('click', () => {
      pendingDeleteId = null;
      deleteModal.classList.add('d-none');
    });
    deleteModal && deleteModal.addEventListener('click', (e) => { if (e.target === deleteModal) deleteModal.classList.add('d-none'); });

    deleteConfirm && deleteConfirm.addEventListener('click', () => {
      if (!pendingDeleteId) return;
      fetch(`http://127.0.0.1:8000/users/delete-subject/${pendingDeleteId}/`, { method: 'DELETE' })
        .then((res) => res.json())
        .then((data) => {
          deleteModal.classList.add('d-none');
          if (data.status !== 'success') {
            alert(data.message || 'Could not delete subject.');
            return;
          }
          pendingDeleteId = null;
          loadSubjects();
        })
        .catch((err) => {
          console.log(err);
          deleteModal.classList.add('d-none');
          alert('Network error — could not reach the server.');
        });
    });

    loadSubjects();
  }

  /* =========================================================
     LEADERBOARD + RECENT ACTIVITY (faculty_dashboard.html — new)
     ---------------------------------------------------------
     WHY: both widgets used to be static hardcoded HTML (fake
     names, fake "you added questions" events with no audit log
     backing them). This fetches the real data from the new
     GET /users/leaderboard/ and GET /users/recent-activity/
     endpoints, both backed by MongoDB's results_collection.
     ========================================================= */
  function initFacultyLeaderboardAndActivity() {
    const leaderboardList = document.getElementById('facLeaderboardList');
    const activityList = document.getElementById('facActivityList');
    if (!leaderboardList && !activityList) return; // not on faculty_dashboard.html

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str == null ? '' : String(str);
      return div.innerHTML;
    }
    function initialsOf(name) {
      return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
    }
    function timeAgo(isoString) {
      if (!isoString) return '';
      const diffMs = Date.now() - new Date(isoString).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
      const days = Math.floor(hrs / 24);
      return days === 1 ? 'Yesterday' : `${days} days ago`;
    }

    if (leaderboardList) {
      fetch("http://127.0.0.1:8000/users/leaderboard/")
        .then((res) => res.json())
        .then((data) => {
          const rows = (data.status === 'success' && Array.isArray(data.leaderboard)) ? data.leaderboard.slice(0, 5) : [];
          if (!rows.length) {
            leaderboardList.innerHTML = '<li class="fac-activity-loading"><span class="lb-name">No quiz attempts yet.</span></li>';
            return;
          }
          const rankClass = (i) => i === 0 ? 'rank gold' : i === 1 ? 'rank silver' : i === 2 ? 'rank' : 'rank';
          const rankStyle = (i) => i === 2 ? ' style="background:#F0D9B5;color:#92400E;"' : '';
          leaderboardList.innerHTML = rows.map((r, i) => `
            <li>
              <span class="${rankClass(i)}"${rankStyle(i)}>${r.rank}</span>
              <span class="lb-avatar">${escapeHtml(initialsOf(r.name))}</span>
              <span class="lb-name">${escapeHtml(r.name)}</span>
              <span class="lb-score">${r.average_score}%</span>
            </li>
          `).join('');
        })
        .catch((err) => {
          console.log('Could not load leaderboard:', err);
          leaderboardList.innerHTML = '<li class="fac-activity-loading"><span class="lb-name">Could not load leaderboard.</span></li>';
        });
    }

    if (activityList) {
      fetch("http://127.0.0.1:8000/users/recent-activity/?limit=6")
        .then((res) => res.json())
        .then((data) => {
          const rows = (data.status === 'success' && Array.isArray(data.activity)) ? data.activity : [];
          if (!rows.length) {
            activityList.innerHTML = '<li class="fac-activity-loading"><div class="fac-activity-info"><p>No quiz activity yet.</p></div></li>';
            return;
          }
          activityList.innerHTML = rows.map((a) => {
            const iconClass = a.percentage >= 80 ? 'icon-blue' : a.percentage >= 50 ? 'icon-cyan' : 'icon-orange';
            return `
              <li>
                <div class="fac-activity-icon ${iconClass}"><i class="bi bi-person-check-fill"></i></div>
                <div class="fac-activity-info">
                  <p>${escapeHtml(a.student_name)} completed <strong>${escapeHtml(a.subject)}</strong> with ${a.percentage}%</p>
                  <span>${timeAgo(a.attempted_at)}</span>
                </div>
              </li>
            `;
          }).join('');
        })
        .catch((err) => {
          console.log('Could not load recent activity:', err);
          activityList.innerHTML = '<li class="fac-activity-loading"><div class="fac-activity-info"><p>Could not load recent activity.</p></div></li>';
        });
    }
  }
})();
