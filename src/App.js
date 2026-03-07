import { useState, useEffect, useRef } from "react";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const VERSION = "v2.9.0";
const BASE_URL = "https://www.daikenshop.com/allgoods.php";
const DEFAULT_BULLETIN = "每月月底結單，填寫完成後送出，我會與您聯繫確認付款方式 🙏";
const DEFAULT_BANK = { bankName: "玉山銀行", bankCode: "808", account: "0989979013999", accountName: "林志銘" };
const GAS_URL = "https://script.google.com/macros/s/AKfycbxqpzKiex-geXwk1hCVJcekhTL2bONYxq6GvjBDff9KufaQlOrGiAVo9ytH7iJ1JQrH/exec";
const WRITE_TOKEN = "Dk8mX4pQz7vR2nYw9sL5jB3hT6fA1cE";

// Email 格式驗證（要求 local 至少 2 字元、domain 至少有一個點、TLD 至少 2 字元）
const isValidEmail = (email) => /^[^\s@]{2,}@[^\s@]+\.[^\s@]{2,}$/.test(email);

// 過濾掉 _v 等 meta 欄位，只保留真正的資料項目
function dataEntries(obj) {
  if (!obj || typeof obj !== "object") return {};
  const clean = {};
  Object.entries(obj).forEach(([k,v]) => { if (!k.startsWith("_")) clean[k] = v; });
  return clean;
}

// ── STORAGE（透過 Google Apps Script 存入 Google Sheets）──────────────────
// 同步狀態通知（供 SyncStatus 元件使用）
let _syncListeners = [];
const _saveVersions = {};
function onSyncWarning(fn) { _syncListeners.push(fn); return () => { _syncListeners = _syncListeners.filter(f=>f!==fn); }; }
function _notifySyncWarning(key) { _syncListeners.forEach(fn=>fn(key)); }

// Optimistic Locking：記錄每個 key 載入時的 _v 版本號
const _loadedVersions = {};

