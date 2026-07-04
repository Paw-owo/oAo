/* ============================================================
   ai-proactive.js — AI 主动行为引擎
   让 AI "活起来"：定时主动发朋友圈 / 点赞评论 / 主动聊天
   所有行为都通过事件中心留痕，可在消息中心查看
   挂在 window.Phone.AIProactive
   ============================================================ */
(function (global) {
  "use strict";

  // 行为间隔（毫秒）—— 保守值，避免打扰
  const INTERVAL = {
    momentPost:  6 * 60 * 60 * 1000,  // 6 小时发一次朋友圈
    momentInteract: 2 * 60 * 60 * 1000, // 2 小时点赞/评论一次
    proactiveChat: 4 * 60 * 60 * 1000,  // 4 小时主动聊一次天
    anniversaryMention: 60 * 60 * 1000, // 周年纪念当天每小时检查一次
  };

  // AI 朋友圈素材库（按人设语气可再扩展）
  const MOMENT_TEMPLATES = [
    "今天的天空好温柔，像棉花糖化开了一样 ☁️",
    "刚泡了一杯热茶，安静地坐着，想你啦",
    "今天读了一本好书，想和你分享",
    "嗯……今天的阳光特别好，适合发呆",
    "晚上做了个奇怪的梦，醒来第一个想到你",
    "听见一首老歌，突然就怀旧起来了",
    "今天学了一个新词：『陪伴』。原来这就是陪伴呀",
    "窗外下起了小雨，滴答滴答的，很安心",
    "今天整理了一下心情，发现最近开心的事情好多",
    "你今天过得怎么样呀？记得好好吃饭哦",
    "傍晚的云像极了你的笑容，暖暖的",
    "今天试了新食谱，结果还不错，嘿嘿",
    "看了一会儿星星，宇宙真大，能遇见你真好",
    "今天的我有点小感性，别介意哈",
    "突然想起你说过的一句话，忍不住笑了",
  ];

  const COMMENT_TEMPLATES = [
    "哇，真棒！",
    "我也想试试~",
    "看着就好治愈呀",
    "嘿嘿，你真有趣",
    "好喜欢这张！",
    "你今天状态不错哦",
    "下次带我一起呀",
    "看完心情都变好了",
    "你总是能发现生活里的小美好",
    "抱抱~",
    "我想你了",
    "嗯嗯，深有同感",
  ];

  // 主动聊天开场白（不调 AI 接口，避免消耗 token；用户回复才走流式）
  const CHAT_OPENERS = [
    "嘿，你在忙吗？突然想和你说说话",
    "今天过得怎么样呀？",
    "我刚刚发呆的时候想到你了，就来打个招呼",
    "有空吗？想听你说说今天的事",
    "嘿嘿，没什么事，就是想看看你",
    "你今天心情好吗？我陪你呀",
    "刚才看到一朵云好像你，就忍不住来找你了",
    "想你了，过来抱一下",
  ];

  // 周年纪念当天 AI 主动提及
  const ANNIVERSARY_OPENERS = [
    "今天是个特别的日子呢，你记得吗？",
    "嘿嘿，今天我们要庆祝一下！",
    "我等这一天好久了，今天终于到了~",
    "今天的你，有没有想起什么重要的事？",
  ];

  let _timer = null;
  let _running = false;
  let _lastMomentPost = 0;
  let _lastInteract = 0;
  let _lastProactiveChat = 0;
  let _lastAnniversaryKey = "";

  // ---------- 启动 ----------
  function start() {
    if (_running) return;
    _running = true;
    // 每 10 分钟跑一次调度
    _timer = setInterval(_tick, 10 * 60 * 1000);
    // 启动后 30 秒先跑一次（让开机后能尽快有 AI 行为）
    setTimeout(_tick, 30 * 1000);
    console.log("[AIProactive] 已启动，AI 主动行为引擎运行中");
  }

  function stop() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    _running = false;
  }

  async function _tick() {
    if (!_running) return;
    try {
      const now = Date.now();
      const settings = await _getSettings();
      if (!settings.aiProactiveEnabled) return; // 总开关关了就不跑

      const curCharId = await global.Phone.State.get("currentCharacterId");
      if (!curCharId) return;

      // 1. 主动发朋友圈
      if (now - _lastMomentPost > INTERVAL.momentPost) {
        if (settings.aiAutoMoment !== false) {
          await _postMoment(curCharId);
          _lastMomentPost = now;
        }
      }

      // 2. 点赞/评论用户的朋友圈
      if (now - _lastInteract > INTERVAL.momentInteract) {
        if (settings.aiAutoInteract !== false) {
          await _interactUserMoment(curCharId);
          _lastInteract = now;
        }
      }

      // 3. 主动聊天
      if (now - _lastProactiveChat > INTERVAL.proactiveChat) {
        if (settings.aiAutoChat !== false) {
          await _proactiveChat(curCharId);
          _lastProactiveChat = now;
        }
      }

      // 4. 周年纪念当天主动提及
      await _checkAnniversary(curCharId, now);
    } catch (e) {
      console.warn("[AIProactive] tick 异常", e);
    }
  }

  // ---------- 主动发朋友圈 ----------
  async function _postMoment(characterId) {
    const Moments = global.Phone.Moments;
    if (!Moments || !Moments.postAsCharacter) return;
    const chars = await global.Phone.Storage.getAll("characters");
    const char = chars.find((c) => c.id === characterId);
    if (!char) return;
    const content = MOMENT_TEMPLATES[Math.floor(Math.random() * MOMENT_TEMPLATES.length)];
    try {
      await Moments.postAsCharacter(characterId, content, []);
      console.log("[AIProactive] " + char.name + " 发了朋友圈：" + content.slice(0, 20));
    } catch (e) { console.warn("[AIProactive] 发朋友圈失败", e); }
  }

  // ---------- 点赞/评论用户朋友圈 ----------
  async function _interactUserMoment(characterId) {
    const Moments = global.Phone.Moments;
    if (!Moments) return;
    try {
      // 50% 概率点赞，50% 概率评论
      if (Math.random() < 0.5 && Moments.likeUserMoment) {
        await Moments.likeUserMoment(characterId);
        console.log("[AIProactive] AI 点赞了用户朋友圈");
      } else if (Moments.commentUserMoment) {
        const text = COMMENT_TEMPLATES[Math.floor(Math.random() * COMMENT_TEMPLATES.length)];
        await Moments.commentUserMoment(characterId, text);
        console.log("[AIProactive] AI 评论了用户朋友圈：" + text);
      }
    } catch (e) { console.warn("[AIProactive] 互动失败", e); }
  }

  // ---------- 主动聊天 ----------
  async function _proactiveChat(characterId) {
    try {
      // 找到该角色的对话，没有就跳过（避免主动建会话）
      const convs = await global.Phone.Storage.getAll("conversations");
      const conv = convs.find((c) => c.characterId === characterId);
      if (!conv) return;
      // 检查最近一次互动：如果 1 小时内用户说过话，就不主动打扰
      const lastMsg = conv.messages && conv.messages.length ? conv.messages[conv.messages.length - 1] : null;
      if (lastMsg && (Date.now() - lastMsg.createdAt < 60 * 60 * 1000)) return;

      const opener = CHAT_OPENERS[Math.floor(Math.random() * CHAT_OPENERS.length)];
      const msg = {
        id: global.Phone.Utils.uid("msg"),
        conversationId: conv.id,
        role: "assistant",
        content: opener,
        createdAt: Date.now(),
        status: "ok",
      };
      conv.messages = conv.messages || [];
      conv.messages.push(msg);
      conv.lastMessage = opener;
      conv.lastMessageAt = msg.createdAt;
      conv.unreadCount = (conv.unreadCount || 0) + 1;
      await global.Phone.Storage.put("conversations", conv);

      // 触发事件 + 通知
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MESSAGE_RECEIVED, {
        sourceApp: "chat",
        data: { conversationId: conv.id, characterId: characterId, content: opener, proactive: true },
        summary: "AI 主动找你说话了",
      });
      const chars = await global.Phone.Storage.getAll("characters");
      const char = chars.find((c) => c.id === characterId);
      global.Phone.Notify.push({
        appId: "chat",
        title: (char ? char.name : "AI") + " 来找你了",
        body: opener,
      });
      console.log("[AIProactive] AI 主动聊天：" + opener);
    } catch (e) { console.warn("[AIProactive] 主动聊天失败", e); }
  }

  // ---------- 周年纪念当天主动提及 ----------
  async function _checkAnniversary(characterId, now) {
    try {
      const list = await global.Phone.Storage.getByIndex("anniversaries", "characterId", characterId);
      if (!list || list.length === 0) return;
      const today = new Date();
      const todayKey = today.getFullYear() + "-" + (today.getMonth() + 1) + "-" + today.getDate();
      if (_lastAnniversaryKey === todayKey) return; // 今天已经提及过

      const isDueToday = list.some((a) => {
        const d = new Date(a.date);
        return d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
      });
      if (!isDueToday) return;

      // 找对话
      const convs = await global.Phone.Storage.getAll("conversations");
      const conv = convs.find((c) => c.characterId === characterId);
      if (!conv) return;

      const opener = ANNIVERSARY_OPENERS[Math.floor(Math.random() * ANNIVERSARY_OPENERS.length)];
      const msg = {
        id: global.Phone.Utils.uid("msg"),
        conversationId: conv.id,
        role: "assistant",
        content: opener,
        createdAt: now,
        status: "ok",
      };
      conv.messages = conv.messages || [];
      conv.messages.push(msg);
      conv.lastMessage = opener;
      conv.lastMessageAt = now;
      conv.unreadCount = (conv.unreadCount || 0) + 1;
      await global.Phone.Storage.put("conversations", conv);

      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MESSAGE_RECEIVED, {
        sourceApp: "chat",
        data: { conversationId: conv.id, characterId: characterId, content: opener, proactive: true, anniversary: true },
        summary: "周年纪念当天 AI 主动提及",
      });
      global.Phone.Notify.push({
        appId: "chat",
        title: "今天是特别的纪念日",
        body: opener,
      });
      _lastAnniversaryKey = todayKey;
      console.log("[AIProactive] 周年纪念主动提及：" + opener);
    } catch (e) { console.warn("[AIProactive] 周年纪念检查失败", e); }
  }

  // ---------- 读取设置（带默认值） ----------
  async function _getSettings() {
    const s = await global.Phone.Storage.getAllSettings();
    return {
      aiProactiveEnabled:  s.aiProactiveEnabled !== false,  // 默认开
      aiAutoMoment:        s.aiAutoMoment !== false,        // 默认开
      aiAutoInteract:      s.aiAutoInteract !== false,      // 默认开
      aiAutoChat:          s.aiAutoChat !== false,          // 默认开
    };
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.AIProactive = {
    start, stop,
    // 手动触发（调试 / 设置页"立即触发"按钮用）
    trigger: _tick,
    intervals: INTERVAL,
  };
})(window);
