# 小手机系统 技术架构文档

## 一、技术栈

- **HTML5 + CSS3 + 原生 JavaScript（ES2020+）**
- **不使用框架**（React/Vue 等），不使用构建工具
- **不使用 ES Module**：用 IIFE + 全局对象 `window.Phone`，避免本地双击 file:// 打开白屏
- **存储**：IndexedDB（主存储）+ localStorage（轻量配置）
- **AI**：fetch + ReadableStream 流式调用 OpenAI 兼容接口
- **PWA**：manifest.json + service-worker.js
- **字体**：PingFang SC / HarmonyOS Sans SC（系统字体降级）

## 二、目录结构

```
/workspace
├── index.html                       # 入口（加载所有 CSS/JS，挂载根节点）
├── manifest.json                    # PWA 清单
├── service-worker.js                # 离线缓存
├── README.md
├── css/
│   ├── theme.css                    # 全局主题变量（honey/pink/sky）
│   ├── desktop.css                  # 桌面样式
│   ├── lockscreen.css               # 锁屏样式
│   ├── chat.css                     # 消息中心样式
│   ├── settings.css                 # 设置中心样式
│   ├── common.css                   # 通用组件样式（按钮/卡片/输入框/导航栏）
│   └── apps.css                     # 其他 APP 共用样式
├── js/
│   ├── core/                        # 底座层
│   │   ├── storage.js               # IndexedDB 封装
│   │   ├── event-center.js          # 事件中心（订阅/发布/落库）
│   │   ├── app-registry.js          # APP 注册表
│   │   ├── ai-client.js             # 全局 AI 请求层（流式/错误/兜底）
│   │   ├── icon-library.js          # 线条风 SVG 图标库
│   │   └── utils.js                 # 工具函数（dom/时间/格式化/随机）
│   ├── desktop/                     # 桌面层
│   │   ├── boot.js                  # 启动动画
│   │   ├── lockscreen.js            # 锁屏
│   │   ├── status-bar.js            # 顶部状态栏
│   │   ├── widgets.js               # 4 个小组件
│   │   ├── app-grid.js              # APP 图标网格
│   │   ├── dock.js                  # Dock 栏
│   │   └── desktop.js               # 桌面总装
│   ├── apps/
│   │   ├── chat/                    # 消息中心
│   │   │   ├── chat.js
│   │   │   ├── conversation.js
│   │   │   ├── chat-settings.js
│   │   │   ├── message-renderer.js
│   │   │   ├── input-bar.js
│   │   │   └── chat-ai.js           # 消息中心 AI 说明书（第一人称）
│   │   ├── settings/
│   │   │   ├── settings.js
│   │   │   ├── personalization.js
│   │   │   ├── ai-config.js
│   │   │   ├── notifications.js
│   │   │   ├── lock-security.js
│   │   │   └── data.js
│   │   ├── moments/moments.js       # 朋友圈
│   │   ├── gallery/gallery.js       # 记仇本
│   │   ├── characters/characters.js # 角色
│   │   ├── worldbook/worldbook.js   # 世界书
│   │   ├── memory/memory.js         # 记忆系统
│   │   ├── wallet/wallet.js         # 钱包
│   │   ├── shop/shop.js             # 商店
│   │   ├── memo/memo.js             # 备忘录
│   │   ├── anniversary/anniversary.js # 周年纪念
│   │   ├── games/games.js           # 游戏中心
│   │   └── music/music.js           # 音乐
└── .trae/documents/
    ├── PRD.md
    └── technical-architecture.md
```

## 三、核心架构

### 3.1 全局命名空间

```javascript
window.Phone = {
  Storage,        // IndexedDB 封装（CRUD + 导出导入）
  EventCenter,    // 事件中心（emit/on/once + 落库）
  AppRegistry,    // APP 注册表（register/get/list）
  AIClient,       // AI 请求层（streamChat/sendMessage）
  IconLibrary,    // SVG 图标库
  Utils,          // 工具函数
  Router,         // 简易页面路由（push/back）
  Notify,         // 站内通知（角标/红点）
  State,          // 全局响应式状态（主题/当前角色等）
};
```

### 3.2 核心流程

```
APP 里发生事件
   ↓
EventCenter.emit(type, data)
   ↓
事件落 IndexedDB events 表
   ↓
消息中心可见 + 桌面角标更新
   ↓
AI 聊天时按需查询 events 表并提及
```

APP 之间禁止直接互调，全部走 EventCenter。

### 3.3 APP 注册表

每个 APP 启动时调用 `AppRegistry.register(spec)`：

```javascript
{
  id: 'chat',
  name: '消息',
  icon: 'icon-chat',          // IconLibrary 中的 key
  color: '--color-primary',
  entry: () => Phone.Chat.open(),
  events: ['message_received', 'message_sent', 'chat_mode_changed'],
  settings: [
    { key: 'bubbleStyle', label: '气泡样式', type: 'select', options: [...] }
  ],
  aiSpec: 'js/apps/chat/chat-ai.js'  // AI 说明书文件
}
```

桌面通过 `AppRegistry.list()` 动态渲染图标，不写死。

### 3.4 事件中心

```javascript
EventCenter.emit(type, data)        // 触发 + 落库 + 通知订阅者
EventCenter.on(type, handler)       // 订阅
EventCenter.once(type, handler)
EventCenter.off(type, handler)
EventCenter.query(filter)           // 查询历史事件（AI 用）
```

事件结构：
```javascript
{ id, type, sourceApp, data, createdAt, read }
```

### 3.5 AI 请求层（全局）

