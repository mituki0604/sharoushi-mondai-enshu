import { loadQuestionCache, saveQuestionCache } from "./question-cache.js?v=20260927-1";

const baseAliases = {
  id: ["id", "問題番号", "番号", "no"],
  learning: ["learning", "学習", "学習区分", "大分類"],
  course: ["course", "科目", "コース"],
  unit: ["unit", "単元", "章", "分野"],
  theme: ["theme", "テーマ"],
  type: ["type", "種類", "問題種類", "区分"],
  legacyTopic: ["topic", "論点"],
  question: ["question", "問題", "問題文"],
  answer: ["answer", "回答", "正解"],
  explanation: ["explanation", "解説"]
};

const TRUE_VALUES = new Set(["○", "◯", "〇"]);
const FALSE_VALUES = new Set(["×", "✕", "✖"]);
const DATA_VERSION = "simple-sheet-v1";
const ACTIVE_SESSION_KEY = "loopnote-active-session";
const MISTAKE_LOG_KEY = "loopnote-mistake-log";
const QUESTION_NOTES_KEY = "loopnote-question-notes";
const DEFAULT_SHEET_SOURCE = "https://docs.google.com/spreadsheets/d/1Y8b0slGZfp0psWOHnpG6X7O76juEUuPKV3EMo9iMFuw/edit?gid=0";
const SOURCE_CONFIG_VERSION = "three-layer-sheet-v1";

function loadQuestionNotes() {
  try {
    const notes = JSON.parse(localStorage.getItem(QUESTION_NOTES_KEY) || "{}");
    return notes && typeof notes === "object" && !Array.isArray(notes) ? notes : {};
  } catch {
    return {};
  }
}

if (localStorage.getItem("loopnote-data-version") !== DATA_VERSION) {
  localStorage.removeItem("loopnote-answered");
  localStorage.removeItem("loopnote-history");
  localStorage.removeItem(MISTAKE_LOG_KEY);
  localStorage.setItem("loopnote-data-version", DATA_VERSION);
}

if (localStorage.getItem("loopnote-source-config-version") !== SOURCE_CONFIG_VERSION) {
  localStorage.setItem("loopnote-source", DEFAULT_SHEET_SOURCE);
  localStorage.setItem("loopnote-source-config-version", SOURCE_CONFIG_VERSION);
}

const LEARNINGS = [
  {
    id: "模試・問題集",
    number: "01",
    kicker: "MOCK EXAMS & BOOKS",
    description: "模試や問題集を、科目・単元・テーマで絞って演習。",
    className: "mock-exams"
  },
  {
    id: "白書・統計",
    number: "02",
    kicker: "DATA & WHITE PAPER",
    description: "白書・労働経済・社会保障統計を、定義と傾向から確認。",
    className: "white-papers"
  },
  {
    id: "罰則",
    number: "03",
    kicker: "PENALTIES",
    description: "各法律の罰則を、科目ごとに整理して確認。",
    className: "penalties"
  },
  {
    id: "数字",
    number: "04",
    kicker: "NUMBERS & LIMITS",
    description: "日数・期間・率・上限を、テンポよく反復。",
    className: "numbers",
    skipTypeSelection: true
  },
  {
    id: "過去問",
    number: "05",
    kicker: "PAST EXAMS",
    description: "本試験の過去問を、科目・単元・テーマで絞って演習。",
    className: "past-exams"
  }
];

const state = {
  questions: [],
  sessionQuestions: [],
  selectedLearning: null,
  selectedCourse: null,
  selectedUnit: null,
  selectedTopic: null,
  selectedTypes: [],
  sessionShuffle: false,
  rememberAnswers: true,
  reviewScope: null,
  reviewDialogMode: "range",
  selectedCategory: "すべて",
  currentId: null,
  selections: new Map(),
  gradedChoices: new Set(),
  graded: false,
  revealed: false,
  enteredAnswer: "",
  syncing: false,
  cacheLoaded: false,
  questionVersion: null,
  questionFetchedAt: null,
  source: localStorage.getItem("loopnote-source") || "",
  answered: new Set(JSON.parse(localStorage.getItem("loopnote-answered") || "[]")),
  sessionResults: new Map(),
  sessionAnswers: new Map(),
  history: JSON.parse(localStorage.getItem("loopnote-history") || "[]"),
  mistakeLog: JSON.parse(localStorage.getItem(MISTAKE_LOG_KEY) || "[]"),
  questionNotes: loadQuestionNotes(),
  timerElapsedMs: 0,
  timerStartedAt: null,
  timerRunning: false,
  timerManuallyPaused: false,
  timerAwayStartedAt: null,
  timerAwayElapsedMs: 0,
  timerAwayDecisionPending: false,
  timerIntervalId: null
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
  subjectScreen: $("#subjectScreen"),
  unitScreen: $("#unitScreen"),
  topicScreen: $("#topicScreen"),
  practiceScreen: $("#practiceScreen"),
  resultScreen: $("#resultScreen"),
  historyScreen: $("#historyScreen"),
  courseGrid: $("#courseGrid"),
  subjectLearningLabel: $("#subjectLearningLabel"),
  subjectTitle: $("#subjectTitle"),
  subjectGrid: $("#subjectGrid"),
  subjectBackButton: $("#subjectBackButton"),
  unitLearningLabel: $("#unitLearningLabel"),
  unitTitle: $("#unitTitle"),
  unitGrid: $("#unitGrid"),
  unitBackButton: $("#unitBackButton"),
  resumePanel: $("#resumePanel"),
  resumeSessionButton: $("#resumeSessionButton"),
  resumeSessionTitle: $("#resumeSessionTitle"),
  resumeSessionProgress: $("#resumeSessionProgress"),
  topicCourseLabel: $("#topicCourseLabel"),
  topicTitle: $("#topicTitle"),
  topicDescription: $("#topicDescription"),
  typeSelectionToolbar: $("#typeSelectionToolbar"),
  topicGrid: $("#topicGrid"),
  topicBackButton: $("#topicBackButton"),
  selectAllTypes: $("#selectAllTypes"),
  typeSelectionCount: $("#typeSelectionCount"),
  selectedTypesStartButton: $("#selectedTypesStartButton"),
  selectedTypesShuffleButton: $("#selectedTypesShuffleButton"),
  selectedTypesReviewButton: $("#selectedTypesReviewButton"),
  homeProgressText: $("#homeProgressText"),
  homeProgressBar: $("#homeProgressBar"),
  homeResetButton: $("#homeResetButton"),
  homeButton: $("#homeButton"),
  resultCourse: $("#resultCourse"),
  resultScore: $("#resultScore"),
  resultCount: $("#resultCount"),
  resultElapsedTime: $("#resultElapsedTime"),
  resultAverageTime: $("#resultAverageTime"),
  resultRateBar: $("#resultRateBar"),
  resultComment: $("#resultComment"),
  resultMistakesButton: $("#resultMistakesButton"),
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
  sheetQuestionNumber: $("#sheetQuestionNumber"),
  difficultyBadge: $("#difficultyBadge"),
  sessionAccuracyBadge: $("#sessionAccuracyBadge"),
  sessionTimer: $("#sessionTimer"),
  sessionTimerValue: $("#sessionTimerValue"),
  sessionTimerToggle: $("#sessionTimerToggle"),
  timerPausedOverlay: $("#timerPausedOverlay"),
  timerPausedValue: $("#timerPausedValue"),
  timerAwayOverlay: $("#timerAwayOverlay"),
  timerAwayValue: $("#timerAwayValue"),
  timerAwayExcludeButton: $("#timerAwayExcludeButton"),
  timerAwayIncludeButton: $("#timerAwayIncludeButton"),
  previousButton: $("#previousButton"),
  jumpButton: $("#jumpButton"),
  skipButton: $("#skipButton"),
  questionText: $("#questionText"),
  questionHint: $("#questionHint"),
  answerForm: $("#answerForm"),
  choiceList: $("#choiceList"),
  cardActions: $("#cardActions"),
  resultMessage: $("#resultMessage"),
  answerExplanation: $("#answerExplanation"),
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
  reviewDialogEyebrow: $("#reviewDialogEyebrow"),
  reviewDialogTitle: $("#reviewDialogTitle"),
  reviewDialogCopy: $("#reviewDialogCopy"),
  reviewDateFields: $("#reviewDateFields"),
  reviewLearningSelect: $("#reviewLearningSelect"),
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

function parseNumericAnswer(value) {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  return /^[0-9]{1,20}$/.test(normalized) ? normalized : null;
}

function choiceAliases(index, field) {
  if (field === "text") return [`choice${index}`, `statement${index}`, `肢${index}`, `選択肢${index}`];
  if (field === "correct") return [`answer${index}`, `correct${index}`, `正解${index}`, `回答${index}`];
  return [`explanation${index}`, `commentary${index}`, `解説${index}`];
}

function normalizeLearning(value) {
  const compact = String(value || "").normalize("NFKC").trim().replace(/^[①②③④⑤1-5][.．、)]?/, "").replace(/[・\s]/g, "");
  if (["模試問題集", "模試", "問題集", "主要科目"].includes(compact)) return "模試・問題集";
  if (["白書統計", "白書", "統計"].includes(compact)) return "白書・統計";
  if (compact === "罰則") return "罰則";
  if (["数字", "数字に関する問題"].includes(compact)) return "数字";
  if (["過去問", "過去問題", "本試験過去問"].includes(compact)) return "過去問";
  return String(value || "").normalize("NFKC").trim();
}

