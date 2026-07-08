# 小手机系统架构

## 目录结构

```
/workspace/
├── index.html
├── css/
│   ├── theme.css              # CSS变量槽位 + 主题切换机制 + 通用类；不存具体色值
│   ├── base.css               # 字体、重置、通用布局
│   ├── animations.css         # 公用动画
│   └── app-surfaces.css       # APP页面容器/表面层/背景适配（跨APP公共外观，不放组件行为）
├── core/
│   ├── storage.js             # 存储统一入口
│   ├── storage-keys.js        # 所有存储键常量，唯一来源
│   ├── storage-manager.js     # IndexedDB/localStorage 读写封装，角色隔离自动注入
│   ├── events.js              # 事件中心（pub/sub），不包含通知判断逻辑
│   ├── notifications.js       # 通知判断层：总开关/分APP开关/免打扰/去重合并/分发
│   ├── router.js              # APP路由
│   ├── theme.js               # 主题切换（从 theme-presets.js 取色值，应用到 theme.css 变量槽位）
│   ├── app-bg.js              # 背景系统（桌面/锁屏/APP单独背景）
│   ├── lock.js                # 锁屏状态管理
│   ├── ui.js                  # 公用UI组件的行为与结构
│   ├── config.js              # 设置统一出口（默认值+用户覆盖值合并）
│   └── inbox.js               # 消息/事件汇聚数据层，用户可见事件入口 + AI可读事件入口
├── js/
│   └── ai/
│       ├── ai-client.js       # API请求、流式、轮换、模型选择
│       ├── ai-context.js      # 拼装上下文（记忆+角色+inbox事件+当前对话），事件走inbox入口
│       ├── ai-events.js       # 监听事件中心，筛选/映射为AI可感知事件；不另建事件存储
│       ├── ai-memory.js       # 记忆CRUD+压缩，角色隔离
│       ├── ai-fallback.js     # 全挂/超时/报错降级
│       └── ai-spec.js         # 各APP注册AI行为指令
├── desktop/
│   ├── boot.js                # 启动/加载页
│   ├── lockscreen.js          # 锁屏
│   ├── status-bar.js          # 顶部状态胶囊
│   ├── widgets.js             # 小组件
│   ├── app-grid.js            # APP图标网格
│   ├── dock.js                # Dock栏
│   └── desktop.js             # 桌面主控
├── data/
│   ├── apps-registry.js       # APP静态注册信息（id/name/icon/entry/category/events/aiSpec/默认桌面Dock标记）
│   ├── theme-presets.js       # 6套主题色值，唯一来源
│   ├── default-settings.js    # 全局设置默认值
│   └── schemas.js             # 数据校验规则
├── apps/
│   ├── chat/                  # 消息中心UI层，底层数据走 inbox
│   ├── settings/
│   └── ...
└── assets/
    ├── icons/
    └── wallpapers/
```

## 1. 事件流

```
APP事件
  → core/events.js（事件中心，唯一入口）
    → core/notifications.js（通知判断层）
      → 总开关判断
      → 分APP开关判断
      → 免打扰判断
      → 去重/合并
      → 分发：横幅 / 桌面提示 / 通知中心（三者读同一份通知记录）
    → core/inbox.js（消息汇聚层：通知中心 + 用户可见事件 + AI可读事件）
      → AI上下文读取（走 inbox，不另建事件来源）
      → 记忆系统判断是否写入长期记忆
```

铁律：
- APP之间禁止直接互调
- APP不能直接调通知API
- AI读取事件必须走 inbox，不能自己另开一条路
- `ai-events.js` 只做筛选/映射，不另建事件存储

## 2. 数据唯一来源

| 数据 | 唯一来源 | 说明 |
|------|---------|------|
| APP注册信息 | `data/apps-registry.js` | 静态：id、name、icon、entry、category、events、aiSpec、默认桌面/Dock |
| 用户态布局 | 存储层 | 渲染 = 注册表默认值 + 用户覆盖值，不写回注册表 |
| 背景系统 | `core/app-bg.js` | 统一管：主题背景、桌面壁纸、锁屏壁纸、APP单独背景 |
| 主题色值 | `data/theme-presets.js` → `core/theme.js` → `css/theme.css`变量槽位 | `theme.css`只放变量槽位和切换机制，不存具体色值 |
| 设置 | `data/default-settings.js` → `core/config.js` → 统一出口 | 界面层禁止直接读 localStorage |
| 通知记录 | `core/notifications.js` 写入，单表 | 横幅/桌面提示/通知中心/AI都读这一份 |
| 聊天消息 | 存储层 | 按角色+会话隔离 |
| 角色记忆 | 存储层 | 按角色ID隔离 |
| 角色资料/状态 | 存储层 | 按角色ID隔离 |

## 3. AI分层

```
js/ai/
├── ai-client.js     → 请求发送、流式、轮换、模型选择
├── ai-context.js    → 拼装上下文：记忆 + 角色资料 + 角色状态 + inbox事件 + 当前对话
│                     事件读取走 inbox 入口，禁止绕过
├── ai-memory.js     → 记忆CRUD+压缩，角色隔离
├── ai-events.js     → 监听事件中心，筛选/映射为AI可感知事件；不另建存储，不替代 inbox
├── ai-fallback.js   → 全挂/超时/报错降级
└── ai-spec.js       → 每个APP注册自己的AI行为指令
```

- 不在 chat 里堆 AI 逻辑，聊天APP只负责界面和交互
- `ai-context.js` 读取事件走 `core/inbox.js` 入口
- `ai-events.js` 只做筛选映射，不建独立事件存储

## 4. 存储分层

