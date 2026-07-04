/* ============================================================
   tts.js — TTS 文字转语音
   我（AI）的回复可以被朗读出来，让虚拟伴侣更有温度
   - 底层用 Web Speech API（零依赖）
   - 支持音色/语速/音调/音量设置
   - 朗读队列：连续 speak 多段文本会排队，不互相打断
   - 按句切分：长文本按 。！？. 切分逐句朗读，更自然
   - 跳过代码块：markdown 里的 ``` 代码块整体不读
   - 进度回调：onProgress(index, total) 让 UI 显示"正在朗读第 X 句"
   - 音色试听 / 中文音色筛选 / synth 卡死自动恢复

   挂在 window.Phone.TTS
   ============================================================ */
(function (global) {
  "use strict";

  const synth = global.speechSynthesis;
  const Utterance = global.SpeechSynthesisUtterance;

  let _voicesCache = null;
  let _voicesReady = false;
  let _currentUtter = null;

  // ---------- 朗读队列 ----------
  // 每个 speak() 调用入队一个任务，任务里有一组句子，逐句串行朗读
  // 这样连续 speak 多段文本不会互相打断，而是排队播完
  const _taskQueue = []; // { sentences: string[], opts: object, idx: number }
  let _busy = false;     // 是否正在播队列

  // ---------- 我检查浏览器是否支持 TTS ----------
  function _supported() {
    return !!(synth && Utterance);
  }

  // ---------- 我把长文本按句切分 ----------
  // 按 。！？.!?;；\n 切，过滤空句。超长句再按 200 字硬切，避免 utterance 卡顿
  function _splitSentences(text) {
    if (!text) return [];
    const s = String(text).replace(/\r/g, "");
    // 用正则把句子按终止符切，保留分隔符所在块
    const parts = s.split(/(?<=[。！？!?;；\n])/);
    const out = [];
    for (let p of parts) {
      p = p.trim();
      if (!p) continue;
      // 超长句按 200 字硬切
      while (p.length > 200) {
        out.push(p.slice(0, 200));
        p = p.slice(200);
      }
      if (p) out.push(p);
    }
    return out;
  }

  // ---------- 我朗读一段文本（入队） ----------
  /**
   * 我朗读一段文本（入队，连续调用会排队不互相打断）
   * @param {string} text 要朗读的文本
   * @param {object} opts
   *   { voice?, rate?, pitch?, volume?, onEnd?, onStart?, onProgress?, force?, interrupt? }
   *   force=true 时即使总开关关闭也朗读（用于试听）
   *   interrupt=true 时打断当前队列直接播这一段（兼容旧的打断行为）
   *   onProgress(index, total) 每句开始时回调，index 从 1 开始
   */
  function speak(text, opts) {
    opts = opts || {};
    if (typeof text !== "string" || !text.trim()) {
      if (opts.onEnd) opts.onEnd();
      return null;
    }
    if (!_supported()) {
      if (opts.onEnd) opts.onEnd();
      return null;
    }
    // 总开关检查（试听强制跳过）
    if (!opts.force && !isEnabled()) {
      if (opts.onEnd) opts.onEnd();
      return null;
    }

    // interrupt=true：我先清掉当前队列，再入队（兼容旧的"新 speak 打断旧的"行为）
    if (opts.interrupt) {
      _clearQueue();
    }

    // 我清理 markdown（_cleanText 会去掉 ``` 代码块、行内代码、标题、链接等）
    const cleaned = _cleanText(text);
    if (!cleaned) {
      if (opts.onEnd) opts.onEnd();
      return null;
    }
    const sentences = _splitSentences(cleaned);
    if (!sentences.length) {
      if (opts.onEnd) opts.onEnd();
      return null;
    }
    _taskQueue.push({ sentences: sentences, opts: opts, idx: 0 });
    _pump();
    return _currentUtter;
  }

  // ---------- 我驱动队列往前走 ----------
  function _pump() {
    if (_busy) return;
    const task = _taskQueue[0];
    if (!task) return;
    if (task.idx >= task.sentences.length) {
      // 这一段播完了，出队并回调 onEnd
      _taskQueue.shift();
      const endOpts = task.opts;
      if (endOpts.onEnd) {
        try { endOpts.onEnd(); } catch (e) {}
      }
      // 继续下一段
      _pump();
      return;
    }
    _busy = true;
    const sentence = task.sentences[task.idx];
    _speakOne(sentence, task.opts, function () {
      // 这一句播完了
      _busy = false;
      _currentUtter = null;
      task.idx += 1;
      _pump();
    });
  }

  // ---------- 我朗读单句（带 watchdog 错误恢复） ----------
  function _speakOne(text, opts, onDone) {
    // 如果正在播且没暂停，先 cancel 掉旧的（保险，正常流程 _pump 不会重叠）
    if (synth.speaking && !synth.paused) {
      try { synth.cancel(); } catch (e) {}
    }

    const utter = new Utterance(text);
    const rate = opts.rate != null ? opts.rate : (global.Phone.State.get("ttsRate") || 1);
    const pitch = opts.pitch != null ? opts.pitch : (global.Phone.State.get("ttsPitch") || 1);
    const volume = opts.volume != null ? opts.volume : (global.Phone.State.get("ttsVolume") != null ? global.Phone.State.get("ttsVolume") : 1);
    utter.rate = Math.max(0.5, Math.min(2, rate));
    utter.pitch = Math.max(0, Math.min(2, pitch));
    utter.volume = Math.max(0, Math.min(1, volume));
    utter.lang = "zh-CN"; // 默认中文，可被 voice 覆盖

    // 选择音色
    const voiceURI = opts.voice || global.Phone.State.get("ttsVoice");
    if (voiceURI) {
      const voices = getVoices();
      const v = voices.find((x) => x.voiceURI === voiceURI);
      if (v) { utter.voice = v; utter.lang = v.lang; }
    }

    // 任务上下文：用于 onProgress 和 watchdog 重试
    let started = false;
    let retried = false;
    let watchdog = null;

    // 当前任务的句子序号（_pump 入口已确保 task 在队首）
    const task = _taskQueue[0];
    const idx1 = task ? (task.idx + 1) : 1;
    const total = task ? task.sentences.length : 1;

    utter.onstart = function () {
      started = true;
      if (watchdog) { clearTimeout(watchdog); watchdog = null; }
      if (opts.onStart) {
        try { opts.onStart(); } catch (e) {}
      }
      if (opts.onProgress) {
        try { opts.onProgress(idx1, total); } catch (e) {}
      }
    };

    function _finish() {
      if (watchdog) { clearTimeout(watchdog); watchdog = null; }
      _currentUtter = null;
      onDone();
    }

    utter.onend = _finish;
    utter.onerror = function () {
      // onerror 时如果还没启动过，且没重试过，我 cancel 一次重试（synth 偶发卡死）
      if (watchdog) { clearTimeout(watchdog); watchdog = null; }
      if (!started && !retried) {
        retried = true;
        try { synth.cancel(); } catch (e) {}
        // 稍等再重试一次当前句
        setTimeout(function () {
          if (!_taskQueue[0] || task !== _taskQueue[0]) {
            // 队列已被 cancel 清空，不再重试
            _finish();
            return;
          }
          _speakOne(text, opts, onDone);
        }, 120);
        return;
      }
      _finish();
    };

    // watchdog：speak 后 1500ms 还没 onstart，视为 synth 卡死，cancel 重试一次
    watchdog = setTimeout(function () {
      if (started) return;
      if (retried) { _finish(); return; }
      retried = true;
      try { synth.cancel(); } catch (e) {}
      setTimeout(function () {
        if (!_taskQueue[0] || task !== _taskQueue[0]) {
          _finish();
          return;
        }
        _speakOne(text, opts, onDone);
      }, 120);
    }, 1500);

    _currentUtter = utter;
    try {
      synth.speak(utter);
    } catch (e) {
      if (watchdog) { clearTimeout(watchdog); watchdog = null; }
      _currentUtter = null;
      onDone();
    }
  }

  // ---------- 我清空队列（内部用） ----------
  function _clearQueue() {
    _taskQueue.length = 0;
    _busy = false;
    _currentUtter = null;
    if (_supported()) {
      try { synth.cancel(); } catch (e) {}
    }
  }

  // ---------- 我停止朗读（清空队列） ----------
  function cancel() {
    _clearQueue();
  }

  function pause() {
    if (!_supported()) return;
    try { synth.pause(); } catch (e) {}
  }

  function resume() {
    if (!_supported()) return;
    try { synth.resume(); } catch (e) {}
  }

  function isSpeaking() {
    if (!_supported()) return false;
    return synth.speaking || _busy || _taskQueue.length > 0;
  }

  function isPaused() {
    if (!_supported()) return false;
    return synth.paused;
  }

  // ---------- 我获取可用音色列表 ----------
  function getVoices() {
    if (!_supported()) return [];
    if (_voicesCache && _voicesCache.length) return _voicesCache;
    const list = synth.getVoices() || [];
    if (list.length) { _voicesCache = list; _voicesReady = true; }
    return list;
  }

  // ---------- 我只返回中文音色（lang 以 zh 开头） ----------
  function getZhVoices() {
    return getVoices().filter(function (v) {
      return v && v.lang && /^zh/i.test(v.lang);
    });
  }

  // ---------- 音色就绪回调 ----------
  function onVoicesReady(cb) {
    if (typeof cb !== "function") return;
    if (!_supported()) { cb([]); return; }
    const list = getVoices();
    if (list.length) { cb(list); return; }
    // 监听 voiceschanged（一次性）
    const handler = () => {
      const l = getVoices();
      synth.removeEventListener && synth.removeEventListener("voiceschanged", handler);
      cb(l);
    };
    synth.addEventListener && synth.addEventListener("voiceschanged", handler);
    // 兜底：500ms 后再试一次
    setTimeout(() => {
      const l = getVoices();
      if (l.length) { try { synth.removeEventListener && synth.removeEventListener("voiceschanged", handler); } catch (e) {} cb(l); }
    }, 500);
  }

  // ---------- 默认音色/语速/音调/音量 ----------
  function setVoice(voiceURI) {
    return global.Phone.State.set("ttsVoice", voiceURI || "");
  }
  function getVoice() {
    return global.Phone.State.get("ttsVoice") || "";
  }
  function setRate(rate) {
    const r = Math.max(0.5, Math.min(2, Number(rate) || 1));
    return global.Phone.State.set("ttsRate", r);
  }
  function setPitch(pitch) {
    const p = Math.max(0, Math.min(2, Number(pitch) || 1));
    return global.Phone.State.set("ttsPitch", p);
  }
  function setVolume(volume) {
    const v = Math.max(0, Math.min(1, Number(volume) || 1));
    return global.Phone.State.set("ttsVolume", v);
  }

  // ---------- 总开关 ----------
  function isEnabled() {
    return global.Phone.State.get("ttsEnabled") === true;
  }
  function enable() { return global.Phone.State.set("ttsEnabled", true); }
  function disable() { return global.Phone.State.set("ttsEnabled", false); }

  // ---------- 试听（强制朗读一句话，忽略总开关，可指定音色） ----------
  function preview(text, voiceURI) {
    const opts = { force: true };
    if (voiceURI) opts.voice = voiceURI;
    // 试听用 interrupt 直接播，不打扰当前队列太久
    opts.interrupt = true;
    return speak(text || "你好呀，我是你的小伙伴，很高兴见到你。", opts);
  }

  // ---------- 我清理 markdown 再朗读 ----------
  function _cleanText(text) {
    if (!text) return "";
    let s = String(text);
    // 去掉思维链 <think >...</think > / <think >...</think >
    s = s.replace(/<think\s*>[\s\S]*?<\/think\s*>/gi, "");
    // 去掉代码块 ```...```（整体不读）
    s = s.replace(/```[\s\S]*?```/g, "");
    // 去掉行内代码 `...`
    s = s.replace(/`([^`]+)`/g, "$1");
    // 去掉标题 # / ## / ###
    s = s.replace(/^#{1,6}\s+/gm, "");
    // 去掉粗体 **...** / 斜体 *...*
    s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
    s = s.replace(/\*([^*]+)\*/g, "$1");
    // 去掉链接 [text](url) → text
    s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    // 去掉图片 ![](url)
    s = s.replace(/!\[[^\]]*\]\([^)]+\)/g, "");
    // 去掉多余的空行和首尾空白
    s = s.replace(/\n{3,}/g, "\n\n").trim();
    // 限制最大长度 5000 字（队列模式下可以读长一点，单句会再切）
    if (s.length > 5000) s = s.slice(0, 5000);
    return s;
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.TTS = {
    speak, cancel, pause, resume,
    isSpeaking, isPaused,
    getVoices, getZhVoices, onVoicesReady,
    setVoice, getVoice, setRate, setPitch, setVolume,
    isEnabled, enable, disable,
    preview,
    _cleanText, _splitSentences,
  };
})(window);