function normalizeCourse(value) {
  return String(value || "").normalize("NFKC").trim() || "共通";
}

function normalizeType(value) {
  return String(value || "").normalize("NFKC").trim() || "標準テーマ";
}

function normalizeUnit(value) {
  return String(value || "").normalize("NFKC").trim() || "標準単元";
}

function inferLegacyLearning(course) {
  const compact = String(course || "").normalize("NFKC").trim().replace(/[・\s]/g, "");
  if (compact === "白書統計") return "白書・統計";
  if (compact === "罰則") return "罰則";
  if (compact === "数字" || compact === "数字に関する問題") return "数字";
  return "模試・問題集";
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

function createQuestion({ id, learning, course, unit, theme, type, topic, question, answer, explanation }) {
  const normalizedCourse = normalizeCourse(course);
  const normalizedLearning = normalizeLearning(learning) || inferLegacyLearning(normalizedCourse);
  const normalizedUnit = normalizeUnit(unit);
  const normalizedType = normalizeType(theme ?? type ?? topic);
  const text = String(question || "").trim();
  if (!id || !normalizedLearning || !normalizedCourse || !text) return null;

  const answerText = String(answer ?? "").trim();
  const correct = typeof answer === "boolean" ? answer : parseCorrect(answer);
  const numericCorrect = parseNumericAnswer(answerText);
  if (!answerText || numericCorrect !== null) {
    return {
      id: String(id).trim(),
      sourceNumber: String(id).trim(),
      learning: normalizedLearning,
      course: normalizedCourse,
      unit: normalizedUnit,
      theme: normalizedType,
      type: normalizedType,
      topic: normalizedType,
      category: normalizedType,
      mode: "numeric-entry",
      difficulty: numericCorrect === null ? "正解未登録" : "数字入力",
      question: text,
      context: `${normalizedLearning} / ${normalizedCourse} / ${normalizedUnit} / ${normalizedType}`,
      hint: "",
      choices: [{ text, correct: numericCorrect, explanation: String(explanation || "").trim() }]
    };
  }
  if (correct === null) {
    return {
      id: String(id).trim(),
      sourceNumber: String(id).trim(),
      learning: normalizedLearning,
      course: normalizedCourse,
      unit: normalizedUnit,
      theme: normalizedType,
      type: normalizedType,
      topic: normalizedType,
      category: normalizedType,
      mode: "self-assessment",
      difficulty: "自己採点",
      question: text,
      context: `${normalizedLearning} / ${normalizedCourse} / ${normalizedUnit} / ${normalizedType}`,
      hint: "",
      choices: [{ text, correct: answerText, explanation: String(explanation || "").trim() }]
    };
  }
  return {
    id: String(id).trim(),
    sourceNumber: String(id).trim(),
    learning: normalizedLearning,
    course: normalizedCourse,
    unit: normalizedUnit,
    theme: normalizedType,
    type: normalizedType,
    topic: normalizedType,
    category: normalizedType,
    mode: "true-false",
    difficulty: "○×",
    question: text,
    context: `${normalizedLearning} / ${normalizedCourse} / ${normalizedUnit} / ${normalizedType}`,
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
  const usesThreeLayerFormat = indexes.unit >= 0 || indexes.theme >= 0;
  const usesLearningFormat = usesThreeLayerFormat || indexes.learning >= 0 || indexes.type >= 0;
  const required = usesThreeLayerFormat
    ? ["id", "course", "unit", "theme", "question", "answer", "explanation"]
    : usesLearningFormat
      ? ["id", "learning", "course", "type", "question", "answer", "explanation"]
    : ["id", "course", "legacyTopic", "question", "answer", "explanation"];
  const missing = required.filter((key) => indexes[key] < 0);
  if (missing.length) throw new Error("列は左から「問題番号・科目・単元・テーマ・問題文・回答・解説」にしてください");

  return ensureUniqueQuestionIds(rows.slice(1).map((row) => createQuestion({
    id: row[indexes.id],
    learning: usesThreeLayerFormat
      ? indexes.learning >= 0 ? row[indexes.learning] : "過去問"
      : usesLearningFormat ? row[indexes.learning] : inferLegacyLearning(row[indexes.course]),
    course: row[indexes.course],
    unit: usesThreeLayerFormat ? row[indexes.unit] : "標準単元",
    theme: usesThreeLayerFormat
      ? row[indexes.theme]
      : usesLearningFormat ? row[indexes.type] : row[indexes.legacyTopic],
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
    learning: item.learning ?? item["学習"],
    course: item.course ?? item["科目"],
    unit: item.unit ?? item["単元"],
    theme: item.theme ?? item["テーマ"] ?? item.type ?? item["種類"] ?? item.topic ?? item["論点"],
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
  state.enteredAnswer = "";
  elements.resultMessage.hidden = true;
  elements.answerExplanation.hidden = true;
  elements.answerExplanation.replaceChildren();
}

function saveCurrentQuestionState() {
  if (!state.currentId) return;
  state.sessionAnswers.set(state.currentId, {
    selections: new Map(state.selections),
    gradedChoices: new Set(state.gradedChoices),
    graded: state.graded,
    revealed: state.revealed,
    enteredAnswer: state.enteredAnswer
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
  state.enteredAnswer = String(saved.enteredAnswer || "");
  elements.resultMessage.hidden = true;
  elements.answerExplanation.hidden = true;
  elements.answerExplanation.replaceChildren();
}

function sessionElapsedMs() {
  const activeSegment = state.timerRunning && state.timerStartedAt !== null
    ? Date.now() - state.timerStartedAt
    : 0;
  return Math.max(0, state.timerElapsedMs + activeSegment);
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

function formatAverageDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "--";
  if (milliseconds < 60000) return `${(milliseconds / 1000).toFixed(1)}秒`;
  return formatDuration(milliseconds);
}

function normalizeMultilineText(value) {
  return String(value ?? "").replace(/\r\n?|\u2028|\u2029/g, "\n");
}

function preserveVisibleBlankLines(value) {
  return normalizeMultilineText(value)
    .split("\n")
    .map((line) => line.trim() === "" ? "\u00a0" : line)
    .join("\n");
}

function normalizeNumericEntry(value) {
  return String(value ?? "").normalize("NFKC").replace(/[^0-9]/g, "").slice(0, 20);
}

function canonicalNumericAnswer(value) {
  return normalizeNumericEntry(value).replace(/^0+(?=\d)/, "");
}

function formatLongQuestionClause(sentence) {
  const characters = Array.from(sentence);
  if (characters.length < 56) return sentence;
  let lineLength = 0;
  return characters.map((character, index) => {
    lineLength += 1;
    const remaining = characters.length - index - 1;
    if (["、", "；", "："].includes(character) && lineLength >= 28 && remaining >= 12) {
      lineLength = 0;
      return `${character}\n`;
    }
    return character;
  }).join("");
}

function formatQuestionText(value) {
  const source = normalizeMultilineText(value);
  const characterCount = Array.from(source.replace(/\s/g, "")).length;
  if (characterCount < 36) return preserveVisibleBlankLines(source);
  const formatted = source.split("\n").map((paragraph) => {
    if (!paragraph.trim()) return "";
    return paragraph.trim()
      .replace(/([。！？]+[」』）】〕〉》]*)(?:[ \t]+)?(?=\S)/gu, "$1\n")
      .split("\n")
      .map(formatLongQuestionClause)
      .join("\n");
  }).join("\n");
  return preserveVisibleBlankLines(formatted);
}

function timerAwayElapsedMs() {
  const activeAwaySegment = state.timerAwayStartedAt !== null
    ? Date.now() - state.timerAwayStartedAt
    : 0;
  return Math.max(0, state.timerAwayElapsedMs + activeAwaySegment);
}

function renderSessionTimer() {
  if (!elements.sessionTimerValue || !elements.sessionTimerToggle) return;
  const elapsedText = formatDuration(sessionElapsedMs());
  const practiceVisible = !elements.practiceScreen.hidden;
  const showAwayOverlay = state.timerAwayDecisionPending && practiceVisible;
  const showPausedOverlay = state.timerManuallyPaused && !showAwayOverlay && practiceVisible;
  elements.sessionTimerValue.textContent = elapsedText;
  elements.sessionTimer.classList.toggle("paused", !state.timerRunning);
  elements.sessionTimerToggle.textContent = state.timerRunning ? "ストップ" : "スタート";
  elements.sessionTimerToggle.setAttribute("aria-pressed", String(!state.timerRunning));
  elements.sessionTimerToggle.setAttribute(
    "aria-label",
    state.timerRunning ? "ストップウォッチを停止" : "ストップウォッチをスタート"
  );
  elements.timerPausedValue.textContent = elapsedText;
  elements.timerPausedOverlay.hidden = !showPausedOverlay;
  elements.timerAwayValue.textContent = formatDuration(timerAwayElapsedMs());
  elements.timerAwayOverlay.hidden = !showAwayOverlay;
  document.body.classList.toggle("timer-paused", showPausedOverlay || showAwayOverlay);
}

function stopSessionTimerTicker() {
  if (state.timerIntervalId !== null) window.clearInterval(state.timerIntervalId);
  state.timerIntervalId = null;
}

function startSessionTimerTicker() {
  stopSessionTimerTicker();
  state.timerIntervalId = window.setInterval(renderSessionTimer, 250);
}

function pauseSessionTimer({ manual = false } = {}) {
  if (manual) state.timerManuallyPaused = true;
  if (state.timerRunning) state.timerElapsedMs = sessionElapsedMs();
  state.timerStartedAt = null;
  state.timerRunning = false;
  stopSessionTimerTicker();
  renderSessionTimer();
}

function resumeSessionTimer({ manual = false } = {}) {
  if (state.timerAwayDecisionPending) {
    renderSessionTimer();
    return;
  }
  if (manual) state.timerManuallyPaused = false;
  if (
    state.timerRunning
    || state.timerManuallyPaused
    || document.hidden
    || elements.practiceScreen.hidden
    || !state.sessionQuestions.length
  ) {
    renderSessionTimer();
    return;
  }
  state.timerStartedAt = Date.now();
  state.timerRunning = true;
  renderSessionTimer();
  startSessionTimerTicker();
}

function resumeSessionTimerFromActivity() {
  if (!state.timerRunning && !state.timerAwayDecisionPending) resumeSessionTimer({ manual: true });
}

function beginTimerAwayPeriod() {
  if (elements.practiceScreen.hidden || !state.sessionQuestions.length) return;
  const now = Date.now();
  if (state.timerAwayDecisionPending) {
    if (state.timerAwayStartedAt === null) state.timerAwayStartedAt = now;
    stopSessionTimerTicker();
    renderSessionTimer();
    persistActiveSession();
    return;
  }
  if (!state.timerRunning || state.timerManuallyPaused) {
    persistActiveSession();
    return;
  }
  if (state.timerStartedAt !== null) {
    state.timerElapsedMs += Math.max(0, now - state.timerStartedAt);
  }
  state.timerStartedAt = null;
  state.timerRunning = false;
  state.timerAwayStartedAt = now;
  state.timerAwayElapsedMs = 0;
  state.timerAwayDecisionPending = true;
  stopSessionTimerTicker();
  renderSessionTimer();
  persistActiveSession();
}

function finishTimerAwayPeriod() {
  if (!state.timerAwayDecisionPending) return;
  if (state.timerAwayStartedAt !== null) {
    state.timerAwayElapsedMs += Math.max(0, Date.now() - state.timerAwayStartedAt);
    state.timerAwayStartedAt = null;
  }
  renderSessionTimer();
}

function resolveTimerAwayPeriod(includeAwayTime) {
  if (!state.timerAwayDecisionPending) return;
  finishTimerAwayPeriod();
  if (includeAwayTime) state.timerElapsedMs += state.timerAwayElapsedMs;
  state.timerAwayStartedAt = null;
  state.timerAwayElapsedMs = 0;
  state.timerAwayDecisionPending = false;
  state.timerManuallyPaused = false;
  resumeSessionTimer({ manual: true });
  persistActiveSession();
}

function resetSessionTimer() {
  stopSessionTimerTicker();
  state.timerElapsedMs = 0;
  state.timerStartedAt = null;
  state.timerRunning = false;
  state.timerManuallyPaused = false;
  state.timerAwayStartedAt = null;
  state.timerAwayElapsedMs = 0;
  state.timerAwayDecisionPending = false;
  resumeSessionTimer();
}

function restoreSessionTimer(saved) {
  stopSessionTimerTicker();
  const savedElapsedMs = Number.isFinite(saved.timerElapsedMs) ? Math.max(0, saved.timerElapsedMs) : 0;
  const savedManualPause = saved.timerManuallyPaused === true;
  const savedAtMs = Number.isFinite(saved.timerSavedAt) ? saved.timerSavedAt : null;
  let awayElapsedMs = Number.isFinite(saved.timerAwayElapsedMs) ? Math.max(0, saved.timerAwayElapsedMs) : 0;
  let awayStartedAt = Number.isFinite(saved.timerAwayStartedAt) ? saved.timerAwayStartedAt : null;
  let awayDecisionPending = saved.timerAwayDecisionPending === true && !savedManualPause;
  if (!savedManualPause && !awayDecisionPending && saved.timerWasRunning === true && savedAtMs !== null) {
    awayDecisionPending = true;
    awayStartedAt = savedAtMs;
  }
  if (awayDecisionPending && awayStartedAt !== null) {
    awayElapsedMs += Math.max(0, Date.now() - awayStartedAt);
    awayStartedAt = null;
  }
  state.timerElapsedMs = savedElapsedMs;
  state.timerStartedAt = null;
  state.timerRunning = false;
  state.timerManuallyPaused = savedManualPause;
  state.timerAwayStartedAt = awayStartedAt;
  state.timerAwayElapsedMs = awayElapsedMs;
  state.timerAwayDecisionPending = awayDecisionPending;
  if (awayDecisionPending) renderSessionTimer();
  else resumeSessionTimer();
}

function clearSessionTimerState() {
  stopSessionTimerTicker();
  state.timerElapsedMs = 0;
  state.timerStartedAt = null;
  state.timerRunning = false;
  state.timerManuallyPaused = false;
  state.timerAwayStartedAt = null;
  state.timerAwayElapsedMs = 0;
  state.timerAwayDecisionPending = false;
  renderSessionTimer();
}

function clearActiveSession() {
  localStorage.removeItem(ACTIVE_SESSION_KEY);
  if (elements.resumePanel) elements.resumePanel.hidden = true;
}

function readActiveSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACTIVE_SESSION_KEY) || "null");
    if (!saved || ![1, 2, 3, 4, 5].includes(saved.version) || !Array.isArray(saved.questionIds)) return null;
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
  const timerElapsedSnapshot = sessionElapsedMs();
  const timerSavedAt = Date.now();
  const sessionAnswers = [...state.sessionAnswers.entries()].map(([id, saved]) => [id, {
    selections: [...saved.selections.entries()],
    gradedChoices: [...saved.gradedChoices],
    graded: saved.graded,
    revealed: saved.revealed,
    enteredAnswer: saved.enteredAnswer
  }]);
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
    version: 5,
    source: state.source,
    selectedLearning: state.selectedLearning,
    selectedCourse: state.selectedCourse,
    selectedUnit: state.selectedUnit,
    selectedTopic: state.selectedTopic,
    selectedTypes: state.selectedTypes,
    sessionShuffle: state.sessionShuffle,
    rememberAnswers: state.rememberAnswers,
    reviewScope: state.reviewScope,
    questionIds: state.sessionQuestions.map((question) => question.id),
    currentId: state.currentId,
    sessionResults: [...state.sessionResults.entries()],
    sessionAnswers,
    timerElapsedMs: timerElapsedSnapshot,
    timerManuallyPaused: state.timerManuallyPaused,
    timerWasRunning: state.timerRunning,
    timerSavedAt,
    timerAwayStartedAt: state.timerAwayStartedAt,
    timerAwayElapsedMs: state.timerAwayElapsedMs,
    timerAwayDecisionPending: state.timerAwayDecisionPending,
    savedAt: new Date(timerSavedAt).toISOString()
  }));
}

function formatSavedSessionTitle(saved) {
  const savedTypes = Array.isArray(saved.selectedTypes)
    ? saved.selectedTypes
    : saved.selectedTopic && saved.selectedTopic !== "すべて" ? [saved.selectedTopic] : [];
  const typeText = savedTypes.length === 1 ? ` / ${savedTypes[0]}` : savedTypes.length > 1 ? ` / ${savedTypes.length}テーマ` : "";
  const unitText = saved.selectedUnit ? ` / ${saved.selectedUnit}` : "";
  if (saved.selectedCourse === "シャッフル演習") return "全科目シャッフル";
  if (saved.selectedCourse === "前回の誤答") {
    return saved.selectedLearning ? `${saved.selectedLearning} / 前回の誤答` : "前回の誤答";
  }
  if (saved.reviewScope?.type === "range") {
    const learning = saved.reviewScope.learning === "すべて" || !saved.reviewScope.learning
      ? "全学習"
      : saved.reviewScope.learning;
    const course = saved.reviewScope.course === "すべて" ? "全科目" : saved.reviewScope.course;
    return `${saved.reviewScope.startDate.replaceAll("-", "/")}〜${saved.reviewScope.endDate.replaceAll("-", "/")} / ${learning} / ${course}`;
  }
  const learning = saved.selectedLearning ? `${saved.selectedLearning} / ` : "";
  if (saved.rememberAnswers === false) return `${learning}${saved.selectedCourse}${unitText}${typeText}（復習）`;
  return `${learning}${saved.selectedCourse}${unitText}${typeText}${saved.sessionShuffle ? "（シャッフル）" : ""}`;
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

  state.selectedLearning = saved.selectedLearning || sessionQuestions[0]?.learning || null;
  state.selectedCourse = saved.selectedCourse;
  state.selectedUnit = saved.selectedUnit || sessionQuestions[0]?.unit || null;
  state.selectedTypes = Array.isArray(saved.selectedTypes)
    ? saved.selectedTypes
    : saved.selectedTopic && saved.selectedTopic !== "すべて" ? [saved.selectedTopic] : [];
  state.selectedTopic = state.selectedTypes.length === 1 ? state.selectedTypes[0] : "すべて";
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
      revealed: savedAnswer.revealed === true,
      enteredAnswer: String(savedAnswer.enteredAnswer || "")
    }];
  }));
  const remaining = sessionQuestions.find((question) => !state.sessionResults.has(question.id));
  state.currentId = sessionQuestions.some((question) => question.id === saved.currentId)
    ? saved.currentId
    : remaining?.id || sessionQuestions[0].id;
  restoreQuestionState(state.currentId);
  elements.homeScreen.hidden = true;
  elements.subjectScreen.hidden = true;
  elements.unitScreen.hidden = true;
  elements.topicScreen.hidden = true;
  elements.resultScreen.hidden = true;
  elements.historyScreen.hidden = true;
  elements.practiceScreen.hidden = false;
  elements.homeButton.hidden = false;
  restoreSessionTimer(saved);
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setCurrent(id) {
  resumeSessionTimerFromActivity();
  saveCurrentQuestionState();
  state.currentId = id;
  restoreQuestionState(id);
  renderQuestion();
  renderProgress();
  persistActiveSession();
}

