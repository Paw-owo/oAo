/* ============================================================
   music.js — 音乐 APP
   音乐库 / 上传 / 歌单 / 播放页 / 进度·音量 / 播放模式
   分享到朋友圈 / 事件写入事件中心
   挂在 window.Phone.Music
   依赖 window.Phone.MusicPlayer
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
  global.Phone.AppRegistry.register({
    id: "music",
    name: "音乐",
    icon: "app-music",
    entry: () => open(),
    events: ["music_playing", "music_shared"],
    settings: [],
    order: 61,
  });

  function open() { global.Phone.Router.push("music", mount, {}); }

  let _curTab = "library"; // library / playlists
  let _curPlaylistId = null;
  let _fullPage = null; // 大播放页引用
  let _unsubMini = null;  // 迷你条订阅取消函数
  let _unsubFull = null;  // 大播放页订阅取消函数

  // 取消所有现存订阅（remount / 离开页面时调用）
  function _clearSubs() {
    if (_unsubMini) { try { _unsubMini(); } catch (e) {} _unsubMini = null; }
    if (_unsubFull) { try { _unsubFull(); } catch (e) {} _unsubFull = null; }
  }

  async function mount(container) {
    _clearSubs(); // 进入/重进页面先清旧订阅，避免泄漏
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;

    const songs = await Storage.getAll("music");
    const playlists = await Storage.getAll("playlists");
    songs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const page = U.el("div", { class: "page" });
    const nav = _nav(U, "音乐", () => {
      // 上传按钮
      const addBtn = U.el("button", { class: "icon-btn" });
      addBtn.innerHTML = global.Phone.IconLibrary.get("plus", { size: 22 });
      addBtn.addEventListener("click", () => _upload(U, songs, playlists, () => _remount(container)));
      return addBtn;
    });
    page.appendChild(nav);

    // tab
    const tabBar = U.el("div", { class: "seg-bar" });
    [{ k: "library", t: "音乐库" }, { k: "playlists", t: "歌单" }].forEach((s) => {
      const b = U.el("button", { class: "seg-btn" + (_curTab === s.k ? " active" : ""), text: s.t });
      b.addEventListener("click", () => { _curTab = s.k; _remount(container); });
      tabBar.appendChild(b);
    });
    page.appendChild(tabBar);

    const content = U.el("div", { class: "page-content", style: { paddingBottom: "76px" } });

    if (_curTab === "library") {
      if (songs.length === 0) {
        content.appendChild(_empty(U, "还没有歌曲哦～\n点右上角上传吧"));
      } else {
        songs.forEach((s, i) => content.appendChild(_songItem(U, s, () => {
          global.Phone.MusicPlayer.playQueue(songs, i);
          _showFull(U, container);
        })));
      }
    } else {
      // 歌单
      const newPlBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: "+ 新建歌单", style: { margin: "0 12px 8px" } });
      newPlBtn.addEventListener("click", async () => {
        const name = await global.Phone.Modal.prompt({ title: "新建歌单", placeholder: "歌单名字" });
        if (!name || !name.trim()) return;
        const pl = {
          id: U.uid("pl"),
          name: name.trim(),
          songIds: [],
          createdAt: Date.now(),
        };
        await Storage.put("playlists", pl);
        _remount(container);
      });
      content.appendChild(newPlBtn);

      if (playlists.length === 0) {
        content.appendChild(_empty(U, "还没有歌单哦～"));
      } else {
        playlists.forEach((pl) => content.appendChild(_playlistItem(U, pl, songs, () => _remount(container))));
      }
    }
    page.appendChild(content);

    // 底部迷你播放条
    page.appendChild(_miniBar(U, container));

    container.appendChild(page);

    // 离开页面时取消所有订阅，防止内存泄漏
    global.Phone.Router.onLeave(() => { _clearSubs(); });
  }

  // ---------- 歌曲项 ----------
  function _songItem(U, s, onPlay) {
    const item = U.el("div", { class: "music-list-item" });
    const cover = U.el("div", { class: "ml-cover" });
    if (s.cover) {
      const img = U.el("img", { src: s.cover, alt: "" });
      img.addEventListener("error", () => { cover.innerHTML = global.Phone.IconLibrary.get("app-music", { size: 20 }); });
      cover.appendChild(img);
    } else {
      cover.innerHTML = global.Phone.IconLibrary.get("app-music", { size: 20 });
    }
    item.appendChild(cover);
    const main = U.el("div", { class: "ml-main" });
    main.appendChild(U.el("div", { class: "ml-name", text: s.name || "未知歌曲" }));
    main.appendChild(U.el("div", { class: "ml-artist", text: s.artist || "未知歌手" }));
    item.appendChild(main);
    if (s.duration) {
      item.appendChild(U.el("div", { class: "ml-dur", text: _fmtTime(s.duration) }));
    }
    item.addEventListener("click", onPlay);
    return item;
  }

  // ---------- 歌单项 ----------
  function _playlistItem(U, pl, songs, onDone) {
    const item = U.el("div", { class: "music-list-item", style: { cursor: "pointer" } });
    const cover = U.el("div", { class: "ml-cover" });
    cover.innerHTML = global.Phone.IconLibrary.get("app-music", { size: 20 });
    item.appendChild(cover);
    const main = U.el("div", { class: "ml-main" });
    main.appendChild(U.el("div", { class: "ml-name", text: pl.name || "未命名歌单" }));
    main.appendChild(U.el("div", { class: "ml-artist", text: (pl.songIds || []).length + " 首" }));
    item.appendChild(main);
    item.addEventListener("click", () => _openPlaylist(U, pl, songs, onDone));
    return item;
  }

  function _openPlaylist(U, pl, songs, onDone) {
    // 简易：直接进入歌单详情（用 Modal 列出歌曲）
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal", style: { maxWidth: "420px" } });
    modal.appendChild(U.el("div", { class: "modal-title", text: pl.name }));
    const body = U.el("div", { class: "modal-body", style: { textAlign: "left", maxHeight: "60vh", overflowY: "auto" } });

    const plSongs = (pl.songIds || []).map((id) => songs.find((s) => s.id === id)).filter(Boolean);
    if (plSongs.length === 0) {
      body.appendChild(U.el("div", { class: "empty-text", text: "歌单还空着，去音乐库添加吧～" }));
    } else {
      plSongs.forEach((s, i) => {
        body.appendChild(_songItem(U, s, () => {
          global.Phone.MusicPlayer.playQueue(plSongs, i);
          _showFull(U, document.getElementById("app-root").firstChild);
          mask.remove();
        }));
      });
    }

    // 操作
    const actions = U.el("div", { class: "modal-actions", style: { flexDirection: "column", gap: "6px" } });
    // 添加歌曲到歌单
    const addBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: "+ 添加歌曲" });
    addBtn.addEventListener("click", async () => {
      const available = songs.filter((s) => !(pl.songIds || []).includes(s.id));
      if (available.length === 0) {
        global.Phone.Notify.push({ appId: "music", title: "没有可添加的歌曲" });
        return;
      }
      // 列表选择（用 prompt 简化）
      const opts = available.map((s) => s.name + " - " + (s.artist || "")).join("\n");
      const idxStr = await global.Phone.Modal.prompt({
        title: "选择歌曲", message: "输入序号（从 1 开始）：\n" + opts, placeholder: "1",
      });
      const idx = parseInt(idxStr, 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= available.length) return;
      pl.songIds = pl.songIds || [];
      pl.songIds.push(available[idx].id);
      await global.Phone.Storage.put("playlists", pl);
      mask.remove();
      onDone();
    });
    actions.appendChild(addBtn);
    // 删除歌单
    const delBtn = U.el("button", { class: "btn btn-text btn-sm", text: "删除歌单" });
    delBtn.addEventListener("click", async () => {
      const ok = await global.Phone.Modal.confirm({
        title: "删除歌单", message: "删除「" + pl.name + "」？", danger: true, okText: "删除",
      });
      if (!ok) return;
      await global.Phone.Storage.del("playlists", pl.id);
      mask.remove();
      onDone();
    });
    actions.appendChild(delBtn);
    const closeBtn = U.el("button", { class: "btn", text: "关闭", onclick: () => mask.remove() });
    actions.appendChild(closeBtn);
    modal.appendChild(body);
    modal.appendChild(actions);
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  // ---------- 上传 ----------
  function _upload(U, songs, playlists, onDone) {
    const inp = U.el("input", { type: "file", accept: "audio/*", style: { display: "none" } });
    inp.addEventListener("change", () => {
      const f = inp.files[0];
      if (!f) return;
      // 大文件提示（估算 base64 = 原始 * 1.37）
      const estSize = f.size * 1.37;
      if (estSize > 40 * 1024 * 1024) {
        global.Phone.Modal.alert({
          title: "文件太大",
          message: "音频文件太大，IndexedDB 可能装不下。\n建议小于 30MB。",
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        const song = {
          id: U.uid("song"),
          name: f.name.replace(/\.[^.]+$/, ""),
          artist: "本地音乐",
          src: reader.result,
          cover: "",
          duration: 0,
          createdAt: Date.now(),
        };
        try {
          await global.Phone.Storage.put("music", song);
          global.Phone.Notify.push({ appId: "music", title: "上传成功：" + song.name });
          onDone();
        } catch (e) {
          console.error("[Music] 上传失败", e);
          global.Phone.Modal.alert({
            title: "上传失败",
            message: "存储空间不足，无法保存。\n请删除旧歌曲后再试。",
          });
        }
      };
      reader.onerror = () => {
        global.Phone.Notify.push({ appId: "music", title: "读取文件失败" });
      };
      reader.readAsDataURL(f);
    });
    document.body.appendChild(inp);
    inp.click();
    setTimeout(() => inp.remove(), 1000);
  }

  // ---------- 迷你播放条 ----------
  function _miniBar(U, container) {
    const bar = U.el("div", { class: "music-player-bar" });
    const MP = global.Phone.MusicPlayer;
    const st = MP.getState();

    const cover = U.el("div", { class: "mpb-cover" });
    if (st.current && st.current.cover) {
      const img = U.el("img", { src: st.current.cover });
      img.addEventListener("error", () => { cover.innerHTML = ""; });
      cover.appendChild(img);
    } else {
      cover.innerHTML = global.Phone.IconLibrary.get("app-music", { size: 20 });
    }
    bar.appendChild(cover);

    const main = U.el("div", { class: "mpb-main" });
    main.appendChild(U.el("div", { class: "mpb-name", text: st.current ? st.current.name : "未播放" }));
    main.appendChild(U.el("div", { class: "mpb-artist", text: st.current ? (st.current.artist || "") : "点击歌曲开始播放" }));
    bar.appendChild(main);

    const ctrl = U.el("div", { class: "mpb-controls" });
    const playBtn = U.el("button", { class: "icon-btn" });
    playBtn.innerHTML = global.Phone.IconLibrary.get(st.paused ? "play" : "pause", { size: 22 });
    playBtn.addEventListener("click", () => { MP.toggle(); _remount(container); });
    ctrl.appendChild(playBtn);
    const nextBtn = U.el("button", { class: "icon-btn" });
    nextBtn.innerHTML = global.Phone.IconLibrary.get("next", { size: 20 });
    nextBtn.addEventListener("click", () => { MP.next(); _remount(container); });
    ctrl.appendChild(nextBtn);
    bar.appendChild(ctrl);

    // 点击主区域展开大播放页
    const openFull = () => _showFull(U, container);
    cover.addEventListener("click", openFull);
    main.addEventListener("click", openFull);

    // 订阅状态更新（取消函数存模块级，离开页面时统一清）
    _unsubMini = MP.subscribe((payload) => {
      if (payload.type === "play" || payload.type === "pause") {
        playBtn.innerHTML = global.Phone.IconLibrary.get(payload.type === "play" ? "pause" : "play", { size: 22 });
        const cur = payload.current;
        main.querySelector(".mpb-name").textContent = cur ? cur.name : "未播放";
        main.querySelector(".mpb-artist").textContent = cur ? (cur.artist || "") : "";
      }
    });

    return bar;
  }

  // ---------- 大播放页 ----------
  function _showFull(U, container) {
    if (_fullPage && _fullPage.parentNode) _fullPage.remove();
    const MP = global.Phone.MusicPlayer;
    const st = MP.getState();
    if (!st.current) return;

    const full = U.el("div", { class: "music-full" });
    _fullPage = full;

    // 返回
    const back = U.el("button", { class: "icon-btn", style: { position: "absolute", top: "calc(12px + env(safe-area-inset-top))", left: "12px" } });
    back.innerHTML = global.Phone.IconLibrary.get("chevron-down", { size: 24 });
    back.addEventListener("click", () => full.remove());
    full.appendChild(back);

    // 分享
    const share = U.el("button", { class: "icon-btn", style: { position: "absolute", top: "calc(12px + env(safe-area-inset-top))", right: "12px" } });
    share.innerHTML = global.Phone.IconLibrary.get("share", { size: 20 });
    share.addEventListener("click", async () => {
      const ok = await global.Phone.Modal.confirm({
        title: "分享到朋友圈", message: "把「" + st.current.name + "」分享到朋友圈？", okText: "分享",
      });
      if (!ok) return;
      // 直接以用户身份发朋友圈（postAsCharacter 是给 AI 用的，要求角色存在于 characters 表）
      const moment = {
        id: U.uid("moment"),
        authorId: "user",
        content: "🎵 正在听：" + st.current.name + " - " + (st.current.artist || ""),
        images: st.current.cover ? [st.current.cover] : [],
        likes: [],
        comments: [],
        createdAt: Date.now(),
      };
      try {
        await global.Phone.Storage.put("moments", moment);
        global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MOMENT_POSTED, {
          sourceApp: "music",
          data: moment,
          summary: "分享了歌曲：" + st.current.name,
        });
      } catch (e) { console.warn("[Music] 分享到朋友圈失败", e); }
      // 写事件中心
      const EC = global.Phone.EventCenter;
      EC.emit(EC.TYPES.MUSIC_SHARED, {
        sourceApp: "music",
        data: { name: st.current.name, artist: st.current.artist },
        summary: "分享了歌曲：" + st.current.name,
      });
      global.Phone.Notify.push({ appId: "music", title: "已分享到朋友圈" });
    });
    full.appendChild(share);

    // 封面（黑胶旋转）
    const coverWrap = U.el("div", { class: "mf-cover spinning" });
    if (st.current.cover) {
      const img = U.el("img", { src: st.current.cover });
      img.addEventListener("error", () => { coverWrap.innerHTML = ""; });
      coverWrap.appendChild(img);
    }
    full.appendChild(coverWrap);

    // 歌名
    const info = U.el("div", { class: "mf-info" });
    info.appendChild(U.el("div", { class: "mf-name", text: st.current.name }));
    info.appendChild(U.el("div", { class: "mf-artist", text: st.current.artist || "未知歌手" }));
    full.appendChild(info);

    // 进度条
    const progress = U.el("input", { type: "range", min: "0", max: String(st.duration || 0), value: String(st.currentTime || 0), step: "0.1", style: { width: "100%" } });
    progress.addEventListener("input", () => MP.seek(parseFloat(progress.value)));
    full.appendChild(progress);
    const timeRow = U.el("div", { class: "row", style: { justifyContent: "space-between", fontSize: "var(--font-xs)", color: "var(--text-placeholder)", marginTop: "4px" } });
    const curTime = U.el("span", { text: _fmtTime(st.currentTime) });
    const totalTime = U.el("span", { text: _fmtTime(st.duration) });
    timeRow.appendChild(curTime);
    timeRow.appendChild(totalTime);
    full.appendChild(timeRow);

    // 控制按钮
    const ctrl = U.el("div", { class: "row", style: { justifyContent: "center", alignItems: "center", gap: "24px", marginTop: "24px" } });
    const modeBtn = U.el("button", { class: "icon-btn" });
    modeBtn.innerHTML = global.Phone.IconLibrary.get(_modeIcon(st.mode), { size: 22 });
    modeBtn.addEventListener("click", () => {
      const order = ["order", "random", "single"];
      const nextMode = order[(order.indexOf(st.mode) + 1) % 3];
      MP.setMode(nextMode);
      st.mode = nextMode;
      modeBtn.innerHTML = global.Phone.IconLibrary.get(_modeIcon(nextMode), { size: 22 });
    });
    const prevBtn = U.el("button", { class: "icon-btn" });
    prevBtn.innerHTML = global.Phone.IconLibrary.get("prev", { size: 24 });
    prevBtn.addEventListener("click", () => MP.prev());
    const playBtn = U.el("button", { class: "icon-btn", style: { width: "64px", height: "64px", background: "var(--grad-primary)", color: "var(--text-on-primary)", borderRadius: "50%" } });
    playBtn.innerHTML = global.Phone.IconLibrary.get(st.paused ? "play" : "pause", { size: 28 });
    playBtn.addEventListener("click", () => MP.toggle());
    const nextBtn = U.el("button", { class: "icon-btn" });
    nextBtn.innerHTML = global.Phone.IconLibrary.get("next", { size: 24 });
    nextBtn.addEventListener("click", () => MP.next());
    ctrl.appendChild(modeBtn);
    ctrl.appendChild(prevBtn);
    ctrl.appendChild(playBtn);
    ctrl.appendChild(nextBtn);
    full.appendChild(ctrl);

    // 音量
    const volRow = U.el("div", { class: "row", style: { alignItems: "center", gap: "8px", marginTop: "20px" } });
    const muteBtn = U.el("button", { class: "icon-btn" });
    muteBtn.innerHTML = global.Phone.IconLibrary.get(st.muted ? "volume-mute" : "volume", { size: 20 });
    muteBtn.addEventListener("click", () => { MP.toggleMute(); });
    volRow.appendChild(muteBtn);
    const volSlider = U.el("input", { type: "range", min: "0", max: "1", value: String(st.muted ? 0 : st.volume), step: "0.01", style: { flex: "1" } });
    volSlider.addEventListener("input", () => MP.setVolume(parseFloat(volSlider.value)));
    volRow.appendChild(volSlider);
    full.appendChild(volRow);

    container.appendChild(full);

    // 订阅更新（取消函数存模块级，离开页面/关闭大播放页时统一清）
    _unsubFull = MP.subscribe((payload) => {
      const s = MP.getState();
      if (payload.type === "play" || payload.type === "pause") {
        playBtn.innerHTML = global.Phone.IconLibrary.get(s.paused ? "play" : "pause", { size: 28 });
        if (s.paused) coverWrap.classList.remove("spinning");
        else coverWrap.classList.add("spinning");
      }
      if (payload.type === "timeupdate") {
        progress.max = String(s.duration || 0);
        progress.value = String(s.currentTime || 0);
        curTime.textContent = _fmtTime(s.currentTime);
        totalTime.textContent = _fmtTime(s.duration);
      }
      if (payload.type === "volume") {
        muteBtn.innerHTML = global.Phone.IconLibrary.get(s.muted ? "volume-mute" : "volume", { size: 20 });
        volSlider.value = String(s.muted ? 0 : s.volume);
      }
    });

    // 移除时取消订阅（点返回键走这里）
    const origRemove = full.remove.bind(full);
    full.remove = () => { if (_unsubFull) { try { _unsubFull(); } catch (e) {} _unsubFull = null; } origRemove(); _fullPage = null; };
  }

  // ---------- 工具 ----------
  function _modeIcon(mode) {
    if (mode === "random") return "shuffle";
    if (mode === "single") return "repeat-one";
    return "repeat";
  }

  function _fmtTime(sec) {
    if (!sec || isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function _nav(U, title, rightFactory) {
    const nav = U.el("div", { class: "navbar" });
    const navLeft = U.el("div", { class: "nav-left" });
    const back = U.el("button", { class: "icon-btn" });
    back.innerHTML = global.Phone.IconLibrary.get("chevron-left", { size: 22 });
    back.addEventListener("click", () => global.Phone.Router.back());
    navLeft.appendChild(back);
    nav.appendChild(navLeft);
    nav.appendChild(U.el("div", { class: "nav-title", text: title }));
    const navRight = U.el("div", { class: "nav-right" });
    if (rightFactory) navRight.appendChild(rightFactory());
    nav.appendChild(navRight);
    return nav;
  }

  function _empty(U, text) {
    const wrap = U.el("div", { class: "empty-state" });
    wrap.appendChild(U.el("div", { class: "empty-icon", html: global.Phone.IconLibrary.get("app-music", { size: 48 }) }));
    text.split("\n").forEach((line) => wrap.appendChild(U.el("div", { class: "empty-text", text: line })));
    return wrap;
  }

  function _remount(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
    mount(container);
  }

  // ---------- 暴露 ----------
  global.Phone.Music = { open, mount };
})(window);
