import type { CategoryDef, RespondDef, StatusDef, CategoryKey, StatusKey, RespondKey } from "./types";

export const VERSION = "v0.1.0";
export const APP_NAME = "Hey 夥伴！請聽我說～～";
export const GAS_URL = process.env.REACT_APP_GAS_URL;
export const WRITE_TOKEN = process.env.REACT_APP_WRITE_TOKEN;
if (!GAS_URL || !WRITE_TOKEN) console.warn("Missing REACT_APP_GAS_URL or REACT_APP_WRITE_TOKEN. Copy .env.example to .env.local and fill in values.");

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
// 暖色紙感底 + 深青綠主色 + 珊瑚橘強調：輕鬆、溫暖、不像公文
export const C = {
  ink: "#1f2933",        // 主要文字
  sub: "#52606d",        // 次要文字
  muted: "#7b8794",      // 輔助說明
  primary: "#2f5d62",    // 主色（深青綠）
  primaryDark: "#234549",
  primarySoft: "#e3efec",
  coral: "#e07a5f",      // 強調色
  coralDark: "#b85a42",  // 承載白字達 WCAG AA
  sun: "#f2cc8f",
  cream: "#fbf7f1",      // 頁面底色
  paper: "#ffffff",
  surface: "#f6f2ec",    // 次要區塊底
  border: "#e7e1d7",
  hairline: "rgba(31,41,51,.07)",
  red: "#c2410c",
  redDark: "#9a3412",
  white: "#fff",
};

// 字級
export const T = {
  xs: "0.75rem", sm: "0.8125rem", base: "0.9375rem", md: "1.0625rem",
  lg: "1.25rem", xl: "1.625rem", xxl: "2.25rem",
} as const;

// 間距：4px 倍數
export const S = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 } as const;

// 圓角
export const R = { sm: 10, md: 14, lg: 20, xl: 28, full: 999 } as const;

export const TAP = 44;

// 陰影：帶一點暖色調，比純灰更柔和
export const E = {
  1: "0 1px 2px rgba(60,40,20,.05), 0 1px 1px rgba(60,40,20,.03)",
  2: "0 4px 14px rgba(60,40,20,.07)",
  3: "0 18px 48px rgba(40,30,20,.16)",
} as const;

// 標題字：粉圓體（Huninn），圓潤親切；載不到時退回思源黑體
export const DISPLAY = "'Huninn','Noto Sans TC',sans-serif";

// ── 選項定義（與 gas/Code.gs 保持一致）────────────────────────────────────────
export const CATEGORIES: CategoryDef[] = [
  {
    key: "env", emoji: "🪴", title: "我希望工作環境更舒適！",
    desc: "空間、設備、福利、工具，任何讓上班體驗更好的想法。",
    placeholder: "例如：會議室冷氣常常太冷、希望有一台更快的印表機…",
    tags: ["空間", "設備", "福利", "工具", "辦公環境"],
    color: "#4f7d3a", tint: "#edf4e6",
  },
  {
    key: "flow", emoji: "🔄", title: "我希望工作流程更順暢！",
    desc: "覺得哪裡卡卡的、重複做白工、權責不清楚，都可以說。",
    placeholder: "例如：請款流程要跑三個人簽、同一份資料要重複輸入兩次…",
    tags: ["SOP", "權責", "跨部門", "系統", "資訊落差", "效率"],
    color: "#2f6f9f", tint: "#e6f0f7",
  },
  {
    key: "team", emoji: "🤝", title: "我希望團隊夥伴更給力！",
    desc: "合作、溝通、分工、工作態度，或希望團隊可以怎麼變得更好。",
    placeholder: "可以描述發生的情境，以及你希望怎麼改變，不一定要點名喔。",
    tags: ["同事合作", "溝通", "交付", "態度", "主管管理"],
    color: "#b5651d", tint: "#fbefe2",
  },
  {
    key: "up", emoji: "🚀", title: "我希望我們更上一層樓！",
    desc: "對產品、營運、服務、品牌、公司發展有想法？歡迎來出主意。",
    placeholder: "天馬行空也沒關係，好點子常常從一句「如果我們…」開始。",
    tags: ["產品", "營運", "服務", "品牌", "創新提案", "公司發展"],
    color: "#6a5aa8", tint: "#efecf8",
  },
  {
    key: "vent", emoji: "🌋", title: "我受不了了～～～！",
    desc: "有件事情真的很困擾你，或已經影響到工作？說出來會好一點，請讓我們知道。",
    placeholder: "慢慢說，想到什麼寫什麼。我們會認真看完每一個字。",
    tags: ["高情緒", "反覆發生", "嚴重影響工作", "需要介入"],
    color: "#c0392b", tint: "#fbe9e7",
  },
];
export const CAT: Record<CategoryKey, CategoryDef> =
  Object.fromEntries(CATEGORIES.map(c => [c.key, c])) as Record<CategoryKey, CategoryDef>;

