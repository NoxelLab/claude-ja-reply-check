// Stop hook: when the final reply of a turn is not written in Japanese, sends it back once to be written again in Japanese.
// The reply is taken from the hook input (last_assistant_message) or else from the session transcript: the text Claude wrote
// after the last tool result or prompt. Code, commands and URLs do not count. A reply counts as not Japanese when it has at
// least MIN_LATIN Latin letters and fewer Japanese characters than MIN_RATIO of them. Whether the user asked for English is
// left to Claude: the reason tells it to keep such a reply and say so in one Japanese sentence. It is let through when the
// hook has already sent this turn back (stop_hook_active). Any error lets it through.
import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";

const MIN_LATIN = 40, MIN_RATIO = 0.25, TAIL = 8 * 1024 * 1024;
const REASON = "直前の返答は日本語ではありませんでした。ユーザー向けの文章をすべて日本語にして、同じ内容をもう一度返答してください。コード、コマンド、ファイル名、固有名詞は元のままで構いません。ただしユーザーが英語での返答や英語の文章を求めていた場合は返答し直さず、直前の返答のままとすることを日本語で一文だけ伝えてください。";

function tailLines(path) {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size, start = Math.max(0, size - TAIL), buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    const text = buf.toString("utf8");
    return (start ? text.slice(text.indexOf("\n") + 1) : text).split("\n");
  } finally {
    closeSync(fd);
  }
}

const parse = line => { try { return JSON.parse(line); } catch { return null; } };
const textOf = c => (typeof c === "string" ? c : Array.isArray(c) ? c.filter(b => b?.type === "text").map(b => b.text).join("\n") : "");

function lastReply(path) {
  const lines = tailLines(path), parts = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const e = parse(lines[i]);
    if (!e) continue;
    if (e.type === "user") break;
    if (e.type === "assistant") { const t = textOf(e.message?.content); if (t) parts.unshift(t); }
  }
  return parts.join("\n");
}

function notJapanese(text) {
  const t = text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ").replace(/https?:\/\/\S+/g, " ").replace(/\]\([^)]*\)/g, "]");
  const latin = (t.match(/[A-Za-z]/g) || []).length;
  const japanese = (t.match(/[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]/g) || []).length;
  return latin >= MIN_LATIN && japanese < latin * MIN_RATIO;
}

try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  if (input.stop_hook_active) process.exit(0);
  const reply = typeof input.last_assistant_message === "string" ? input.last_assistant_message
    : input.transcript_path ? lastReply(input.transcript_path) : "";
  if (reply && notJapanese(reply)) process.stdout.write(JSON.stringify({ decision: "block", reason: REASON }));
} catch {
  // a check that cannot run lets the reply through
}
