# CLAUDE.md — Hey 夥伴！請聽我說～～

公司內部回饋系統。架構沿用大研訂購系統（React 19 + TypeScript + CRA，GAS + Google Sheets 後端，GitHub Pages）。
詳細功能、安全設計與部署見 `README.md`。

## 指令

```bash
npm start
npx react-scripts test --watchAll=false
npm run lint
npm run build
```

## 結構

```
src/
├── types.ts              # 型別
├── constants.ts          # 設計 Token（C/T/S/R/E）、類別／回應／狀態定義、globalCSS
├── utils/
│   ├── http.ts           # gasPost（POST 共用，讀不到回應回報 unknown）
│   ├── api.ts            # 同仁端：送出、查詢碼查詢、本機記住的查詢碼
│   ├── storage.ts        # 管理員端：密碼只存記憶體，全部走 POST
│   ├── helpers.ts        # 查詢碼格式、彙整統計 buildInsights
│   └── toast.ts
├── components/
│   ├── ui.tsx            # Btn / Card / Chip / Pill / Field / TextInput / TextArea / Modal / StepTitle
│   ├── SubmitView.tsx    # 前台填寫（四步驟）+ 查詢碼票根
│   ├── TrackView.tsx     # 查進度
│   ├── AdminView.tsx     # 後台登入與分頁
│   └── admin/            # InboxTab / InsightsTab / SettingsTab
gas/Code.gs               # 後端，需手動貼到 Apps Script 並部署新版本
```

## 慣例

- UI 文字繁體中文、註解中文、變數英文
- 行內樣式 + `constants.ts` 的設計 Token；標題用 `className="display"`（粉圓體）
- 類別、回應、狀態的 key 與標籤要同時改 `src/constants.ts` 與 `gas/Code.gs`
- 送給同仁看的資料一律經過 GAS `publicView()`，不可包含標籤、涉及對象、內部備註、聯絡資料
- 參數名稱不可用 `sid`、`c`（Apps Script 保留字）
