# Changelog

本文件記錄大研訂購系統（Daiken Order）每個版本的變更內容。

## [3.0.0] - 2026-03-08

### 重大變更
- **拆分 App.js 單檔案架構**：將原本 ~2000 行的 `App.js` 拆分為模組化架構
  - `src/types.ts` — TypeScript 型別定義
  - `src/constants.ts` — 常數、設計 Token、產品目錄初始資料
  - `src/utils/helpers.ts` — 通用工具函式
  - `src/utils/storage.ts` — localStorage 與 GAS 儲存層
  - `src/utils/email.ts` — Email 服務與 HTML 模板
  - `src/utils/toast.ts` — Toast 通知系統
  - `src/hooks/useIsMobile.ts` — RWD Hook
  - `src/components/ui.tsx` — UI 原子元件（Btn, Field, TextInput, SelInput, TextArea）
  - `src/components/` — 頁面元件（ShopView, MyOrderView, AdminView）
  - `src/components/admin/` — 後台分頁元件（9 個獨立檔案）

- **加入 TypeScript**：全面轉換為 TypeScript，提升型別安全
  - 新增 `tsconfig.json` 設定（strict mode）
  - 定義完整型別介面（Settings, Product, Category, Order, Customer 等）
  - 所有元件與工具函式均已加入型別標註

### 新增
- **CSP 安全標頭**：在 `index.html` 加入 `Content-Security-Policy` meta 標籤
  - 限制 script 來源為 `'self'`
  - 限制 style 來源為 `'self'`、`'unsafe-inline'`、Google Fonts
  - 限制 font 來源為 `'self'`、Google Fonts Static
  - 限制 connect 來源為 `'self'`、Google Apps Script
  - 禁止 frame 與 object 嵌入
- **Dependabot 設定**：自動監控 npm 相依套件更新（每週一檢查）
- **CHANGELOG.md**：建立版本變更紀錄文件

## [2.9.6] - 2026-03-07

### 新增
- 完整的測試套件（19 個測試案例涵蓋所有主要功能）
- Husky + lint-staged 整合（pre-commit hook）

## [2.9.5] - 2026-03-06

### 新增
- 系統設定分頁（資料備份、清除測試資料）
- 備份功能重構（獨立工作表 `backup_app_data`）

## [2.9.2] - 2026-03-01

### 功能
- React 19 健康食品線上訂購系統
- 商品瀏覽與結帳（ShopView）
- 訂單查詢與修改（MyOrderView）
- 管理員後台（AdminView）含 8 個分頁
- Google Apps Script + Google Sheets 後端整合
- Email 通知系統（訂購確認、匯款通知、特別通知）
- 響應式設計（768px 斷點）
- localStorage 快取與離線降級
- Optimistic Locking 版本控制
