import { loadQuestionCache, saveQuestionCache } from "./question-cache.js";

const baseAliases = {
  id: ["id", "問題番号", "番号", "no"],
  course: ["course", "科目", "コース"],
  topic: ["topic", "論点", "テーマ"],
  question: ["question", "問題", "問題文"],
  answer: ["answer", "回答", "正解"],
  explanation: ["explanation", "解説"]
};

const TRUE_VALUES = new Set(["○", "◯", "〇"]);
const FALSE_VALUES = new Set(["×", "✕", "✖"]);
const DATA_VERSION = "simple-sheet-v1";
const ACTIVE_SESSION_KEY = "loopnote-active-session";
const MISTAKE_LOG_KEY = "loopnote-mistake-log";

if (localStorage.getItem("loopnote-data-version") !== DATA_VERSION) {
  localStorage.removeItem("loopnote-answered");
  localStorage.removeItem("loopnote-history");
  localStorage.removeItem(MISTAKE_LOG_KEY);
  localStorage.setItem("loopnote-data-version", DATA_VERSION);
}

const COURSES = [
  {
    id: "白書統計",
    number: "01",
    kicker: "DATA & WHITE PAPER",
    description: "白書・労働経済・社会保障統計を、定義と傾向から確認。",
    className: "statistics"
  },
  {
    id: "数字",
    number: "02",
    kicker: "NUMBERS & LIMITS",
    description: "日数・期間・率・上限を、テンポよく反復。",
    className: "numbers"
  },
  {
    id: "横断整理",
    number: "03",
    kicker: "CROSS SUBJECT",
    description: "似ている制度を並べて、違いを一問一答で整理。",
    className: "cross"
  },
  {
    id: "罰則",
    number: "04",
    kicker: "PENALTIES",
    description: "罰則の内容を、○×または自己採点で確認。",
    className: "penalties"
  }
];

const state = {
  questions: [],
  sessionQuestions: [],
  selectedCourse: null,
  selectedTopic: null,
  sessionShuffle: false,
  rememberAnswers: true,
  reviewScope: null,
  selectedCategory: "すべて",
  currentId: null,
  selections: new Map(),
  gradedChoices: new Set(),
  graded: false,
  revealed: false,
  syncing: false,
  cacheLoaded: false,
  questionVersion: null,
  questionFetchedAt: null,
  source: localStorage.getItem("loopnote-source") || "",
  answered: new Set(JSON.parse(localStorage.getItem("loopnote-answered") || "[]")),
  sessionResults: new Map(),
  sessionAnswers: new Map(),
  history: JSON.parse(localStorage.getItem("loopnote-history") || "[]"),
  mistakeLog: JSON.parse(localStorage.getItem(MISTAKE_LOG_KEY) || "[]")
};
if (!Array.isArray(state.history)) state.history = [];
if (!Array.isArray(state.mistakeLog)) state.mistakeLog = [];
if (localStorage.getItem(MISTAKE_LOG_KEY) === null) {
  state.mistakeLog = state.history.filter((record) => record.isCorrect === false);
  try { localStorage.setItem(MISTAKE_LOG_KEY, JSON.stringify(state.mistakeLog)); } catch { /* Preserve app startup if storage is full. */ }
}

const $ = (selector) => document.querySelector(selector);
const elements = {
  homeScreen: $("#homeScreen"),
  topicScreen: $("#topicScreen"),
  practiceScreen: $("#practiceScreen"),
  resultScreen: $("#resultScreen"),
  historyScreen: $("#historyScreen"),
  courseGrid: $("#courseGrid"),
  resumePanel: $("#resumePanel"),
  resumeSessionButton: $("#resumeSessionButton"),
  resumeSessionTitle: $("#resumeSessionTitle"),
  resumeSessionProgress: $("#resumeSessionProgress"),
  topicCourseLabel: $("#topicCourseLabel"),
  topicTitle: $("#topicTitle"),
  topicGrid: $("#topicGrid"),
  topicBackButton: $("#topicBackButton"),
  homeProgressText: $("#homeProgressText"),
  homeProgressBar: $("#homeProgressBar"),
  homeResetButton: $("#homeResetButton"),
  homeButton: $("#homeButton"),
  resultCourse: $("#resultCourse"),
  resultScore: $("#resultScore"),
  resultCount: $("#resultCount"),
  resultRateBar: $("#resultRateBar"),
  resultComment: $("#resultComment"),
  retryButton: $("#retryButton"),
  resultHomeButton: $("#resultHomeButton"),
  shuffleButton: $("#shuffleButton"),
  shuffleCount: $("#shuffleCount"),
  mistakesModeButton: $("#mistakesModeButton"),
  mistakesCount: $("#mistakesCount"),
  rangeReviewButton: $("#rangeReviewButton"),
  historyButton: $("#historyButton"),
  emptyState: $("#emptyState"),
  emptySettingsButton: $("#emptySettingsButton"),
  historyTotal: $("#historyTotal"),
  historyCorrect: $("#historyCorrect"),
  historyRate: $("#historyRate"),
  historyList: $("#historyList"),
  historyEmpty: $("#historyEmpty"),
  clearHistoryButton: $("#clearHistoryButton"),
  courseTitle: $("#courseTitle"),
  categoryList: $("#categoryList"),
  categoryEyebrow: $("#categoryEyebrow"),
  questionCard: $("#questionCard"),
  questionNumber: $("#questionNumber"),
  difficultyBadge: $("#difficultyBadge"),
  sessionAccuracyBadge: $("#sessionAccuracyBadge"),
  previousButton: $("#previousButton"),
  jumpButton: $("#jumpButton"),
  skipButton: $("#skipButton"),
  questionText: $("#questionText"),
  questionHint: $("#questionHint"),
  answerForm: $("#answerForm"),
  choiceList: $("#choiceList"),
  cardActions: $("#cardActions"),
  resultMessage: $("#resultMessage"),
  revealButton: $("#revealButton"),
  nextButton: $("#nextButton"),
  nextButtonLabel: $("#nextButtonLabel"),
  mistakeButton: $("#mistakeButton"),
  progressPercent: $("#progressPercent"),
  progressFraction: $("#progressFraction"),
  progressBar: $("#progressBar"),
  syncIndicator: $("#syncIndicator"),
  syncLabel: $("#syncLabel"),
  syncButton: $("#syncButton"),
  settingsButton: $("#settingsButton"),
  settingsDialog: $("#settingsDialog"),
  sourceInput: $("#sourceInput"),
  saveSettingsButton: $("#saveSettingsButton"),
  resetButton: $("#resetButton"),
  jumpDialog: $("#jumpDialog"),
  jumpForm: $("#jumpForm"),
  jumpRangeText: $("#jumpRangeText"),
  jumpNumberInput: $("#jumpNumberInput"),
  jumpCloseButton: $("#jumpCloseButton"),
  jumpCancelButton: $("#jumpCancelButton"),
  rangeReviewDialog: $("#rangeReviewDialog"),
  rangeReviewForm: $("#rangeReviewForm"),
  rangeReviewCloseButton: $("#rangeReviewCloseButton"),
  rangeReviewCancelButton: $("#rangeReviewCancelButton"),
  rangeReviewStartButton: $("#rangeReviewStartButton"),
  reviewStartDate: $("#reviewStartDate"),
  reviewEndDate: $("#reviewEndDate"),
  reviewCourseSelect: $("#reviewCourseSelect"),
  rangeReviewCount: $("#rangeReviewCount"),
  toast: $("#toast")
};

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const normalized = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (quoted) {
      if (char === '"' && normalized[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]/g, "");
}

