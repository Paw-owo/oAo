/* ============================================================
   music-player.js — 音乐播放器引擎
   单例 Audio 元素 / 播放队列 / 顺序·随机·单曲循环 / 进度·音量
   全局只有一个 Player，所有页面共享状态
   事件 MUSIC_PLAYING 写入事件中心（首次播放时）
   挂在 window.Phone.MusicPlayer
   ============================================================ */
(function (global) {
  "use strict";

  const audio = new Audio();
  audio.preload = "auto";

  // 状态
  let _queue = [];          // 当前播放队列（歌曲对象数组）
  let _index = -1;          // 当前歌曲在队列中的索引
  let _mode = "order";      // order / random / single
  let _volume = 0.8;
  let _muted = false;
  let _prevVolume = 0.8;
  let _listeners = new Set(); // 状态变更订阅者
  let _emittedPlaying = false; // 避免重复 emit MUSIC_PLAYING

  audio.volume = _volume;

  // ---------- 通知订阅者 ----------
  function _notify(payload) {
    for (const fn of _listeners) {
      try { fn(payload); } catch (e) { console.warn("[MusicPlayer] 订阅者报错", e); }
    }
  }

  function subscribe(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  }

  // ---------- 加载队列 ----------
  function playQueue(list, startIndex) {
    if (!list || list.length === 0) return;
    _queue = list.slice();
    _index = startIndex != null ? startIndex : 0;
    _loadAndPlay();
  }

  function _current() {
    return _index >= 0 && _index < _queue.length ? _queue[_index] : null;
  }

  function _loadAndPlay() {
    const cur = _current();
    if (!cur) return;
    audio.src = cur.src || cur.url || "";
    audio.currentTime = 0;
    audio.volume = _muted ? 0 : _volume;
    const p = audio.play();
    if (p && p.catch) {
      p.catch((e) => {
        console.warn("[MusicPlayer] 播放失败", e);
        global.Phone.Notify && global.Phone.Notify.push({
          appId: "music", title: "播放失败：" + (cur.name || "未知歌曲"),
        });
      });
    }
    // 首次播放写入事件中心
    if (!_emittedPlaying) {
      _emittedPlaying = true;
      const EC = global.Phone.EventCenter;
      if (EC) {
        EC.emit(EC.TYPES.MUSIC_PLAYING, {
          sourceApp: "music",
          data: { name: cur.name, artist: cur.artist },
          summary: "正在听：" + (cur.name || "未知") + " - " + (cur.artist || ""),
        });
      }
    }
    _notify({ type: "play", current: cur });
  }

  // ---------- 控制 ----------
  function play() {
    if (!audio.src) return;
    const p = audio.play();
    if (p && p.catch) p.catch(() => {});
    _notify({ type: "play", current: _current() });
  }

  function pause() {
    audio.pause();
    _notify({ type: "pause", current: _current() });
  }

  function toggle() {
    if (audio.paused) play();
    else pause();
  }

  function next() {
    if (_queue.length === 0) return;
    if (_mode === "single") {
      audio.currentTime = 0;
      play();
      return;
    }
    if (_mode === "random") {
      _index = Math.floor(Math.random() * _queue.length);
    } else {
      _index = (_index + 1) % _queue.length;
    }
    _loadAndPlay();
  }

  function prev() {
    if (_queue.length === 0) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    _index = (_index - 1 + _queue.length) % _queue.length;
    _loadAndPlay();
  }

  function seek(time) {
    if (isNaN(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(time, audio.duration));
    _notify({ type: "seek", current: _current() });
  }

  function setVolume(v) {
    _volume = Math.max(0, Math.min(1, v));
    _muted = _volume === 0;
    audio.volume = _volume;
    if (!_muted) _prevVolume = _volume;
    _notify({ type: "volume", current: _current() });
  }

  function toggleMute() {
    if (_muted) {
      _muted = false;
      audio.volume = _prevVolume || 0.8;
      _volume = audio.volume;
    } else {
      _muted = true;
      _prevVolume = _volume || 0.8;
      audio.volume = 0;
    }
    _notify({ type: "volume", current: _current() });
  }

  function setMode(m) {
    _mode = m;
    _notify({ type: "mode", current: _current() });
  }

  // ---------- 状态 ----------
  function getState() {
    return {
      current: _current(),
      queue: _queue.slice(),
      index: _index,
      mode: _mode,
      volume: _volume,
      muted: _muted,
      paused: audio.paused,
      duration: audio.duration || 0,
      currentTime: audio.currentTime || 0,
    };
  }

  // ---------- 音频事件 ----------
  audio.addEventListener("timeupdate", () => {
    _notify({ type: "timeupdate", current: _current() });
  });
  audio.addEventListener("ended", () => {
    if (_mode === "single") {
      audio.currentTime = 0;
      play();
    } else {
      next();
    }
  });
  audio.addEventListener("error", (e) => {
    console.warn("[MusicPlayer] 音频错误", e);
    global.Phone.Notify && global.Phone.Notify.push({
      appId: "music", title: "音频加载失败",
    });
  });

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.MusicPlayer = {
    audio,
    playQueue, play, pause, toggle, next, prev, seek,
    setVolume, toggleMute, setMode,
    getState, subscribe,
  };
})(window);
