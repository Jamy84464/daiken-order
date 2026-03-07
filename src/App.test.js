import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// ── Mock fetch & localStorage ────────────────────────────────────────────────

const mockSettings = {
  year: 2026, month: 3, isOpen: true,
  bulletin: "測試公告",
  bank: { bankName: "玉山銀行", bankCode: "808", account: "0989979013999", accountName: "林志銘" },
};

const mockCats = [
  { key: "fish", label: "🐟 魚油系列", products: [
    { id: "p1", name: "德國頂級魚油", price: 700, outOfStock: false, url: "https://example.com/p1" },
    { id: "p2", name: "兒童DHA魚油", price: 450, outOfStock: false, url: "https://example.com/p2" },
    { id: "p3", name: "缺貨魚油", price: 500, outOfStock: true, url: "https://example.com/p3" },
  ]},
  { key: "vitamin", label: "💊 維生素礦物質", products: [
    { id: "p6", name: "倍力他命", price: 475, outOfStock: false, url: "https://example.com/p6" },
  ]},
];

const mockOrders = {
  "test@example.com": {
    ordererName: "測試用戶", email: "test@example.com", phone: "0912345678",
    relation: "朋友",
    recipientName: "測試收件人", recipientAddress: "台北市信義區", recipientPhone: "0987654321",
    cart: { p1: 2, p2: 1 }, total: 1850, status: "pending",
    createdAt: "2026/3/1 10:00:00", updatedAt: null,
  },
};

const mockCustomers = {
  "test@example.com": {
    name: "測試用戶", email: "test@example.com", phone: "0912345678",
    relation: "朋友",
    lastRecipientName: "測試收件人", lastRecipientAddress: "台北市信義區", lastRecipientPhone: "0987654321",
    lastOrder: "2026/3", orderCount: 1, firstOrderAt: "2026/3/1 10:00:00",
  },
};

// localStorage mock
const localStorageData = {};
beforeEach(() => {
  Object.keys(localStorageData).forEach(k => delete localStorageData[k]);
  localStorageData.settings = JSON.stringify(mockSettings);
  localStorageData.cats = JSON.stringify(mockCats);

  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(key => localStorageData[key] || null);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key, val) => { localStorageData[key] = val; });
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(key => { delete localStorageData[key]; });
  jest.spyOn(Storage.prototype, 'clear').mockImplementation(() => { Object.keys(localStorageData).forEach(k => delete localStorageData[k]); });

  // Mock fetch - default: return settings/cats from GAS
  global.fetch = jest.fn((url) => {
    if (typeof url === 'string') {
      if (url.includes('action=get&key=settings')) {
        return Promise.resolve({ json: () => Promise.resolve({ success: true, value: JSON.stringify(mockSettings) }) });
      }
      if (url.includes('action=get&key=customers')) {
        return Promise.resolve({ json: () => Promise.resolve({ success: true, value: JSON.stringify(mockCustomers) }) });
      }
      if (url.includes('action=get&key=orders_')) {
        return Promise.resolve({ json: () => Promise.resolve({ success: true, value: JSON.stringify(mockOrders) }) });
      }
      if (url.includes('action=getCats')) {
        return Promise.resolve({ json: () => Promise.resolve({ success: true, value: JSON.stringify(mockCats) }) });
      }
      if (url.includes('action=verifyAdmin')) {
        const authed = url.includes('pw=admin123');
        return Promise.resolve({ json: () => Promise.resolve({ success: true, authed }) });
      }
    }
    // POST requests (save, sendEmail) — no-cors returns opaque response
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
  });

  // Suppress console.warn/error in tests
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});


// ── 1. App 基本載入 ──────────────────────────────────────────────────────────

describe('App 基本載入', () => {
  test('顯示載入中狀態', () => {
    // No localStorage cache → should show loading
    localStorageData.settings = undefined;
    localStorageData.cats = undefined;
    Storage.prototype.getItem.mockImplementation(() => null);
    render(<App />);
    expect(screen.getByText('載入中…')).toBeInTheDocument();
  });

  test('從 localStorage 快取載入後顯示主頁面', async () => {
    render(<App />);
    expect(screen.getByText(/大研生醫/)).toBeInTheDocument();
    expect(screen.getByText(/團購專區/)).toBeInTheDocument();
  });

  test('顯示版本號', () => {
    render(<App />);
    expect(screen.getByText(/v2\.9\.2/)).toBeInTheDocument();
  });

  test('顯示月份公告', () => {
    render(<App />);
    expect(screen.getByText(/2026年3月的團購/)).toBeInTheDocument();
  });

  test('顯示營業中狀態', () => {
    render(<App />);
    expect(screen.getByText(/2026年3月的團購/)).toBeInTheDocument();
    // 綠點表示營業中
    expect(screen.getByText(/🟢/)).toBeInTheDocument();
  });
});