function findColumn(headers, aliases) {
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

function parseCorrect(value) {
  const normalized = String(value ?? "").normalize("NFKC").trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return null;
}

function choiceAliases(index, field) {
  if (field === "text") return [`choice${index}`, `statement${index}`, `肢${index}`, `選択肢${index}`];
  if (field === "correct") return [`answer${index}`, `correct${index}`, `正解${index}`, `回答${index}`];
  return [`explanation${index}`, `commentary${index}`, `解説${index}`];
}

function normalizeCourse(value) {
  const compact = String(value || "").trim().replace(/[・\s]/g, "");
  if (compact === "白書統計") return "白書統計";
  if (compact === "数字" || compact === "数字に関する問題") return "数字";
  if (compact === "横断整理") return "横断整理";
  if (compact === "罰則") return "罰則";
  return compact;
}

function questionHistory(questionId) {
  return state.history.filter((record) => String(record.questionId) === String(questionId));
}

function createQuestionHistory(questionId) {
  const records = questionHistory(questionId);
  const correctCount = records.filter((record) => record.isCorrect).length;
  const rate = records.length ? Math.round((correctCount / records.length) * 100) : 0;
  const panel = document.createElement("div");
  panel.className = "question-history";

  const summary = document.createElement("div");
  summary.className = "question-history-summary";
  const label = document.createElement("span");
  label.textContent = "この問題の正答率";
  const rateText = document.createElement("b");
  rateText.textContent = `${rate}%`;
  const count = document.createElement("small");
  count.textContent = `${correctCount} / ${records.length} 回正解`;
  summary.append(label, rateText, count);

  const recent = document.createElement("div");
  recent.className = "question-history-recent";
  const recentLabel = document.createElement("span");
  recentLabel.className = "question-history-label";
  recentLabel.textContent = "直近10回（新しい順）";
  const results = document.createElement("div");
  results.className = "question-history-results";
  records.slice(0, 10).forEach((record) => {
    const result = document.createElement("span");
    result.className = `question-history-result ${record.isCorrect ? "correct" : "incorrect"}`;
    result.textContent = record.isCorrect ? "○" : "×";
    result.setAttribute("aria-label", record.isCorrect ? "正解" : "不正解");
    results.append(result);
  });
  recent.append(recentLabel, results);
  panel.append(summary, recent);
  return panel;
}

function createQuestion({ id, course, topic, question, answer, explanation }) {
  const normalizedCourse = normalizeCourse(course);
  const normalizedTopic = String(topic || "").trim() || "標準問題";
  const text = String(question || "").trim();
  if (!id || !normalizedCourse || !text) return null;

  const answerText = String(answer ?? "").trim();
  const correct = typeof answer === "boolean" ? answer : parseCorrect(answer);
  if (correct === null) {
    if (!answerText) return null;
    return {
      id: String(id).trim(),
      course: normalizedCourse,
      topic: normalizedTopic,
      category: normalizedTopic,
      mode: "self-assessment",
      difficulty: "自己採点",
      question: text,
      context: `${normalizedCourse} / ${normalizedTopic}`,
      hint: "",
      choices: [{ text, correct: answerText, explanation: String(explanation || "").trim() }]
    };
  }
  return {
    id: String(id).trim(),
    course: normalizedCourse,
    topic: normalizedTopic,
    category: normalizedTopic,
    mode: "true-false",
    difficulty: "○×",
    question: text,
    context: `${normalizedCourse} / ${normalizedTopic}`,
    hint: "",
    choices: [{ text, correct, explanation: String(explanation || "").trim() }]
  };
}

function ensureUniqueQuestionIds(questions) {
  const used = new Set();
  return questions.map((question) => {
    const baseId = question.id;
    let uniqueId = baseId;
    let suffix = 2;
    while (used.has(uniqueId)) {
      uniqueId = `${baseId}__${suffix}`;
      suffix += 1;
    }
    used.add(uniqueId);
    return uniqueId === baseId ? question : { ...question, id: uniqueId };
  });
}

function rowsToQuestions(rows) {
  if (!rows.length) return [];
  const headers = rows[0];
  const indexes = Object.fromEntries(
    Object.entries(baseAliases).map(([key, aliases]) => [key, findColumn(headers, aliases)])
  );
  const missing = ["id", "course", "topic", "question", "answer", "explanation"].filter((key) => indexes[key] < 0);
  if (missing.length) throw new Error("列は左から「問題番号・科目・論点・問題文・回答・解説」にしてください");

  return ensureUniqueQuestionIds(rows.slice(1).map((row) => createQuestion({
    id: row[indexes.id],
    course: row[indexes.course],
    topic: row[indexes.topic],
    question: row[indexes.question],
    answer: row[indexes.answer],
    explanation: row[indexes.explanation]
  })).filter(Boolean));
}

function normalizeJSON(data) {
  const list = Array.isArray(data) ? data : data.questions;
  if (!Array.isArray(list)) throw new Error("JSONは配列または questions 配列で返してください");
  return ensureUniqueQuestionIds(list.map((item, index) => createQuestion({
    id: item.id ?? item["問題番号"] ?? index + 1,
    course: item.course ?? item["科目"],
    topic: item.topic ?? item["論点"],
    question: item.question ?? item["問題文"],
    answer: item.answer ?? item["回答"],
    explanation: item.explanation ?? item["解説"]
  })).filter(Boolean));
}

function activeQuestions() {
  if (state.selectedCourse && state.sessionQuestions.length) return state.sessionQuestions;
  if (state.selectedCourse) return state.questions.filter((item) => item.course === state.selectedCourse);
  return state.questions;
}

function filteredQuestions() {
  const courseQuestions = activeQuestions();
  return state.selectedCategory === "すべて"
    ? courseQuestions
    : courseQuestions.filter((item) => item.category === state.selectedCategory);
}

function currentQuestion() {
  const filtered = filteredQuestions();
  return filtered.find((item) => item.id === state.currentId) || filtered[0] || null;
}

function resetCurrentState() {
  state.selections = new Map();
  state.gradedChoices = new Set();
  state.graded = false;
  state.revealed = false;
  elements.resultMessage.hidden = true;
}

function saveCurrentQuestionState() {
  if (!state.currentId) return;
  state.sessionAnswers.set(state.currentId, {
    selections: new Map(state.selections),
    gradedChoices: new Set(state.gradedChoices),
    graded: state.graded,
    revealed: state.revealed
  });
}

function restoreQuestionState(id) {
  const saved = state.sessionAnswers.get(id);
  if (!saved) {
    resetCurrentState();
    return;
  }
  state.selections = new Map(saved.selections);
  state.gradedChoices = new Set(saved.gradedChoices);
  state.graded = saved.graded;
  state.revealed = saved.revealed;
  elements.resultMessage.hidden = true;
}

function clearActiveSession() {
  localStorage.removeItem(ACTIVE_SESSION_KEY);
  if (elements.resumePanel) elements.resumePanel.hidden = true;
}

function readActiveSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACTIVE_SESSION_KEY) || "null");
    if (!saved || saved.version !== 1 || !Array.isArray(saved.questionIds)) return null;
    if ((saved.source || "") !== state.source) {
      clearActiveSession();
      return null;
    }
    return saved;
  } catch {
    clearActiveSession();
    return null;
  }
}

