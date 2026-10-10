import { createRequire } from "module";
const require = createRequire(process.cwd() + "/");
const { chromium } = require("playwright");
import fs from "fs";
import { spawn } from "child_process";
const [mode, out, ...times] = process.argv.slice(2);
const FPS = 30;
const timing = JSON.parse(fs.readFileSync("timing.json", "utf8"));
const opts = { lead: 0.25, gap: 0.3, appGap: 0.12, tail: 0.6 };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" in {} ? undefined : undefined });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto("file://" + process.cwd() + "/short.html");
await page.evaluate(() => document.fonts.ready);
const meta = await page.evaluate(([t, o]) => window.setup(t, o), [timing, opts]);
fs.writeFileSync("timeline.json", JSON.stringify(meta, null, 1));
await page.evaluate(async () => { await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
// warm all app images so src swaps are instant
await page.evaluate(() => Promise.all(["photocraft","vectorcraft","filmcraft","lightcraft","pdfcraft","effectcraft","designcraft"].flatMap(id => [`img/${id}-shot.webp`, `img/${id}-icon.webp`]).map(s => { const i = new Image(); i.src = s; return i.decode(); })));
if (mode === "stills") {
  for (const t of times) { await page.evaluate(t => { window.seek(+t); document.getElementById("cap").innerHTML = ""; document.getElementById("bar").style.width = "0"; }, t); await page.waitForTimeout(30); await page.screenshot({ path: `${out}/still_${t}.png` }); }
} else {
  const n = Math.ceil(meta.total * FPS);
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", out], { stdio: ["pipe", "inherit", "inherit"] });
  for (let f = 0; f < n; f++) {
    await page.evaluate(t => window.seek(t), f / FPS);
    // let image src swaps paint
    await page.evaluate(() => Promise.all([...document.images].filter(i => !i.complete).map(i => i.decode().catch(() => {}))));
    const buf = await page.screenshot({ type: "png" });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    if (f % 150 === 0) console.log(`frame ${f}/${n}`);
  }
  ff.stdin.end(); await new Promise(r => ff.on("close", r));
  console.log("total", meta.total, "frames", n);
}
await browser.close();
