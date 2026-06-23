import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

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

async function loadQuestions(source) {
  if (!source) {
    const data = await readFile(new URL("../data/questions.csv", import.meta.url), "utf8");
    return { type: "csv", source: "デモ用データ", data, version: createVersion(data) };
  }

  if (source.length > 2048) throw new Error("URLが長すぎます");
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

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const source = Array.isArray(request.query.source) ? request.query.source[0] : request.query.source || "";
    const mode = Array.isArray(request.query.mode) ? request.query.mode[0] : request.query.mode || "full";
    const forceRefresh = request.query.refresh === "1";
    response.setHeader(
      "Cache-Control",
      forceRefresh ? "no-store" : "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
    );
    const payload = await loadQuestions(source);
    const fetchedAt = new Date().toISOString();
    if (mode === "version") {
      return response.status(200).json({ version: payload.version, fetchedAt });
    }
    return response.status(200).json({ ...payload, fetchedAt });
  } catch (error) {
    return response.status(502).json({ error: error.message || "同期に失敗しました" });
  }
}
