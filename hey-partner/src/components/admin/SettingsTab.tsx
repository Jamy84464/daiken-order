import { useState, useEffect } from "react";
import { C, T, S, R } from "../../constants";
import { Btn, Card, Field, TextInput, TextArea } from "../ui";
import { adminGetConfig, adminSetConfig } from "../../utils/storage";
import { showToast } from "../../utils/toast";
import type { AdminConfig } from "../../types";

export function SettingsTab() {
  const [cfg, setCfg] = useState<AdminConfig | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminGetConfig().then(r => { if (r.ok) setCfg(r.value); else setErr(r.message); });
  }, []);

  if (err) return <Card style={{ color: C.redDark, fontWeight: 600 }}>⚠ 讀取設定失敗：{err}</Card>;
  if (!cfg) return <div style={{ textAlign: "center", color: C.muted, padding: S[7] }}>載入中…</div>;

  const save = async () => {
    setSaving(true);
    const r = await adminSetConfig(cfg);
    setSaving(false);
    if (r.ok) { setCfg(r.value); showToast("設定已儲存", "success"); } else showToast(r.message);
  };

  return (
    <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: S[4] }}>
      <Card>
        <h3 className="display" style={{ fontSize: T.md, fontWeight: 400, marginBottom: S[4] }}>前台</h3>
        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S[3], padding: `${S[3]}px ${S[4]}px`, background: C.surface, borderRadius: R.md, marginBottom: S[4], cursor: "pointer" }}>
          <span>
            <span style={{ display: "block", fontWeight: 700, fontSize: T.base }}>{cfg.isOpen ? "🟢 開放收件中" : "🌙 暫停收件"}</span>
            <span style={{ display: "block", fontSize: T.xs, color: C.muted }}>暫停時同仁仍可用查詢碼查看進度</span>
          </span>
          <input type="checkbox" role="switch" checked={cfg.isOpen} onChange={e => setCfg({ ...cfg, isOpen: e.target.checked })} style={{ width: 22, height: 22, accentColor: C.primary }} />
        </label>
        <Field label="前台公告" hint="會顯示在填寫頁最上方，留白則不顯示（最多 500 字）">
          <TextArea value={cfg.bulletin} onChange={v => setCfg({ ...cfg, bulletin: v })} rows={3} maxLength={500} placeholder="例如：本月起每週五下午 HR 會統一回覆大家的回饋 🙌" />
        </Field>
      </Card>

      <Card>
        <h3 className="display" style={{ fontSize: T.md, fontWeight: 400, marginBottom: S[4] }}>通知</h3>
        <Field label="新回饋通知信箱" hint="有新回饋時寄信通知，多個信箱用逗號分隔；留白則不寄">
          <TextInput value={cfg.notifyEmail} onChange={v => setCfg({ ...cfg, notifyEmail: v })} inputMode="email" placeholder="hr@example.com, boss@example.com" />
        </Field>
      </Card>

      <div><Btn onClick={save} disabled={saving}>{saving ? "儲存中…" : "儲存設定"}</Btn></div>

      <Card style={{ background: C.surface, border: "none", fontSize: T.sm, color: C.sub, lineHeight: 1.85 }}>
        <div style={{ fontWeight: 700, color: C.ink, marginBottom: S[2] }}>🔐 安全設定提醒</div>
        通關密語、管理員密碼放在 Apps Script 的「指令碼屬性」（<code>TEAM_CODE</code>、<code>ADMIN_PW</code>），不在網頁上修改。<br />
        更換通關密語後，同仁下次送出時需要重新輸入。
      </Card>
    </div>
  );
}
