// Stop hook: when the final reply of a turn is not written in Japanese, sends it back once to be written again in Japanese.
// The reply is taken from the hook input (last_assistant_message) or else from the session transcript: the text Claude wrote
// after the last tool result or prompt. Code, commands and URLs do not count. A reply counts as not Japanese when it has at
// least MIN_LATIN Latin letters and fewer Japanese characters than MIN_RATIO of them. It is let through when the hook has
// already sent this turn back (stop_hook_active), or when the user's last prompt asks for English. Any error lets it through.
import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";

const MIN_LATIN = 40, MIN_RATIO = 0.25, TAIL = 8 * 1024 * 1024;
const REASON = "直前の返答は日本語ではありませんでした。同じ内容を、ユーザー向けの文章はすべて日本語にして、もう一度返答してください。コード、コマンド、ファイル名、固有名詞は元のままで構いません。";

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

/* the final reply and the prompt that started the turn */
function lastTurn(path) {
  const lines = tailLines(path), parts = [];
  let i = lines.length - 1;
  for (; i >= 0; i--) {
    const e = parse(lines[i]);
    if (!e) continue;
    if (e.type === "user") break;
    if (e.type === "assistant") { const t = textOf(e.message?.content); if (t) parts.unshift(t); }
  }
  let prompt = "";
  for (; i >= 0 && !prompt; i--) {
    const e = parse(lines[i]), c = e?.message?.content;
    if (e?.type !== "user" || e.isMeta || (Array.isArray(c) && c.some(b => b?.type === "tool_result"))) continue;
    prompt = textOf(c);
  }
  return { reply: parts.join("\n"), prompt };
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
  const turn = input.transcript_path ? lastTurn(input.transcript_path) : { reply: "", prompt: "" };
  const reply = typeof input.last_assistant_message === "string" ? input.last_assistant_message : turn.reply;
  if (/英語|english/i.test(turn.prompt)) process.exit(0);
  if (reply && notJapanese(reply)) process.stdout.write(JSON.stringify({ decision: "block", reason: REASON }));
} catch {
  // a check that cannot run lets the reply through
}