function formatTypesLabel(types = state.selectedTypes) {
  const selected = Array.isArray(types) ? types.filter(Boolean) : [];
  if (!selected.length) return "すべてのテーマ";
  if (selected.length === 1) return selected[0];
  return `${selected.length}テーマ`;
}

function renderCategories() {
  const questions = activeQuestions();
  const item = document.createElement("div");
  item.className = "category-item active";
  const label = document.createElement("span");
  label.textContent = formatTypesLabel();
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
    feedback.append(verdict, createQuestionHistory(currentQuestion().id));
    item.append(feedback);
  }

  return item;
}

function questionNoteKey(question) {
  return JSON.stringify([state.source || "", String(question.id)]);
}

function getQuestionNote(question) {
  const saved = state.questionNotes[questionNoteKey(question)];
  if (typeof saved === "string") return saved;
  return typeof saved?.text === "string" ? saved.text : "";
}

function updateQuestionNote(question, text) {
  const key = questionNoteKey(question);
  const nextNotes = { ...state.questionNotes };
  if (text) nextNotes[key] = { text, updatedAt: new Date().toISOString() };
  else delete nextNotes[key];
  try {
    localStorage.setItem(QUESTION_NOTES_KEY, JSON.stringify(nextNotes));
    state.questionNotes = nextNotes;
    return true;
  } catch {
    showToast("付箋を保存できませんでした。端末の保存容量を確認してください", true);
    return false;
  }
}

