/* ============================================================
   chat-ai.js — 消息中心 AI 说明书
   我（AI）在消息中心的能力定义
   第一人称编写，AI 自称"我"

   我能做的事：
   - 读取当前角色的对话历史，给出符合人设的回复
   - 流式逐字输出，让用户看到我"正在说话"
   - 读取最近事件，在聊天中自然提及（朋友圈/礼物/游戏/纪念日等）
   - 根据对话内容自动写入记忆（重要的事我会记住）
   - 用户让我不开心时，我会自动写一条记仇本
   - 用户道歉时，我会选择原谅

   挂在 window.Phone.ChatAI
   ============================================================ */
(function (global) {
  "use strict";

  /**
   * 我（AI）根据当前对话历史生成回复
   * @param {object} opts {
   *   characterId, conversationId, messages, onDelta, onDone, onError, onThinking, signal
   * }
   * @returns {Promise<string>} 我的完整回复
   */
  async function reply(opts) {
    opts = opts || {};
    const AIClient = global.Phone.AIClient;
    const Storage = global.Phone.Storage;

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

    // 我开始流式回复
    const fullText = await AIClient.streamChat({
      messages: myMessages,
      onDelta: opts.onDelta || function () {},
      onDone: opts.onDone || function () {},
      onError: opts.onError || function () {},
      onThinking: opts.onThinking || function () {},
      signal: opts.signal,
    });

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

  // 我回复完后的自动行为
  async function _afterReply(text, opts, ctx) {
    const lower = text.toLowerCase();
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
    if (lastUser && /记住|别忘了|我喜欢|我叫|我的名字|我生日|我是|我最喜欢/.test(lastUser.content)) {
      try {
        await AIClient.remember(opts.characterId, lastUser.content, "preference", 8);
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

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.ChatAI = {
    reply: reply,
    fakeTypingDelay: fakeTypingDelay,
  };
})(window);
