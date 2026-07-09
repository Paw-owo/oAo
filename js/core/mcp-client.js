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

  // ---------- GitHub 联动辅助 ----------
  // 配置读取：优先会话级（chat.githubXxx_<conversationId>，chat-ai.js 在 args 里带 conversationId），
  // 缺失时回退全局默认（githubXxx，用户在设置 APP 里配的）。
  // 返回 { ok, owner, repo, branch, pat } 或 { ok:false, error }
  async function _githubConfig(args) {
    const S = global.Phone && global.Phone.Storage;
    if (!S || typeof S.getSetting !== "function") {
      return { ok: false, error: "存储还没准备好，等一下再试～" };
    }
    const convId = args && args.conversationId;
    let repo, branch, pat;
    if (convId) {
      repo = await S.getSetting("chat.githubRepo_" + convId);
      branch = await S.getSetting("chat.githubBranch_" + convId);
      pat = await S.getSetting("chat.githubPat_" + convId);
    }
    if (!repo) repo = await S.getSetting("githubRepo");
    if (!branch) branch = await S.getSetting("githubBranch");
    if (!pat) pat = await S.getSetting("githubPat");
    if (!repo || !pat) {
      return { ok: false, error: "还没配置 GitHub 仓库，去聊天设置里关联一下吧～" };
    }
    const parts = String(repo).split("/");
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      return { ok: false, error: "仓库格式不对，要写成 owner/repo 哦" };
    }
    return {
      ok: true,
      owner: parts[0].trim(),
      repo: parts.slice(1).join("/").trim(),
      branch: branch || "main",
      pat: pat, // PAT 只在请求头里用，绝不写进日志或返回体
    };
  }

  // 我统一发 GitHub REST 请求：baseUrl = https://api.github.com/repos/{owner}/{repo}
  // 返回 { ok:true, data, status } 或 { ok:false, error, status }
  async function _githubRequest(cfg, path, method, body) {
    const url = "https://api.github.com/repos/" + cfg.owner + "/" + cfg.repo + path;
    let resp;
    try {
      resp = await fetch(url, {
        method: method || "GET",
        headers: {
          "Authorization": "token " + cfg.pat,
          "Accept": "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      return { ok: false, status: 0, error: "网络连不上 GitHub，检查一下网络再试～" };
    }
    let data = null;
    const text = await resp.text();
    if (text) {
      try { data = JSON.parse(text); } catch (e) { data = text; }
    }
    if (!resp.ok) {
      let msg = (data && data.message) ? String(data.message) : ("GitHub 返回 " + resp.status);
      if (resp.status === 401) msg = "GitHub 认证失败了，PAT 可能过期或写错了";
      else if (resp.status === 403) msg = "GitHub 拒绝了操作，可能 PAT 权限不够或被限流啦";
      else if (resp.status === 404) msg = "找不到这个资源，仓库地址或分支可能不对";
      else if (resp.status === 422) msg = "GitHub 说参数有问题：" + msg;
      return { ok: false, status: resp.status, error: msg };
    }
    return { ok: true, status: resp.status, data: data };
  }

  // 我把错误消息统一包装成 ghError 卡片格式（喂给 message-renderer 的 _renderGithub）
  function _ghErr(message) {
    return { kind: "ghError", error: message };
  }

  // 写操作 hook 点：__dryRun=true 时只返回计划不实际执行（chat-ai.js 二次确认 UI 用，本次不实现 UI）
  function _ghDryRun(action, payload) {
    return Object.assign({ dryRun: true, action: action }, payload || {});
  }

  // UTF-8 安全的 base64 编解码（GitHub Contents API 要求 base64）
  function _ghB64Encode(str) {
    try { return btoa(unescape(encodeURIComponent(str))); }
    catch (e) { try { return btoa(str); } catch (e2) { return ""; } }
  }
  function _ghB64Decode(b64) {
    try { return decodeURIComponent(escape(atob(b64))); }
    catch (e) { try { return atob(b64); } catch (e2) { return b64; } }
  }

  // 我把分支名或 commit SHA 解析成 SHA（from 是分支名时拉一次 branches API）
  async function _ghResolveSha(cfg, from) {
    if (/^[0-9a-f]{40}$/i.test(from)) return { ok: true, sha: from };
    const r = await _githubRequest(cfg, "/branches/" + encodeURIComponent(from));
    if (!r.ok) return r;
    const sha = r.data && r.data.commit && r.data.commit.sha;
    return sha ? { ok: true, sha: sha } : { ok: false, error: "解析不到 " + from + " 的 SHA" };
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

    // ===== GitHub 联动类 =====
    // 配置：会话级 chat.githubXxx_<conversationId> 优先，回退全局 githubXxx
    // 返回 payload 喂给 message-renderer._renderGithub（ghPR/ghMerge/ghFile/ghError/ghList）
    // 写操作支持 __dryRun=true 只预览不执行（chat-ai.js 二次确认 UI 用，本次不实现 UI）
    {
      name: "github_list_prs",
      description: "看看当前 GitHub 仓库有哪些 Pull Request",
      category: "github",
      parameters: {
        type: "object",
        properties: {
          state: { type: "string", enum: ["open", "closed", "all"], description: "PR 状态筛选，默认 open" },
          limit: { type: "number", description: "最多返回几条，默认 20" },
          conversationId: { type: "string", description: "会话 id（读会话级 GitHub 配置用，可选）" },
        },
        required: [],
      },
      handler: async (args) => {
        const a = args || {};
        const cfg = await _githubConfig(a);
        if (!cfg.ok) return { ok: false, error: cfg.error };
        const state = a.state || "open";
        const limit = Math.min(a.limit || 20, 100);
        const r = await _githubRequest(cfg, "/pulls?state=" + encodeURIComponent(state) + "&per_page=" + limit);
        if (!r.ok) return _ghErr(r.error);
        const arr = Array.isArray(r.data) ? r.data : [];
        const list = arr.slice(0, limit).map((p) => ({
          number: p.number,
          title: p.title,
          state: p.state,
          head: p.head && p.head.ref,
          base: p.base && p.base.ref,
          html_url: p.html_url,
        }));
        return { kind: "ghPR", count: list.length, list: list };
      },
    },
    {
      name: "github_view_pr",
      description: "看某个 Pull Request 的详情",
      category: "github",
      parameters: {
        type: "object",
        properties: {
          number: { type: "number", description: "PR 编号" },
          conversationId: { type: "string", description: "会话 id（可选）" },
        },
        required: ["number"],
      },
      handler: async (args) => {
        const a = args || {};
        const cfg = await _githubConfig(a);
        if (!cfg.ok) return { ok: false, error: cfg.error };
        const number = Number(a.number);
        if (!isFinite(number) || number <= 0) return _ghErr("PR 编号得是正数呀");
        const r = await _githubRequest(cfg, "/pulls/" + number);
        if (!r.ok) return _ghErr("PR #" + number + " " + r.error);
        const p = r.data || {};
        const head = p.head && p.head.ref;
        return {
          kind: "ghPR",
          number: p.number,
          title: p.title,
          state: p.state,
          head: head,
          base: p.base && p.base.ref,
          branch: head, // 兼容 message-renderer._ghPR 读 p.branch
          commits: p.commits,
          additions: p.additions,
          deletions: p.deletions,
          html_url: p.html_url,
          body: p.body || "",
        };
      },
    },
    {
      name: "github_merge_pr",
      description: "把一个 Pull Request 合并到目标分支",
      category: "github",
      parameters: {
        type: "object",
        properties: {
          number: { type: "number", description: "PR 编号" },
          method: { type: "string", enum: ["merge", "squash", "rebase"], description: "合并方式，默认 merge" },
          commit_title: { type: "string", description: "合并 commit 的标题（可选）" },
          conversationId: { type: "string", description: "会话 id（可选）" },
          __dryRun: { type: "boolean", description: "true 时只返回计划不实际执行（二次确认用）" },
        },
        required: ["number"],
      },
      handler: async (args) => {
        const a = args || {};
        const cfg = await _githubConfig(a);
        if (!cfg.ok) return { ok: false, error: cfg.error };
        const number = Number(a.number);
        if (!isFinite(number) || number <= 0) return _ghErr("PR 编号得是正数呀");
        const method = a.method || "merge";
        if (["merge", "squash", "rebase"].indexOf(method) < 0) return _ghErr("合并方式只能是 merge/squash/rebase");
        if (a.__dryRun === true) return _ghDryRun("merge_pr", { number: number, method: method });
        const body = { merge_method: method };
        if (a.commit_title) body.commit_title = a.commit_title;
        const r = await _githubRequest(cfg, "/pulls/" + number + "/merge", "PUT", body);
        if (!r.ok) return _ghErr("合并 PR #" + number + " 失败：" + r.error);
        // merge 接口只返回 sha，我再拉一次 PR 拿 head/base 用于回执
        let head, base;
        const pr2 = await _githubRequest(cfg, "/pulls/" + number);
        if (pr2.ok && pr2.data) {
          head = pr2.data.head && pr2.data.head.ref;
          base = pr2.data.base && pr2.data.base.ref;
        }
        const sha = (r.data && r.data.sha) || "";
        return {
          kind: "ghMerge",
          number: number,
          sha: sha,
          commit: sha, // 兼容 message-renderer._ghMerge 读 p.commit
          method: method,
          head: head,
          base: base,
          branch: head, // 兼容 message-renderer._ghMerge 读 p.branch
          html_url: sha ? ("https://github.com/" + cfg.owner + "/" + cfg.repo + "/commits/" + sha) : "",
        };
      },
    },
    {
      name: "github_close_pr",
      description: "关掉一个 Pull Request（不合并）",
      category: "github",
      parameters: {
        type: "object",
        properties: {
          number: { type: "number", description: "PR 编号" },
          conversationId: { type: "string", description: "会话 id（可选）" },
          __dryRun: { type: "boolean", description: "true 时只返回计划不实际执行（二次确认用）" },
        },
        required: ["number"],
      },
      handler: async (args) => {
        const a = args || {};
        const cfg = await _githubConfig(a);
        if (!cfg.ok) return { ok: false, error: cfg.error };
        const number = Number(a.number);
        if (!isFinite(number) || number <= 0) return _ghErr("PR 编号得是正数呀");
        if (a.__dryRun === true) return _ghDryRun("close_pr", { number: number });
        const r = await _githubRequest(cfg, "/pulls/" + number, "PATCH", { state: "closed" });
        if (!r.ok) return _ghErr("关闭 PR #" + number + " 失败：" + r.error);
        const p = r.data || {};
        const head = p.head && p.head.ref;
        return {
          kind: "ghPR",
          number: p.number,
          title: p.title,
          state: p.state,
          head: head,
          base: p.base && p.base.ref,
          branch: head,
          html_url: p.html_url,
        };
      },
    },
    {
      name: "github_create_pr",
      description: "从一个分支向另一个分支发起 Pull Request",
      category: "github",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "PR 标题" },
          head: { type: "string", description: "源分支（要合并的内容来源）" },
          base: { type: "string", description: "目标分支（合并到哪）" },
          body: { type: "string", description: "PR 描述（可选）" },
          conversationId: { type: "string", description: "会话 id（可选）" },
          __dryRun: { type: "boolean", description: "true 时只返回计划不实际执行（二次确认用）" },
        },
        required: ["title", "head", "base"],
      },
      handler: async (args) => {
        const a = args || {};
        const cfg = await _githubConfig(a);
        if (!cfg.ok) return { ok: false, error: cfg.error };
        if (!a.title || !a.head || !a.base) return _ghErr("标题、源分支、目标分支都得填");
        if (a.__dryRun === true) return _ghDryRun("create_pr", { title: a.title, head: a.head, base: a.base });
        const body = { title: a.title, head: a.head, base: a.base };
        if (a.body) body.body = a.body;
        const r = await _githubRequest(cfg, "/pulls", "POST", body);
        if (!r.ok) return _ghErr("创建 PR 失败：" + r.error);
        const p = r.data || {};
        const head = p.head && p.head.ref;
        return {
          kind: "ghPR",
          number: p.number,
          title: p.title,
          state: p.state,
          head: head,
          base: p.base && p.base.ref,
          branch: head,
          html_url: p.html_url,
        };
      },
    },
    {
      name: "github_list_branches",
      description: "看看仓库里有哪些分支",
      category: "github",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "最多返回几条，默认 20" },
          conversationId: { type: "string", description: "会话 id（可选）" },
        },
        required: [],
      },
      handler: async (args) => {
        const a = args || {};
        const cfg = await _githubConfig(a);
        if (!cfg.ok) return { ok: false, error: cfg.error };
        const limit = Math.min(a.limit || 20, 100);
        const r = await _githubRequest(cfg, "/branches?per_page=" + limit);
        if (!r.ok) return _ghErr(r.error);
        const arr = Array.isArray(r.data) ? r.data : [];
        const items = arr.slice(0, limit).map((b) => ({
          name: b.name,
          sha: b.commit && b.commit.sha,
          protected: !!b.protected,
        }));
        return { kind: "ghList", type: "branches", count: items.length, items: items };
      },
    },
    {
      name: "github_create_branch",
      description: "从某个分支或 commit 新建一个分支",
      category: "github",
      parameters: {
        type: "object",
        properties: {
          branch: { type: "string", description: "新分支名" },
          from: { type: "string", description: "起点分支名或 commit SHA，默认仓库主分支" },
          conversationId: { type: "string", description: "会话 id（可选）" },
          __dryRun: { type: "boolean", description: "true 时只返回计划不实际执行（二次确认用）" },
        },
        required: ["branch"],
      },
      handler: async (args) => {
        const a = args || {};
        const cfg = await _githubConfig(a);
        if (!cfg.ok) return { ok: false, error: cfg.error };
        if (!a.branch) return _ghErr("新分支名不能为空");
        const from = a.from || cfg.branch;
        if (a.__dryRun === true) return _ghDryRun("create_branch", { branch: a.branch, from: from });
        const shaRes = await _ghResolveSha(cfg, from);
        if (!shaRes.ok) return _ghErr("解析起点 " + from + " 失败：" + shaRes.error);
        const r = await _githubRequest(cfg, "/git/refs", "POST", {
          ref: "refs/heads/" + a.branch,
          sha: shaRes.sha,
        });
        if (!r.ok) return _ghErr("创建分支 " + a.branch + " 失败：" + r.error);
        return {
          ok: true,
          branch: a.branch,
          from: from,
          sha: shaRes.sha,
          html_url: "https://github.com/" + cfg.owner + "/" + cfg.repo + "/tree/" + encodeURIComponent(a.branch),
        };
      },
    },
    {
      name: "github_list_commits",
      description: "看看最近的提交记录",
      category: "github",
      parameters: {
        type: "object",
        properties: {
          branch: { type: "string", description: "分支名或 SHA，默认仓库主分支" },
          limit: { type: "number", description: "最多返回几条，默认 20" },
          conversationId: { type: "string", description: "会话 id（可选）" },
        },
        required: [],
      },
      handler: async (args) => {
        const a = args || {};
        const cfg = await _githubConfig(a);
        if (!cfg.ok) return { ok: false, error: cfg.error };
        const branch = a.branch || cfg.branch;
        const limit = Math.min(a.limit || 20, 100);
        const r = await _githubRequest(cfg, "/commits?sha=" + encodeURIComponent(branch) + "&per_page=" + limit);
        if (!r.ok) return _ghErr(r.error);
        const arr = Array.isArray(r.data) ? r.data : [];
        const items = arr.slice(0, limit).map((c) => ({
          sha: c.sha,
          message: c.commit && c.commit.message,
          author: (c.commit && c.commit.author && c.commit.author.name) || (c.author && c.author.login),
          date: c.commit && c.commit.author && c.commit.author.date,
          html_url: c.html_url,
        }));
        return { kind: "ghList", type: "commits", count: items.length, items: items };
      },
    },
    {
      name: "github_view_file",
      description: "看看仓库里某个文件的内容",
      category: "github",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件路径，如 src/index.js" },
          branch: { type: "string", description: "分支名，默认仓库主分支" },
          conversationId: { type: "string", description: "会话 id（可选）" },
        },
        required: ["path"],
      },
      handler: async (args) => {
        const a = args || {};
        const cfg = await _githubConfig(a);
        if (!cfg.ok) return { ok: false, error: cfg.error };
        if (!a.path) return _ghErr("文件路径不能为空");
        const branch = a.branch || cfg.branch;
        const r = await _githubRequest(cfg, "/contents/" + encodeURIComponent(a.path) + "?ref=" + encodeURIComponent(branch));
        if (!r.ok) return _ghErr("读不到 " + a.path + "：" + r.error);
        const d = r.data || {};
        let content = "";
        if (d.content && d.encoding === "base64") content = _ghB64Decode(d.content);
        else if (typeof d.content === "string") content = d.content;
        return {
          ok: true,
          path: d.path || a.path,
          branch: branch,
          sha: d.sha,
          size: d.size,
          html_url: d.html_url,
          content: content,
        };
      },
    },
    {
      name: "github_update_file",
      description: "修改仓库里某个文件的内容（会生成一个 commit）",
      category: "github",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件路径" },
          content: { type: "string", description: "文件新内容（完整覆盖）" },
          message: { type: "string", description: "commit 信息" },
          branch: { type: "string", description: "提交到哪个分支，默认仓库主分支" },
          conversationId: { type: "string", description: "会话 id（可选）" },
          __dryRun: { type: "boolean", description: "true 时只返回计划不实际执行（二次确认用）" },
        },
        required: ["path", "content", "message"],
      },
      handler: async (args) => {
        const a = args || {};
        const cfg = await _githubConfig(a);
        if (!cfg.ok) return { ok: false, error: cfg.error };
        if (!a.path) return _ghErr("文件路径不能为空");
        if (typeof a.content !== "string") return _ghErr("文件内容得是字符串");
        if (!a.message) return _ghErr("commit 信息不能为空");
        const branch = a.branch || cfg.branch;
        if (a.__dryRun === true) return _ghDryRun("update_file", { path: a.path, branch: branch, message: a.message });
        // 我先拿到当前文件的 sha（GitHub 更新文件要乐观锁）
        const cur = await _githubRequest(cfg, "/contents/" + encodeURIComponent(a.path) + "?ref=" + encodeURIComponent(branch));
        if (!cur.ok) return _ghErr("读不到原文件 " + a.path + "：" + cur.error);
        const fileSha = cur.data && cur.data.sha;
        if (!fileSha) return _ghErr("拿不到原文件的 sha，没法更新");
        const r = await _githubRequest(cfg, "/contents/" + encodeURIComponent(a.path), "PUT", {
          message: a.message,
          content: _ghB64Encode(a.content),
          sha: fileSha,
          branch: branch,
        });
        if (!r.ok) return _ghErr("更新 " + a.path + " 失败：" + r.error);
        const commit = (r.data && r.data.commit) || {};
        const stats = commit.stats || {};
        return {
          kind: "ghFile",
          path: a.path,
          additions: stats.additions != null ? stats.additions : 0,
          deletions: stats.deletions != null ? stats.deletions : 0,
          branch: branch,
          message: a.message,
          sha: commit.sha || "",
          html_url: commit.html_url || "",
        };
      },
    },
    {
      name: "github_list_issues",
      description: "看看仓库里有哪些 Issue",
      category: "github",
      parameters: {
        type: "object",
        properties: {
          state: { type: "string", enum: ["open", "closed", "all"], description: "Issue 状态筛选，默认 open" },
          limit: { type: "number", description: "最多返回几条，默认 20" },
          conversationId: { type: "string", description: "会话 id（可选）" },
        },
        required: [],
      },
      handler: async (args) => {
        const a = args || {};
        const cfg = await _githubConfig(a);
        if (!cfg.ok) return { ok: false, error: cfg.error };
        const state = a.state || "open";
        const limit = Math.min(a.limit || 20, 100);
        const r = await _githubRequest(cfg, "/issues?state=" + encodeURIComponent(state) + "&per_page=" + limit);
        if (!r.ok) return _ghErr(r.error);
        const arr = Array.isArray(r.data) ? r.data : [];
        // GitHub 的 /issues 接口会混入 PR，我用 pull_request 字段把 PR 滤掉
        const items = arr.slice(0, limit).filter((i) => !i.pull_request).map((i) => ({
          number: i.number,
          title: i.title,
          state: i.state,
          html_url: i.html_url,
        }));
        return { kind: "ghList", type: "issues", count: items.length, items: items };
      },
    },
    {
      name: "github_create_issue",
      description: "在仓库里提一个新 Issue",
      category: "github",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Issue 标题" },
          body: { type: "string", description: "Issue 描述（可选）" },
          conversationId: { type: "string", description: "会话 id（可选）" },
          __dryRun: { type: "boolean", description: "true 时只返回计划不实际执行（二次确认用）" },
        },
        required: ["title"],
      },
      handler: async (args) => {
        const a = args || {};
        const cfg = await _githubConfig(a);
        if (!cfg.ok) return { ok: false, error: cfg.error };
        if (!a.title) return _ghErr("Issue 标题不能为空");
        if (a.__dryRun === true) return _ghDryRun("create_issue", { title: a.title });
        const body = { title: a.title };
        if (a.body) body.body = a.body;
        const r = await _githubRequest(cfg, "/issues", "POST", body);
        if (!r.ok) return _ghErr("创建 Issue 失败：" + r.error);
        const i = r.data || {};
        return { ok: true, number: i.number, title: i.title, html_url: i.html_url };
      },
    },
    {
      name: "github_add_pr_comment",
      description: "在一个 Pull Request 下面留个评论",
      category: "github",
      parameters: {
        type: "object",
        properties: {
          number: { type: "number", description: "PR 编号" },
          body: { type: "string", description: "评论内容" },
          conversationId: { type: "string", description: "会话 id（可选）" },
          __dryRun: { type: "boolean", description: "true 时只返回计划不实际执行（二次确认用）" },
        },
        required: ["number", "body"],
      },
      handler: async (args) => {
        const a = args || {};
        const cfg = await _githubConfig(a);
        if (!cfg.ok) return { ok: false, error: cfg.error };
        const number = Number(a.number);
        if (!isFinite(number) || number <= 0) return _ghErr("PR 编号得是正数呀");
        if (!a.body) return _ghErr("评论内容不能为空");
        if (a.__dryRun === true) return _ghDryRun("add_pr_comment", { number: number });
        // PR 评论用 issues 评论接口（GitHub 里 PR 也是 issue）
        const r = await _githubRequest(cfg, "/issues/" + number + "/comments", "POST", { body: a.body });
        if (!r.ok) return _ghErr("评论 PR #" + number + " 失败：" + r.error);
        const c = r.data || {};
        return { ok: true, comment_id: c.id, pr_number: number, html_url: c.html_url };
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
