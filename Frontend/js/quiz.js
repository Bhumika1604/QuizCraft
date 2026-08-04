/* =========================================================
   QUIZCRAFT — js/quiz.js
   Drives the quiz-taking experience: question rendering,
   MCQ selection, prev/next navigation, question palette,
   flag-for-review, countdown timer with auto-submit, and
   a confirmation modal before scoring.

   ADAPTIVE ENGINE (new): quiz.html used to fetch a single
   pre-selected, weighted-random BATCH of questions from the
   backend before the student answered anything at all — that
   isn't genuinely adaptive, since the "adaptivity" was decided
   once, up front, with no knowledge of real performance.

   This version fetches the SUBJECT'S FULL question pool once
   (via generate-quiz/, which now returns every question for the
   subject instead of a pre-picked batch), then walks forward
   ONE QUESTION AT A TIME, choosing each next question's
   difficulty based on whether the previous one was answered
   correctly — exactly like adaptive_engine.py's AdaptiveEngine
   class does for the console demo (random pick from the current
   difficulty pool, step up on correct / down on wrong, never
   repeat a question). Existing review navigation (Previous /
   palette / flag-for-review) still works normally for any
   question already generated — only moving into UNSEEN territory
   for the first time triggers a new adaptive pick.

   Questions are fetched live from the Adaptive Quiz Generator
   (users/views.py's generate_adaptive_quiz, backed by MongoDB).
   There is no bundled placeholder quiz: if the subject has no
   questions yet, or the backend can't be reached, the page shows
   a clear, honest message instead of silently substituting
   unrelated demo content.
   ========================================================= */
