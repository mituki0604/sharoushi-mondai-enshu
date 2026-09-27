const DATABASE_NAME = "loopnote-question-cache";
const DATABASE_VERSION = 1;
const CACHE_FORMAT_VERSION = 2;
const MANIFEST_STORE = "manifests";
const COURSE_STORE = "courseQuestions";
const DEMO_SOURCE_KEY = "__demo__";

function sourceKey(source) {
  return source || DEMO_SOURCE_KEY;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error || new Error("IndexedDBの処理に失敗しました")), { once: true });
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error || new Error("IndexedDBの処理を中止しました")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error || new Error("IndexedDBの処理に失敗しました")), { once: true });
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("このブラウザでは問題キャッシュを利用できません"));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(MANIFEST_STORE)) {
        database.createObjectStore(MANIFEST_STORE, { keyPath: "sourceKey" });
      }
      if (!database.objectStoreNames.contains(COURSE_STORE)) {
        const store = database.createObjectStore(COURSE_STORE, { keyPath: "id" });
        store.createIndex("sourceKey", "sourceKey", { unique: false });
      }
    });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error || new Error("問題キャッシュを開けませんでした")), { once: true });
  });
}

export async function loadQuestionCache(source) {
  const database = await openDatabase();
  try {
    const key = sourceKey(source);
    const transaction = database.transaction([MANIFEST_STORE, COURSE_STORE], "readonly");
    const manifestRequest = transaction.objectStore(MANIFEST_STORE).get(key);
    const setsRequest = transaction.objectStore(COURSE_STORE).index("sourceKey").getAll(key);
    const [manifest, sets] = await Promise.all([requestResult(manifestRequest), requestResult(setsRequest)]);
    await transactionComplete(transaction);
    if (!manifest || manifest.formatVersion !== CACHE_FORMAT_VERSION) return null;

    const setsByCourse = new Map(sets.map((set) => [set.course, set.questions]));
    const questions = manifest.courses.flatMap((course) => setsByCourse.get(course) || []);
    return {
      version: manifest.version,
      fetchedAt: manifest.fetchedAt,
      questions
    };
  } finally {
    database.close();
  }
}

export async function saveQuestionCache(source, { version, fetchedAt, questions }) {
  const database = await openDatabase();
  try {
    const key = sourceKey(source);
    const grouped = new Map();
    questions.forEach((question) => {
      const course = question.course || "その他";
      if (!grouped.has(course)) grouped.set(course, []);
      grouped.get(course).push(question);
    });

    const transaction = database.transaction([MANIFEST_STORE, COURSE_STORE], "readwrite");
    const manifestStore = transaction.objectStore(MANIFEST_STORE);
    const courseStore = transaction.objectStore(COURSE_STORE);
    const previousKeys = await requestResult(courseStore.index("sourceKey").getAllKeys(key));
    previousKeys.forEach((previousKey) => courseStore.delete(previousKey));

    const courses = [...grouped.keys()];
    grouped.forEach((courseQuestions, course) => {
      courseStore.put({
        id: `${key}\u0000${course}`,
        sourceKey: key,
        course,
        questions: courseQuestions
      });
    });
    manifestStore.put({ sourceKey: key, formatVersion: CACHE_FORMAT_VERSION, version, fetchedAt, courses, count: questions.length });
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}
