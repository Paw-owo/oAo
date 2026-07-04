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