export const RESPONDS: RespondDef[] = [
  { key: "ack", emoji: "👋", label: "讓我知道你有收到就好了", hint: "只想被聽見，不用特別處理" },
  { key: "attention", emoji: "👀", label: "請認真關注這件事！", hint: "希望這件事被放進待辦清單" },
  { key: "reply", emoji: "💬", label: "如果可以，我期待專人訊息回覆", hint: "需要留下稱呼與聯絡方式" },
  { key: "meet", emoji: "☕", label: "我需要面對面聊聊！", hint: "需要留下稱呼與聯絡方式" },
];
export const RESP: Record<RespondKey, RespondDef> =
  Object.fromEntries(RESPONDS.map(r => [r.key, r])) as Record<RespondKey, RespondDef>;

export const STATUSES: StatusDef[] = [
  { key: "received", emoji: "📮", short: "已收到", label: "訊息已經反映成功", color: "#2f5d62", tint: "#e3efec" },
  { key: "seeded", emoji: "🌱", short: "等待發芽", label: "種子已種下，我們等待發芽", color: "#4f7d3a", tint: "#edf4e6" },
  { key: "thinking", emoji: "🧠", short: "燒腦中", label: "有難度！燒腦中，請給我們多一些時間努力", color: "#a86a12", tint: "#fbf1dc" },
  { key: "action", emoji: "⚡", short: "即刻處理", label: "即刻啟動處理", color: "#b85a42", tint: "#fbeae4" },
];
export const STAT: Record<StatusKey, StatusDef> =
  Object.fromEntries(STATUSES.map(s => [s.key, s])) as Record<StatusKey, StatusDef>;

export const CONTENT_MAX = 2000;
export const CONTENT_MIN = 5;

export const globalCSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-text-size-adjust:100%}
  body{font-family:'Noto Sans TC',sans-serif;background:${C.cream};color:${C.ink};-webkit-font-smoothing:antialiased;line-height:1.6}
  input,select,textarea,button{font-family:inherit}
  .display{font-family:${DISPLAY};letter-spacing:.02em}
  ::selection{background:${C.sun}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
  @keyframes float{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-8px) rotate(3deg)}}
  @keyframes wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}
  .fu{animation:fadeUp .35s ease both}
  .pop{animation:pop .3s cubic-bezier(.34,1.56,.64,1) both}
  .float{animation:float 5s ease-in-out infinite}
  .lift{transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease}
  .lift:hover{transform:translateY(-2px);box-shadow:${E[2]}}
  .chip-btn{transition:background .15s, color .15s, border-color .15s}
  a{color:${C.primary}}
  @media screen and (max-width:768px){ input,select,textarea{font-size:16px!important} }
  :focus-visible{outline:2.5px solid ${C.coral};outline-offset:2px}
  input:focus-visible,select:focus-visible,textarea:focus-visible{outline:none;border-color:${C.primary}!important;box-shadow:0 0 0 4px rgba(47,93,98,.14)}
  button:focus:not(:focus-visible){outline:none}
  @media (prefers-reduced-motion: reduce){ *{animation:none!important;transition:none!important} }
`;
