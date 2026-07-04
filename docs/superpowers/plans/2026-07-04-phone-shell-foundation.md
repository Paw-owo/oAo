# 小手机系统 — 手机底座 + 桌面 Shell 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现「小手机系统」Phase 1-4，交付一个可启动、可解锁、可操作的完整桌面 Shell（不含 APP 内部业务），所有事件最终流向事件中心供后续 Plan 2 的 AI 聊天读取。

**Architecture:** 纯前端 IIFE + 全局对象 `window.Phone`，避免 ES Module 双击白屏。三大核心模块（Storage / EventCenter / AppRegistry）走 TDD；桌面 UI 组件用「实现 + 浏览器验证」。所有颜色用 CSS 变量，4 套主题通过 `data-theme` 切换。壁纸 / 密码 / Dock / 图标顺序等一律从 Storage 读取，禁止写死。

**Tech Stack:** 原生 HTML/CSS/JS（IIFE 模式）、IndexedDB、PWA（manifest + service worker）、vitest + jsdom + fake-indexeddb（仅开发期）。

**适用规范约束（来自 spec，本计划必须遵守）：**
- 不用 ES Module import，全部 IIFE + `window.Phone`。
- 颜色全部走 CSS 变量，禁止硬编码色值。
- 图标线条风 stroke-width 1.5px，禁止填充 / emoji。
- 阴影同色系半透明，禁止 `rgba(0,0,0,x)`。
- 大圆角（16-28px），禁止直角。
- 字重 400-600，禁止衬线 / 字重 >700。
- 文案可爱（"小手机正在醒来…"、"嘿嘿，不对哦"）。
- 所有可变配置（壁纸、密码、Dock、图标顺序、主题、系统名）从 Storage 读取，提供默认值兜底。
- **AI 逻辑第一人称规则不适用于本计划**（本计划无 AI 逻辑文件），将在 Plan 2 起强制。

**计划范围与外部依赖：** 本计划只到「桌面 Shell 可用」为止。聊天 / 设置 / 其他 APP 在后续 Plan 2-N。事件中心已预留好事件流接口，Plan 2 的聊天层会读取它。

**关于 commit：** 每个 Task 末尾有 commit 步骤。Executor 在执行该计划时按用户意愿决定是否提交；若用户未要求提交则跳过 commit 步骤即可。

---

## 文件结构总览

| 文件 | 职责 | 单文件最大行数目标 |
|------|------|---------|
| `index.html` | 入口，按依赖顺序加载所有 IIFE 脚本，挂载桌面容器 | <200 |
| `manifest.json` | PWA 清单（name、icons、theme_color、display standalone） | <40 |
| `service-worker.js` | 缓存静态资源，断网可用 | <120 |
| `package.json` | devDeps: vitest / jsdom / fake-indexeddb | <30 |
| `vitest.config.js` | test 环境 = jsdom，setupFiles 指向 setup.js | <20 |
| `css/theme.css` | 4 套主题 CSS 变量 + 通用 radius/shadow 变量 | <250 |
| `css/base.css` | reset + 字体 + body 布局 + 通用按钮/卡片样式 | <200 |
| `css/desktop.css` | boot / lockscreen / status-bar / widgets / app-grid / dock / page-indicator 样式 | <600（按区块注释分隔） |
| `js/core/storage.js` | IndexedDB KV 封装 + storage estimate | <150 |
| `js/core/event-center.js` | 事件 emit/on/off + 持久化日志 + 读取/标记已读 | <180 |
| `js/core/app-registry.js` | APP 注册 / 查询 / 注销 | <80 |
| `js/desktop/boot.js` | 启动动画 "小手机正在醒来…" | <120 |
| `js/desktop/lockscreen.js` | 4 位密码锁屏，密码校验纯函数可测 | <200 |
| `js/desktop/status-bar.js` | 状态胶囊 + 9 个 SVG 图标轮换 | <200 |
| `js/desktop/widgets.js` | 时间 / 天气 / 今日提示 / 黑胶唱片 4 组件 | <350 |
| `js/desktop/app-grid.js` | 4 列网格 + 长按编辑（拖拽 / 删除 / 隐藏） | <400 |
| `js/desktop/dock.js` | 4 图标 Dock + 毛玻璃 + 页面指示器 | <200 |
| `js/desktop/desktop.js` | 总装 + 壁纸系统 + 主题切换 + 解锁后进入桌面 | <250 |
| `tests/setup.js` | 加载 fake-indexeddb/auto | <10 |
| `tests/helpers/loadModule.js` | 读取 IIFE 源码并执行到 jsdom 全局 | <20 |
| `tests/core/storage.test.js` | storage 增删改查 + estimate | <120 |
| `tests/core/event-center.test.js` | emit/on/off + 持久化 + 读取过滤 + 标记已读 | <150 |
| `tests/core/app-registry.test.js` | register / get / list / unregister | <80 |

**模块加载顺序（index.html 必须遵守，因为 IIFE 有依赖）：**
```
1. js/core/storage.js        (无依赖)
2. js/core/event-center.js   (依赖 Phone.Storage)
3. js/core/app-registry.js   (无依赖)
4. js/desktop/boot.js        (依赖 Phone.Storage)
5. js/desktop/lockscreen.js  (依赖 Phone.Storage)
6. js/desktop/status-bar.js  (无依赖)
7. js/desktop/widgets.js     (依赖 Phone.Storage)
8. js/desktop/app-grid.js    (依赖 Phone.AppRegistry, Phone.Storage)
9. js/desktop/dock.js        (依赖 Phone.Storage)
10. js/desktop/desktop.js    (依赖以上全部 + Phone.EventCenter)
```

---

## Task 1: 项目 & 测试基础设施

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `tests/setup.js`
- Create: `tests/helpers/loadModule.js`
- Modify: `.gitignore`（追加 `node_modules/` 和 `.vitest/`）

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "small-phone-system",
  "version": "0.1.0",
  "description": "纯前端虚拟手机系统 — Soft Cozy Minimal 风格",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "fake-indexeddb": "^5.0.2",
    "jsdom": "^24.0.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: 创建 vitest.config.js**

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
  },
});
```

- [ ] **Step 3: 创建 tests/setup.js**

```javascript
import 'fake-indexeddb/auto';
```

- [ ] **Step 4: 创建 tests/helpers/loadModule.js**

IIFE 模块不能用 `import` 直接拿到 `window.Phone`，需要把源码读出来在 jsdom 全局执行。

```javascript
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 读取 IIFE 源文件并执行到当前 jsdom 全局，使其挂载到 window.Phone。
 * @param {string} relativePath 相对项目根目录的路径，例如 'js/core/storage.js'
 */
