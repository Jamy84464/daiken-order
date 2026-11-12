export type CategoryKey = "env" | "flow" | "team" | "up" | "vent";
export type RespondKey = "ack" | "attention" | "reply" | "meet";
export type StatusKey = "received" | "seeded" | "thinking" | "action";

export interface CategoryDef {
  key: CategoryKey;
  title: string;
  emoji: string;
  desc: string;
  placeholder: string;
  tags: string[];
  /** 主色（文字、邊框） */
  color: string;
  /** 淺底色 */
  tint: string;
}

export interface RespondDef {
  key: RespondKey;
  label: string;
  emoji: string;
  hint: string;
}

export interface StatusDef {
  key: StatusKey;
  label: string;
  short: string;
  emoji: string;
  color: string;
  tint: string;
}

export interface HistoryItem {
  at: string;
  status: StatusKey;
}

/** 送出者用查詢碼看到的內容：不含標籤、涉及對象、內部備註、聯絡資料 */
export interface PublicFeedback {
  id: string;
  category: CategoryKey;
  content: string;
  respond: RespondKey;
  meetWith: string;
  status: StatusKey;
  reply: string;
  createdAt: string;
  updatedAt: string | null;
  history: HistoryItem[];
}

/** 後台看到的完整內容 */
export interface Feedback extends PublicFeedback {
  name: string;
  contact: string;
  tags: string[];
  subjects: string[];
  note: string;
  archived: boolean;
  ts: number;
  rev: number;
}

export interface FeedbackInput {
  category: CategoryKey;
  content: string;
  respond: RespondKey;
  meetWith: string;
  name: string;
  contact: string;
}

export interface PublicConfig {
  isOpen: boolean;
  bulletin: string;
}

export interface AdminConfig extends PublicConfig {
  notifyEmail: string;
}

export interface FeedbackPatch {
  status?: StatusKey;
  tags?: string[];
  subjects?: string[];
  note?: string;
  reply?: string;
  archived?: boolean;
}
