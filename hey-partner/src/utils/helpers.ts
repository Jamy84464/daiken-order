import type { Feedback, CategoryKey, StatusKey, RespondKey } from "../types";

/** 查詢碼格式化：去掉非英數、轉大寫，滿 12 碼時補上分隔線 */
export function formatCode(raw: string): string {
  const s = raw.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 12);
  return s.match(/.{1,4}/g)?.join("-") ?? "";
}

export function isCompleteCode(code: string): boolean {
  return /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(code);
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

/** 每次送出一個識別碼：伺服器用它辨識重送，前端收不到回應時用它取回查詢碼 */
export function makeSid(): string {
  const buf = new Uint8Array(12);
  const cr: Crypto | undefined = (globalThis as any).crypto;
  if (cr?.getRandomValues) cr.getRandomValues(buf);
  else for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  return Array.from(buf, b => b.toString(16).padStart(2, "0")).join("");
}

/** "2026/11/12 下午3:04:05" → "2026-11"，用來做月份統計 */
export function monthOf(createdAt: string): string {
  const m = /^(\d{4})\/(\d{1,2})\//.exec(createdAt || "");
  return m ? `${m[1]}-${m[2].padStart(2, "0")}` : "";
}

/** "2026/11/12 下午3:04:05" → "11/12" */
export function shortDate(createdAt: string | null): string {
  const m = /^\d{4}\/(\d{1,2})\/(\d{1,2})/.exec(createdAt || "");
  return m ? `${m[1]}/${m[2]}` : "";
}

export interface CountItem { key: string; count: number }

function countBy<T>(list: T[], keys: (x: T) => string[]): CountItem[] {
  const map = new Map<string, number>();
  list.forEach(x => keys(x).forEach(k => { if (k) map.set(k, (map.get(k) || 0) + 1); }));
  return Array.from(map, ([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export interface TagInsight extends CountItem {
  /** 出現在幾個不同月份：跨月重複出現代表不是單一事件 */
  months: number;
  categories: CategoryKey[];
}

export interface Insights {
  total: number;
  open: number;
  byCategory: Record<CategoryKey, number>;
  byStatus: Record<StatusKey, number>;
  byRespond: Record<RespondKey, number>;
  tags: TagInsight[];
  subjects: TagInsight[];
  months: CountItem[];
  /** 希望面談、或被標記需要介入，且還沒結案 */
  needsCare: Feedback[];
  untagged: number;
}

function insightOf(list: Feedback[], pick: (f: Feedback) => string[]): TagInsight[] {
  return countBy(list, pick).map(c => {
    const hits = list.filter(f => pick(f).includes(c.key));
    return {
      ...c,
      months: new Set(hits.map(f => monthOf(f.createdAt))).size,
      categories: Array.from(new Set(hits.map(f => f.category))),
    };
  });
}

export function buildInsights(list: Feedback[]): Insights {
  const zero = <K extends string>(keys: K[]) => Object.fromEntries(keys.map(k => [k, 0])) as Record<K, number>;
  const byCategory = zero<CategoryKey>(["env", "flow", "team", "up", "vent"]);
  const byStatus = zero<StatusKey>(["received", "seeded", "thinking", "action"]);
  const byRespond = zero<RespondKey>(["ack", "attention", "reply", "meet"]);
  list.forEach(f => {
    if (f.category in byCategory) byCategory[f.category]++;
    if (f.status in byStatus) byStatus[f.status]++;
    if (f.respond in byRespond) byRespond[f.respond]++;
  });
  const months = countBy(list, f => [monthOf(f.createdAt)]).sort((a, b) => a.key.localeCompare(b.key));
  return {
    total: list.length,
    open: list.filter(f => !f.archived).length,
    byCategory, byStatus, byRespond,
    tags: insightOf(list, f => f.tags || []),
    subjects: insightOf(list, f => f.subjects || []),
    months: months.slice(-6),
    needsCare: list.filter(f => !f.archived && (f.respond === "meet" || (f.tags || []).includes("需要介入"))),
    untagged: list.filter(f => !(f.tags || []).length).length,
  };
}
