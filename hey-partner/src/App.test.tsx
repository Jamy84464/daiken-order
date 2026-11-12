import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";
import { formatCode, isCompleteCode, buildInsights, monthOf } from "./utils/helpers";
import { submitFeedback, lookupFeedback } from "./utils/api";
import { adminUpdate } from "./utils/storage";
import type { Feedback } from "./types";

// ── fetch 假伺服器 ───────────────────────────────────────────────────────────
type Handler = (action: string, params: URLSearchParams) => any;
let handler: Handler;
let calls: { action: string; params: URLSearchParams }[] = [];

beforeEach(() => {
  calls = [];
  localStorage.clear();
  handler = (action) => action === "getPublicConfig"
    ? { success: true, value: { isOpen: true, bulletin: "" } }
    : { success: false, error: "unknown_action" };
  (global as any).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const params = init?.body ? new URLSearchParams(init.body as any) : new URL(url, "http://x").searchParams;
    const action = params.get("action") || "";
    calls.push({ action, params });
    const out = handler(action, params);
    if (out === "network") throw new TypeError("Failed to fetch");
    return { ok: true, json: async () => out } as any;
  });
  Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
  window.scrollTo = jest.fn() as any;
  Element.prototype.scrollIntoView = jest.fn();
});

const fb = (over: Partial<Feedback> = {}): Feedback => ({
  id: "FB261112-AAAAA", category: "flow", content: "請款流程太長", respond: "ack", meetWith: "",
  status: "received", reply: "", createdAt: "2026/11/12 上午9:00:00", updatedAt: null, history: [],
  name: "", contact: "", tags: [], subjects: [], note: "", archived: false, ts: 1, rev: 1, ...over,
});

// ── helpers ──────────────────────────────────────────────────────────────────
describe("helpers", () => {
  test("formatCode 正規化查詢碼", () => {
    expect(formatCode("abcd2345wxyz")).toBe("ABCD-2345-WXYZ");
    expect(formatCode("ab cd-23")).toBe("ABCD-23");
    expect(isCompleteCode("ABCD-2345-WXYZ")).toBe(true);
    expect(isCompleteCode("ABCD-2345")).toBe(false);
  });

  test("monthOf 解析台灣時間字串", () => {
    expect(monthOf("2026/3/5 下午1:00:00")).toBe("2026-03");
    expect(monthOf("")).toBe("");
  });

  test("buildInsights 找出跨月重複的標籤與共同對象", () => {
    const ins = buildInsights([
      fb({ id: "1", tags: ["跨部門", "效率"], subjects: ["業務部"], createdAt: "2026/10/1 上午9:00:00" }),
      fb({ id: "2", tags: ["跨部門"], subjects: ["業務部"], createdAt: "2026/11/2 上午9:00:00", category: "team" }),
      fb({ id: "3", respond: "meet", category: "vent" }),
      fb({ id: "4", respond: "meet", archived: true }),
    ]);
    expect(ins.total).toBe(4);
    expect(ins.open).toBe(3);
    expect(ins.tags[0]).toMatchObject({ key: "跨部門", count: 2, months: 2 });
    expect(ins.tags[0].categories.sort()).toEqual(["flow", "team"]);
    expect(ins.subjects[0]).toMatchObject({ key: "業務部", count: 2 });
    expect(ins.needsCare.map(f => f.id)).toEqual(["3"]); // 已結案的不算
    expect(ins.byCategory.vent).toBe(1);
    expect(ins.untagged).toBe(2);
  });
});

// ── api ──────────────────────────────────────────────────────────────────────
describe("api", () => {
  const input = { category: "env" as const, content: "冷氣太冷了啦", respond: "ack" as const, meetWith: "", name: "", contact: "" };

  test("送出成功回傳查詢碼，密語與資料走 POST body", async () => {
    handler = () => ({ success: true, code: "ABCD-2345-WXYZ" });
    const r = await submitFeedback(input, "secret", "sid1");
    expect(r).toEqual({ status: "ok", code: "ABCD-2345-WXYZ" });
    const p = calls[0].params;
    expect(p.get("teamCode")).toBe("secret");
    expect(p.get("submissionId")).toBe("sid1");
    expect(p.has("sid")).toBe(false); // Apps Script 保留字
    expect(JSON.parse(p.get("data")!)).toMatchObject({ category: "env" });
  });

  test("伺服器拒絕時回傳友善訊息", async () => {
    handler = () => ({ success: false, error: "bad_team_code" });
    const r = await submitFeedback(input, "x", "sid2");
    expect(r).toMatchObject({ status: "fail", message: expect.stringMatching(/通關密語/) });
  });

  test("收不到回應時用 submissionId 取回查詢碼，不重送", async () => {
    let n = 0;
    handler = (action) => {
      if (action === "submitFeedback") return "network";
      if (action === "checkSubmission") return ++n < 2 ? { success: false, error: "not_found" } : { success: true, code: "QQQQ-2345-WXYZ" };
    };
    const r = await submitFeedback(input, "x", "sid3", 0);
    expect(r).toEqual({ status: "ok", code: "QQQQ-2345-WXYZ" });
    expect(calls.filter(c => c.action === "submitFeedback")).toHaveLength(1);
  });

  test("查詢碼走 POST，不出現在網址", async () => {
    handler = () => ({ success: true, value: fb() });
    const r = await lookupFeedback("ABCD-2345-WXYZ");
    expect(r.ok).toBe(true);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).not.toMatch(/ABCD/);
    expect(init.method).toBe("POST");
  });

  test("adminUpdate 帶 rev 做樂觀鎖定，衝突時回傳最新版本", async () => {
    handler = () => ({ success: false, error: "version_conflict", value: fb({ rev: 5 }) });
    const r = await adminUpdate(fb({ rev: 3 }), { status: "seeded" }, false);
    expect(calls[0].params.get("baseRev")).toBe("3");
    expect(r).toMatchObject({ ok: false, latest: { rev: 5 } });
  });
});