async function load(key) {
  try {
    const url = `${GAS_URL}?action=get&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.success && json.value) {
      const parsed = JSON.parse(json.value);
      if (parsed && parsed._v) _loadedVersions[key] = parsed._v;
      return parsed;
    }
    return null;
  } catch(e) {
    console.warn("load fallback to localStorage:", key);
    try {
      const v = localStorage.getItem(key);
      if (!v) return null;
      const parsed = JSON.parse(v);
      if (parsed && parsed._v) _loadedVersions[key] = parsed._v;
      return parsed;
    } catch { return null; }
  }
}

async function save(key, val) {
  // 對訂單和顧客資料加入版本號（Optimistic Locking）
  const needsVersion = key.startsWith("orders_") || key === "customers";
  if (needsVersion && val && typeof val === "object") {
    val._v = Date.now();
  }

  const jsonStr = JSON.stringify(val);
  const version = (_saveVersions[key] || 0) + 1;
  _saveVersions[key] = version;
  // 同步寫入 localStorage 當快取（讓 UI 立即反應）
  try { localStorage.setItem(key, jsonStr); } catch {}
  // 寫入 Google Sheets（no-cors 避免 redirect 把 POST 變 GET）
  try {
    const params = new URLSearchParams();
    params.append("action", "set");
    params.append("key", key);
    params.append("value", jsonStr);
    params.append("token", WRITE_TOKEN);
    if (needsVersion) {
      params.append("baseV", String(_loadedVersions[key] || "0"));
    }
    await fetch(GAS_URL, { method: "POST", mode: "no-cors", body: params });
  } catch(e) { console.error("save to Sheets error:", key, e); }

  // 更新本地版本記錄
  if (needsVersion && val && val._v) {
    _loadedVersions[key] = val._v;
  }

  // Read-back 驗證（延遲 4 秒後讀回比對，只驗證最近一次 save）
  setTimeout(async () => {
    if (_saveVersions[key] !== version) return;
    try {
      const remote = await load(key);
      const remoteStr = JSON.stringify(remote);
      if (remoteStr !== jsonStr) {
        console.warn(`sync verify failed for "${key}": local/remote mismatch`);
        _notifySyncWarning(key);
      }
    } catch(e) { /* 驗證本身失敗，不處理 */ }
  }, 4000);
}

// ── EMAIL（透過 Apps Script 用 Gmail 寄出）────────────────────────────────
// ⚠️ 因 no-cors 限制，回傳值僅代表「請求已送出」，不代表信件實際寄送成功
//    建議寄送後至 Gmail「已傳送」信件匣確認
async function requestSendEmail({ to, subject, body, isHtml=false }) {
  try {
    const params = new URLSearchParams();
    params.append("action", "sendEmail");
    params.append("to", to);
    params.append("subject", subject);
    params.append("body", body);
    params.append("token", WRITE_TOKEN);
    if (isHtml) params.append("isHtml", "true");
    await fetch(GAS_URL, { method: "POST", mode: "no-cors", body: params });
    return "sent"; // 請求已送出（不保證實際寄達）
  } catch(e) {
    console.error("requestSendEmail error:", e);
    return "error"; // 網路錯誤，請求未送出
  }
}

const D = "https://www.daikenshop.com/product.php?code=";
const INIT_CATS = [
  { key:"fish", label:"🐟 魚油系列", products:[
    {id:"p1", name:"德國頂級魚油",                    price:700,  outOfStock:false, url:D+"4710255450036"},
    {id:"p2", name:"德國頂級魚油(旗艦加大120粒)",      price:1450, outOfStock:false, url:D+"4710255450487"},
    {id:"p3", name:"兒童DHA 80% 魚油軟膠囊",     price:450,  outOfStock:false, url:D+"4710255450364"},
    {id:"p4", name:"EPA 1200 頂級魚油軟膠囊",          price:820,  outOfStock:false, url:D+"4710255450920"},
    {id:"p5", name:"德國頂級魚油軟膠囊EX",        price:1008, outOfStock:false, url:D+"4710255450845"},
  ]},
  { key:"vitamin", label:"💊 維生素礦物質", products:[
    {id:"p6",  name:"倍力他命BELINAMIN膜衣錠",         price:475,  outOfStock:false, url:D+"4710255450722"},
    {id:"p7",  name:"德國高劑量維生素C＋鋅發泡錠",     price:130,  outOfStock:false, url:D+"4710255450814"},
    {id:"p8",  name:"維他命C緩釋膜衣錠",               price:240,  outOfStock:false, url:D+"4710255450067"},
    {id:"p9",  name:"西印度櫻桃維生素C膠囊",           price:240,  outOfStock:false, url:D+"4710255451088"},
    {id:"p10", name:"綜合維他命緩釋膜衣錠",            price:240,  outOfStock:false, url:D+"4710255450074"},
    {id:"p11", name:"綜合鈣+D3 粉包",                  price:390,  outOfStock:false, url:D+"4710255450173"},
    {id:"p12", name:"海藻鈣海洋精華膠囊",              price:390,  outOfStock:false, url:D+"4710255451095"},
    {id:"p13", name:"男性B群+鋅雙層錠",                price:240,  outOfStock:false, url:D+"4710255450043"},
    {id:"p14", name:"女性B群緩釋雙層錠",               price:240,  outOfStock:false, url:D+"4710255450050"},
    {id:"p15", name:"B群緩釋雙層錠",                   price:240,  outOfStock:false, url:D+"4710255450333"},
    {id:"p16", name:"維生素D3膠囊",                    price:300,  outOfStock:false, url:D+"4710255450456"},
  ]},
  { key:"cardio", label:"❤️ 心血管代謝", products:[
    {id:"p17", name:"納豆紅麴Q10膠囊",                 price:800,  outOfStock:false, url:D+"4710255450265"},
    {id:"p18", name:"台灣極品納豆膠囊",                price:450,  outOfStock:false, url:D+"4710255450951"},
    {id:"p19", name:"德國專利苦瓜胜肽膠囊",            price:820,  outOfStock:false, url:D+"4710255450647"},
    {id:"p20", name:"德國專利苦瓜胜肽膠囊EX",          price:1188, outOfStock:false, url:D+"4710255450869"},
    {id:"p21", name:"超燃藤黃果乳酸菌錠",              price:800,  outOfStock:false, url:D+"4710255451231"},
    {id:"p22", name:"超級1000薑黃錠",                  price:800,  outOfStock:false, url:D+"4710255451125"},
    {id:"p23", name:"薑黃朝鮮薊膠囊",                  price:800,  outOfStock:false, url:D+"4710255451064"},
  ]},
  { key:"eye", label:"👁 眼睛腦力", products:[
    {id:"p24", name:"視易適葉黃素",                    price:700,  outOfStock:false, url:D+"0000000000028"},
    {id:"p25", name:"視易適葉黃素軟膠囊EX",            price:900,  outOfStock:false, url:D+"4710255450852"},
    {id:"p26", name:"好記易PS銀杏薄荷葉膠囊",          price:1190, outOfStock:false, url:D+"4710255450777"},
  ]},
  { key:"gut", label:"🦠 腸道消化", products:[
    {id:"p27", name:"高膳食纖維粉包",                  price:250,  outOfStock:false, url:D+"4710255450616"},
    {id:"p28", name:"冒易舒接骨木莓粉包",              price:310,  outOfStock:false, url:D+"4710255450272"},
    {id:"p29", name:"順暢酵素益生菌粉包(30包入)",      price:730,  outOfStock:false, url:D+"4710255450524"},
    {id:"p30", name:"淨密樂甘露糖蔓越莓益生菌",        price:390,  outOfStock:false, url:D+"4710255450319"},
    {id:"p31", name:"健好衛高麗菜精乳酸菌粉包",        price:730,  outOfStock:false, url:D+"4710255450371"},
    {id:"p32", name:"化晶解風鰹魚酸櫻桃膠囊",          price:800,  outOfStock:false, url:D+"4710255451170"},
  ]},
  { key:"vitality", label:"⚡ 活力滋補", products:[
    {id:"p33", name:"精氣神瑪卡粉包",                  price:649,  outOfStock:false, url:D+"4710255450302"},
    {id:"p34", name:"精氣神瑪卡粉包(超值加大30包)",    price:790,  outOfStock:false, url:D+"4710255450500"},
    {id:"p35", name:"精氣神瑪卡粉包EX",                price:900,  outOfStock:false, url:D+"4710255450883"},
    {id:"p36", name:"100%黑瑪卡透納葉錠",              price:700,  outOfStock:false, url:D+"4710255450753"},
    {id:"p37", name:"好攝力南瓜籽黑麥花膠囊",          price:800,  outOfStock:false, url:D+"4710255450654"},
    {id:"p38", name:"台灣極品靈芝多醣體膠囊",          price:800,  outOfStock:false, url:D+"4710255450289"},
  ]},
  { key:"beauty", label:"✨ 美容保養", products:[
    {id:"p39", name:"超美研膠原蛋白飲",                price:450,  outOfStock:false, url:D+"4710255450821"},
    {id:"p40", name:"輕美研膠原蛋白粉",                price:420,  outOfStock:false, url:D+"4710255450890"},
    {id:"p41", name:"外泌體保濕修護精華",              price:730,  outOfStock:false, url:D+"4710255451132"},
    {id:"p42", name:"黑棗補鐵精華飲",                  price:450,  outOfStock:false, url:D+"4710255451101"},
  ]},
  { key:"joint", label:"🦴 關節骨骼", products:[
    {id:"p43", name:"動易動非變性二型膠原蛋白",        price:1290, outOfStock:false, url:D+"0000000000117"},
  ]},
  { key:"sleep", label:"😴 睡眠", products:[
    {id:"p44", name:"好睡眠芝麻素膠囊",                price:790,  outOfStock:false, url:D+"4710255450593"},
  ]},
];

// Flatten
function flatProducts(cats) {
  const m = {};
  cats.forEach(c => c.products.forEach(p => { m[p.id] = { ...p, category: c.key }; }));
  return m;
}


// ── EMAIL TEMPLATES（HTML 格式）────────────────────────────────────────────

// 共用 email 外框
function emailWrap(title, content) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f1ec;font-family:'Helvetica Neue',Arial,'Noto Sans TC',sans-serif;color:#1a1a1a">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#2d6a4f;color:#fff;padding:18px 24px;border-radius:14px 14px 0 0;text-align:center">
    <div style="font-size:18px;font-weight:700;letter-spacing:1px">大研生醫 × 團購專區</div>
    <div style="font-size:12px;opacity:.7;margin-top:4px">${title}</div>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 14px 14px;border:1px solid #e5e0d8;border-top:none">
    ${content}
  </div>
  <div style="text-align:center;padding:16px 0;font-size:11px;color:#9ca3af">
    本信件由系統自動寄出，如有疑問請直接回覆此信
  </div>
</div>
</body></html>`;
}

// 商品列表 HTML
function itemsTableHtml(items, fp, showOOS=false) {
  const oosItems = [];
  const rows = items.map(([id,q]) => {
    const p = fp[id]; if (!p) return "";
    if (showOOS && p.outOfStock) {
      oosItems.push(p.name);
      return `<tr style="color:#9ca3af"><td style="padding:8px 12px;border-bottom:1px solid #f0ede8">${p.name}</td><td style="padding:8px 12px;border-bottom:1px solid #f0ede8;text-align:center">${q}</td><td style="padding:8px 12px;border-bottom:1px solid #f0ede8;text-align:right;text-decoration:line-through">NT$${(p.price*q).toLocaleString()}</td></tr>`;
    }
    return `<tr><td style="padding:8px 12px;border-bottom:1px solid #f0ede8">${p.name}</td><td style="padding:8px 12px;border-bottom:1px solid #f0ede8;text-align:center">${q}</td><td style="padding:8px 12px;border-bottom:1px solid #f0ede8;text-align:right;font-weight:600;color:#2d6a4f">NT$${(p.price*q).toLocaleString()}</td></tr>`;
  }).filter(Boolean).join("");

  const table = `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
    <thead><tr style="background:#f0faf4"><th style="padding:8px 12px;text-align:left;font-weight:600;color:#2d6a4f;border-bottom:2px solid #d8f3dc">品項</th><th style="padding:8px 12px;text-align:center;font-weight:600;color:#2d6a4f;border-bottom:2px solid #d8f3dc">數量</th><th style="padding:8px 12px;text-align:right;font-weight:600;color:#2d6a4f;border-bottom:2px solid #d8f3dc">金額</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  return { table, oosItems };
}

function genConfirmEmail(order, cats) {
  const fp = flatProducts(cats);
  const items = Object.entries(order.cart).filter(([,q])=>q>0);
  const { table } = itemsTableHtml(items, fp);

  const content = `
    <div style="font-size:15px;line-height:1.8;margin-bottom:16px">
      <strong>${order.ordererName}</strong> 您好，感謝您的訂購！
    </div>
    ${table}
    <div style="background:#f0faf4;border-radius:10px;padding:14px 18px;margin:16px 0;text-align:right">
      <span style="font-size:13px;color:#6b7280">訂單總金額</span>
      <span style="font-size:22px;font-weight:700;color:#2d6a4f;margin-left:10px">NT$${order.total.toLocaleString()}</span>
    </div>
    <div style="background:#faf7f2;border-radius:10px;padding:14px 18px;margin:16px 0;font-size:13px;line-height:2;color:#4a5568">
      <div style="font-weight:600;margin-bottom:4px;color:#1a1a1a">▸ 收件資訊</div>
      收件人：${order.recipientName}<br>
      電　話：${order.recipientPhone}<br>
      地　址：${order.recipientAddress}
    </div>
    <div style="font-size:13px;color:#6b7280;line-height:1.8;margin-top:16px">
      我們將於月底結單後與您聯繫確認付款。<br>如需修改訂單，請至 <a href="https://jamy84464.github.io/daiken-order/" style="color:#2d6a4f;font-weight:600">訂購頁面</a> 以此 Email 登入修改。<br><br>
      感謝您對大研生醫的支持，祝福您與家人身體健康！
    </div>`;
  return emailWrap("訂購確認", content);
}

function genPaymentEmail(order, bank, cats) {
  const fp = flatProducts(cats);
  const items = Object.entries(order.cart).filter(([,q])=>q>0);
  const { table, oosItems } = itemsTableHtml(items, fp, true);
  const actualTotal = items.reduce((s,[id,q])=>{
    const p=fp[id]; return (!p||p.outOfStock)?s:s+(p.price*q);
  },0);

  const oosNote = oosItems.length>0
    ? `<div style="background:#fff5f5;border:1px solid #feb2b2;border-radius:8px;padding:10px 14px;margin:10px 0;font-size:12px;color:#c0392b;line-height:1.7">
        ※ 以下品項目前缺貨，已從金額中扣除：<br>${oosItems.map(n=>"・"+n).join("<br>")}
       </div>` : "";

  const content = `
    <div style="font-size:15px;line-height:1.8;margin-bottom:16px">
      <strong>${order.ordererName}</strong> 您好，以下是您的訂單與匯款資訊：
    </div>
    ${table}
    ${oosNote}
    <div style="background:#f0faf4;border-radius:10px;padding:14px 18px;margin:16px 0;text-align:right">
      <span style="font-size:13px;color:#6b7280">實際應付總金額</span>
      <span style="font-size:22px;font-weight:700;color:#2d6a4f;margin-left:10px">NT$${actualTotal.toLocaleString()}</span>
    </div>
    <div style="background:#faf7f2;border-radius:10px;padding:14px 18px;margin:16px 0;font-size:13px;line-height:2;color:#4a5568">
      <div style="font-weight:600;margin-bottom:4px;color:#1a1a1a">▸ 收件資訊</div>
      收件人：${order.recipientName}<br>
      電　話：${order.recipientPhone}<br>
      地　址：${order.recipientAddress}
    </div>
    <div style="background:#fffbeb;border:1.5px solid #f6ad55;border-radius:10px;padding:16px 18px;margin:16px 0">
      <div style="font-weight:700;font-size:14px;color:#b7791f;margin-bottom:8px">▸ 匯款資訊</div>
      <div style="font-size:14px;line-height:2;color:#1a1a1a">
        銀行：${bank.bankName}（${bank.bankCode}）<br>
        戶名：${bank.accountName||""}<br>
        帳號：<strong style="font-size:16px;letter-spacing:1px">${bank.account}</strong>
      </div>
      <div style="font-size:12px;color:#b7791f;margin-top:8px;line-height:1.6">
        再麻煩匯款後回覆您的匯款帳號後五碼，方便我們核對，謝謝！
      </div>
    </div>
    <div style="font-size:13px;color:#6b7280;line-height:1.8;margin-top:16px">
      感謝您對大研生醫的支持，祝福您與家人身體健康！
    </div>`;
  return emailWrap("匯款通知", content);
}

function genNoticeEmail(name, noticeText) {
  const content = `
    <div style="font-size:15px;line-height:1.8;margin-bottom:16px">
      <strong>${name}</strong> 您好，
    </div>
    <div style="font-size:14px;line-height:2;color:#1a1a1a;padding:16px 0;white-space:pre-wrap">${noticeText.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
    <div style="font-size:13px;color:#6b7280;line-height:1.8;margin-top:16px">
      如有疑問請與我聯繫，感謝您的支持！
    </div>`;
  return emailWrap("特別通知", content);
}

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
const C = {
  green:"#2d6a4f", gl:"#40916c", gp:"#d8f3dc", gold:"#b7791f",
  cream:"#faf7f2", text:"#1a1a1a", muted:"#6b7280", border:"#e5e0d8",
  red:"#c0392b", white:"#fff",
};
const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;600;700&family=Noto+Sans+TC:wght@300;400;500;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Noto Sans TC',sans-serif;background:${C.cream};color:${C.text}}
  input,select,textarea,button{font-family:'Noto Sans TC',sans-serif}
  .serif{font-family:'Noto Serif TC',serif}
  input[type=number]{-moz-appearance:textfield}
  input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
  ::-webkit-scrollbar{width:4px}
  ::-webkit-scrollbar-thumb{background:${C.gp};border-radius:2px}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pop{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:scale(1)}}
  .fu{animation:fadeUp .3s ease}
  .pop{animation:pop .25s cubic-bezier(.34,1.56,.64,1)}
  a{color:${C.gl};text-decoration:none}
  a:hover{text-decoration:underline}
`;

// ── UI ATOMS ──────────────────────────────────────────────────────────────────
const Btn = ({onClick,children,color=C.green,outline,small,disabled,full,style={}})=>(
  <button onClick={onClick} disabled={disabled} style={{
    background:outline?"transparent":disabled?"#aaa":color,
    color:outline?color:C.white,
    border:`1.5px solid ${disabled?"#aaa":color}`,
    borderRadius:9,padding:small?"6px 12px":"10px 18px",
    fontSize:small?"0.78rem":"0.87rem",fontWeight:600,cursor:disabled?"not-allowed":"pointer",
    width:full?"100%":"auto",transition:"all .15s",...style,
  }}>{children}</button>
);

const Field = ({label,required,children,error})=>(
  <div style={{marginBottom:13}}>
    <label style={{display:"block",fontSize:"0.77rem",color:C.muted,marginBottom:4,fontWeight:500}}>
      {label}{required&&<span style={{color:C.red}}> *</span>}
    </label>
    {children}
    {error&&<div style={{color:C.red,fontSize:"0.73rem",marginTop:3}}>{error}</div>}
  </div>
);

const inp = (extra={})=>({
  width:"100%",border:`1.5px solid ${C.border}`,borderRadius:8,
  padding:"8px 11px",fontSize:"0.86rem",background:C.cream,outline:"none",...extra,
});

const TextInput = ({value,onChange,placeholder,type="text",onFocus,onBlur})=>(
  <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    style={inp()} onFocus={e=>{e.target.style.borderColor=C.green;onFocus&&onFocus(e)}}
    onBlur={e=>{e.target.style.borderColor=C.border;onBlur&&onBlur(e)}} />
);

const SelInput = ({value,onChange,options})=>(
  <select value={value} onChange={e=>onChange(e.target.value)} style={inp()}>
    <option value="">請選擇</option>
    {options.map(o=><option key={o.v||o} value={o.v||o}>{o.l||o}</option>)}
  </select>
);

const TextArea = ({value,onChange,rows=3,placeholder})=>(
  <textarea value={value} onChange={e=>onChange(e.target.value)} rows={rows} placeholder={placeholder}
    style={{...inp(),resize:"vertical"}} />
);

// ── RWD HOOK ─────────────────────────────────────────────────────────────────
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

// ── SYNC STATUS（雲端同步失敗警告）──────────────────────────────────────────
function SyncStatus() {
  const [warnings, setWarnings] = useState([]);
  useEffect(() => {
    return onSyncWarning((key) => {
      setWarnings(prev => {
        if (prev.includes(key)) return prev;
        return [...prev, key];
      });
    });
  }, []);
  if (warnings.length === 0) return null;
  return (
    <div style={{
      position:"fixed",bottom:16,left:"50%",transform:"translateX(-50%)",
      zIndex:3000,background:"#fff5f5",border:`1.5px solid ${C.red}`,
      borderRadius:12,padding:"10px 18px",boxShadow:"0 4px 20px rgba(0,0,0,.15)",
      maxWidth:420,width:"calc(100% - 32px)",fontSize:"0.82rem",lineHeight:1.7,
    }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
        <div>
          <strong style={{color:C.red}}>⚠️ 雲端同步異常</strong><br/>
          部分資料可能未成功寫入 Google Sheets，請稍後重新整理頁面確認。
        </div>
        <button onClick={()=>setWarnings([])}
          style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:"1.1rem",flexShrink:0}}>✕</button>
      </div>
    </div>
  );
}

// Email Modal
function EmailModal({title,content,onClose}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div className="pop" style={{background:C.white,borderRadius:18,width:"100%",maxWidth:520,maxHeight:"85vh",overflow:"auto",boxShadow:"0 8px 40px rgba(0,0,0,.15)"}}>
        <div style={{background:C.green,color:C.white,padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:"18px 18px 0 0"}}>
          <span className="serif" style={{fontWeight:700}}>{title}</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.white,cursor:"pointer",fontSize:"1.2rem"}}>✕</button>
        </div>
        <div style={{padding:20}}>
          <textarea readOnly value={content} rows={16}
            onFocus={e=>e.target.select()}
            style={{width:"100%",border:`1.5px solid ${C.border}`,borderRadius:8,padding:"10px 12px",fontSize:"0.8rem",fontFamily:"monospace",background:"#f8f8f5",resize:"vertical",outline:"none",lineHeight:1.8}}
          />
          <div style={{marginTop:12}}>
            <Btn onClick={onClose} outline color={C.muted} small>關閉</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// Confirm Modal
function ConfirmModal({msg,onOk,onCancel}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div className="pop" style={{background:C.white,borderRadius:16,padding:28,maxWidth:380,width:"100%",textAlign:"center"}}>
        <div style={{fontSize:"0.92rem",lineHeight:1.8,marginBottom:20}}>{msg}</div>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <Btn onClick={onOk} color={C.red}>確認</Btn>
          <Btn onClick={onCancel} outline color={C.muted}>取消</Btn>
        </div>
      </div>
    </div>
  );
}

