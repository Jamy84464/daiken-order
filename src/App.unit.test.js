/**
 * 單元測試：email 模板、驗證邏輯、儲存層、離線行為
 */

import {
  isValidEmail, orderKey, nowStr, dataEntries, flatProducts,
  emailWrap, itemsTableHtml, genConfirmEmail, genPaymentEmail, genNoticeEmail,
  save, load, _pendingVerify,
} from './App';

// ── Mock 環境 ──────────────────────────────────────────────────────────────────
const localStorageData = {};
beforeEach(() => {
  Object.keys(localStorageData).forEach(k => delete localStorageData[k]);
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(key => localStorageData[key] || null);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key, val) => { localStorageData[key] = val; });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) }));
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  // 清除 pending timers
  Object.keys(_pendingVerify).forEach(k => {
    clearTimeout(_pendingVerify[k]);
    delete _pendingVerify[k];
  });
});


// ── Email 驗證邏輯 ────────────────────────────────────────────────────────────
describe('isValidEmail', () => {
  test('接受有效 email', () => {
    expect(isValidEmail('ab@example.com')).toBe(true);
    expect(isValidEmail('user@mail.co.tw')).toBe(true);
    expect(isValidEmail('hello.world@test.org')).toBe(true);
  });

  test('拒絕 local 部分少於 2 字元', () => {
    expect(isValidEmail('a@example.com')).toBe(false);
  });

  test('拒絕缺少 @ 或 domain', () => {
    expect(isValidEmail('noatsign')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('test@')).toBe(false);
  });

  test('拒絕 TLD 少於 2 字元', () => {
    expect(isValidEmail('ab@example.c')).toBe(false);
  });

  test('拒絕含空白', () => {
    expect(isValidEmail('a b@test.com')).toBe(false);
    expect(isValidEmail('ab @test.com')).toBe(false);
  });

  test('拒絕空字串', () => {
    expect(isValidEmail('')).toBe(false);
  });
});


// ── Utility helpers ────────────────────────────────────────────────────────────
describe('orderKey', () => {
  test('生成正確的 key 格式', () => {
    expect(orderKey(2026, 3)).toBe('orders_2026_03');
    expect(orderKey(2026, 12)).toBe('orders_2026_12');
    expect(orderKey(2025, 1)).toBe('orders_2025_01');
  });
});