// ── 畫面 ─────────────────────────────────────────────────────────────────────
describe("前台", () => {
  test("顯示標題與五大類別", async () => {
    render(<App />);
    expect(screen.getByText(/工作上的大小事，都值得被聽見/)).toBeInTheDocument();
    expect(await screen.findByText("我希望工作環境更舒適！")).toBeInTheDocument();
    for (const t of ["我希望工作環境更舒適！", "我希望工作流程更順暢！", "我希望團隊夥伴更給力！", "我希望我們更上一層樓！", "我受不了了～～～！"]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });

  test("選擇面談時必須留下稱呼與聯絡方式", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("radio", { name: /我受不了了/ }));
    fireEvent.change(screen.getByLabelText("回饋內容"), { target: { value: "這件事已經發生很多次了" } });
    fireEvent.click(screen.getByRole("radio", { name: /我需要面對面聊聊/ }));
    expect(screen.getByText("想跟誰聊聊？")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("問問主管或 HR"), { target: { value: "team" } });
    fireEvent.click(screen.getByRole("button", { name: /送出/ }));
    expect(await screen.findByText(/請留下我們可以怎麼稱呼你/)).toBeInTheDocument();
    expect(calls.some(c => c.action === "submitFeedback")).toBe(false);
  });

  test("匿名送出成功後顯示查詢碼，並記住通關密語", async () => {
    handler = (action) => action === "submitFeedback"
      ? { success: true, code: "ABCD-2345-WXYZ" }
      : { success: true, value: { isOpen: true, bulletin: "" } };
    render(<App />);
    fireEvent.click(await screen.findByRole("radio", { name: /工作環境更舒適/ }));
    fireEvent.change(screen.getByLabelText("回饋內容"), { target: { value: "會議室冷氣太冷了" } });
    fireEvent.click(screen.getByRole("radio", { name: /讓我知道你有收到就好了/ }));
    fireEvent.change(screen.getByPlaceholderText("問問主管或 HR"), { target: { value: "team-secret" } });
    fireEvent.click(screen.getByRole("button", { name: /送出/ }));
    expect(await screen.findByText("ABCD-2345-WXYZ")).toBeInTheDocument();
    expect(screen.getByText("訊息已經反映成功")).toBeInTheDocument();
    const sent = JSON.parse(calls.find(c => c.action === "submitFeedback")!.params.get("data")!);
    expect(sent).toMatchObject({ category: "env", respond: "ack", name: "", contact: "" });
    expect(localStorage.getItem("hp_team_code")).toBe("team-secret");
  });

  test("暫停收件時無法送出", async () => {
    handler = () => ({ success: true, value: { isOpen: false, bulletin: "" } });
    render(<App />);
    expect(await screen.findByText("信箱暫時休息中")).toBeInTheDocument();
  });

  test("用查詢碼查看進度與回覆", async () => {
    handler = (action) => action === "lookupFeedback"
      ? { success: true, value: fb({ status: "thinking", reply: "我們正在研究新的請款系統" }) }
      : { success: true, value: { isOpen: true, bulletin: "" } };
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /查進度/ }));
    fireEvent.change(screen.getByLabelText("查詢碼"), { target: { value: "abcd2345wxyz" } });
    fireEvent.click(screen.getByRole("button", { name: "查詢" }));
    expect(await screen.findByText("有難度！燒腦中，請給我們多一些時間努力")).toBeInTheDocument();
    expect(screen.getByText("我們正在研究新的請款系統")).toBeInTheDocument();
    expect(calls.find(c => c.action === "lookupFeedback")!.params.get("code")).toBe("ABCD-2345-WXYZ");
  });
});

describe("後台", () => {
  test("登入後看到回饋並可改狀態", async () => {
    let list = [fb({ id: "FB1", content: "影印機常卡紙", category: "env" })];
    handler = (action, p) => {
      if (action === "verifyAdmin") return { success: true, authed: p.get("pw") === "pw" };
      if (action === "adminList") return { success: true, value: list };
      if (action === "adminUpdate") {
        const patch = JSON.parse(p.get("patch")!);
        list = [{ ...list[0], ...patch, rev: 2 }];
        return { success: true, value: list[0], emailSent: null };
      }
      return { success: true, value: { isOpen: true, bulletin: "" } };
    };
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "後台" }));
    fireEvent.change(await screen.findByLabelText("管理員密碼"), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: "登入" }));
    fireEvent.click(await screen.findByText("影印機常卡紙"));
    fireEvent.click(screen.getByRole("button", { name: /種子已種下/ }));
    fireEvent.click(screen.getByRole("button", { name: "#設備" }));
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(calls.some(c => c.action === "adminUpdate")).toBe(true));
    const patch = JSON.parse(calls.find(c => c.action === "adminUpdate")!.params.get("patch")!);
    expect(patch).toEqual({ status: "seeded", tags: ["設備"] });
    // 密碼不出現在任何網址
    (global.fetch as jest.Mock).mock.calls.forEach(([url]) => expect(String(url)).not.toMatch(/pw=/));
  });
});