// ── SHOP VIEW ─────────────────────────────────────────────────────────────────
function ShopView({settings,cats,onOrderSuccess}) {
  const [tab,setTab]=useState("all");
  const [cart,setCart]=useState({});
  const [form,setForm]=useState({email:"",emailConfirm:"",ordererName:"",phone:"",relation:"",recipientName:"",recipientAddress:"",recipientPhone:""});
  const [submitting,setSubmitting]=useState(false);
  const [errors,setErrors]=useState({});
  const [emailLookupDone,setEmailLookupDone]=useState(false);
  const [emailChecked,setEmailChecked]=useState(false);
  const [lookingUp,setLookingUp]=useState(false);
  const recipientLinked = useRef(true);
  const isMobile = useIsMobile();
  const cartRef = useRef(null);

  const fp = flatProducts(cats);
  const cartItems = Object.entries(cart).filter(([,q])=>q>0);
  const total = cartItems.reduce((s,[id,q])=>s+(fp[id]?.price||0)*q,0);

  const setQ=(id,q)=>setCart(p=>({...p,[id]:Math.max(0,Math.min(99,q))}));
  const setF=(k,v)=>setForm(p=>({...p,[k]:v}));

  // 輸入 email 後離開欄位時，查詢歷史訂購人清單
  const handleEmailBlur=async()=>{
    const ek=form.email.trim().toLowerCase();
    if(!ek||!isValidEmail(ek)){setEmailChecked(true);return;}
    setLookingUp(true);
    const custs=await load("customers")||{};
    const found=custs[ek];
    setLookingUp(false);
    setEmailChecked(true);
    if(found){
      // 帶入歷史資料
      setForm(p=>({...p,
        ordererName: found.name||"",
        phone:       found.phone||"",
        relation:    found.relation||"",
        recipientName:    found.lastRecipientName||"",
        recipientAddress: found.lastRecipientAddress||"",
        recipientPhone:   found.lastRecipientPhone||"",
        emailConfirm: ek, // 已知 email 不需再確認
      }));
      setEmailLookupDone(true);
    } else {
      setEmailLookupDone(false);
    }
  };

  const validate=()=>{
    const e={};
    if(!form.email||!isValidEmail(form.email.trim())) e.email="請填寫有效 Email";
    if(!emailLookupDone && form.email.trim().toLowerCase()!==form.emailConfirm.trim().toLowerCase()) e.emailConfirm="兩次 Email 不一致";
    if(!form.ordererName) e.ordererName="必填";
    if(!form.phone) e.phone="必填";
    if(!form.relation) e.relation="必填";
    if(!form.recipientName) e.recipientName="必填";
    if(!form.recipientAddress) e.recipientAddress="必填";
    if(!form.recipientPhone) e.recipientPhone="必填";
    if(cartItems.length===0) e.cart="請至少選擇一項商品";
    setErrors(e);
    return Object.keys(e).length===0;
  };

  const submit=async()=>{
    if(!validate()) return;
    setSubmitting(true);
    try {
      const key=`orders_${settings.year}_${String(settings.month).padStart(2,"0")}`;
      const existing = await load(key)||{};
      const ek=form.email.trim().toLowerCase();
      const order = {
        ordererName:form.ordererName, email:ek, phone:form.phone,
        relation:form.relation,
        recipientName:form.recipientName, recipientAddress:form.recipientAddress, recipientPhone:form.recipientPhone,
        cart, total,
        status:"pending",
        createdAt:new Date().toLocaleString("zh-TW"),
        updatedAt:null,
      };
      existing[ek] = order;
      await save(key, existing);
      // 更新歷史訂購人清單（email 為唯一 key，name/phone 有異動則更新）
      const custs = await load("customers")||{};
      custs[ek] = {
        name:    form.ordererName,
        email:   ek,
        phone:   form.phone,
        relation:form.relation,
        lastRecipientName:    form.recipientName,
        lastRecipientAddress: form.recipientAddress,
        lastRecipientPhone:   form.recipientPhone,
        lastOrder:`${settings.year}/${settings.month}`,
        orderCount:(custs[ek]?.orderCount||0)+1,
        firstOrderAt: custs[ek]?.firstOrderAt||new Date().toLocaleString("zh-TW"),
      };
      await save("customers",custs);
      // 自動寄出訂購確認信
      const emailContent = genConfirmEmail(order,cats);
      requestSendEmail({
        to: ek,
        subject: `【大研生醫團購】${settings.year}年${settings.month}月 訂購確認 — ${form.ordererName}`,
        body: emailContent,
        isHtml: true,
      });
      setSubmitting(false);
      onOrderSuccess(order);
      setCart({});
      setForm({email:"",emailConfirm:"",ordererName:"",phone:"",relation:"",recipientName:"",recipientAddress:"",recipientPhone:""});
      setEmailLookupDone(false);
      setEmailChecked(false);
    } catch(err) {
      console.error("Submit error:", err);
      alert("送出時發生錯誤，請再試一次。\n" + err.message);
      setSubmitting(false);
    }
  };

  const shown = tab==="all"
    ? cats.map(c=>({...c,products:c.products.filter(p=>!p.hidden)})).filter(c=>c.products.length>0)
    : cats.filter(c=>c.key===tab).map(c=>({...c,products:c.products.filter(p=>!p.hidden)}));

  return (
    <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 330px",gap:isMobile?16:24,alignItems:"start"}}>
      {/* Mobile: 浮動購物車摘要列 */}
      {isMobile&&cartItems.length>0&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:200,background:C.green,color:C.white,padding:"10px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 -3px 16px rgba(0,0,0,.2)"}}>
          <div>
            <span style={{fontSize:"0.82rem"}}>{cartItems.length} 種商品</span>
            <span className="serif" style={{fontSize:"1.15rem",fontWeight:700,marginLeft:10}}>NT${total.toLocaleString()}</span>
          </div>
          <button onClick={()=>cartRef.current?.scrollIntoView({behavior:"smooth"})}
            style={{background:"rgba(255,255,255,.2)",color:C.white,border:"1px solid rgba(255,255,255,.4)",borderRadius:8,padding:"7px 14px",fontSize:"0.82rem",cursor:"pointer",fontFamily:"'Noto Sans TC',sans-serif",fontWeight:600}}>
            前往結帳 ▼
          </button>
        </div>
      )}
      {/* Products */}
      <div>
        {errors.cart&&<div style={{background:"#fff5f5",border:`1px solid ${C.red}`,borderRadius:8,padding:"8px 14px",fontSize:"0.82rem",color:C.red,marginBottom:14}}>{errors.cart}</div>}
        {/* Tabs */}
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:18}}>
          {[{key:"all",label:"全部"}, ...cats.map(c=>({key:c.key,label:c.label}))].map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)} style={{
              background:tab===t.key?C.green:C.white,color:tab===t.key?C.white:C.muted,
              border:`1.5px solid ${tab===t.key?C.green:C.border}`,borderRadius:20,
              padding:"5px 12px",fontSize:"0.78rem",cursor:"pointer",transition:"all .15s",
            }}>{t.label}</button>
          ))}
        </div>
        {shown.map(cat=>(
          <div key={cat.key} style={{marginBottom:26}}>
            <div className="serif" style={{fontSize:"0.93rem",fontWeight:600,color:C.green,marginBottom:10,paddingBottom:7,borderBottom:`2px solid ${C.gp}`}}>{cat.label}</div>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(auto-fill,minmax(195px,1fr))",gap:isMobile?8:10}}>
              {cat.products.map(p=>{
                const q=cart[p.id]||0;
                return (
                  <div key={p.id} style={{background:p.outOfStock?"#f5f5f5":q>0?"#f0faf4":C.white,border:`1.5px solid ${q>0?C.green:C.border}`,borderRadius:isMobile?10:12,padding:isMobile?10:13,opacity:p.outOfStock?.6:1,transition:"all .15s"}}>
                    <a href={p.url||BASE_URL} target="_blank" rel="noreferrer" style={{fontSize:isMobile?"0.76rem":"0.83rem",fontWeight:500,lineHeight:1.4,display:"block",minHeight:"2.2em",color:C.text,textDecoration:"none"}}
                      onMouseEnter={e=>e.currentTarget.style.color=C.gl} onMouseLeave={e=>e.currentTarget.style.color=C.text}>
                      {p.name} 🔗
                    </a>
                    <div className="serif" style={{fontSize:isMobile?"0.9rem":"1rem",fontWeight:700,color:C.green,margin:isMobile?"4px 0":"6px 0"}}>NT${p.price.toLocaleString()}</div>
                    {p.outOfStock
                      ? <div style={{background:"#eee",color:C.muted,borderRadius:7,padding:"6px 0",textAlign:"center",fontSize:"0.8rem"}}>暫時缺貨</div>
                      : <div style={{display:"flex",border:`1.5px solid ${C.border}`,borderRadius:7,overflow:"hidden",width:"100%"}}>
                          <button onClick={()=>setQ(p.id,q-1)} style={{flexShrink:0,width:isMobile?28:32,height:isMobile?28:32,background:C.cream,border:"none",cursor:"pointer",color:C.green,fontWeight:700,fontSize:isMobile?"0.9rem":"1rem"}}>−</button>
                          <input type="number" value={q} onChange={e=>setQ(p.id,parseInt(e.target.value)||0)} style={{flex:1,minWidth:0,width:0,border:"none",textAlign:"center",fontSize:isMobile?"0.82rem":"0.88rem",fontWeight:600,background:C.white,outline:"none"}} />
                          <button onClick={()=>setQ(p.id,q+1)} style={{flexShrink:0,width:isMobile?28:32,height:isMobile?28:32,background:C.cream,border:"none",cursor:"pointer",color:C.green,fontWeight:700,fontSize:isMobile?"0.9rem":"1rem"}}>＋</button>
                        </div>
                    }
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sidebar: Cart + Form */}
      <div ref={cartRef} style={{position:isMobile?"static":"sticky",top:72,display:"flex",flexDirection:"column",gap:14,paddingBottom:isMobile&&cartItems.length>0?60:0,...(!isMobile&&{maxHeight:"calc(100vh - 88px)",overflow:"hidden"})}}>
        {/* Cart — 永遠可見，不隨表單捲動 */}
        <div style={{flexShrink:0,background:C.white,border:`1.5px solid ${C.border}`,borderRadius:16,overflow:"hidden",boxShadow:"0 3px 18px rgba(0,0,0,.06)"}}>
          <div style={{background:C.green,color:C.white,padding:"13px 17px",fontWeight:600,fontSize:"0.93rem"}}>
            🛒 購物車 {cartItems.length>0&&<span style={{background:"rgba(255,255,255,.2)",borderRadius:9,padding:"2px 8px",fontSize:"0.75rem",marginLeft:6}}>{cartItems.length} 種</span>}
          </div>
          <div style={{padding:"10px 16px",maxHeight:180,overflowY:"auto"}}>
            {cartItems.length===0
              ? <div style={{textAlign:"center",color:C.muted,fontSize:"0.82rem",padding:"18px 0",lineHeight:2}}>尚未加入商品</div>
              : cartItems.map(([id,q])=>{const p=fp[id];return p&&(
                  <div key={id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`,gap:8,fontSize:"0.8rem"}}>
                    <span style={{flex:1,lineHeight:1.4}}>{p.name}</span>
                    <div style={{display:"flex",alignItems:"center",gap:3}}>
                      <button onClick={()=>setQ(id,q-1)} style={{width:20,height:20,border:`1px solid ${C.border}`,borderRadius:4,background:C.cream,cursor:"pointer",color:C.green,fontWeight:700,fontSize:"0.85rem"}}>−</button>
                      <span style={{minWidth:18,textAlign:"center",fontWeight:600}}>{q}</span>
                      <button onClick={()=>setQ(id,q+1)} style={{width:20,height:20,border:`1px solid ${C.border}`,borderRadius:4,background:C.cream,cursor:"pointer",color:C.green,fontWeight:700,fontSize:"0.85rem"}}>＋</button>
                    </div>
                    <span style={{fontWeight:600,color:C.green,whiteSpace:"nowrap"}}>NT${(p.price*q).toLocaleString()}</span>
                  </div>
                );})
            }
          </div>
          <div style={{padding:"11px 17px",background:C.cream,borderTop:`2px solid ${C.gp}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:"0.83rem",color:C.muted}}>合計</span>
            <span className="serif" style={{fontSize:"1.35rem",fontWeight:700,color:C.green}}>NT${total.toLocaleString()}</span>
          </div>
        </div>

        {/* Order Form — 超出高度時獨立捲動 */}
        <div style={{flex:1,minHeight:0,overflowY:"auto",background:C.white,border:`1.5px solid ${C.border}`,borderRadius:16,padding:17}}>
          <div className="serif" style={{fontSize:"0.9rem",fontWeight:700,marginBottom:14,color:C.text,paddingBottom:8,borderBottom:`2px solid ${C.gp}`}}>📋 訂購人資訊</div>

          {/* Email 先填，查詢歷史紀錄 */}
          <Field label="Email" required error={errors.email}>
            <TextInput value={form.email} onChange={v=>{setF("email",v);setEmailLookupDone(false);setEmailChecked(false);setErrors(p=>({...p,email:null,emailConfirm:null}));}} type="email" placeholder="請先輸入 Email"
              onBlur={handleEmailBlur} />
          </Field>
          {lookingUp&&(
            <div style={{background:"rgba(250,247,242,.85)",border:`1.5px solid ${C.border}`,borderRadius:10,padding:"20px 16px",textAlign:"center",margin:"8px 0"}}>
              <div style={{fontSize:"1.1rem",marginBottom:6}}>🔍</div>
              <div style={{fontSize:"0.82rem",color:C.muted}}>查詢歷史訂購紀錄中，請稍候…</div>
            </div>
          )}
          {emailChecked&&emailLookupDone&&<div style={{background:C.gp,border:`1px solid ${C.gl}`,borderRadius:7,padding:"7px 11px",fontSize:"0.78rem",color:C.green,marginTop:-8,marginBottom:10}}>✅ 找到歷史紀錄，已自動帶入資料</div>}
          {emailChecked&&!emailLookupDone&&form.email&&isValidEmail(form.email)&&(
            <Field label="再次確認 Email" required error={errors.emailConfirm}>
              <TextInput value={form.emailConfirm} onChange={v=>{setF("emailConfirm",v);setErrors(p=>({...p,emailConfirm:null}));}} type="email" placeholder="請再輸入一次 Email 確認" />
            </Field>
          )}

          {/* 查詢中遮蔽其餘欄位 */}
          <div style={{position:"relative",...(lookingUp&&{pointerEvents:"none",opacity:0.35,filter:"blur(1px)"})}}>
          <Field label="姓名" required error={errors.ordererName}><TextInput value={form.ordererName} onChange={v=>{
            setF("ordererName",v);
            if(recipientLinked.current) setF("recipientName",v);
          }} placeholder="姓名" /></Field>
          <Field label="手機" required error={errors.phone}><TextInput value={form.phone} onChange={v=>{
            setF("phone",v);
            if(recipientLinked.current) setF("recipientPhone",v);
          }} type="tel" placeholder="0912-345-678" /></Field>
          <Field label="與我的關係" required error={errors.relation}>
            <SelInput value={form.relation} onChange={v=>setF("relation",v)} options={["109A同學","109B同學","109C同學","EMBA學長姐","老師","朋友","其他"]} />
          </Field>

          <div className="serif" style={{fontSize:"0.9rem",fontWeight:700,margin:"14px 0 10px",color:C.text,paddingBottom:8,borderBottom:`2px solid ${C.gp}`}}>📦 收件人資訊</div>
          <Field label="收件人姓名" required error={errors.recipientName}><TextInput value={form.recipientName} onChange={v=>{recipientLinked.current=false; setF("recipientName",v);}} placeholder="收件人姓名" /></Field>
          <Field label="收件地址" required error={errors.recipientAddress}><TextInput value={form.recipientAddress} onChange={v=>setF("recipientAddress",v)} placeholder="縣市 + 詳細地址" /></Field>
          <Field label="收件人電話" required error={errors.recipientPhone}><TextInput value={form.recipientPhone} onChange={v=>{recipientLinked.current=false; setF("recipientPhone",v);}} type="tel" placeholder="0912-345-678" /></Field>

          <Btn onClick={submit} disabled={submitting||lookingUp} full color={C.green} style={{marginTop:4,padding:"13px"}}>
            {submitting?"處理中…":"送出訂單 ✉️"}
          </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MY ORDER VIEW ─────────────────────────────────────────────────────────────
function MyOrderView({settings,cats}) {
  const [email,setEmail]=useState("");
  const [order,setOrder]=useState(null);
  const [notFound,setNotFound]=useState(false);
  const [loading,setLoading]=useState(false);
  const [editMode,setEditMode]=useState(false);
  const [cart,setCart]=useState({});
  const [form,setForm]=useState({});
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const fp=flatProducts(cats);
  const isMobile=useIsMobile();

  const lookup=async()=>{
    if(!email.trim()){return;}
    setLoading(true);setNotFound(false);setOrder(null);setSaved(false);
    const key=`orders_${settings.year}_${String(settings.month).padStart(2,"0")}`;
    const orders=await load(key)||{};
    const found=orders[email.toLowerCase().trim()];
    setLoading(false);
    if(found){setOrder(found);}else{setNotFound(true);}
  };

  const startEdit=()=>{
    setCart({...order.cart});
    setForm({ordererName:order.ordererName,email:order.email,lineId:order.lineId||"",phone:order.phone,relation:order.relation,recipientName:order.recipientName,recipientAddress:order.recipientAddress,recipientPhone:order.recipientPhone,note:order.note||""});
    setEditMode(true);setSaved(false);
  };

  const handleSave=async()=>{
    if(!Object.values(cart).some(q=>q>0)){alert("購物車是空的！");return;}
    setSaving(true);
    const key=`orders_${settings.year}_${String(settings.month).padStart(2,"0")}`;
    const orders=await load(key)||{};
    const updated={...orders[email.toLowerCase()], ...form, cart,
      total:Object.entries(cart).filter(([,q])=>q>0).reduce((s,[id,q])=>s+(fp[id]?.price||0)*q,0),
      updatedAt:new Date().toLocaleString("zh-TW"),
    };
    orders[email.toLowerCase()]=updated;
    await save(key,orders);
    // 修改後重新寄送訂購確認信
    requestSendEmail({
      to: email.toLowerCase(),
      subject: `【大研生醫團購】${settings.year}年${settings.month}月 訂單已更新 — ${updated.ordererName}`,
      body: genConfirmEmail(updated, cats),
      isHtml: true,
    });
    setSaving(false);setOrder(updated);setEditMode(false);setSaved(true);
  };

  if(editMode) return (
    <div className="fu">
      <button onClick={()=>setEditMode(false)} style={{background:"none",border:"none",color:C.green,cursor:"pointer",fontSize:"0.85rem",marginBottom:14}}>← 取消修改</button>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 330px",gap:isMobile?16:24,alignItems:"start"}}>
        {/* mini product grid */}
        <div>
          {cats.map(cat=>{
            const visibleProds=cat.products.filter(p=>!p.hidden&&!p.outOfStock);
            if(visibleProds.length===0) return null;
            return (
              <div key={cat.key} style={{marginBottom:22}}>
                <div className="serif" style={{fontSize:"0.9rem",fontWeight:600,color:C.green,marginBottom:9,paddingBottom:6,borderBottom:`2px solid ${C.gp}`}}>{cat.label}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:9}}>
                  {visibleProds.map(p=>{
                    const q=cart[p.id]||0;
                    return (
                      <div key={p.id} style={{background:q>0?"#f0faf4":C.white,border:`1.5px solid ${q>0?C.green:C.border}`,borderRadius:11,padding:12}}>
                        <div style={{fontSize:"0.82rem",fontWeight:500,lineHeight:1.4,marginBottom:6}}>{p.name}</div>
                        <div className="serif" style={{fontSize:"0.97rem",fontWeight:700,color:C.green,marginBottom:6}}>NT${p.price.toLocaleString()}</div>
                        <div style={{display:"flex",border:`1.5px solid ${C.border}`,borderRadius:7,overflow:"hidden",width:"100%"}}>
                          <button onClick={()=>setCart(prev=>({...prev,[p.id]:Math.max(0,(prev[p.id]||0)-1)}))} style={{flexShrink:0,width:32,height:32,background:C.cream,border:"none",cursor:"pointer",color:C.green,fontWeight:700}}>−</button>
                          <input type="number" value={q} onChange={e=>setCart(prev=>({...prev,[p.id]:Math.max(0,parseInt(e.target.value)||0)}))} style={{flex:1,minWidth:0,border:"none",textAlign:"center",fontSize:"0.86rem",fontWeight:600,background:C.white,outline:"none"}} />
                          <button onClick={()=>setCart(prev=>({...prev,[p.id]:(prev[p.id]||0)+1}))} style={{flexShrink:0,width:32,height:32,background:C.cream,border:"none",cursor:"pointer",color:C.green,fontWeight:700}}>＋</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {/* Edit sidebar: cart summary + form */}
        <div style={{position:isMobile?"static":"sticky",top:72,display:"flex",flexDirection:"column",gap:14,...(!isMobile&&{maxHeight:"calc(100vh - 88px)",overflow:"hidden"})}}>
          {/* Cart summary */}
          {(()=>{const editItems=Object.entries(cart).filter(([,q])=>q>0);const editTotal=editItems.reduce((s,[id,q])=>s+(fp[id]?.price||0)*q,0);return(
          <div style={{flexShrink:0,background:C.white,border:`1.5px solid ${C.border}`,borderRadius:16,overflow:"hidden",boxShadow:"0 3px 18px rgba(0,0,0,.06)"}}>
            <div style={{background:C.green,color:C.white,padding:"12px 16px",fontWeight:600,fontSize:"0.9rem"}}>
              🛒 修改中的購物車 {editItems.length>0&&<span style={{background:"rgba(255,255,255,.2)",borderRadius:9,padding:"2px 8px",fontSize:"0.75rem",marginLeft:6}}>{editItems.length} 種</span>}
            </div>
            <div style={{padding:"8px 14px",maxHeight:160,overflowY:"auto"}}>
              {editItems.length===0
                ?<div style={{textAlign:"center",color:C.muted,fontSize:"0.82rem",padding:"14px 0"}}>尚未加入商品</div>
                :editItems.map(([id,q])=>{const p=fp[id];return p&&(
                  <div key={id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${C.border}`,gap:6,fontSize:"0.78rem"}}>
                    <span style={{flex:1,lineHeight:1.4}}>{p.name} × {q}</span>
                    <span style={{fontWeight:600,color:C.green,whiteSpace:"nowrap"}}>NT${(p.price*q).toLocaleString()}</span>
                  </div>
              );})
              }
            </div>
            <div style={{padding:"10px 16px",background:C.cream,borderTop:`2px solid ${C.gp}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:"0.82rem",color:C.muted}}>合計</span>
              <span className="serif" style={{fontSize:"1.2rem",fontWeight:700,color:C.green}}>NT${editTotal.toLocaleString()}</span>
            </div>
          </div>);})()}
          {/* Edit form */}
          <div style={{flex:1,minHeight:0,overflowY:"auto",background:C.white,border:`1.5px solid ${C.border}`,borderRadius:16,padding:17}}>
          <div className="serif" style={{fontSize:"0.9rem",fontWeight:700,marginBottom:12}}>修改收件資訊</div>
          <Field label="收件人姓名" required><TextInput value={form.recipientName} onChange={v=>setForm(p=>({...p,recipientName:v}))} /></Field>
          <Field label="收件地址" required><TextInput value={form.recipientAddress} onChange={v=>setForm(p=>({...p,recipientAddress:v}))} /></Field>
          <Field label="收件人電話" required><TextInput value={form.recipientPhone} onChange={v=>setForm(p=>({...p,recipientPhone:v}))} /></Field>
          <Btn onClick={handleSave} disabled={saving} full>✅ {saving?"儲存中…":"確認更新訂單"}</Btn>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fu" style={{maxWidth:580,margin:"0 auto"}}>
      <div className="serif" style={{fontSize:"1.15rem",fontWeight:700,marginBottom:18}}>🔍 查詢 / 修改我的訂單</div>
      <div style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:14,padding:22,marginBottom:16}}>
        <p style={{fontSize:"0.85rem",color:C.muted,marginBottom:14,lineHeight:1.8}}>請輸入訂購時使用的 Email，查詢本月訂單。</p>
        <Field label="Email"><TextInput value={email} onChange={setEmail} type="email" placeholder="your@email.com" /></Field>
        <Btn onClick={lookup} disabled={loading} full>{loading?"查詢中…":"查詢訂單"}</Btn>
        {notFound&&<div style={{marginTop:12,background:"#fff5f5",border:`1px solid #feb2b2`,borderRadius:8,padding:"9px 13px",fontSize:"0.82rem",color:C.red}}>查無本月訂單，請確認 Email 是否正確。</div>}
      </div>

      {order&&(
        <div className="pop" style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:14,overflow:"hidden"}}>
          {saved&&<div style={{background:C.gp,color:C.green,padding:"9px 16px",fontSize:"0.82rem",borderBottom:`1px solid ${C.gl}`}}>✅ 訂單已成功更新！</div>}
          <div style={{background:C.green,color:C.white,padding:"13px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div className="serif" style={{fontWeight:700,fontSize:"0.97rem"}}>{order.ordererName} 的訂單</div>
              <div style={{fontSize:"0.72rem",opacity:.8,marginTop:2}}>{order.createdAt}{order.updatedAt&&` | 更新：${order.updatedAt}`}</div>
            </div>
            <span style={{background:order.status==="handled"?"rgba(183,121,31,.8)":"rgba(255,255,255,.2)",color:C.white,padding:"3px 10px",borderRadius:7,fontSize:"0.73rem"}}>
              {order.status==="handled"?"✅ 已處理":"⏳ 待處理"}
            </span>
          </div>
          <div style={{padding:"15px 18px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"7px 14px",marginBottom:13,fontSize:"0.82rem"}}>
              {[["📱",order.phone],["👥",order.relation]].map(([k,v])=>(
                <div key={k}><span style={{color:C.muted}}>{k}：</span>{v}</div>
              ))}
              <div style={{gridColumn:"1/-1"}}><span style={{color:C.muted}}>📍 收件：</span>{order.recipientName}｜{order.recipientPhone}｜{order.recipientAddress}</div>
            </div>
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:11}}>
              {Object.entries(order.cart).filter(([,q])=>q>0).map(([id,q])=>{const p=fp[id];return p&&(
                <div key={id} style={{display:"flex",justifyContent:"space-between",fontSize:"0.82rem",padding:"4px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span>{p.name} × {q}</span>
                  <span style={{fontWeight:600,color:C.green}}>NT${(p.price*q).toLocaleString()}</span>
                </div>
              );})}
              <div style={{display:"flex",justifyContent:"space-between",marginTop:9,fontWeight:700,color:C.green}}>
                <span className="serif">合計</span><span className="serif" style={{fontSize:"1.1rem"}}>NT${order.total.toLocaleString()}</span>
              </div>
            </div>
          </div>
          {order.status!=="handled"&&(
            <div style={{padding:"11px 18px",borderTop:`1px solid ${C.border}`,background:C.cream}}>
              <Btn onClick={startEdit} full color={C.gold}>✏️ 修改訂單</Btn>
            </div>
          )}
          {order.status==="handled"&&(
            <div style={{padding:"10px 18px",background:C.cream,fontSize:"0.78rem",color:C.muted,textAlign:"center",borderTop:`1px solid ${C.border}`}}>此訂單已處理，如需更改請聯絡 <a href="mailto:jamy844.bot@gmail.com" style={{color:C.gl}}>jamy844.bot@gmail.com</a></div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ADMIN VIEW ────────────────────────────────────────────────────────────────
function AdminView({settings,setSettings,cats,setCats}) {
  const [authed,setAuthed]=useState(false);
  const [pw,setPw]=useState("");
  const [loggingIn,setLoggingIn]=useState(false);
  const [tab,setTab]=useState("orders");

  const login=async()=>{
    if(!pw.trim()) return;
    setLoggingIn(true);
    try {
      const res=await fetch(`${GAS_URL}?action=verifyAdmin&pw=${encodeURIComponent(pw)}`);
      const json=await res.json();
      if(json.success && json.authed){setAuthed(true);}
      else{alert("密碼錯誤");}
    } catch(e){
      alert("驗證失敗，請確認網路連線");
    }
    setLoggingIn(false);
  };

  if(!authed) return (
    <div style={{maxWidth:340,margin:"40px auto"}}>
      <div style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:16,padding:28,boxShadow:"0 4px 20px rgba(0,0,0,.07)"}}>
        <div className="serif" style={{fontSize:"1.1rem",fontWeight:700,marginBottom:20,textAlign:"center"}}>🔐 管理員登入</div>
        <Field label="密碼" required><TextInput value={pw} onChange={setPw} type="password" placeholder="請輸入密碼" /></Field>
        <Btn onClick={login} disabled={loggingIn} full>{loggingIn?"驗證中…":"登入"}</Btn>
      </div>
    </div>
  );

  const tabs=[
    {k:"orders",l:"📋 本月訂單"},
    {k:"closeout",l:"🚚 結單送貨"},
    {k:"emails",l:"✉️ 寄送信件"},
    {k:"history",l:"📚 歷史訂單"},
    {k:"customers",l:"👥 訂購人資訊"},
    {k:"bulletin",l:"📢 公布欄"},
    {k:"products",l:"📦 產品管理"},
    {k:"newmonth",l:"🗓 新月份"},
  ];

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18,flexWrap:"wrap"}}>
        <span className="serif" style={{fontSize:"1.1rem",fontWeight:700}}>⚙️ 管理後台</span>
        <span style={{fontSize:"0.8rem",color:C.muted,background:C.gp,padding:"3px 10px",borderRadius:8}}>
          {settings.year}年{settings.month}月｜{settings.isOpen?"🟢 訂購中":"🔴 已結單"}
        </span>
      </div>
      {/* Tab nav */}
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:18,borderBottom:`2px solid ${C.border}`,paddingBottom:12}}>
        {tabs.map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} style={{
            background:tab===t.k?C.green:C.white,color:tab===t.k?C.white:C.muted,
            border:`1.5px solid ${tab===t.k?C.green:C.border}`,borderRadius:9,
            padding:"6px 13px",fontSize:"0.8rem",cursor:"pointer",transition:"all .15s",
          }}>{t.l}</button>
        ))}
      </div>

      {tab==="bulletin"&&<BulletinTab settings={settings} setSettings={setSettings}/>}
      {tab==="products"&&<ProductsTab cats={cats} setCats={setCats}/>}
      {tab==="orders"&&<OrdersTab settings={settings} cats={cats}/>}
      {tab==="history"&&<HistoryTab cats={cats}/>}
      {tab==="customers"&&<CustomersTab/>}
      {tab==="closeout"&&<CloseoutTab settings={settings} setSettings={setSettings} cats={cats}/>}
      {tab==="emails"&&<EmailsTab settings={settings} cats={cats}/>}
      {tab==="newmonth"&&<NewMonthTab settings={settings} setSettings={setSettings}/>}
    </div>
  );
}

function BulletinTab({settings,setSettings}) {
  const [text,setText]=useState(settings.bulletin||DEFAULT_BULLETIN);
  const [saved,setSaved]=useState(false);
  const save_=async()=>{
    const s={...settings,bulletin:text};
    await save("settings",s);setSettings(s);setSaved(true);setTimeout(()=>setSaved(false),2000);
  };
  return (
    <div style={{maxWidth:560}}>
      <div className="serif" style={{fontSize:"0.97rem",fontWeight:700,marginBottom:14}}>📢 公布欄內容</div>
      <p style={{fontSize:"0.83rem",color:C.muted,marginBottom:12,lineHeight:1.7}}>此文字會顯示在訂購頁面頂部。</p>
      <TextArea value={text} onChange={setText} rows={4} />
      <div style={{marginTop:10,display:"flex",gap:10,alignItems:"center"}}>
        <Btn onClick={save_}>儲存</Btn>
        {saved&&<span style={{color:C.gl,fontSize:"0.82rem"}}>✅ 已儲存</span>}
      </div>
      <div style={{marginTop:20,paddingTop:14,borderTop:`1px solid ${C.border}`}}>
        <div className="serif" style={{fontSize:"0.9rem",fontWeight:600,marginBottom:12}}>🏦 匯款帳戶資訊</div>
        {["bankName","bankCode","accountName","account"].map(k=>(
          <Field key={k} label={k==="bankName"?"銀行名稱":k==="bankCode"?"銀行代碼":k==="accountName"?"戶名":"帳號"}>
            <TextInput value={{...DEFAULT_BANK,...(settings.bank||{})}[k]} onChange={v=>{
              const s={...settings,bank:{...DEFAULT_BANK,...(settings.bank||{}),[k]:v}};
              save("settings",s);setSettings(s);
            }} />
          </Field>
        ))}
      </div>
    </div>
  );
}

function ProductsTab({cats,setCats}) {
  const [reloading,setReloading]=useState(false);
  const [exporting,setExporting]=useState(false);
  const [reloadMsg,setReloadMsg]=useState("");

  const exportToSheet=async()=>{
    setExporting(true);setReloadMsg("");
    try {
      const params=new URLSearchParams();
      params.append("action","set");
      params.append("key","cats");
      params.append("value",JSON.stringify(cats));
      params.append("token", WRITE_TOKEN);
      await fetch(GAS_URL,{method:"POST",mode:"no-cors",body:params});
      setReloadMsg("✅ 已匯出到試算表！請到 Google Sheets 確認「產品目錄」工作表。");
    } catch(e){ setReloadMsg("❌ 匯出失敗，請確認 Apps Script 已部署"); }
    setExporting(false);
  };

  const toggleOOS=async(catKey,id)=>{
    const updated=cats.map(c=>c.key===catKey?{...c,products:c.products.map(p=>p.id===id?{...p,outOfStock:!p.outOfStock}:p)}:c);
    setCats(updated);await save("cats",updated);
  };

  const toggleHidden=async(catKey,id)=>{
    const updated=cats.map(c=>c.key===catKey?{...c,products:c.products.map(p=>p.id===id?{...p,hidden:!p.hidden}:p)}:c);
    setCats(updated);await save("cats",updated);
  };

  const reloadFromSheet=async()=>{
    setReloading(true);setReloadMsg("");
    try {
      const res=await fetch(`${GAS_URL}?action=getCats`);
      const json=await res.json();
      if(json.success && json.value){
        const newCats=JSON.parse(json.value);
        setCats(newCats);
        try{localStorage.setItem("cats",JSON.stringify(newCats));}catch{}
        setReloadMsg("✅ 已從試算表重新載入！");
      } else {
        setReloadMsg("❌ 載入失敗：" + (json.error||"未知錯誤"));
      }
    } catch(e){ setReloadMsg("❌ 連線失敗，請確認 Apps Script 已部署"); }
    setReloading(false);
  };

  return (
    <div>
      <div className="serif" style={{fontSize:"0.97rem",fontWeight:700,marginBottom:14}}>📦 產品管理</div>

      {/* Google Sheets 說明 */}
      <div style={{background:"#f0faf4",border:`1.5px solid ${C.gl}`,borderRadius:12,padding:16,marginBottom:20}}>
        <div style={{fontWeight:600,fontSize:"0.88rem",marginBottom:8,color:C.green}}>📊 透過 Google Sheets 管理產品</div>
        <p style={{fontSize:"0.81rem",color:C.muted,lineHeight:1.9,marginBottom:10}}>
          在 Google Sheets「<strong>產品目錄</strong>」工作表新增或修改產品後，按下方按鈕重新載入。<br/>
          欄位順序（標題列之後每列一個產品）：<br/>
          <code style={{background:"#e8f5e9",padding:"2px 6px",borderRadius:3,fontSize:"0.76rem"}}>
            分類key ｜ 分類名稱 ｜ 產品ID ｜ 產品名稱 ｜ 價格 ｜ 網址 ｜ 缺貨(TRUE/FALSE) ｜ 下架(TRUE/FALSE)
          </code>
        </p>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <Btn onClick={reloadFromSheet} disabled={reloading||exporting} color={C.green} small>
            {reloading?"載入中…":"🔄 從試算表重新載入產品"}
          </Btn>
          <Btn onClick={exportToSheet} disabled={reloading||exporting} color={C.gold} outline small>
            {exporting?"匯出中…":"📤 將目前產品匯出到試算表"}
          </Btn>
          {reloadMsg&&<span style={{fontSize:"0.8rem",color:reloadMsg.startsWith("✅")?C.gl:C.red}}>{reloadMsg}</span>}
        </div>
      </div>

      {/* 狀態說明 */}
      <div style={{display:"flex",gap:14,fontSize:"0.75rem",marginBottom:16,flexWrap:"wrap"}}>
        <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{background:C.gp,border:`1px solid ${C.gl}`,borderRadius:4,padding:"1px 7px"}}>正常</span>上架中</span>
        <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{background:"#fff8e1",border:"1px solid #f6ad55",borderRadius:4,padding:"1px 7px",color:"#c05621"}}>缺貨</span>顯示但無法訂購</span>
        <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{background:"#f0f0f0",border:`1px solid ${C.muted}`,borderRadius:4,padding:"1px 7px",color:C.muted}}>下架</span>完全不顯示</span>
      </div>

      {/* Product list */}
      {cats.map(cat=>(
        <div key={cat.key} style={{marginBottom:18}}>
          <div className="serif" style={{fontSize:"0.87rem",fontWeight:600,color:C.green,marginBottom:8}}>{cat.label}</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {cat.products.map(p=>{
              const isHidden=p.hidden;
              const isOOS=p.outOfStock;
              return (
                <div key={p.id} style={{background:isHidden?"#f5f5f5":isOOS?"#fff8e1":C.gp,border:`1.5px solid ${isHidden?C.muted:isOOS?"#f6ad55":C.gl}`,borderRadius:9,padding:"8px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:9,opacity:isHidden?0.5:1}}>
                  <span style={{fontSize:"0.8rem",color:isHidden?C.muted:C.text,flex:1}}>
                    {p.name} — NT${p.price.toLocaleString()}
                    {isHidden&&<span style={{marginLeft:6,fontSize:"0.7rem",color:C.muted}}>（已下架）</span>}
                    {isOOS&&!isHidden&&<span style={{marginLeft:6,fontSize:"0.7rem",color:"#c05621"}}>（缺貨）</span>}
                  </span>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>toggleOOS(cat.key,p.id)} disabled={isHidden}
                      style={{background:isOOS?C.gl:"#f6ad55",color:C.white,border:"none",borderRadius:6,padding:"3px 8px",fontSize:"0.72rem",cursor:isHidden?"not-allowed":"pointer",whiteSpace:"nowrap",opacity:isHidden?0.4:1}}>
                      {isOOS?"恢復上架":"設為缺貨"}
                    </button>
                    <button onClick={()=>toggleHidden(cat.key,p.id)}
                      style={{background:isHidden?C.green:"#718096",color:C.white,border:"none",borderRadius:6,padding:"3px 8px",fontSize:"0.72rem",cursor:"pointer",whiteSpace:"nowrap"}}>
                      {isHidden?"重新上架":"下架"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function OrdersTab({settings,cats}) {
  const [orders,setOrders]=useState(null);
  const [confirmDelete,setConfirmDelete]=useState(null);
  const [busyOp,setBusyOp]=useState(null); // 正在操作的 email，防止連點競態
  const fp=flatProducts(cats);
  useEffect(()=>{
    const key=`orders_${settings.year}_${String(settings.month).padStart(2,"0")}`;
    load(key).then(o=>setOrders(o||{}));
  },[settings]);
  const toggleStatus=async(email)=>{
    if(busyOp) return;
    setBusyOp(email);
    const key=`orders_${settings.year}_${String(settings.month).padStart(2,"0")}`;
    const upd={...orders,[email]:{...orders[email],status:orders[email].status==="handled"?"pending":"handled"}};
    setOrders(upd);await save(key,upd);
    setBusyOp(null);
  };
  const deleteOrder=async(email)=>{
    if(busyOp) return;
    setBusyOp(email);
    const key=`orders_${settings.year}_${String(settings.month).padStart(2,"0")}`;
    const upd={...orders};
    delete upd[email];
    setOrders(upd);await save(key,upd);
    setBusyOp(null);
    setConfirmDelete(null);
  };
  if(!orders) return <div style={{color:C.muted,padding:20}}>載入中…</div>;
  const list=Object.values(dataEntries(orders)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const totalAmt=list.filter(o=>o.status!=="handled").reduce((s,o)=>s+o.total,0);
  return (
    <div>
      {confirmDelete&&<ConfirmModal msg={`確定刪除 ${confirmDelete} 的訂單？此操作無法復原。`} onOk={()=>deleteOrder(confirmDelete)} onCancel={()=>setConfirmDelete(null)}/>}
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        {[["📦 訂單數",list.length,C.green],["⏳ 待處理",list.filter(o=>o.status!=="handled").length,C.gold],["✅ 已處理",list.filter(o=>o.status==="handled").length,C.gl],["💰 待收",`NT$${totalAmt.toLocaleString()}`,C.red]].map(([l,v,c])=>(
          <div key={l} style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:10,padding:"12px 16px",minWidth:110}}>
            <div style={{fontSize:"0.75rem",color:C.muted,marginBottom:3}}>{l}</div>
            <div className="serif" style={{fontSize:"1.2rem",fontWeight:700,color:c}}>{v}</div>
          </div>
        ))}
      </div>
      {list.length===0?<div style={{color:C.muted,textAlign:"center",padding:32}}>本月尚無訂單</div>
      :list.map(o=>{
        const items=Object.entries(o.cart).filter(([,q])=>q>0);
        return (
          <div key={o.email} style={{background:C.white,border:`1.5px solid ${o.status==="handled"?C.border:C.green}`,borderRadius:12,marginBottom:10,overflow:"hidden"}}>
            <div style={{background:o.status==="handled"?C.cream:C.gp,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:7}}>
              <div>
                <span className="serif" style={{fontWeight:700}}>{o.ordererName}</span>
                <span style={{fontSize:"0.78rem",color:C.muted,marginLeft:8}}>{o.email}</span>
                <span style={{fontSize:"0.75rem",color:C.muted,marginLeft:8}}>{o.relation}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span className="serif" style={{fontWeight:700,color:C.green}}>NT${o.total.toLocaleString()}</span>
                <button onClick={()=>toggleStatus(o.email)} disabled={!!busyOp}
                  style={{background:busyOp===o.email?"#aaa":o.status==="handled"?C.gl:C.gold,color:C.white,border:"none",borderRadius:7,padding:"4px 10px",fontSize:"0.75rem",cursor:busyOp?"not-allowed":"pointer",opacity:busyOp&&busyOp!==o.email?.5:1}}>
                  {busyOp===o.email?"處理中…":o.status==="handled"?"↩ 恢復":"✅ 已處理"}
                </button>
                <button onClick={()=>setConfirmDelete(o.email)} disabled={!!busyOp}
                  style={{background:"none",color:busyOp?C.muted:C.red,border:`1px solid ${busyOp?C.muted:C.red}`,borderRadius:7,padding:"4px 10px",fontSize:"0.75rem",cursor:busyOp?"not-allowed":"pointer",opacity:busyOp?.5:1}}>
                  🗑 刪除
                </button>
              </div>
            </div>
            <div style={{padding:"9px 14px",display:"flex",flexWrap:"wrap",gap:5}}>
              {items.map(([id,q])=>{const p=fp[id];return p&&<span key={id} style={{background:C.gp,color:C.green,borderRadius:5,padding:"2px 7px",fontSize:"0.76rem"}}>{p.name}×{q}</span>;})}
            </div>
            <div style={{padding:"4px 14px 9px",fontSize:"0.77rem",color:C.muted}}>
              📍 {o.recipientName}｜{o.recipientPhone}｜{o.recipientAddress}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoryTab({cats}) {
  const [history,setHistory]=useState(null);
  const [expanded,setExpanded]=useState(null);
  const [monthOrders,setMonthOrders]=useState({});
  const fp=flatProducts(cats);
  useEffect(()=>{load("history").then(h=>setHistory(h||[]));}, []);

  const expand=async(month)=>{
    if(expanded===month){setExpanded(null);return;}
    setExpanded(month);
    const orders=await load(`orders_${month}`)||{};
    setMonthOrders(prev=>({...prev,[month]:orders}));
  };

  if(!history) return <div style={{color:C.muted,padding:20}}>載入中…</div>;
  if(history.length===0) return <div style={{color:C.muted,textAlign:"center",padding:32}}>尚無歷史結單紀錄</div>;

  return (
    <div>
      <div className="serif" style={{fontSize:"0.97rem",fontWeight:700,marginBottom:14}}>📚 歷史訂單</div>
      {history.sort((a,b)=>b.closedAt.localeCompare(a.closedAt)).map(h=>(
        <div key={h.key} style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:12,marginBottom:10,overflow:"hidden"}}>
          <div onClick={()=>expand(h.key)} style={{padding:"12px 16px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",background:C.cream}}>
            <span className="serif" style={{fontWeight:600}}>{h.year}年{h.month}月｜{h.orderCount}筆訂單｜NT${h.totalAmt.toLocaleString()}</span>
            <span style={{color:C.muted,fontSize:"0.85rem"}}>{expanded===h.key?"▲":"▼"}</span>
          </div>
          {expanded===h.key&&monthOrders[h.key]&&(
            <div style={{padding:"10px 16px"}}>
              {Object.values(dataEntries(monthOrders[h.key])).map(o=>(
                <div key={o.email} style={{borderBottom:`1px solid ${C.border}`,padding:"8px 0",fontSize:"0.82rem"}}>
                  <span style={{fontWeight:600}}>{o.ordererName}</span>
                  <span style={{color:C.muted,marginLeft:8}}>{o.email}</span>
                  <span style={{color:C.green,fontWeight:600,marginLeft:8}}>NT${o.total.toLocaleString()}</span>
                  <div style={{marginTop:4,display:"flex",flexWrap:"wrap",gap:4}}>
                    {Object.entries(o.cart).filter(([,q])=>q>0).map(([id,q])=>{const p=fp[id];return p&&<span key={id} style={{background:C.gp,color:C.green,borderRadius:5,padding:"1px 6px",fontSize:"0.73rem"}}>{p.name}×{q}</span>;})}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CustomersTab() {
  const [customers,setCustomers]=useState(null);
  const [search,setSearch]=useState("");
  useEffect(()=>{load("customers").then(c=>setCustomers(c||{}));}, []);
  if(!customers) return <div style={{color:C.muted,padding:20}}>載入中…</div>;
  const list=Object.values(dataEntries(customers)).filter(c=>!search||(c.name+c.email+c.phone).includes(search));
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div className="serif" style={{fontSize:"0.97rem",fontWeight:700}}>👥 訂購人資料庫</div>
        <span style={{fontSize:"0.8rem",color:C.muted}}>共 {Object.keys(dataEntries(customers)).length} 人</span>
      </div>
      <div style={{marginBottom:14}}><TextInput value={search} onChange={setSearch} placeholder="搜尋姓名、email、手機…"/></div>
      {list.length===0?<div style={{color:C.muted,textAlign:"center",padding:24}}>查無資料</div>
      :list.sort((a,b)=>a.name.localeCompare(b.name)).map(c=>(
        <div key={c.email} style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:10,padding:"11px 15px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div>
            <span className="serif" style={{fontWeight:600,fontSize:"0.93rem"}}>{c.name}</span>
            <span style={{fontSize:"0.8rem",color:C.muted,marginLeft:8}}>{c.email}</span>
            <span style={{fontSize:"0.78rem",color:C.muted,marginLeft:8}}>{c.phone}</span>
            {c.lineId&&<span style={{fontSize:"0.78rem",color:C.muted,marginLeft:8}}>LINE: {c.lineId}</span>}
          </div>
          <div style={{fontSize:"0.78rem",color:C.muted,textAlign:"right"}}>
            <div>{c.relation}｜最近訂購：{c.lastOrder}</div>
            <div>累計訂購 {c.orderCount} 次</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CloseoutTab({settings,setSettings,cats}) {
  const [orders,setOrders]=useState(null);
  const [confirm,setConfirm]=useState(false);
  const [done,setDone]=useState(false);
  const fp=flatProducts(cats);

  useEffect(()=>{
    const key=`orders_${settings.year}_${String(settings.month).padStart(2,"0")}`;
    load(key).then(o=>setOrders(o||{}));
  },[settings]);

  const doCloseout=async()=>{
    const key=`orders_${settings.year}_${String(settings.month).padStart(2,"0")}`;
    const s={...settings,isOpen:false};
    await save("settings",s);setSettings(s);
    // Save history entry
    const h=await load("history")||[];
    const monthKey=`${settings.year}_${String(settings.month).padStart(2,"0")}`;
    if(!h.find(x=>x.key===monthKey)){
      const list=Object.values(dataEntries(orders||{}));
      h.push({key:monthKey,year:settings.year,month:settings.month,closedAt:new Date().toLocaleString("zh-TW"),orderCount:list.length,totalAmt:list.reduce((s,o)=>s+o.total,0)});
      await save("history",h);
    }
    setConfirm(false);setDone(true);
  };

  // 產生結單表資料（2D array 格式）
  const genCloseoutRows=()=>{
    const rows=[];
    Object.values(dataEntries(orders||{})).forEach(o=>{
      const entries=Object.entries(o.cart).filter(([,q])=>q>0);
      entries.forEach(([id,q],i)=>{
        const p=fp[id];
        if(p) rows.push([
          p.name,
          q,
          p.price*q,
          "",                    // 空白欄
          i===0?o.recipientName:"",   // 只在第一行顯示收件人
          i===0?o.recipientPhone:"",
          i===0?o.recipientAddress:"",
          "",                    // 備註
          i===0?o.ordererName:""
        ]);
      });
    });
    return rows;
  };

  const [exporting,setExporting]=useState(false);
  const [exportMsg,setExportMsg]=useState("");

  const exportToSheet=async()=>{
    setExporting(true);setExportMsg("");
    try {
      const rows=genCloseoutRows();
      const sheetName=`結單表_${settings.year}_${String(settings.month).padStart(2,"0")}`;
      const params=new URLSearchParams();
      params.append("action","syncCloseout");
      params.append("sheetName",sheetName);
      params.append("value",JSON.stringify(rows));
      params.append("token",WRITE_TOKEN);
      await fetch(GAS_URL,{method:"POST",mode:"no-cors",body:params});
      setExportMsg(`✅ 已匯出到「${sheetName}」工作表！請到 Google Sheets 確認。`);
    } catch(e){
      setExportMsg("❌ 匯出失敗，請確認 Apps Script 已部署");
    }
    setExporting(false);
  };

  if(!orders) return <div style={{color:C.muted,padding:20}}>載入中…</div>;
  const list=Object.values(dataEntries(orders));

  return (
    <div style={{maxWidth:700}}>
      {confirm&&<ConfirmModal msg={`確定結單 ${settings.year}年${settings.month}月 的團購？結單後訂購者無法修改訂單。`} onOk={doCloseout} onCancel={()=>setConfirm(false)}/>}
      <div className="serif" style={{fontSize:"0.97rem",fontWeight:700,marginBottom:14}}>🚚 結單送貨</div>
      {done&&<div style={{background:C.gp,border:`1px solid ${C.gl}`,borderRadius:9,padding:"10px 15px",fontSize:"0.83rem",color:C.green,marginBottom:14}}>✅ 已結單！首頁將顯示「{settings.year}年{settings.month}月的團購已結單」</div>}
      {exportMsg&&<div style={{background:exportMsg.startsWith("✅")?C.gp:"#fff5f5",border:`1px solid ${exportMsg.startsWith("✅")?C.gl:"#feb2b2"}`,borderRadius:9,padding:"10px 15px",fontSize:"0.83rem",color:exportMsg.startsWith("✅")?C.green:C.red,marginBottom:14}}>{exportMsg}</div>}
      <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
        {settings.isOpen&&<Btn onClick={()=>setConfirm(true)} color={C.red}>🔒 執行結單</Btn>}
        {!settings.isOpen&&<div style={{background:"#fff5f5",border:`1px solid #feb2b2`,borderRadius:8,padding:"9px 14px",fontSize:"0.82rem",color:C.red}}>本月已結單</div>}
        <Btn onClick={exportToSheet} disabled={exporting} color={C.gold} outline>{exporting?"匯出中…":"📊 結單表轉檔（匯出到 Google Sheets）"}</Btn>
      </div>
      {/* Shipping table preview */}
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",fontSize:"0.78rem",width:"100%",background:C.white,borderRadius:10,overflow:"hidden"}}>
          <thead>
            <tr style={{background:C.green,color:C.white}}>
              {["商品名稱","數量(盒)","總金額(含運)","","收件人姓名","收件人電話","收件人住址","備註","訂購人姓名"].map((h,i)=>(
                <th key={i} style={{padding:"8px 10px",textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.length===0?<tr><td colSpan={9} style={{textAlign:"center",padding:20,color:C.muted}}>尚無訂單</td></tr>
            :(()=>{let gi=0;return list.map((o,oi)=>{
              const items=Object.entries(o.cart).filter(([,q])=>q>0);
              const bgColor=gi%2===0?"#dce6f1":"#ffffff";
              const isLast=oi===list.length-1;
              gi++;
              return items.map(([id,q],i)=>{const p=fp[id];return p&&(
                <tr key={o.email+id} style={{background:bgColor,...(i===items.length-1&&!isLast?{borderBottom:"2.5px solid #333"}:{borderBottom:`1px solid ${C.border}`})}}>
                  <td style={{padding:"7px 10px"}}>{p.name}</td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>{q}</td>
                  <td style={{padding:"7px 10px",fontWeight:600,color:C.green}}>NT${(p.price*q).toLocaleString()}</td>
                  <td style={{padding:"7px 10px"}}></td>
                  <td style={{padding:"7px 10px"}}>{i===0?o.recipientName:""}</td>
                  <td style={{padding:"7px 10px"}}>{i===0?o.recipientPhone:""}</td>
                  <td style={{padding:"7px 10px",maxWidth:180,wordBreak:"break-all"}}>{i===0?o.recipientAddress:""}</td>
                  <td style={{padding:"7px 10px",color:C.muted}}></td>
                  <td style={{padding:"7px 10px"}}>{i===0?o.ordererName:""}</td>
                </tr>
              );});
            });})()
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmailsTab({settings,cats}) {
  const [orders,setOrders]=useState(null);
  const [allCustomers,setAllCustomers]=useState(null);
  const [noticeText,setNoticeText]=useState("");
  const [sending,setSending]=useState({});
  const [sendingAll,setSendingAll]=useState(false);
  const fp=flatProducts(cats);
  const bank={...DEFAULT_BANK,...(settings.bank||{})};

  useEffect(()=>{
    const key=`orders_${settings.year}_${String(settings.month).padStart(2,"0")}`;
    load(key).then(o=>setOrders(o||{}));
    load("customers").then(c=>setAllCustomers(c||{}));
  },[settings]);

  const markSending=(email,state)=>setSending(p=>({...p,[email]:state}));

  const sendPayment=async(o)=>{
    markSending(o.email+"_pay","sending");
    const result=await requestSendEmail({ to:o.email, subject:`【大研生醫團購】${settings.year}年${settings.month}月 匯款通知`, body:genPaymentEmail(o,bank,cats), isHtml:true });
    markSending(o.email+"_pay", result);
  };

  const sendAllPayment=async()=>{
    if(!list.length) return;
    setSendingAll(true);
    for(const o of list){
      markSending(o.email+"_pay","sending");
      const result=await requestSendEmail({ to:o.email, subject:`【大研生醫團購】${settings.year}年${settings.month}月 匯款通知`, body:genPaymentEmail(o,bank,cats), isHtml:true });
      markSending(o.email+"_pay", result);
    }
    setSendingAll(false);
  };

  const sendNotice=async(target)=>{
    if(!noticeText.trim()){alert("請先輸入通知內容");return;}
    const key=target.email+"_notice";
    markSending(key,"sending");
    const body=genNoticeEmail(target.name||target.ordererName, noticeText);
    const result=await requestSendEmail({ to:target.email, subject:`【大研生醫團購】特別通知`, body, isHtml:true });
    markSending(key, result);
  };

  const sendAllNotice=async(targets)=>{
    if(!noticeText.trim()){alert("請先輸入通知內容");return;}
    if(!targets.length) return;
    setSendingAll(true);
    for(const t of targets){
      const key=t.email+"_notice";
      markSending(key,"sending");
      const body=genNoticeEmail(t.name, noticeText);
      const result=await requestSendEmail({ to:t.email, subject:`【大研生醫團購】特別通知`, body, isHtml:true });
      markSending(key, result);
    }
    setSendingAll(false);
  };

  const statusIcon=(key)=>{const s=sending[key];return s==="sending"?" ⏳":s==="sent"?" ✅":s==="error"?" ❌":"";}

  if(!orders||!allCustomers) return <div style={{color:C.muted,padding:20}}>載入中…</div>;
  const list=Object.values(dataEntries(orders));
  const allCustList=Object.values(dataEntries(allCustomers));

  return (
    <div>
      {/* Payment emails - 本月訂購者 */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div className="serif" style={{fontSize:"0.97rem",fontWeight:700}}>💳 寄送匯款信件</div>
        {list.length>0&&<Btn onClick={sendAllPayment} disabled={sendingAll} small color={C.gold}>
          {sendingAll?"寄送中…":"📨 一鍵寄給全部 ("+list.length+"人)"}
        </Btn>}
      </div>
      <p style={{fontSize:"0.82rem",color:C.muted,marginBottom:12,lineHeight:1.7}}>信件將從你的 Gmail 自動寄出，訂購者即時收到匯款資訊。</p>
      {list.length===0
        ? <div style={{color:C.muted,marginBottom:20}}>本月尚無訂單</div>
        : list.map(o=>(
          <div key={o.email} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.white,border:`1.5px solid ${sending[o.email+"_pay"]==="sent"?C.gl:C.border}`,borderRadius:10,padding:"10px 14px",marginBottom:8,gap:10,flexWrap:"wrap",transition:"border-color .3s"}}>
            <div>
              <span className="serif" style={{fontWeight:600}}>{o.ordererName}</span>
              <span style={{fontSize:"0.78rem",color:C.muted,marginLeft:8}}>{o.email}</span>
              <span style={{fontSize:"0.78rem",color:C.green,fontWeight:600,marginLeft:8}}>NT${o.total.toLocaleString()}</span>
            </div>
            <Btn onClick={()=>sendPayment(o)} small color={sending[o.email+"_pay"]==="sent"?C.gl:C.gold} disabled={sending[o.email+"_pay"]==="sending"}>
              {sending[o.email+"_pay"]==="sending"?"寄送中…":sending[o.email+"_pay"]==="sent"?"✅ 已寄出":sending[o.email+"_pay"]==="error"?"❌ 重試":"📧 寄匯款信"}
            </Btn>
          </div>
        ))
      }

      {/* Special notice - 可選本月或全部歷史訂購人 */}
      <div style={{marginTop:24,paddingTop:20,borderTop:`2px solid ${C.border}`}}>
        <div className="serif" style={{fontSize:"0.97rem",fontWeight:700,marginBottom:12}}>📣 寄送特別通知</div>
        <TextArea value={noticeText} onChange={setNoticeText} rows={4} placeholder="輸入通知內容，將自動套用每位訂購者的姓名…"/>

        {/* 本月訂購者 */}
        <div style={{marginTop:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:"0.83rem",fontWeight:600,color:C.text}}>本月訂購者（{list.length} 人）</span>
            {list.length>0&&<Btn onClick={()=>sendAllNotice(list.map(o=>({email:o.email,name:o.ordererName})))} disabled={sendingAll||!noticeText.trim()} small color={C.green}>
              {sendingAll?"寄送中…":"📨 寄給全部本月訂購者"}
            </Btn>}
          </div>
          {list.length===0
            ? <div style={{color:C.muted,fontSize:"0.82rem"}}>本月尚無訂購者</div>
            : <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {list.map(o=>(
                  <Btn key={o.email} onClick={()=>sendNotice({email:o.email,name:o.ordererName})} small
                    color={sending[o.email+"_notice"]==="sent"?C.gl:C.green}
                    disabled={sending[o.email+"_notice"]==="sending"||!noticeText.trim()}
                    outline={sending[o.email+"_notice"]!=="sent"}>
                    {o.ordererName}{statusIcon(o.email+"_notice")}
                  </Btn>
                ))}
              </div>
          }
        </div>

        {/* 全部歷史訂購人 */}
        <div style={{marginTop:16,paddingTop:14,borderTop:`1px dashed ${C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:"0.83rem",fontWeight:600,color:C.text}}>全部歷史訂購人（{allCustList.length} 人）</span>
            {allCustList.length>0&&<Btn onClick={()=>sendAllNotice(allCustList.map(c=>({email:c.email,name:c.name})))} disabled={sendingAll||!noticeText.trim()} small color={C.green}>
              {sendingAll?"寄送中…":"📨 寄給全部歷史訂購人"}
            </Btn>}
          </div>
          {allCustList.length===0
            ? <div style={{color:C.muted,fontSize:"0.82rem"}}>尚無歷史訂購人資料</div>
            : <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {allCustList.map(c=>(
                  <Btn key={c.email} onClick={()=>sendNotice({email:c.email,name:c.name})} small
                    color={sending[c.email+"_notice"]==="sent"?C.gl:C.green}
                    disabled={sending[c.email+"_notice"]==="sending"||!noticeText.trim()}
                    outline={sending[c.email+"_notice"]!=="sent"}>
                    {c.name}{statusIcon(c.email+"_notice")}
                  </Btn>
                ))}
              </div>
          }
        </div>
      </div>
    </div>
  );
}

function NewMonthTab({settings,setSettings}) {
  const [year,setYear]=useState(settings.year);
  const [month,setMonth]=useState(settings.month+1>12?1:settings.month+1);
  const [confirm,setConfirm]=useState(false);
  const [done,setDone]=useState(false);
  const [checking,setChecking]=useState(false);
  const [blockReason,setBlockReason]=useState("");

  // 檢查目前月份是否有未結單訂單
  const checkAndConfirm=async()=>{
    setChecking(true);
    setBlockReason("");
    const curKey=`orders_${settings.year}_${String(settings.month).padStart(2,"0")}`;
    const curOrders=await load(curKey)||{};
    const pendingList=Object.values(dataEntries(curOrders)).filter(o=>o.status!=="handled");
    setChecking(false);
    if(settings.isOpen && pendingList.length>0){
      setBlockReason(`目前 ${settings.year}年${settings.month}月 還有 ${pendingList.length} 筆訂單未處理，請先結單後再開啟新月份。`);
      return;
    }
    setConfirm(true);
  };

  const start=async()=>{
    const s={...settings,year:Number(year),month:Number(month),isOpen:true};
    await save("settings",s);
    setSettings(s);
    setConfirm(false);
    setDone(true);
    setBlockReason("");
  };

  return (
    <div style={{maxWidth:440}}>
      {confirm&&<ConfirmModal msg={`開始 ${year}年${month}月 的團購？`} onOk={start} onCancel={()=>setConfirm(false)}/>}
      <div className="serif" style={{fontSize:"0.97rem",fontWeight:700,marginBottom:14}}>🗓 開始新月份團購</div>
      {done&&<div style={{background:C.gp,border:`1px solid ${C.gl}`,borderRadius:9,padding:"10px 15px",fontSize:"0.83rem",color:C.green,marginBottom:14}}>✅ 已開始 {year}年{month}月的團購！首頁已切換。</div>}
      {blockReason&&<div style={{background:"#fff5f5",border:`1px solid #feb2b2`,borderRadius:9,padding:"10px 15px",fontSize:"0.83rem",color:C.red,marginBottom:14}}>⚠️ {blockReason}</div>}
      <div style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:14,padding:20}}>
        <p style={{fontSize:"0.83rem",color:C.muted,marginBottom:16,lineHeight:1.8}}>
          目前是 <strong>{settings.year}年{settings.month}月</strong>｜{settings.isOpen?"🟢 訂購中":"🔴 已結單"}<br/>
          <span style={{fontSize:"0.78rem"}}>⚠️ 若目前月份有未結單訂單，無法開啟新月份。<br/>可開啟過去月份（作為測試用）。</span>
        </p>
        <div style={{display:"flex",gap:12,marginBottom:16}}>
          <div style={{flex:1}}>
            <Field label="年份">
              <TextInput value={String(year)} onChange={v=>setYear(parseInt(v)||year)} type="number"/>
            </Field>
          </div>
          <div style={{flex:1}}>
            <Field label="月份">
              <SelInput value={String(month)} onChange={v=>setMonth(parseInt(v))} options={Array.from({length:12},(_,i)=>({v:String(i+1),l:`${i+1}月`}))}/>
            </Field>
          </div>
        </div>
        <Btn onClick={checkAndConfirm} disabled={checking} full color={C.green}>
          {checking?"檢查中…":`🚀 開始 ${year}年${month}月的團購`}
        </Btn>
      </div>

      {/* 清除測試資料 */}
      <div style={{marginTop:28,paddingTop:20,borderTop:`2px solid ${C.border}`}}>
        <div className="serif" style={{fontSize:"0.97rem",fontWeight:700,marginBottom:8,color:C.red}}>🧹 清除測試資料</div>
        <p style={{fontSize:"0.82rem",color:C.muted,marginBottom:12,lineHeight:1.7}}>
          清除本機快取資料（localStorage），讓系統重新從 Google Sheets 讀取最新資料。<br/>
          <strong style={{color:C.red}}>注意：Google Sheets 裡的資料請手動刪除。</strong>
        </p>
        <Btn color={C.red} outline onClick={()=>{
          if(window.confirm("確定要清除本機快取嗎？頁面將自動重新整理。")){
            localStorage.clear();
            window.location.reload();
          }
        }}>🗑 清除本機快取並重新整理</Btn>
      </div>
    </div>
  );
}

// ── APP ROOT ──────────────────────────────────────────────────────────────────
export default function App() {
  const [view,setView]=useState("shop");
  const [settings,setSettings]=useState(null);
  const [cats,setCats]=useState(null);
  const [successModal,setSuccessModal]=useState(null);
  const [emailModal,setEmailModal]=useState(null);

  useEffect(()=>{
    // ── Cache-first：先從 localStorage 立即渲染，再背景從 GAS 更新 ──
    document.title = "大研生醫團購";
    // Settings
    try {
      const cachedSettings = localStorage.getItem("settings");
      if (cachedSettings) setSettings(JSON.parse(cachedSettings));
    } catch {}
    // Cats
    try {
      const cachedCats = localStorage.getItem("cats");
      if (cachedCats) setCats(JSON.parse(cachedCats));
    } catch {}

    // 背景從 GAS 載入最新資料
    (async()=>{
      // 載入設定
      let s=await load("settings");
      if(!s){
        const now=new Date();
        s={year:now.getFullYear(),month:now.getMonth()+1,isOpen:true,bulletin:DEFAULT_BULLETIN,bank:DEFAULT_BANK};
        await save("settings",s);
      }
      setSettings(s);
      try { localStorage.setItem("settings", JSON.stringify(s)); } catch{}

      // 從 Google Sheets「產品目錄」載入產品（優先）
      let loadedCats = null;
      try {
        const url=`${GAS_URL}?action=getCats`;
        const res=await fetch(url);
        const json=await res.json();
        if(json.success && json.value) {
          loadedCats = JSON.parse(json.value);
        }
      } catch(e){ console.warn("getCats from sheet failed, using cache"); }

      // fallback：從 GAS app_data 或 INIT_CATS
      if(!loadedCats){
        const savedCats=await load("cats");
        loadedCats = savedCats || INIT_CATS;
      }

      setCats(loadedCats);
      try { localStorage.setItem("cats", JSON.stringify(loadedCats)); } catch{}
    })();
  },[]);

  const handleOrderSuccess=(order)=>{
    setSuccessModal(order);
  };

  if(!settings || !cats) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:C.muted}}>載入中…</div>;

  const isOpen=settings.isOpen;
  const monthLabel=`${settings.year}年${settings.month}月`;

  return (
    <>
      <style>{globalCSS}</style>
      {emailModal&&<EmailModal title={emailModal.title} content={emailModal.content} onClose={()=>setEmailModal(null)}/>}
      {/* Success toast */}
      {successModal&&!emailModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div className="pop" style={{background:C.white,borderRadius:18,padding:30,maxWidth:420,width:"100%",textAlign:"center"}}>
            <div style={{fontSize:"2.8rem",marginBottom:10}}>🎉</div>
            <div className="serif" style={{fontSize:"1.2rem",fontWeight:700,color:C.green,marginBottom:10}}>訂單已送出！</div>
            <div style={{fontSize:"0.85rem",color:C.muted,lineHeight:2,marginBottom:18}}>
              <strong style={{color:C.text}}>{successModal.ordererName}</strong> 感謝訂購！<br/>
              合計 <strong style={{color:C.green}}>NT${successModal.total.toLocaleString()}</strong><br/>
              確認信將寄至 <strong>{successModal.email}</strong>
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
              <Btn onClick={()=>setSuccessModal(null)} color={C.green}>關閉</Btn>
            </div>
          </div>
        </div>
      )}

      <div style={{minHeight:"100vh",background:C.cream}}>
        {/* Header */}
        <div style={{background:C.green,color:C.white,position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 12px rgba(0,0,0,.18)"}}>
          <div style={{maxWidth:1200,margin:"0 auto",padding:"13px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
            <div onClick={()=>setView("shop")} style={{cursor:"pointer"}}>
              <div className="serif" style={{fontSize:"1.1rem",fontWeight:700,letterSpacing:".04em"}}>🌿 大研生醫 × 團購專區</div>
              <div style={{fontSize:"0.7rem",opacity:.75,letterSpacing:".08em",marginTop:2}}>台大EMBA · 師長 · 好友 專屬 <span style={{opacity:.6,marginLeft:6}}>{VERSION}</span></div>
            </div>
            <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
              {[["shop","🛒 訂購"],["myorder","🔍 查詢/修改訂單"],["admin","⚙️ 後台"]].map(([v,l])=>{
                const disabled=v==="myorder"&&!isOpen;
                return(
                <button key={v} onClick={()=>{if(!disabled)setView(v);}} style={{
                  background:view===v?"rgba(255,255,255,.25)":"rgba(255,255,255,.12)",
                  color:C.white,border:`1px solid rgba(255,255,255,${view===v?.4:.2})`,
                  borderRadius:8,padding:"7px 13px",fontSize:"0.8rem",cursor:disabled?"not-allowed":"pointer",
                  fontFamily:"'Noto Sans TC',sans-serif",fontWeight:view===v?600:400,
                  opacity:disabled?.4:1,
                }}>{l}</button>
              );})}
            </div>
          </div>
        </div>

        {/* Notice bar */}
        {view==="shop"&&(
          <div style={{background:isOpen?"linear-gradient(135deg,#1b4332,#2d6a4f)":"linear-gradient(135deg,#7b341e,#c05621)",color:C.white,padding:"12px 20px",textAlign:"center"}}>
            <div className="serif" style={{fontSize:"1.05rem",fontWeight:700,letterSpacing:".05em"}}>{isOpen?"🟢":"🔴"} {monthLabel}的團購{isOpen?"":"已結單"}</div>
            <div style={{fontSize:"0.8rem",opacity:.85,marginTop:6,lineHeight:1.7}}>
              {isOpen?(settings.bulletin||DEFAULT_BULLETIN)
              :`歡迎期待下一期！`}
            </div>
          </div>
        )}

        <div style={{maxWidth:1200,margin:"0 auto",padding:"22px 16px"}}>
          {view==="shop"&&(
            isOpen
              ? <ShopView settings={settings} cats={cats} onOrderSuccess={handleOrderSuccess}/>
              : <div style={{textAlign:"center",padding:"60px 20px"}}>
                  <div style={{fontSize:"3rem",marginBottom:12}}>📦</div>
                  <div className="serif" style={{fontSize:"1.3rem",fontWeight:700,marginBottom:8}}>{monthLabel}的團購已結單</div>
                  <div style={{color:C.muted,fontSize:"0.88rem"}}>歡迎期待下一期，如有問題請聯絡 <a href="mailto:jamy844.bot@gmail.com" style={{color:C.gl}}>jamy844.bot@gmail.com</a></div>
                </div>
          )}
          {view==="myorder"&&<MyOrderView settings={settings} cats={cats}/>}
          {view==="admin"&&<AdminView settings={settings} setSettings={setSettings} cats={cats} setCats={setCats}/>}
        </div>
      </div>
      <SyncStatus/>
    </>
  );
}
