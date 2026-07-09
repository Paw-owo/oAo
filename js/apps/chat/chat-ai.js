/* ============================================================
   chat-ai.js — 消息中心 AI 说明书
   我（AI）在消息中心的能力定义
   第一人称编写，AI 自称"我"

   我能做的事：
   - 读取当前角色的对话历史，给出符合人设的回复
   - 流式逐字输出，让用户看到我"正在说话"
   - 读取最近事件，在聊天中自然提及（朋友圈/礼物/游戏/纪念日等）
   - 根据对话内容自动写入记忆（重要的事我会记住，且用我的第一人称记）
   - 用户让我不开心时，我会自动写一条记仇本
   - 用户道歉时，我会选择原谅
   - 支持会话级温度 / 模型 / 思维链 / MCP 工具开关覆盖
   - 采集 token 用量，通过 onDone(meta) 回传给上层

   挂在 window.Phone.ChatAI
   ============================================================ */
(function (global) {
  "use strict";

  /**
   * 我（AI）根据当前对话历史生成回复
   * @param {object} opts {
   *   characterId, conversationId（必需，用于读会话级设置）,
   *   messages, onDelta, onDone, onError, onThinking, signal,
   *   onToolResult?, onWriteTool?  (透传给 streamChat，用于 GitHub 工具结果联动 / 写操作二次确认)
   * }
   *   onDone(meta): meta = { text: 完整回复文本, tokens: {in, out} | null }
   *   onToolResult?: (toolName, args, result) => void
   *   onWriteTool?: (toolName, args) => Promise<boolean>
   * @returns {Promise<string>} 我的完整回复
   */
  async function reply(opts) {
    opts = opts || {};
    const AIClient = global.Phone.AIClient;
    const Storage = global.Phone.Storage;
    const convId = opts.conversationId;

    // 我组装上下文：人设 + 世界书 + 记忆 + 最近事件
    const ctx = await AIClient.buildContext({ characterId: opts.characterId });

    // 把对话历史传给我（只保留近 20 条避免太长）
    const history = (opts.messages || []).slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const myMessages = [{ role: "system", content: ctx.system }];
    // 我严格按角色隔离，绝不混入其他角色的历史
    myMessages.push.apply(myMessages, history);

    // ---------- 我读取会话级覆盖设置（规范 10） ----------
    const overrides = await _readConvOverrides(convId);

    // ---------- 我组装 MCP 工具（会话级开关，!== false 即启用） ----------
    const tools = _buildConvTools(convId, await _readConvToolFlags(convId));

    // 我拦截 streamChat 的 onDone 拿 token 用量，再统一用 meta 调用上层 onDone
    let _usage = null;
    const fullText = await AIClient.streamChat({
      messages: myMessages,
      onDelta: opts.onDelta || function () {},
      onDone: (text, usage) => { _usage = usage || null; },
      onError: opts.onError || function () {},
      onThinking: opts.onThinking || function () {},
      signal: opts.signal,
      // 会话级覆盖
      tools: tools,
      temperature: overrides.temperature,
      thinking: overrides.thinking,
      model: overrides.model,
      // GitHub 工具结果联动 / 写操作二次确认（透传给 streamChat，可选）
      onToolResult: opts.onToolResult,
      onWriteTool: opts.onWriteTool,
    });

    // 我把完整文本 + token 用量一起回传给上层（meta 约定）
    if (typeof opts.onDone === "function") {
      try {
        await opts.onDone({
          text: fullText,
          tokens: _usage ? { in: _usage.prompt_tokens, out: _usage.completion_tokens } : null,
        });
      } catch (e) {
        console.warn("[ChatAI] onDone 回调出错", e);
      }
    }

    // 回复完成后，我自动判断要不要记仇或记住
    if (fullText && opts.characterId) {
      try {
        await _afterReply(fullText, opts, ctx);
      } catch (e) {
        console.warn("[ChatAI] 我处理后续时出错了", e);
      }
    }

    return fullText;
  }

  // ---------- 我读取会话级覆盖（温度 / 思维链 / 模型） ----------
  async function _readConvOverrides(convId) {
    const out = { temperature: undefined, thinking: undefined, model: undefined };
    if (!convId) return out;
    try {
      // 会话级温度：0~2 的数才覆盖全局 aiTemperature
      const tempVal = await global.Phone.Storage.getSetting("chat.temp_" + convId);
      if (typeof tempVal === "number" && isFinite(tempVal) && tempVal >= 0 && tempVal <= 2) {
        out.temperature = tempVal;
      }
      // 会话级思维链：null/undefined=跟随全局 showThinking，true/false=会话级覆盖
      const thinkVal = await global.Phone.Storage.getSetting("chat.thinking_" + convId);
      if (thinkVal === true) out.thinking = true;
      else if (thinkVal === false) out.thinking = false;
      else out.thinking = global.Phone.State.get("showThinking") === true;
      // 会话级模型：有值则覆盖默认模型
      const modelVal = await global.Phone.Storage.getSetting("chat.model_" + convId);
      if (modelVal) out.model = modelVal;
    } catch (e) {
      console.warn("[ChatAI] 读取会话级覆盖失败", e);
    }
    return out;
  }

  // ---------- 我读取会话级 MCP 工具开关 ----------
  async function _readConvToolFlags(convId) {
    const flags = {}; // toolName -> true/false
    if (!convId) return flags;
    try {
      const McpClient = global.Phone.McpClient;
      if (!McpClient || !McpClient.isEnabled()) return flags;
      const all = McpClient.list() || [];
      for (const t of all) {
        // !== false 即启用（默认启用）
        const v = await global.Phone.Storage.getSetting("chat.mcp_" + convId + "_" + t.name);
        flags[t.name] = v !== false;
      }
    } catch (e) {
      console.warn("[ChatAI] 读取会话级工具开关失败", e);
    }
    return flags;
  }

  // ---------- 我按开关构造 OpenAI tools 数组 ----------
  function _buildConvTools(convId, flags) {
    const McpClient = global.Phone.McpClient;
    // 全局关时返回空数组（显式传空，覆盖 streamChat 默认注入）
    if (!McpClient || !McpClient.isEnabled()) return [];
    const all = McpClient.list() || [];
    const enabled = all.filter((t) => flags[t.name] !== false);
    return enabled.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description || "",
        parameters: t.parameters || { type: "object", properties: {}, required: [] },
      },
    }));
  }

  // 我回复完后的自动行为
  async function _afterReply(text, opts, ctx) {
    // 修复 AIClient 自由变量：_afterReply 原先引用了 reply 内的 AIClient，会 ReferenceError
    const AIClient = global.Phone.AIClient;
    const EventCenter = global.Phone.EventCenter;
    const Storage = global.Phone.Storage;

    // 我检测到生气/不开心情绪，自动写一条记仇本
    if (/记仇|气死|讨厌你|不原谅|哼|生气了|再也不理|不理你了/.test(text)) {
      const lastUserMsg = (opts.messages || []).slice().reverse().find((m) => m.role === "user");
      const grudge = {
        id: global.Phone.Utils.uid("grudge"),
        characterId: opts.characterId,
        content: lastUserMsg ? lastUserMsg.content : "用户做了让我不开心的事",
        reason: text.slice(0, 100),
        forgiven: false,
        createdAt: Date.now(),
      };
      try {
        await Storage.put("grudges", grudge);
        EventCenter.emit(EventCenter.TYPES.GRUDGE_CREATED, {
          sourceApp: "chat",
          data: grudge,
          summary: "我有点记仇了：" + (lastUserMsg ? lastUserMsg.content.slice(0, 20) : ""),
        });
      } catch (e) { console.warn("[ChatAI] 写记仇本失败", e); }
    }

    // 我检测到用户道歉，自动原谅最近一条未原谅的记仇
    const lastUser = (opts.messages || []).slice().reverse().find((m) => m.role === "user");
    if (lastUser && /对不起|抱歉|我错了|原谅我|别生气了|我道歉/.test(lastUser.content)) {
      try {
        const grudges = await Storage.getByIndex("grudges", "characterId", opts.characterId);
        const unforgiven = grudges.filter((g) => !g.forgiven).sort((a, b) => b.createdAt - a.createdAt);
        if (unforgiven.length > 0) {
          const g = unforgiven[0];
          g.forgiven = true;
          g.forgivenAt = Date.now();
          await Storage.put("grudges", g);
          EventCenter.emit(EventCenter.TYPES.GRUDGE_FORGIVEN, {
            sourceApp: "chat",
            data: g,
            summary: "我原谅了用户一件事",
          });
        }
      } catch (e) { console.warn("[ChatAI] 原谅失败", e); }
    }

    // 重要的事我会记住（简单的启发式：含"记住""别忘了""我喜欢""我叫"等）
    // 记忆内容我用角色第一人称改写后再 remember（符合 memory-system 第一人称规范）
    if (lastUser && /记住|别忘了|我喜欢|我叫|我的名字|我生日|我是|我最喜欢/.test(lastUser.content)) {
      try {
        const rewritten = await AIClient.rewriteMemoryAsCharacter(opts.characterId, lastUser.content);
        await AIClient.remember(opts.characterId, rewritten, "preference", 8);
      } catch (e) { console.warn("[ChatAI] 记忆写入失败", e); }
    }

    // 钱包联动（规范 3.5）：用户说"我给你转账XX元"时触发
    if (lastUser && /转账|给你(\d+|块|元)|发你(\d+|块|元)|发红包/.test(lastUser.content)) {
      try {
        const match = lastUser.content.match(/(\d+)\s*(块|元|圆)/);
        const amount = match ? parseInt(match[1], 10) : 0;
        if (amount > 0 && global.Phone.Wallet && global.Phone.Wallet.userToAi) {
          const r = await global.Phone.Wallet.userToAi(amount, "聊天中转账给" + (ctx.character ? ctx.character.name : "AI"));
          if (r && r.ok) {
            global.Phone.Notify.push({ appId: "wallet", title: "已转账 " + amount + " 元给" + (ctx.character ? ctx.character.name : "AI") });
          }
        }
      } catch (e) { console.warn("[ChatAI] 钱包联动失败", e); }
    }

    // 朋友圈触发（规范 3.4）：聊天中发生有趣的事，我有概率自动发朋友圈
    // 不是每次都发，约 15% 概率，且用户消息足够长（>10字）才考虑
    if (lastUser && lastUser.content && lastUser.content.length > 10 && Math.random() < 0.15) {
      try {
        const Moments = global.Phone.Moments;
        if (Moments && Moments.postAsCharacter) {
          // 用简单模板，避免再调 AI 接口消耗 token
          const templates = [
            "刚刚和{用户}聊了聊天，心情变好了呢",
            "今天和{用户}的对话让我有点感触",
            "嘿嘿，{用户}跟我说了一些有趣的事",
            "聊着聊着就觉得，能这样陪着{用户}真好",
            "{用户}今天来找我说话啦，开心~",
          ];
          const userName = await global.Phone.Storage.getSetting("userName") || "你";
          const tpl = templates[Math.floor(Math.random() * templates.length)];
          const content = tpl.replace(/\{用户\}/g, userName);
          await Moments.postAsCharacter(opts.characterId, content, []);
        }
      } catch (e) { console.warn("[ChatAI] 朋友圈触发失败", e); }
    }
  }

  // 我生成一个"正在输入"的延迟（让打字状态更自然）
  function fakeTypingDelay() {
    return 400 + Math.random() * 600;
  }

  // ============================================================
  // 群聊回复（规范第 9 节）
  // 我（某个 AI 成员）在群聊上下文里独立回复
  // 与 reply() 的区别：
  //   - systemPrompt 来自 character.systemPrompt（人设管理 APP 写入）或回退 buildContext
  //   - 上下文消息里 AI 消息保留 role=assistant，但 content 前加 "[角色名]: " 前缀
  //     让我能区分群里多条 AI 回复分别是谁说的
  //   - onDone(meta) 签名与 reply() 一致：{ text, tokens: {in, out} | null }
  // ============================================================
  async function replyGroup(opts) {
    opts = opts || {};
    const AIClient = global.Phone.AIClient;
    const Storage = global.Phone.Storage;
    const convId = opts.conversationId;
    const members = Array.isArray(opts.members) ? opts.members : [];
    const me = members.find((m) => m.id === opts.characterId) || { id: opts.characterId, name: "AI" };

    // 我组装自己的 system message：
    // 优先用 character.systemPrompt（人设管理 APP 写入的纯人设），
    // 没有就走 buildContext 拿到完整 system（含记忆/世界书/记仇/事件）
    let systemPrompt = "";
    let ctx = null;
    try {
      const char = (await Storage.getAll("characters")).find((c) => c.id === opts.characterId);
      if (char && char.systemPrompt && String(char.systemPrompt).trim()) {
        systemPrompt = String(char.systemPrompt);
      } else {
        ctx = await AIClient.buildContext({ characterId: opts.characterId });
        systemPrompt = ctx.system;
      }
    } catch (e) {
      console.warn("[ChatAI] replyGroup 组装 systemPrompt 失败", e);
    }

    // 群聊上下文提示：告诉我这是群聊，我是谁，还有谁在
    const otherNames = members.filter((m) => m.id !== me.id).map((m) => m.name || "AI");
    const groupHint = [
      "【群聊场景】",
      "你现在在一个群聊里，群里有用户和其他 AI 成员。",
      "你是「" + (me.name || "AI") + "」，只代表你自己说话，不要替其他成员发言。",
      "群里其他 AI 成员：" + (otherNames.length ? otherNames.join("、") : "（无）") + "。",
      "用户消息可能用 @你的名字 单独点名你，被 @ 到你才必须回复；没被 @ 时按群聊自然节奏判断要不要接话。",
      "回复时不要在内容里加自己的名字前缀，直接说内容即可。",
    ].join("\n");

    const finalSystem = systemPrompt ? (systemPrompt + "\n\n" + groupHint) : groupHint;

    // 我把上下文消息做群聊适配：
    // - 用户消息：原样保留（content 里可能含 @角色名）
    // - AI 消息：按 msg.senderId 找到对应成员名，content 前加 "[角色名]: " 前缀
    //   这样我能看清群里每条 AI 消息是谁说的，避免把别人的话当成自己说的
    const memberMap = {};
    members.forEach((m) => { memberMap[m.id] = m; });
    const history = (opts.messages || []).slice(-30).map((m) => {
      if (m.role === "user") {
        return { role: "user", content: m.content };
      }
      // assistant 消息
      const sender = m.senderId ? memberMap[m.senderId] : null;
      const senderName = sender ? (sender.name || "AI") : "AI";
      return { role: "assistant", content: "[" + senderName + "]: " + (m.content || "") };
    });

    const myMessages = [{ role: "system", content: finalSystem }];
    myMessages.push.apply(myMessages, history);

    // ---------- 我复用 reply() 的会话级覆盖（温度/思维链/模型/MCP工具） ----------
    const overrides = await _readConvOverrides(convId);
    const tools = _buildConvTools(convId, await _readConvToolFlags(convId));

    let _usage = null;
    const fullText = await AIClient.streamChat({
      messages: myMessages,
      onDelta: opts.onDelta || function () {},
      onDone: (text, usage) => { _usage = usage || null; },
      onError: opts.onError || function () {},
      onThinking: opts.onThinking || function () {},
      signal: opts.signal,
      tools: tools,
      temperature: overrides.temperature,
      thinking: overrides.thinking,
      model: overrides.model,
      // GitHub 工具结果联动 / 写操作二次确认（透传给 streamChat，可选）
      onToolResult: opts.onToolResult,
      onWriteTool: opts.onWriteTool,
    });

    if (typeof opts.onDone === "function") {
      try {
        await opts.onDone({
          text: fullText,
          tokens: _usage ? { in: _usage.prompt_tokens, out: _usage.completion_tokens } : null,
        });
      } catch (e) {
        console.warn("[ChatAI] replyGroup onDone 回调出错", e);
      }
    }

    // 群聊里也复用 _afterReply（记仇/原谅/记忆/钱包/朋友圈联动）
    // 注意：群聊里 lastUserMsg 从原始 messages 里找，不带前缀
    if (fullText && opts.characterId) {
      try {
        const fakeOpts = Object.assign({}, opts, { messages: (opts.messages || []).map((m) => ({ role: m.role, content: m.content })) });
        await _afterReply(fullText, fakeOpts, ctx || { character: me });
      } catch (e) {
        console.warn("[ChatAI] replyGroup 后续处理出错", e);
      }
    }

    return fullText;
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.ChatAI = {
    reply: reply,
    replyGroup: replyGroup,
    fakeTypingDelay: fakeTypingDelay,
  };
})(window);