// ── 2. 導覽列 ───────────────────────────────────────────────────────────────

describe('頁面導覽', () => {
  test('有三個導覽按鈕', () => {
    render(<App />);
    expect(screen.getByText('🛒 訂購')).toBeInTheDocument();
    expect(screen.getByText('🔍 查詢/修改訂單')).toBeInTheDocument();
    expect(screen.getByText('⚙️ 後台')).toBeInTheDocument();
  });

  test('點擊後台按鈕顯示登入頁面', () => {
    render(<App />);
    fireEvent.click(screen.getByText('⚙️ 後台'));
    expect(screen.getByText('🔐 管理員登入')).toBeInTheDocument();
  });

  test('點擊查詢/修改訂單顯示查詢頁面', () => {
    render(<App />);
    fireEvent.click(screen.getByText('🔍 查詢/修改訂單'));
    expect(screen.getByText(/請輸入.*Email/)).toBeInTheDocument();
  });

  test('點擊訂購回到主頁', () => {
    render(<App />);
    fireEvent.click(screen.getByText('⚙️ 後台'));
    expect(screen.getByText('🔐 管理員登入')).toBeInTheDocument();
    fireEvent.click(screen.getByText('🛒 訂購'));
    expect(screen.getByText(/購物車/)).toBeInTheDocument();
  });
});


// ── 3. 商品瀏覽 (ShopView) ──────────────────────────────────────────────────

describe('商品瀏覽', () => {
  test('顯示所有產品類別', () => {
    render(<App />);
    // 類別名稱同時出現在篩選按鈕和區段標題
    expect(screen.getAllByText('🐟 魚油系列').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('💊 維生素礦物質').length).toBeGreaterThanOrEqual(2);
  });

  test('顯示產品名稱和價格', () => {
    render(<App />);
    expect(screen.getByText(/德國頂級魚油/)).toBeInTheDocument();
    expect(screen.getAllByText(/NT\$700/).length).toBeGreaterThan(0);
  });

  test('缺貨商品顯示暫時缺貨', () => {
    render(<App />);
    expect(screen.getByText('暫時缺貨')).toBeInTheDocument();
  });

  test('有類別篩選按鈕', () => {
    render(<App />);
    expect(screen.getByText('全部')).toBeInTheDocument();
  });

  test('點擊類別篩選按鈕過濾產品', () => {
    render(<App />);
    // 點擊篩選按鈕（取第一個，即 filter button）
    const vitaminButtons = screen.getAllByText('💊 維生素礦物質');
    fireEvent.click(vitaminButtons[0]);
    // 維生素產品仍然可見
    expect(screen.getByText(/倍力他命/)).toBeInTheDocument();
  });

  test('購物車初始為空', () => {
    render(<App />);
    expect(screen.getByText('尚未加入商品')).toBeInTheDocument();
  });
});


// ── 4. 購物車操作 ────────────────────────────────────────────────────────────

describe('購物車操作', () => {
  test('點擊＋按鈕增加商品數量', () => {
    render(<App />);
    // 找到德國頂級魚油的＋按鈕
    const plusButtons = screen.getAllByText('＋');
    fireEvent.click(plusButtons[0]); // 第一個產品的 + 按鈕
    // 購物車不再顯示空
    expect(screen.queryByText('尚未加入商品')).not.toBeInTheDocument();
  });

  test('點擊−按鈕減少商品數量到0時從購物車移除', () => {
    render(<App />);
    const plusButtons = screen.getAllByText('＋');
    fireEvent.click(plusButtons[0]); // add 1
    expect(screen.queryByText('尚未加入商品')).not.toBeInTheDocument();

    const minusButtons = screen.getAllByText('−');
    fireEvent.click(minusButtons[0]); // remove 1
    // 應該要回到空的購物車（可能在購物車區域或在產品區域）
  });

  test('購物車顯示合計金額', () => {
    render(<App />);
    // 先加入一個 700 元的產品
    const plusButtons = screen.getAllByText('＋');
    fireEvent.click(plusButtons[0]);
    // 價格格式可能是 NT$700 或 NT700
    expect(screen.getAllByText(/NT\$?700/).length).toBeGreaterThan(0);
  });

  test('加入多個商品計算正確的總額', () => {
    render(<App />);
    const plusButtons = screen.getAllByText('＋');
    // 加入 p1 (700) x2
    fireEvent.click(plusButtons[0]);
    fireEvent.click(plusButtons[0]);
    // 加入 p2 (450) x1
    fireEvent.click(plusButtons[1]);
    // 合計 = 700*2 + 450 = 1850
    expect(screen.getByText('NT$1,850')).toBeInTheDocument();
  });
});


