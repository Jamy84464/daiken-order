export interface BankInfo {
  bankName: string;
  bankCode: string;
  account: string;
  accountName: string;
}

export interface Settings {
  year: number;
  month: number;
  isOpen: boolean;
  bulletin: string;
  // 公開設定不含銀行帳號；只有登入後台後讀到的完整設定才有
  bank?: BankInfo;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  outOfStock: boolean;
  url: string;
  hidden?: boolean;
  category?: string;
}

export interface Category {
  key: string;
  label: string;
  products: Product[];
}

export interface Cart {
  [productId: string]: number;
}

export interface Order {
  ordererName: string;
  email: string;
  phone: string;
  relation: string;
  recipientName: string;
  recipientAddress: string;
  recipientPhone: string;
  cart: Cart;
  total: number;
  status: string;
  createdAt: string;
  updatedAt: string | null;
  lineId?: string;
  note?: string;
  // 送出識別碼：伺服器用來辨識重送，前端收不到回應時用來回讀確認
  sid?: string;
}

export interface Customer {
  name: string;
  email: string;
  phone: string;
  relation: string;
  lastRecipientName: string;
  lastRecipientAddress: string;
  lastRecipientPhone: string;
  lastOrder: string;
  orderCount: number;
  firstOrderAt: string;
  lineId?: string;
}

export interface HistoryEntry {
  key: string;
  year: number;
  month: number;
  closedAt: string;
  orderCount: number;
  totalAmt: number;
}

export interface BackupMeta {
  label: string;
  createdAt: string;
  timestamp: number;
  version: string;
  orderKeys: string[];
  data?: BackupData;
}

export interface BackupData {
  settings: Settings;
  cats: Category[];
  customers: Record<string, Customer>;
  history: HistoryEntry[];
  orders: Record<string, Record<string, Order>>;
}

export interface ToastItem {
  id: number;
  msg: string;
  type: "error" | "success";
}
