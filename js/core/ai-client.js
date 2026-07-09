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

  // GitHub 写操作工具名单：执行前需要二次确认（onWriteTool 回调）
  // 只列写操作，读操作（list_prs/view_pr/list_branches/list_commits/view_file/list_issues）不需要确认
  const GITHUB_WRITE_TOOLS = [
    "github_merge_pr",
    "github_close_pr",
    "github_create_pr",
    "github_create_branch",
    "github_update_file",
    "github_create_issue",
    "github_add_pr_comment",
  ];

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
    // 我把"未配置接口"这种带明确引导的提示原样透传，不吞掉
    if (err.message && /接口配置|接口地址|API Key/.test(err.message)) return err.message;
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
   * @param {object} params { messages, onDelta, onDone, onError, signal, onThinking,
   *   tools?, model?, temperature?, thinking?, streamUsage?, onToolResult?, onWriteTool? }
   *   - tools: 显式传入的 OpenAI tools 数组；传了就用它（空数组=不带工具），不传走 McpClient 默认
   *   - model: 覆盖默认模型
   *   - temperature: 覆盖默认温度
   *   - thinking: true 时带 extended_thinking 参数（会话级思维链）
   *   - streamUsage: 默认 true，请求带 stream_options.include_usage 让最后一帧返回 usage
   *   - onToolResult?: (toolName, args, result) => void  每次工具执行完回调（含被取消的）
   *       result 是工具返回的数据对象（已 JSON.parse）。可选，不传时行为不变
   *   - onWriteTool?: (toolName, args) => Promise<boolean>  写操作执行前二次确认
   *       返回 true=确认执行，false=取消（构造取消的 tool result 继续递归）。可选，不传时不拦截
   *   onDone 签名：(fullText, usage?)  usage = { prompt_tokens, completion_tokens, total_tokens }
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
    // 我读取递归深度（MCP 工具调用递归用），外部不传时默认 0
    const depth = params._depth || 0;
    // 我累积流式分片过来的 tool_calls
    let _pendingToolCalls = [];
    // 我累积最后一帧的 token 用量（OpenAI 在 stream_options.include_usage 时随 [DONE] 前一帧返回）
    let _usage = null;

    const cfg = await getConfig();
    if (!cfg.endpoint || !cfg.apiKey) {
      const msg = "我还没接到接口配置，去设置里填一下接口地址和 Key 吧～";
      onError(new Error(msg));
      return "";
    }

    const body = {
      model: params.model || cfg.model || "gpt-4o-mini",
      messages: messages,
      stream: true,
      temperature: params.temperature != null ? params.temperature : (cfg.temperature != null ? cfg.temperature : 0.7),
      max_tokens: cfg.maxTokens || 2000,
    };
    // 会话级思维链：带 extended_thinking 参数（不同中转站兼容性不同，我用通用字段名）
    if (params.thinking) {
      body.extended_thinking = true;
    }
    // 我注入工具：外部显式传 tools 时以外部为准（空数组=不带工具），否则走 McpClient 默认
    if (Array.isArray(params.tools)) {
      if (params.tools.length) {
        body.tools = params.tools;
        body.tool_choice = "auto";
      }
    } else if (global.Phone.McpClient && global.Phone.McpClient.isEnabled()) {
      const tools = global.Phone.McpClient.toOpenAITools();
      if (tools && tools.length) {
        body.tools = tools;
        body.tool_choice = "auto";
      }
    }
    // 我请求带 usage（默认开），好把 token 用量回传给上层
    if (params.streamUsage !== false) {
      body.stream_options = { include_usage: true };
    }

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
      streamLoop:
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
            // 收到 [DONE] 我跳出循环，统一到下面处理工具调用和 onDone
            if (dataStr === "[DONE]") break streamLoop;
            try {
              const json = JSON.parse(dataStr);
              // 我抓最后一帧的 token 用量（OpenAI 在 include_usage 时单独发一帧 usage）
              if (json.usage) _usage = json.usage;
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
              // 我累积流式过来的 tool_calls 分片
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index || 0;
                  if (!_pendingToolCalls[idx]) _pendingToolCalls[idx] = { id: "", name: "", arguments: "" };
                  if (tc.id) _pendingToolCalls[idx].id = tc.id;
                  if (tc.function) {
                    if (tc.function.name) _pendingToolCalls[idx].name = tc.function.name;
                    if (tc.function.arguments) _pendingToolCalls[idx].arguments += tc.function.arguments;
                  }
                }
              }
            } catch {
              // 忽略非 JSON 行
            }
          }
        }
      }
      // 流结束后，我处理 MCP 工具调用
      const validToolCalls = _pendingToolCalls.filter((tc) => tc.id && tc.name);
      if (validToolCalls.length && global.Phone.McpClient && global.Phone.McpClient.isEnabled() && depth < 3) {
        // 我把累积的 tool_calls 转成 OpenAI 标准形状（callToolCall 需要这个形状）
        const openaiToolCalls = validToolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        }));
        // 构造 assistant message（带 tool_calls）
        const assistantMsg = { role: "assistant", content: fullText || null, tool_calls: openaiToolCalls };
        // 我执行每个工具，拿到 tool 结果 message
        const toolResults = [];
        for (const otc of openaiToolCalls) {
          const toolName = otc.function.name;
          let args = {};
          try { args = JSON.parse(otc.function.arguments || "{}"); } catch (_) {}
          // 写操作二次确认：onWriteTool 返回 false 时跳过执行，构造一个取消的 tool result
          if (GITHUB_WRITE_TOOLS.indexOf(toolName) >= 0 && typeof params.onWriteTool === "function") {
            let confirmed = true;
            try { confirmed = await params.onWriteTool(toolName, args); } catch (_) { confirmed = false; }
            if (!confirmed) {
              toolResults.push({
                tool_call_id: otc.id,
                role: "tool",
                content: JSON.stringify({ ok: false, cancelled: true, error: "用户取消了此操作" }),
              });
              // 取消的操作也通知上层（让 UI 能反映"已取消"）
              if (typeof params.onToolResult === "function") {
                try { params.onToolResult(toolName, args, { ok: false, cancelled: true, error: "用户取消了此操作" }); } catch (_) {}
              }
              continue;
            }
          }
          const result = await global.Phone.McpClient.callToolCall(otc);
          toolResults.push(result);
          // 新增：通知上层工具执行结果（用于生成 GitHub 卡片等 UI 联动）
          if (typeof params.onToolResult === "function") {
            try {
              const parsed = (result && typeof result.content === "string")
                ? JSON.parse(result.content)
                : (result && result.content);
              params.onToolResult(toolName, args, parsed);
            } catch (_) {}
          }
        }
        // 我把工具结果送回去，递归调用让模型继续生成（透传会话级 tools/model/temperature/thinking/streamUsage + onToolResult/onWriteTool）
        const newMessages = messages.concat([assistantMsg], toolResults);
        return await streamChat({
          messages: newMessages, onDelta, onDone, onError, signal, onThinking,
          tools: params.tools, model: params.model, temperature: params.temperature,
          thinking: params.thinking, streamUsage: params.streamUsage,
          onToolResult: params.onToolResult, onWriteTool: params.onWriteTool,
          _depth: depth + 1,
        });
      }
      onDone(fullText, _usage);
      return fullText;
    } catch (e) {
      if (e.name === "AbortError") {
        onDone(fullText, _usage);
        return fullText;
      }
      onError(e);
      return fullText;
    }
  }

  // ---------- 非流式聊天（用于内部决策/总结等不需要逐字的场景） ----------
  async function chat(messages, signal, _depth, opts) {
    _depth = _depth || 0;
    opts = opts || {};
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
    // 我注入工具：外部显式传 opts.tools 时以外部为准（空数组=不带工具），否则走 McpClient 默认
    if (Array.isArray(opts.tools)) {
      if (opts.tools.length) {
        body.tools = opts.tools;
        body.tool_choice = "auto";
      }
    } else if (global.Phone.McpClient && global.Phone.McpClient.isEnabled()) {
      const tools = global.Phone.McpClient.toOpenAITools();
      if (tools && tools.length) {
        body.tools = tools;
        body.tool_choice = "auto";
      }
    }
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
    const message = (json.choices && json.choices[0] && json.choices[0].message) || {};
    // 我处理非流式返回的 tool_calls（这里 message.tool_calls 已是 OpenAI 标准形状，可直接喂给 callToolCall）
    const toolCalls = message.tool_calls;
    if (toolCalls && toolCalls.length && global.Phone.McpClient && global.Phone.McpClient.isEnabled() && _depth < 3) {
      // 我执行每个工具，拿到 tool 结果 message
      const toolResults = [];
      for (const tc of toolCalls) {
        const result = await global.Phone.McpClient.callToolCall(tc);
        toolResults.push(result);
      }
      // 我把 assistant 的 tool_calls message 和 tool 结果一起送回去，递归调用
      const newMessages = messages.concat([message], toolResults);
      return await chat(newMessages, signal, _depth + 1, opts);
    }
    return message.content || "";
  }

  // ---------- 我从 chat/completions URL 推导 models URL ----------
  function _deriveModelsUrl(endpoint) {
    if (!endpoint) return "";
    let url = endpoint.trim();
    // 已是 models URL
    if (/\/models\/?$/i.test(url)) return url;
    // 去掉 /chat/completions
    url = url.replace(/\/chat\/completions\/?$/i, "");
    // 去掉末尾斜杠
    url = url.replace(/\/$/, "");
    // 如果没有 /v1，加上
    if (!/\/v\d+$/i.test(url)) url += "/v1";
    return url + "/models";
  }

  // ---------- 我拉取可用模型列表 ----------
  /**
   * 我拉取可用模型列表
   * @param {object} opts { endpoint?, apiKey?, signal? }
   * @returns {Promise<{ok, models?, error?}>}
   *   models: [{id, name?, owned_by?}]
   */
  async function fetchModels(opts) {
    opts = opts || {};
    const cfg = await getConfig();
    const endpoint = opts.endpoint || cfg.endpoint;
    const apiKey = opts.apiKey || cfg.apiKey;
    if (!endpoint || !apiKey) {
      return { ok: false, error: "我还没接到接口配置，去设置里填一下接口地址和 Key 吧～" };
    }
    // 我从 chat/completions URL 推导 models URL
    const modelsUrl = _deriveModelsUrl(endpoint);
    try {
      const resp = await fetch(modelsUrl, {
        method: "GET",
        headers: { "Authorization": "Bearer " + apiKey },
        signal: opts.signal,
      });
      if (!resp.ok) {
        return { ok: false, error: "拉取失败：" + resp.status };
      }
      const json = await resp.json();
      const list = (json.data || json.models || []).map((m) => ({
        id: m.id || m.name,
        name: m.name || m.id,
        owned_by: m.owned_by || m.owner || "",
      }));
      return { ok: true, models: list };
    } catch (e) {
      if (e.name === "AbortError") return { ok: false, error: "我把请求收回去啦" };
      return { ok: false, error: friendlyError(e) };
    }
  }

  // ---------- 常用模型预设（用户没接口也能快速选） ----------
  const POPULAR_MODELS = [
    { id: "gpt-4o-mini", name: "GPT-4o mini", provider: "OpenAI" },
    { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI" },
    { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider: "OpenAI" },
    { id: "deepseek-chat", name: "DeepSeek Chat", provider: "DeepSeek" },
    { id: "deepseek-reasoner", name: "DeepSeek Reasoner", provider: "DeepSeek" },
    { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", provider: "Anthropic" },
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", provider: "Anthropic" },
    { id: "qwen-turbo", name: "Qwen Turbo", provider: "阿里" },
    { id: "qwen-plus", name: "Qwen Plus", provider: "阿里" },
    { id: "glm-4-flash", name: "GLM-4 Flash", provider: "智谱" },
    { id: "glm-4", name: "GLM-4", provider: "智谱" },
    { id: "moonshot-v1-8k", name: "Moonshot v1 8k", provider: "月之暗面" },
  ];

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
    // 我读取可配置的软约束开关和提示语（默认值见 storage.js 的 DEFAULT_SETTINGS）
    // 走 State 内存缓存，避免每次 buildContext 都查 IndexedDB
    const aiFirstPerson = global.Phone.State.get("aiFirstPerson") !== false;
    const aiHasOwnLife = global.Phone.State.get("aiHasOwnLife") !== false;
    const aiSenseWorld = global.Phone.State.get("aiSenseWorld") !== false;
    const aiEmotionalResponse = global.Phone.State.get("aiEmotionalResponse") !== false;
    const aiReplyLength = global.Phone.State.get("aiReplyLength") || "normal";
    const aiThinkTag = global.Phone.State.get("aiThinkTag") || "<think >...</think >";

    // 我读取用户资料（名字 / 称呼 / 性别偏好），不写死
    const userName = await S.getSetting("userName");
    const userNickname = await S.getSetting("userNickname");
    const userGender = await S.getSetting("userGender");
    const userText = "名字：" + (userName || "你") + (userNickname ? "\n称呼：" + userNickname : "") + (userGender ? "\n性别偏好：" + userGender : "");

    // 系统指令总纲（规范 2.1）：我是角色本人，不是助手
    // 硬约束：产品哲学层，写死、不受设置控制
    const hardDirective = [
      "你是「" + character.name + "」，你生活在小手机世界里。",
      "你不是助手，不是AI，你是「" + character.name + "」本人。",
      "你不会说「我是AI语言模型」。",
      "你不会拒绝角色扮演。",
      "你根据你的人设和记忆自然回复。",
      "你的回复必须符合你的性格和说话方式。",
    ].join("\n");

    // 软约束：受设置控制，用户可关
    const softDirective = [];
    if (aiFirstPerson) softDirective.push("你用第一人称「我」说话。");
    if (aiHasOwnLife) softDirective.push("你有自己的记忆、情绪、钱包、朋友圈。");
    if (aiSenseWorld) softDirective.push("你能感知小手机世界里发生的事情。");
    if (aiEmotionalResponse) {
      softDirective.push("如果用户做了让你开心的事，你可以表达开心。");
      softDirective.push("如果用户做了让你不开心的事，你可以表达不开心，并可能写入记仇本。");
    }
    const coreDirective = softDirective.length ? (hardDirective + "\n" + softDirective.join("\n")) : hardDirective;

    // 默认风格：用户没设全局风格时，我才注入默认风格；设了就完全交给用户
    const styleLine = speakingStyle ? ("全局说话风格补充：" + speakingStyle) : "请用口语化、可爱、有温度的方式回复，保持人设。";

    // 回复长度提示：可配置（short / normal / long）
    const replyLenMap = {
      short: "回复要简短，一两句话就好",
      normal: "回复控制在合理长度",
      long: "回复可以详细一些",
    };
    const replyLenLine = replyLenMap[aiReplyLength] || replyLenMap.normal;

    const system = [
      coreDirective,
      character.description ? ("简介：" + character.description) : "",
      character.personality ? ("性格：" + character.personality) : "",
      character.speakingStyle ? ("说话方式：" + character.speakingStyle) : "",
      styleLine,
      character.background ? ("背景：" + character.background) : "",
      memoryText ? ("【我记得的事】\n" + memoryText) : "",
      worldbookText ? ("【我的世界】\n" + worldbookText) : "",
      grudgeText ? ("【我还在意的事】\n" + grudgeText) : "",
      eventText ? ("【小手机世界里最近发生的事】\n" + eventText) : "",
      userText ? ("【关于" + (userName || "你") + "】\n" + userText) : "",
      replyLenLine,
      showThinking ? ("如需思考，请在回复前用 " + aiThinkTag + " 包裹思考过程。") : "",
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

  // ---------- 我把用户的话改写成角色第一人称（写记忆前用，符合 memory-system 第一人称规范） ----------
  // 用极短 prompt 调非流式 chat 改写，失败回退原样，绝不阻塞主流程
  async function rewriteMemoryAsCharacter(characterId, userText) {
    if (!userText) return userText;
    try {
      const character = await getCharacter(characterId);
      const name = (character && character.name) || "我";
      const sys = [
        "你是「" + name + "」。把下面用户说的话，改写成「你（" + name + "）」视角的第一人称记忆陈述。",
        "只输出改写后的一句话，不要解释，不要加引号，保留关键信息（人名/时间/喜好/事实）。",
        "示例：用户说「我喜欢吃草莓」→「我喜欢吃草莓」；用户说「小明明天生日」→「小明明天过生日，我要记住」。",
      ].join("\n");
      // 改写不带工具，避免触发 MCP 拖慢或副作用
      const rewritten = await chat([
        { role: "system", content: sys },
        { role: "user", content: String(userText).slice(0, 300) },
      ], null, 0, { tools: [] });
      const out = (rewritten || "").trim();
      return out || userText;
    } catch (e) {
      console.warn("[AIClient] 记忆第一人称改写失败，回退原样", e);
      return userText;
    }
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
  }

  // ---------- 我删除单条记忆 ----------
  // 注意：我不动其他记忆，也不调 _archiveMemories，只把这一条抹掉
  async function forget(memoryId) {
    const S = global.Phone.Storage;
    const mem = await S.get("memories", memoryId);
    await S.del("memories", memoryId);
    global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MEMORY_ADDED, {
      sourceApp: "ai",
      data: { id: memoryId, deleted: true, memory: mem },
      summary: "我忘了一件事",
    });
    return true;
  }

  // ---------- 我查询某角色的记忆（按条件筛选） ----------
  // opts = { type?, importanceMin?, archived?, limit? }
  // 默认我只返回未归档的记忆，跟 buildContext 的口径一致
  async function queryMemory(characterId, opts) {
    opts = opts || {};
    const S = global.Phone.Storage;
    let list = await S.getByIndex("memories", "characterId", characterId);
    if (opts.type) list = list.filter((m) => m.type === opts.type);
    if (typeof opts.importanceMin === "number") {
      list = list.filter((m) => (m.importance || 0) >= opts.importanceMin);
    }
    const archivedFilter = typeof opts.archived === "boolean" ? opts.archived : false;
    list = list.filter((m) => !!m.archived === archivedFilter);
    list.sort((a, b) => (b.importance || 0) - (a.importance || 0));
    if (opts.limit) list = list.slice(0, opts.limit);
    return list;
  }

  // ---------- 我手动归档/取消归档一条记忆 ----------
  async function archiveMemory(memoryId, archived) {
    const S = global.Phone.Storage;
    const mem = await S.get("memories", memoryId);
    if (!mem) return null;
    mem.archived = !!archived;
    mem.archivedAt = archived ? Date.now() : null;
    mem.updatedAt = Date.now();
    await S.put("memories", mem);
    global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MEMORY_ADDED, {
      sourceApp: "ai",
      data: mem,
      summary: archived ? "我把一条记忆收起来了" : "我又想起了一件事",
    });
    return mem;
  }

  // ---------- 我列出所有角色 ----------
  async function listCharacters() {
    return await global.Phone.Storage.getAll("characters");
  }

  // ---------- 我切换当前角色 ----------
  async function switchCharacter(characterId) {
    await global.Phone.State.set("currentCharacterId", characterId);
    global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.CHARACTER_SWITCHED, {
      sourceApp: "ai",
      data: { characterId: characterId },
      summary: "我换了一个我",
    });
    return characterId;
  }

  // ---------- 我获取单个角色（不传 id 时默认读当前角色） ----------
  async function getCharacter(characterId) {
    const S = global.Phone.Storage;
    const id = characterId || await S.getSetting("currentCharacterId");
    if (!id) return null;
    return await S.get("characters", id);
  }

  // ---------- 我显式创建一条记忆（不查重，直接落库） ----------
  // 和 remember 的区别：remember 会查重并合并，createMemory 不查重，每次都新增一条
  async function createMemory(opts) {
    opts = opts || {};
    const S = global.Phone.Storage;
    const mem = {
      id: global.Phone.Utils.uid("mem"),
      characterId: opts.characterId,
      content: opts.content,
      type: opts.type || "conversation",
      importance: opts.importance || 5,
      createdAt: Date.now(),
    };
    await S.put("memories", mem);
    // 写入后我同样检查记忆数量，保留 _archiveMemories 自动归档机制不被破坏
    try { await _archiveMemories(opts.characterId); } catch (e) {}
    global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MEMORY_ADDED, {
      sourceApp: "ai",
      data: mem,
      summary: "我又多记了一件事",
    });
    return mem;
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.AIClient = {
    getConfig,
    streamChat,
    chat,
    fetchModels,
    POPULAR_MODELS,
    fallback,
    friendlyError,
    buildContext,
    remember,
    rewriteMemoryAsCharacter,
    FALLBACK_REPLIES,
    // 记忆管理
    forget,
    queryMemory,
    archiveMemory,
    createMemory,
    // 角色管理
    listCharacters,
    switchCharacter,
    getCharacter,
  };
})(window);
