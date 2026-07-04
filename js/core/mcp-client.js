/* ============================================================
   mcp-client.js — MCP 客户端（模型上下文协议）
   我（AI）通过 function calling 调用小手机内部工具
   - 工具注册中心：register/unregister/list/get
   - OpenAI 兼容：toOpenAITools() / callToolCall()
   - 内置工具集：钱包/备忘/纪念日/朋友圈/音乐/游戏/记忆/系统

   挂在 window.Phone.McpClient
   ============================================================ */
(function (global) {
  "use strict";

  // ---------- 工具注册中心 ----------
  // 我用一个 Map 存所有已注册工具，key 是工具名（点分命名空间）
  const _tools = new Map();

  // 危险操作清单：这些工具被调用时，我会写一条 NOTIFY 事件留个痕
  const DANGEROUS = new Set([
    "wallet.transfer",
    "memo.create",
    "moments.post",
    "memory.remember",
    // 新增：换角色 / 存相册 / 推通知，都会改变用户可见状态，我留个痕
    "character.switch",
    "gallery.upload",
    "notify.push",
  ]);

  // 我注册一个工具：同名工具会被覆盖
  function register(tool) {
    if (!tool || !tool.name) return;
    _tools.set(tool.name, tool);
  }

  // 我注销一个工具
  function unregister(name) {
    _tools.delete(name);
  }

  // 我列出所有已注册工具（返回浅拷贝数组，避免外部改坏内部 Map）
  function list() {
    return Array.from(_tools.values()).map((t) => Object.assign({}, t));
  }

  // 我获取单个工具（返回浅拷贝）
  function get(name) {
    const t = _tools.get(name);
    return t ? Object.assign({}, t) : null;
  }

  // 我把工具集转成 OpenAI function calling 的 tools 数组
  function toOpenAITools() {
    return Array.from(_tools.values()).map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description || "",
        parameters: t.parameters || { type: "object", properties: {}, required: [] },
      },
    }));
  }

  // 我调用一个工具：try-catch 兜底，失败返回 {error} 而不是抛错
  async function call(name, args) {
    const tool = _tools.get(name);
    if (!tool) return { error: "找不到工具：" + name };
    if (typeof tool.handler !== "function") return { error: "工具没有 handler：" + name };
    // 危险操作我先记一笔，方便事后审计
    if (DANGEROUS.has(name)) _logUse(name);
    try {
      const a = args || {};
      return await tool.handler(a);
    } catch (e) {
      return { error: (e && e.message) ? e.message : String(e) };
    }
  }

  // 我处理 OpenAI 返回的 tool_calls：解析 arguments JSON，调 call，组装回执消息
  async function callToolCall(toolCall) {
    if (!toolCall) return null;
    const id = toolCall.id;
    const fn = toolCall.function || {};
    const name = fn.name;
    let args = {};
    if (fn.arguments) {
      try { args = JSON.parse(fn.arguments); }
      catch (e) { args = {}; }
    }
    const result = await call(name, args);
    return {
      tool_call_id: id,
      role: "tool",
      content: JSON.stringify(result),
    };
  }

  // ---------- 启用 / 禁用 ----------
  // 默认是关着的，避免误触发；需要时显式 enable()
  function isEnabled() {
    const State = global.Phone && global.Phone.State;
    if (!State) return false;
    return State.get("mcpEnabled") === true;
  }
  async function enable() {
    await global.Phone.State.set("mcpEnabled", true);
    return true;
  }
  async function disable() {
    await global.Phone.State.set("mcpEnabled", false);
    return false;
  }

  // ---------- 内部辅助 ----------
  // 我把危险工具的调用记到事件中心，方便事后翻账
  function _logUse(toolName) {
    try {
      const EC = global.Phone && global.Phone.EventCenter;
      if (!EC) return;
      EC.emit(EC.TYPES.NOTIFY, {
        sourceApp: "mcp",
        data: { tool: toolName },
        summary: "我用了工具 " + toolName,
      });
    } catch (e) { /* 记日志失败不能影响主流程 */ }
  }

  // 我读取当前角色 id（多处都用，抽成 helper）
  async function _currentCharacterId() {
    try {
      return await global.Phone.Storage.getSetting("currentCharacterId") || null;
    } catch (e) { return null; }
  }

  // ---------- 新增工具用到的内部辅助 ----------
  // 我把第三方 fetch 包一层：带超时 + 错误兜底，失败统一抛 Error
  // 这样 handler 里 try/catch 就能把 {error} 返回给 AI，不会让底层报错冒泡
  async function _fetchJson(url, opts) {
    opts = opts || {};
    const timeout = opts.timeout || 8000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const resp = await fetch(url, {
        method: opts.method || "GET",
        headers: opts.headers || {},
        body: opts.body || undefined,
        signal: opts.signal || ctrl.signal,
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      return await resp.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function _fetchText(url, opts) {
    opts = opts || {};
    const timeout = opts.timeout || 8000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: opts.headers || {},
        signal: opts.signal || ctrl.signal,
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      return await resp.text();
    } finally {
      clearTimeout(timer);
    }
  }

  // 我把 HTML 粗略转成纯文本（去掉脚本/样式/标签，折叠空白）
  function _htmlToText(html) {
    if (!html) return "";
    let s = String(html);
    // 去 script / style 整段
    s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
    s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
    s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
    // 块级元素前后补换行
    s = s.replace(/<\/(p|div|li|h[1-6]|tr|br|section|article|header|footer)>/gi, "\n");
    s = s.replace(/<br\s*\/?>/gi, "\n");
    // 去掉所有标签
    s = s.replace(/<[^>]+>/g, "");
    // 解码常用实体
    s = s.replace(/&nbsp;/g, " ")
         .replace(/&amp;/g, "&")
         .replace(/&lt;/g, "<")
         .replace(/&gt;/g, ">")
         .replace(/&quot;/g, '"')
         .replace(/&#39;/g, "'");
    // 折叠多余空白
    s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return s;
  }

  // 我做安全的数学表达式求值：
  // 1) 只允许数字、运算符、括号、小数点、空格
  // 2) 禁止任何字母（堵死 new Function 里的副作用）
  // 3) 通过白名单后才用 Function 求值（不用 eval）
  function _safeCalc(expr) {
    if (typeof expr !== "string") throw new Error("表达式得是字符串呀");
    const cleaned = expr.replace(/\s+/g, "");
    if (!cleaned) throw new Error("表达式不能为空");
    // 白名单：数字、+ - * / % ( ) . ，并禁止连续非法组合
    if (!/^[-+/*%().\d]+$/.test(cleaned)) {
      throw new Error("表达式里有不认识的字符，我只能算数字和 + - * / % ( )");
    }
    // 禁止以运算符结尾等明显畸形（简单校验，不阻断正常用法）
    if (/[+\-*/%(]$/.test(cleaned)) throw new Error("表达式好像没写完呢");
    // 用 Function 求值（比 eval 安全，且无外部作用域访问）
    // eslint-disable-next-line no-new-func
    const fn = new Function("return (" + cleaned + ");");
    const result = fn();
    if (typeof result !== "number" || !isFinite(result)) {
      throw new Error("算不出来呢，检查一下表达式好不好");
    }
    return result;
  }

  // 我把 WMO 天气码翻译成人话（Open-Meteo 用的就是这套码）
  function _weatherCodeText(code) {
    const map = {
      0: "晴", 1: "大致晴朗", 2: "局部多云", 3: "阴",
      45: "有雾", 48: "雾凇",
      51: "小毛毛雨", 53: "毛毛雨", 55: "大毛毛雨",
      56: "冻毛毛雨", 57: "强冻毛毛雨",
      61: "小雨", 63: "中雨", 65: "大雨",
      66: "冻雨", 67: "强冻雨",
      71: "小雪", 73: "中雪", 75: "大雪", 77: "雪粒",
      80: "阵雨", 81: "中阵雨", 82: "强阵雨",
      85: "阵雪", 86: "强阵雪",
      95: "雷阵雨", 96: "雷阵雨伴冰雹", 99: "强雷阵雨伴冰雹",
    };
    return map[code] != null ? map[code] : "未知天气";
  }

  // 我用独立 IndexedDB 存相册图片（不动 storage.js 的 schema）
  // 注意：这里的"相册"和 window.Phone.Gallery（记仇本）是两回事，互不影响
  const _galleryDB = (function () {
    let _db = null;
    function _ready() {
      if (_db) return Promise.resolve(_db);
      return new Promise((resolve, reject) => {
        if (!global.indexedDB) { reject(new Error("浏览器不支持 IndexedDB")); return; }
        const req = global.indexedDB.open("PhoneGalleryDB", 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("photos")) {
            const store = db.createObjectStore("photos", { keyPath: "id" });
            store.createIndex("createdAt", "createdAt", { unique: false });
          }
        };
        req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
        req.onerror = (e) => reject(e.target.error);
      });
    }
    async function _add(photo) {
      const db = await _ready();
      return new Promise((resolve, reject) => {
        const r = db.transaction("photos", "readwrite").objectStore("photos").put(photo);
        r.onsuccess = () => resolve(photo);
        r.onerror = () => reject(r.error);
      });
    }
    async function _all() {
      const db = await _ready();
      return new Promise((resolve, reject) => {
        const r = db.transaction("photos", "readonly").objectStore("photos").getAll();
        r.onsuccess = () => resolve(r.result || []);
        r.onerror = () => reject(r.error);
      });
    }
    return { add: _add, all: _all };
  })();

  // 我把倒计时和提醒的内存定时器集中管，cancel 时能清掉
  const _timers = new Map();

  // ---------- 内置工具集 ----------
  // 每个工具的 handler 我都做 args 兜底（args 可能为 undefined）
  const _builtins = [
    // ===== 钱包类 =====
    {
      name: "wallet.balance",
      description: "看看我的小金库还有多少钱",
      category: "wallet",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", enum: ["user", "ai"], description: "查哪个钱包：user=我的小金库，ai=TA的零花钱" },
        },
        required: [],
      },
      handler: async (args) => {
        const a = args || {};
        const target = a.target || "user";
        const balance = await global.Phone.Wallet.getBalance(target);
        return { target: target, balance: balance };
      },
    },
    {
      name: "wallet.list",
      description: "翻翻最近的交易明细",
      category: "wallet",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "最多返回几条，默认 10" },
          category: { type: "string", description: "按分类筛选，如 food/shopping/transfer" },
        },
        required: [],
      },
      handler: async (args) => {
        const a = args || {};
        const filter = {};
        if (a.category) filter.category = a.category;
        const list = await global.Phone.Wallet.listTxs(filter);
        const limit = a.limit || 10;
        return list.slice(0, limit);
      },
    },
    {
      name: "wallet.transfer",
      description: "我和TA之间转个账",
      category: "wallet",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "转账金额" },
          direction: { type: "string", enum: ["ai-to-user", "user-to-ai"], description: "转账方向" },
          note: { type: "string", description: "备注（可选）" },
        },
        required: ["amount", "direction"],
      },
      handler: async (args) => {
        const a = args || {};
        const amount = Number(a.amount);
        if (!isFinite(amount) || amount <= 0) return { error: "金额得是正数呀" };
        const direction = a.direction;
        if (direction !== "ai-to-user" && direction !== "user-to-ai") {
          return { error: "方向只能是 ai-to-user 或 user-to-ai" };
        }
        return await global.Phone.Wallet.transfer(amount, direction, a.note, "mcp");
      },
    },
    {
      name: "wallet.stats",
      description: "算算整体的收支结余",
      category: "wallet",
      parameters: { type: "object", properties: {}, required: [] },
      handler: async (args) => {
        return await global.Phone.Wallet.stats();
      },
    },

    // ===== 备忘录类 =====
    {
      name: "memo.list",
      description: "看看我记下了哪些待办",
      category: "memo",
      parameters: {
        type: "object",
        properties: {
          completed: { type: "boolean", description: "按完成状态筛选" },
          category: { type: "string", description: "按分类筛选" },
          limit: { type: "number", description: "最多返回几条，默认 20" },
        },
        required: [],
      },
      handler: async (args) => {
        const a = args || {};
        const filter = {};
        if (typeof a.completed === "boolean") filter.completed = a.completed;
        if (a.category) filter.category = a.category;
        const list = await global.Phone.Memo.list(filter);
        const limit = a.limit || 20;
        return list.slice(0, limit);
      },
    },
    {
      name: "memo.create",
      description: "帮我记一条小备忘",
      category: "memo",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "标题" },
          content: { type: "string", description: "内容（可选）" },
          category: { type: "string", description: "分类（可选）" },
          priority: { type: "string", enum: ["low", "normal", "high"], description: "优先级" },
          dueDate: { type: "string", description: "截止时间（可选，如 2026-12-25 或时间戳）" },
        },
        required: ["title"],
      },
      handler: async (args) => {
        const a = args || {};
        // Memo 的 priority 是数字：1=低 2=中 3=高
        const priorityMap = { low: 1, normal: 2, high: 3 };
        const opts = {
          title: a.title || "",
          content: a.content || "",
          category: a.category || "",
          priority: priorityMap[a.priority] || 0,
        };
        if (a.dueDate) {
          const ts = Date.parse(a.dueDate);
          opts.remindAt = isNaN(ts) ? null : ts;
        }
        return await global.Phone.Memo.create(opts);
      },
    },
    {
      name: "memo.complete",
      description: "把一条备忘标记成完成（或取消完成）",
      category: "memo",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "备忘 id" },
          completed: { type: "boolean", description: "true=标记完成，false=取消完成，默认 true" },
        },
        required: ["id"],
      },
      handler: async (args) => {
        const a = args || {};
        if (!a.id) return { error: "缺少备忘 id" };
        return await global.Phone.Memo.complete(a.id, a.completed !== false);
      },
    },
    {
      name: "memo.stats",
      description: "数数我有多少待办和已完成",
      category: "memo",
      parameters: { type: "object", properties: {}, required: [] },
      handler: async (args) => {
        return await global.Phone.Memo.stats();
      },
    },

    // ===== 周年纪念类 =====
    {
      name: "anniversary.list",
      description: "看看接下来有哪些纪念日",
      category: "anniversary",
      parameters: {
        type: "object",
        properties: {
          upcoming: { type: "boolean", description: "只看即将到来的" },
          type: { type: "string", description: "按类型筛选" },
          limit: { type: "number", description: "最多返回几条，默认 20" },
        },
        required: [],
      },
      handler: async (args) => {
        const a = args || {};
        const filter = {};
        if (typeof a.upcoming === "boolean") filter.upcoming = a.upcoming;
        if (a.type) filter.type = a.type;
        const list = await global.Phone.Anniversary.list(filter);
        const limit = a.limit || 20;
        return list.slice(0, limit);
      },
    },
    {
      name: "anniversary.create",
      description: "记一个属于我们的纪念日",
      category: "anniversary",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "纪念日名字" },
          date: { type: "string", description: "日期，如 2026-12-25" },
          type: { type: "string", description: "类型（可选）" },
          repeat: { type: "string", enum: ["yearly", "once"], description: "重复方式，默认 yearly" },
        },
        required: ["title", "date"],
      },
      handler: async (args) => {
        const a = args || {};
        return await global.Phone.Anniversary.create({
          title: a.title || "",
          date: a.date || "",
          type: a.type || "other",
          repeat: a.repeat || "yearly",
        });
      },
    },
    {
      name: "anniversary.stats",
      description: "数数一共有多少个纪念日",
      category: "anniversary",
      parameters: { type: "object", properties: {}, required: [] },
      handler: async (args) => {
        return await global.Phone.Anniversary.stats();
      },
    },

    // ===== 朋友圈类 =====
    {
      name: "moments.list",
      description: "刷刷最近的朋友圈动态",
      category: "moments",
      parameters: {
        type: "object",
        properties: {
          authorId: { type: "string", description: "只看某个人（角色 id 或 user）的动态" },
          limit: { type: "number", description: "最多返回几条，默认 20" },
        },
        required: [],
      },
      handler: async (args) => {
        const a = args || {};
        const list = await global.Phone.Moments.list({});
        const filtered = a.authorId ? list.filter((m) => m.authorId === a.authorId) : list;
        const limit = a.limit || 20;
        return filtered.slice(0, limit);
      },
    },
    {
      name: "moments.post",
      description: "以我现在的身份发一条朋友圈",
      category: "moments",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "动态文字内容" },
          mood: { type: "string", description: "心情标签（可选）" },
          images: { type: "array", items: { type: "string" }, description: "图片地址列表（可选）" },
        },
        required: ["content"],
      },
      handler: async (args) => {
        const a = args || {};
        if (!a.content) return { error: "发朋友圈得写点什么呀" };
        const cid = await _currentCharacterId();
        if (!cid) return { error: "还没选定角色呢" };
        const ok = await global.Phone.Moments.postAsCharacter(cid, a.content, a.images || [], { mood: a.mood || "" });
        return { ok: ok, characterId: cid };
      },
    },
    {
      name: "moments.like",
      description: "给一条朋友圈点个赞",
      category: "moments",
      parameters: {
        type: "object",
        properties: {
          momentId: { type: "string", description: "动态 id" },
        },
        required: ["momentId"],
      },
      handler: async (args) => {
        const a = args || {};
        if (!a.momentId) return { error: "缺少动态 id" };
        const cid = await _currentCharacterId();
        return await global.Phone.Moments.like(a.momentId, cid);
      },
    },
    {
      name: "moments.comment",
      description: "在一条朋友圈下面留个言",
      category: "moments",
      parameters: {
        type: "object",
        properties: {
          momentId: { type: "string", description: "动态 id" },
          text: { type: "string", description: "评论内容" },
        },
        required: ["momentId", "text"],
      },
      handler: async (args) => {
        const a = args || {};
        if (!a.momentId) return { error: "缺少动态 id" };
        if (!a.text) return { error: "评论内容不能为空呀" };
        const cid = await _currentCharacterId();
        return await global.Phone.Moments.comment(a.momentId, { characterId: cid, text: a.text });
      },
    },

    // ===== 音乐类 =====
    {
      name: "music.list",
      description: "看看音乐库里都有什么歌",
      category: "music",
      parameters: {
        type: "object",
        properties: {
          favorite: { type: "boolean", description: "只看收藏的" },
          limit: { type: "number", description: "最多返回几条，默认 20" },
        },
        required: [],
      },
      handler: async (args) => {
        const a = args || {};
        // Music.list 的过滤键是 favorited，我把 favorite 透传过去
        const filter = {};
        if (typeof a.favorite === "boolean") filter.favorited = a.favorite;
        const list = await global.Phone.Music.list(filter);
        const limit = a.limit || 20;
        return list.slice(0, limit);
      },
    },
    {
      name: "music.play",
      description: "放一首歌给我听",
      category: "music",
      parameters: {
        type: "object",
        properties: {
          songId: { type: "string", description: "歌曲 id" },
        },
        required: ["songId"],
      },
      handler: async (args) => {
        const a = args || {};
        if (!a.songId) return { error: "缺少歌曲 id" };
        return await global.Phone.Music.play(a.songId);
      },
    },
    {
      name: "music.pause",
      description: "把音乐暂停一下",
      category: "music",
      parameters: { type: "object", properties: {}, required: [] },
      handler: async (args) => {
        global.Phone.Music.pause();
        return { ok: true };
      },
    },

    // ===== 游戏类 =====
    {
      name: "games.list",
      description: "看看小手机里都有什么游戏",
      category: "games",
      parameters: { type: "object", properties: {}, required: [] },
      handler: async (args) => {
        return global.Phone.Games.GAMES;
      },
    },
    {
      name: "games.stats",
      description: "看看游戏战绩怎么样",
      category: "games",
      parameters: {
        type: "object",
        properties: {
          gameId: { type: "string", description: "只看某个游戏的统计（可选）" },
        },
        required: [],
      },
      handler: async (args) => {
        const a = args || {};
        if (a.gameId) return await global.Phone.Games.stats(a.gameId);
        return await global.Phone.Games.gatherStats(global.Phone.Storage);
      },
    },

    // ===== 角色记忆类 =====
    {
      name: "memory.query",
      description: "翻翻我记得的那些事",
      category: "memory",
      parameters: {
        type: "object",
        properties: {
          characterId: { type: "string", description: "查哪个角色的记忆，默认当前角色" },
          type: { type: "string", description: "按类型筛选（可选）" },
          limit: { type: "number", description: "最多返回几条，默认 20" },
        },
        required: [],
      },
      handler: async (args) => {
        const a = args || {};
        const cid = a.characterId || await _currentCharacterId();
        if (!cid) return { error: "还没选定角色呢" };
        const opts = {};
        if (a.type) opts.type = a.type;
        opts.limit = a.limit || 20;
        return await global.Phone.AIClient.queryMemory(cid, opts);
      },
    },
    {
      name: "memory.remember",
      description: "让我把一件事记进心里",
      category: "memory",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "要记住的内容" },
          type: { type: "string", description: "记忆类型（可选，如 conversation/fact/preference）" },
          importance: { type: "number", description: "重要度 1-10（可选，默认 5）" },
        },
        required: ["content"],
      },
      handler: async (args) => {
        const a = args || {};
        if (!a.content) return { error: "要记的内容不能为空呀" };
        const cid = await _currentCharacterId();
        if (!cid) return { error: "还没选定角色呢" };
        return await global.Phone.AIClient.remember(cid, a.content, a.type, a.importance);
      },
    },
    {
      name: "memory.forget",
      description: "让我忘掉一件不想记的事",
      category: "memory",
      parameters: {
        type: "object",
        properties: {
          memoryId: { type: "string", description: "要忘记的记忆 id" },
        },
        required: ["memoryId"],
      },
      handler: async (args) => {
        const a = args || {};
        if (!a.memoryId) return { error: "缺少记忆 id" };
        return await global.Phone.AIClient.forget(a.memoryId);
      },
    },

    // ===== 系统 / 设置类 =====
    {
      name: "system.time",
      description: "问问现在几点了",
      category: "system",
      parameters: { type: "object", properties: {}, required: [] },
      handler: async (args) => {
        const d = new Date();
        const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
        const h = d.getHours();
        let greeting;
        if (h < 12) greeting = "早上好";
        else if (h < 14) greeting = "中午好";
        else if (h < 18) greeting = "下午好";
        else greeting = "晚上好";
        const date = d.getFullYear() + "-" +
          String(d.getMonth() + 1).padStart(2, "0") + "-" +
          String(d.getDate()).padStart(2, "0");
        return {
          now: d.getTime(),
          date: date,
          weekday: weekdays[d.getDay()],
          greeting: greeting,
        };
      },
    },
    {
      name: "system.settings.get",
      description: "读一个我的小手机设置项",
      category: "system",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "设置项的 key，如 theme / currentCharacterId" },
        },
        required: ["key"],
      },
      handler: async (args) => {
        const a = args || {};
        if (!a.key) return { error: "缺少 key" };
        const value = global.Phone.State.get(a.key);
        return { key: a.key, value: value };
      },
    },
    {
      name: "system.character.current",
      description: "看看我现在是哪个角色",
      category: "system",
      parameters: { type: "object", properties: {}, required: [] },
      handler: async (args) => {
        return await global.Phone.AIClient.getCharacter();
      },
    },

    // ===== 联网 / 信息类（新增） =====
    {
      name: "web_search",
      description: "我帮你上网搜一搜，查查外面的世界发生了什么",
      category: "web",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词" },
          limit: { type: "number", description: "最多返回几条，默认 5" },
        },
        required: ["query"],
      },
      handler: async (args) => {
        const a = args || {};
        const q = (a.query || "").trim();
        if (!q) return { error: "搜什么得告诉我呀" };
        const limit = Math.max(1, Math.min(10, a.limit || 5));
        // 我用 Wikipedia 的 opensearch（CORS 友好、免费、无需 key）
        const url = "https://zh.wikipedia.org/w/api.php?action=query&format=json" +
          "&list=search&srsearch=" + encodeURIComponent(q) +
          "&srlimit=" + limit + "&origin=*";
        try {
          const json = await _fetchJson(url);
          const arr = (json && json.query && json.query.search) || [];
          return {
            query: q,
            results: arr.map((it) => ({
              title: it.title || "",
              snippet: (it.snippet || "").replace(/<[^>]+>/g, ""),
              url: "https://zh.wikipedia.org/wiki/" + encodeURIComponent((it.title || "").replace(/ /g, "_")),
            })),
          };
        } catch (e) {
          return { error: "我搜不到呢：" + ((e && e.message) ? e.message : String(e)) };
        }
      },
    },
    {
      name: "web_fetch",
      description: "我帮你抓一个网页的内容看看",
      category: "web",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "要抓的网址（http/https）" },
          maxLength: { type: "number", description: "最多返回多少字，默认 2000" },
        },
        required: ["url"],
      },
      handler: async (args) => {
        const a = args || {};
        const url = (a.url || "").trim();
        if (!url) return { error: "网址呢" };
        if (!/^https?:\/\//i.test(url)) return { error: "网址得是 http 或 https 开头哦" };
        const maxLen = Math.max(100, Math.min(8000, a.maxLength || 2000));
        try {
          const raw = await _fetchText(url);
          // 是不是 HTML，简单判断：含 < 就当 HTML 处理
          const text = raw.indexOf("<") >= 0 ? _htmlToText(raw) : raw;
          const truncated = text.length > maxLen;
          return {
            url: url,
            content: truncated ? text.slice(0, maxLen) + "…" : text,
            length: text.length,
            truncated: truncated,
          };
        } catch (e) {
          return { error: "我抓不到这个网页呢：" + ((e && e.message) ? e.message : String(e)) };
        }
      },
    },
    {
      name: "calculator",
      description: "我帮你算一道数学题，加减乘除、括号、取余都行",
      category: "tool",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "数学表达式，如 1+2*3 或 (3+4)/2" },
        },
        required: ["expression"],
      },
      handler: async (args) => {
        const a = args || {};
        try {
          const result = _safeCalc(a.expression);
          return { expression: a.expression, result: result };
        } catch (e) {
          return { error: (e && e.message) ? e.message : String(e) };
        }
      },
    },
    {
      name: "datetime.convert",
      description: "我帮你把时间在不同的时区之间换算，或者格式化成好看的样式",
      category: "tool",
      parameters: {
        type: "object",
        properties: {
          value: { type: "string", description: "时间戳（毫秒）或日期字符串（如 2026-12-25 20:00），不传默认现在" },
          timezone: { type: "string", description: "目标时区，如 Asia/Shanghai、America/New_York" },
          format: { type: "string", enum: ["date", "time", "datetime"], description: "输出样式，默认 datetime" },
        },
        required: [],
      },
      handler: async (args) => {
        const a = args || {};
        let ts;
        if (a.value == null || a.value === "") {
          ts = Date.now();
        } else if (typeof a.value === "number") {
          ts = a.value;
        } else {
          const parsed = Date.parse(a.value);
          if (isNaN(parsed)) return { error: "这个时间我读不懂呀：" + a.value };
          ts = parsed;
        }
        const tz = a.timezone || undefined; // 不传就用本地时区
        const fmt = a.format || "datetime";
        const opts = {};
        if (tz) opts.timeZone = tz;
        if (fmt === "date") {
          opts.year = "numeric"; opts.month = "2-digit"; opts.day = "2-digit";
        } else if (fmt === "time") {
          opts.hour = "2-digit"; opts.minute = "2-digit"; opts.second = "2-digit";
        } else {
          opts.year = "numeric"; opts.month = "2-digit"; opts.day = "2-digit";
          opts.hour = "2-digit"; opts.minute = "2-digit"; opts.second = "2-digit";
        }
        try {
          const formatted = new Intl.DateTimeFormat("zh-CN", opts).format(new Date(ts));
          return {
            input: a.value == null ? "now" : a.value,
            timezone: tz || Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
            format: fmt,
            timestamp: ts,
            iso: new Date(ts).toISOString(),
            formatted: formatted,
          };
        } catch (e) {
          return { error: "时区换算失败了：" + ((e && e.message) ? e.message : String(e)) };
        }
      },
    },
    {
      name: "weather.query",
      description: "我帮你查查一个城市现在的天气，出门要不要带伞我也能提醒",
      category: "web",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市名，如 Beijing / 北京 / Shanghai" },
        },
        required: ["city"],
      },
      handler: async (args) => {
        const a = args || {};
        const city = (a.city || "").trim();
        if (!city) return { error: "查哪个城市呀" };
        try {
          // 先 geocoding 拿坐标（Open-Meteo 免费、CORS 友好、无需 key）
          const geo = await _fetchJson(
            "https://geocoding-api.open-meteo.com/v1/search?name=" +
            encodeURIComponent(city) + "&count=1&language=zh&format=json"
          );
          const place = geo && geo.results && geo.results[0];
          if (!place) return { error: "我找不到这个城市呢：" + city };
          // 再查当前天气
          const w = await _fetchJson(
            "https://api.open-meteo.com/v1/forecast?latitude=" + place.latitude +
            "&longitude=" + place.longitude +
            "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m"
          );
          const cur = w && w.current;
          if (!cur) return { error: "天气数据读不到呢" };
          return {
            city: place.name + (place.admin1 ? ", " + place.admin1 : "") + (place.country ? ", " + place.country : ""),
            latitude: place.latitude,
            longitude: place.longitude,
            temperature: cur.temperature_2m,
            apparentTemperature: cur.apparent_temperature,
            humidity: cur.relative_humidity_2m,
            windSpeed: cur.wind_speed_10m,
            weatherCode: cur.weather_code,
            weather: _weatherCodeText(cur.weather_code),
            observedAt: cur.time,
          };
        } catch (e) {
          return { error: "天气查不到呢：" + ((e && e.message) ? e.message : String(e)) };
        }
      },
    },
    {
      name: "translate",
      description: "我帮你把一句话翻译成另一种语言",
      category: "web",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "要翻译的文本" },
          from: { type: "string", description: "源语言代码，如 en、zh、ja，不传我让 API 自动识别" },
          to: { type: "string", description: "目标语言代码，如 zh、en" },
        },
        required: ["text", "to"],
      },
      handler: async (args) => {
        const a = args || {};
        const text = (a.text || "").trim();
        if (!text) return { error: "翻译什么呀" };
        const to = (a.to || "").trim();
        if (!to) return { error: "翻成哪种语言得告诉我" };
        const from = (a.from || "").trim() || "auto";
        try {
          // MyMemory 免费翻译 API（CORS 友好，每日有额度，超了会限频）
          let langpair;
          if (from === "auto") {
            // MyMemory 需要 from|to，auto 不支持，我默认按 to 反推一个常见的
            langpair = (to === "zh" ? "en" : "en") + "|" + to;
          } else {
            langpair = from + "|" + to;
          }
          const url = "https://api.mymemory.translated.net/get?q=" +
            encodeURIComponent(text) + "&langpair=" + encodeURIComponent(langpair);
          const json = await _fetchJson(url);
          const translated = json && json.responseData && json.responseData.translatedText;
          if (!translated) return { error: "翻译结果读不到呢" };
          // 限频 / 配额提示
          const status = json.responseStatus;
          const quota = json.responseData && json.responseData.match;
          const out = {
            text: text,
            from: from === "auto" ? "auto" : from,
            to: to,
            translated: translated,
          };
          if (status === 403 || (typeof status === "string" && /quota|limit/i.test(status))) {
            out.warning = "翻译接口说我说太快了，等一会儿再翻吧";
          }
          if (quota != null) out.match = quota;
          return out;
        } catch (e) {
          return { error: "翻译失败了：" + ((e && e.message) ? e.message : String(e)) };
        }
      },
    },

    // ===== 记忆 / 角色扩展（新增） =====
    {
      name: "memory.archive",
      description: "我把一条记忆收起来归档，跟忘掉不一样：归档了我不主动提，但我还留着，需要时能翻出来",
      category: "memory",
      parameters: {
        type: "object",
        properties: {
          memoryId: { type: "string", description: "要归档的记忆 id" },
          archived: { type: "boolean", description: "true=归档，false=取消归档，默认 true" },
        },
        required: ["memoryId"],
      },
      handler: async (args) => {
        const a = args || {};
        if (!a.memoryId) return { error: "缺少记忆 id" };
        const archived = a.archived !== false;
        const result = await global.Phone.AIClient.archiveMemory(a.memoryId, archived);
        if (!result) return { error: "找不到这条记忆呢" };
        return { ok: true, memory: result, archived: archived };
      },
    },
    {
      name: "character.list",
      description: "我帮你看看小手机里都有哪些角色可以陪着你",
      category: "character",
      parameters: { type: "object", properties: {}, required: [] },
      handler: async (args) => {
        const list = await global.Phone.AIClient.listCharacters();
        const currentId = await _currentCharacterId();
        return {
          current: currentId,
          characters: list.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description || "",
            isCurrent: c.id === currentId,
          })),
        };
      },
    },
    {
      name: "character.switch",
      description: "我帮你切到另一个角色陪我说话",
      category: "character",
      parameters: {
        type: "object",
        properties: {
          characterId: { type: "string", description: "要切到的角色 id" },
        },
        required: ["characterId"],
      },
      handler: async (args) => {
        const a = args || {};
        if (!a.characterId) return { error: "切到哪个角色呀，得给我 id" };
        const exists = await global.Phone.Storage.get("characters", a.characterId);
        if (!exists) return { error: "找不到这个角色呢：" + a.characterId };
        await global.Phone.AIClient.switchCharacter(a.characterId);
        return { ok: true, characterId: a.characterId, name: exists.name };
      },
    },

    // ===== 相册类（新增，独立图片库，跟记仇本模块无关） =====
    {
      name: "gallery.list",
      description: "我帮你翻翻相册里存的图片",
      category: "gallery",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "最多返回几张，默认 20" },
        },
        required: [],
      },
      handler: async (args) => {
        const a = args || {};
        try {
          let all = await _galleryDB.all();
          all.sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
          const limit = a.limit || 20;
          const list = all.slice(0, limit).map((p) => ({
            id: p.id,
            name: p.name || "",
            mime: p.mime || "image/png",
            size: p.size || 0,
            width: p.width || 0,
            height: p.height || 0,
            createdAt: p.createdAt,
            // 缩略图：base64 太大就不在 list 里返回全量，只给前 64 字符当指纹
            thumb: (p.data || "").slice(0, 64),
          }));
          return { total: all.length, photos: list };
        } catch (e) {
          return { error: "相册读不到呢：" + ((e && e.message) ? e.message : String(e)) };
        }
      },
    },
    {
      name: "gallery.upload",
      description: "我帮你把一张 base64 图片存进相册里",
      category: "gallery",
      parameters: {
        type: "object",
        properties: {
          data: { type: "string", description: "图片 base64 字符串（含或不含 data:前缀都行）" },
          name: { type: "string", description: "图片名字（可选）" },
          mime: { type: "string", description: "图片类型，如 image/png，默认 image/png" },
        },
        required: ["data"],
      },
      handler: async (args) => {
        const a = args || {};
        let data = (a.data || "").trim();
        if (!data) return { error: "图片数据呢" };
        // 我容忍带 data: 前缀的写法，统一存原始 base64
        const m = /^data:([^;]+);base64,(.*)$/s.exec(data);
        let mime = a.mime || "image/png";
        let raw = data;
        if (m) { mime = m[1] || mime; raw = m[2]; }
        // 简单校验是不是 base64
        if (!/^[A-Za-z0-9+/\s\r\n]+=*$/.test(raw)) return { error: "这个不像 base64 图片呢" };
        // 限制单张 2MB，免得撑爆 IndexedDB
        const sizeBytes = Math.ceil(raw.length * 0.75);
        if (sizeBytes > 2 * 1024 * 1024) return { error: "图片太大了，我存不下呀（上限 2MB）" };
        const photo = {
          id: global.Phone.Utils.uid("photo"),
          name: a.name || ("photo_" + Date.now()),
          mime: mime,
          data: data,
          size: sizeBytes,
          width: 0,
          height: 0,
          createdAt: Date.now(),
        };
        try {
          await _galleryDB.add(photo);
          return { ok: true, id: photo.id, name: photo.name, size: photo.size, createdAt: photo.createdAt };
        } catch (e) {
          return { error: "存不进去呢：" + ((e && e.message) ? e.message : String(e)) };
        }
      },
    },

    // ===== 通知 / 提醒类（新增） =====
    {
      name: "notify.push",
      description: "我帮你给用户推一条小通知，让他注意到一件事",
      category: "notify",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "通知标题" },
          body: { type: "string", description: "通知正文（可选）" },
          appId: { type: "string", description: "归属哪个 APP（可选，默认 system）" },
        },
        required: ["title"],
      },
      handler: async (args) => {
        const a = args || {};
        if (!a.title) return { error: "通知得有个标题呀" };
        const row = await global.Phone.Notify.push({
          appId: a.appId || "mcp",
          title: a.title,
          body: a.body || "",
        });
        if (!row) return { ok: false, reason: "通知被免打扰或开关挡住了，没发出去" };
        return { ok: true, id: row.id, createdAt: row.createdAt };
      },
    },
    {
      name: "timer.set",
      description: "我帮你设一个倒计时，到点了我会推条通知提醒你",
      category: "notify",
      parameters: {
        type: "object",
        properties: {
          seconds: { type: "number", description: "倒计时秒数（和 minutes 二选一）" },
          minutes: { type: "number", description: "倒计时分钟数（和 seconds 二选一）" },
          title: { type: "string", description: "到点通知的标题" },
          body: { type: "string", description: "到点通知的正文（可选）" },
        },
        required: [],
      },
      handler: async (args) => {
        const a = args || {};
        const mins = Number(a.minutes) || 0;
        const secs = Number(a.seconds) || 0;
        const total = Math.round(mins * 60 + secs);
        if (total <= 0) return { error: "倒计时多久得告诉我呀（seconds 或 minutes）" };
        if (total > 24 * 3600) return { error: "倒计时太长了，最多 24 小时哦" };
        const fireAt = Date.now() + total * 1000;
        const title = a.title || "倒计时到啦";
        const body = a.body || "";
        const timerId = global.Phone.Utils.uid("timer");
        const t = setTimeout(() => {
          try {
            global.Phone.Notify.push({ appId: "mcp", title: title, body: body });
          } catch (e) {}
          _timers.delete(timerId);
        }, total * 1000);
        _timers.set(timerId, { timer: t, fireAt: fireAt, title: title });
        return {
          ok: true,
          timerId: timerId,
          seconds: total,
          fireAt: fireAt,
          fireAtLabel: new Date(fireAt).toLocaleString("zh-CN"),
        };
      },
    },
    {
      name: "memo.remind",
      description: "我帮你在未来的某个时间提醒你一件事，到点我会推通知给你",
      category: "memo",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "提醒标题" },
          remindAt: { type: "string", description: "提醒时间，时间戳（毫秒）或日期字符串（如 2026-12-25 20:00）" },
          content: { type: "string", description: "提醒正文（可选）" },
        },
        required: ["title", "remindAt"],
      },
      handler: async (args) => {
        const a = args || {};
        if (!a.title) return { error: "提醒得有个标题呀" };
        let ts;
        if (typeof a.remindAt === "number") {
          ts = a.remindAt;
        } else {
          ts = Date.parse(a.remindAt);
          if (isNaN(ts)) return { error: "提醒时间我读不懂呀：" + a.remindAt };
        }
        const now = Date.now();
        if (ts <= now) return { error: "提醒时间得是未来呀，这个已经过去了" };
        // 我把它也写进备忘录，带 remindAt，方便备忘录 APP 自己轮询提醒
        let memo = null;
        try {
          memo = await global.Phone.Memo.create({
            title: a.title,
            content: a.content || "",
            priority: 3,
            remindAt: ts,
          });
        } catch (e) {
          return { error: "备忘录写不进去呢：" + ((e && e.message) ? e.message : String(e)) };
        }
        // 同时我在内存里挂一个定时器，到点立刻推通知（不依赖备忘录轮询）
        const delay = ts - now;
        const timerId = global.Phone.Utils.uid("remind");
        const t = setTimeout(() => {
          try {
            global.Phone.Notify.push({
              appId: "memo",
              title: a.title,
              body: a.content || "到点啦，别忘了",
            });
            global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MEMO_REMINDED, {
              sourceApp: "memo",
              data: { memoId: memo && memo.id, title: a.title },
              summary: "提醒：" + a.title,
            });
          } catch (e) {}
          _timers.delete(timerId);
        }, delay);
        _timers.set(timerId, { timer: t, fireAt: ts, title: a.title });
        return {
          ok: true,
          memoId: memo && memo.id,
          remindAt: ts,
          remindAtLabel: new Date(ts).toLocaleString("zh-CN"),
        };
      },
    },
  ];

  // 我把内置工具一次性注册进 Map
  _builtins.forEach(register);

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.McpClient = {
    register,
    unregister,
    list,
    get,
    toOpenAITools,
    call,
    callToolCall,
    isEnabled,
    enable,
    disable,
  };
})(window);