export function loadModule(relativePath) {
  const fullPath = resolve(__dirname, '../..', relativePath);
  const code = readFileSync(fullPath, 'utf8');
  // 间接 eval 在全局作用域执行，让 IIFE 内的 window 引用解析到 jsdom 的 window
  (0, eval)(code);
}
```

- [ ] **Step 5: 更新 .gitignore**

读取当前 `.gitignore`，在末尾追加：

```
node_modules/
.vitest/
```

- [ ] **Step 6: 安装依赖并验证测试框架空跑**

Run: `npm install && npm test`
Expected: vitest 启动，无测试文件时报 "No test files found"（exit code 非 0 是正常的，框架已就绪）。

- [ ] **Step 7: 创建空目录骨架**

```bash
mkdir -p css js/core js/desktop tests/core tests/helpers docs/superpowers/plans
```

- [ ] **Step 8: Commit**

```bash
git add package.json vitest.config.js tests/ .gitignore
git commit -m "chore: 搭建测试基础设施（vitest + jsdom + fake-indexeddb）"
```

---

## Task 2: 主题 CSS + 基础样式

**Files:**
- Create: `css/theme.css`
- Create: `css/base.css`

- [ ] **Step 1: 创建 css/theme.css（4 套主题）**

```css
/* ===== 主题：薰衣草（默认） ===== */
:root,
[data-theme="lavender"] {
  --bg-base: #F5F0FA;
  --bg-surface: #FFFFFF;
  --bg-hover: #F0EAF7;
  --bg-overlay: rgba(255, 255, 255, 0.72);

  --color-primary: #9B7FD4;
  --color-primary-light: #B9A0E0;
  --color-primary-ultralight: #E8DEF5;
  --color-primary-deep: #7A5FB8;

  --color-accent: #F5B0C8;
  --color-accent-light: #FBC9DA;

  --text-primary: #3D2E5C;
  --text-secondary: #7A6B92;
  --text-placeholder: #B0A3C5;
  --text-on-primary: #FFFFFF;

  --shadow-soft: 0 4px 16px rgba(155, 127, 212, 0.12);
  --shadow-card: 0 8px 24px rgba(155, 127, 212, 0.15);
  --shadow-float: 0 12px 32px rgba(155, 127, 212, 0.20);
  --shadow-neu-out: 4px 4px 12px rgba(155, 127, 212, 0.15), -4px -4px 12px rgba(255, 255, 255, 0.80);
  --shadow-neu-in: inset 3px 3px 8px rgba(155, 127, 212, 0.15), inset -3px -3px 8px rgba(255, 255, 255, 0.80);

  --wallpaper-default: linear-gradient(160deg, #E8DEF5 0%, #F5F0FA 60%, #FBC9DA 100%);
}

/* ===== 主题：pink 奶粉 ===== */
[data-theme="pink"] {
  --bg-base: #FFF5F8;
  --bg-surface: #FFFFFF;
  --bg-hover: #FFEDF3;
  --bg-overlay: rgba(255, 255, 255, 0.72);

  --color-primary: #F5A8C5;
  --color-primary-light: #F9C2D7;
  --color-primary-ultralight: #FDE6EE;
  --color-primary-deep: #E07EA0;

  --color-accent: #FFD4A8;
  --color-accent-light: #FFE5CC;

  --text-primary: #5C2E42;
  --text-secondary: #926B7E;
  --text-placeholder: #C5A3B3;
  --text-on-primary: #FFFFFF;

  --shadow-soft: 0 4px 16px rgba(245, 168, 197, 0.15);
  --shadow-card: 0 8px 24px rgba(245, 168, 197, 0.18);
  --shadow-float: 0 12px 32px rgba(245, 168, 197, 0.22);
  --shadow-neu-out: 4px 4px 12px rgba(245, 168, 197, 0.18), -4px -4px 12px rgba(255, 255, 255, 0.80);
  --shadow-neu-in: inset 3px 3px 8px rgba(245, 168, 197, 0.18), inset -3px -3px 8px rgba(255, 255, 255, 0.80);

  --wallpaper-default: linear-gradient(160deg, #FDE6EE 0%, #FFF5F8 60%, #FFE5CC 100%);
}

/* ===== 主题：honey 奶茶 ===== */
[data-theme="honey"] {
  --bg-base: #FFF8EE;
  --bg-surface: #FFFFFF;
  --bg-hover: #FFEFDA;
  --bg-overlay: rgba(255, 255, 255, 0.72);

  --color-primary: #E8B86E;
  --color-primary-light: #F0CB8E;
  --color-primary-ultralight: #FBE8C8;
  --color-primary-deep: #C99248;

  --color-accent: #D4B89E;
  --color-accent-light: #E5D2BE;

  --text-primary: #5C4423;
  --text-secondary: #8C7553;
  --text-placeholder: #C5B394;
  --text-on-primary: #FFFFFF;

  --shadow-soft: 0 4px 16px rgba(232, 184, 110, 0.15);
  --shadow-card: 0 8px 24px rgba(232, 184, 110, 0.18);
  --shadow-float: 0 12px 32px rgba(232, 184, 110, 0.22);
  --shadow-neu-out: 4px 4px 12px rgba(232, 184, 110, 0.18), -4px -4px 12px rgba(255, 255, 255, 0.80);
  --shadow-neu-in: inset 3px 3px 8px rgba(232, 184, 110, 0.18), inset -3px -3px 8px rgba(255, 255, 255, 0.80);

  --wallpaper-default: linear-gradient(160deg, #FBE8C8 0%, #FFF8EE 60%, #E5D2BE 100%);
}

/* ===== 主题：sky 天空 ===== */
[data-theme="sky"] {
  --bg-base: #EEF6FB;
  --bg-surface: #FFFFFF;
  --bg-hover: #DDEEF6;
  --bg-overlay: rgba(255, 255, 255, 0.72);

  --color-primary: #7EB8D9;
  --color-primary-light: #A0CCE4;
  --color-primary-ultralight: #D5E8F2;
  --color-primary-deep: #5A95BA;

  --color-accent: #B8D4E0;
  --color-accent-light: #D0E2EB;

  --text-primary: #2E4A5C;
  --text-secondary: #5C7388;
  --text-placeholder: #A3B5C5;
  --text-on-primary: #FFFFFF;

  --shadow-soft: 0 4px 16px rgba(126, 184, 217, 0.15);
  --shadow-card: 0 8px 24px rgba(126, 184, 217, 0.18);
  --shadow-float: 0 12px 32px rgba(126, 184, 217, 0.22);
  --shadow-neu-out: 4px 4px 12px rgba(126, 184, 217, 0.18), -4px -4px 12px rgba(255, 255, 255, 0.80);
  --shadow-neu-in: inset 3px 3px 8px rgba(126, 184, 217, 0.18), inset -3px -3px 8px rgba(255, 255, 255, 0.80);

  --wallpaper-default: linear-gradient(160deg, #D5E8F2 0%, #EEF6FB 60%, #D0E2EB 100%);
}

/* ===== 通用尺寸变量（与主题无关） ===== */
:root {
  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 20px;
  --radius-xl: 28px;
  --radius-full: 999px;

  --font-xs: 11px;
  --font-sm: 13px;
  --font-base: 15px;
  --font-md: 17px;
  --font-lg: 20px;
  --font-xl: 24px;

  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --dur-fast: 200ms;
  --dur-base: 280ms;
}
```

- [ ] **Step 2: 创建 css/base.css**

```css
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  height: 100%;
}

body {
  font-family: "PingFang SC", "HarmonyOS Sans SC", "Helvetica Neue", system-ui, sans-serif;
  font-weight: 400;
  font-size: var(--font-base);
  line-height: 1.6;
  color: var(--text-primary);
  background: var(--bg-base);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  /* 适配移动端软键盘：用 dvh 代替 vh */
  min-height: 100dvh;
  overflow: hidden;
}

button {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  border: none;
  background: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

input,
textarea {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  border: none;
  background: none;
  outline: none;
}

ul,
ol {
  list-style: none;
}

svg {
  display: block;
}

/* ===== 通用按钮 ===== */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 24px;
  border-radius: var(--radius-full);
  font-size: var(--font-base);
  font-weight: 500;
  transition: transform var(--dur-fast) var(--ease-spring),
              background var(--dur-fast) ease,
              box-shadow var(--dur-fast) ease;
  min-height: 44px;
  min-width: 44px;
}
.btn:active {
  transform: scale(0.97);
}
.btn--primary {
  background: linear-gradient(135deg, var(--color-primary-light), var(--color-primary));
  color: var(--text-on-primary);
  box-shadow: var(--shadow-soft);
}
.btn--secondary {
  background: var(--bg-surface);
  color: var(--color-primary);
  border: 1.5px solid var(--color-primary-ultralight);
  box-shadow: var(--shadow-neu-out);
}

/* ===== 通用卡片 ===== */
.card {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: 16px;
}

/* ===== 通用输入框 ===== */
.input {
  width: 100%;
  padding: 12px 16px;
  background: var(--bg-surface);
  border: 1.5px solid var(--color-primary-ultralight);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-neu-in);
  color: var(--text-primary);
  transition: border-color var(--dur-fast) ease, box-shadow var(--dur-fast) ease;
}
.input::placeholder {
  color: var(--text-placeholder);
}
.input:focus {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-neu-in), 0 0 0 4px var(--color-primary-ultralight);
}

/* ===== 弹入动画工具类 ===== */
@keyframes pop-in {
  from { opacity: 0; transform: scale(0.94) translateY(6px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.animate-pop-in {
  animation: pop-in var(--dur-base) var(--ease-spring) both;
}

/* ===== 渐隐分割线 ===== */
.divider-soft {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--color-primary-ultralight), transparent);
}

/* ===== 全局容器：max-width 600px 居中 ===== */
.phone-frame {
  position: relative;
  width: 100%;
  max-width: 600px;
  height: 100dvh;
  margin: 0 auto;
  overflow: hidden;
}
```

- [ ] **Step 3: 浏览器静态验证（创建临时 index.html 预览）**

临时创建 `index.html` 仅引入 theme.css + base.css，body 里放一个 `<div class="phone-frame"><button class="btn btn--primary">点我</button></div>`，用浏览器打开确认按钮渐变、圆角、点击 scale 反馈正常，4 套主题切换 `data-theme` 颜色变化正确。验证后删除该临时文件。

- [ ] **Step 4: Commit**

```bash
git add css/theme.css css/base.css
git commit -m "feat: 添加 4 套主题变量与基础样式"
```

---

## Task 3: 存储层 Storage（TDD）

**Files:**
- Create: `tests/core/storage.test.js`
- Create: `js/core/storage.js`

- [ ] **Step 1: 写失败的测试**

`tests/core/storage.test.js`：

```javascript
import { describe, test, expect, beforeEach } from 'vitest';
import { loadModule } from '../helpers/loadModule.js';

beforeEach(async () => {
  // 每个 test 前重置 jsdom 上的 Phone
  window.Phone = undefined;
  loadModule('js/core/storage.js');
  // 清空 IndexedDB
  await window.Phone.Storage.clear();
});

describe('Storage', () => {
  test('set/get 基础读写', async () => {
    await window.Phone.Storage.set('foo', { a: 1 });
    const result = await window.Phone.Storage.get('foo');
    expect(result).toEqual({ a: 1 });
  });

  test('get 不存在的 key 返回默认值', async () => {
    const result = await window.Phone.Storage.get('nope', 'default');
    expect(result).toBe('default');
  });

  test('get 不存在且无默认值返回 null', async () => {
    const result = await window.Phone.Storage.get('nope');
    expect(result).toBeNull();
  });

  test('delete 删除指定 key', async () => {
    await window.Phone.Storage.set('k', 'v');
    await window.Phone.Storage.delete('k');
    expect(await window.Phone.Storage.get('k')).toBeNull();
  });

  test('keys 列出所有 key', async () => {
    await window.Phone.Storage.set('a', 1);
    await window.Phone.Storage.set('b', 2);
    const keys = await window.Phone.Storage.keys();
    expect(keys.sort()).toEqual(['a', 'b']);
  });

  test('clear 清空所有 key', async () => {
    await window.Phone.Storage.set('a', 1);
    await window.Phone.Storage.set('b', 2);
    await window.Phone.Storage.clear();
    expect(await window.Phone.Storage.keys()).toEqual([]);
  });

  test('覆盖写入同 key', async () => {
    await window.Phone.Storage.set('k', 'old');
    await window.Phone.Storage.set('k', 'new');
    expect(await window.Phone.Storage.get('k')).toBe('new');
  });

  test('getStorageEstimate 返回 usage/quota 对象', async () => {
    const est = await window.Phone.Storage.getStorageEstimate();
    expect(est).toHaveProperty('usage');
    expect(est).toHaveProperty('quota');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/core/storage.test.js`
Expected: 全部 FAIL，错误类似 `Cannot read properties of undefined (reading 'Storage')` 或文件不存在报错。

- [ ] **Step 3: 实现 js/core/storage.js**

```javascript
(function (global) {
  const Phone = global.Phone || (global.Phone = {});

  const DB_NAME = 'phone-system';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  Phone.Storage = {
    async set(key, value) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    },

    async get(key, defaultValue = null) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result === undefined ? defaultValue : req.result);
        req.onerror = () => reject(req.error);
      });
    },

    async delete(key) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    },

    async clear() {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    },

    async keys() {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAllKeys();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },

    async getStorageEstimate() {
      if (global.navigator && global.navigator.storage && global.navigator.storage.estimate) {
        return global.navigator.storage.estimate();
      }
      return { usage: 0, quota: 0 };
    },
  };
})(window);
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/core/storage.test.js`
Expected: 全部 PASS（8 个 test 通过）。

- [ ] **Step 5: Commit**

```bash
git add js/core/storage.js tests/core/storage.test.js
git commit -m "feat: 实现 Storage 存储层（IndexedDB 封装 + 配额查询）"
```

---

## Task 4: 事件中心 EventCenter（TDD）

**Files:**
- Create: `tests/core/event-center.test.js`
- Create: `js/core/event-center.js`

**事件数据结构（写死契约，后续 Plan 2 的 AI 聊天会按此读取）：**
```javascript
{
  id: 'evt_<timestamp>_<rand>',
  type: 'string',          // 事件类型，如 'chat.message', 'wallet.spend'
  payload: { appId, ... }, // 业务数据，必须包含 appId
  timestamp: 1234567890,
  read: false
}
```

- [ ] **Step 1: 写失败的测试**

`tests/core/event-center.test.js`：

```javascript
import { describe, test, expect, beforeEach } from 'vitest';
import { loadModule } from '../helpers/loadModule.js';

beforeEach(async () => {
  window.Phone = undefined;
  loadModule('js/core/storage.js');
  loadModule('js/core/event-center.js');
  await window.Phone.Storage.clear();
});