function persistActiveSession() {
  if (!state.sessionQuestions.length || !state.selectedCourse || !state.currentId) return;
  saveCurrentQuestionState();
  const sessionAnswers = [...state.sessionAnswers.entries()].map(([id, saved]) => [id, {
    selections: [...saved.selections.entries()],
    gradedChoices: [...saved.gradedChoices],
    graded: saved.graded,
    revealed: saved.revealed
  }]);
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
    version: 1,
    source: state.source,
    selectedCourse: state.selectedCourse,
    selectedTopic: state.selectedTopic,
    sessionShuffle: state.sessionShuffle,
    rememberAnswers: state.rememberAnswers,
    reviewScope: state.reviewScope,
    questionIds: state.sessionQuestions.map((question) => question.id),
    currentId: state.currentId,
    sessionResults: [...state.sessionResults.entries()],
    sessionAnswers,
    savedAt: new Date().toISOString()
  }));
}

function formatSavedSessionTitle(saved) {
  const topic = saved.selectedTopic && saved.selectedTopic !== "すべて" ? ` / ${saved.selectedTopic}` : "";
  if (saved.selectedCourse === "シャッフル演習") return "全科目シャッフル";
  if (saved.selectedCourse === "前回の誤答") return "前回の誤答";
  if (saved.reviewScope?.type === "range") {
    const course = saved.reviewScope.course === "すべて" ? "全科目" : saved.reviewScope.course;
    return `${saved.reviewScope.startDate.replaceAll("-", "/")}〜${saved.reviewScope.endDate.replaceAll("-", "/")} / ${course}`;
  }
  if (saved.rememberAnswers === false) return `${saved.selectedCourse}${topic}（復習）`;
  return `${saved.selectedCourse}${topic}${saved.sessionShuffle ? "（シャッフル）" : ""}`;
}

function renderResumePanel() {
  const saved = readActiveSession();
  if (!saved || !state.questions.length) {
    elements.resumePanel.hidden = true;
    return;
  }
  const validIds = new Set(state.questions.map((question) => question.id));
  const questionIds = saved.questionIds.filter((id) => validIds.has(id));
  if (!questionIds.length) {
    clearActiveSession();
    return;
  }
  const completed = (Array.isArray(saved.sessionResults) ? saved.sessionResults : [])
    .filter(([id]) => validIds.has(id)).length;
  elements.resumeSessionTitle.textContent = formatSavedSessionTitle(saved);
  elements.resumeSessionProgress.textContent = `${completed} / ${questionIds.length} 問完了`;
  elements.resumePanel.hidden = false;
}

