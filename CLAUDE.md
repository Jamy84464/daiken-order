# CLAUDE.md — 大墾訂購系統 (Daiken Order)

## 專案概述

這是一個基於 React 的健康食品線上訂購系統，用於管理產品目錄、客戶訂單、Email 通知與月結作業。後端透過 Google Apps Script (GAS) 連接 Google Sheets 進行資料儲存。部署於 GitHub Pages。

- **目前版本：** v2.9.2
- **線上位址：** https://jamy84464.github.io/daiken-order

## 技術棧

| 項目 | 技術 |
|------|------|
| 前端框架 | React 19 (Create React App) |
| 語言 | JavaScript (ES6+) |
| 樣式 | 行內樣式 + 設計 Token 系統 |
| 字型 | Google Fonts (Noto Sans TC, Noto Serif TC) |
| 測試 | Jest + @testing-library/react |
| 部署 | GitHub Pages (gh-pages) |
| 後端 | Google Apps Script + Google Sheets |
| Email | Gmail (透過 GAS 發送) |

## 常用指令

```bash
# 開發
npm start              # 啟動開發伺服器 (port 3000)

# 建置
npm run build          # 產生正式環境建置

# 測試
npm test               # 執行測試 (Jest, watch mode)
npx react-scripts test --watchAll=false   # 執行一次性測試（CI 適用）

# 部署
npm run deploy         # 建置並部署至 GitHub Pages

# Lint
# 使用 CRA 內建 ESLint (react-app + react-app/jest)，無獨立 lint 指令
# ESLint 會在 npm start / npm run build 時自動執行
```

## 專案結構

```
daiken-order/
├── src/
│   ├── App.js              # 主要應用程式 (~1772 行，包含所有元件與邏輯)
│   ├── App.css             # 預設樣式
│   ├── App.test.js         # 基本測試
│   ├── index.js            # React 進入點
│   ├── index.css           # 全域樣式 (含動畫 keyframes)
│   ├── setupTests.js       # Jest 設定 (jest-dom)
│   └── reportWebVitals.js  # 效能監測
├── public/
│   ├── index.html          # HTML 範本
│   └── manifest.json       # PWA 設定
├── package.json            # 依賴與腳本
└── CLAUDE.md               # 本文件
```

## 架構說明

### 單檔案架構

所有主要程式碼集中在 `src/App.js`，包含：

1. **設計 Token 系統 (`C` 常數)** — 色彩與樣式常數
2. **儲存層** — localStorage 與 GAS API 的讀寫邏輯
3. **Email 服務** — `requestSendEmail()` 與 HTML 模板產生
4. **UI 原子元件** — `Btn`, `Field`, `TextInput`, `SelInput`, `TextArea`
5. **自訂 Hook** — `useIsMobile()` (RWD 判斷，768px 斷點)
6. **頁面元件：**
   - `ShopView` — 商品瀏覽與結帳
   - `MyOrderView` — 訂單查詢與修改
   - `AdminView` — 後台管理 (含多個分頁)

### Admin 後台分頁

| 分頁 | 功能 |
|------|------|
| BulletinTab | 公告管理 |
| ProductsTab | 產品目錄（與 Sheets 同步） |
| OrdersTab | 訂單狀態追蹤 |
| HistoryTab | 歷史訂單 |
| CustomersTab | 訂閱者列表 |
| CloseoutTab | 月結作業 |
| EmailsTab | 付款通知與群發 Email |
| NewMonthTab | 換月作業 |

### 資料流

```
瀏覽器 localStorage ←→ React State ←→ Google Apps Script ←→ Google Sheets
```

- **讀取：** 優先使用 localStorage 快取，背景同步 GAS
- **寫入：** 更新 localStorage 後呼叫 GAS，4 秒後回讀驗證
- **版本控制：** 使用樂觀鎖定 (`_v` 欄位) 避免衝突
- **離線容錯：** GAS 不可用時使用 localStorage 降級

### localStorage Keys

| Key | 說明 |
|-----|------|
| `settings` | 月份/年份、營業狀態、公告、銀行資訊 |
| `cats` | 產品目錄 |
| `orders_YYYY_MM` | 每月訂單 |
| `customers` | 訂閱者聯絡紀錄 |

## 程式碼慣例

### 命名規則

- **函式/變數：** camelCase (`loadSettings`, `flatProducts`)
- **React 元件：** PascalCase (`ShopView`, `AdminView`)
- **內部匯出：** 底線前綴 (`_notifySyncWarning`, `_saveVersions`)
- **縮寫變數：** 部分情境使用簡寫 (`fp` = flatProducts, `custs` = customers)

### 樣式系統

使用 `C` 常數作為設計 Token：

```javascript
const C = {
  green: "#2d6a4f",     // 主色
  gl: "#40916c",        // 淺綠
  gp: "#d8f3dc",        // 極淺綠
  gold: "#b7791f",      // 強調色
  cream: "#faf7f2",     // 背景色
  text: "#1a1a1a",      // 文字色
  muted: "#6b7280",     // 次要文字
  border: "#e5e0d8",    // 邊框
  red: "#c0392b",       // 錯誤/警告
  white: "#fff"
};
```

### 元件模式

- 使用 React Hooks (useState, useEffect, useRef)
- 行內 JSX 樣式搭配設計 Token
- 響應式設計透過 `useIsMobile()` Hook
- Modal 元件：`EmailModal`, `ConfirmModal`, `SyncStatus`

### 語言

- **UI 文字：** 繁體中文
- **程式碼註解：** 中文為主
- **變數/函式名：** 英文

## 外部服務

| 服務 | 用途 |
|------|------|
| Google Apps Script | 後端 API (資料讀寫、Email 發送) |
| Google Sheets | 資料儲存 (產品目錄、訂單、客戶) |
| Gmail | Email 通知 (透過 GAS) |
| GitHub Pages | 靜態網站託管 |
| Google Fonts | 字型 (Noto Sans TC, Noto Serif TC) |

## 注意事項

- GAS API 使用 no-cors 模式以避免重新導向錯誤
- 寫入操作後有 4 秒延遲回讀驗證
- 產品類別包含：魚油、維他命、心血管、眼睛、消化、活力、美容、關節、睡眠
- 響應式斷點為 768px
- 動畫效果：fadeUp、pop (定義於 index.css)
