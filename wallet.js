// apps/wallet.js
// imports:
//   from '../core/storage.js': getData, setData, generateId, getNow, getDB, setDB, deleteDB, compressImage, getAllDB
//   from '../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon

import {
  getData,
  setData,
  generateId,
  getNow,
  getDB,
  setDB,
  deleteDB,
  compressImage,
  getAllDB
} from '../core/storage.js';

import {
  showToast,
  showBottomSheet,
  hideBottomSheet,
  showConfirm,
  createIcon
} from '../core/ui.js';

const WALLET_KEY = 'wallet';
const AI_WALLETS_KEY = 'app_ai_wallets';
const PROFILE_KEY = 'app_wallet_profile';
const STYLE_ID = 'wallet-styles';

const BG_KEY = 'app_bg_wallet';
const CARD_BG_KEY = 'app_wallet_card_bg';
const ICON_KEY = 'app_wallet_icon';
const AI_INITIAL_BALANCE = 5000;

let container = null;
let walletIconCache = '';
let walletCardBgCache = '';
let currentFilter = 'all';
let currentAiFilter = 'all';
let currentAiPage = null;
let allCharacters = [];
let unsubscribeCharsUpdated = null;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .wallet-screen {
      position: fixed;
      inset: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
    }

    .wallet-screen.has-bg {
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }

    .wallet-soft-layer {
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      background: transparent;
    }

    .wallet-nav {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 100;
      height: calc(58px + env(safe-area-inset-top));
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: env(safe-area-inset-top) 20px 0;
      background: color-mix(in srgb, var(--bg-primary) 76%, transparent);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .wallet-nav-title {
      flex: 1;
      min-width: 0;
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wallet-body {
      position: relative;
      z-index: 1;
      flex: 1;
      overflow-x: hidden;
      overflow-y: auto;
      padding: calc(58px + env(safe-area-inset-top) + 18px) 20px calc(92px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling: touch;
    }

    .wallet-balance-card,
    .wallet-action,
    .wallet-record,
    .wallet-empty,
    .wallet-custom-section,
    .wallet-ai-row,
    .wallet-filter-panel,
    .wallet-ai-page-card,
    .wallet-ai-stat,
    .wallet-gift-thumb {
      background: color-mix(in srgb, var(--bg-card) 90%, transparent);
      box-shadow: var(--shadow-sm);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .wallet-screen.has-bg .wallet-balance-card,
    .wallet-screen.has-bg .wallet-action,
    .wallet-screen.has-bg .wallet-record,
    .wallet-screen.has-bg .wallet-empty,
    .wallet-screen.has-bg .wallet-custom-section,
    .wallet-screen.has-bg .wallet-ai-row,
    .wallet-screen.has-bg .wallet-filter-panel,
    .wallet-screen.has-bg .wallet-ai-page-card,
    .wallet-screen.has-bg .wallet-ai-stat,
    .wallet-screen.has-bg .wallet-gift-thumb {
      background: color-mix(in srgb, var(--bg-card) 70%, transparent);
    }

    .wallet-balance-card {
      min-height: 196px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 22px;
      border-radius: 28px;
      overflow: hidden;
      position: relative;
      box-shadow: var(--shadow-md);
    }

    .wallet-balance-card.has-card-bg {
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }

    .wallet-card-layer {
      position: absolute;
      inset: 0;
      z-index: 0;
      background: color-mix(in srgb, var(--bg-card) 34%, transparent);
      pointer-events: none;
    }

    .wallet-card-content {
      position: relative;
      z-index: 1;
    }

    .wallet-balance-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-md);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
    }

    .wallet-mark,
    .wallet-ai-avatar,
    .wallet-ai-page-avatar,
    .wallet-record-icon,
    .wallet-record-avatar {
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--accent-light);
      color: var(--accent-dark);
      overflow: hidden;
    }

    .wallet-mark {
      width: 42px;
      height: 42px;
      border-radius: 16px;
      box-shadow: var(--shadow-sm);
    }

    .wallet-mark img,
    .wallet-ai-avatar img,
    .wallet-ai-page-avatar img,
    .wallet-record-avatar img,
    .wallet-gift-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .wallet-balance-number {
      margin-top: 18px;
      color: var(--text-primary);
      font-size: 42px;
      font-weight: 600;
      line-height: 1;
      letter-spacing: -0.04em;
    }

    .wallet-balance-number span {
      font-size: 18px;
      font-weight: 500;
      color: var(--text-secondary);
      letter-spacing: 0;
    }

    .wallet-balance-note {
      margin-top: 12px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.55;
      white-space: pre-wrap;
    }

    .wallet-balance-mood {
      margin-top: 8px;
      color: var(--accent-dark);
      font-size: var(--font-size-small);
      font-weight: 600;
      line-height: 1.5;
    }

    .wallet-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-md);
      margin-top: var(--spacing-md);
    }

    .wallet-action {
      min-height: 54px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-sm);
      border-radius: 18px;
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      transition: all 200ms ease;
    }

    .wallet-action.primary {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .wallet-action:active,
    .wallet-mini-btn:active,
    .wallet-ai-row:active,
    .wallet-filter-btn:active {
      transform: scale(0.96);
    }

    .wallet-section {
      margin-top: 24px;
    }

    .wallet-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-sm);
      padding: 0 2px;
    }

    .wallet-section-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .wallet-filter-panel {
      display: none;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: var(--spacing-md);
      padding: 10px;
      border-radius: 20px;
    }

    .wallet-filter-panel.open {
      display: grid;
    }

    .wallet-filter-btn {
      min-height: 34px;
      border-radius: 13px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 600;
      transition: all 200ms ease;
    }

    .wallet-filter-btn.active {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .wallet-list,
    .wallet-ai-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .wallet-record {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: 14px;
      border-radius: 20px;
    }

    .wallet-record-icon,
    .wallet-record-avatar {
      width: 40px;
      height: 40px;
      flex: 0 0 40px;
      border-radius: 15px;
      background: var(--surface-muted);
      color: var(--text-secondary);
    }

    .wallet-record.income .wallet-record-icon {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .wallet-record-main {
      flex: 1;
      min-width: 0;
    }

    .wallet-record-title {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 500;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wallet-record-time {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wallet-record-amount {
      flex: 0 0 auto;
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.4;
    }

    .wallet-record.income .wallet-record-amount {
      color: var(--accent-dark);
    }

    .wallet-record.expense .wallet-record-amount {
      color: var(--text-secondary);
    }

    .wallet-gift-thumb {
      width: 42px;
      height: 42px;
      flex: 0 0 42px;
      border-radius: 16px;
      color: var(--accent-dark);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .wallet-empty {
      min-height: 210px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-lg);
      border-radius: 24px;
      color: var(--text-secondary);
      text-align: center;
    }

    .wallet-empty-icon {
      width: 56px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 20px;
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .wallet-empty-title,
    .wallet-custom-title,
    .wallet-ai-page-name {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .wallet-empty-text,
    .wallet-custom-sub,
    .wallet-ai-page-sub,
    .wallet-ai-stat-label {
      max-width: 280px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .wallet-sheet-title {
      margin-bottom: var(--spacing-md);
      color: var(--text-primary);
      font-size: 20px;
      font-weight: 600;
      line-height: 1.35;
      letter-spacing: -0.01em;
    }

    .wallet-field {
      margin-bottom: var(--spacing-md);
    }

    .wallet-field-label {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: var(--spacing-sm);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 500;
      line-height: 1.4;
    }

    .wallet-field-label svg {
      width: 15px;
      height: 15px;
      color: var(--accent);
    }

    .wallet-input,
    .wallet-textarea {
      width: 100%;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: 16px;
    }

    .wallet-input {
      min-height: 48px;
      padding: 10px var(--spacing-md);
    }

    .wallet-textarea {
      min-height: 92px;
      padding: 12px var(--spacing-md);
      line-height: 1.6;
      resize: none;
    }

    .wallet-input::placeholder,
    .wallet-textarea::placeholder {
      color: var(--text-hint);
    }

    .wallet-sheet-actions {
      display: flex;
      gap: var(--spacing-sm);
      margin-top: var(--spacing-lg);
      flex-wrap: wrap;
    }

    .wallet-sheet-actions button {
      flex: 1;
    }

    .wallet-custom-section {
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      margin-bottom: var(--spacing-md);
    }

    .wallet-custom-sub {
      margin-top: 4px;
    }

    .wallet-custom-actions {
      display: flex;
      gap: var(--spacing-sm);
      flex-wrap: wrap;
      margin-top: var(--spacing-md);
    }

    .wallet-mini-btn {
      min-height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 12px;
      border-radius: 14px;
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: var(--font-size-small);
      font-weight: 600;
      transition: all 200ms ease;
    }

    .wallet-mini-btn.primary {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .wallet-mini-btn.danger {
      color: var(--accent-dark);
    }

    .wallet-ai-row {
      width: 100%;
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: 12px;
      border-radius: 18px;
      text-align: left;
      transition: all 200ms ease;
    }

    .wallet-ai-avatar {
      width: 46px;
      height: 46px;
      flex: 0 0 46px;
      border-radius: 17px;
    }

    .wallet-ai-main {
      flex: 1;
      min-width: 0;
    }

    .wallet-ai-name {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wallet-ai-balance {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.5;
    }

    .wallet-ai-page {
      position: fixed;
      inset: 0;
      z-index: 140;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .wallet-ai-page-body {
      flex: 1;
      overflow-x: hidden;
      overflow-y: auto;
      padding: calc(58px + env(safe-area-inset-top) + 18px) 20px calc(92px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling: touch;
    }

    .wallet-ai-page-card {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-md);
      border-radius: 28px;
      margin-bottom: var(--spacing-md);
    }

    .wallet-ai-page-avatar {
      width: 68px;
      height: 68px;
      flex: 0 0 68px;
      border-radius: 24px;
    }

    .wallet-ai-page-balance {
      margin-top: 8px;
      color: var(--accent-dark);
      font-size: 30px;
      font-weight: 600;
      line-height: 1.1;
      letter-spacing: -0.03em;
    }

    .wallet-ai-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-md);
    }

    .wallet-ai-stat {
      padding: 14px;
      border-radius: 20px;
    }

    .wallet-ai-stat-value {
      margin-top: 4px;
      color: var(--text-primary);
      font-size: 20px;
      font-weight: 600;
      line-height: 1.2;
    }
  `;

  document.head.appendChild(style);
}

function createDefaultWallet() {
  return {
    balance: 0,
    transactions: []
  };
}

function normalizeAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function normalizeTransaction(item = {}) {
  const rawType = item.type || '';
  const type = rawType === 'expense' ? 'expense' : 'income';
  const category = item.category || (type === 'expense' ? 'expense' : 'income');
  const timestamp = item.timestamp || item.createdAt || getNow();
  const title = item.title || item.description || item.itemName || (type === 'income' ? '收入' : '支出');
  const itemPrice = Number(item.itemPrice ?? item.price) || 0;

  return {
    id: item.id || generateId(),
    amount: normalizeAmount(item.amount ?? itemPrice),
    description: item.description || title,
    title,
    note: item.note || item.message || '',
    timestamp,
    createdAt: item.createdAt || timestamp,
    type,
    category,
    source: item.source || category,
    ownerType: item.ownerType || 'user',
    direction: item.direction || '',
    characterId: item.characterId || '',
    characterName: item.characterName || '',
    itemId: item.itemId || '',
    itemName: item.itemName || '',
    itemDesc: item.itemDesc || item.itemDescription || '',
    itemPrice,
    itemImage: item.itemImage || item.imageBase64 || '',
    messageId: item.messageId || '',
    raw: item.raw || null
  };
}

function normalizeWallet(data) {
  const source = data && typeof data === 'object' ? data : {};
  const balance = Number(source.balance);

  return {
    balance: Number.isFinite(balance) ? Math.max(0, normalizeAmount(balance)) : 0,
    transactions: Array.isArray(source.transactions)
      ? source.transactions
          .filter((item) => item && typeof item === 'object')
          .map(normalizeTransaction)
          .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
      : []
  };
}

function readWallet() {
  return normalizeWallet(getData(WALLET_KEY) || createDefaultWallet());
}

function saveWallet(wallet) {
  return setData(WALLET_KEY, normalizeWallet(wallet));
}

function readProfile() {
  const data = getData(PROFILE_KEY, {});
  return {
    name: data?.name || '我的小金库',
    note: data?.note || '每一笔小钱都会乖乖记下来，礼物和转账也会留下痕迹。',
    updatedAt: data?.updatedAt || ''
  };
}

function saveProfile(profile) {
  setData(PROFILE_KEY, {
    name: profile.name || '我的小金库',
    note: profile.note || '',
    updatedAt: getNow()
  });
}

function formatMoney(amount) {
  const value = normalizeAmount(amount);
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  });
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '刚刚';

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function getBalanceMood(balance) {
  const value = Number(balance) || 0;
  if (value <= 0) return '小金库空空的，等一点点小钱住进来 ᗜ ‸ ᗜ';
  if (value < 100) return '小金库有点瘦瘦的，先轻轻养一养 OvO';
  if (value < 1000) return '今天也有一点点安全感 ⌯\'ᵕ\'⌯';
  return '小金库被照顾得很好 ˶>ᗜ<˶';
}

function getTransactionIconName(record) {
  if (record.category === 'gift') return 'heart';
  if (record.category === 'transfer') return record.type === 'income' ? 'download' : 'upload';
  if (record.type === 'income') return 'download';
  return 'upload';
}

function getFilterLabel(filter) {
  const labels = {
    all: '全部',
    income: '收入',
    expense: '支出',
    transfer: '转账',
    gift: '礼物'
  };

  return labels[filter] || '全部';
}

function filterTransactions(transactions, filter) {
  if (filter === 'all') return transactions;
  if (filter === 'income') return transactions.filter((item) => item.type === 'income');
  if (filter === 'expense') return transactions.filter((item) => item.type === 'expense');
  return transactions.filter((item) => item.category === filter);
}

function addTransaction(wallet, amount, description, type, extra = {}) {
  const timestamp = extra.timestamp || getNow();
  const title = extra.title || description || (type === 'income' ? '收入' : '支出');
  const category = extra.category || (type === 'income' ? 'income' : 'expense');

  const transaction = normalizeTransaction({
    id: extra.id || generateId(),
    amount: normalizeAmount(amount),
    description: description || title,
    title,
    note: extra.note || '',
    timestamp,
    createdAt: extra.createdAt || timestamp,
    type,
    category,
    source: extra.source || category,
    ownerType: extra.ownerType || 'user',
    direction: extra.direction || '',
    characterId: extra.characterId || '',
    characterName: extra.characterName || '',
    itemId: extra.itemId || '',
    itemName: extra.itemName || '',
    itemDesc: extra.itemDesc || extra.itemDescription || '',
    itemPrice: Number(extra.itemPrice ?? extra.price) || 0,
    itemImage: extra.itemImage || extra.imageBase64 || '',
    messageId: extra.messageId || ''
  });

  return {
    balance: wallet.balance,
    transactions: [transaction, ...wallet.transactions].slice(0, 300)
  };
}

function createAiWallet(characterId = '', characterName = '') {
  const timestamp = getNow();

  return {
    balance: AI_INITIAL_BALANCE,
    transactions: [{
      id: generateId(),
      amount: AI_INITIAL_BALANCE,
      description: '初始小金库',
      title: '初始小金库',
      note: '给TA一点启动资金。',
      timestamp,
      createdAt: timestamp,
      type: 'income',
      category: 'income',
      source: 'system',
      ownerType: 'character',
      direction: '',
      characterId,
      characterName,
      itemId: '',
      itemName: '',
      itemDesc: '',
      itemPrice: 0,
      itemImage: '',
      messageId: ''
    }]
  };
}

function normalizeAiWalletRecord(characterId, wallet, characterName = '') {
  const normalized = normalizeWallet(wallet || createAiWallet(characterId, characterName));

  normalized.transactions = normalized.transactions.map((item) => ({
    ...item,
    ownerType: 'character',
    characterId: item.characterId || characterId,
    characterName: item.characterName || characterName || ''
  }));

  return normalized;
}

export function getBalance() {
  return readWallet().balance;
}

export function addBalance(amount, description = '充值', extra = {}) {
  const value = normalizeAmount(amount);
  if (value <= 0) return false;

  const wallet = readWallet();
  wallet.balance = normalizeAmount(wallet.balance + value);

  const nextWallet = addTransaction(wallet, value, description, 'income', {
    ...extra,
    category: extra.category || 'income',
    title: extra.title || description,
    source: extra.source || 'wallet',
    ownerType: 'user'
  });
  nextWallet.balance = wallet.balance;

  saveWallet(nextWallet);
  window.AppBus?.emit('wallet:balance-updated', { balance: nextWallet.balance, type: 'income', amount: value, description });
  return true;
}

export function deductBalance(amount, description = '消费', extra = {}) {
  const value = normalizeAmount(amount);
  if (value <= 0) return false;

  const wallet = readWallet();
  if (wallet.balance < value) return false;

  wallet.balance = normalizeAmount(wallet.balance - value);

  const nextWallet = addTransaction(wallet, value, description, 'expense', {
    ...extra,
    category: extra.category || 'expense',
    title: extra.title || description,
    source: extra.source || 'wallet',
    ownerType: 'user'
  });
  nextWallet.balance = wallet.balance;

  saveWallet(nextWallet);
  window.AppBus?.emit('wallet:balance-updated', { balance: nextWallet.balance, type: 'expense', amount: value, description });
  return true;
}

export function getAiWallets() {
  const wallets = getData(AI_WALLETS_KEY, {});
  return wallets && typeof wallets === 'object' ? wallets : {};
}

function saveAiWallets(wallets) {
  setData(AI_WALLETS_KEY, wallets && typeof wallets === 'object' ? wallets : {});
}

export function getAiWallet(characterId) {
  if (!characterId) return createAiWallet();

  const wallets = getAiWallets();
  const character = allCharacters.find((item) => item.id === characterId);
  const wallet = normalizeAiWalletRecord(
    characterId,
    wallets[characterId] || createAiWallet(characterId, character?.name || ''),
    character?.name || ''
  );

  wallets[characterId] = wallet;
  saveAiWallets(wallets);

  return wallet;
}

export function setAiWalletBalance(characterId, amount, description = '余额调整') {
  if (!characterId) return false;

  const value = Math.max(0, normalizeAmount(amount));
  const wallets = getAiWallets();
  const character = allCharacters.find((item) => item.id === characterId);
  const current = normalizeAiWalletRecord(
    characterId,
    wallets[characterId] || createAiWallet(characterId, character?.name || ''),
    character?.name || ''
  );

  const diff = normalizeAmount(value - current.balance);
  current.balance = value;

  if (diff !== 0) {
    const nextWallet = addTransaction(
      current,
      Math.abs(diff),
      description,
      diff > 0 ? 'income' : 'expense',
      {
        category: diff > 0 ? 'income' : 'expense',
        title: description,
        source: 'wallet',
        ownerType: 'character',
        characterId,
        characterName: character?.name || ''
      }
    );
    nextWallet.balance = current.balance;
    wallets[characterId] = nextWallet;
  } else {
    wallets[characterId] = current;
  }

  saveAiWallets(wallets);
  return true;
}

export function addAiBalance(characterId, amount, description = '收入', extra = {}) {
  if (!characterId) return false;

  const value = normalizeAmount(amount);
  if (value <= 0) return false;

  const wallets = getAiWallets();
  const wallet = normalizeAiWalletRecord(
    characterId,
    wallets[characterId] || createAiWallet(characterId, extra.characterName || ''),
    extra.characterName || ''
  );

  wallet.balance = normalizeAmount(wallet.balance + value);

  const nextWallet = addTransaction(wallet, value, description, 'income', {
    ...extra,
    title: extra.title || description,
    source: extra.source || 'wallet',
    ownerType: 'character',
    characterId: extra.characterId || characterId,
    characterName: extra.characterName || wallet.transactions[0]?.characterName || ''
  });
  nextWallet.balance = wallet.balance;
  wallets[characterId] = nextWallet;

  saveAiWallets(wallets);
  return true;
}

export function deductAiBalance(characterId, amount, description = '支出', extra = {}) {
  if (!characterId) return false;

  const value = normalizeAmount(amount);
  if (value <= 0) return false;

  const wallets = getAiWallets();
  const wallet = normalizeAiWalletRecord(
    characterId,
    wallets[characterId] || createAiWallet(characterId, extra.characterName || ''),
    extra.characterName || ''
  );

  if (wallet.balance < value) return false;

  wallet.balance = normalizeAmount(wallet.balance - value);

  const nextWallet = addTransaction(wallet, value, description, 'expense', {
    ...extra,
    title: extra.title || description,
    source: extra.source || 'wallet',
    ownerType: 'character',
    characterId: extra.characterId || characterId,
    characterName: extra.characterName || wallet.transactions[0]?.characterName || ''
  });
  nextWallet.balance = wallet.balance;
  wallets[characterId] = nextWallet;

  saveAiWallets(wallets);
  return true;
}

function createTransferCard({ direction, amount, note = '', characterId = '', characterName = 'TA', timestamp = getNow() } = {}) {
  const value = normalizeAmount(amount);
  const isUserToAi = direction === 'user_to_ai';

  return {
    type: 'transfer',
    cardType: 'transfer',
    direction: isUserToAi ? 'user_to_ai' : 'ai_to_user',
    amount: value,
    transferAmount: value,
    note: note || '',
    characterId: characterId || '',
    characterName: characterName || 'TA',
    title: isUserToAi ? `转给${characterName || 'TA'}` : `${characterName || 'TA'}转给我`,
    description: note || (isUserToAi ? '一笔给TA的小转账' : 'TA转来的一点小钱'),
    timestamp
  };
}

export async function transferToAI({ characterId, characterName = 'TA', amount, note = '' } = {}) {
  const value = normalizeAmount(amount);
  if (!characterId || value <= 0) return { ok: false, reason: 'invalid' };

  const timestamp = getNow();
  const wallet = readWallet();
  if (wallet.balance < value) return { ok: false, reason: 'no_balance' };

  const cleanNote = String(note || '').trim();
  const card = createTransferCard({
    direction: 'user_to_ai',
    amount: value,
    note: cleanNote,
    characterId,
    characterName,
    timestamp
  });

  wallet.balance = normalizeAmount(wallet.balance - value);
  const nextWallet = addTransaction(
    wallet,
    value,
    card.title,
    'expense',
    {
      category: 'transfer',
      title: card.title,
      note: cleanNote,
      source: 'wallet_transfer',
      ownerType: 'user',
      direction: 'user_to_ai',
      characterId,
      characterName,
      timestamp
    }
  );
  nextWallet.balance = wallet.balance;
  saveWallet(nextWallet);

  addAiBalance(characterId, value, `收到用户转账${cleanNote ? `：${cleanNote}` : ''}`, {
    category: 'transfer',
    title: '收到用户转账',
    note: cleanNote,
    source: 'wallet_transfer',
    ownerType: 'character',
    direction: 'user_to_ai',
    characterId,
    characterName,
    timestamp
  });

  await recordWalletMemory({
    characterId,
    role: 'user',
    source: '钱包转账',
    content: `用户转给我 ¥${formatMoney(value)}${cleanNote ? `，备注是：${cleanNote}` : ''}。`
  });

  window.dispatchEvent(new CustomEvent('wallet-transfer-created', {
    detail: { ...card }
  }));

  // 统一事件总线：wallet:transfer，payload 含 characterId/direction/amount/note/characterName
  try {
    window.AppBus?.emit('wallet:transfer', { ...card });
  } catch (_) {}

  return { ok: true, amount: value, card };
}

export async function aiTransferToUser({ characterId, characterName = 'TA', amount, note = '' } = {}) {
  const value = normalizeAmount(amount);
  if (!characterId || value <= 0) return { ok: false, reason: 'invalid' };

  const timestamp = getNow();
  const cleanNote = String(note || '').trim();
  const card = createTransferCard({
    direction: 'ai_to_user',
    amount: value,
    note: cleanNote,
    characterId,
    characterName,
    timestamp
  });

  const paid = deductAiBalance(characterId, value, `转给用户${cleanNote ? `：${cleanNote}` : ''}`, {
    category: 'transfer',
    title: '转给用户',
    note: cleanNote,
    source: 'wallet_transfer',
    ownerType: 'character',
    direction: 'ai_to_user',
    characterId,
    characterName,
    timestamp
  });

  if (!paid) return { ok: false, reason: 'no_ai_balance' };

  const wallet = readWallet();
  wallet.balance = normalizeAmount(wallet.balance + value);

  const nextWallet = addTransaction(
    wallet,
    value,
    card.title,
    'income',
    {
      category: 'transfer',
      title: card.title,
      note: cleanNote,
      source: 'wallet_transfer',
      ownerType: 'user',
      direction: 'ai_to_user',
      characterId,
      characterName,
      timestamp
    }
  );
  nextWallet.balance = wallet.balance;
  saveWallet(nextWallet);

  await recordWalletMemory({
    characterId,
    role: 'assistant',
    source: '钱包转账',
    content: `我转给用户 ¥${formatMoney(value)}${cleanNote ? `，备注是：${cleanNote}` : ''}。`
  });

  window.dispatchEvent(new CustomEvent('wallet-transfer-created', {
    detail: { ...card }
  }));

  // 统一事件总线：wallet:transfer，payload 含 characterId/direction/amount/note/characterName
  try {
    window.AppBus?.emit('wallet:transfer', { ...card });
  } catch (_) {}

  return { ok: true, amount: value, card };
}

async function loadWalletVisuals() {
  const iconRecord = await getDB('blobs', ICON_KEY).catch(() => null);
  const cardRecord = await getDB('blobs', CARD_BG_KEY).catch(() => null);
  walletIconCache = getImageFromRecord(iconRecord);
  walletCardBgCache = getImageFromRecord(cardRecord);
}

export async function mount(containerEl) {
  injectStyles();
  container = containerEl;
  currentFilter = 'all';
  currentAiFilter = 'all';
  currentAiPage = null;
  allCharacters = await getAllDB('characters');

  // 角色在别处被编辑时，刷新缓存并重渲染，避免打开期间角色数据陈旧
  if (window.AppBus && !unsubscribeCharsUpdated) {
    unsubscribeCharsUpdated = window.AppBus.on('characters:updated', async () => {
      if (!container) return;
      allCharacters = await getAllDB('characters');
      renderWallet();
    });
  }

  const screen = document.createElement('section');
  screen.className = 'wallet-screen';
  screen.dataset.imageKey = BG_KEY;

  const softLayer = document.createElement('div');
  softLayer.className = 'wallet-soft-layer';

  const nav = document.createElement('div');
  nav.className = 'wallet-nav';

  const backButton = document.createElement('button');
  backButton.className = 'icon-button';
  backButton.type = 'button';
  backButton.setAttribute('aria-label', '返回');
  backButton.appendChild(createIcon('back', 22));
  backButton.addEventListener('click', () => window.closeCurrentApp?.());

  const title = document.createElement('div');
  title.className = 'wallet-nav-title';
  title.textContent = '钱包';

  const customButton = document.createElement('button');
  customButton.className = 'icon-button soft';
  customButton.type = 'button';
  customButton.setAttribute('aria-label', '装扮');
  customButton.appendChild(createIcon('edit', 22));
  customButton.addEventListener('click', openCustomizeSheet);

  const clearButton = document.createElement('button');
  clearButton.className = 'icon-button soft';
  clearButton.type = 'button';
  clearButton.setAttribute('aria-label', '清空记录');
  clearButton.appendChild(createIcon('clear', 22));
  clearButton.addEventListener('click', clearTransactions);

  const body = document.createElement('div');
  body.className = 'wallet-body';

  nav.append(backButton, title, customButton, clearButton);
  screen.append(softLayer, nav, body);

  container.innerHTML = '';
  container.appendChild(screen);

  await applyWalletBackground(screen);
  await loadWalletVisuals();
  renderWallet();
}

export function unmount() {
  walletIconCache = '';
  walletCardBgCache = '';
  currentAiPage = null;
  allCharacters = [];

  if (unsubscribeCharsUpdated) {
    try { unsubscribeCharsUpdated(); } catch (_) {}
    unsubscribeCharsUpdated = null;
  }

  if (container) {
    container.innerHTML = '';
    container = null;
  }
}

async function applyWalletBackground(screen) {
  try {
    const record = await getDB('blobs', BG_KEY);
    const value = getImageFromRecord(record);

    if (!value) {
      screen.classList.remove('has-bg');
      screen.style.backgroundImage = '';
      return;
    }

    screen.classList.add('has-bg');
    screen.style.backgroundImage = `url("${cssUrl(value)}")`;
  } catch (_) {
    screen.classList.remove('has-bg');
    screen.style.backgroundImage = '';
  }
}

function renderWallet() {
  const body = container?.querySelector('.wallet-body');
  if (!body) return;

  const wallet = readWallet();
  const profile = readProfile();

  body.innerHTML = '';
  body.append(
    createBalanceCard(wallet, profile),
    createMainActions(),
    createAiWalletSection(),
    createUserRecordsSection(wallet)
  );
}

function createBalanceCard(wallet, profile) {
  const balanceCard = document.createElement('section');
  balanceCard.className = `wallet-balance-card ${walletCardBgCache ? 'has-card-bg' : ''}`;
  if (walletCardBgCache) balanceCard.style.backgroundImage = `url("${cssUrl(walletCardBgCache)}")`;

  const layer = document.createElement('div');
  layer.className = 'wallet-card-layer';

  const content = document.createElement('div');
  content.className = 'wallet-card-content';

  const label = document.createElement('div');
  label.className = 'wallet-balance-label';

  const labelText = document.createElement('span');
  labelText.textContent = profile.name;

  const mark = document.createElement('div');
  mark.className = 'wallet-mark';

  if (walletIconCache) {
    const img = document.createElement('img');
    img.src = walletIconCache;
    img.alt = '';
    mark.appendChild(img);
  } else {
    mark.appendChild(createIcon('transfer', 22));
  }

  label.append(labelText, mark);

  const number = document.createElement('div');
  number.className = 'wallet-balance-number';
  number.innerHTML = `<span>¥</span> ${formatMoney(wallet.balance)}`;

  const note = document.createElement('div');
  note.className = 'wallet-balance-note';
  note.textContent = profile.note;

  const mood = document.createElement('div');
  mood.className = 'wallet-balance-mood';
  mood.textContent = getBalanceMood(wallet.balance);

  content.append(label, number, note, mood);
  balanceCard.append(layer, content);
  return balanceCard;
}

function createMainActions() {
  const actions = document.createElement('div');
  actions.className = 'wallet-actions';

  actions.append(
    createActionButton('充值', 'add', true, openRechargeSheet),
    createActionButton('转给TA', 'upload', false, openTransferToAiSheet),
    createActionButton('AI 小金库', 'heart', false, openAiWalletSheet),
    createActionButton('装扮', 'edit', false, openCustomizeSheet)
  );

  return actions;
}

function createActionButton(text, icon, primary, onClick) {
  const button = document.createElement('button');
  button.className = `wallet-action ${primary ? 'primary' : ''}`;
  button.type = 'button';
  button.append(createIcon(icon, 18), document.createTextNode(text));
  button.addEventListener('click', onClick);
  return button;
}

function createAiWalletSection() {
  const section = document.createElement('section');
  section.className = 'wallet-section';

  const head = document.createElement('div');
  head.className = 'wallet-section-head';

  const title = document.createElement('div');
  title.className = 'wallet-section-title';
  title.textContent = 'AI 小金库';

  const button = document.createElement('button');
  button.className = 'wallet-mini-btn';
  button.type = 'button';
  button.append(createIcon('heart', 14), document.createTextNode('查看全部'));
  button.addEventListener('click', openAiWalletSheet);

  head.append(title, button);
  section.appendChild(head);

  const list = document.createElement('div');
  list.className = 'wallet-ai-list';

  if (!allCharacters.length) {
    list.appendChild(createEmptyState('还没有 AI 角色', '创建角色后，每个TA都会有自己的小金库。'));
  } else {
    allCharacters.slice(0, 4).forEach((character) => {
      list.appendChild(createAiWalletRow(character));
    });
  }

  section.appendChild(list);
  return section;
}

function createUserRecordsSection(wallet) {
  const section = document.createElement('section');
  section.className = 'wallet-section';

  const head = document.createElement('div');
  head.className = 'wallet-section-head';

  const title = document.createElement('div');
  title.className = 'wallet-section-title';
  title.textContent = '我的流水';

  const filterBtn = document.createElement('button');
  filterBtn.className = 'wallet-mini-btn';
  filterBtn.type = 'button';
  filterBtn.append(createIcon('settings', 14), document.createTextNode(getFilterLabel(currentFilter)));
  filterBtn.addEventListener('click', () => {
    const panel = section.querySelector('.wallet-filter-panel');
    panel?.classList.toggle('open');
  });

  head.append(title, filterBtn);
  section.append(head, createFilterPanel(currentFilter, (key) => {
    currentFilter = key;
    renderWallet();
  }));

  const filtered = filterTransactions(wallet.transactions, currentFilter);

  if (filtered.length) {
    const list = document.createElement('div');
    list.className = 'wallet-list';

    filtered.slice(0, 80).forEach((record) => {
      list.appendChild(createRecord(record));
    });

    section.appendChild(list);
  } else {
    section.appendChild(createEmptyState('这里还很安静', '充值、购物、转账后，小账本会乖乖记下来。'));
  }

  return section;
}

function createFilterPanel(active, onSelect) {
  const panel = document.createElement('div');
  panel.className = 'wallet-filter-panel';

  [
    ['all', '全部'],
    ['income', '收入'],
    ['expense', '支出'],
    ['transfer', '转账'],
    ['gift', '礼物']
  ].forEach(([key, label]) => {
    const button = document.createElement('button');
    button.className = `wallet-filter-btn ${active === key ? 'active' : ''}`;
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => onSelect(key));
    panel.appendChild(button);
  });

  return panel;
}

function createRecord(record, character = null) {
  const item = document.createElement('article');
  item.className = `wallet-record ${record.type}`;

  const icon = document.createElement('div');

  if (record.itemImage && record.category === 'gift') {
    icon.className = 'wallet-gift-thumb';
    const img = document.createElement('img');
    img.src = record.itemImage;
    img.alt = '';
    icon.appendChild(img);
  } else if (character?.avatar) {
    icon.className = 'wallet-record-avatar';
    const img = document.createElement('img');
    img.src = character.avatar;
    img.alt = '';
    icon.appendChild(img);
  } else {
    icon.className = 'wallet-record-icon';
    icon.appendChild(createIcon(getTransactionIconName(record), 18));
  }

  const main = document.createElement('div');
  main.className = 'wallet-record-main';

  const title = document.createElement('div');
  title.className = 'wallet-record-title';
  title.textContent = getRecordTitle(record);

  const time = document.createElement('div');
  time.className = 'wallet-record-time';
  time.textContent = getRecordSubText(record);

  main.append(title, time);

  const amount = document.createElement('div');
  amount.className = 'wallet-record-amount';
  amount.textContent = `${record.type === 'income' ? '+' : '-'}¥${formatMoney(record.amount)}`;

  item.append(icon, main, amount);

  // 转账记录且绑定角色：加"去聊聊"按钮，跳转到 chat 该角色会话
  if (record.category === 'transfer' && record.characterId) {
    const chatBtn = document.createElement('button');
    chatBtn.className = 'wallet-mini-btn';
    chatBtn.type = 'button';
    chatBtn.style.minHeight = '30px';
    chatBtn.style.padding = '4px 10px';
    chatBtn.style.flex = '0 0 auto';
    chatBtn.style.fontSize = '12px';
    chatBtn.textContent = '去聊聊';
    chatBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      try {
        window.AppBus?.openApp('chat', {
          route: { name: 'thread', params: { mode: 'private', characterId: record.characterId, groupId: '' } }
        });
      } catch (_) {}
    });
    item.appendChild(chatBtn);
  }

  return item;
}

function getRecordTitle(record) {
  if (record.category === 'gift' && record.itemName) {
    if (record.ownerType === 'user') {
      if (record.direction === 'user_to_ai') return `送给${record.characterName || 'TA'}：${record.itemName}`;
      if (record.direction === 'ai_to_user') return `收到${record.characterName || 'TA'}的礼物：${record.itemName}`;
    }

    if (record.ownerType === 'character') {
      if (record.direction === 'user_to_ai') return `收到用户礼物：${record.itemName}`;
      if (record.direction === 'ai_to_user') return `送给用户：${record.itemName}`;
    }

    return record.itemName;
  }

  return record.title || record.description || (record.type === 'income' ? '收入' : '支出');
}

function getRecordSubText(record) {
  const parts = [formatTime(record.timestamp)];

  if (record.characterName) parts.push(record.characterName);
  if (record.category && record.category !== record.type) parts.push(getFilterLabel(record.category));
  if (record.note) parts.push(record.note);
  if (record.itemDesc && !record.note) parts.push(record.itemDesc);

  return parts.filter(Boolean).join(' · ');
}

function createEmptyState(titleText, textContent) {
  const empty = document.createElement('div');
  empty.className = 'wallet-empty';

  const icon = document.createElement('div');
  icon.className = 'wallet-empty-icon';
  icon.appendChild(createIcon('transfer', 26));

  const title = document.createElement('div');
  title.className = 'wallet-empty-title';
  title.textContent = titleText;

  const text = document.createElement('div');
  text.className = 'wallet-empty-text';
  text.textContent = textContent;

  empty.append(icon, title, text);
  return empty;
}

function createAiWalletRow(character) {
  const wallet = getAiWallet(character.id);

  const row = document.createElement('button');
  row.className = 'wallet-ai-row';
  row.type = 'button';

  const avatar = document.createElement('div');
  avatar.className = 'wallet-ai-avatar';

  if (character.avatar) {
    const img = document.createElement('img');
    img.src = character.avatar;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.appendChild(createIcon('heart', 20));
  }

  const main = document.createElement('div');
  main.className = 'wallet-ai-main';

  const name = document.createElement('div');
  name.className = 'wallet-ai-name';
  name.textContent = character.name || '未命名';

  const balance = document.createElement('div');
  balance.className = 'wallet-ai-balance';
  balance.textContent = `余额 ¥${formatMoney(wallet.balance)} · ${wallet.transactions.length} 条流水`;

  main.append(name, balance);

  const arrow = document.createElement('span');
  arrow.className = 'wallet-mini-btn';
  arrow.append(createIcon('next', 14));

  row.append(avatar, main, arrow);
  row.addEventListener('click', () => {
    hideBottomSheet();
    window.setTimeout(() => openAiWalletPage(character), 120);
  });

  return row;
}

function openAiWalletPage(character) {
  closeAiWalletPage();
  currentAiFilter = 'all';
  currentAiPage = document.createElement('section');
  currentAiPage.className = 'wallet-ai-page';

  const nav = document.createElement('div');
  nav.className = 'wallet-nav';

  const back = document.createElement('button');
  back.className = 'icon-button';
  back.type = 'button';
  back.appendChild(createIcon('back', 22));
  back.addEventListener('click', closeAiWalletPage);

  const title = document.createElement('div');
  title.className = 'wallet-nav-title';
  title.textContent = `${character.name || 'TA'} 的小金库`;

  const adjust = document.createElement('button');
  adjust.className = 'icon-button soft';
  adjust.type = 'button';
  adjust.appendChild(createIcon('edit', 22));
  adjust.addEventListener('click', () => openAiBalanceEditor(character));

  const transfer = document.createElement('button');
  transfer.className = 'icon-button soft';
  transfer.type = 'button';
  transfer.appendChild(createIcon('download', 22));
  transfer.addEventListener('click', () => openAiTransferToUserSheet(character));

  const body = document.createElement('div');
  body.className = 'wallet-ai-page-body';

  nav.append(back, title, adjust, transfer);
  currentAiPage.append(nav, body);
  container?.querySelector('.wallet-screen')?.appendChild(currentAiPage);

  renderAiWalletPage(character);
}

function renderAiWalletPage(character) {
  const body = currentAiPage?.querySelector('.wallet-ai-page-body');
  if (!body) return;

  const wallet = getAiWallet(character.id);
  const incomeTotal = wallet.transactions
    .filter((item) => item.type === 'income')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenseTotal = wallet.transactions
    .filter((item) => item.type === 'expense')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  body.innerHTML = '';

  const card = document.createElement('section');
  card.className = 'wallet-ai-page-card';

  const avatar = document.createElement('div');
  avatar.className = 'wallet-ai-page-avatar';

  if (character.avatar) {
    const img = document.createElement('img');
    img.src = character.avatar;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.appendChild(createIcon('heart', 28));
  }

  const main = document.createElement('div');
  main.className = 'wallet-ai-main';

  const name = document.createElement('div');
  name.className = 'wallet-ai-page-name';
  name.textContent = character.name || '未命名';

  const sub = document.createElement('div');
  sub.className = 'wallet-ai-page-sub';
  sub.textContent = 'TA 买过什么、收到什么、转过什么，都会在这里慢慢留下。';

  const balance = document.createElement('div');
  balance.className = 'wallet-ai-page-balance';
  balance.textContent = `¥${formatMoney(wallet.balance)}`;

  main.append(name, sub, balance);
  card.append(avatar, main);

  const stats = document.createElement('div');
  stats.className = 'wallet-ai-stats';
  stats.append(
    createAiStat('收入合计', `¥${formatMoney(incomeTotal)}`),
    createAiStat('支出合计', `¥${formatMoney(expenseTotal)}`)
  );

  const section = document.createElement('section');
  section.className = 'wallet-section';

  const head = document.createElement('div');
  head.className = 'wallet-section-head';

  const sectionTitle = document.createElement('div');
  sectionTitle.className = 'wallet-section-title';
  sectionTitle.textContent = 'TA 的流水';

  const filterBtn = document.createElement('button');
  filterBtn.className = 'wallet-mini-btn';
  filterBtn.type = 'button';
  filterBtn.append(createIcon('settings', 14), document.createTextNode(getFilterLabel(currentAiFilter)));
  filterBtn.addEventListener('click', () => {
    section.querySelector('.wallet-filter-panel')?.classList.toggle('open');
  });

  head.append(sectionTitle, filterBtn);
  section.append(head, createFilterPanel(currentAiFilter, (key) => {
    currentAiFilter = key;
    renderAiWalletPage(character);
  }));

  const filtered = filterTransactions(wallet.transactions, currentAiFilter);

  if (filtered.length) {
    const list = document.createElement('div');
    list.className = 'wallet-list';

    filtered.forEach((record) => {
      list.appendChild(createRecord(record, character));
    });

    section.appendChild(list);
  } else {
    section.appendChild(createEmptyState('TA 这里还没有记录', '收到转账、买礼物、送礼物后就会出现啦。'));
  }

  body.append(card, stats, createAiPageActions(character), section);
}

function createAiStat(label, value) {
  const stat = document.createElement('div');
  stat.className = 'wallet-ai-stat';

  const labelEl = document.createElement('div');
  labelEl.className = 'wallet-ai-stat-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('div');
  valueEl.className = 'wallet-ai-stat-value';
  valueEl.textContent = value;

  stat.append(labelEl, valueEl);
  return stat;
}

function createAiPageActions(character) {
  const actions = document.createElement('div');
  actions.className = 'wallet-actions';

  actions.append(
    createActionButton('TA转给我', 'download', true, () => openAiTransferToUserSheet(character)),
    createActionButton('调余额', 'edit', false, () => openAiBalanceEditor(character))
  );

  return actions;
}

function closeAiWalletPage() {
  currentAiPage?.remove();
  currentAiPage = null;
}

function openRechargeSheet() {
  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'wallet-sheet-title';
  title.textContent = '给小金库加一点余额';

  const amountField = createInputField('金额', '输入充值金额，例如 100', 'number');
  const descField = createInputField('备注', '默认写作充值', 'text');

  const actions = document.createElement('div');
  actions.className = 'wallet-sheet-actions';

  const cancelButton = document.createElement('button');
  cancelButton.className = 'btn-ghost';
  cancelButton.type = 'button';
  cancelButton.textContent = '先不加';
  cancelButton.addEventListener('click', hideBottomSheet);

  const confirmButton = document.createElement('button');
  confirmButton.className = 'btn-primary';
  confirmButton.type = 'button';
  confirmButton.textContent = '放进去';
  confirmButton.addEventListener('click', () => {
    const amount = normalizeAmount(amountField.querySelector('input').value);
    const desc = descField.querySelector('input').value.trim() || '充值';

    if (amount <= 0) {
      showToast('金额要认真填一下 ๑ᵒᯅᵒ๑');
      return;
    }

    addBalance(amount, desc);
    hideBottomSheet();
    showToast('小金库变鼓一点啦 OvO');
    renderWallet();
  });

  actions.append(cancelButton, confirmButton);
  sheet.append(title, amountField, descField, actions);
  showBottomSheet(sheet);
}

async function openTransferToAiSheet() {
  allCharacters = await getAllDB('characters');

  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'wallet-sheet-title';
  title.textContent = '转一点给TA';

  if (!allCharacters.length) {
    sheet.append(title, createEmptyState('还没有TA', '先去角色里创建一个TA，再来转小钱。'));
    showBottomSheet(sheet);
    return;
  }

  const listField = createSelectField('选择TA', allCharacters.map((character) => ({
    value: character.id,
    label: character.name || '未命名'
  })));

  const amountField = createInputField('金额', '比如 20', 'number');
  const noteField = createInputField('备注', '比如：买点喜欢的小东西', 'text');

  const actions = document.createElement('div');
  actions.className = 'wallet-sheet-actions';

  const cancel = document.createElement('button');
  cancel.className = 'btn-ghost';
  cancel.type = 'button';
  cancel.textContent = '先不转';
  cancel.addEventListener('click', hideBottomSheet);

  const confirm = document.createElement('button');
  confirm.className = 'btn-primary';
  confirm.type = 'button';
  confirm.textContent = '转给TA';
  confirm.addEventListener('click', async () => {
    const characterId = listField.querySelector('select').value;
    const character = allCharacters.find((item) => item.id === characterId);
    const amount = normalizeAmount(amountField.querySelector('input').value);
    const note = noteField.querySelector('input').value.trim();

    if (!character || amount <= 0) {
      showToast('金额和TA都要选好 ᗜ ‸ ᗜ');
      return;
    }

    const result = await transferToAI({
      characterId: character.id,
      characterName: character.name || 'TA',
      amount,
      note
    });

    if (!result.ok) {
      showToast(result.reason === 'no_balance' ? '余额不够啦 ˶╸▵╺˶' : '转账失败啦');
      return;
    }

    hideBottomSheet();
    showToast('已经转给TA啦 ˶>ᗜ<˶');
    renderWallet();
  });

  actions.append(cancel, confirm);
  sheet.append(title, listField, amountField, noteField, actions);
  showBottomSheet(sheet);
}

async function openAiWalletSheet() {
  allCharacters = await getAllDB('characters');

  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'wallet-sheet-title';
  title.textContent = 'AI 小金库';

  const list = document.createElement('div');
  list.className = 'wallet-ai-list';

  if (!allCharacters.length) {
    list.appendChild(createEmptyState('还没有 AI 角色', '创建角色后，这里会出现他们的小金库。'));
  } else {
    allCharacters.forEach((character) => {
      getAiWallet(character.id);
      list.appendChild(createAiWalletRow(character));
    });
  }

  sheet.append(title, list);
  showBottomSheet(sheet);
}

function openAiTransferToUserSheet(character) {
  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'wallet-sheet-title';
  title.textContent = `${character.name || 'TA'} 转给我`;

  const amountField = createInputField('金额', '比如 18', 'number');
  const noteField = createInputField('备注', '比如：请你喝奶茶', 'text');

  const actions = document.createElement('div');
  actions.className = 'wallet-sheet-actions';

  const cancel = document.createElement('button');
  cancel.className = 'btn-ghost';
  cancel.type = 'button';
  cancel.textContent = '取消';
  cancel.addEventListener('click', hideBottomSheet);

  const confirm = document.createElement('button');
  confirm.className = 'btn-primary';
  confirm.type = 'button';
  confirm.textContent = '确认';
  confirm.addEventListener('click', async () => {
    const amount = normalizeAmount(amountField.querySelector('input').value);
    const note = noteField.querySelector('input').value.trim();

    if (amount <= 0) {
      showToast('金额要认真填一下 ๑ᵒᯅᵒ๑');
      return;
    }

    const result = await aiTransferToUser({
      characterId: character.id,
      characterName: character.name || 'TA',
      amount,
      note
    });

    if (!result.ok) {
      showToast(result.reason === 'no_ai_balance' ? 'TA的小金库不够啦' : '转账失败啦');
      return;
    }

    hideBottomSheet();
    showToast('已经收到TA的小钱啦 ˶>ᗜ<˶');
    renderWallet();
    if (currentAiPage) renderAiWalletPage(character);
  });

  actions.append(cancel, confirm);
  sheet.append(title, amountField, noteField, actions);
  showBottomSheet(sheet);
}

function openAiBalanceEditor(character) {
  const wallet = getAiWallet(character.id);
  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'wallet-sheet-title';
  title.textContent = `${character.name || 'AI'} 的小金库`;

  const amountField = createInputField('设置余额', '输入新的余额', 'number');
  amountField.querySelector('input').value = String(wallet.balance);

  const descField = createInputField('备注', '比如：补贴零花钱', 'text');

  const actions = document.createElement('div');
  actions.className = 'wallet-sheet-actions';

  const cancel = document.createElement('button');
  cancel.className = 'btn-ghost';
  cancel.type = 'button';
  cancel.textContent = '取消';
  cancel.addEventListener('click', hideBottomSheet);

  const save = document.createElement('button');
  save.className = 'btn-primary';
  save.type = 'button';
  save.textContent = '保存';
  save.addEventListener('click', () => {
    const amount = Math.max(0, normalizeAmount(amountField.querySelector('input').value));
    const desc = descField.querySelector('input').value.trim() || '余额调整';

    setAiWalletBalance(character.id, amount, desc);
    hideBottomSheet();
    showToast('已保存 OvO');
    renderWallet();
    if (currentAiPage) renderAiWalletPage(character);
  });

  actions.append(cancel, save);
  sheet.append(title, amountField, descField, actions);
  showBottomSheet(sheet);
}

function openCustomizeSheet() {
  const profile = readProfile();
  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'wallet-sheet-title';
  title.textContent = '装扮钱包';

  const profileSection = createCustomSection('文字设置', '换一个更像自己的钱包名字和说明。');

  const nameField = createInputField('钱包名称', '比如：恋爱基金', 'text');
  nameField.querySelector('input').value = profile.name;

  const noteField = createTextareaField('卡片文案', '写一句钱包说明');
  noteField.querySelector('textarea').value = profile.note;

  const saveText = document.createElement('button');
  saveText.className = 'wallet-mini-btn primary';
  saveText.type = 'button';
  saveText.append(createIcon('check', 15), document.createTextNode('保存文字'));
  saveText.addEventListener('click', () => {
    saveProfile({
      name: nameField.querySelector('input').value.trim() || '我的小金库',
      note: noteField.querySelector('textarea').value.trim()
    });
    hideBottomSheet();
    showToast('钱包文字已保存 ⌯\'ᵕ\'⌯');
    renderWallet();
  });

  profileSection.append(nameField, noteField);
  profileSection.querySelector('.wallet-custom-actions').appendChild(saveText);

  const bgSection = createCustomSection('页面背景', '给钱包页面换一张背景，图片会尽量完整显示。');
  bgSection.querySelector('.wallet-custom-actions').append(
    createUploadButton('上传背景', BG_KEY, async () => {
      const screen = container?.querySelector('.wallet-screen');
      if (screen) await applyWalletBackground(screen);
    }),
    createClearBlobButton('清除背景', BG_KEY, async () => {
      const screen = container?.querySelector('.wallet-screen');
      if (screen) await applyWalletBackground(screen);
    })
  );

  const cardSection = createCustomSection('余额卡片', '可以换卡片背景和右上角小图。');
  cardSection.querySelector('.wallet-custom-actions').append(
    createUploadButton('上传卡片背景', CARD_BG_KEY, async () => {
      await loadWalletVisuals();
      renderWallet();
    }),
    createClearBlobButton('清除卡片背景', CARD_BG_KEY, async () => {
      await loadWalletVisuals();
      renderWallet();
    }),
    createUploadButton('上传小图', ICON_KEY, async () => {
      await loadWalletVisuals();
      renderWallet();
    }),
    createClearBlobButton('清除小图', ICON_KEY, async () => {
      await loadWalletVisuals();
      renderWallet();
    })
  );

  sheet.append(title, profileSection, bgSection, cardSection);
  showBottomSheet(sheet);
}

function createCustomSection(titleText, subText) {
  const section = document.createElement('section');
  section.className = 'wallet-custom-section';

  const title = document.createElement('div');
  title.className = 'wallet-custom-title';
  title.textContent = titleText;

  const sub = document.createElement('div');
  sub.className = 'wallet-custom-sub';
  sub.textContent = subText;

  const actions = document.createElement('div');
  actions.className = 'wallet-custom-actions';

  section.append(title, sub, actions);
  return section;
}

function createUploadButton(label, key, afterSave) {
  const button = document.createElement('button');
  button.className = 'wallet-mini-btn primary';
  button.type = 'button';
  button.append(createIcon('upload', 15), document.createTextNode(label));
  button.addEventListener('click', () => chooseImage(async (file) => {
    const value = await compressImage(file, 1600, 0.86);
    await setDB('blobs', key, {
      key,
      value,
      source: value,
      opacity: 100,
      updatedAt: getNow()
    });
    await afterSave?.();
    hideBottomSheet();
    showToast('已保存 ˶>ᗜ<˶');
  }));
  return button;
}

function createClearBlobButton(label, key, afterClear) {
  const button = document.createElement('button');
  button.className = 'wallet-mini-btn';
  button.type = 'button';
  button.append(createIcon('clear', 15), document.createTextNode(label));
  button.addEventListener('click', async () => {
    await deleteDB('blobs', key);
    await afterClear?.();
    hideBottomSheet();
    showToast('已清除');
  });
  return button;
}

function chooseImage(onPicked) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      await onPicked(file);
    } catch (_) {
      showToast('图片处理失败 ᗜ ‸ ᗜ');
    }
  });
  input.click();
}

function createInputField(labelText, placeholder, type) {
  const field = document.createElement('div');
  field.className = 'wallet-field';

  const label = document.createElement('div');
  label.className = 'wallet-field-label';
  label.append(createIcon(type === 'number' ? 'transfer' : 'edit', 15), document.createTextNode(labelText));

  const input = document.createElement('input');
  input.className = 'wallet-input';
  input.type = type === 'number' ? 'number' : 'text';
  input.inputMode = type === 'number' ? 'decimal' : 'text';
  input.placeholder = placeholder;

  field.append(label, input);
  return field;
}

function createSelectField(labelText, options) {
  const field = document.createElement('div');
  field.className = 'wallet-field';

  const label = document.createElement('div');
  label.className = 'wallet-field-label';
  label.append(createIcon('heart', 15), document.createTextNode(labelText));

  const select = document.createElement('select');
  select.className = 'wallet-input';

  options.forEach((option) => {
    const item = document.createElement('option');
    item.value = option.value;
    item.textContent = option.label;
    select.appendChild(item);
  });

  field.append(label, select);
  return field;
}

function createTextareaField(labelText, placeholder) {
  const field = document.createElement('div');
  field.className = 'wallet-field';

  const label = document.createElement('div');
  label.className = 'wallet-field-label';
  label.append(createIcon('edit', 15), document.createTextNode(labelText));

  const textarea = document.createElement('textarea');
  textarea.className = 'wallet-textarea';
  textarea.placeholder = placeholder;

  field.append(label, textarea);
  return field;
}

async function clearTransactions() {
  const wallet = readWallet();

  if (!wallet.transactions.length) {
    showToast('还没有记录呢 OvO');
    return;
  }

  const ok = await showConfirm('确定清空我的钱包记录吗？余额会保留。');
  if (!ok) return;

  saveWallet({
    balance: wallet.balance,
    transactions: []
  });

  showToast('记录已清空');
  renderWallet();
}

async function recordWalletMemory({ characterId, role, content, source }) {
  if (!characterId || !content) return null;

  try {
    return await window.AppBus.recordExternalInteraction({
      characterId,
      role,
      content,
      source,
      importance: 3
    });
  } catch (_) {
    return null;
  }
}

function getImageFromRecord(record) {
  if (!record) return '';
  if (typeof record === 'string') return record.trim();

  for (const key of ['value', 'source', 'data', 'image', 'imageBase64', 'backgroundImage', 'iconImage', 'url', 'src']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return '';
}

function cssUrl(value) {
  return String(value || '').replace(/"/g, '\\"');
}

// 依赖：../core/storage.js 的 getData/setData/generateId/getNow/getDB/setDB/deleteDB/compressImage/getAllDB；../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm/createIcon；通过 window.AppBus 统一写记忆（recordExternalInteraction）、发 wallet:transfer 事件、跳转 chat
