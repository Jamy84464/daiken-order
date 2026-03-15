import type { Category, Product } from "../types";

// Email 格式驗證（要求 local 至少 2 字元、domain 至少有一個點、TLD 至少 2 字元）
export const isValidEmail = (email: string): boolean => /^[^\s@]{2,}@[^\s@]+\.[^\s@]{2,}$/.test(email);

// 產生訂單 localStorage/GAS key
export function orderKey(year: number, month: number): string {
  return `orders_${year}_${String(month).padStart(2, "0")}`;
}

// 當前時間字串（zh-TW 格式）
export function nowStr(): string {
  return new Date().toLocaleString("zh-TW");
}

// 過濾掉 _v 等 meta 欄位，只保留真正的資料項目
export function dataEntries<T>(obj: Record<string, T> | null | undefined): Record<string, T> {
  if (!obj || typeof obj !== "object") return {} as Record<string, T>;
  const clean: Record<string, T> = {};
  Object.entries(obj).forEach(([k, v]) => { if (!k.startsWith("_")) clean[k] = v; });
  return clean;
}

// Flatten categories to product map
export function flatProducts(cats: Category[]): Record<string, Product & { category: string }> {
  const m: Record<string, Product & { category: string }> = {};
  cats.forEach(c => c.products.forEach(p => { m[p.id] = { ...p, category: c.key }; }));
  return m;
}
