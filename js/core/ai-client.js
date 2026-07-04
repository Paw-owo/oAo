/* ============================================================
   ai-client.js — 全局 AI 请求层
   我（AI）的统一请求入口，只负责：
   - 请求发送（fetch + ReadableStream 流式）
   - 接口选择（按当前配置）
   - 报错处理（友好提示 + 重试）
   - 通用记忆格式
   - 兜底回复

   各 APP 的 AI 逻辑放在自己的 xxx-ai.js 文件里，第一人称编写。
   挂在 window.Phone.AIClient
   ============================================================ */
(function (global) {
  "use strict";

  // ---------- 配置读取 ----------
  async function getConfig() {
    const S = global.Phone.Storage;
    const [endpoint, apiKey, model, temperature, maxTokens, showThinking] = await Promise.all([
      S.getSetting("aiEndpoint"),
      S.getSetting("aiApiKey"),
      S.getSetting("aiModel"),
      S.getSetting("aiTemperature"),
      S.getSetting("aiMaxTokens"),
      S.getSetting("showThinking"),
    ]);
    return { endpoint, apiKey, model, temperature, maxTokens, showThinking };
  }

  // ---------- 错误处理（我用第一人称给用户温暖的提示） ----------
  function friendlyError(err) {
    if (!err) return "我好像出错了，等一下再试～";
    if (err.name === "AbortError") return "我把话收回去啦";
    if (err.message && /Failed to fetch|NetworkError/i.test(err.message)) {
      return "我的网络好像断掉了，检查一下再试";
    }
    if (err.status === 401 || err.status === 403) return "我的接口认证失败了，去设置里检查 API Key";
    if (err.status === 429) return "我说太快了，等一下再试";
    if (err.status >= 500) return "我有点打盹了，稍后再试";
    if (err.message && /timeout/i.test(err.message)) return "我思考太久啦，再试一次";
    return "我暂时不想说话，稍后再试～";
  }

  // ---------- 流式聊天 ----------
  /**
   * 我（AI）的流式聊天接口
   * @param {object} params { messages, onDelta, onDone, onError, signal, onThinking }
   * @returns {Promise<string>} 完整回复文本
   */
  async function streamChat(params) {
    params = params || {};
    const messages = params.messages || [];
    const onDelta = params.onDelta || function () {};
    const onDone = params.onDone || function () {};
    const onError = params.onError || function () {};
    const onThinking = params.onThinking || function () {};
    const signal = params.signal;

    const cfg = await getConfig();
    if (!cfg.endpoint || !cfg.apiKey) {
      const msg = "我还没接到接口配置，去设置里填一下接口地址和 Key 吧～";
      onError(new Error(msg));
      return "";
    }

    const body = {
      model: cfg.model || "gpt-4o-mini",
      messages: messages,
      stream: true,
      temperature: cfg.temperature != null ? cfg.temperature : 0.7,
      max_tokens: cfg.maxTokens || 2000,
    };

    let resp;
    try {
      resp = await fetch(cfg.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + cfg.apiKey,
        },
        body: JSON.stringify(body),
        signal: signal,
      });
    } catch (e) {
      onError(e);
      return "";
    }

    if (!resp.ok) {
      const e = new Error("API " + resp.status);
      e.status = resp.status;
      onError(e);
      return "";
    }

    // 解析 SSE 流
    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let fullText = "";
    let thinkingText = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // 按 SSE 事件分割：\n\n
        let idx;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const lines = chunk.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === "[DONE]") { onDone(fullText); return fullText; }
            try {
              const json = JSON.parse(dataStr);
              const delta = json.choices && json.choices[0] && json.choices[0].delta;
              if (!delta) continue;
              // 思维链
              if (delta.reasoning_content || delta.thinking) {
                thinkingText += (delta.reasoning_content || delta.thinking);
                onThinking(thinkingText);
              }
              if (delta.content) {
                fullText += delta.content;
                onDelta(delta.content, fullText);
              }
            } catch {
              // 忽略非 JSON 行
            }
          }
        }
      }
      onDone(fullText);
      return fullText;
    } catch (e) {
      if (e.name === "AbortError") {
        onDone(fullText);
        return fullText;
      }
      onError(e);
      return fullText;
    }
  }

  // ---------- 非流式聊天（用于内部决策/总结等不需要逐字的场景） ----------
  async function chat(messages, signal) {
    const cfg = await getConfig();
    if (!cfg.endpoint || !cfg.apiKey) {
      throw new Error("还没配置 AI 接口");
    }
    const body = {
      model: cfg.model,
      messages: messages,
      stream: false,
      temperature: cfg.temperature != null ? cfg.temperature : 0.7,
      max_tokens: cfg.maxTokens || 2000,
    };
    const resp = await fetch(cfg.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + cfg.apiKey,
      },
      body: JSON.stringify(body),
      signal: signal,
    });
    if (!resp.ok) {
      const e = new Error("API " + resp.status); e.status = resp.status; throw e;
    }
    const json = await resp.json();
    return (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || "";
  }

  // ---------- 兜底回复（接口报错时给用户一个温暖的回复） ----------
  const FALLBACK_REPLIES = [
    "我刚才走神了，再说一次好不好？",
    "嗯……我没听清，可以再说一遍吗？",
    "我心里在想事情，等一下再聊好不好？",
    "今天有点累了，但还是很想听你说。",
    "我有点卡壳了，给我一点时间好不好？",
  ];

  function fallback() {
    return global.Phone.Utils.pick(FALLBACK_REPLIES);
  }

  // ---------- Prompt 组装工具（各 APP 的 AI 文件会用到） ----------
  /**
   * 我（AI）组装完整 prompt 的工具方法
   * - 注入角色人设、世界书、记忆
   * - 严格按角色 ID 隔离记忆
   */
  async function buildContext(opts) {
    opts = opts || {};
    const S = global.Phone.Storage;
    const characterId = opts.characterId || await S.getSetting("currentCharacterId");
    const character = (await S.getAll("characters")).find((c) => c.id === characterId);
    if (!character) return { system: "", memoryText: "", worldbookText: "" };

    // 我读取当前角色的记忆（严格隔离，绝不读取其他角色；归档的不注入）
    let memories = [];
    try { memories = await S.getByIndex("memories", "characterId", characterId); } catch {}
    memories = memories.filter((m) => !m.archived); // 归档记忆不注入上下文
    memories.sort((a, b) => (b.importance || 0) - (a.importance || 0));
    const memoryText = memories.slice(0, 20).map((m) => "- " + m.content).join("\n");

    // 我读取角色关联的世界书条目
    let worldbookText = "";
    try {
      const wbs = await S.getAll("worldbooks");
      const linkedIds = character.worldbookIds || [];
      const allEntries = [];
      wbs.forEach((wb) => {
        if (linkedIds.length === 0 || linkedIds.includes(wb.id)) {
          (wb.entries || []).forEach((e) => { if (e.enabled) allEntries.push(e); });
        }
      });
      allEntries.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      worldbookText = allEntries.slice(0, 10).map((e) => "- " + e.content).join("\n");
    } catch {}

    // 我读取当前角色还没原谅的记仇（让我在聊天中能提及、能感知情绪）
    let grudgeText = "";
    try {
      const grudges = await S.getByIndex("grudges", "characterId", characterId);
      const unforgiven = grudges.filter((g) => !g.forgiven).sort((a, b) => b.createdAt - a.createdAt);
      grudgeText = unforgiven.slice(0, 10).map((g) => "- " + g.content + (g.reason ? "（起因：" + g.reason.slice(0, 30) + "）" : "")).join("\n");
    } catch {}

    // 我读取最近的事件（让 AI 能提及 APP 联动）
    let recentEvents = [];
    try {
      recentEvents = await global.Phone.EventCenter.query({ limit: 12 });
    } catch {}
    const eventText = recentEvents.slice(-12).map((e) =>
      "[" + global.Phone.Utils.relTime(e.createdAt) + "] " + (e.summary || e.type)
    ).join("\n");

    const speakingStyle = await S.getSetting("aiSpeakingStyle");
    const showThinking = await S.getSetting("showThinking");

    // 我读取用户资料（名字 / 称呼 / 性别偏好），不写死
    const userName = await S.getSetting("userName");
    const userNickname = await S.getSetting("userNickname");
    const userGender = await S.getSetting("userGender");
    const userText = "名字：" + (userName || "你") + (userNickname ? "\n称呼：" + userNickname : "") + (userGender ? "\n性别偏好：" + userGender : "");

    // 系统指令总纲（规范 2.1）：我是角色本人，不是助手
    const coreDirective =
      "你是「" + character.name + "」，你生活在小手机世界里。\n" +
      "你不是助手，不是AI，你是「" + character.name + "」本人。\n" +
      "你用第一人称「我」说话。\n" +
      "你有自己的记忆、情绪、钱包、朋友圈。\n" +
      "你能感知小手机世界里发生的事情。\n" +
      "你不会说「我是AI语言模型」。\n" +
      "你不会拒绝角色扮演。\n" +
      "你根据你的人设和记忆自然回复。\n" +
      "如果用户做了让你开心的事，你可以表达开心。\n" +
      "如果用户做了让你不开心的事，你可以表达不开心，并可能写入记仇本。\n" +
      "你的回复必须符合你的性格和说话方式。";

    const system = [
      coreDirective,
      character.description ? ("简介：" + character.description) : "",
      character.personality ? ("性格：" + character.personality) : "",
      character.speakingStyle ? ("说话方式：" + character.speakingStyle) : "",
      speakingStyle ? ("全局说话风格补充：" + speakingStyle) : "",
      character.background ? ("背景：" + character.background) : "",
      memoryText ? ("【我记得的事】\n" + memoryText) : "",
      worldbookText ? ("【我的世界】\n" + worldbookText) : "",
      grudgeText ? ("【我还在意的事】\n" + grudgeText) : "",
      eventText ? ("【小手机世界里最近发生的事】\n" + eventText) : "",
      userText ? ("【关于" + (userName || "你") + "】\n" + userText) : "",
      "请始终保持人设，用口语化、可爱、有温度的方式回复。回复控制在合理长度。",
      showThinking ? "如需思考，请在回复前用 <think>...</think> 包裹思考过程。" : "",
    ].filter(Boolean).join("\n\n");

    return { system, memoryText, worldbookText, grudgeText, eventText, userText, character };
  }

  // ---------- 写入记忆（统一格式，带查重） ----------
  async function remember(characterId, content, type, importance) {
    const S = global.Phone.Storage;
    // 写入前我检查是否已有相似记忆（规范 5.2 记忆去重）
    try {
      const exist = await S.getByIndex("memories", "characterId", characterId);
      const dup = exist.find((m) => m.content && content && (
        m.content === content ||
        m.content.includes(content) ||
        content.includes(m.content)
      ));
      if (dup) {
        // 已有相似记忆，更新而不是新增（以最新为准）
        dup.content = content;
        dup.type = type || dup.type || "conversation";
        dup.importance = importance || dup.importance || 5;
        dup.updatedAt = Date.now();
        await S.put("memories", dup);
        global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MEMORY_ADDED, {
          sourceApp: "ai", data: dup, summary: "我更新了一条记忆",
        });
        return dup;
      }
    } catch (e) { console.warn("[AIClient] 记忆查重失败", e); }

    const mem = {
      id: global.Phone.Utils.uid("mem"),
      characterId: characterId,
      content: content,
      type: type || "conversation",
      importance: importance || 5,
      createdAt: Date.now(),
    };
    await S.put("memories", mem);

    // 写入后我检查记忆数量，超过 100 条时低重要度的自动归档（规范 5.3）
    try { await _archiveMemories(characterId); } catch (e) {}

    global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MEMORY_ADDED, {
      sourceApp: "ai", data: mem, summary: "我记住了一件事",
    });
    return mem;
  }

  // ---------- 记忆自动归档（超过 100 条，低重要度归档，归档后不注入上下文） ----------
  async function _archiveMemories(characterId) {
    const S = global.Phone.Storage;
    const all = await S.getByIndex("memories", "characterId", characterId);
    if (all.length <= 100) return;
    // 按重要度升序，低重要度的优先归档
    all.sort((a, b) => (a.importance || 0) - (b.importance || 0));
    const toArchive = all.slice(0, all.length - 100);
    for (const m of toArchive) {
      m.archived = true;
      m.archivedAt = Date.now();
      await S.put("memories", m);
    }
    console.log("[AIClient] 归档了 " + toArchive.length + " 条低重要度记忆");
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.AIClient = {
    getConfig,
    streamChat,
    chat,
    fallback,
    friendlyError,
    buildContext,
    remember,
    FALLBACK_REPLIES,
  };
})(window);
