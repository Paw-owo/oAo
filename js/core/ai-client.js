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

  // ---------- 错误处理 ----------
  function friendlyError(err) {
    if (!err) return "出错了，请稍后再试～";
    if (err.name === "AbortError") return "请求被中断了";
    if (err.message && /Failed to fetch|NetworkError/i.test(err.message)) {
      return "网络好像断掉了，检查一下网络再试";
    }
    if (err.status === 401 || err.status === 403) return "接口认证失败，去设置里检查 API Key";
    if (err.status === 429) return "请求太频繁了，等一下再试";
    if (err.status >= 500) return "AI 服务暂时打盹了，稍后再试";
    if (err.message && /timeout/i.test(err.message)) return "AI 思考太久啦，再试一次";
    return "AI 暂时不想说话，稍后再试～";
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
      const msg = "还没配置 AI 接口，去设置里填一下接口地址和 Key 吧～";
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

    // 我读取当前角色的记忆（严格隔离，绝不读取其他角色）
    let memories = [];
    try { memories = await S.getByIndex("memories", "characterId", characterId); } catch {}
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

    const system = [
      "你是「" + character.name + "」。" + (character.description || ""),
      character.personality ? ("性格：" + character.personality) : "",
      character.speakingStyle ? ("说话方式：" + character.speakingStyle) : "",
      speakingStyle ? ("全局说话风格补充：" + speakingStyle) : "",
      character.background ? ("背景：" + character.background) : "",
      memoryText ? ("你记得这些事：\n" + memoryText) : "",
      worldbookText ? ("世界观设定：\n" + worldbookText) : "",
      eventText ? ("最近发生的事：\n" + eventText) : "",
      "请始终保持人设，用口语化、可爱、有温度的方式回复。回复控制在合理长度。",
      showThinking ? "如需思考，请在回复前用 <think>...</think> 包裹思考过程。" : "",
    ].filter(Boolean).join("\n\n");

    return { system, memoryText, worldbookText, eventText, character };
  }

  // ---------- 写入记忆（统一格式） ----------
  async function remember(characterId, content, type, importance) {
    const S = global.Phone.Storage;
    const mem = {
      id: global.Phone.Utils.uid("mem"),
      characterId: characterId,
      content: content,
      type: type || "conversation",
      importance: importance || 5,
      createdAt: Date.now(),
    };
    await S.put("memories", mem);
    global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MEMORY_ADDED, {
      sourceApp: "ai", data: mem, summary: "我记住了一件事",
    });
    return mem;
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
