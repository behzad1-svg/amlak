import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const ROOT = "D:/bb";
const DEBOUNCE_MS = 3500;
let timer = null;
let busy = false;

const IGNORE = [".git", ".next", "node_modules", ".tmp", ".bundle"];

function shouldIgnore(filePath) {
  const rel = path.relative(ROOT, filePath).replaceAll("\\", "/");
  return IGNORE.some(p => rel.includes(p));
}

function hasChanges() {
  try {
    const out = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim();
    return out.length > 0;
  } catch { return false; }
}

function autoCommit() {
  if (busy) return;
  if (!hasChanges()) return;
  busy = true;
  const ts = new Date().toLocaleString("fa-IR", { timeZone: "Asia/Tehran" });
  try {
    execSync("git add -A", { cwd: ROOT });
    execSync(`git commit -m "auto: ذخیره خودکار ${ts}"`, { cwd: ROOT });
    console.log(`[auto-backup] committed at ${ts}`);
  } catch (e) {
    console.log("[auto-backup] skip:", e.message?.slice(0,100));
  }
  busy = false;
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(autoCommit, DEBOUNCE_MS);
}

console.log("[auto-backup] watching D:/bb - debounce", DEBOUNCE_MS, "ms");
console.log("[auto-backup] برگشت: git log --oneline | git restore . | git reset --hard HEAD~1");

fs.watch(ROOT, { recursive: true }, (event, filename) => {
  if (!filename) return;
  const full = path.join(ROOT, filename);
  if (shouldIgnore(full)) return;
  schedule();
});

setInterval(autoCommit, 5 * 60 * 1000);
