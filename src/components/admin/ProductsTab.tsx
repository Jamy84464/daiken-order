import { useState } from "react";
import { C, GAS_URL, WRITE_TOKEN } from "../../constants";
import { save } from "../../utils/storage";
import { Btn } from "../ui";
import type { Category } from "../../types";

interface ProductsTabProps {
  cats: Category[];
  setCats: (cats: Category[]) => void;
}

export function ProductsTab({ cats, setCats }: ProductsTabProps) {
  const [reloading, setReloading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reloadMsg, setReloadMsg] = useState("");

  const exportToSheet = async () => {
    setExporting(true); setReloadMsg("");
    try {
      const params = new URLSearchParams();
      params.append("action", "set");
      params.append("key", "cats");
      params.append("value", JSON.stringify(cats));
      params.append("token", WRITE_TOKEN || "");
      await fetch(GAS_URL || "", { method: "POST", mode: "no-cors", body: params });
      setReloadMsg("✅ 已匯出到試算表！請到 Google Sheets 確認「產品目錄」工作表。");
    } catch (e) { setReloadMsg("❌ 匯出失敗，請確認 Apps Script 已部署"); }
    setExporting(false);
  };

  const toggleOOS = async (catKey: string, id: string) => {
    const updated = cats.map(c => c.key === catKey ? { ...c, products: c.products.map(p => p.id === id ? { ...p, outOfStock: !p.outOfStock } : p) } : c);
    setCats(updated); await save("cats", updated);
  };

  const toggleHidden = async (catKey: string, id: string) => {
    const updated = cats.map(c => c.key === catKey ? { ...c, products: c.products.map(p => p.id === id ? { ...p, hidden: !p.hidden } : p) } : c);
    setCats(updated); await save("cats", updated);
  };

  const reloadFromSheet = async () => {
    setReloading(true); setReloadMsg("");
    try {
      const res = await fetch(`${GAS_URL}?action=getCats`);
      const json = await res.json();
      if (json.success && json.value) {
        const newCats = JSON.parse(json.value);
        setCats(newCats);
        try { localStorage.setItem("cats", JSON.stringify(newCats)); } catch {}
        setReloadMsg("✅ 已從試算表重新載入！");
      } else {
        setReloadMsg("❌ 載入失敗：" + (json.error || "未知錯誤"));
      }
    } catch (e) { setReloadMsg("❌ 連線失敗，請確認 Apps Script 已部署"); }
    setReloading(false);
  };

  return (
    <div>
      <div className="serif" style={{ fontSize: "0.97rem", fontWeight: 700, marginBottom: 14 }}>📦 產品管理</div>
      <div style={{ background: "#f0faf4", border: `1.5px solid ${C.gl}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: 8, color: C.green }}>📊 透過 Google Sheets 管理產品</div>
        <p style={{ fontSize: "0.81rem", color: C.muted, lineHeight: 1.9, marginBottom: 10 }}>
          在 Google Sheets「<strong>產品目錄</strong>」工作表新增或修改產品後，按下方按鈕重新載入。<br />
          欄位順序（標題列之後每列一個產品）：<br />
          <code style={{ background: "#e8f5e9", padding: "2px 6px", borderRadius: 3, fontSize: "0.76rem" }}>
            分類key ｜ 分類名稱 ｜ 產品ID ｜ 產品名稱 ｜ 價格 ｜ 網址 ｜ 缺貨(TRUE/FALSE) ｜ 下架(TRUE/FALSE)
          </code>
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Btn onClick={reloadFromSheet} disabled={reloading || exporting} color={C.green} small>
            {reloading ? "載入中…" : "🔄 從試算表重新載入產品"}
          </Btn>
          <Btn onClick={exportToSheet} disabled={reloading || exporting} color={C.gold} outline small>
            {exporting ? "匯出中…" : "📤 將目前產品匯出到試算表"}
          </Btn>
          {reloadMsg && <span style={{ fontSize: "0.8rem", color: reloadMsg.startsWith("✅") ? C.gl : C.red }}>{reloadMsg}</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: "0.75rem", marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ background: C.gp, border: `1px solid ${C.gl}`, borderRadius: 4, padding: "1px 7px" }}>正常</span>上架中</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ background: "#fff8e1", border: "1px solid #f6ad55", borderRadius: 4, padding: "1px 7px", color: "#c05621" }}>缺貨</span>顯示但無法訂購</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ background: "#f0f0f0", border: `1px solid ${C.muted}`, borderRadius: 4, padding: "1px 7px", color: C.muted }}>下架</span>完全不顯示</span>
      </div>
      {cats.map(cat => (
        <div key={cat.key} style={{ marginBottom: 18 }}>
          <div className="serif" style={{ fontSize: "0.87rem", fontWeight: 600, color: C.green, marginBottom: 8 }}>{cat.label}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {cat.products.map(p => {
              const isHidden = p.hidden;
              const isOOS = p.outOfStock;
              return (
                <div key={p.id} style={{ background: isHidden ? "#f5f5f5" : isOOS ? "#fff8e1" : C.gp, border: `1.5px solid ${isHidden ? C.muted : isOOS ? "#f6ad55" : C.gl}`, borderRadius: 9, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 9, opacity: isHidden ? 0.5 : 1 }}>
                  <span style={{ fontSize: "0.8rem", color: isHidden ? C.muted : C.text, flex: 1 }}>
                    {p.name} — NT${p.price.toLocaleString()}
                    {isHidden && <span style={{ marginLeft: 6, fontSize: "0.7rem", color: C.muted }}>（已下架）</span>}
                    {isOOS && !isHidden && <span style={{ marginLeft: 6, fontSize: "0.7rem", color: "#c05621" }}>（缺貨）</span>}
                  </span>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => toggleOOS(cat.key, p.id)} disabled={!!isHidden}
                      style={{ background: isOOS ? C.gl : "#f6ad55", color: C.white, border: "none", borderRadius: 6, padding: "3px 8px", fontSize: "0.72rem", cursor: isHidden ? "not-allowed" : "pointer", whiteSpace: "nowrap", opacity: isHidden ? 0.4 : 1 }}>
                      {isOOS ? "恢復上架" : "設為缺貨"}
                    </button>
                    <button onClick={() => toggleHidden(cat.key, p.id)}
                      style={{ background: isHidden ? C.green : "#718096", color: C.white, border: "none", borderRadius: 6, padding: "3px 8px", fontSize: "0.72rem", cursor: "pointer", whiteSpace: "nowrap" }}>
                      {isHidden ? "重新上架" : "下架"}
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
