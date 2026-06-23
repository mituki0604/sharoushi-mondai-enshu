import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PORT = Number(process.env.PORT || 4173);
const DEFAULT_SOURCE = process.env.SHEET_CSV_URL || "";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml"
};

function send(res, status, body, contentType = "application/json; charset=utf-8", cacheControl = "no-store") {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": cacheControl,
    "x-content-type-options": "nosniff"
  });
  res.end(body);
}

function createVersion(data) {
  const serialized = typeof data === "string" ? data : JSON.stringify(data);
  return createHash("sha256").update(serialized).digest("hex");
}

function normalizeSheetUrl(input) {
  const url = new URL(input);
  const allowedHosts = new Set(["docs.google.com", "script.google.com"]);
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) {
    throw new Error("Google Sheets または Apps Script の HTTPS URL を指定してください");
  }

  if (url.hostname === "script.google.com") return url.toString();
  if (url.searchParams.get("output") === "csv" || url.searchParams.get("format") === "csv") {
    return url.toString();
  }

  const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match) throw new Error("Google Sheets のURLを確認してください");
  const hashGid = new URLSearchParams(url.hash.replace(/^#/, "")).get("gid");
  const gid = url.searchParams.get("gid") || hashGid || "0";
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${encodeURIComponent(gid)}`;
}

async function getQuestionSource(source) {
  if (!source) {
    const data = await readFile(resolve(ROOT, "data/questions.csv"), "utf8");
    return {
      type: "csv",
      source: "デモ用ローカルデータ",
      data,
      version: createVersion(data)
    };
  }

  const target = normalizeSheetUrl(source);
  const response = await fetch(target, {
    headers: { "user-agent": "RealtimeQuestionDrill/1.0" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`スプレッドシートを取得できませんでした (${response.status})`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("json")) {
    const data = await response.json();
    return { type: "json", source: "接続中のスプレッドシート", data, version: createVersion(data) };
  }
  const data = await response.text();
  return { type: "csv", source: "接続中のスプレッドシート", data, version: createVersion(data) };
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const filePath = resolve(ROOT, requested);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${sep}`)) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  try {
    const body = await readFile(filePath);
    send(res, 200, body, mimeTypes[extname(filePath)] || "application/octet-stream");
  } catch {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/api/questions") {
    try {
      const source = requestUrl.searchParams.get("source") || DEFAULT_SOURCE;
      const mode = requestUrl.searchParams.get("mode") || "full";
      const forceRefresh = requestUrl.searchParams.get("refresh") === "1";
      if (source.length > 2048) throw new Error("URLが長すぎます");
      const payload = await getQuestionSource(source);
      const fetchedAt = new Date().toISOString();
      const cacheControl = forceRefresh ? "no-store" : "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
      const body = mode === "version"
        ? { version: payload.version, fetchedAt }
        : { ...payload, fetchedAt };
      send(res, 200, JSON.stringify(body), "application/json; charset=utf-8", cacheControl);
    } catch (error) {
      send(res, 502, JSON.stringify({ error: error.message || "同期に失敗しました" }));
    }
    return;
  }

  if (requestUrl.pathname === "/api/health") {
    send(res, 200, JSON.stringify({ ok: true }));
    return;
  }

  await serveStatic(req, res, requestUrl.pathname);
});

server.listen(PORT, () => {
  console.log(`Question Drill is running at http://localhost:${PORT}`);
});