(function () {
  'use strict';

  // Every quiz attempt is exactly 15 questions.
  const QUESTIONS_PER_QUIZ = 15;

  // Marks per difficulty mirrors the backend's DIFFICULTY_MARKS dict
  // (difficulty-based scoring requirement).
  const DIFFICULTY_MARKS = { easy: 1, medium: 2, hard: 3 };
  const DIFFICULTY_LADDER = ['easy', 'medium', 'hard'];

  // Subject -> icon/badge mapping so the quiz topbar shows the right
  // icon for whatever subject was actually selected, matching the
  // set already used elsewhere in the app (js/faculty.js, js/history.js).
  const SUBJECT_ICONS = {
    python: 'bi-filetype-py',
    java: 'bi-cup-hot-fill',
    'c++': 'bi-braces-asterisk',
    cpp: 'bi-braces-asterisk',
    dbms: 'bi-database-fill',
    'web development': 'bi-globe2',
    webdev: 'bi-globe2',
    'machine learning': 'bi-diagram-3-fill',
    ml: 'bi-diagram-3-fill',
  };

  /* =========================================================
     ADAPTIVE QUIZ ENGINE (client-side)
     -----------------------------------------------------------
     WHY: mirrors adaptive_engine.py's AdaptiveEngine class so the
     same adaptive concept — random pick from the current
     difficulty's pool, step up a rung on a correct answer / down
     a rung on a wrong one, never repeat a question — runs for the
     live web quiz, not just the console demo.
     ========================================================= */
  class AdaptiveQuizEngine {
    constructor(pool, startingDifficulty) {
      // Group the full subject pool by difficulty for fast random
      // picks within a level.
      this.pools = { easy: [], medium: [], hard: [] };
      pool.forEach((q) => {
        const level = DIFFICULTY_LADDER.includes(q.difficulty) ? q.difficulty : 'easy';
        this.pools[level].push(q);
      });

      this.currentDifficulty = DIFFICULTY_LADDER.includes(startingDifficulty) ? startingDifficulty : 'easy';
      this.askedIds = new Set(); // RANDOM QUESTION SELECTION + no-duplicates guarantee
    }

    // Returns a question object from `level`'s pool that hasn't been
    // asked yet this attempt, or null if that level is exhausted.
    _pickUnused(level) {
      const candidates = this.pools[level].filter((q) => !this.askedIds.has(q.id));
      if (!candidates.length) return null;
      const choice = candidates[Math.floor(Math.random() * candidates.length)];
      return choice;
    }

    // RANDOM QUESTION SELECTION: picks the next question from the
    // current difficulty pool. EXCEPTION HANDLING: if that level has
    // run out of unused questions, falls back to a neighbouring
    // level rather than failing the quiz outright — mirrors
    // AdaptiveEngine.get_next_question()'s fallback behaviour.
    getNextQuestion() {
      let q = this._pickUnused(this.currentDifficulty);

      if (!q) {
        for (const level of DIFFICULTY_LADDER) {
          q = this._pickUnused(level);
          if (q) break;
        }
      }

      if (!q) return null; // subject's entire pool has been exhausted

      this.askedIds.add(q.id);
      return q;
    }

    // ADAPTIVE STEP: moves one rung up the ladder after a correct
    // answer, one rung down after a wrong one, clamped at both ends
    // — identical rule to AdaptiveEngine.next_difficulty() in
    // adaptive_engine.py.
    stepDifficulty(wasCorrect) {
      const index = DIFFICULTY_LADDER.indexOf(this.currentDifficulty);
      if (wasCorrect && index < DIFFICULTY_LADDER.length - 1) {
        this.currentDifficulty = DIFFICULTY_LADDER[index + 1];
      } else if (!wasCorrect && index > 0) {
        this.currentDifficulty = DIFFICULTY_LADDER[index - 1];
      }
      return this.currentDifficulty;
    }
  }

  let engine = null;         // AdaptiveQuizEngine instance, built once the pool loads
  let quizSubjectLabel = ''; // real subject text from the backend, shown in the topbar

  const state = {
    current: 0,
    questions: [],   // grows lazily as the student moves forward — see generateQuestionAt()
    answers: [],
    flagged: [],
    maxReached: -1,  // highest index actually generated so far
    remainingSeconds: 15 * 60,
    timerHandle: null,
    startedAt: null,
    blocked: false,
    blockedReason: '',
    blockedMessage: '',
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    await loadQuizPool();

    cacheEls();

    // EMPTY QUESTION BANK EXCEPTION HANDLING + honest network-error
    // handling: either way, show a clear message and a way back to
    // Subjects instead of proceeding with a broken/empty quiz UI —
    // never substitute unrelated placeholder questions.
    if (state.blocked || !engine) {
      renderBlockedState();
      return;
    }

    document.getElementById('quizTotalNum').textContent = QUESTIONS_PER_QUIZ;
    updateSubjectBadge();

    state.answers = new Array(QUESTIONS_PER_QUIZ).fill(null);
    state.flagged = new Array(QUESTIONS_PER_QUIZ).fill(false);
    state.questions = new Array(QUESTIONS_PER_QUIZ).fill(null);
    state.startedAt = new Date(); // DATETIME-BASED QUIZ TIMER starts here

    // Generate question 1 at the chosen starting difficulty so
    // there's something to render immediately.
    if (!generateQuestionAt(0)) {
      renderBlockedState('empty-bank', 'This subject does not have enough questions for a full quiz yet.');
      return;
    }

    buildPalette();
    renderQuestion();
    startTimer();
    wireEvents();
  }

  /* =========================================================
     ADAPTIVE QUIZ GENERATOR — fetches the FULL question pool for
     the chosen subject from the Django/MongoDB backend once, then
     the AdaptiveQuizEngine above picks questions from it one at a
     time as the student progresses. Subject/difficulty are read
     from the page URL (e.g. quiz.html?subject=python&difficulty=
     medium) so other pages can deep-link into a specific subject;
     sensible defaults are used when no query string is present so
     the page still works from the plain "Take a Quiz" nav link.
     ========================================================= */
  async function loadQuizPool() {
    const params = new URLSearchParams(window.location.search);
    const subject = params.get('subject') || 'python';
    const difficulty = params.get('difficulty') || 'easy';

    try {
      const res = await fetch(
        `http://127.0.0.1:8000/users/generate-quiz/?subject=${encodeURIComponent(subject)}&difficulty=${encodeURIComponent(difficulty)}`
      );
      const data = await res.json();

      if (data.status === 'success' && Array.isArray(data.pool) && data.pool.length) {
        // Use the REAL subject label the backend echoes back (read
        // from the matched questions' own `subject` field) instead
        // of guessing one by capitalizing the URL slug — "webdev"
        // used to render as "Webdev" instead of "Web Development",
        // and the quiz topbar used to just always say "Python" no
        // matter what was actually selected.
        quizSubjectLabel = data.subject || (subject.charAt(0).toUpperCase() + subject.slice(1));
        engine = new AdaptiveQuizEngine(data.pool, data.starting_difficulty || difficulty);
        return;
      }

      // Backend reached and answered — either "no questions for this
      // subject yet" (404) or some other clean error response.
      state.blocked = true;
      state.blockedReason = 'empty-bank';
      state.blockedMessage = data.message || `No questions are available for "${subject}" yet.`;
    } catch (err) {
      // BUG FIX: this used to silently substitute a bundled Python
      // demo quiz on ANY failure — including a genuine network/
      // backend-down error — so a broken connection looked like a
      // working (but wrong) quiz. It now shows an honest "couldn't
      // connect" message instead of fabricated quiz content.
      console.log('Could not load the adaptive quiz:', err);
      state.blocked = true;
      state.blockedReason = 'network-error';
      state.blockedMessage = 'Could not connect to the server. Please check your connection and try again.';
    }
  }

  /* Sets the topbar badge (icon + text) to the REAL subject that was
     loaded — this used to be hardcoded HTML that always said
     "Python · Loops & Iteration" no matter what subject the student
     actually picked. */
  function updateSubjectBadge() {
    const textEl = document.getElementById('quizSubjectText');
    const iconEl = document.getElementById('quizSubjectIcon');
    if (textEl) textEl.textContent = quizSubjectLabel;
    if (iconEl) {
      const key = (quizSubjectLabel || '').trim().toLowerCase();
      iconEl.className = 'bi ' + (SUBJECT_ICONS[key] || 'bi-journal-text');
    }
  }

  /* Generates (via the adaptive engine) whichever question belongs
     at `index`, storing it in state.questions[index] and advancing
     state.maxReached. Returns false if the pool is exhausted and no
     question could be produced. Safe to call more than once for the
     same index — it's a no-op if that slot is already filled. */
  function generateQuestionAt(index) {
    if (state.questions[index]) return true;

    const q = engine.getNextQuestion();
    if (!q) return false;

    state.questions[index] = q;
    state.maxReached = Math.max(state.maxReached, index);
    return true;
  }

  /* Renders a clear, honest message in place of the quiz card when
     it can't be shown — either the subject's question bank is
     empty, or the backend couldn't be reached — with a way back to
     Subjects instead of a dead-end page. */
  function renderBlockedState(reasonOverride, messageOverride) {
    const reason = reasonOverride || state.blockedReason;
    const message = messageOverride || state.blockedMessage;
    const card = document.getElementById('quizQuestionCard');
    const icon = reason === 'network-error' ? 'bi-wifi-off' : 'bi-inbox';
    const hint = reason === 'network-error'
      ? 'Make sure the Django backend and MongoDB are running, then try again.'
      : 'Please pick a different subject, or check back once your faculty has added more questions.';

    if (card) {
      card.innerHTML = `
        <div class="quiz-empty-bank" style="text-align:center; padding:40px 20px;">
          <i class="bi ${icon}" style="font-size:2.4rem; color:var(--text-muted); display:block; margin-bottom:14px;"></i>
          <h4 style="margin-bottom:10px;">${message}</h4>
          <p style="color:var(--text-muted); margin-bottom:22px;">${hint}</p>
          <a href="subjects.html" class="qc-btn qc-btn-primary qc-ripple"><i class="bi bi-collection"></i> Browse Subjects</a>
        </div>
      `;
    }
    document.getElementById('quizPaletteGrid')?.closest('.qc-card')?.classList.add('d-none');
    document.querySelector('.quiz-nav-buttons')?.classList.add('d-none');
    document.getElementById('quizTimer')?.classList.add('d-none');
  }

  function cacheEls() {
    els.questionText = document.getElementById('quizQuestionText');
    els.optionsList = document.getElementById('quizOptionsList');
    els.currentNum = document.getElementById('quizCurrentNum');
    els.progressFill = document.getElementById('quizProgressFill');
    els.difficultyBadge = document.getElementById('quizDifficultyBadge');
    els.timerText = document.getElementById('quizTimerText');
    els.timerBox = document.getElementById('quizTimer');
    els.prevBtn = document.getElementById('quizPrevBtn');
    els.nextBtn = document.getElementById('quizNextBtn');
    els.submitBtn = document.getElementById('quizSubmitBtn');
    els.paletteSubmitBtn = document.getElementById('quizPaletteSubmitBtn');
    els.flagBtn = document.getElementById('quizFlagBtn');
    els.paletteGrid = document.getElementById('quizPaletteGrid');
    els.modalBackdrop = document.getElementById('quizModalBackdrop');
    els.modalText = document.getElementById('quizModalText');
    els.modalCancel = document.getElementById('quizModalCancel');
    els.modalConfirm = document.getElementById('quizModalConfirm');
  }

  function buildPalette() {
    els.paletteGrid.innerHTML = '';
    for (let i = 0; i < QUESTIONS_PER_QUIZ; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quiz-palette-btn';
      btn.textContent = i + 1;
      btn.setAttribute('aria-label', 'Go to question ' + (i + 1));
      btn.addEventListener('click', () => {
        // Only questions already generated (reached at least once by
        // moving forward normally) can be jumped to — the palette
        // can't be used to skip ahead into difficulty that hasn't
        // been adaptively decided yet.
        if (i > state.maxReached) return;
        state.current = i;
        renderQuestion();
      });
      els.paletteGrid.appendChild(btn);
    }
  }

  function renderQuestion() {
    const q = state.questions[state.current];
    if (!q) return; // shouldn't happen — navigation only ever targets generated questions

    els.questionText.innerHTML = q.text;
    els.currentNum.textContent = state.current + 1;
    els.progressFill.style.width = (((state.current + 1) / QUESTIONS_PER_QUIZ) * 100) + '%';

    els.difficultyBadge.textContent = capitalize(q.difficulty);
    els.difficultyBadge.className = 'qc-badge diff-' + q.difficulty;

    els.optionsList.innerHTML = '';
    q.options.forEach((optionText, i) => {
      const selected = state.answers[state.current] === i;
      const opt = document.createElement('div');
      opt.className = 'quiz-option' + (selected ? ' selected' : '');
      opt.setAttribute('role', 'button');
      opt.setAttribute('tabindex', '0');
      opt.innerHTML = `
        <span class="quiz-option-marker">${String.fromCharCode(65 + i)}</span>
        <span class="quiz-option-text">${optionText}</span>
        <i class="bi bi-check-circle-fill quiz-option-check"></i>
      `;
      opt.addEventListener('click', () => selectAnswer(i));
      opt.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') selectAnswer(i);
      });
      els.optionsList.appendChild(opt);
    });

    els.flagBtn.classList.toggle('active', state.flagged[state.current]);
    els.flagBtn.innerHTML = state.flagged[state.current]
      ? '<i class="bi bi-flag-fill"></i> Flagged'
      : '<i class="bi bi-flag"></i> Mark for Review';

    els.prevBtn.disabled = state.current === 0;
    const isLast = state.current === QUESTIONS_PER_QUIZ - 1;
    els.nextBtn.classList.toggle('d-none', isLast);
    els.submitBtn.classList.toggle('d-none', !isLast);

    updatePaletteUI();
  }

  function selectAnswer(index) {
    state.answers[state.current] = index;
    renderQuestion();
  }

  function updatePaletteUI() {
    const buttons = els.paletteGrid.querySelectorAll('.quiz-palette-btn');
    buttons.forEach((btn, i) => {
      btn.classList.toggle('current', i === state.current);
      btn.classList.toggle('answered', state.answers[i] !== null);
      btn.classList.toggle('flagged', state.flagged[i]);
      btn.classList.toggle('locked', i > state.maxReached);
      btn.disabled = i > state.maxReached;
    });
  }

  function wireEvents() {
    els.prevBtn.addEventListener('click', () => {
      if (state.current > 0) { state.current -= 1; renderQuestion(); }
    });

    els.nextBtn.addEventListener('click', () => {
      const nextIndex = state.current + 1;
      if (nextIndex >= QUESTIONS_PER_QUIZ) return;

      // ADAPTIVE STEP: only step the difficulty and generate a new
      // question the FIRST time we move past the current question —
      // going back and forth over already-seen questions must not
      // regenerate anything.
      if (nextIndex > state.maxReached) {
        const currentQuestion = state.questions[state.current];
        const wasCorrect = state.answers[state.current] === currentQuestion.correct;
        engine.stepDifficulty(wasCorrect);

        if (!generateQuestionAt(nextIndex)) {
          // Subject's pool ran out before reaching 15 questions —
          // extremely unlikely with a healthy question bank, but
          // handled rather than left broken: stop growing and let
          // the student submit with what they've got.
          els.nextBtn.classList.add('d-none');
          els.submitBtn.classList.remove('d-none');
          return;
        }
      }

      state.current = nextIndex;
      renderQuestion();
    });

    els.flagBtn.addEventListener('click', () => {
      state.flagged[state.current] = !state.flagged[state.current];
      renderQuestion();
    });

    els.submitBtn.addEventListener('click', openSubmitModal);
    els.paletteSubmitBtn.addEventListener('click', openSubmitModal);
    els.modalCancel.addEventListener('click', closeSubmitModal);
    els.modalConfirm.addEventListener('click', finishQuiz);
  }

  function openSubmitModal() {
    const answered = state.answers.filter((a) => a !== null).length;
    els.modalText.textContent = answered === QUESTIONS_PER_QUIZ
      ? `You've answered all ${QUESTIONS_PER_QUIZ} questions. Ready to submit?`
      : `You've answered ${answered} of ${QUESTIONS_PER_QUIZ} questions. Unanswered questions will be marked incorrect.`;
    els.modalBackdrop.classList.remove('d-none');
  }

  function closeSubmitModal() {
    els.modalBackdrop.classList.add('d-none');
  }

  function startTimer() {
    updateTimerText();
    state.timerHandle = setInterval(() => {
      state.remainingSeconds -= 1;
      updateTimerText();

      if (state.remainingSeconds <= 60) {
        els.timerBox.classList.add('time-low');
      }
      if (state.remainingSeconds <= 0) {
        clearInterval(state.timerHandle);
        finishQuiz();
      }
    }, 1000);
  }

  function updateTimerText() {
    const m = Math.max(Math.floor(state.remainingSeconds / 60), 0);
    const s = Math.max(state.remainingSeconds % 60, 0);
    els.timerText.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function finishQuiz() {
    clearInterval(state.timerHandle);

    // DICTIONARY-BASED SCORE TRACKING: one object instead of three
    // loose counters, mirrors Quiz.score_board in quiz_engine.py.
    const breakdown = { correct: 0, wrong: 0, unanswered: 0 };
    let weightedScore = 0;

    for (let i = 0; i < QUESTIONS_PER_QUIZ; i++) {
      const q = state.questions[i];

      // A question the student never reached (e.g. the timer ran out
      // early) has no generated content — it still counts toward the
      // 15-question total as unanswered, just without a specific
      // difficulty to award marks against.
      if (!q || state.answers[i] === null) {
        breakdown.unanswered += 1;
        continue;
      }

      if (state.answers[i] === q.correct) {
        breakdown.correct += 1;
        // DIFFICULTY-BASED SCORING: a hard question is worth more
        // than an easy one, using the same weight table the backend
        // uses in DIFFICULTY_MARKS.
        weightedScore += q.marks || DIFFICULTY_MARKS[q.difficulty] || 1;
      } else {
        breakdown.wrong += 1;
      }
    }

    const correctCount = breakdown.correct;
    const wrongCount = breakdown.wrong;
    const unansweredCount = breakdown.unanswered;
    const percentage = Math.round((correctCount / QUESTIONS_PER_QUIZ) * 100);

    // DATETIME-BASED QUIZ TIMER: elapsed time computed from the
    // Date captured in init() when the quiz actually started.
    const finishedAt = new Date();
    const timeTakenSeconds = state.startedAt
      ? Math.round((finishedAt - state.startedAt) / 1000)
      : null;

    const result = {
      subject: quizSubjectLabel,
      total: QUESTIONS_PER_QUIZ,
      correctCount,
      wrongCount,
      unansweredCount,
      percentage,
      timestamp: finishedAt.toISOString(),
    };

    // BUG FIX: student_name used to be hardcoded as "Bhumika" for
    // every submission. It now reads the profile js/loginpage1.js
    // stored on login, falling back to "Guest" if nobody is logged in.
    let currentUser = null;
    try {
      currentUser = JSON.parse(localStorage.getItem('quizcraft_user'));
    } catch (e) {
      currentUser = null;
    }
    const studentName = (currentUser && currentUser.name) || 'Guest';

    fetch("http://127.0.0.1:8000/users/submit-result/", {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    body: JSON.stringify({
        student_name: studentName,
        subject: quizSubjectLabel,
        difficulty: (engine && engine.currentDifficulty) || 'easy',
        score: correctCount,
        total: QUESTIONS_PER_QUIZ,
        breakdown: breakdown,
        time_taken_seconds: timeTakenSeconds
    })
})
.then(res => res.json())
.then(data => {
    console.log(data);
})
.catch(err => console.log(err));

    // The real submission already happened via the fetch() POST
    // above. This localStorage copy is only a brief fast-path for
    // result.html — in case its GET request runs before the
    // backend write above is fully queryable, it can show this
    // (real, just-submitted) result immediately instead of a
    // fabricated placeholder. See readJustSubmittedResult() in
    // js/result.js.
    try {
      localStorage.setItem('quizcraft_last_result', JSON.stringify(result));
    } catch (e) {
      /* localStorage unavailable — result.html will fetch from the
         backend directly instead, which already has the real data. */
    }

    window.location.href = 'result.html';
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
})();