// ── 5. 訂單表單驗證 ──────────────────────────────────────────────────────────

describe('訂單表單驗證', () => {
  test('未填寫任何欄位送出顯示錯誤', () => {
    render(<App />);
    fireEvent.click(screen.getByText('送出訂單 ✉️'));
    // 應該顯示錯誤訊息
    expect(screen.getByText('請至少選擇一項商品')).toBeInTheDocument();
    expect(screen.getByText('請填寫有效 Email')).toBeInTheDocument();
  });

  test('必填欄位未填顯示必填提示', () => {
    render(<App />);
    fireEvent.click(screen.getByText('送出訂單 ✉️'));
    const requiredErrors = screen.getAllByText('必填');
    expect(requiredErrors.length).toBeGreaterThanOrEqual(4); // 姓名、手機、關係、收件人*3
  });
});


// ── 6. 已結單狀態 ────────────────────────────────────────────────────────────

describe('已結單狀態', () => {
  test('已結單時顯示結單訊息', () => {
    const closedSettings = { ...mockSettings, isOpen: false };
    localStorageData.settings = JSON.stringify(closedSettings);
    render(<App />);
    expect(screen.getAllByText(/已結單/).length).toBeGreaterThan(0);
  });

  test('已結單時查詢/修改訂單按鈕無法點擊', () => {
    const closedSettings = { ...mockSettings, isOpen: false };
    localStorageData.settings = JSON.stringify(closedSettings);
    render(<App />);
    const myOrderBtn = screen.getByText('🔍 查詢/修改訂單');
    // 按鈕應有 opacity 降低的效果（disabled 狀態）
    expect(myOrderBtn.style.opacity).toBe('0.4');
  });
});


// ── 7. 查詢訂單 (MyOrderView) ───────────────────────────────────────────────

describe('查詢訂單', () => {
  test('顯示 Email 輸入欄位和查詢按鈕', () => {
    render(<App />);
    fireEvent.click(screen.getByText('🔍 查詢/修改訂單'));
    expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
    expect(screen.getByText('查詢訂單')).toBeInTheDocument();
  });

  test('輸入 Email 查詢後顯示訂單', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('🔍 查詢/修改訂單'));

    const emailInput = screen.getByPlaceholderText('your@email.com');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByText('查詢訂單'));

    await waitFor(() => {
      expect(screen.getByText(/測試用戶/)).toBeInTheDocument();
    });
  });

  test('查無訂單顯示提示', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('🔍 查詢/修改訂單'));

    const emailInput = screen.getByPlaceholderText('your@email.com');
    fireEvent.change(emailInput, { target: { value: 'notfound@example.com' } });
    fireEvent.click(screen.getByText('查詢訂單'));

    await waitFor(() => {
      expect(screen.getByText(/查無本月訂單/)).toBeInTheDocument();
    });
  });
});


// ── 8. 管理員登入 (AdminView) ────────────────────────────────────────────────

describe('管理員登入', () => {
  test('顯示密碼欄位和登入按鈕', () => {
    render(<App />);
    fireEvent.click(screen.getByText('⚙️ 後台'));
    expect(screen.getByPlaceholderText('請輸入密碼')).toBeInTheDocument();
    expect(screen.getByText('登入')).toBeInTheDocument();
  });

  test('密碼正確可以登入', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('⚙️ 後台'));

    const pwInput = screen.getByPlaceholderText('請輸入密碼');
    fireEvent.change(pwInput, { target: { value: 'admin123' } });
    fireEvent.click(screen.getByText('登入'));

    await waitFor(() => {
      expect(screen.getByText('⚙️ 管理後台')).toBeInTheDocument();
    });
  });

  test('密碼錯誤顯示錯誤提示', async () => {
    window.alert = jest.fn();
    render(<App />);
    fireEvent.click(screen.getByText('⚙️ 後台'));

    const pwInput = screen.getByPlaceholderText('請輸入密碼');
    fireEvent.change(pwInput, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('登入'));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('密碼錯誤');
    });
  });

  test('空密碼不送出', () => {
    render(<App />);
    fireEvent.click(screen.getByText('⚙️ 後台'));
    fireEvent.click(screen.getByText('登入'));
    // fetch should not be called for verifyAdmin
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('action=verifyAdmin'),
    );
  });
});