function resumeActiveSession() {
  const saved = readActiveSession();
  if (!saved) return;
  const questionsById = new Map(state.questions.map((question) => [question.id, question]));
  const sessionQuestions = saved.questionIds.map((id) => questionsById.get(id)).filter(Boolean);
  if (!sessionQuestions.length) {
    clearActiveSession();
    renderHome();
    return;
  }

  state.selectedCourse = saved.selectedCourse;
  state.selectedTopic = saved.selectedTopic || "すべて";
  state.sessionShuffle = saved.sessionShuffle === true;
  state.rememberAnswers = saved.rememberAnswers !== false;
  state.reviewScope = saved.reviewScope || null;
  state.sessionQuestions = sessionQuestions;
  state.selectedCategory = "すべて";
  state.sessionResults = new Map(Array.isArray(saved.sessionResults) ? saved.sessionResults : []);
  state.sessionAnswers = new Map((Array.isArray(saved.sessionAnswers) ? saved.sessionAnswers : []).map(([id, answer]) => {
    const savedAnswer = answer || {};
    return [id, {
      selections: new Map(Array.isArray(savedAnswer.selections) ? savedAnswer.selections : []),
      gradedChoices: new Set(Array.isArray(savedAnswer.gradedChoices) ? savedAnswer.gradedChoices : []),
      graded: savedAnswer.graded === true,
      revealed: savedAnswer.revealed === true
    }];
  }));
  const remaining = sessionQuestions.find((question) => !state.sessionResults.has(question.id));
  state.currentId = sessionQuestions.some((question) => question.id === saved.currentId)
    ? saved.currentId
    : remaining?.id || sessionQuestions[0].id;
  restoreQuestionState(state.currentId);
  elements.homeScreen.hidden = true;
  elements.topicScreen.hidden = true;
  elements.resultScreen.hidden = true;
  elements.historyScreen.hidden = true;
  elements.practiceScreen.hidden = false;
  elements.homeButton.hidden = false;
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setCurrent(id) {
  saveCurrentQuestionState();
  state.currentId = id;
  restoreQuestionState(id);
  renderQuestion();
  renderProgress();
  persistActiveSession();
}

function renderCategories() {
  const questions = activeQuestions();
  const item = document.createElement("div");
  item.className = "category-item active";
  const label = document.createElement("span");
  label.textContent = state.selectedTopic === "すべて" ? "すべての論点" : state.selectedTopic || "全科目";
  const badge = document.createElement("span");
  badge.textContent = questions.length;
  item.append(label, badge);
  elements.categoryList.replaceChildren(item);
}

function createChoiceElement(choice, index) {
  const selected = state.selections.get(index);
  const isGraded = state.gradedChoices.has(index) || state.revealed;
  const item = document.createElement("section");
  item.className = "choice-item single-choice";

  if (isGraded) {
    if (selected === undefined) item.classList.add("reviewed");
    else item.classList.add(selected === choice.correct ? "correct" : "incorrect");
  }

  const statement = document.createElement("div");
  statement.className = "choice-statement";
  const number = document.createElement("span");
  number.className = "choice-number";
  number.textContent = index + 1;
  const text = document.createElement("p");
  text.textContent = choice.text;
  statement.append(number, text);

  const controls = document.createElement("div");
  controls.className = "choice-controls";
  controls.setAttribute("role", "radiogroup");
  controls.setAttribute("aria-label", `肢${index + 1}の回答`);

  [[true, "○", "正しい"], [false, "×", "誤り"]].forEach(([value, symbol, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `judge-button ${value ? "true" : "false"}${selected === value ? " selected" : ""}`;
    button.disabled = isGraded;
    button.setAttribute("aria-pressed", String(selected === value));
    button.innerHTML = `<strong>${symbol}</strong><span>${label}</span>`;
    button.addEventListener("click", () => {
      state.selections.set(index, value);
      state.gradedChoices.add(index);
      updateQuestionCompletion();
      renderQuestion();
      requestAnimationFrame(() => {
        elements.answerForm.scrollTo({ top: elements.answerForm.scrollHeight, behavior: "smooth" });
      });
    });
    controls.append(button);
  });

  if (!isGraded) item.append(controls);

  if (isGraded) {
    const feedback = document.createElement("div");
    feedback.className = "choice-feedback";
    const verdict = document.createElement("strong");
    const answeredCorrectly = selected !== undefined && selected === choice.correct;
    verdict.textContent = selected === undefined
      ? `正解：${choice.correct ? "○" : "×"}`
      : answeredCorrectly
        ? `正解：${choice.correct ? "○" : "×"}`
        : `不正解 ｜ 正解：${choice.correct ? "○" : "×"}`;
    const explanation = document.createElement("p");
    explanation.textContent = choice.explanation || "解説はまだ登録されていません。";
    feedback.append(verdict, explanation, createQuestionHistory(currentQuestion().id));
    item.append(feedback);
  }

  return item;
}

function createSelfAssessmentElement(question) {
  const choice = question.choices[0];
  const selected = state.selections.get(0);
  const item = document.createElement("section");
  item.className = "self-assessment";

  if (!state.revealed) {
    const showAnswer = document.createElement("button");
    showAnswer.type = "button";
    showAnswer.className = "show-answer-button";
    showAnswer.textContent = "答えを見る";
    showAnswer.addEventListener("click", () => {
      state.revealed = true;
      renderQuestion();
      persistActiveSession();
    });
    item.append(showAnswer);
    return item;
  }

  const answerPanel = document.createElement("div");
  answerPanel.className = "self-answer-panel";
  const answerLabel = document.createElement("span");
  answerLabel.className = "self-answer-label";
  answerLabel.textContent = "回答";
  const answerText = document.createElement("strong");
  answerText.className = "self-answer-text";
  answerText.textContent = choice.correct;
  const explanation = document.createElement("p");
  explanation.className = "self-answer-explanation";
  explanation.textContent = choice.explanation || "解説はまだ登録されていません。";
  answerPanel.append(answerLabel, answerText, explanation);
  item.append(answerPanel);

  if (!state.graded) {
    const prompt = document.createElement("p");
    prompt.className = "self-assessment-prompt";
    prompt.textContent = "答えを覚えていましたか？";
    const controls = document.createElement("div");
    controls.className = "self-assessment-controls";
    [[true, "正解"], [false, "不正解"]].forEach(([value, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `self-grade-button ${value ? "correct" : "incorrect"}`;
      button.textContent = label;
      button.addEventListener("click", () => {
        state.selections.set(0, value);
        state.gradedChoices.add(0);
        updateQuestionCompletion();
        requestAnimationFrame(() => {
          elements.answerForm.scrollTo({ top: elements.answerForm.scrollHeight, behavior: "smooth" });
        });
      });
      controls.append(button);
    });
    item.append(prompt, controls);
  } else {
    item.classList.add(selected ? "correct" : "incorrect");
    const result = document.createElement("div");
    result.className = "self-assessment-result";
    result.textContent = selected ? "正解として記録しました" : "不正解として記録しました";
    item.append(result, createQuestionHistory(question.id));
  }

  return item;
}

function renderQuestion() {
  const filtered = filteredQuestions();
  const question = currentQuestion();
  elements.choiceList.replaceChildren();

  if (!question) {
    elements.questionNumber.textContent = "NO QUESTIONS";
    elements.difficultyBadge.textContent = "—";
    elements.questionText.textContent = "表示できる問題がありません";
    elements.questionHint.textContent = "スプレッドシートの科目・問題文・回答を確認してください。";
    elements.revealButton.disabled = true;
    elements.nextButton.hidden = true;
    elements.mistakeButton.hidden = true;
    elements.previousButton.disabled = true;
    elements.jumpButton.disabled = true;
    elements.skipButton.disabled = true;
    return;
  }

  state.currentId = question.id;
  const index = filtered.findIndex((item) => item.id === question.id);
  elements.previousButton.disabled = index <= 0;
  elements.jumpButton.disabled = filtered.length <= 1;
  elements.skipButton.disabled = state.graded || index < 0 || index >= filtered.length - 1;
  elements.questionNumber.textContent = `QUESTION ${String(index + 1).padStart(2, "0")} / ${filtered.length}`;
  elements.difficultyBadge.textContent = question.difficulty;
  elements.questionText.textContent = question.question;
  const isSelfAssessment = question.mode === "self-assessment";
  elements.questionHint.textContent = isSelfAssessment
    ? `${question.context}\n答えを思い出してから確認してください。`
    : `${question.context || "次の記述を判定してください。"}\n○か×を選んでください。`;
  elements.choiceList.replaceChildren(
    ...(isSelfAssessment ? [createSelfAssessmentElement(question)] : question.choices.map(createChoiceElement))
  );
  elements.answerForm.classList.toggle("answered", state.graded || (isSelfAssessment && state.revealed));
  elements.revealButton.hidden = state.graded || isSelfAssessment;
  elements.revealButton.disabled = state.graded;
  elements.revealButton.querySelector("span").textContent = state.graded ? "解説を表示中" : "正解・解説を見る";
  elements.cardActions.hidden = state.graded || isSelfAssessment;
  elements.nextButton.hidden = !state.graded;
  elements.nextButton.disabled = false;
  elements.nextButtonLabel.textContent = index === filtered.length - 1 ? "演習完了" : "次の問題";
  elements.mistakeButton.hidden = !state.graded
    || state.selections.size === 0
    || state.sessionResults.get(question.id) === true;
}

function renderProgress() {
  const courseQuestions = activeQuestions();
  const validIds = new Set(courseQuestions.map((item) => item.id));
  const sessionEntries = [...state.sessionResults.entries()].filter(([id]) => validIds.has(id));
  const done = sessionEntries.length;
  const correct = sessionEntries.filter(([, isCorrect]) => isCorrect).length;
  const total = courseQuestions.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const accuracy = done ? Math.round((correct / done) * 100) : null;
  elements.progressPercent.textContent = `${percent}%`;
  elements.progressFraction.textContent = `${done} / ${total} 完了`;
  elements.progressBar.style.width = `${percent}%`;
  elements.sessionAccuracyBadge.textContent = `正答率 ${accuracy === null ? "--" : `${accuracy}%`}`;
}

function renderAll() {
  const topicLabel = state.selectedTopic && state.selectedTopic !== "すべて" ? state.selectedTopic : "ALL TOPICS";
  elements.categoryEyebrow.textContent = !state.rememberAnswers
    ? `${topicLabel} / REVIEW`
    : state.sessionShuffle ? `${topicLabel} / SHUFFLE` : topicLabel;
  elements.courseTitle.textContent = state.selectedCourse || "社労士 問題演習";
  renderCategories();
  renderQuestion();
  renderProgress();
}

function latestIncorrectQuestions(questions = state.questions) {
  const latestResults = new Map();
  state.history.forEach((record) => {
    const id = String(record.questionId);
    if (!latestResults.has(id)) latestResults.set(id, record.isCorrect === true);
  });
  return questions.filter((question) => latestResults.get(String(question.id)) === false);
}

function saveMistakeLog() {
  try {
    localStorage.setItem(MISTAKE_LOG_KEY, JSON.stringify(state.mistakeLog));
  } catch {
    showToast("誤答記録の保存容量が上限に達しました", true);
  }
}

function createAttemptId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function localDateBoundary(value, endOfDay = false) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function questionsMistakenInRange(startValue, endValue, course = "すべて") {
  const start = localDateBoundary(startValue);
  const end = localDateBoundary(endValue, true);
  if (!start || !end || start > end) return [];

  const questionsById = new Map(state.questions.map((question) => [String(question.id), question]));
  const seen = new Set();
  const questions = [];
  state.mistakeLog.forEach((record) => {
    const timestamp = new Date(record.timestamp);
    const id = String(record.questionId);
    if (Number.isNaN(timestamp.getTime()) || timestamp < start || timestamp > end || seen.has(id)) return;
    if (course !== "すべて" && record.course !== course) return;
    const question = questionsById.get(id);
    if (!question) return;
    seen.add(id);
    questions.push(question);
  });
  return questions;
}

function updateRangeReviewCount() {
  const questions = questionsMistakenInRange(
    elements.reviewStartDate.value,
    elements.reviewEndDate.value,
    elements.reviewCourseSelect.value
  );
  const validRange = localDateBoundary(elements.reviewStartDate.value)
    && localDateBoundary(elements.reviewEndDate.value, true)
    && elements.reviewStartDate.value <= elements.reviewEndDate.value;
  elements.rangeReviewCount.textContent = `対象 ${questions.length}問`;
  elements.rangeReviewStartButton.disabled = !validRange || questions.length === 0;
  return questions;
}

function openRangeReviewDialog() {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6);
  if (!elements.reviewStartDate.value) elements.reviewStartDate.value = formatDateInput(weekAgo);
  if (!elements.reviewEndDate.value) elements.reviewEndDate.value = formatDateInput(today);
  updateRangeReviewCount();
  elements.rangeReviewDialog.showModal();
}

function renderHome() {
  const validIds = new Set(state.questions.map((item) => item.id));
  const totalDone = [...state.answered].filter((id) => validIds.has(id)).length;
  const total = state.questions.length;
  elements.homeProgressText.textContent = `${totalDone} / ${total} 問`;
  elements.homeProgressBar.style.width = `${total ? Math.round((totalDone / total) * 100) : 0}%`;
  elements.shuffleCount.textContent = `${total}問`;
  elements.shuffleButton.disabled = total === 0;
  const incorrectQuestions = latestIncorrectQuestions();
  elements.mistakesCount.textContent = `${incorrectQuestions.length}問`;
  elements.mistakesModeButton.disabled = incorrectQuestions.length === 0;
  elements.rangeReviewButton.disabled = state.mistakeLog.length === 0;
  elements.emptyState.hidden = total > 0;
  elements.homeResetButton.disabled = state.answered.size === 0
    && state.history.length === 0
    && state.mistakeLog.length === 0
    && !readActiveSession();
  renderResumePanel();

  elements.courseGrid.replaceChildren(...COURSES.map((course) => {
    const questions = state.questions.filter((item) => item.course === course.id);
    const ids = new Set(questions.map((item) => item.id));
    const done = [...state.answered].filter((id) => ids.has(id)).length;
    const card = document.createElement("button");
    card.type = "button";
    card.className = `course-card ${course.className}`;
    card.disabled = questions.length === 0;
    card.innerHTML = `
      <span class="course-number">${course.number}</span>
      <span class="course-kicker">${course.kicker}</span>
      <strong>${course.id}</strong>
      <span class="course-description">${course.description}</span>
      <span class="course-footer">
        <span>${questions.length ? `${done} / ${questions.length} 問完了` : "問題準備中"}</span>
        <span class="course-arrow">→</span>
      </span>`;
    card.addEventListener("click", () => showTopics(course.id));
    return card;
  }));
}

function shuffleQuestions(questions) {
  const shuffled = [...questions];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function renderTopicScreen(courseId) {
  const courseQuestions = state.questions.filter((item) => item.course === courseId);
  const topicNames = [...new Set(courseQuestions.map((item) => item.topic))];
  const options = [
    { id: "すべて", label: "すべての論点", questions: courseQuestions },
    ...topicNames.map((topic) => ({
      id: topic,
      label: topic,
      questions: courseQuestions.filter((item) => item.topic === topic)
    }))
  ];

  elements.topicCourseLabel.textContent = courseId;
  elements.topicTitle.textContent = `${courseId}の論点`;
  elements.topicGrid.replaceChildren(...options.map((option) => {
    const ids = new Set(option.questions.map((item) => item.id));
    const done = [...state.answered].filter((id) => ids.has(id)).length;
    const card = document.createElement("article");
    card.className = "topic-card";
    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.className = "topic-card-title";
    title.textContent = option.label;
    const count = document.createElement("span");
    count.className = "topic-card-count";
    count.textContent = `${done} / ${option.questions.length} 問完了`;
    info.append(title, count);

    const actions = document.createElement("div");
    actions.className = "topic-card-actions";
    const startButton = document.createElement("button");
    startButton.type = "button";
    startButton.className = "topic-start-button";
    startButton.textContent = "順番に解く";
    startButton.addEventListener("click", () => startCourse(courseId, option.id, false));
    const shuffleButton = document.createElement("button");
    shuffleButton.type = "button";
    shuffleButton.className = "topic-shuffle-button";
    shuffleButton.textContent = "シャッフル";
    shuffleButton.addEventListener("click", () => startCourse(courseId, option.id, true));
    const reviewQuestions = latestIncorrectQuestions(option.questions);
    const reviewButton = document.createElement("button");
    reviewButton.type = "button";
    reviewButton.className = "topic-review-button";
    reviewButton.textContent = `復習 ${reviewQuestions.length}問`;
    reviewButton.disabled = reviewQuestions.length === 0;
    reviewButton.addEventListener("click", () => startMistakesMode(courseId, option.id));
    actions.append(startButton, shuffleButton, reviewButton);
    card.append(info, actions);
    return card;
  }));
}

function showTopics(courseId) {
  if (!state.questions.some((item) => item.course === courseId)) return;
  state.selectedCourse = courseId;
  state.selectedTopic = null;
  state.sessionQuestions = [];
  state.sessionShuffle = false;
  state.rememberAnswers = true;
  state.reviewScope = null;
  elements.homeScreen.hidden = true;
  elements.practiceScreen.hidden = true;
  elements.resultScreen.hidden = true;
  elements.historyScreen.hidden = true;
  elements.topicScreen.hidden = false;
  elements.homeButton.hidden = false;
  renderTopicScreen(courseId);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showHome() {
  if (!elements.practiceScreen.hidden && state.sessionQuestions.length) persistActiveSession();
  state.selectedCourse = null;
  state.selectedTopic = null;
  state.sessionQuestions = [];
  state.sessionShuffle = false;
  state.rememberAnswers = true;
  state.reviewScope = null;
  state.sessionAnswers = new Map();
  state.selectedCategory = "すべて";
  resetCurrentState();
  elements.practiceScreen.hidden = true;
  elements.resultScreen.hidden = true;
  elements.historyScreen.hidden = true;
  elements.topicScreen.hidden = true;
  elements.homeScreen.hidden = false;
  elements.homeButton.hidden = true;
  renderHome();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startCourse(courseId, topic = "すべて", shuffled = false) {
  const courseQuestions = state.questions.filter(
    (item) => item.course === courseId && (topic === "すべて" || item.topic === topic)
  );
  const firstQuestion = courseQuestions[0];
  if (!firstQuestion) return;
  state.selectedCourse = courseId;
  state.selectedTopic = topic;
  state.sessionShuffle = shuffled;
  state.sessionQuestions = shuffled ? shuffleQuestions(courseQuestions) : courseQuestions;
  state.selectedCategory = "すべて";
  state.currentId = state.sessionQuestions[0].id;
  state.sessionResults = new Map();
  state.sessionAnswers = new Map();
  state.rememberAnswers = true;
  state.reviewScope = null;
  resetCurrentState();
  elements.homeScreen.hidden = true;
  elements.resultScreen.hidden = true;
  elements.historyScreen.hidden = true;
  elements.topicScreen.hidden = true;
  elements.practiceScreen.hidden = false;
  elements.homeButton.hidden = false;
  renderAll();
  persistActiveSession();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startShuffle() {
  if (!state.questions.length) return;
  const shuffled = shuffleQuestions(state.questions);
  state.selectedCourse = "シャッフル演習";
  state.selectedTopic = "すべて";
  state.sessionShuffle = true;
  state.sessionQuestions = shuffled;
  state.selectedCategory = "すべて";
  state.currentId = shuffled[0].id;
  state.sessionResults = new Map();
  state.sessionAnswers = new Map();
  state.rememberAnswers = true;
  state.reviewScope = null;
  resetCurrentState();
  elements.homeScreen.hidden = true;
  elements.resultScreen.hidden = true;
  elements.historyScreen.hidden = true;
  elements.topicScreen.hidden = true;
  elements.practiceScreen.hidden = false;
  elements.homeButton.hidden = false;
  renderAll();
  persistActiveSession();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startReviewSession(questions, { title, topic = "すべて", scope }) {
  if (!questions.length) return;
  state.selectedCourse = title;
  state.selectedTopic = topic;
  state.sessionShuffle = false;
  state.rememberAnswers = false;
  state.reviewScope = scope;
  state.sessionQuestions = questions;
  state.selectedCategory = "すべて";
  state.currentId = questions[0].id;
  state.sessionResults = new Map();
  state.sessionAnswers = new Map();
  resetCurrentState();
  elements.homeScreen.hidden = true;
  elements.resultScreen.hidden = true;
  elements.historyScreen.hidden = true;
  elements.topicScreen.hidden = true;
  elements.practiceScreen.hidden = false;
  elements.homeButton.hidden = false;
  renderAll();
  persistActiveSession();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startMistakesMode(courseId = null, topic = "すべて") {
  const scopeQuestions = state.questions.filter(
    (item) => (!courseId || item.course === courseId) && (topic === "すべて" || item.topic === topic)
  );
  const questions = latestIncorrectQuestions(scopeQuestions);
  startReviewSession(questions, {
    title: courseId || "前回の誤答",
    topic,
    scope: { type: "latest", courseId, topic }
  });
}

function startDateRangeReview(startDate, endDate, course = "すべて") {
  const questions = questionsMistakenInRange(startDate, endDate, course);
  if (!questions.length) {
    showToast("指定期間に該当する誤答がありません", true);
    return;
  }
  startReviewSession(questions, {
    title: course === "すべて" ? "期間指定復習" : `${course}・期間指定復習`,
    scope: { type: "range", startDate, endDate, course }
  });
}

function saveAnswered() {
  localStorage.setItem("loopnote-answered", JSON.stringify([...state.answered]));
}

function resetLearningMemory() {
  state.answered.clear();
  state.history = [];
  state.mistakeLog = [];
  state.sessionResults = new Map();
  localStorage.removeItem("loopnote-answered");
  localStorage.removeItem("loopnote-history");
  localStorage.removeItem(MISTAKE_LOG_KEY);
  clearActiveSession();
  renderHome();
  showToast("進捗と回答履歴をリセットしました");
}

function completeQuestion(message, className) {
  const question = currentQuestion();
  const alreadyRecorded = state.sessionResults.has(question.id);
  state.graded = true;
  state.sessionResults.set(question.id, className === "correct");
  if (state.rememberAnswers) {
    state.answered.add(question.id);
    saveAnswered();
  }
  if (state.rememberAnswers && !alreadyRecorded) {
    const selected = state.selections.get(0);
    const isSelfAssessment = question.mode === "self-assessment";
    const record = {
      attemptId: createAttemptId(),
      timestamp: new Date().toISOString(),
      questionId: question.id,
      course: question.course,
      topic: question.topic,
      question: question.question,
      selected: selected === undefined ? "未回答" : isSelfAssessment ? selected ? "正解" : "不正解" : selected ? "○" : "×",
      correctAnswer: isSelfAssessment ? question.choices[0].correct : question.choices[0].correct ? "○" : "×",
      isCorrect: className === "correct"
    };
    state.history.unshift(record);
    state.history = state.history.slice(0, 500);
    localStorage.setItem("loopnote-history", JSON.stringify(state.history));
    if (!record.isCorrect) {
      state.mistakeLog.unshift({ ...record });
      saveMistakeLog();
    }
  }
  saveCurrentQuestionState();
  persistActiveSession();
  elements.resultMessage.hidden = true;
  elements.resultMessage.className = `result-message ${className}`;
  elements.resultMessage.textContent = message;
  renderQuestion();
  renderProgress();
}

function updateQuestionCompletion() {
  const question = currentQuestion();
  if (!question) return;
  if (state.gradedChoices.size < question.choices.length) return;
  const allCorrect = question.mode === "self-assessment"
    ? state.selections.get(0) === true
    : question.choices.every((choice, index) => state.selections.get(index) === choice.correct);
  completeQuestion(allCorrect ? "正解です。" : "不正解です。解説を確認しましょう。", allCorrect ? "correct" : "incorrect");
}

function correctAccidentalTap() {
  const question = currentQuestion();
  if (!question || state.sessionResults.get(question.id) !== false) return;

  const correctAnswer = question.mode === "self-assessment" ? true : question.choices[0].correct;
  state.selections.set(0, correctAnswer);
  state.gradedChoices.add(0);
  state.sessionResults.set(question.id, true);

  const record = state.rememberAnswers
    ? state.history.find((item) => String(item.questionId) === String(question.id))
    : null;
  if (record) {
    record.selected = question.mode === "self-assessment" ? "正解" : record.correctAnswer;
    record.isCorrect = true;
    record.corrected = true;
    localStorage.setItem("loopnote-history", JSON.stringify(state.history));
    state.mistakeLog = state.mistakeLog.filter((item) => (
      record.attemptId
        ? item.attemptId !== record.attemptId
        : !(item.timestamp === record.timestamp && String(item.questionId) === String(record.questionId))
    ));
    saveMistakeLog();
  }

  saveCurrentQuestionState();
  persistActiveSession();
  renderQuestion();
  renderProgress();
  showToast("正解として記録しました");
}

function revealAnswers() {
  const question = currentQuestion();
  if (!question) return;
  state.revealed = true;
  question.choices.forEach((_, index) => state.gradedChoices.add(index));
  completeQuestion("正解と解説を表示しました。", "review");
}

function moveQuestion(direction) {
  const filtered = filteredQuestions();
  if (filtered.length < 2) return;
  const index = filtered.findIndex((item) => item.id === state.currentId);
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= filtered.length) return;
  setCurrent(filtered[nextIndex].id);
  elements.questionCard.animate(
    [{ opacity: .5, transform: `translateX(${direction * 10}px)` }, { opacity: 1, transform: "translateX(0)" }],
    { duration: 220, easing: "ease-out" }
  );
}

function skipQuestion() {
  if (state.graded) return;
  moveQuestion(1);
}

function jumpToQuestionNumber(number) {
  const questions = filteredQuestions();
  const targetIndex = Number(number) - 1;
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= questions.length) return false;
  setCurrent(questions[targetIndex].id);
  elements.questionCard.animate(
    [{ opacity: .55, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }],
    { duration: 220, easing: "ease-out" }
  );
  return true;
}

function openJumpDialog() {
  const questions = filteredQuestions();
  if (questions.length <= 1) return;
  const currentIndex = questions.findIndex((question) => question.id === state.currentId);
  elements.jumpNumberInput.max = String(questions.length);
  elements.jumpNumberInput.value = String(Math.max(1, currentIndex + 1));
  elements.jumpRangeText.textContent = `1〜${questions.length}問目から選べます。`;
  elements.jumpDialog.showModal();
  elements.jumpNumberInput.focus();
  try { elements.jumpNumberInput.select(); } catch { /* Number inputs may not support text selection. */ }
}

function showResults() {
  const questions = activeQuestions();
  const correct = questions.reduce(
    (count, question) => count + (state.sessionResults.get(question.id) === true ? 1 : 0),
    0
  );
  const total = questions.length;
  const rate = total ? Math.round((correct / total) * 100) : 0;
  const comment = rate === 100
    ? "全問正解です。このテーマはしっかり定着しています。"
    : rate >= 80
      ? "合格ラインの理解です。間違えた問題だけ復習しましょう。"
      : rate >= 60
        ? "あと一歩です。解説を確認してもう一周すると効果的です。"
        : "伸びしろがあります。数字と例外要件を一つずつ整理しましょう。";

  const topicText = state.selectedTopic && state.selectedTopic !== "すべて" ? ` / ${state.selectedTopic}` : "";
  const rangeScope = state.reviewScope?.type === "range" ? state.reviewScope : null;
  elements.resultCourse.textContent = rangeScope
    ? `${rangeScope.startDate.replaceAll("-", "/")}〜${rangeScope.endDate.replaceAll("-", "/")} / ${rangeScope.course === "すべて" ? "全科目" : rangeScope.course}`
    : !state.rememberAnswers
      ? state.selectedCourse === "前回の誤答" ? "前回の誤答" : `${state.selectedCourse}${topicText}（復習）`
    : state.selectedCourse === "シャッフル演習"
      ? "全科目シャッフル"
      : `${state.selectedCourse}${topicText}${state.sessionShuffle ? "（シャッフル）" : ""}`;
  elements.resultScore.textContent = `${rate}%`;
  elements.resultCount.textContent = `${correct} / ${total} 問正解`;
  elements.resultRateBar.style.width = `${rate}%`;
  elements.resultComment.textContent = comment;
  clearActiveSession();
  elements.practiceScreen.hidden = true;
  elements.homeScreen.hidden = true;
  elements.topicScreen.hidden = true;
  elements.resultScreen.hidden = false;
  elements.homeButton.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHistory() {
  const total = state.history.length;
  const correct = state.history.filter((item) => item.isCorrect).length;
  const rate = total ? Math.round((correct / total) * 100) : 0;
  elements.historyTotal.textContent = total;
  elements.historyCorrect.textContent = correct;
  elements.historyRate.textContent = `${rate}%`;
  elements.historyEmpty.hidden = total > 0;
  elements.clearHistoryButton.disabled = total === 0;

  elements.historyList.replaceChildren(...state.history.map((record) => {
    const item = document.createElement("article");
    item.className = `history-item ${record.isCorrect ? "correct" : "incorrect"}`;
    const header = document.createElement("div");
    header.className = "history-item-header";
    const status = document.createElement("strong");
    status.textContent = record.isCorrect ? "正解" : "不正解";
    const meta = document.createElement("span");
    const topic = record.topic ? ` / ${record.topic}` : "";
    meta.textContent = `${record.course}${topic} ・ ${new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(record.timestamp))}`;
    header.append(status, meta);
    const question = document.createElement("p");
    question.textContent = record.question;
    const answer = document.createElement("div");
    answer.className = "history-answer";
    answer.textContent = `回答 ${record.selected} ／ 正解 ${record.correctAnswer}`;
    item.append(header, question, answer);
    return item;
  }));
}

function showHistory() {
  elements.homeScreen.hidden = true;
  elements.practiceScreen.hidden = true;
  elements.resultScreen.hidden = true;
  elements.topicScreen.hidden = true;
  elements.historyScreen.hidden = false;
  elements.homeButton.hidden = false;
  renderHistory();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function retryCurrentSession() {
  if (state.selectedCourse === "シャッフル演習") startShuffle();
  else if (state.reviewScope?.type === "range") {
    startDateRangeReview(state.reviewScope.startDate, state.reviewScope.endDate, state.reviewScope.course);
  } else if (!state.rememberAnswers) {
    startMistakesMode(state.reviewScope?.courseId || null, state.reviewScope?.topic || "すべて");
  }
  else startCourse(state.selectedCourse, state.selectedTopic || "すべて", state.sessionShuffle);
}

function handleNextQuestion() {
  const filtered = filteredQuestions();
  const index = filtered.findIndex((item) => item.id === state.currentId);
  if (index === filtered.length - 1) showResults();
  else moveQuestion(1);
}

function hashQuestions(questions) {
  return JSON.stringify(questions);
}

function buildQuestionsUrl({ mode = "full", force = false } = {}) {
  const parameters = new URLSearchParams();
  if (state.source) parameters.set("source", state.source);
  if (mode !== "full") parameters.set("mode", mode);
  if (force) {
    parameters.set("refresh", "1");
    parameters.set("timestamp", String(Date.now()));
  }
  const query = parameters.toString();
  return `/api/questions${query ? `?${query}` : ""}`;
}

function applyQuestionData(nextQuestions, { version = null, fetchedAt = null, fromCache = false } = {}) {
  const previousId = state.currentId;
  state.questions = nextQuestions;
  state.questionVersion = version;
  state.questionFetchedAt = fetchedAt;
  if (!state.questions.some((item) => item.category === state.selectedCategory)) state.selectedCategory = "すべて";
  state.currentId = state.questions.some((item) => item.id === previousId) ? previousId : filteredQuestions()[0]?.id;
  renderHome();
  if (!elements.topicScreen.hidden && state.selectedCourse) renderTopicScreen(state.selectedCourse);
  if (!elements.practiceScreen.hidden && state.selectedCourse) renderAll();

  const label = nextQuestions.length
    ? `${fromCache ? "保存済み" : "同期済み"} ${formatTime(fetchedAt)}`
    : state.source ? "問題0件" : "スプシ未接続";
  setSyncState("online", label);
}

async function restoreQuestionsFromCache() {
  try {
    const cached = await loadQuestionCache(state.source);
    if (!cached) return false;
    state.cacheLoaded = true;
    applyQuestionData(cached.questions, {
      version: cached.version,
      fetchedAt: cached.fetchedAt,
      fromCache: true
    });
    return true;
  } catch (error) {
    console.warn("問題キャッシュを読み込めませんでした", error);
    return false;
  }
}

async function syncQuestions({ quiet = false, force = false, checkVersion = false } = {}) {
  if (state.syncing) return;
  state.syncing = true;
  elements.syncButton.classList.add("syncing");
  if (!quiet) setSyncState("syncing", "同期中...");
  try {
    if (checkVersion && state.questionVersion && !force) {
      const versionResponse = await fetch(buildQuestionsUrl({ mode: "version" }), { cache: "default" });
      const versionPayload = await versionResponse.json();
      if (!versionResponse.ok) throw new Error(versionPayload.error || "更新確認に失敗しました");
      if (versionPayload.version === state.questionVersion) {
        setSyncState("online", state.questions.length ? `保存済み・最新 ${formatTime(versionPayload.fetchedAt)}` : state.source ? "問題0件" : "スプシ未接続");
        return;
      }
      force = true;
    }

    const previousQuestions = state.questions;
    const previousVersion = state.questionVersion;
    const response = await fetch(buildQuestionsUrl({ force }), { cache: force ? "no-store" : "default" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "同期に失敗しました");
    const nextQuestions = payload.type === "json" ? normalizeJSON(payload.data) : rowsToQuestions(parseCSV(payload.data));
    const changed = previousQuestions.length > 0 && (
      previousVersion && payload.version
        ? previousVersion !== payload.version
        : hashQuestions(previousQuestions) !== hashQuestions(nextQuestions)
    );

    applyQuestionData(nextQuestions, { version: payload.version, fetchedAt: payload.fetchedAt });
    try {
      await saveQuestionCache(state.source, {
        version: payload.version,
        fetchedAt: payload.fetchedAt,
        questions: nextQuestions
      });
      state.cacheLoaded = true;
    } catch (cacheError) {
      console.warn("問題キャッシュを保存できませんでした", cacheError);
    }
    if (!quiet) showToast(`${nextQuestions.length}問を読み込みました`);
    if (changed) {
      elements.questionCard.classList.add("updating");
      setTimeout(() => elements.questionCard.classList.remove("updating"), 400);
    }
  } catch (error) {
    if (state.cacheLoaded) {
      setSyncState("online", state.questionFetchedAt ? `保存済み ${formatTime(state.questionFetchedAt)}` : "保存済みデータ");
    } else {
      setSyncState("error", "同期エラー");
    }
    if (state.questions.length === 0) renderHome();
    if (!quiet || state.questions.length === 0) showToast(error.message, true);
  } finally {
    state.syncing = false;
    elements.syncButton.classList.remove("syncing");
  }
}

function setSyncState(status, label) {
  elements.syncIndicator.className = `sync-indicator ${status}`;
  elements.syncLabel.textContent = label;
}

function formatTime(iso) {
  return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
}

let toastTimer;
function showToast(message, error = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `toast show${error ? " error" : ""}`;
  toastTimer = setTimeout(() => { elements.toast.className = "toast"; }, 2800);
}

elements.revealButton.addEventListener("click", revealAnswers);
elements.previousButton.addEventListener("click", () => moveQuestion(-1));
elements.jumpButton.addEventListener("click", openJumpDialog);
elements.skipButton.addEventListener("click", skipQuestion);
elements.nextButton.addEventListener("click", handleNextQuestion);
elements.mistakeButton.addEventListener("click", correctAccidentalTap);
elements.syncButton.addEventListener("click", () => syncQuestions({ force: true }));
elements.settingsButton.addEventListener("click", () => {
  elements.sourceInput.value = state.source;
  elements.settingsDialog.showModal();
});
elements.saveSettingsButton.addEventListener("click", (event) => {
  event.preventDefault();
  if (elements.sourceInput.value && !elements.sourceInput.checkValidity()) {
    elements.sourceInput.reportValidity();
    return;
  }
  state.source = elements.sourceInput.value.trim();
  localStorage.setItem("loopnote-source", state.source);
  state.cacheLoaded = false;
  state.questionVersion = null;
  state.questionFetchedAt = null;
  elements.settingsDialog.close();
  resetCurrentState();
  syncQuestions({ force: true });
});
elements.jumpForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!elements.jumpNumberInput.checkValidity()) {
    elements.jumpNumberInput.reportValidity();
    return;
  }
  if (jumpToQuestionNumber(elements.jumpNumberInput.value)) elements.jumpDialog.close();
});
elements.jumpCloseButton.addEventListener("click", () => elements.jumpDialog.close());
elements.jumpCancelButton.addEventListener("click", () => elements.jumpDialog.close());
elements.resetButton.addEventListener("click", () => {
  state.answered.clear();
  saveAnswered();
  renderProgress();
  renderHome();
  showToast("進捗をリセットしました");
});
elements.homeButton.addEventListener("click", showHome);
elements.resumeSessionButton.addEventListener("click", resumeActiveSession);
elements.topicBackButton.addEventListener("click", showHome);
elements.retryButton.addEventListener("click", retryCurrentSession);
elements.resultHomeButton.addEventListener("click", showHome);
elements.shuffleButton.addEventListener("click", startShuffle);
elements.mistakesModeButton.addEventListener("click", startMistakesMode);
elements.rangeReviewButton.addEventListener("click", openRangeReviewDialog);
elements.reviewStartDate.addEventListener("input", updateRangeReviewCount);
elements.reviewEndDate.addEventListener("input", updateRangeReviewCount);
elements.reviewCourseSelect.addEventListener("change", updateRangeReviewCount);
elements.rangeReviewForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!updateRangeReviewCount().length) return;
  const startDate = elements.reviewStartDate.value;
  const endDate = elements.reviewEndDate.value;
  const course = elements.reviewCourseSelect.value;
  elements.rangeReviewDialog.close();
  startDateRangeReview(startDate, endDate, course);
});
elements.rangeReviewCloseButton.addEventListener("click", () => elements.rangeReviewDialog.close());
elements.rangeReviewCancelButton.addEventListener("click", () => elements.rangeReviewDialog.close());
elements.historyButton.addEventListener("click", showHistory);
elements.emptySettingsButton.addEventListener("click", () => elements.settingsButton.click());
elements.homeResetButton.addEventListener("click", () => {
  if (!window.confirm("進捗と回答履歴をすべて削除しますか？\nスプレッドシートの接続設定は残ります。")) return;
  resetLearningMemory();
});
elements.clearHistoryButton.addEventListener("click", () => {
  if (!window.confirm("回答履歴をすべて削除しますか？")) return;
  state.history = [];
  state.mistakeLog = [];
  localStorage.removeItem("loopnote-history");
  localStorage.removeItem(MISTAKE_LOG_KEY);
  renderHistory();
  renderHome();
});
document.querySelector(".brand").addEventListener("click", (event) => {
  event.preventDefault();
  showHome();
});
document.addEventListener("keydown", (event) => {
  if (elements.settingsDialog.open || elements.jumpDialog.open || elements.rangeReviewDialog.open || elements.practiceScreen.hidden) return;
  if (event.key === "ArrowLeft") moveQuestion(-1);
  if (event.key === "ArrowRight" && state.graded) handleNextQuestion();
});
window.addEventListener("pagehide", () => {
  if (!elements.practiceScreen.hidden) persistActiveSession();
});

localStorage.removeItem("loopnote-interval");
async function initializeQuestions() {
  const restored = await restoreQuestionsFromCache();
  await syncQuestions({ quiet: true, checkVersion: restored });
}

initializeQuestions();
