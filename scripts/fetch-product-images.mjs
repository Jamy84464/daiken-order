#!/usr/bin/env node
/**
 * 從大研官網商品頁抓取商品圖，轉成 400×400 WebP 存到 public/products/<id>.webp
 *
 * 用法（在專案根目錄執行）：
 *   npm install --no-save sharp        # 只裝一次，不會寫進 package.json
 *
 *   node scripts/fetch-product-images.mjs --dry        # 只檢查抓得到哪些圖，不下載
 *   node scripts/fetch-product-images.mjs              # 實際下載（已存在的會跳過）
 *   node scripts/fetch-product-images.mjs --force      # 重新下載全部
 *   node scripts/fetch-product-images.mjs --only p1,p5 # 只處理指定商品
 *
 * 產出的檔名規則是 <商品id>.webp，ProductCard 會自動對應，不需要改任何資料結構。
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "products");
const SRC = join(ROOT, "src", "constants.ts");

const SIZE = 400;          // 輸出邊長（正方形）
const QUALITY = 82;        // WebP 品質
const DELAY_MS = 600;      // 每次請求間隔，對官網客氣一點
const TIMEOUT_MS = 20000;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── 參數 ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const FORCE = args.includes("--force");
const onlyArg = args.find(a => a.startsWith("--only"));
const ONLY = onlyArg
  ? new Set((onlyArg.split("=")[1] ?? args[args.indexOf(onlyArg) + 1] ?? "").split(",").map(s => s.trim()).filter(Boolean))
  : null;

// ── 讀取 sharp（非必要依賴，--dry 模式不需要）────────────────────────────────
let sharp = null;
if (!DRY) {
  try {
    ({ default: sharp } = await import("sharp"));
  } catch {
    console.error(
      "\n✗ 找不到 sharp（影像處理需要）。請先執行：\n\n" +
      "    npm install --no-save sharp\n\n" +
      "或先用 --dry 檢查抓得到哪些圖：\n\n" +
      "    node scripts/fetch-product-images.mjs --dry\n"
    );
    process.exit(1);
  }
}

// ── 從 constants.ts 解析商品清單 ─────────────────────────────────────────────
function parseProducts() {
  const src = readFileSync(SRC, "utf8");

  const dMatch = src.match(/const\s+D\s*=\s*["'`]([^"'`]+)["'`]/);
  if (!dMatch) throw new Error("在 constants.ts 找不到 const D 的定義");
  const base = dMatch[1];

  const out = [];
  const re = /\{\s*id\s*:\s*"([^"]+)"\s*,\s*name\s*:\s*"([^"]+)"[^}]*?url\s*:\s*D\s*\+\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({ id: m[1], name: m[2], code: m[3], url: base + m[3] });
  }
  return out;
}

// ── 從商品頁 HTML 找出主圖網址 ───────────────────────────────────────────────
function extractImageUrl(html, pageUrl) {
  const strategies = [
    // 1. Open Graph（電商標準，最可靠）
    [/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i, "og:image"],
    [/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i, "og:image"],
    // 2. Twitter card
    [/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i, "twitter:image"],
    // 3. JSON-LD 商品結構化資料
    [/"image"\s*:\s*"([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i, "json-ld"],
    // 4. 常見的商品圖 class / id
    [/<img[^>]+(?:class|id)=["'][^"']*(?:product|goods|main)[^"']*["'][^>]+src=["']([^"']+)["']/i, "img[product]"],
  ];

  for (const [re, label] of strategies) {
    const m = html.match(re);
    if (m && m[1]) {
      try {
        return { url: new URL(m[1].replace(/&amp;/g, "&"), pageUrl).href, via: label };
      } catch { /* 網址格式不對，換下一個策略 */ }
    }
  }
  return null;
}

// ── 帶逾時的 fetch ──────────────────────────────────────────────────────────
async function get(url, asBuffer = false) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, "Accept-Language": "zh-TW,zh;q=0.9" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.text();
  } finally {
    clearTimeout(timer);
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 主流程 ──────────────────────────────────────────────────────────────────
const all = parseProducts();
const products = ONLY ? all.filter(p => ONLY.has(p.id)) : all;

if (products.length === 0) {
  console.error("✗ 沒有符合條件的商品");
  process.exit(1);
}

if (!DRY) mkdirSync(OUT_DIR, { recursive: true });

console.log(
  `\n大研商品圖抓取${DRY ? "（檢查模式，不下載）" : ""}\n` +
  `對象 ${products.length} 項${ONLY ? `（--only 篩選自 ${all.length} 項）` : ""}\n` +
  `輸出 public/products/<id>.webp · ${SIZE}×${SIZE} · 品質 ${QUALITY}\n`
);

const done = [], skipped = [], failed = [];

for (const [i, p] of products.entries()) {
  const label = `[${String(i + 1).padStart(2)}/${products.length}] ${p.id.padEnd(4)} ${p.name}`;
  const dest = join(OUT_DIR, `${p.id}.webp`);

  if (!FORCE && !DRY && existsSync(dest)) {
    console.log(`${label}\n          ↳ 已存在，跳過`);
    skipped.push(p.id);
    continue;
  }

  try {
    const html = await get(p.url);
    const found = extractImageUrl(html, p.url);
    if (!found) throw new Error("頁面中找不到商品圖");

    if (DRY) {
      console.log(`${label}\n          ↳ ✓ ${found.via} — ${found.url}`);
      done.push(p.id);
    } else {
      const raw = await get(found.url, true);
      const info = await sharp(raw)
        .resize(SIZE, SIZE, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .flatten({ background: "#ffffff" })
        .webp({ quality: QUALITY })
        .toFile(dest);
      console.log(`${label}\n          ↳ ✓ ${found.via} — ${(info.size / 1024).toFixed(0)} KB`);
      done.push(p.id);
    }
  } catch (e) {
    console.log(`${label}\n          ↳ ✗ ${e.message}`);
    failed.push({ id: p.id, name: p.name, url: p.url, reason: e.message });
  }

  if (i < products.length - 1) await sleep(DELAY_MS);
}

// ── 結果 ────────────────────────────────────────────────────────────────────
console.log(
  `\n──────────────────────────────────────\n` +
  `成功 ${done.length} · 跳過 ${skipped.length} · 失敗 ${failed.length}`
);

if (failed.length) {
  const reportPath = join(OUT_DIR, "_failed.json");
  if (!DRY) {
    writeFileSync(reportPath, JSON.stringify(failed, null, 2) + "\n");
  }
  console.log(`\n以下商品需要手動處理：`);
  for (const f of failed) console.log(`  ${f.id.padEnd(4)} ${f.name}\n       ${f.url}\n       （${f.reason}）`);
  if (!DRY) console.log(`\n清單已存到 public/products/_failed.json`);
  console.log(`\n手動補圖：存成 ${SIZE}×${SIZE} 的圖，命名為 <id>.webp 放進 public/products/ 即可。`);
}

if (!DRY && done.length) {
  console.log(`\n下一步：\n  git add public/products && git commit -m "新增商品縮圖" && git push\n`);
}