**localStorage（仅轻配置）：**
- 主题模式、壁纸设置、桌面图标/Dock顺序、设置开关值
- API分组配置、感官开关、TTS模式

**IndexedDB（强制）：**
- 聊天记录、记忆、大体量通知记录、图片/媒体索引

**结构化小数据：**
- 由 `core/storage-manager.js` 统一决定最佳落点
- 上层只通过统一接口读写

**角色隔离：**
- 所有角色相关数据（聊天、记忆、资料、状态）带 `characterId` 字段
- 存储层自动注入当前角色ID过滤
- 切换角色 = 切换作用域，A/B角色数据物理不互通

## 5. 主题系统

- 6套主题：3日间 + 3夜间
- 日间：奶黄（默认）、粉色、蓝色
- 夜间：对应三套夜间主题
- 方案：`theme.css` 只放CSS变量槽位 + 切换机制 + 通用类；`data/theme-presets.js` 存具体色值；`core/theme.js` 负责把色值写入变量槽位
- 避免色值两处存储

## 6. chat 与 inbox 关系

- `apps/chat/` = 消息中心的 UI 层（界面、交互、渲染）
- `core/inbox.js` = 消息/事件汇聚的数据层（存储、查询、事件入口）
- chat 展示的数据来自 inbox，chat 不自己另建消息数据源

## 7. APP内部统一目录结构

每个APP文件夹必须遵循以下标准结构，后续所有APP一致：

```
apps/<app-id>/
├── index.js               # APP入口，只负责装配，不堆大逻辑
├── ui/                    # 这个APP自己的界面拆分
├── settings/              # 这个APP自己的内部设置/偏好/会话设置
├── css/                   # 这个APP自己的样式
├── data/                  # 这个APP自己的本地状态/数据读写封装（如有）
├── events/                # 这个APP产生的事件定义与派发封装（如有）
└── ai-spec/               # 这个APP的AI说明书/AI行为约束/可读数据说明
```

**硬规则：**
1. 每个APP都必须预留 `ui / settings / css / ai-spec` 这四层，哪怕第一版内容很少也要把结构留好
2. `index.js` 只做入口装配：挂载、初始化、调用内部模块；不要把整APP逻辑全堆进这里
3. APP自己的设置放 `settings/`，全局设置不准塞进APP内部
4. APP自己的AI说明书放 `ai-spec/`，不能把所有APP的AI逻辑继续堆回全局chat
5. APP自己的样式放自己的 `css/`，不要全挤进全局CSS
6. APP产生事件时，封装在自己的 `events/`，再统一走事件中心，不直接调别的APP
7. 如果某个APP当前阶段还没做完，可以先保留空目录，但目录结构要先统一好

**边界：** 这条规则是"APP内部结构规范"，不影响已经确认的 core / desktop / data / js/ai 分层。

### 7.1 APP内部文件命名规则

每个APP内部文件必须遵循 `app-id` 前缀命名，一眼看出归属：

```
apps/<app-id>/
├── index.js                      # APP入口
├── ui/
│   ├── <app-id>-page.js          # APP主页面
│   ├── <app-id>-header.js        # 头部区域（如有）
│   ├── <app-id>-list.js          # 列表区（如有）
│   ├── <app-id>-detail.js        # 详情区（如有）
│   ├── <app-id>-composer.js      # 输入区/操作区（如有）
│   └── ...
├── settings/
│   ├── <app-id>-settings-page.js
│   ├── <app-id>-settings-store.js
│   └── ...
├── css/
│   ├── <app-id>.css
│   ├── <app-id>-settings.css
│   └── ...
├── data/
│   ├── <app-id>-store.js         # 本APP数据访问/状态封装
│   ├── <app-id>-schema.js        # 本APP数据结构/校验（如有）
│   └── ...
├── events/
│   ├── <app-id>-events.js        # 本APP事件名、派发封装
│   └── ...
└── ai-spec/
    ├── <app-id>-ai-spec.js       # 本APP AI说明书/能力边界/可读数据说明
    └── ...
```

### 7.2 APP内部职责边界

1. `index.js` 只负责装配，不堆业务细节
2. `ui/` 只管界面结构、渲染、交互绑定，不直接保存数据，不直接互调别的APP
3. `settings/` 只管这个APP自己的设置，不碰全局设置
4. `css/` 只放这个APP自己的样式，不把别的APP样式混进来
5. `data/` 只管这个APP自己的数据读写与状态封装；跨APP共享数据仍走 core / data 层统一来源
6. `events/` 只负责本APP事件定义与派发封装，真正广播走事件中心
7. `ai-spec/` 只描述这个APP的AI规则、可读数据、可触发事件，不写全局请求逻辑
8. 公用能力（弹窗、toast、sheet、通用选择器、路由、通知、主题、存储）不准下沉到APP文件夹里，统一留在 core
9. 不要出现 `utils.js`、`helpers.js`、`misc.js` 这种垃圾桶文件名；名字必须一眼看出职责
10. 一个文件只做一件事，文件变大就继续拆，不要因为已经有文件夹了就硬塞

## 硬性约束

1. 桌面是系统壳层，不是普通APP
2. 事件驱动：APP → 事件中心 → 通知判断 → inbox → AI
3. 一份数据一个来源，不散写多份
4. 不写死APP列表、顺序、主题、壁纸、角色名、默认称呼
5. 每个APP预留AI说明书入口，不堆进chat
6. 角色记忆隔离，存储设计带角色ID
7. 所有颜色CSS变量，禁止硬编码色值
8. 图标线条风SVG，禁止emoji、实心黑图标
9. 文件800行上限，超过拆文件
10. 禁止占位、TODO、假逻辑、假按钮
11. 每个APP必须遵循统一内部目录结构