function openQuestionNoteEditor(section, question) {
  const savedNote = getQuestionNote(question);
  section.replaceChildren();
  const label = document.createElement("label");
  label.className = "question-note-editor-label";
  label.textContent = savedNote ? "付箋を編集" : "付箋を登録";
  const textarea = document.createElement("textarea");
  textarea.className = "question-note-textarea";
  textarea.maxLength = 1000;
  textarea.placeholder = "覚えておきたいポイントや間違えた理由を入力";
  textarea.value = savedNote;
  textarea.setAttribute("aria-label", "この問題の付箋");
  const count = document.createElement("span");
  count.className = "question-note-count";
  const updateCount = () => { count.textContent = `${textarea.value.length} / 1000`; };
  textarea.addEventListener("input", updateCount);
  updateCount();

  const actions = document.createElement("div");
  actions.className = "question-note-editor-actions";
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "question-note-cancel-button";
  cancelButton.textContent = "キャンセル";
  cancelButton.addEventListener("click", () => renderQuestionNoteSection(section, question));
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "question-note-save-button";
  saveButton.textContent = "付箋を保存";
  saveButton.addEventListener("click", () => {
    const text = textarea.value.trim();
    if (!text) {
      showToast("付箋の内容を入力してください", true);
      textarea.focus();
      return;
    }
    if (!updateQuestionNote(question, text)) return;
    renderQuestionNoteSection(section, question);
    showToast("付箋を保存しました");
  });
  actions.append(cancelButton, saveButton);
  if (savedNote) {
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "question-note-delete-button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", () => {
      if (!window.confirm("この問題の付箋を削除しますか？")) return;
      if (!updateQuestionNote(question, "")) return;
      renderQuestionNoteSection(section, question);
      showToast("付箋を削除しました");
    });
    actions.prepend(deleteButton);
  }
  section.append(label, textarea, count, actions);
  requestAnimationFrame(() => textarea.focus());
}

function renderQuestionNoteSection(section, question) {
  const note = getQuestionNote(question);
  section.replaceChildren();
  section.className = "question-note";
  const header = document.createElement("div");
  header.className = "question-note-header";
  const title = document.createElement("strong");
  title.className = "question-note-title";
  title.textContent = "付箋";
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "question-note-edit-button";
  editButton.textContent = note ? "編集" : "付箋を登録";
  editButton.addEventListener("click", () => openQuestionNoteEditor(section, question));
  header.append(title, editButton);
  const body = document.createElement(note ? "div" : "p");
  body.className = note ? "question-note-body" : "question-note-empty";
  body.textContent = note || "この問題の付箋はまだありません。";
  section.append(header, body);
}

function renderAnswerExplanation(question) {
  elements.answerExplanation.replaceChildren();
  if (!question || !state.graded) {
    elements.answerExplanation.hidden = true;
    return;
  }

  const choice = question.choices[0];
  const title = document.createElement("strong");
  title.className = "answer-explanation-title";
  title.textContent = "解説";
  const body = document.createElement("div");
  body.className = "answer-explanation-text";
  body.textContent = preserveVisibleBlankLines(choice?.explanation || "解説はまだ登録されていません。");
  const noteSection = document.createElement("section");
  renderQuestionNoteSection(noteSection, question);
  elements.answerExplanation.append(title, body, noteSection);
  elements.answerExplanation.hidden = false;
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
      resumeSessionTimerFromActivity();
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
  answerPanel.append(answerLabel, answerText);
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

function createNumericEntryElement(question) {
  const choice = question.choices[0];
  const selected = state.selections.get(0);
  const item = document.createElement("section");
  item.className = "self-assessment numeric-entry";

  if (choice.correct === null) {
    item.classList.add("unconfigured");
    const warning = document.createElement("div");
    warning.className = "numeric-entry-warning";
    const title = document.createElement("strong");
    title.textContent = "正解の数字が未登録です";
    const detail = document.createElement("p");
    detail.textContent = "スプレッドシートの「回答」列に正解の数字を入力し、右上の更新ボタンで同期してください。";
    warning.append(title, detail);
    item.append(warning);
    return item;
  }

  if (!state.graded) {
    const form = document.createElement("form");
    form.className = "numeric-entry-form";
    const label = document.createElement("label");
    label.className = "numeric-entry-label";
    label.textContent = "数字で回答";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "numeric-entry-input";
    input.inputMode = "numeric";
    input.pattern = "[0-9]*";
    input.maxLength = 20;
    input.autocomplete = "off";
    input.enterKeyHint = "done";
    input.placeholder = "数字を入力";
    input.setAttribute("aria-label", "数字で回答");
    input.value = state.enteredAnswer;
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "numeric-entry-submit";
    submit.textContent = "回答する";
    submit.disabled = !state.enteredAnswer;
    const help = document.createElement("p");
    help.className = "numeric-entry-help";
    help.textContent = "半角・全角どちらでも入力できます";

    input.addEventListener("input", () => {
      const normalized = normalizeNumericEntry(input.value);
      if (input.value !== normalized) input.value = normalized;
      state.enteredAnswer = normalized;
      submit.disabled = !normalized;
      persistActiveSession();
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!state.enteredAnswer) return;
      resumeSessionTimerFromActivity();
      state.revealed = true;
      const isCorrect = canonicalNumericAnswer(state.enteredAnswer) === canonicalNumericAnswer(choice.correct);
      state.selections.set(0, isCorrect);
      state.gradedChoices.add(0);
      updateQuestionCompletion();
      requestAnimationFrame(() => {
        elements.answerForm.scrollTo({ top: elements.answerForm.scrollHeight, behavior: "smooth" });
      });
    });

    label.append(input);
    form.append(label, submit, help);
    item.append(form);
    return item;
  }

  const answerPanel = document.createElement("div");
  answerPanel.className = "self-answer-panel";
  const answerLabel = document.createElement("span");
  answerLabel.className = "self-answer-label";
  answerLabel.textContent = "入力した回答";
  const answerText = document.createElement("strong");
  answerText.className = "self-answer-text";
  answerText.textContent = state.enteredAnswer;
  answerPanel.append(answerLabel, answerText);
  item.append(answerPanel);

  item.classList.add(selected ? "correct" : "incorrect");
  const result = document.createElement("div");
  result.className = "self-assessment-result";
  result.textContent = selected ? "正解です" : `不正解です　正解：${choice.correct}`;
  item.append(result, createQuestionHistory(question.id));

  return item;
}