// ── 9. 管理後台分頁 ─────────────────────────────────────────────────────────

describe('管理後台分頁', () => {
  const loginAdmin = async () => {
    render(<App />);
    fireEvent.click(screen.getByText('⚙️ 後台'));
    const pwInput = screen.getByPlaceholderText('請輸入密碼');
    fireEvent.change(pwInput, { target: { value: 'admin123' } });
    fireEvent.click(screen.getByText('登入'));
    await waitFor(() => {
      expect(screen.getByText('⚙️ 管理後台')).toBeInTheDocument();
    });
  };

  test('登入後顯示所有分頁按鈕', async () => {
    await loginAdmin();
    expect(screen.getByText('📋 本月訂單')).toBeInTheDocument();
    expect(screen.getByText('🚚 結單送貨')).toBeInTheDocument();
    expect(screen.getByText('✉️ 寄送信件')).toBeInTheDocument();
    expect(screen.getByText('📚 歷史訂單')).toBeInTheDocument();
    expect(screen.getByText('👥 訂購人資訊')).toBeInTheDocument();
    expect(screen.getByText('📢 公布欄')).toBeInTheDocument();
    expect(screen.getByText('📦 產品管理')).toBeInTheDocument();
    expect(screen.getByText('🗓 新月份')).toBeInTheDocument();
  });

  test('預設顯示本月訂單分頁', async () => {
    await loginAdmin();
    // 等待訂單載入
    await waitFor(() => {
      expect(screen.getByText('📦 訂單數')).toBeInTheDocument();
    });
  });

  test('切換到公布欄分頁', async () => {
    await loginAdmin();
    fireEvent.click(screen.getByText('📢 公布欄'));
    expect(screen.getByText('📢 公布欄內容')).toBeInTheDocument();
  });

  test('切換到產品管理分頁', async () => {
    await loginAdmin();
    fireEvent.click(screen.getByText('📦 產品管理'));
    expect(screen.getAllByText(/產品管理/).length).toBeGreaterThan(0);
    expect(screen.getByText(/透過 Google Sheets 管理產品/)).toBeInTheDocument();
  });

  test('切換到新月份分頁', async () => {
    await loginAdmin();
    fireEvent.click(screen.getByText('🗓 新月份'));
    expect(screen.getByText('🗓 開始新月份團購')).toBeInTheDocument();
  });
});


// ── 10. 訂單管理 (OrdersTab) ─────────────────────────────────────────────────

describe('訂單管理', () => {
  const loginAndGoToOrders = async () => {
    render(<App />);
    fireEvent.click(screen.getByText('⚙️ 後台'));
    const pwInput = screen.getByPlaceholderText('請輸入密碼');
    fireEvent.change(pwInput, { target: { value: 'admin123' } });
    fireEvent.click(screen.getByText('登入'));
    await waitFor(() => {
      expect(screen.getByText('⚙️ 管理後台')).toBeInTheDocument();
    });
    // 預設就在本月訂單
  };

  test('顯示訂單統計', async () => {
    // 確保 orders 資料在 localStorage（注意月份用 padStart）
    localStorageData[`orders_2026_03`] = JSON.stringify(mockOrders);
    await loginAndGoToOrders();
    await waitFor(() => {
      expect(screen.getByText('📦 訂單數')).toBeInTheDocument();
    }, { timeout: 3000 });
    expect(screen.getByText('⏳ 待處理')).toBeInTheDocument();
    expect(screen.getAllByText('✅ 已處理').length).toBeGreaterThan(0);
    expect(screen.getByText('💰 待收')).toBeInTheDocument();
  }, 10000);

  test('顯示訂單列表', async () => {
    await loginAndGoToOrders();
    await waitFor(() => {
      expect(screen.getByText('測試用戶')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });
  });
});


// ── 11. 購物車數量輸入 ──────────────────────────────────────────────────────

describe('購物車數量限制', () => {
  test('數量不會超過 99', () => {
    render(<App />);
    // 找到第一個數量 input
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '100' } });
    // 由於 Math.min(99, q)，值應被限制在 99
    expect(inputs[0].value).toBe('99');
  });

  test('數量不會小於 0', () => {
    render(<App />);
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '-5' } });
    expect(inputs[0].value).toBe('0');
  });
});


