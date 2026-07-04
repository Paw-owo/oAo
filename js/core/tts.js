/* ============================================================
   tts.js — TTS 文字转语音
   我（AI）的回复可以被朗读出来，让虚拟伴侣更有温度
   - 底层用 Web Speech API（零依赖）
   - 支持音色/语速/音调/音量设置
   - 自动清理 markdown 再朗读
   - 可扩展接入云端 TTS

   挂在 window.Phone.TTS
   ============================================================ */
(function (global) {
  "use strict";

  const synth = global.speechSynthesis;
  const Utterance = global.SpeechSynthesisUtterance;

  let _voicesCache = null;
  let _voicesReady = false;
  let _currentUtter = null;

  // ---------- 我检查浏览器是否支持 TTS ----------
  function _supported() {
    return !!(synth && Utterance);
  }

  // ---------- 我朗读一段文本 ----------
  /**
   * 我朗读一段文本
   * @param {string} text 要朗读的文本
   * @param {object} opts {voice?, rate?, pitch?, volume?, onEnd?, onStart?, force?}
   *   force=true 时即使总开关关闭也朗读（用于试听）
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

    // 我先停掉正在朗读的（除非用户想排队，这里默认不排）
    if (synth.speaking && !synth.paused) {
      try { synth.cancel(); } catch (e) {}
    }

    const cleaned = _cleanText(text);
    if (!cleaned) {
      if (opts.onEnd) opts.onEnd();
      return null;
    }

    const utter = new Utterance(cleaned);
    // 应用默认设置 + opts 覆盖
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

    if (opts.onStart) utter.onstart = opts.onStart;
    if (opts.onEnd) {
      utter.onend = () => { _currentUtter = null; opts.onEnd(); };
      utter.onerror = () => { _currentUtter = null; opts.onEnd(); };
    } else {
      utter.onend = () => { _currentUtter = null; };
      utter.onerror = () => { _currentUtter = null; };
    }

    _currentUtter = utter;
    try { synth.speak(utter); } catch (e) { _currentUtter = null; if (opts.onEnd) opts.onEnd(); }
    return utter;
  }

  // ---------- 我停止朗读 ----------
  function cancel() {
    if (!_supported()) return;
    try { synth.cancel(); } catch (e) {}
    _currentUtter = null;
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
    return synth.speaking;
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

  // ---------- 试听（强制朗读一句话，忽略总开关） ----------
  function preview(text) {
    return speak(text || "你好呀，我是你的小伙伴，很高兴见到你。", { force: true });
  }

  // ---------- 我清理 markdown 再朗读 ----------
  function _cleanText(text) {
    if (!text) return "";
    let s = String(text);
    // 去掉思维链 <think >...</think > / <think >...</think >
    s = s.replace(/<think\s*>[\s\S]*?<\/think\s*>/gi, "");
    // 去掉代码块 ```...```
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
    // 限制最大长度 500 字
    if (s.length > 500) s = s.slice(0, 500);
    return s;
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.TTS = {
    speak, cancel, pause, resume,
    isSpeaking, isPaused,
    getVoices, onVoicesReady,
    setVoice, getVoice, setRate, setPitch, setVolume,
    isEnabled, enable, disable,
    preview,
    _cleanText,
  };
})(window);