function renderQuestion() {
  const filtered = filteredQuestions();
  const question = currentQuestion();
  elements.choiceList.replaceChildren();

  if (!question) {
    elements.questionNumber.textContent = "NO QUESTIONS";
    elements.sheetQuestionNumber.textContent = "問題番号 --";
    elements.difficultyBadge.textContent = "—";
    elements.questionText.textContent = "表示できる問題がありません";
    elements.questionHint.hidden = true;
    renderAnswerExplanation(null);
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
  elements.sheetQuestionNumber.textContent = `問題番号 ${question.sourceNumber || question.id}`;
  elements.difficultyBadge.textContent = question.difficulty;
  elements.questionText.textContent = formatQuestionText(question.question);
  const isSelfAssessment = question.mode === "self-assessment";
  const isNumericEntry = question.mode === "numeric-entry";
  const usesSelfGrading = isSelfAssessment || isNumericEntry;
  elements.questionHint.hidden = true;
  elements.questionHint.textContent = "";
  elements.choiceList.replaceChildren(
    ...(isSelfAssessment
      ? [createSelfAssessmentElement(question)]
      : isNumericEntry
        ? [createNumericEntryElement(question)]
        : question.choices.map(createChoiceElement))
  );
  elements.answerForm.classList.toggle("answered", state.graded || (usesSelfGrading && state.revealed));
  elements.revealButton.hidden = state.graded || usesSelfGrading;
  elements.revealButton.disabled = state.graded;
  elements.revealButton.querySelector("span").textContent = state.graded ? "解説を表示中" : "正解・解説を見る";
  elements.cardActions.hidden = state.graded || usesSelfGrading;
  elements.nextButton.hidden = !state.graded;
  elements.nextButton.disabled = false;
  elements.nextButtonLabel.textContent = index === filtered.length - 1 ? "演習完了" : "次の問題";
  renderAnswerExplanation(question);
  const recordedResult = state.sessionResults.get(question.id);
  const canCorrectResult = state.graded
    && state.selections.size > 0
    && typeof recordedResult === "boolean";
  elements.mistakeButton.hidden = !canCorrectResult;
  if (canCorrectResult) {
    const targetLabel = recordedResult ? "不正解" : "正解";
    elements.mistakeButton.textContent = `押し間違い（${targetLabel}に修正）`;
    elements.mistakeButton.setAttribute("aria-label", `この回答を${targetLabel}として記録し直す`);
  }
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
  const topicLabel = state.selectedTypes.length === 1 ? state.selectedTypes[0] : state.selectedTypes.length > 1 ? `${state.selectedTypes.length} THEMES` : "ALL THEMES";
  elements.categoryEyebrow.textContent = !state.rememberAnswers
    ? `${topicLabel} / REVIEW`
    : state.sessionShuffle ? `${topicLabel} / SHUFFLE` : topicLabel;
  elements.courseTitle.textContent = [state.selectedCourse, state.selectedUnit].filter(Boolean).join(" / ") || "社労士 問題演習";
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

function questionsForReviewScope(learning = "すべて", course = "すべて") {
  return state.questions.filter((question) => (
    (learning === "すべて" || question.learning === learning)
    && (course === "すべて" || question.course === course)
  ));
}

function questionsMistakenInRange(startValue, endValue, learning = "すべて", course = "すべて") {
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
    const question = questionsById.get(id);
    if (!question) return;
    if (learning !== "すべて" && question.learning !== learning) return;
    if (course !== "すべて" && question.course !== course) return;
    seen.add(id);
    questions.push(question);
  });
  return questions;
}

function updateReviewDialogCount() {
  const learning = elements.reviewLearningSelect.value;
  const course = elements.reviewCourseSelect.value;
  const isLatest = state.reviewDialogMode === "latest";
  const questions = isLatest
    ? latestIncorrectQuestions(questionsForReviewScope(learning, course))
    : questionsMistakenInRange(
      elements.reviewStartDate.value,
      elements.reviewEndDate.value,
      learning,
      course
    );
  const validRange = isLatest || (
    localDateBoundary(elements.reviewStartDate.value)
    && localDateBoundary(elements.reviewEndDate.value, true)
    && elements.reviewStartDate.value <= elements.reviewEndDate.value
  );
  elements.rangeReviewCount.textContent = `対象 ${questions.length}問`;
  elements.rangeReviewStartButton.disabled = !validRange || questions.length === 0;
  return questions;
}

function openReviewDialog(mode) {
  state.reviewDialogMode = mode;
  const isLatest = mode === "latest";
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6);
  if (!elements.reviewStartDate.value) elements.reviewStartDate.value = formatDateInput(weekAgo);
  if (!elements.reviewEndDate.value) elements.reviewEndDate.value = formatDateInput(today);
  elements.reviewDialogEyebrow.textContent = isLatest ? "LATEST REVIEW" : "DATED REVIEW";
  elements.reviewDialogTitle.textContent = isLatest ? "前回の誤答" : "期間指定復習";
  elements.reviewDialogCopy.textContent = isLatest
    ? "直近の回答が不正解の問題だけを、記録せずにやり直します。"
    : "指定期間中に間違えた問題だけを、記録せずにやり直します。";
  elements.reviewDateFields.hidden = isLatest;
  elements.reviewStartDate.required = !isLatest;
  elements.reviewEndDate.required = !isLatest;
  renderReviewFilterOptions();
  updateReviewDialogCount();
  elements.rangeReviewDialog.showModal();
}

function renderReviewLearningOptions() {
  const previous = elements.reviewLearningSelect.value || "すべて";
  const available = new Set(state.questions.map((question) => question.learning));
  const configured = LEARNINGS.map((learning) => learning.id).filter((learning) => available.has(learning));
  const extras = [...available].filter((learning) => !configured.includes(learning));
  const learnings = [...configured, ...extras];
  const options = [new Option("すべての学習", "すべて")];
  learnings.forEach((learning) => options.push(new Option(learning, learning)));
  elements.reviewLearningSelect.replaceChildren(...options);
  elements.reviewLearningSelect.value = learnings.includes(previous) ? previous : "すべて";
}

function renderReviewCourseOptions() {
  const previous = elements.reviewCourseSelect.value || "すべて";
  const learning = elements.reviewLearningSelect.value;
  const courses = [...new Set(state.questions
    .filter((question) => learning === "すべて" || question.learning === learning)
    .map((question) => question.course))];
  const options = [new Option("すべての科目", "すべて")];
  courses.forEach((course) => options.push(new Option(course, course)));
  elements.reviewCourseSelect.replaceChildren(...options);
  elements.reviewCourseSelect.value = courses.includes(previous) ? previous : "すべて";
}