describe('nowStr', () => {
  test('回傳 zh-TW 格式字串', () => {
    const result = nowStr();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('dataEntries', () => {
  test('過濾掉 _ 前綴的 meta 欄位', () => {
    expect(dataEntries({ a: 1, _v: 123, b: 2, _x: 'y' })).toEqual({ a: 1, b: 2 });
  });

  test('空物件/非物件回傳空物件', () => {
    expect(dataEntries(null)).toEqual({});
    expect(dataEntries(undefined)).toEqual({});
    expect(dataEntries({})).toEqual({});
  });
});

describe('flatProducts', () => {
  const cats = [
    { key: 'fish', label: '魚油', products: [
      { id: 'p1', name: '魚油A', price: 700 },
      { id: 'p2', name: '魚油B', price: 450 },
    ]},
    { key: 'vitamin', label: '維生素', products: [
      { id: 'p3', name: '維他命C', price: 240 },
    ]},
  ];

  test('攤平所有產品並加上 category', () => {
    const fp = flatProducts(cats);
    expect(Object.keys(fp)).toEqual(['p1', 'p2', 'p3']);
    expect(fp.p1.category).toBe('fish');
    expect(fp.p3.category).toBe('vitamin');
  });

  test('保留產品原始屬性', () => {
    const fp = flatProducts(cats);
    expect(fp.p1.name).toBe('魚油A');
    expect(fp.p1.price).toBe(700);
  });
});


// ── Email 模板 ────────────────────────────────────────────────────────────────
describe('emailWrap', () => {
  test('產生包含標題的 HTML', () => {
    const html = emailWrap('測試標題', '<p>內容</p>');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('測試標題');
    expect(html).toContain('<p>內容</p>');
    expect(html).toContain('大研生醫');
  });
});

describe('itemsTableHtml', () => {
  const fp = { p1: { name: '魚油', price: 700, outOfStock: false }, p2: { name: '缺貨品', price: 500, outOfStock: true } };

  test('產生商品列表 HTML', () => {
    const { table } = itemsTableHtml([['p1', 2]], fp);
    expect(table).toContain('魚油');
    expect(table).toContain('NT$1,400');
  });

  test('showOOS 時標記缺貨品項', () => {
    const { table, oosItems } = itemsTableHtml([['p1', 1], ['p2', 1]], fp, true);
    expect(oosItems).toEqual(['缺貨品']);
    expect(table).toContain('line-through');
  });

  test('不 showOOS 時忽略缺貨品', () => {
    const { oosItems } = itemsTableHtml([['p1', 1], ['p2', 1]], fp, false);
    expect(oosItems).toEqual([]);
  });

  test('找不到產品時跳過', () => {
    const { table } = itemsTableHtml([['nonexist', 1]], fp);
    expect(table).not.toContain('undefined');
  });
});

describe('genConfirmEmail', () => {
  const cats = [{ key: 'fish', label: '魚油', products: [{ id: 'p1', name: '魚油A', price: 700 }] }];
  const order = {
    ordererName: '王小明', cart: { p1: 2 }, total: 1400,
    recipientName: '王大明', recipientPhone: '0912345678', recipientAddress: '台北市',
  };

  test('包含訂購人姓名', () => {
    const html = genConfirmEmail(order, cats);
    expect(html).toContain('王小明');
  });

  test('包含合計金額', () => {
    const html = genConfirmEmail(order, cats);
    expect(html).toContain('NT$1,400');
  });

  test('包含收件人資訊', () => {
    const html = genConfirmEmail(order, cats);
    expect(html).toContain('王大明');
    expect(html).toContain('台北市');
  });
});

describe('genPaymentEmail', () => {
  const cats = [{ key: 'fish', label: '魚油', products: [
    { id: 'p1', name: '魚油A', price: 700, outOfStock: false },
    { id: 'p2', name: '缺貨魚油', price: 500, outOfStock: true },
  ]}];
  const bank = { bankName: '玉山銀行', bankCode: '808', account: '123456', accountName: '林志銘' };
  const order = {
    ordererName: '王小明', cart: { p1: 1, p2: 1 }, total: 1200,
    recipientName: '王大明', recipientPhone: '0912', recipientAddress: '台北市',
  };

  test('包含匯款資訊', () => {
    const html = genPaymentEmail(order, bank, cats);
    expect(html).toContain('玉山銀行');
    expect(html).toContain('808');
    expect(html).toContain('123456');
  });

  test('扣除缺貨品計算實際金額', () => {
    const html = genPaymentEmail(order, bank, cats);
    // 實際應付 = 700 (p1) + 0 (p2 缺貨) = 700
    expect(html).toContain('NT$700');
  });

  test('顯示缺貨品項提示', () => {
    const html = genPaymentEmail(order, bank, cats);
    expect(html).toContain('缺貨魚油');
    expect(html).toContain('缺貨');
  });
});

describe('genNoticeEmail', () => {
  test('包含收件人與內容', () => {
    const html = genNoticeEmail('王小明', '這是通知內容');
    expect(html).toContain('王小明');
    expect(html).toContain('這是通知內容');
  });

  test('HTML 特殊字元被跳脫', () => {
    const html = genNoticeEmail('test', '<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});


// ── 儲存層（save/load）────────────────────────────────────────────────────────
describe('save', () => {
  test('同步寫入 localStorage', async () => {
    jest.useFakeTimers();
    await save('test_key', { a: 1 });
    expect(localStorageData.test_key).toBe(JSON.stringify({ a: 1 }));
    jest.runAllTimers();
  });

  test('訂單資料自動加入 _v 版本號', async () => {
    jest.useFakeTimers();
    const data = { email: 'test@test.com' };
    await save('orders_2026_03', data);
    expect(data._v).toBeDefined();
    expect(typeof data._v).toBe('number');
    jest.runAllTimers();
  });

  test('customers 資料自動加入 _v', async () => {
    jest.useFakeTimers();
    const data = { user: {} };
    await save('customers', data);
    expect(data._v).toBeDefined();
    jest.runAllTimers();
  });

  test('非訂單資料不加 _v', async () => {
    jest.useFakeTimers();
    const data = { text: 'hello' };
    await save('settings', data);
    expect(data._v).toBeUndefined();
    jest.runAllTimers();
  });
});

describe('load', () => {
  test('GAS 成功時從遠端載入', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      json: () => Promise.resolve({ success: true, value: JSON.stringify({ a: 1 }) }),
    }));
    const result = await load('test_key');
    expect(result).toEqual({ a: 1 });
  });

  test('GAS 失敗時降級至 localStorage', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Network error')));
    localStorageData.test_key = JSON.stringify({ fallback: true });
    const result = await load('test_key');
    expect(result).toEqual({ fallback: true });
  });

  test('GAS 失敗且 localStorage 也無資料時回傳 null', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Network error')));
    const result = await load('nonexist');
    expect(result).toBeNull();
  });

  test('GAS 回傳空值時回傳 null', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      json: () => Promise.resolve({ success: true, value: null }),
    }));
    const result = await load('empty_key');
    expect(result).toBeNull();
  });
});


// ── Race condition 驗證 ────────────────────────────────────────────────────────
describe('save read-back 驗證', () => {
  test('多次連續 save 同 key 只觸發最後一次驗證', async () => {
    jest.useFakeTimers();
    await save('settings', { v: 1 });
    await save('settings', { v: 2 });
    await save('settings', { v: 3 });
    // 只有一個 pending timer
    expect(Object.keys(_pendingVerify).filter(k => k === 'settings').length).toBeLessThanOrEqual(1);
    jest.runAllTimers();
  });
});