`Phone.AIClient` 只负责：
- 请求发送（fetch + ReadableStream）
- 接口选择（按当前配置）
- 报错处理（友好提示 + 重试）
- 通用记忆格式
- 兜底回复

每个 APP 的 AI 逻辑放在自己的 `xxx-ai.js` 文件里，第一人称编写，AI 自称"我"。

### 3.6 记忆隔离

- `memories` 表按 `characterId` 索引
- 切换角色时 `State.currentCharacterId` 变化
- 所有 AI prompt 组装时只查询当前角色的记忆
- A 角色绝对无法读取 B 角色记忆

## 四、数据模型（IndexedDB）

### 4.1 表（Object Stores）

| Store | 主键 | 索引 |
|-------|------|------|
| settings | key | - |
| characters | id | createdAt |
| worldbooks | id | - |
| conversations | id | characterId, updatedAt |
| messages | id | conversationId, createdAt |
| memories | id | characterId, type, createdAt |
| grudges | id | characterId, forgiven, createdAt |
| moments | id | authorId, createdAt |
| wallet | key (单例 'main') | - |
| transactions | id | createdAt |
| shop | id | category |
| inventory | id | characterId, itemId |
| music | id | - |
| playlists | id | - |
| memos | id | completed, remindAt |
| anniversaries | id | date |
| events | id | type, sourceApp, createdAt, read |
| notifications | id | read, createdAt |

### 4.2 默认数据（首启种子）

- settings：theme=honey, wallpaper=默认奶黄渐变, fontSize=base, dock=[chat,settings,characters,worldbook], ...
- characters：1 个默认角色（可后续在设置改）
- wallet：userBalance=10000, aiBalance=5000
- shop：3-5 个示例商品（用户可改/删）
- 默认密码：0326

## 五、UI 主题系统

### 5.1 CSS 变量（必须用，禁止硬编码）

```css
:root {
  --bg-base, --bg-surface, --bg-hover,
  --color-primary, --color-primary-light, --color-primary-ultralight, --color-primary-deep,
  --color-accent, --color-accent-light,
  --text-primary, --text-secondary, --text-placeholder,
  --shadow-soft, --shadow-card, --shadow-float, --shadow-neu-out, --shadow-neu-in,
  --radius-sm: 10px, --radius-md: 16px, --radius-lg: 20px, --radius-xl: 28px, --radius-full: 999px
}
```

### 5.2 三套主题

```css
[data-theme="honey"] { /* 奶黄：#FFE9B0 / #FFD66E / 棕黑 #4A3C28 */ }
[data-theme="pink"]   { /* 粉色 */ }
[data-theme="sky"]    { /* 蓝色 */ }
```

通过 `<html data-theme="honey">` 切换，`Phone.State` 监听并同步存储。

### 5.3 自适应

- max-width: 600px 居中
- 用 `clamp()` 做尺寸兜底
- 用 `dvh` 适配软键盘
- 图标/间距按屏幕宽度等比缩放

## 六、关键实现要点

### 6.1 流式 AI 输出

```javascript
const resp = await fetch(endpoint, { method:'POST', headers, body: JSON.stringify({stream:true,...}), signal });
const reader = resp.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // 解析 SSE: data: {...}\n\n
  // 取 delta.content 逐字追加到当前消息 DOM
}
```

### 6.2 虚拟滚动（长聊天）

- 容器固定高度，只渲染可视区域 ± buffer
- 滚动到顶部加载更早消息
- 使用 IntersectionObserver 检测边缘

### 6.3 软键盘

```css
.app-shell { height: 100dvh; }
```
```javascript
navigator.virtualKeyboard?.overlaysContent = true;
```

### 6.4 PWA

- manifest.json 声明 name/icons/theme_color/display:standalone
- service-worker.js 缓存 css/js/img，stale-while-revalidate
- 注册：`navigator.serviceWorker.register('service-worker.js')`

## 七、开发顺序（七棒）

1. **底座**：theme.css / storage / event-center / app-registry / ai-client / icon-library / utils
2. **启动**：boot / lockscreen / status-bar
3. **桌面组件**：widgets / app-grid / dock
4. **桌面总装**：desktop.js + index.html + manifest + sw
5. **消息中心**：chat 全套（含 AI 说明书）
6. **设置中心**：settings 全套
7. **其他 APP**：角色 / 世界书 / 记忆 / 记仇本 / 钱包 / 商店 / 朋友圈 / 备忘录 / 周年 / 游戏 / 音乐

每棒完成即可在浏览器打开 index.html 验证。

## 八、AI 逻辑编写规则

- 所有 AI 相关文件**第一人称**编写，AI 自称"我"
- 注释示例：`// 我会根据用户的输入生成回复`
- 全局 AI 只管请求/报错/记忆格式/兜底
- 改某 APP 的 AI 逻辑只修该 APP 自己的 `xxx-ai.js`

## 九、自由度实现

- 所有"默认值"集中在 `Storage.getDefault('settings')` 等单点
- 桌面图标顺序、Dock、主题、壁纸、角色、商品、纪念日、世界书等全部从存储读取
- 设置页提供完整 CRUD UI

## 十、避雷清单

| 风险 | 对策 |
|------|------|
| ES Module 双击白屏 | 用 IIFE + 全局对象 |
| IndexedDB 配额 | navigator.storage.estimate() 检查 + 导出功能 |
| base64 占空间 | 提供 URL 模式选项 |
| 长聊天卡顿 | 虚拟滚动 |
| 软键盘遮挡 | dvh + scrollIntoView |
| CSS 缓存 | 文件名加版本号 `?v=20260704` |
| 浏览器清数据 | 提示用户定期导出 |
| 流式中断 | try/catch + 重试按钮 |