function renderReviewFilterOptions() {
  renderReviewLearningOptions();
  renderReviewCourseOptions();
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
  renderReviewFilterOptions();

  const subjectKeys = new Set();
  const subjects = state.questions.reduce((items, question) => {
    const key = `${question.learning}\u0000${question.course}`;
    if (subjectKeys.has(key)) return items;
    subjectKeys.add(key);
    items.push({ learning: question.learning, course: question.course });
    return items;
  }, []);

  elements.courseGrid.replaceChildren(...subjects.map(({ learning, course }) => {
    const questions = state.questions.filter((item) => item.learning === learning && item.course === course);
    const ids = new Set(questions.map((item) => item.id));
    const done = [...state.answered].filter((id) => ids.has(id)).length;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "subject-card";
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = course;
    const count = document.createElement("small");
    count.textContent = `${done} / ${questions.length} 問完了`;
    const arrow = document.createElement("span");
    arrow.className = "course-arrow";
    arrow.textContent = "→";
    copy.append(title, count);
    card.append(copy, arrow);
    card.addEventListener("click", () => showUnits(learning, course));
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

function renderSubjectScreen(learningId) {
  const learningQuestions = state.questions.filter((item) => item.learning === learningId);
  const courses = [...new Set(learningQuestions.map((item) => item.course))];
  elements.subjectLearningLabel.textContent = learningId;
  elements.subjectTitle.textContent = `${learningId}の科目`;
  elements.subjectGrid.replaceChildren(...courses.map((course) => {
    const questions = learningQuestions.filter((item) => item.course === course);
    const ids = new Set(questions.map((item) => item.id));
    const done = [...state.answered].filter((id) => ids.has(id)).length;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "subject-card";
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = course;
    const count = document.createElement("small");
    count.textContent = `${done} / ${questions.length} 問完了`;
    const arrow = document.createElement("span");
    arrow.className = "course-arrow";
    arrow.textContent = "→";
    copy.append(title, count);
    card.append(copy, arrow);
    card.addEventListener("click", () => showUnits(learningId, course));
    return card;
  }));
}

function showSubjects(learningId) {
  if (!state.questions.some((item) => item.learning === learningId)) return;
  state.selectedLearning = learningId;
  state.selectedCourse = null;
  state.selectedUnit = null;
  state.selectedTopic = null;
  state.selectedTypes = [];
  state.sessionQuestions = [];
  state.sessionShuffle = false;
  state.rememberAnswers = true;
  state.reviewScope = null;
  elements.homeScreen.hidden = true;
  elements.unitScreen.hidden = true;
  elements.topicScreen.hidden = true;
  elements.practiceScreen.hidden = true;
  elements.resultScreen.hidden = true;
  elements.historyScreen.hidden = true;
  elements.subjectScreen.hidden = false;
  elements.homeButton.hidden = false;
  renderSubjectScreen(learningId);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderUnitScreen(learningId = state.selectedLearning, courseId = state.selectedCourse) {
  const courseQuestions = state.questions.filter((item) => item.learning === learningId && item.course === courseId);
  const units = [...new Set(courseQuestions.map((item) => item.unit))];
  elements.unitLearningLabel.textContent = `${learningId} / ${courseId}`;
  elements.unitTitle.textContent = `${courseId}の単元`;
  elements.unitGrid.replaceChildren(...units.map((unit) => {
    const questions = courseQuestions.filter((item) => item.unit === unit);
    const ids = new Set(questions.map((item) => item.id));
    const done = [...state.answered].filter((id) => ids.has(id)).length;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "subject-card";
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = unit;
    const count = document.createElement("small");
    count.textContent = `${done} / ${questions.length} 問完了`;
    const arrow = document.createElement("span");
    arrow.className = "course-arrow";
    arrow.textContent = "→";
    copy.append(title, count);
    card.append(copy, arrow);
    card.addEventListener("click", () => showThemes(learningId, courseId, unit));
    return card;
  }));
}

function showUnits(learningId, courseId) {
  const courseQuestions = state.questions.filter((item) => item.learning === learningId && item.course === courseId);
  if (!courseQuestions.length) return;
  state.selectedLearning = learningId;
  state.selectedCourse = courseId;
  state.selectedUnit = null;
  state.selectedTopic = null;
  state.selectedTypes = [];
  state.sessionQuestions = [];
  state.sessionShuffle = false;
  state.rememberAnswers = true;
  state.reviewScope = null;
  elements.homeScreen.hidden = true;
  elements.subjectScreen.hidden = true;
  elements.topicScreen.hidden = true;
  elements.practiceScreen.hidden = true;
  elements.resultScreen.hidden = true;
  elements.historyScreen.hidden = true;
  elements.unitScreen.hidden = false;
  elements.homeButton.hidden = false;
  renderUnitScreen(learningId, courseId);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function selectedTypeQuestions() {
  const selected = new Set(state.selectedTypes);
  return state.questions.filter((item) => (
    item.learning === state.selectedLearning
    && item.course === state.selectedCourse
    && item.unit === state.selectedUnit
    && selected.has(item.type)
  ));
}

function updateTypeSelectionSummary() {
  const courseQuestions = state.questions.filter((item) => (
    item.learning === state.selectedLearning
    && item.course === state.selectedCourse
    && item.unit === state.selectedUnit
  ));
  const typeNames = [...new Set(courseQuestions.map((item) => item.type))];
  const selected = new Set(state.selectedTypes);
  const selectedQuestions = courseQuestions.filter((item) => selected.has(item.type));
  const reviewQuestions = latestIncorrectQuestions(selectedQuestions);
  elements.typeSelectionCount.textContent = `${state.selectedTypes.length}テーマ・${selectedQuestions.length}問`;
  elements.selectedTypesStartButton.disabled = selectedQuestions.length === 0;
  elements.selectedTypesShuffleButton.disabled = selectedQuestions.length === 0;
  elements.selectedTypesReviewButton.disabled = reviewQuestions.length === 0;
  elements.selectedTypesReviewButton.textContent = `復習 ${reviewQuestions.length}問`;
  elements.selectAllTypes.checked = typeNames.length > 0 && state.selectedTypes.length === typeNames.length;
  elements.selectAllTypes.indeterminate = state.selectedTypes.length > 0 && state.selectedTypes.length < typeNames.length;
}

function renderTopicScreen(learningId = state.selectedLearning, courseId = state.selectedCourse, unitId = state.selectedUnit) {
  const courseQuestions = state.questions.filter(
    (item) => item.learning === learningId && item.course === courseId && item.unit === unitId
  );
  const typeNames = [...new Set(courseQuestions.map((item) => item.type))];
  state.selectedTypes = typeNames.filter((type) => state.selectedTypes.includes(type));
  elements.topicCourseLabel.textContent = `${learningId} / ${courseId} / ${unitId}`;
  elements.topicTitle.textContent = `${unitId}のテーマ`;
  elements.topicDescription.textContent = "演習するテーマは複数選択できます。";
  elements.typeSelectionToolbar.hidden = false;
  elements.topicGrid.hidden = false;
  elements.selectedTypesStartButton.textContent = "選択したテーマを順番に解く";
  elements.selectedTypesShuffleButton.textContent = "選択したテーマをシャッフル";
  elements.topicGrid.replaceChildren(...typeNames.map((type) => {
    const questions = courseQuestions.filter((item) => item.type === type);
    const ids = new Set(questions.map((item) => item.id));
    const done = [...state.answered].filter((id) => ids.has(id)).length;
    const option = document.createElement("label");
    option.className = "type-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = type;
    checkbox.checked = state.selectedTypes.includes(type);
    const copy = document.createElement("span");
    copy.className = "type-option-copy";
    const title = document.createElement("strong");
    title.className = "type-option-title";
    title.textContent = type;
    const count = document.createElement("span");
    count.className = "type-option-count";
    count.textContent = `${done} / ${questions.length} 問完了`;
    copy.append(title, count);
    option.append(checkbox, copy);
    checkbox.addEventListener("change", () => {
      const selected = new Set(state.selectedTypes);
      if (checkbox.checked) selected.add(type);
      else selected.delete(type);
      state.selectedTypes = typeNames.filter((name) => selected.has(name));
      updateTypeSelectionSummary();
    });
    return option;
  }));
  updateTypeSelectionSummary();
}

function showThemes(learningId, courseId, unitId) {
  const courseQuestions = state.questions.filter(
    (item) => item.learning === learningId && item.course === courseId && item.unit === unitId
  );
  if (!courseQuestions.length) return;
  state.selectedLearning = learningId;
  state.selectedCourse = courseId;
  state.selectedUnit = unitId;
  state.selectedTypes = [...new Set(courseQuestions.map((item) => item.type))];
  state.selectedTopic = "すべて";
  state.sessionQuestions = [];
  state.sessionShuffle = false;
  state.rememberAnswers = true;
  state.reviewScope = null;
  elements.homeScreen.hidden = true;
  elements.subjectScreen.hidden = true;
  elements.unitScreen.hidden = true;
  elements.practiceScreen.hidden = true;
  elements.resultScreen.hidden = true;
  elements.historyScreen.hidden = true;
  elements.topicScreen.hidden = false;
  elements.homeButton.hidden = false;
  renderTopicScreen(learningId, courseId, unitId);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showHome() {
  if (!elements.practiceScreen.hidden && state.sessionQuestions.length) {
    pauseSessionTimer();
    persistActiveSession();
  }
  state.selectedLearning = null;
  state.selectedCourse = null;
  state.selectedUnit = null;
  state.selectedTopic = null;
  state.selectedTypes = [];
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
  elements.subjectScreen.hidden = true;
  elements.unitScreen.hidden = true;
  elements.topicScreen.hidden = true;
  elements.homeScreen.hidden = false;
  elements.homeButton.hidden = true;
  clearSessionTimerState();
  renderHome();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startCourse(learningId, courseId, unitId, types = [], shuffled = false) {
  const availableTypes = [...new Set(state.questions
    .filter((item) => item.learning === learningId && item.course === courseId && item.unit === unitId)
    .map((item) => item.type))];
  const requestedTypes = Array.isArray(types) ? types : types === "すべて" ? availableTypes : [types];
  const selectedTypes = availableTypes.filter((type) => requestedTypes.includes(type));
  const selected = new Set(selectedTypes);
  const courseQuestions = state.questions.filter(
    (item) => item.learning === learningId
      && item.course === courseId
      && item.unit === unitId
      && selected.has(item.type)
  );
  const firstQuestion = courseQuestions[0];
  if (!firstQuestion) return;
  state.selectedLearning = learningId;
  state.selectedCourse = courseId;
  state.selectedUnit = unitId;
  state.selectedTypes = selectedTypes;
  state.selectedTopic = selectedTypes.length === 1 ? selectedTypes[0] : "すべて";
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
  elements.subjectScreen.hidden = true;
  elements.unitScreen.hidden = true;
  elements.topicScreen.hidden = true;
  elements.practiceScreen.hidden = false;
  elements.homeButton.hidden = false;
  resetSessionTimer();
  renderAll();
  persistActiveSession();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startShuffle() {
  if (!state.questions.length) return;
  const shuffled = shuffleQuestions(state.questions);
  state.selectedLearning = null;
  state.selectedCourse = "シャッフル演習";
  state.selectedUnit = null;
  state.selectedTopic = "すべて";
  state.selectedTypes = [];
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
  elements.subjectScreen.hidden = true;
  elements.unitScreen.hidden = true;
  elements.topicScreen.hidden = true;
  elements.practiceScreen.hidden = false;
  elements.homeButton.hidden = false;
  resetSessionTimer();
  renderAll();
  persistActiveSession();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startReviewSession(questions, { title, learning = null, unit = null, types = [], scope }) {
  if (!questions.length) return;
  state.selectedLearning = learning;
  state.selectedCourse = title;
  state.selectedUnit = unit;
  state.selectedTypes = Array.isArray(types) ? types : [];
  state.selectedTopic = state.selectedTypes.length === 1 ? state.selectedTypes[0] : "すべて";
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
  elements.subjectScreen.hidden = true;
  elements.unitScreen.hidden = true;
  elements.topicScreen.hidden = true;
  elements.practiceScreen.hidden = false;
  elements.homeButton.hidden = false;
  resetSessionTimer();
  renderAll();
  persistActiveSession();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startSessionMistakesReview(questions, learning = state.selectedLearning) {
  if (!questions.length) return;
  startReviewSession(questions, {
    title: "今回の誤答",
    learning,
    scope: {
      type: "session-mistakes",
      learning,
      questionIds: questions.map((question) => question.id)
    }
  });
}

function retryCurrentSessionMistakes() {
  const questions = activeQuestions().filter((question) => state.sessionResults.get(question.id) === false);
  const sourceLearning = state.reviewScope?.type === "session-mistakes"
    ? state.reviewScope.learning
    : state.selectedLearning;
  startSessionMistakesReview(questions, sourceLearning);
}

function startMistakesMode(learningId = null, courseId = null, unitId = null, types = []) {
  const selected = new Set(Array.isArray(types) ? types : []);
  const scopeQuestions = state.questions.filter(
    (item) => (!learningId || item.learning === learningId)
      && (!courseId || item.course === courseId)
      && (!unitId || item.unit === unitId)
      && (!selected.size || selected.has(item.type))
  );
  const questions = latestIncorrectQuestions(scopeQuestions);
  startReviewSession(questions, {
    title: courseId || "前回の誤答",
    learning: learningId,
    unit: unitId,
    types,
    scope: { type: "latest", learningId, courseId, unitId, types }
  });
}

function startDateRangeReview(startDate, endDate, learning = "すべて", course = "すべて") {
  const questions = questionsMistakenInRange(startDate, endDate, learning, course);
  if (!questions.length) {
    showToast("指定期間に該当する誤答がありません", true);
    return;
  }
  startReviewSession(questions, {
    title: course === "すべて" ? "期間指定復習" : `${course}・期間指定復習`,
    learning: learning === "すべて" ? null : learning,
    scope: { type: "range", startDate, endDate, learning, course }
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

function isSelfGradedQuestion(question) {
  return question?.mode === "self-assessment" || question?.mode === "numeric-entry";
}

function completeQuestion(message, className) {
  const question = currentQuestion();
  resumeSessionTimerFromActivity();
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
    const isNumericEntry = question.mode === "numeric-entry";
    const selectedAnswer = isNumericEntry
      ? state.enteredAnswer
      : selected === undefined
        ? "未回答"
        : isSelfAssessment
          ? (selected ? "正解" : "不正解")
          : (selected ? "○" : "×");
    const record = {
      attemptId: createAttemptId(),
      timestamp: new Date().toISOString(),
      questionId: question.id,
      learning: question.learning,
      course: question.course,
      unit: question.unit,
      theme: question.type,
      type: question.type,
      topic: question.type,
      question: question.question,
      selected: selectedAnswer,
      correctAnswer: isNumericEntry
        ? question.choices[0].correct ?? "未登録"
        : isSelfAssessment
          ? question.choices[0].correct
          : question.choices[0].correct ? "○" : "×",
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
  const allCorrect = isSelfGradedQuestion(question)
    ? state.selections.get(0) === true
    : question.choices.every((choice, index) => state.selections.get(index) === choice.correct);
  completeQuestion(allCorrect ? "正解です。" : "不正解です。解説を確認しましょう。", allCorrect ? "correct" : "incorrect");
}

function isSameAttempt(record, target) {
  return target.attemptId
    ? record.attemptId === target.attemptId
    : record.timestamp === target.timestamp
      && String(record.questionId) === String(target.questionId);
}

function correctAccidentalTap() {
  const question = currentQuestion();
  const currentResult = question ? state.sessionResults.get(question.id) : undefined;
  if (!question || typeof currentResult !== "boolean" || state.selections.size === 0) return;
  resumeSessionTimerFromActivity();

  const nextResult = !currentResult;
  const correctedSelection = isSelfGradedQuestion(question)
    ? nextResult
    : nextResult ? question.choices[0].correct : !question.choices[0].correct;
  state.selections.set(0, correctedSelection);
  state.gradedChoices.add(0);
  state.sessionResults.set(question.id, nextResult);

  const record = state.rememberAnswers
    ? state.history.find((item) => String(item.questionId) === String(question.id))
    : null;
  if (record) {
    record.selected = question.mode === "numeric-entry"
      ? state.enteredAnswer
      : question.mode === "self-assessment"
        ? (nextResult ? "正解" : "不正解")
        : (correctedSelection ? "○" : "×");
    record.isCorrect = nextResult;
    record.corrected = true;
    localStorage.setItem("loopnote-history", JSON.stringify(state.history));
    state.mistakeLog = state.mistakeLog.filter((item) => !isSameAttempt(item, record));
    if (!nextResult) state.mistakeLog.unshift({ ...record });
    saveMistakeLog();
  }

  saveCurrentQuestionState();
  persistActiveSession();
  renderQuestion();
  renderProgress();
  showToast(`${nextResult ? "正解" : "不正解"}として記録し直しました`);
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
  pauseSessionTimer();
  const elapsedMs = state.timerElapsedMs;
  const answeredCount = questions.reduce(
    (count, question) => count + (state.sessionResults.has(question.id) ? 1 : 0),
    0
  );
  const correct = questions.reduce(
    (count, question) => count + (state.sessionResults.get(question.id) === true ? 1 : 0),
    0
  );
  const incorrectQuestions = questions.filter((question) => state.sessionResults.get(question.id) === false);
  const total = questions.length;
  const rate = total ? Math.round((correct / total) * 100) : 0;
  const comment = rate === 100
    ? "全問正解です。このテーマはしっかり定着しています。"
    : rate >= 80
      ? "合格ラインの理解です。間違えた問題だけ復習しましょう。"
      : rate >= 60
        ? "あと一歩です。解説を確認してもう一周すると効果的です。"
        : "伸びしろがあります。数字と例外要件を一つずつ整理しましょう。";

  const typeText = state.selectedTypes.length ? ` / ${formatTypesLabel()}` : "";
  const unitText = state.selectedUnit ? ` / ${state.selectedUnit}` : "";
  const learningText = state.selectedLearning ? `${state.selectedLearning} / ` : "";
  const rangeScope = state.reviewScope?.type === "range" ? state.reviewScope : null;
  elements.resultCourse.textContent = rangeScope
    ? `${rangeScope.startDate.replaceAll("-", "/")}〜${rangeScope.endDate.replaceAll("-", "/")} / ${rangeScope.learning === "すべて" || !rangeScope.learning ? "全学習" : rangeScope.learning} / ${rangeScope.course === "すべて" ? "全科目" : rangeScope.course}`
    : !state.rememberAnswers
      ? state.selectedCourse === "前回の誤答" ? `${learningText}前回の誤答` : `${learningText}${state.selectedCourse}${unitText}${typeText}（復習）`
    : state.selectedCourse === "シャッフル演習"
      ? "全科目シャッフル"
      : `${learningText}${state.selectedCourse}${unitText}${typeText}${state.sessionShuffle ? "（シャッフル）" : ""}`;
  elements.resultScore.textContent = `${rate}%`;
  elements.resultCount.textContent = `${correct} / ${total} 問正解`;
  elements.resultElapsedTime.textContent = formatDuration(elapsedMs);
  elements.resultAverageTime.textContent = answeredCount
    ? formatAverageDuration(elapsedMs / answeredCount)
    : "--";
  elements.resultRateBar.style.width = `${rate}%`;
  elements.resultComment.textContent = comment;
  elements.resultMistakesButton.hidden = incorrectQuestions.length === 0;
  elements.resultMistakesButton.textContent = `今回の誤答 ${incorrectQuestions.length}問を解き直す`;
  clearActiveSession();
  elements.practiceScreen.hidden = true;
  elements.homeScreen.hidden = true;
  elements.subjectScreen.hidden = true;
  elements.unitScreen.hidden = true;
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
    const type = record.theme || record.type || record.topic;
    const classification = [record.learning, record.course, record.unit, type].filter(Boolean).join(" / ");
    meta.textContent = `${classification} ・ ${new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(record.timestamp))}`;
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
  elements.subjectScreen.hidden = true;
  elements.unitScreen.hidden = true;
  elements.topicScreen.hidden = true;
  elements.historyScreen.hidden = false;
  elements.homeButton.hidden = false;
  renderHistory();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function retryCurrentSession() {
  if (state.selectedCourse === "シャッフル演習") startShuffle();
  else if (state.reviewScope?.type === "session-mistakes") {
    const questionsById = new Map(state.questions.map((question) => [String(question.id), question]));
    const questions = state.reviewScope.questionIds
      .map((id) => questionsById.get(String(id)))
      .filter(Boolean);
    startSessionMistakesReview(questions, state.reviewScope.learning);
  }
  else if (state.reviewScope?.type === "range") {
    startDateRangeReview(
      state.reviewScope.startDate,
      state.reviewScope.endDate,
      state.reviewScope.learning || "すべて",
      state.reviewScope.course
    );
  } else if (!state.rememberAnswers) {
    const reviewTypes = state.reviewScope?.types
      || (state.reviewScope?.topic && state.reviewScope.topic !== "すべて" ? [state.reviewScope.topic] : []);
    startMistakesMode(
      state.reviewScope?.learningId || null,
      state.reviewScope?.courseId || null,
      state.reviewScope?.unitId || null,
      reviewTypes
    );
  }
  else startCourse(state.selectedLearning, state.selectedCourse, state.selectedUnit, state.selectedTypes, state.sessionShuffle);
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

function upgradeQuestionClassification(question) {
  const course = normalizeCourse(question.course);
  const learning = normalizeLearning(question.learning) || inferLegacyLearning(course);
  const unit = normalizeUnit(question.unit);
  const type = normalizeType(question.theme ?? question.type ?? question.topic ?? question.category);
  return {
    ...question,
    learning,
    course,
    unit,
    theme: type,
    type,
    topic: type,
    category: type,
    context: `${learning} / ${course} / ${unit} / ${type}`
  };
}

function applyQuestionData(nextQuestions, { version = null, fetchedAt = null, fromCache = false } = {}) {
  const previousId = state.currentId;
  state.questions = nextQuestions.map(upgradeQuestionClassification);
  state.questionVersion = version;
  state.questionFetchedAt = fetchedAt;
  if (!state.questions.some((item) => item.category === state.selectedCategory)) state.selectedCategory = "すべて";
  state.currentId = state.questions.some((item) => item.id === previousId) ? previousId : filteredQuestions()[0]?.id;
  renderHome();
  if (!elements.subjectScreen.hidden && state.selectedLearning) renderSubjectScreen(state.selectedLearning);
  if (!elements.unitScreen.hidden && state.selectedLearning && state.selectedCourse) {
    renderUnitScreen(state.selectedLearning, state.selectedCourse);
  }
  if (!elements.topicScreen.hidden && state.selectedLearning && state.selectedCourse && state.selectedUnit) {
    renderTopicScreen(state.selectedLearning, state.selectedCourse, state.selectedUnit);
  }
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
elements.sessionTimerToggle.addEventListener("click", () => {
  if (state.timerRunning) pauseSessionTimer({ manual: true });
  else resumeSessionTimer({ manual: true });
  persistActiveSession();
});
elements.timerPausedOverlay.addEventListener("click", () => {
  resumeSessionTimer({ manual: true });
  persistActiveSession();
});
elements.timerAwayExcludeButton.addEventListener("click", () => resolveTimerAwayPeriod(false));
elements.timerAwayIncludeButton.addEventListener("click", () => resolveTimerAwayPeriod(true));
elements.homeButton.addEventListener("click", showHome);
elements.resumeSessionButton.addEventListener("click", resumeActiveSession);
elements.subjectBackButton.addEventListener("click", showHome);
elements.unitBackButton.addEventListener("click", showHome);
elements.topicBackButton.addEventListener("click", () => showUnits(state.selectedLearning, state.selectedCourse));
elements.selectAllTypes.addEventListener("change", () => {
  const typeNames = [...new Set(state.questions
    .filter((item) => item.learning === state.selectedLearning
      && item.course === state.selectedCourse
      && item.unit === state.selectedUnit)
    .map((item) => item.type))];
  state.selectedTypes = elements.selectAllTypes.checked ? typeNames : [];
  elements.topicGrid.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = elements.selectAllTypes.checked;
  });
  updateTypeSelectionSummary();
});
elements.selectedTypesStartButton.addEventListener("click", () => {
  startCourse(state.selectedLearning, state.selectedCourse, state.selectedUnit, state.selectedTypes, false);
});
elements.selectedTypesShuffleButton.addEventListener("click", () => {
  startCourse(state.selectedLearning, state.selectedCourse, state.selectedUnit, state.selectedTypes, true);
});
elements.selectedTypesReviewButton.addEventListener("click", () => {
  startMistakesMode(state.selectedLearning, state.selectedCourse, state.selectedUnit, state.selectedTypes);
});
elements.resultMistakesButton.addEventListener("click", retryCurrentSessionMistakes);
elements.retryButton.addEventListener("click", retryCurrentSession);
elements.resultHomeButton.addEventListener("click", showHome);
elements.shuffleButton.addEventListener("click", startShuffle);
elements.mistakesModeButton.addEventListener("click", () => openReviewDialog("latest"));
elements.rangeReviewButton.addEventListener("click", () => openReviewDialog("range"));
elements.reviewStartDate.addEventListener("input", updateReviewDialogCount);
elements.reviewEndDate.addEventListener("input", updateReviewDialogCount);
elements.reviewLearningSelect.addEventListener("change", () => {
  renderReviewCourseOptions();
  updateReviewDialogCount();
});
elements.reviewCourseSelect.addEventListener("change", updateReviewDialogCount);
elements.rangeReviewForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!updateReviewDialogCount().length) return;
  const startDate = elements.reviewStartDate.value;
  const endDate = elements.reviewEndDate.value;
  const learning = elements.reviewLearningSelect.value;
  const course = elements.reviewCourseSelect.value;
  const mode = state.reviewDialogMode;
  elements.rangeReviewDialog.close();
  if (mode === "latest") {
    startMistakesMode(learning === "すべて" ? null : learning, course === "すべて" ? null : course);
  } else {
    startDateRangeReview(startDate, endDate, learning, course);
  }
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
document.addEventListener("visibilitychange", () => {
  if (elements.practiceScreen.hidden || !state.sessionQuestions.length) return;
  if (document.hidden) {
    beginTimerAwayPeriod();
  } else if (state.timerAwayDecisionPending) {
    finishTimerAwayPeriod();
    persistActiveSession();
  } else if (state.timerRunning) {
    renderSessionTimer();
    startSessionTimerTicker();
  }
});
window.addEventListener("pagehide", () => {
  if (!elements.practiceScreen.hidden) beginTimerAwayPeriod();
});
window.addEventListener("pageshow", () => {
  if (!elements.practiceScreen.hidden && state.timerAwayDecisionPending) {
    finishTimerAwayPeriod();
    persistActiveSession();
  } else if (!elements.practiceScreen.hidden && state.timerRunning) {
    renderSessionTimer();
    startSessionTimerTicker();
  }
});

localStorage.removeItem("loopnote-interval");
async function initializeQuestions() {
  const restored = await restoreQuestionsFromCache();
  if (!restored) await syncQuestions({ quiet: true });
}

initializeQuestions();
