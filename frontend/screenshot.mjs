import { chromium } from "playwright";
import fs from "fs";

const pages = [
  { path: "/", name: "home" },
  { path: "/predict", name: "predict" },
  { path: "/dashboard", name: "dashboard" },
];

fs.mkdirSync("/tmp/fg-screens", { recursive: true });

const browser = await chromium.launch();

for (const vp of [{ w: 1440, h: 900, tag: "desktop" }, { w: 390, h: 844, tag: "mobile" }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await ctx.newPage();
  for (const p of pages) {
    await page.goto(`http://localhost:8000${p.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `/tmp/fg-screens/${p.name}-${vp.tag}.png`, fullPage: true });
    console.log(`captured ${p.name}-${vp.tag}`);
  }
  await ctx.close();
}

await browser.close();