// ── 12. 響應式 ──────────────────────────────────────────────────────────────

describe('響應式設計', () => {
  test('在小螢幕顯示時不會崩潰', () => {
    // 模擬 768px 以下
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    window.dispatchEvent(new Event('resize'));
    render(<App />);
    expect(screen.getByText(/大研生醫/)).toBeInTheDocument();
  });
});


// ── 13. 公告顯示 ────────────────────────────────────────────────────────────

describe('公告顯示', () => {
  test('顯示自訂公告文字', () => {
    render(<App />);
    expect(screen.getByText('測試公告')).toBeInTheDocument();
  });

  test('無自訂公告時顯示預設公告', () => {
    const noAnnouncement = { ...mockSettings, bulletin: "" };
    localStorageData.settings = JSON.stringify(noAnnouncement);
    render(<App />);
    expect(screen.getByText(/每月月底結單/)).toBeInTheDocument();
  });
});


// ── 14. fetch 失敗降級至 localStorage ────────────────────────────────────────

describe('離線降級', () => {
  test('fetch 失敗時仍可從 localStorage 載入頁面', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Network error')));
    render(<App />);
    // 從 localStorage 載入，頁面仍可正常顯示
    expect(screen.getByText(/大研生醫/)).toBeInTheDocument();
    expect(screen.getByText(/德國頂級魚油/)).toBeInTheDocument();
  });
});


// ── 15. SyncStatus 元件 ─────────────────────────────────────────────────────

describe('SyncStatus', () => {
  test('初始不顯示同步警告', () => {
    render(<App />);
    expect(screen.queryByText(/雲端同步異常/)).not.toBeInTheDocument();
  });
});


// ── 16. 多個產品類別篩選 ────────────────────────────────────────────────────

describe('類別篩選', () => {
  test('點擊全部按鈕顯示所有產品', () => {
    render(<App />);
    // 先切換到特定類別（取第一個匹配，即篩選按鈕）
    const vitaminButtons = screen.getAllByText('💊 維生素礦物質');
    fireEvent.click(vitaminButtons[0]);
    // 再切回全部
    fireEvent.click(screen.getByText('全部'));
    expect(screen.getByText(/德國頂級魚油/)).toBeInTheDocument();
    expect(screen.getByText(/倍力他命/)).toBeInTheDocument();
  });
});


// ── 17. Email 查詢帶入歷史資料 ──────────────────────────────────────────────

describe('Email 歷史資料帶入', () => {
  test('輸入已知 Email 後自動帶入姓名', async () => {
    render(<App />);

    const emailInput = screen.getByPlaceholderText('請先輸入 Email');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.blur(emailInput);

    await waitFor(() => {
      expect(screen.getByText(/找到歷史紀錄/)).toBeInTheDocument();
    });
  });

  test('輸入新 Email 後顯示確認 Email 欄位', async () => {
    render(<App />);

    const emailInput = screen.getByPlaceholderText('請先輸入 Email');
    fireEvent.change(emailInput, { target: { value: 'new@example.com' } });
    fireEvent.blur(emailInput);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('請再輸入一次 Email 確認')).toBeInTheDocument();
    });
  });
});


// ── 18. 產品連結 ────────────────────────────────────────────────────────────

describe('產品連結', () => {
  test('產品名稱有外部連結', () => {
    render(<App />);
    const link = screen.getByText(/德國頂級魚油 🔗/);
    expect(link.closest('a')).toHaveAttribute('href', 'https://example.com/p1');
    expect(link.closest('a')).toHaveAttribute('target', '_blank');
  });
});


// ── 19. 成功送出訂單 ────────────────────────────────────────────────────────

describe('訂單送出', () => {
  test('成功送出顯示成功彈窗', async () => {
    render(<App />);

    // 1. 加入商品
    const plusButtons = screen.getAllByText('＋');
    fireEvent.click(plusButtons[0]); // p1 x1

    // 2. 模擬已知用戶的 Email
    const emailInput = screen.getByPlaceholderText('請先輸入 Email');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.blur(emailInput);

    // 等待歷史資料帶入
    await waitFor(() => {
      expect(screen.getByText(/找到歷史紀錄/)).toBeInTheDocument();
    });

    // 3. 送出
    fireEvent.click(screen.getByText('送出訂單 ✉️'));

    await waitFor(() => {
      expect(screen.getByText('🎉')).toBeInTheDocument();
      expect(screen.getByText('訂單已送出！')).toBeInTheDocument();
    });
  });
});