describe('EventCenter', () => {
  test('emit 持久化事件并返回完整事件对象', async () => {
    const evt = await window.Phone.EventCenter.emit('chat.message', { appId: 'chat', text: 'hi' });
    expect(evt.id).toMatch(/^evt_/);
    expect(evt.type).toBe('chat.message');
    expect(evt.payload.text).toBe('hi');
    expect(evt.timestamp).toBeGreaterThan(0);
    expect(evt.read).toBe(false);
  });

  test('on 订阅收到 emit 的事件', async () => {
    let received = null;
    window.Phone.EventCenter.on('chat.message', (e) => { received = e; });
    await window.Phone.EventCenter.emit('chat.message', { appId: 'chat' });
    expect(received).not.toBeNull();
    expect(received.type).toBe('chat.message');
  });

  test('off 取消订阅后不再收到', async () => {
    let count = 0;
    const off = window.Phone.EventCenter.on('test', () => { count++; });
    await window.Phone.EventCenter.emit('test', {});
    off();
    await window.Phone.EventCenter.emit('test', {});
    expect(count).toBe(1);
  });

  test('getLog 读取全部事件', async () => {
    await window.Phone.EventCenter.emit('a', { appId: 'x' });
    await window.Phone.EventCenter.emit('b', { appId: 'y' });
    const log = await window.Phone.EventCenter.getLog();
    expect(log).toHaveLength(2);
  });

  test('getLog 按 type 过滤', async () => {
    await window.Phone.EventCenter.emit('chat.message', { appId: 'chat' });
    await window.Phone.EventCenter.emit('wallet.spend', { appId: 'wallet' });
    await window.Phone.EventCenter.emit('chat.message', { appId: 'chat' });
    const log = await window.Phone.EventCenter.getLog({ type: 'chat.message' });
    expect(log).toHaveLength(2);
    expect(log.every(e => e.type === 'chat.message')).toBe(true);
  });

  test('getLog 按 appId 过滤', async () => {
    await window.Phone.EventCenter.emit('x', { appId: 'wallet' });
    await window.Phone.EventCenter.emit('x', { appId: 'chat' });
    const log = await window.Phone.EventCenter.getLog({ appId: 'wallet' });
    expect(log).toHaveLength(1);
  });

  test('getLog 按 since 时间戳过滤', async () => {
    await window.Phone.EventCenter.emit('old', { appId: 'x' });
    const cutoff = Date.now() + 10;
    await new Promise(r => setTimeout(r, 20));
    await window.Phone.EventCenter.emit('new', { appId: 'x' });
    const log = await window.Phone.EventCenter.getLog({ since: cutoff });
    expect(log).toHaveLength(1);
    expect(log[0].payload).toBeUndefined(); // 注意：payload 是 'new' 字符串，不是对象
    // 修正断言：上面 emit 传的是字符串 'new'，payload 字段就是 'new'
  });

  test('markRead 标记事件已读', async () => {
    const evt = await window.Phone.EventCenter.emit('x', { appId: 'a' });
    await window.Phone.EventCenter.markRead(evt.id);
    const log = await window.Phone.EventCenter.getLog();
    expect(log.find(e => e.id === evt.id).read).toBe(true);
  });

  test('clearLog 清空所有事件', async () => {
    await window.Phone.EventCenter.emit('x', { appId: 'a' });
    await window.Phone.EventCenter.clearLog();
    const log = await window.Phone.EventCenter.getLog();
    expect(log).toEqual([]);
  });

  test('事件在重新加载后仍然存在（持久化）', async () => {
    await window.Phone.EventCenter.emit('persist', { appId: 'x' });
    // 模拟重新加载：重新执行 IIFE
    window.Phone = undefined;
    loadModule('js/core/storage.js');
    loadModule('js/core/event-center.js');
    const log = await window.Phone.EventCenter.getLog();
    expect(log.find(e => e.type === 'persist')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/core/event-center.test.js`
Expected: 全部 FAIL（模块未实现）。

- [ ] **Step 3: 实现 js/core/event-center.js**

```javascript
(function (global) {
  const Phone = global.Phone || (global.Phone = {});

  const EVENTS_KEY = 'events:log';
  const listeners = new Map(); // type -> Set<callback>

  function genId() {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  Phone.EventCenter = {
    /**
     * 订阅事件
     * @param {string} eventType 事件类型
     * @param {(event: object) => void} callback
     * @returns {() => void} 取消订阅函数
     */
    on(eventType, callback) {
      if (!listeners.has(eventType)) listeners.set(eventType, new Set());
      listeners.get(eventType).add(callback);
      return () => {
        const set = listeners.get(eventType);
        if (set) set.delete(callback);
      };
    },

    off(eventType, callback) {
      const set = listeners.get(eventType);
      if (set) set.delete(callback);
    },

    /**
     * 触发事件，持久化到 storage 并通知订阅者
     * @param {string} eventType
     * @param {object} payload 必须含 appId 字段
     * @returns {Promise<object>} 完整事件对象
     */
    async emit(eventType, payload = {}) {
      const event = {
        id: genId(),
        type: eventType,
        payload,
        timestamp: Date.now(),
        read: false,
      };
      const log = (await Phone.Storage.get(EVENTS_KEY, [])) || [];
      log.push(event);
      await Phone.Storage.set(EVENTS_KEY, log);
      const set = listeners.get(eventType);
      if (set) {
        set.forEach((cb) => {
          try { cb(event); } catch (e) { console.error('[EventCenter] listener error:', e); }
        });
      }
      return event;
    },

    /**
     * 读取事件日志
     * @param {{type?: string, appId?: string, since?: number}} filter
     */
    async getLog(filter = {}) {
      const log = (await Phone.Storage.get(EVENTS_KEY, [])) || [];
      return log.filter((e) => {
        if (filter.type && e.type !== filter.type) return false;
        if (filter.since && e.timestamp < filter.since) return false;
        if (filter.appId && e.payload && e.payload.appId !== filter.appId) return false;
        return true;
      });
    },

    async markRead(eventId) {
      const log = (await Phone.Storage.get(EVENTS_KEY, [])) || [];
      const e = log.find((x) => x.id === eventId);
      if (e) {
        e.read = true;
        await Phone.Storage.set(EVENTS_KEY, log);
      }
    },

    async markAllRead(filter = {}) {
      const log = (await Phone.Storage.get(EVENTS_KEY, [])) || [];
      log.forEach((e) => {
        if (filter.type && e.type !== filter.type) return;
        if (filter.appId && e.payload && e.payload.appId !== filter.appId) return;
        e.read = true;
      });
      await Phone.Storage.set(EVENTS_KEY, log);
    },

    async clearLog() {
      await Phone.Storage.set(EVENTS_KEY, []);
    },
  };
})(window);
```

- [ ] **Step 4: 修正 Step 1 测试中的一处弱断言**

Step 1 的 `getLog 按 since 时间戳过滤` 测试中，emit 传的 payload 是字符串而非对象，断言写得别扭。修正该测试：

```javascript
  test('getLog 按 since 时间戳过滤', async () => {
    await window.Phone.EventCenter.emit('old', { appId: 'x' });
    const cutoff = Date.now() + 10;
    await new Promise(r => setTimeout(r, 20));
    await window.Phone.EventCenter.emit('new', { appId: 'x' });
    const log = await window.Phone.EventCenter.getLog({ since: cutoff });
    expect(log).toHaveLength(1);
    expect(log[0].payload.appId).toBe('x');
  });
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/core/event-center.test.js`
Expected: 全部 PASS（10 个 test 通过）。

- [ ] **Step 6: Commit**

```bash
git add js/core/event-center.js tests/core/event-center.test.js
git commit -m "feat: 实现 EventCenter 事件中心（持久化 + 订阅 + 过滤）"
```

---

## Task 5: APP 注册表 AppRegistry（TDD）

**Files:**
- Create: `tests/core/app-registry.test.js`
- Create: `js/core/app-registry.js`

**注册配置结构（写死契约，Plan 7+ 接入新 APP 时遵守）：**
```javascript
{
  id: 'chat',                  // 唯一 ID
  name: '消息',                // 显示名（可被设置覆盖）
  icon: '<svg>...</svg>',      // 线条风 SVG 字符串
  entry: () => {...},          // 点击入口
  events: ['chat.message'],    // 会产生的事件类型
  settings: [...],             // 需要的设置项
  aiSpec: {...}                // AI 说明书（Plan 2+ 才填）
}
```

- [ ] **Step 1: 写失败的测试**

`tests/core/app-registry.test.js`：

```javascript
import { describe, test, expect, beforeEach } from 'vitest';
import { loadModule } from '../helpers/loadModule.js';

beforeEach(() => {
  window.Phone = undefined;
  loadModule('js/core/app-registry.js');
});

describe('AppRegistry', () => {
  test('register 注册单个 APP', () => {
    window.Phone.AppRegistry.register({ id: 'chat', name: '消息', icon: '<svg/>' });
    const app = window.Phone.AppRegistry.get('chat');
    expect(app.id).toBe('chat');
    expect(app.name).toBe('消息');
  });

  test('get 不存在的 id 返回 undefined', () => {
    expect(window.Phone.AppRegistry.get('nope')).toBeUndefined();
  });

  test('list 返回所有已注册 APP', () => {
    window.Phone.AppRegistry.register({ id: 'a', name: 'A', icon: '' });
    window.Phone.AppRegistry.register({ id: 'b', name: 'B', icon: '' });
    const list = window.Phone.AppRegistry.list();
    expect(list).toHaveLength(2);
    expect(list.map(a => a.id).sort()).toEqual(['a', 'b']);
  });

  test('重复注册同一 id 覆盖并打印 warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.Phone.AppRegistry.register({ id: 'x', name: 'old', icon: '' });
    window.Phone.AppRegistry.register({ id: 'x', name: 'new', icon: '' });
    expect(window.Phone.AppRegistry.get('x').name).toBe('new');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('unregister 注销 APP', () => {
    window.Phone.AppRegistry.register({ id: 'x', name: 'X', icon: '' });
    window.Phone.AppRegistry.unregister('x');
    expect(window.Phone.AppRegistry.get('x')).toBeUndefined();
  });
});
```

注意：第 4 个 test 用到了 `vi`，需要在 import 行补上：

```javascript
import { describe, test, expect, beforeEach, vi } from 'vitest';
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/core/app-registry.test.js`
Expected: 全部 FAIL（模块未实现）。

- [ ] **Step 3: 实现 js/core/app-registry.js**

```javascript
(function (global) {
  const Phone = global.Phone || (global.Phone = {});

  const apps = new Map();

  Phone.AppRegistry = {
    /**
     * 注册一个 APP
     * @param {{id: string, name: string, icon: string, entry?: Function, events?: string[], settings?: Array, aiSpec?: object}} config
     */
    register(config) {
      if (!config || !config.id) throw new Error('AppRegistry.register: config.id 必填');
      if (apps.has(config.id)) {
        console.warn(`[AppRegistry] APP "${config.id}" 已存在，将被覆盖`);
      }
      apps.set(config.id, config);
    },

    get(id) {
      return apps.get(id);
    },

    list() {
      return Array.from(apps.values());
    },

    unregister(id) {
      apps.delete(id);
    },

    clear() {
      apps.clear();
    },
  };
})(window);
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/core/app-registry.test.js`
Expected: 全部 PASS（5 个 test 通过）。

- [ ] **Step 5: 跑全量核心测试**

Run: `npx vitest run`
Expected: storage / event-center / app-registry 三个测试套件全部 PASS（共 23 个 test）。

- [ ] **Step 6: Commit**

```bash
git add js/core/app-registry.js tests/core/app-registry.test.js
git commit -m "feat: 实现 AppRegistry APP 注册表"
```

---

## Task 6: 启动动画 Boot

**Files:**
- Create: `js/desktop/boot.js`
- Modify: `css/desktop.css`（创建并追加 boot 区块）

- [ ] **Step 1: 实现 js/desktop/boot.js**

```javascript
(function (global) {
  const Phone = global.Phone || (global.Phone = {});

  /**
   * 显示启动动画，duration 后 resolve
   * @param {number} duration 毫秒
   * @returns {Promise<void>}
   */
  Phone.Boot = {
    show(duration = 1800) {
      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'boot-overlay';
        overlay.innerHTML = `
          <div class="boot-logo">
            <div class="boot-logo-icon">
              <svg viewBox="0 0 48 48" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M24 8c-6 0-10 4-10 10v8c0 6 4 10 10 10s10-4 10-10v-8c0-6-4-10-10-10z"/>
                <path d="M24 4v4M24 36v4"/>
              </svg>
            </div>
            <div class="boot-logo-text">小手机</div>
          </div>
          <div class="boot-caption">小手机正在醒来…</div>
          <div class="boot-dots"><span></span><span></span><span></span></div>
        `;
        document.body.appendChild(overlay);
        // 触发动画
        requestAnimationFrame(() => overlay.classList.add('is-visible'));
        setTimeout(() => {
          overlay.classList.remove('is-visible');
          setTimeout(() => {
            overlay.remove();
            resolve();
          }, 300);
        }, duration);
      });
    },
  };
})(window);
```

- [ ] **Step 2: 创建 css/desktop.css 并追加 boot 区块**

```css
/* ============ Boot 启动动画 ============ */
.boot-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  background: var(--wallpaper-default);
  opacity: 0;
  transition: opacity 300ms ease;
}
.boot-overlay.is-visible {
  opacity: 1;
}
.boot-logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  animation: pop-in 400ms var(--ease-spring) both;
}
.boot-logo-icon {
  color: var(--color-primary);
  animation: boot-breathe 1.6s ease-in-out infinite;
}
@keyframes boot-breathe {
  0%, 100% { transform: scale(1); opacity: 0.85; }
  50%      { transform: scale(1.06); opacity: 1; }
}
.boot-logo-text {
  font-size: var(--font-xl);
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 2px;
}
.boot-caption {
  font-size: var(--font-sm);
  color: var(--text-secondary);
}
.boot-dots {
  display: flex;
  gap: 6px;
}
.boot-dots span {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-primary-light);
  animation: boot-dot 1.2s ease-in-out infinite;
}
.boot-dots span:nth-child(2) { animation-delay: 0.15s; }
.boot-dots span:nth-child(3) { animation-delay: 0.3s; }
@keyframes boot-dot {
  0%, 100% { transform: scale(0.6); opacity: 0.5; }
  50%      { transform: scale(1); opacity: 1; }
}
```

- [ ] **Step 3: 浏览器验证**

临时创建 `index.html` 引入 theme.css / base.css / desktop.css 和 boot.js，body 留空，加 `<script>Phone.Boot.show(2000);</script>`。打开浏览器：
- 启动遮罩渐入显示
- "小手机" 标题 + 呼吸图标 + 三点跳动动画
- "小手机正在醒来…" 文案
- 2 秒后渐出消失

验证后删除临时 index.html。

- [ ] **Step 4: Commit**

```bash
git add js/desktop/boot.js css/desktop.css
git commit -m "feat: 实现启动动画（呼吸图标 + 跳点）"
```

---

## Task 7: 锁屏 Lockscreen（含密码校验 TDD）

**Files:**
- Create: `tests/desktop/lockscreen.test.js`
- Create: `js/desktop/lockscreen.js`
- Modify: `css/desktop.css`（追加 lockscreen 区块）

锁屏的密码校验是纯逻辑，单独抽出可测。

- [ ] **Step 1: 写失败的测试（密码校验纯函数）**

`tests/desktop/lockscreen.test.js`：

```javascript
import { describe, test, expect, beforeEach } from 'vitest';
import { loadModule } from '../helpers/loadModule.js';

beforeEach(() => {
  window.Phone = undefined;
  loadModule('js/core/storage.js');
  loadModule('js/desktop/lockscreen.js');
  window.Phone.Storage.clear();
});

describe('Lockscreen.checkPassword', () => {
  test('正确密码返回 true', () => {
    expect(window.Phone.Lockscreen.checkPassword('0326', '0326')).toBe(true);
  });

  test('错误密码返回 false', () => {
    expect(window.Phone.Lockscreen.checkPassword('1234', '0326')).toBe(false);
  });

  test('长度不足返回 false', () => {
    expect(window.Phone.Lockscreen.checkPassword('032', '0326')).toBe(false);
  });

  test('空输入返回 false', () => {
    expect(window.Phone.Lockscreen.checkPassword('', '0326')).toBe(false);
  });

  test('非字符串输入不抛错返回 false', () => {
    expect(window.Phone.Lockscreen.checkPassword(null, '0326')).toBe(false);
    expect(window.Phone.Lockscreen.checkPassword(undefined, '0326')).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/desktop/lockscreen.test.js`
Expected: FAIL（模块未实现）。

- [ ] **Step 3: 实现 js/desktop/lockscreen.js**

```javascript
(function (global) {
  const Phone = global.Phone || (global.Phone = {});

  const DEFAULT_PASSWORD = '0326';
  const KEY_PASSWORD = 'lockscreen:password';
  const KEY_WALLPAPER = 'lockscreen:wallpaper';
  const KEY_AVATAR = 'lockscreen:avatar';
  const KEY_CAPTION = 'lockscreen:caption';

  Phone.Lockscreen = {
    /**
     * 校验密码（纯函数，可测）
     * @param {string} input 用户输入
     * @param {string} correct 正确密码
     * @returns {boolean}
     */
    checkPassword(input, correct) {
      if (typeof input !== 'string' || typeof correct !== 'string') return false;
      if (input.length !== correct.length) return false;
      return input === correct;
    },

    async getPassword() {
      return (await Phone.Storage.get(KEY_PASSWORD)) || DEFAULT_PASSWORD;
    },

    async setPassword(newPwd) {
      if (typeof newPwd !== 'string' || !/^\d{4}$/.test(newPwd)) {
        throw new Error('密码必须是 4 位数字');
      }
      await Phone.Storage.set(KEY_PASSWORD, newPwd);
    },

    async getWallpaper() {
      return (await Phone.Storage.get(KEY_WALLPAPER)) || null; // null 表示用桌面壁纸
    },

    async setWallpaper(wp) {
      await Phone.Storage.set(KEY_WALLPAPER, wp);
    },

    async getAvatar() {
      return (await Phone.Storage.get(KEY_AVATAR)) || null;
    },

    async setAvatar(avatar) {
      await Phone.Storage.set(KEY_AVATAR, avatar);
    },

    async getCaption() {
      return (await Phone.Storage.get(KEY_CAPTION)) || null; // null 表示显示默认时间日期
    },

    async setCaption(text) {
      await Phone.Storage.set(KEY_CAPTION, text);
    },

    /**
     * 显示锁屏，解锁后 resolve
     * @returns {Promise<void>}
     */
    show() {
      return new Promise(async (resolve) => {
        const correctPwd = await this.getPassword();
        const wallpaper = await this.getWallpaper();
        const avatar = await this.getAvatar();
        const caption = await this.getCaption();

        const overlay = document.createElement('div');
        overlay.className = 'lockscreen-overlay';
        if (wallpaper) {
          overlay.style.background = wallpaper.startsWith('http')
            ? `url("${wallpaper}") center/cover`
            : wallpaper;
        } else {
          overlay.style.background = 'var(--wallpaper-default)';
        }

        const timeText = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        const dateText = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

        overlay.innerHTML = `
          <div class="lockscreen-top">
            ${avatar
              ? `<img class="lockscreen-avatar" src="${avatar}" alt="头像"/>`
              : `<div class="lockscreen-avatar lockscreen-avatar--placeholder"></div>`}
            <div class="lockscreen-time">${timeText}</div>
            <div class="lockscreen-date">${caption || dateText}</div>
          </div>
          <div class="lockscreen-bottom">
            <div class="lockscreen-hint">输入密码解锁</div>
            <div class="lockscreen-dots" data-filled="0">
              <span></span><span></span><span></span><span></span>
            </div>
            <div class="lockscreen-error" hidden>嘿嘿，不对哦</div>
            <div class="lockscreen-pad">
              ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="lockscreen-key" data-key="${n}">${n}</button>`).join('')}
              <button class="lockscreen-key lockscreen-key--ghost" data-key="clear">清空</button>
              <button class="lockscreen-key" data-key="0">0</button>
              <button class="lockscreen-key lockscreen-key--ghost" data-key="back">⌫</button>
            </div>
          </div>
        `;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('is-visible'));

        let input = '';
        const dots = overlay.querySelector('.lockscreen-dots');
        const errorEl = overlay.querySelector('.lockscreen-error');

        const updateDots = () => {
          const dotsEls = dots.querySelectorAll('span');
          dotsEls.forEach((d, i) => d.classList.toggle('is-filled', i < input.length));
          dots.dataset.filled = input.length;
        };

        const tryUnlock = () => {
          if (this.checkPassword(input, correctPwd)) {
            overlay.classList.remove('is-visible');
            setTimeout(() => { overlay.remove(); resolve(); }, 300);
          } else {
            errorEl.hidden = false;
            input = '';
            updateDots();
            setTimeout(() => { errorEl.hidden = true; }, 1500);
          }
        };

        overlay.addEventListener('click', (e) => {
          const key = e.target.closest('[data-key]');
          if (!key) return;
          const k = key.dataset.key;
          if (k === 'clear') { input = ''; updateDots(); return; }
          if (k === 'back') { input = input.slice(0, -1); updateDots(); return; }
          if (input.length >= 4) return;
          input += k;
          updateDots();
          if (input.length === 4) {
            // 短暂延迟给视觉反馈
            setTimeout(tryUnlock, 120);
          }
        });
      });
    },
  };
})(window);
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/desktop/lockscreen.test.js`
Expected: 全部 PASS（5 个 test 通过）。

- [ ] **Step 5: 追加 css/desktop.css 的 lockscreen 区块**

```css
/* ============ Lockscreen 锁屏 ============ */
.lockscreen-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 80px 32px 48px;
  opacity: 0;
  transition: opacity 300ms ease;
  color: var(--text-primary);
}
.lockscreen-overlay.is-visible { opacity: 1; }

.lockscreen-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.lockscreen-avatar {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-full);
  object-fit: cover;
  background: var(--color-primary-ultralight);
  box-shadow: var(--shadow-soft);
}
.lockscreen-avatar--placeholder {
  background: linear-gradient(135deg, var(--color-primary-light), var(--color-accent));
}
.lockscreen-time {
  font-size: 56px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--text-primary);
  text-shadow: 0 2px 12px rgba(255, 255, 255, 0.4);
}
.lockscreen-date {
  font-size: var(--font-md);
  color: var(--text-secondary);
}

.lockscreen-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.lockscreen-hint {
  font-size: var(--font-sm);
  color: var(--text-secondary);
}
.lockscreen-dots {
  display: flex;
  gap: 16px;
}
.lockscreen-dots span {
  width: 14px;
  height: 14px;
  border-radius: var(--radius-full);
  border: 1.5px solid var(--color-primary);
  background: transparent;
  transition: background 200ms var(--ease-spring);
}
.lockscreen-dots span.is-filled {
  background: var(--color-primary);
}
.lockscreen-error {
  font-size: var(--font-sm);
  color: var(--color-primary-deep);
  animation: pop-in 200ms var(--ease-spring) both;
}
.lockscreen-pad {
  display: grid;
  grid-template-columns: repeat(3, 72px);
  gap: 16px;
  margin-top: 8px;
}
.lockscreen-key {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-full);
  background: var(--bg-overlay);
  backdrop-filter: blur(16px);
  font-size: var(--font-xl);
  font-weight: 500;
  color: var(--text-primary);
  box-shadow: var(--shadow-neu-out);
  transition: transform var(--dur-fast) var(--ease-spring), background var(--dur-fast) ease;
}
.lockscreen-key:active {
  transform: scale(0.94);
  background: var(--color-primary-ultralight);
}
.lockscreen-key--ghost {
  font-size: var(--font-sm);
  color: var(--text-secondary);
}
```

- [ ] **Step 6: 浏览器验证**

临时 index.html 引入 core/desktop 脚本，调用 `Phone.Lockscreen.show()`：
- 锁屏遮罩渐入
- 顶部头像占位 + 时间 + 日期
- 4 个空圆点
- 数字键盘 1-9 / 清空 / 0 / 退格
- 输入 `1234` 显示"嘿嘿，不对哦"，圆点清空
- 输入 `0326` 解锁，遮罩渐出
- 错误提示 1.5 秒后自动隐藏

验证后删除临时文件。

- [ ] **Step 7: Commit**

```bash
git add js/desktop/lockscreen.js tests/desktop/lockscreen.test.js css/desktop.css
git commit -m "feat: 实现锁屏（4 位密码 + 自定义壁纸/头像/文案）"
```

---

## Task 8: 状态栏 StatusBar

**Files:**
- Create: `js/desktop/status-bar.js`
- Modify: `css/desktop.css`（追加 status-bar 区块）

9 个线条风 SVG 图标（stroke-width 1.5）：爱心、猫脸、熊、爪印、笑脸、音符、星星、月亮、大爪印。

- [ ] **Step 1: 实现 js/desktop/status-bar.js**

```javascript
(function (global) {
  const Phone = global.Phone || (global.Phone = {});

  const ICONS = [
    // 爱心
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.5-7-9.5A4 4 0 0 1 12 7a4 4 0 0 1 7 3.5C19 15.5 12 20 12 20z"/></svg>',
    // 猫脸
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4l2 4M19 4l-2 4"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M9 16h6M6 6c-2 2-2 8 0 11s12 2 14-1 2-9-1-11"/></svg>',
    // 熊
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.5" cy="6.5" r="2"/><circle cx="17.5" cy="6.5" r="2"/><circle cx="12" cy="13" r="6"/><circle cx="10" cy="13" r="0.5"/><circle cx="14" cy="13" r="0.5"/></svg>',
    // 爪印
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="10" r="1.5"/><circle cx="12" cy="7" r="1.5"/><circle cx="17" cy="10" r="1.5"/><path d="M12 14c-3 0-5 2-5 4s2 2 5 2 5 0 5-2-2-4-5-4z"/></svg>',
    // 笑脸
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="10" r="0.5" fill="currentColor"/><circle cx="15" cy="10" r="0.5" fill="currentColor"/></svg>',
    // 音符
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="17" r="2"/><circle cx="17" cy="15" r="2"/><path d="M9 17V5l10-2v12"/></svg>',
    // 星星
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"/></svg>',
    // 月亮
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z"/></svg>',
    // 大爪印
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="16" rx="5" ry="4"/><circle cx="6" cy="11" r="1.8"/><circle cx="10" cy="8" r="1.8"/><circle cx="14" cy="8" r="1.8"/><circle cx="18" cy="11" r="1.8"/></svg>',
  ];

  const STORAGE_KEY = 'statusbar:iconIndex';

  Phone.StatusBar = {
    /**
     * 创建状态栏元素并挂载到容器
     * @param {HTMLElement} container
     */
    async mount(container) {
      const savedIndex = await global.Phone.Storage.get(STORAGE_KEY);
      const index = (typeof savedIndex === 'number' && savedIndex < ICONS.length)
        ? savedIndex
        : Math.floor(Math.random() * ICONS.length);

      const bar = document.createElement('div');
      bar.className = 'status-bar';
      bar.innerHTML = `
        <div class="status-pill status-pill--left">
          <span class="status-pill-icon">${ICONS[index]}</span>
        </div>
        <div class="status-pill status-pill--right">
          <span class="status-pill-deco"></span>
          <span class="status-pill-deco"></span>
          <span class="status-pill-deco"></span>
        </div>
      `;
      container.appendChild(bar);

      // 每 30 秒轮换图标（可选行为）
      this._timer = setInterval(() => this._rotate(bar), 30000);
    },

    _rotate(bar) {
      const iconEl = bar.querySelector('.status-pill-icon');
      const next = Math.floor(Math.random() * ICONS.length);
      iconEl.style.opacity = '0';
      setTimeout(() => {
        iconEl.innerHTML = ICONS[next];
        iconEl.style.opacity = '1';
        global.Phone.Storage.set(STORAGE_KEY, next);
      }, 200);
    },

    unmount() {
      if (this._timer) clearInterval(this._timer);
      this._timer = null;
    },
  };
})(window);
```

- [ ] **Step 2: 追加 css/desktop.css 的 status-bar 区块**

```css
/* ============ StatusBar 状态栏 ============ */
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
  color: var(--text-secondary);
}
.status-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-full);
  background: var(--bg-overlay);
  backdrop-filter: blur(16px);
  box-shadow: var(--shadow-neu-out);
}
.status-pill-icon {
  display: flex;
  transition: opacity 200ms ease;
  color: var(--color-primary);
}
.status-pill-deco {
  width: 4px;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--color-primary-light);
}
.status-pill-deco:nth-child(2) { opacity: 0.6; }
.status-pill-deco:nth-child(3) { opacity: 0.3; }
```

- [ ] **Step 3: 浏览器验证**

临时 index.html 调用 `Phone.StatusBar.mount(document.body)`：
- 顶部出现左右两个胶囊
- 左胶囊显示一个线条图标（爱心/猫脸/熊 等）
- 图标 stroke-width 1.5，是线条非填充
- 30 秒后图标轮换（淡出再淡入）
- 右胶囊 3 个装饰圆点

验证后删除临时文件。

- [ ] **Step 4: Commit**

```bash
git add js/desktop/status-bar.js css/desktop.css
git commit -m "feat: 实现状态栏（胶囊 + 9 个线条图标轮换）"
```

---

## Task 9: 桌面小组件 Widgets

**Files:**
- Create: `js/desktop/widgets.js`
- Modify: `css/desktop.css`（追加 widgets 区块）

4 个组件：时间 / 天气 / 今日提示 / 黑胶唱片。

- [ ] **Step 1: 实现 js/desktop/widgets.js**

```javascript
(function (global) {
  const Phone = global.Phone || (global.Phone = {});

  const TIPS = [
    '今天也要好好吃饭呀',
    '记得喝水，笨蛋',
    '累了就歇一会儿',
    '阳光这么好，发个呆吧',
    '今天想我了嘛？',
    '抱抱，辛苦啦',
    '早点睡，别熬夜',
    '做点让自己开心的事',
    '嘿，你笑一下试试',
    '今天也是软萌的一天',
  ];
  const TIP_KEY = 'widgets:tipIndex';

  Phone.Widgets = {
    /**
     * 创建小组件容器并挂载
     * @param {HTMLElement} container
     */
    async mount(container) {
      const wrap = document.createElement('div');
      wrap.className = 'widgets';
      wrap.innerHTML = `
        <div class="widget widget--time" data-widget="time">
          <div class="widget-time-hm"></div>
          <div class="widget-time-date"></div>
        </div>
        <div class="widget widget--weather" data-widget="weather">
          <svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="4"/>
            <path d="M22 18a5 5 0 0 0-9-2 4 4 0 0 0 1 8h8a3 3 0 0 0 0-6z"/>
          </svg>
          <span class="widget-weather-temp">22°</span>
        </div>
        <div class="widget widget--tip" data-widget="tip">
          <div class="widget-tip-label">今日提示</div>
          <div class="widget-tip-text"></div>
        </div>
        <div class="widget widget--vinyl" data-widget="vinyl">
          <div class="widget-vinyl-disc">
            <div class="widget-vinyl-label"></div>
          </div>
          <div class="widget-vinyl-caption">点我转起来</div>
        </div>
      `;
      container.appendChild(wrap);

      this._mountTime(wrap);
      this._mountWeather(wrap);
      this._mountTip(wrap);
      this._mountVinyl(wrap);
    },

    _mountTime(wrap) {
      const hm = wrap.querySelector('.widget-time-hm');
      const date = wrap.querySelector('.widget-time-date');
      const tick = () => {
        const now = new Date();
        hm.textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        date.textContent = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
      };
      tick();
      this._timeTimer = setInterval(tick, 1000 * 30);
    },

    _mountWeather(wrap) {
      // 第一版静态展示，后续接 API
      const temp = wrap.querySelector('.widget-weather-temp');
      temp.textContent = '22°';
    },

    async _mountTip(wrap) {
      const text = wrap.querySelector('.widget-tip-text');
      let idx = await Phone.Storage.get(TIP_KEY);
      if (typeof idx !== 'number') {
        idx = Math.floor(Math.random() * TIPS.length);
      }
      text.textContent = TIPS[idx];
      // 点击换一条
      wrap.querySelector('[data-widget="tip"]').addEventListener('click', async () => {
        idx = (idx + 1) % TIPS.length;
        text.style.opacity = '0';
        setTimeout(() => {
          text.textContent = TIPS[idx];
          text.style.opacity = '1';
          Phone.Storage.set(TIP_KEY, idx);
        }, 200);
      });
    },

    _mountVinyl(wrap) {
      const vinyl = wrap.querySelector('[data-widget="vinyl"]');
      const disc = wrap.querySelector('.widget-vinyl-disc');
      const caption = wrap.querySelector('.widget-vinyl-caption');
      let spinning = false;
      vinyl.addEventListener('click', () => {
        spinning = !spinning;
        disc.classList.toggle('is-spinning', spinning);
        caption.textContent = spinning ? '正在转动…' : '点我转起来';
      });
    },

    unmount() {
      if (this._timeTimer) clearInterval(this._timeTimer);
      this._timeTimer = null;
    },
  };
})(window);
```

- [ ] **Step 2: 追加 css/desktop.css 的 widgets 区块**

```css
/* ============ Widgets 小组件 ============ */
.widgets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 8px 16px 16px;
}
.widget {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: var(--shadow-card);
  color: var(--text-primary);
  transition: transform var(--dur-fast) var(--ease-spring);
  cursor: pointer;
  min-height: 96px;
}
.widget:active { transform: scale(0.97); }

.widget--time { grid-column: span 2; }
.widget-time-hm {
  font-size: 40px;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--color-primary-deep);
}
.widget-time-date {
  font-size: var(--font-sm);
  color: var(--text-secondary);
  margin-top: 4px;
}

.widget--weather {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-primary);
}
.widget-weather-temp {
  font-size: var(--font-lg);
  font-weight: 500;
  color: var(--text-primary);
}

.widget--tip {
  grid-column: span 2;
}
.widget-tip-label {
  font-size: var(--font-xs);
  color: var(--text-secondary);
  letter-spacing: 1px;
}
.widget-tip-text {
  font-size: var(--font-md);
  font-weight: 500;
  margin-top: 6px;
  color: var(--color-primary-deep);
  transition: opacity 200ms ease;
}

.widget--vinyl {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.widget-vinyl-disc {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  background: radial-gradient(circle at center, var(--color-primary) 0 18%, #1a1a1a 19% 40%, var(--color-primary-deep) 41% 100%);
  position: relative;
  box-shadow: var(--shadow-soft);
}
.widget-vinyl-disc::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: var(--radius-full);
  background: repeating-radial-gradient(circle at center, transparent 0 2px, rgba(255,255,255,0.05) 2px 3px);
}
.widget-vinyl-label {
  position: absolute;
  inset: 38%;
  border-radius: var(--radius-full);
  background: var(--color-accent);
}
.widget-vinyl-disc.is-spinning {
  animation: vinyl-spin 2.4s linear infinite;
}
@keyframes vinyl-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.widget-vinyl-caption {
  font-size: var(--font-xs);
  color: var(--text-secondary);
}
```

- [ ] **Step 3: 浏览器验证**

`Phone.Widgets.mount(document.body)`：
- 时间组件显示当前 HH:MM + 中文日期，每 30 秒更新
- 天气组件显示云朵图标 + "22°"
- 今日提示组件显示一句可爱文案，点击换下一条（淡入淡出）
- 黑胶组件显示唱片，点击开始旋转，再点击停止，文案从"点我转起来"切到"正在转动…"

验证后删除临时文件。

- [ ] **Step 4: Commit**

```bash
git add js/desktop/widgets.js css/desktop.css
git commit -m "feat: 实现桌面 4 个小组件（时间/天气/今日提示/黑胶唱片）"
```

---

## Task 10: APP 图标网格 AppGrid

**Files:**
- Create: `js/desktop/app-grid.js`
- Modify: `css/desktop.css`（追加 app-grid 区块）

4 列网格，长按进入编辑模式（拖拽 / 删除 / 隐藏）。图标顺序从 Storage 读取，默认 12 个 APP。本计划只渲染图标和点击效果，**APP 内部业务在后续 Plan**——点击图标先弹"小手机还在准备中…"提示，但事件中心会记录点击事件。

- [ ] **Step 1: 实现 js/desktop/app-grid.js**

```javascript
(function (global) {
  const Phone = global.Phone || (global.Phone = {});

  const ORDER_KEY = 'appgrid:order';
  const HIDDEN_KEY = 'appgrid:hidden';

  // 12 个默认 APP（图标均为线条风 SVG，stroke-width 1.5）
  const DEFAULT_APPS = [
    { id: 'chat', name: '消息', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v12H8l-4 4z"/></svg>' },
    { id: 'moments', name: '朋友圈', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>' },
    { id: 'settings', name: '设置', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>' },
    { id: 'gallery', name: '记仇本', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/></svg>' },
    { id: 'characters', name: '角色', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>' },
    { id: 'worldbook', name: '世界书', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path d="M12 6v15"/></svg>' },
    { id: 'memory', name: '记忆', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v4M15 4v4M7 8h10v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/></svg>' },
    { id: 'wallet', name: '钱包', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v12H4z"/><circle cx="16" cy="12" r="1.5"/></svg>' },
    { id: 'shop', name: '商店', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>' },
    { id: 'memo', name: '备忘录', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>' },
    { id: 'anniversary', name: '周年纪念', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 6-7 10-7 10z"/></svg>' },
    { id: 'games', name: '游戏', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12a4 4 0 0 1 4 4 4 4 0 0 1-4 4h-1l-2-2H9l-2 2H6a4 4 0 0 1-4-4 4 4 0 0 1 4-4z"/><path d="M8 12h2M9 11v2M15 12h.01M17 13h.01"/></svg>' },
    { id: 'music', name: '音乐', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="17" r="2"/><circle cx="17" cy="15" r="2"/><path d="M9 17V5l10-2v12"/></svg>' },
  ];

  Phone.AppGrid = {
    /**
     * 挂载 APP 网格到容器
     * @param {HTMLElement} container
     */
    async mount(container) {
      const order = await this._getOrder();
      const hidden = await this._getHidden();
      const visible = order.filter(id => !hidden.includes(id) && DEFAULT_APPS.find(a => a.id === id));

      const grid = document.createElement('div');
      grid.className = 'app-grid';
      grid.dataset.editing = 'false';

      visible.forEach((id, idx) => {
        const app = DEFAULT_APPS.find(a => a.id === id);
        const cell = document.createElement('div');
        cell.className = 'app-cell';
        cell.dataset.appId = id;
        cell.dataset.index = idx;
        cell.draggable = false;
        cell.innerHTML = `
          <div class="app-icon">${app.icon}</div>
          <div class="app-name">${app.name}</div>
          <button class="app-remove" hidden aria-label="隐藏">×</button>
        `;
        grid.appendChild(cell);
      });
      container.appendChild(grid);

      this._bindInteractions(grid);
      this._grid = grid;
    },

    async _getOrder() {
      const saved = await Phone.Storage.get(ORDER_KEY);
      if (Array.isArray(saved) && saved.length) return saved;
      return DEFAULT_APPS.map(a => a.id);
    },

    async _getHidden() {
      const saved = await Phone.Storage.get(HIDDEN_KEY);
      return Array.isArray(saved) ? saved : [];
    },

    async _saveOrder(ids) {
      await Phone.Storage.set(ORDER_KEY, ids);
    },

    async _saveHidden(ids) {
      await Phone.Storage.set(HIDDEN_KEY, ids);
    },

    _bindInteractions(grid) {
      let pressTimer = null;
      let draggedCell = null;

      // 长按进入编辑模式
      grid.addEventListener('pointerdown', (e) => {
        const cell = e.target.closest('.app-cell');
        if (!cell) return;
        pressTimer = setTimeout(() => {
          this._enterEditMode(grid);
          pressTimer = null;
        }, 600);
      });
      grid.addEventListener('pointerup', () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      });
      grid.addEventListener('pointermove', () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      });

      // 点击 APP
      grid.addEventListener('click', (e) => {
        const remove = e.target.closest('.app-remove');
        if (remove) {
          this._hideApp(remove.closest('.app-cell'));
          return;
        }
        const cell = e.target.closest('.app-cell');
        if (!cell) return;
        if (grid.dataset.editing === 'true') return; // 编辑模式下不进 APP
        this._launchApp(cell.dataset.appId);
      });

      // 拖拽排序（仅编辑模式）
      grid.addEventListener('dragstart', (e) => {
        if (grid.dataset.editing !== 'true') { e.preventDefault(); return; }
        draggedCell = e.target.closest('.app-cell');
        if (draggedCell) draggedCell.classList.add('is-dragging');
      });
      grid.addEventListener('dragover', (e) => {
        if (grid.dataset.editing !== 'true') return;
        e.preventDefault();
        const target = e.target.closest('.app-cell');
        if (target && target !== draggedCell) {
          const cells = [...grid.querySelectorAll('.app-cell')];
          const from = cells.indexOf(draggedCell);
          const to = cells.indexOf(target);
          if (from < to) target.after(draggedCell);
          else target.before(draggedCell);
        }
      });
      grid.addEventListener('dragend', () => {
        if (draggedCell) draggedCell.classList.remove('is-dragging');
        this._persistOrder(grid);
        draggedCell = null;
      });
    },

    _enterEditMode(grid) {
      if (grid.dataset.editing === 'true') return;
      grid.dataset.editing = 'true';
      grid.querySelectorAll('.app-cell').forEach(c => {
        c.draggable = true;
        c.querySelector('.app-remove').hidden = false;
      });
      // 点击空白退出
      const onOutside = (e) => {
        if (e.target.closest('.app-cell') || e.target.closest('.dock-bar')) return;
        this._exitEditMode(grid);
        document.removeEventListener('click', onOutside);
      };
      setTimeout(() => document.addEventListener('click', onOutside), 0);
    },

    _exitEditMode(grid) {
      grid.dataset.editing = 'false';
      grid.querySelectorAll('.app-cell').forEach(c => {
        c.draggable = false;
        c.querySelector('.app-remove').hidden = true;
      });
    },

    async _persistOrder(grid) {
      const ids = [...grid.querySelectorAll('.app-cell')].map(c => c.dataset.appId);
      await this._saveOrder(ids);
      await Phone.EventCenter.emit('appgrid.reorder', { appId: 'appgrid', order: ids });
    },

    async _hideApp(cell) {
      const id = cell.dataset.appId;
      const hidden = await this._getHidden();
      if (!hidden.includes(id)) hidden.push(id);
      await this._saveHidden(hidden);
      cell.classList.add('is-hiding');
      setTimeout(() => cell.remove(), 200);
      await Phone.EventCenter.emit('appgrid.hide', { appId: 'appgrid', hiddenId: id });
    },

    async _launchApp(id) {
      await Phone.EventCenter.emit('appgrid.launch', { appId: id });
      const app = Phone.AppRegistry.get(id);
      if (app && typeof app.entry === 'function') {
        app.entry();
      } else {
        // 本计划阶段 APP 未实现，给友好提示
        this._showNotReady(id);
      }
    },

    _showNotReady(id) {
      const toast = document.createElement('div');
      toast.className = 'app-toast';
      toast.textContent = '小手机还在准备中…';
      document.body.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('is-visible'));
      setTimeout(() => {
        toast.classList.remove('is-visible');
        setTimeout(() => toast.remove(), 250);
      }, 1500);
    },

    unmount() {
      if (this._grid) this._grid.remove();
      this._grid = null;
    },
  };
})(window);
```

- [ ] **Step 2: 追加 css/desktop.css 的 app-grid 区块**

```css
/* ============ AppGrid APP 网格 ============ */
.app-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px 8px;
  padding: 12px 16px 24px;
}
.app-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: transform var(--dur-fast) var(--ease-spring), opacity var(--dur-fast) ease;
  position: relative;
}
.app-cell:active { transform: scale(0.92); }
.app-cell.is-dragging { opacity: 0.4; }
.app-cell.is-hiding {
  transform: scale(0.6);
  opacity: 0;
}

.app-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--bg-surface), var(--color-primary-ultralight));
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  box-shadow: var(--shadow-neu-out);
  transition: transform var(--dur-fast) var(--ease-spring);
}
.app-icon svg { width: 28px; height: 28px; }

.app-name {
  font-size: var(--font-xs);
  color: var(--text-primary);
  text-align: center;
  max-width: 64px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-remove {
  position: absolute;
  top: -4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  background: var(--color-primary-deep);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-grid[data-editing="true"] .app-cell { animation: app-wiggle 1.4s ease-in-out infinite; }
@keyframes app-wiggle {
  0%, 100% { transform: rotate(-2deg); }
  50%      { transform: rotate(2deg); }
}

.app-toast {
  position: fixed;
  bottom: 120px;
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  background: var(--bg-surface);
  color: var(--text-primary);
  padding: 10px 20px;
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-float);
  opacity: 0;
  transition: opacity 250ms ease, transform 250ms var(--ease-spring);
  z-index: 9000;
  font-size: var(--font-sm);
}
.app-toast.is-visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
```

- [ ] **Step 3: 浏览器验证**

`Phone.AppGrid.mount(document.body)`（需要先加载 storage / event-center / app-registry）：
- 4 列网格显示 12 个 APP 图标
- 图标线条风，下方显示名称
- 点击图标弹出"小手机还在准备中…"toast，1.5s 后消失
- 长按 0.6s 进入编辑模式：图标开始轻微晃动，右上角出现 × 按钮
- 编辑模式下拖拽图标可重排，松手后顺序持久化（刷新页面后保持）
- 点击 × 隐藏图标，刷新后不再显示
- 点击空白退出编辑模式

验证后删除临时文件。

- [ ] **Step 4: Commit**

```bash
git add js/desktop/app-grid.js css/desktop.css
git commit -m "feat: 实现 APP 网格（4列 + 长按编辑 + 拖拽 + 隐藏）"
```

---

## Task 11: Dock 栏 + 页面指示器

**Files:**
- Create: `js/desktop/dock.js`
- Modify: `css/desktop.css`（追加 dock 区块）

固定 4 个图标（默认：消息 / 设置 / 角色 / 世界书），不显示名字，毛玻璃背景，可从设置自定义（本计划只读取配置，自定义 UI 在 Plan 3）。

- [ ] **Step 1: 实现 js/desktop/dock.js**

```javascript
(function (global) {
  const Phone = global.Phone || (global.Phone = {});

  const DOCK_KEY = 'dock:apps';
  const PAGE_KEY = 'desktop:currentPage';

  // 默认 Dock 4 个 APP（从 DEFAULT_APPS 取图标，避免重复定义）
  const DEFAULT_DOCK = ['chat', 'settings', 'characters', 'worldbook'];

  // 内联图标（与 AppGrid DEFAULT_APPS 保持一致风格，本文件自包含避免耦合）
  const ICONS = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v12H8l-4 4z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
    characters: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>',
    worldbook: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path d="M12 6v15"/></svg>',
  };

  Phone.Dock = {
    async mount(container) {
      const dockIds = await this._getDockApps();
      const currentPage = (await Phone.Storage.get(PAGE_KEY)) || 0;

      const wrap = document.createElement('div');
      wrap.className = 'dock-wrap';
      wrap.innerHTML = `
        <div class="dock-bar">
          ${dockIds.map(id => `
            <button class="dock-icon" data-app-id="${id}" aria-label="${id}">
              ${ICONS[id] || ''}
            </button>
          `).join('')}
        </div>
        <div class="page-indicator">
          <span class="page-dot ${currentPage === 0 ? 'is-active' : ''}" data-page="0"></span>
          <span class="page-dot ${currentPage === 1 ? 'is-active' : ''}" data-page="1"></span>
        </div>
      `;
      container.appendChild(wrap);

      this._bind(wrap);
      this._wrap = wrap;
    },

    async _getDockApps() {
      const saved = await Phone.Storage.get(DOCK_KEY);
      if (Array.isArray(saved) && saved.length === 4) return saved;
      return DEFAULT_DOCK;
    },

    async _saveDockApps(ids) {
      if (!Array.isArray(ids) || ids.length !== 4) {
        throw new Error('Dock 必须是 4 个 APP');
      }
      await Phone.Storage.set(DOCK_KEY, ids);
    },

    _bind(wrap) {
      wrap.addEventListener('click', async (e) => {
        const icon = e.target.closest('.dock-icon');
        if (icon) {
          const id = icon.dataset.appId;
          await Phone.EventCenter.emit('dock.launch', { appId: id });
          // 复用 AppGrid 的启动逻辑（如果可用）
          if (Phone.AppGrid && typeof Phone.AppGrid._launchApp === 'function') {
            Phone.AppGrid._launchApp(id);
          }
          return;
        }
        const dot = e.target.closest('.page-dot');
        if (dot) {
          const page = Number(dot.dataset.page);
          await Phone.Storage.set(PAGE_KEY, page);
          wrap.querySelectorAll('.page-dot').forEach(d => d.classList.remove('is-active'));
          dot.classList.add('is-active');
          await Phone.EventCenter.emit('desktop.pageChange', { appId: 'desktop', page });
        }
      });
    },

    unmount() {
      if (this._wrap) this._wrap.remove();
      this._wrap = null;
    },
  };
})(window);
```

- [ ] **Step 2: 追加 css/desktop.css 的 dock 区块**

```css
/* ============ Dock 底部栏 ============ */
.dock-wrap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.dock-bar {
  display: flex;
  justify-content: space-around;
  align-items: center;
  width: 100%;
  padding: 10px 16px;
  border-radius: var(--radius-xl);
  background: var(--bg-overlay);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: var(--shadow-card);
}
.dock-icon {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--bg-surface), var(--color-primary-ultralight));
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  box-shadow: var(--shadow-neu-out);
  transition: transform var(--dur-fast) var(--ease-spring);
}
.dock-icon:active { transform: scale(0.92); }
.dock-icon svg { width: 26px; height: 26px; }

.page-indicator {
  display: flex;
  gap: 8px;
}
.page-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-primary-ultralight);
  transition: background var(--dur-fast) ease, transform var(--dur-fast) var(--ease-spring);
  cursor: pointer;
}
.page-dot.is-active {
  background: var(--color-primary);
  transform: scale(1.3);
}
```

- [ ] **Step 3: 浏览器验证**

`Phone.Dock.mount(document.body)`：
- 底部出现毛玻璃 Dock 栏，4 个图标（消息/设置/角色/世界书），无名字
- Dock 圆角，背景模糊
- 下方 2 个圆点指示器，第 1 个高亮
- 点击第 2 个圆点高亮切换，刷新后保持
- 点击 Dock 图标触发 toast "小手机还在准备中…"（复用 AppGrid 启动）

验证后删除临时文件。

- [ ] **Step 4: Commit**

```bash
git add js/desktop/dock.js css/desktop.css
git commit -m "feat: 实现 Dock 栏 + 页面指示器"
```

---

## Task 12: 桌面总装 Desktop + 壁纸系统

**Files:**
- Create: `js/desktop/desktop.js`
- Modify: `css/desktop.css`（追加 desktop 容器区块）

总装启动流程：Boot → Lockscreen → Desktop（状态栏 / Widgets / AppGrid / Dock）。壁纸从 Storage 读取，支持 base64 / URL / 默认渐变三种。

- [ ] **Step 1: 实现 js/desktop/desktop.js**

```javascript
(function (global) {
  const Phone = global.Phone || (global.Phone = {});

  const KEY_THEME = 'system:theme';
  const KEY_WALLPAPER = 'system:wallpaper';
  const KEY_SYSTEM_NAME = 'system:name';

  Phone.Desktop = {
    async init() {
      // 1. 应用主题
      const theme = (await Phone.Storage.get(KEY_THEME)) || 'lavender';
      document.documentElement.setAttribute('data-theme', theme);

      // 2. 应用壁纸
      const wallpaper = await Phone.Storage.get(KEY_WALLPAPER);
      this._applyWallpaper(wallpaper);

      // 3. 启动动画
      await Phone.Boot.show(1800);

      // 4. 锁屏
      await Phone.Lockscreen.show();

      // 5. 进入桌面
      await this._enterHome();
    },

    async _enterHome() {
      const frame = document.querySelector('.phone-frame') || this._ensureFrame();
      frame.innerHTML = '';

      // 状态栏
      await Phone.StatusBar.mount(frame);

      // 滚动容器装 widgets + app-grid
      const scroll = document.createElement('div');
      scroll.className = 'desktop-scroll';
      frame.appendChild(scroll);

      await Phone.Widgets.mount(scroll);
      await Phone.AppGrid.mount(scroll);

      // Dock 固定底部
      await Phone.Dock.mount(frame);

      // 进入动画
      frame.classList.add('is-entered');
    },

    _ensureFrame() {
      let frame = document.querySelector('.phone-frame');
      if (!frame) {
        frame = document.createElement('div');
        frame.className = 'phone-frame';
        document.body.appendChild(frame);
      }
      return frame;
    },

    _applyWallpaper(wallpaper) {
      const frame = document.querySelector('.phone-frame') || this._ensureFrame();
      if (!wallpaper) {
        frame.style.background = 'var(--wallpaper-default)';
        return;
      }
      // URL 模式
      if (typeof wallpaper === 'string' && /^https?:\/\//.test(wallpaper)) {
        frame.style.background = `url("${wallpaper}") center/cover`;
        return;
      }
      // base64 模式
      if (typeof wallpaper === 'string' && wallpaper.startsWith('data:image')) {
        frame.style.background = `url("${wallpaper}") center/cover`;
        return;
      }
      // CSS 渐变 / 颜色
      if (typeof wallpaper === 'string') {
        frame.style.background = wallpaper;
      }
    },

    async setTheme(theme) {
      const valid = ['lavender', 'pink', 'honey', 'sky'];
      if (!valid.includes(theme)) throw new Error(`未知主题: ${theme}`);
      document.documentElement.setAttribute('data-theme', theme);
      await Phone.Storage.set(KEY_THEME, theme);
      await Phone.EventCenter.emit('desktop.themeChange', { appId: 'desktop', theme });
    },

    async setWallpaper(wallpaper) {
      await Phone.Storage.set(KEY_WALLPAPER, wallpaper);
      this._applyWallpaper(wallpaper);
      await Phone.EventCenter.emit('desktop.wallpaperChange', { appId: 'desktop', wallpaper });
    },

    async getSystemName() {
      return (await Phone.Storage.get(KEY_SYSTEM_NAME)) || '小手机';
    },

    async setSystemName(name) {
      await Phone.Storage.set(KEY_SYSTEM_NAME, name);
      await Phone.EventCenter.emit('desktop.nameChange', { appId: 'desktop', name });
    },
  };
})(window);
```

- [ ] **Step 2: 追加 css/desktop.css 的 desktop 容器区块**

```css
/* ============ Desktop 容器 ============ */
.desktop-scroll {
  position: absolute;
  top: 48px;        /* 给状态栏留位置 */
  left: 0;
  right: 0;
  bottom: 120px;    /* 给 dock 留位置 */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 24px;
}
.desktop-scroll::-webkit-scrollbar { width: 0; }

.phone-frame.is-entered .desktop-scroll {
  animation: pop-in var(--dur-base) var(--ease-spring) both;
}
```

- [ ] **Step 3: 浏览器验证（联合启动流程）**

临时 index.html 引入所有脚本，调用 `Phone.Desktop.init()`：
- 启动动画显示 → 渐出
- 锁屏出现 → 输入 `0326` → 解锁
- 进入桌面：状态栏 + 4 个 widget + 12 个 APP 图标网格 + 底部 Dock + 2 圆点
- 壁纸默认显示薰衣草渐变
- 切换 `data-theme="pink"` 全局变色
- 调用 `Phone.Desktop.setWallpaper('https://picsum.photos/600/1200')` 壁纸切换为网络图片
- 调用 `Phone.Desktop.setTheme('honey')` 切换奶茶主题
- 重新加载页面，主题/壁纸保持

验证后删除临时文件。

- [ ] **Step 4: Commit**

```bash
git add js/desktop/desktop.js css/desktop.css
git commit -m "feat: 实现桌面总装（Boot→Lock→Home 流程 + 壁纸/主题切换）"
```

---

## Task 13: 入口 HTML + PWA

**Files:**
- Create: `index.html`
- Create: `manifest.json`
- Create: `service-worker.js`

- [ ] **Step 1: 创建 index.html**

注意 script 顺序必须严格遵守「模块加载顺序」（见文件结构总览）。

```html
<!DOCTYPE html>
<html lang="zh-CN" data-theme="lavender">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#9B7FD4">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <title>小手机</title>
  <link rel="manifest" href="manifest.json">
  <link rel="stylesheet" href="css/theme.css?v=20260704">
  <link rel="stylesheet" href="css/base.css?v=20260704">
  <link rel="stylesheet" href="css/desktop.css?v=20260704">
</head>
<body>
  <div class="phone-frame"></div>

  <!-- 核心层（顺序敏感，不可调整） -->
  <script src="js/core/storage.js?v=20260704"></script>
  <script src="js/core/event-center.js?v=20260704"></script>
  <script src="js/core/app-registry.js?v=20260704"></script>

  <!-- 桌面层 -->
  <script src="js/desktop/boot.js?v=20260704"></script>
  <script src="js/desktop/lockscreen.js?v=20260704"></script>
  <script src="js/desktop/status-bar.js?v=20260704"></script>
  <script src="js/desktop/widgets.js?v=20260704"></script>
  <script src="js/desktop/app-grid.js?v=20260704"></script>
  <script src="js/desktop/dock.js?v=20260704"></script>
  <script src="js/desktop/desktop.js?v=20260704"></script>

  <!-- 启动 -->
  <script>
    window.addEventListener('DOMContentLoaded', () => {
      // 注册 service worker（生产环境）
      if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('service-worker.js?v=20260704').catch(() => {});
      }
      // 启动桌面
      window.Phone.Desktop.init().catch((e) => {
        console.error('[Desktop] 启动失败:', e);
      });
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: 创建 manifest.json**

```json
{
  "name": "小手机",
  "short_name": "小手机",
  "description": "温柔软萌极简风虚拟手机系统",
  "start_url": "./index.html",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#F5F0FA",
  "theme_color": "#9B7FD4",
  "icons": [
    {
      "src": "icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

> **注：** `icon-192.png` 和 `icon-512.png` 暂用占位路径。如果用户希望本计划包含真实图标，需要另外设计 PNG 资源（本计划范围外）。缺失图标不影响 PWA 基本功能，浏览器会忽略加载失败的图标条目。

- [ ] **Step 3: 创建 service-worker.js**

```javascript
const CACHE_NAME = 'phone-shell-v1';
const ASSETS = [
  './',
  './index.html',
  './css/theme.css',
  './css/base.css',
  './css/desktop.css',
  './js/core/storage.js',
  './js/core/event-center.js',
  './js/core/app-registry.js',
  './js/desktop/boot.js',
  './js/desktop/lockscreen.js',
  './js/desktop/status-bar.js',
  './js/desktop/widgets.js',
  './js/desktop/app-grid.js',
  './js/desktop/dock.js',
  './js/desktop/desktop.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        // 只缓存同源 GET
        if (resp.ok && new URL(event.request.url).origin === self.location.origin) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
```

- [ ] **Step 4: 浏览器完整验证**

打开 `index.html`（推荐用本地静态服务器，如 `npx serve .` 或 VSCode Live Server）：
- 启动动画 → 锁屏（输 `0326`）→ 桌面 一气呵成
- 控制台无报错
- 断网后刷新页面仍能进入桌面（PWA 缓存生效）
- 控制台执行 `await Phone.EventCenter.getLog()` 能看到所有 `appgrid.launch` / `dock.launch` / `desktop.themeChange` 等事件已持久化

- [ ] **Step 5: Commit**

```bash
git add index.html manifest.json service-worker.js
git commit -m "feat: 添加入口 HTML + PWA（manifest + service worker）"
```

---

## Task 14: 端到端人工验证（按 spec 第 18 节格式）

**Files:** 无文件改动，仅验证。

按 spec 第 18 节的测试方法执行，每个发现的问题按以下格式记录到 `docs/superpowers/plans/2026-07-04-phone-shell-foundation-qa.md`（如无问题则不创建文件）：

```
【问题】一句话描述
【场景】我做了什么操作触发的
【预期】我以为会怎样
【实际】实际发生了什么
【严重度】卡死/影响体验/小瑕疵
```

- [ ] **Step 1: 新用户视角**

清空浏览器数据 → 打开 index.html：
- 第一眼看到启动动画 + 锁屏，是否能立刻知道怎么开始？
- 提示"输入密码解锁"是否清晰？
- 解锁后桌面是否一目了然？
- 默认密码 `0326` 是否需要在某处提示？（预期：不需要明文提示，但设置页应有重置入口——本计划暂未实现设置页，留待 Plan 3）

- [ ] **Step 2: 核心功能逐项验证**

| 功能点 | 预期 |
|--------|------|
| 启动动画 | 显示 1.8s，"小手机正在醒来…"，呼吸图标 + 跳点 |
| 锁屏密码正确 | `0326` → 渐出解锁 |
| 锁屏密码错误 | "嘿嘿，不对哦"，圆点清空，1.5s 后错误提示消失 |
| 锁屏退格 | 长按退格能逐位删除 |
| 状态栏 | 顶部左右胶囊，左胶囊有线条图标，30s 轮换 |
| 时间组件 | 实时 HH:MM + 中文日期，每 30s 更新 |
| 天气组件 | 云朵图标 + "22°" |
| 今日提示 | 随机可爱文案，点击换下一条 |
| 黑胶唱片 | 点击旋转，再点击停止 |
| APP 网格 | 4 列 12 图标，线条风 |
| 长按 APP | 0.6s 进入编辑模式，晃动 + × 按钮 |
| 拖拽排序 | 编辑模式拖拽，松手持久化 |
| 隐藏 APP | 点 × 隐藏，刷新不恢复 |
| 点击 APP | 弹"小手机还在准备中…" |
| Dock | 4 图标无名字，毛玻璃，点击触发 toast |
| 页面指示器 | 2 圆点，可切换，持久化 |
| 主题切换 | `Phone.Desktop.setTheme('pink')` 全局变色 |
| 壁纸 URL | `Phone.Desktop.setWallpaper('https://...')` 切换 |
| 壁纸 base64 | 上传图片转 base64 后调用切换 |
| 事件持久化 | `Phone.EventCenter.getLog()` 能看到所有事件 |

- [ ] **Step 3: 边界情况**

- 断网：刷新页面能否进入桌面（依赖 PWA 缓存）
- 快速操作：启动动画期间快速点击屏幕，是否会出现异常
- 长按不松：长按 APP 5 秒不松手，编辑模式是否正常进入
- 横屏：横屏下布局是否还能看（不强求完美，但不能崩）
- 极小屏幕：iPhone SE 375px 宽，图标是否过小
- 极大屏幕：iPad 768px 宽，是否被 max-width 600px 居中

- [ ] **Step 4: UI 细节**

- 检查所有图标 stroke-width 是否 1.5
- 检查是否有任何硬编码色值（grep `#[0-9a-fA-F]{3,6}` 和 `rgba(0,0,0` 在 css 中）
- 检查是否有直角容器（grep `border-radius: 0` 或缺失 radius）
- 检查阴影是否都是同色系（无 `rgba(0,0,0,x)`）
- 检查按钮点击是否有 scale(0.97) 反馈
- 检查文案是否可爱（无"确定""取消"等干巴巴词，应"好哒""先不要啦"——本计划范围主要在锁屏错误提示和启动文案）

- [ ] **Step 5: 修复发现的问题**

对 Step 2-4 发现的每个问题，回到对应 Task 修复并重新验证。每修一个 commit 一次。

- [ ] **Step 6: 最终冒烟测试**

清空浏览器数据 → 打开 index.html → 走一遍完整流程 → 控制台执行：

```javascript
await Phone.EventCenter.getLog()
```

确认能看到至少包含 `appgrid.launch` / `dock.launch` / `desktop.themeChange` 等事件类型的事件流。这些事件就是 Plan 2 的 AI 聊天要读取的数据源。

- [ ] **Step 7: Commit QA 报告（如有）**

```bash
git add docs/superpowers/plans/2026-07-04-phone-shell-foundation-qa.md
git commit -m "test: 添加手机底座 QA 报告"
```

---

## Self-Review

**1. Spec 覆盖检查（仅 Phase 1-4 范围内）：**

| Spec 要求 | 对应 Task |
|----------|----------|
| §2 模块化拆分 / IIFE + 全局对象 | Task 1 (loadModule) + 所有模块文件 |
| §2.3 APP 注册表 | Task 5 |
| §2.4 事件中心 | Task 4 |
| §3.1 壁纸（默认薰衣草渐变 / 上传 / URL） | Task 12 (`setWallpaper` 三种模式) |
| §3.2 状态胶囊 + 9 个线条 SVG | Task 8 |
| §3.3 4 个小组件 | Task 9 |
| §3.4 4 列网格 + 长按编辑 | Task 10 |
| §3.5 Dock 4 图标无名字 + 毛玻璃 | Task 11 |
| §3.6 页面指示器 2 圆点 | Task 11 |
| §3.7 锁屏 4 位密码 + 默认 0326 + "嘿嘿，不对哦" + 壁纸/头像/文案自定义 | Task 7 |
| §3.8 启动动画 "小手机正在醒来…" | Task 6 |
| §7 CSS 变量 + 4 套主题 + 禁止硬编码 | Task 2 |
| §10.2 PWA manifest + service worker | Task 13 |
| §10.7 不用 ES Module 避免 CORS | 全程 IIFE |
| §15 自适应（max-width 600 + clamp） | base.css (`phone-frame`) |
| §11 自由度原则（不写死壁纸/主题/Dock/系统名） | Task 12 (setTheme/setWallpaper/setSystemName) + Task 11 (Dock 配置) |
| §12 文案可爱 | Task 6/7/9/10 文案 |
| §13 图片 base64 / URL 双模式 | Task 12 (`setWallpaper` 同时支持) |

**本计划不覆盖（属后续 Plan 范围，已显式声明）：**
- §4 APP 列表内部业务（Plan 2-N）
- §5 消息中心（Plan 2）
- §6 设置中心 UI（Plan 3，但本计划已暴露 `setTheme` / `setWallpaper` 等接口供其调用）
- §8 AI 逻辑第一人称规则（Plan 2 起强制，本计划无 AI 文件）
- §9 记忆隔离（Plan 4，本计划 EventCenter 已预留事件流接口）
- §17 核心函数记录到记忆系统（Plan 4 记忆 APP 实现后回填）

**2. 占位符扫描：**
- manifest.json 的 icon 路径（`icon-192.png` / `icon-512.png`）——已明确标注是占位，缺失不影响 PWA 基本功能，浏览器会忽略加载失败的条目。这是合理的资源依赖声明，不是代码占位符。
- 其余无 TBD / TODO / "implement later" / "add appropriate error handling" 等模式。

**3. 类型一致性检查：**
- `Phone.Storage.set(key, value)` / `get(key, defaultValue)` / `delete(key)` / `clear()` / `keys()` / `getStorageEstimate()` —— Task 3 定义，Task 4/7/8/9/10/11/12 调用，签名一致。
- `Phone.EventCenter.emit(type, payload)` / `on(type, cb)` / `off(type, cb)` / `getLog(filter)` / `markRead(id)` / `clearLog()` —— Task 4 定义，Task 10/11/12 调用，签名一致。
- `Phone.AppRegistry.register(config)` / `get(id)` / `list()` / `unregister(id)` —— Task 5 定义，Task 10 调用 `get(id)`，签名一致。
- `Phone.Lockscreen.checkPassword(input, correct)` —— Task 7 定义且测试，纯函数。
- `Phone.Desktop.setTheme(theme)` / `setWallpaper(wallpaper)` / `setSystemName(name)` —— Task 12 定义，Plan 3 设置页将调用，签名稳定。
- 事件 payload 一律包含 `appId` 字段（Task 4 测试断言），Task 10/11/12 emit 时都遵守了。
- CSS 变量名（`--color-primary` 等）Task 2 定义，所有 CSS 模块统一引用，无拼写分歧。

**4. 加载顺序风险：**
Task 13 的 index.html 严格按依赖顺序加载，已与文件结构总览的「模块加载顺序」一一对应。任何新增模块必须更新该顺序表，executor 在实现新 Plan 时需注意。

---

## 执行交接

计划已保存到 `docs/superpowers/plans/2026-07-04-phone-shell-foundation.md`。两种执行方式可选：

**1. Subagent-Driven（推荐）** —— 我为每个 Task 派一个全新的 subagent 执行，Task 之间有 review checkpoint，迭代快，主上下文干净。

**2. Inline Execution** —— 在当前会话用 executing-plans 技能批量执行，遇到 checkpoint 暂停给你 review。

**选哪种？**
