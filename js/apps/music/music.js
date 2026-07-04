/* ============================================================
   music.js — 音乐 APP（专业版）
   对齐参考：Apple Music / 网易云音乐 / Spotify / QQ 音乐
   功能：
     - 音乐库 / 上传 / 歌单 / 播放页 / 进度·音量 / 播放模式
     - 3 个 Tab：音乐库 / 歌单 / 收藏
     - 搜索 + 排序（最近/名称/歌手/播放次数）
     - 统计概览：歌曲数 / 歌单数 / 总时长 / 收藏数
     - 收藏歌曲
     - 编辑歌曲元数据（名称/歌手/封面）
     - 长按删除
     - 分享到朋友圈
     - 设置页：默认音量 / 排序 / 自动播放下一首 / 显示统计 / 清空 / 导出
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

  let _curTab = "library"; // library / playlists / favorites
  let _curPlaylistId = null;
  let _fullPage = null;
  let _unsubMini = null;
  let _unsubFull = null;
  let _sleepTimer = null;

  function _clearSubs() {
    if (_unsubMini) { try { _unsubMini(); } catch (e) {} _unsubMini = null; }
    if (_unsubFull) { try { _unsubFull(); } catch (e) {} _unsubFull = null; }
  }

  async function mount(container) {
    _clearSubs();
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const State = global.Phone.State;

    const songs = await Storage.getAll("music");
    const playlists = await Storage.getAll("playlists");
    songs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const page = U.el("div", { class: "page" });
    if (global.Phone.ThemeEngine && global.Phone.ThemeEngine.tagApp) {
      global.Phone.ThemeEngine.tagApp(page, "music");
    }
    page.appendChild(_nav(U, "音乐",
      () => _upload(U, songs, playlists, () => _remount(container)),
      () => _openSettings(U, () => _remount(container))));

    const content = U.el("div", { class: "scroll page-content", style: { padding: "16px", paddingBottom: "76px" } });

    // ---------- 统计概览 ----------
    if (State.get("musicShowStats") !== false) {
      const totalDur = songs.reduce((acc, s) => acc + (s.duration || 0), 0);
      const favCount = songs.filter((s) => s.favorited).length;
      content.appendChild(U.el("div", { class: "mu-stats-bar" }, [
        U.el("div", { class: "msb-card" }, [
          U.el("div", { class: "msb-num", text: String(songs.length) }),
          U.el("div", { class: "msb-label", text: "歌曲" }),
        ]),
        U.el("div", { class: "msb-card" }, [
          U.el("div", { class: "msb-num", text: String(playlists.length) }),
          U.el("div", { class: "msb-label", text: "歌单" }),
        ]),
        U.el("div", { class: "msb-card" }, [
          U.el("div", { class: "msb-num", text: String(favCount) }),
          U.el("div", { class: "msb-label", text: "收藏" }),
        ]),
        U.el("div", { class: "msb-card" }, [
          U.el("div", { class: "msb-num", text: _fmtDur(totalDur) }),
          U.el("div", { class: "msb-label", text: "总时长" }),
        ]),
      ]));
    }

    // ---------- Tab ----------
    const tabBar = U.el("div", { class: "segment", style: { display: "flex", marginBottom: "12px", overflowX: "auto" } });
    [
      { k: "library", l: "音乐库" },
      { k: "playlists", l: "歌单" },
      { k: "favorites", l: "收藏" },
    ].forEach((s) => {
      const node = U.el("div", { class: "segment-item" + (_curTab === s.k ? " active" : ""), text: s.l });
      node.addEventListener("click", () => { _curTab = s.k; _remount(container); });
      tabBar.appendChild(node);
    });
    content.appendChild(tabBar);

    // ---------- 搜索（仅库和收藏） ----------
    let search = null;
    let sortSelect = null;
    if (_curTab !== "playlists") {
      search = U.el("input", { class: "input", placeholder: "搜索歌曲 / 歌手...", style: { marginBottom: "8px" } });
      content.appendChild(search);

      // 排序
      const sortWrap = U.el("div", { class: "row", style: { justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } });
      sortWrap.appendChild(U.el("div", { class: "muted", text: "排序：", style: { fontSize: "var(--font-xs)" } }));
      sortSelect = U.el("select", { class: "input", style: { width: "auto", fontSize: "var(--font-xs)" } });
      const curSort = State.get("musicDefaultSort") || "recent";
      [
        { v: "recent", l: "最近添加" },
        { v: "name", l: "歌曲名" },
        { v: "artist", l: "歌手" },
        { v: "plays", l: "播放次数" },
      ].forEach((o) => {
        const opt = U.el("option", { value: o.v, text: o.l });
        if (curSort === o.v) opt.selected = true;
        sortSelect.appendChild(opt);
      });
      sortWrap.appendChild(sortSelect);
      content.appendChild(sortWrap);
    }

    const listWrap = U.el("div", {});

    async function _load() {
      let list = await Storage.getAll("music");
      // 排序
      const sort = sortSelect ? sortSelect.value : "recent";
      if (sort === "name") list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      else if (sort === "artist") list.sort((a, b) => (a.artist || "").localeCompare(b.artist || ""));
      else if (sort === "plays") list.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
      else list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      // 搜索
      if (search) {
        const kw = search.value.trim().toLowerCase();
        if (kw) {
          list = list.filter((s) =>
            (s.name || "").toLowerCase().includes(kw) ||
            (s.artist || "").toLowerCase().includes(kw)
          );
        }
      }

      // Tab 过滤
      if (_curTab === "favorites") list = list.filter((s) => s.favorited);

      U.empty(listWrap);
      if (list.length === 0) {
        listWrap.appendChild(_empty(U,
          _curTab === "favorites" ? "还没有收藏" : "还没有歌曲",
          _curTab === "favorites" ? "听歌时点小心心收藏吧~" : "点右上角上传吧~"
        ));
        return;
      }
      const MP = global.Phone.MusicPlayer;
      const st = MP.getState();
      list.forEach((s, i) => {
        listWrap.appendChild(_songItem(U, s, st.current && st.current.id === s.id, () => {
          // 播放
          global.Phone.MusicPlayer.playQueue(list, i);
          _incPlayCount(s);
          _showFull(U, container);
        }, () => _edit(U, s, () => _load()), () => _toggleFav(U, s, () => _load())));
      });
    }

    if (search) search.addEventListener("input", global.Phone.Utils.debounce(_load, 200));
    if (sortSelect) sortSelect.addEventListener("change", async () => {
      await State.set("musicDefaultSort", sortSelect.value);
      _load();
    });

    if (_curTab === "library" || _curTab === "favorites") {
      content.appendChild(listWrap);
      _load();
    } else {
      // 歌单 Tab
      const newPlBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: "+ 新建歌单", style: { marginBottom: "12px" } });
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
        content.appendChild(_empty(U, "还没有歌单", "点上方按钮建一个吧~"));
      } else {
        playlists.forEach((pl) => content.appendChild(_playlistItem(U, pl, songs, () => _remount(container))));
      }
    }

    page.appendChild(content);
    page.appendChild(_miniBar(U, container));
    container.appendChild(page);
    global.Phone.Router.onLeave(() => { _clearSubs(); });
  }

  // ---------- 歌曲项 ----------
  function _songItem(U, s, isPlaying, onPlay, onEdit, onToggleFav) {
    const item = U.el("div", { class: "music-list-item" + (isPlaying ? " playing" : "") });
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
    const subRow = U.el("div", { class: "ml-artist" });
    subRow.textContent = s.artist || "未知歌手";
    if (s.playCount > 0) subRow.textContent += " · 播放 " + s.playCount + " 次";
    main.appendChild(subRow);
    item.appendChild(main);

    // 收藏按钮
    const favBtn = U.el("button", { class: "icon-btn btn-sm" });
    favBtn.innerHTML = global.Phone.IconLibrary.get(s.favorited ? "heart-fill" : "heart", { size: 16 });
    if (s.favorited) favBtn.style.color = "var(--color-accent)";
    favBtn.addEventListener("click", (e) => { e.stopPropagation(); onToggleFav(); });
    item.appendChild(favBtn);

    if (s.duration) {
      item.appendChild(U.el("div", { class: "ml-dur", text: _fmtTime(s.duration) }));
    }
    item.addEventListener("click", onPlay);

    // 长按 600ms 触发编辑
    let pressTimer = null;
    item.addEventListener("touchstart", () => {
      pressTimer = setTimeout(() => { onEdit(); pressTimer = null; }, 600);
    });
    item.addEventListener("touchend", () => { if (pressTimer) clearTimeout(pressTimer); });
    item.addEventListener("touchmove", () => { if (pressTimer) clearTimeout(pressTimer); });

    return item;
  }

  // ---------- 歌单项 ----------
  function _playlistItem(U, pl, songs, onDone) {
    const item = U.el("div", { class: "music-list-item", style: { cursor: "pointer" } });
    const cover = U.el("div", { class: "ml-cover" });
    const plSongs = (pl.songIds || []).map((id) => songs.find((s) => s.id === id)).filter(Boolean);
    if (plSongs.length > 0 && plSongs[0].cover) {
      const img = U.el("img", { src: plSongs[0].cover });
      img.addEventListener("error", () => { cover.innerHTML = global.Phone.IconLibrary.get("playlist", { size: 20 }); });
      cover.appendChild(img);
    } else {
      cover.innerHTML = global.Phone.IconLibrary.get("playlist", { size: 20 });
    }
    item.appendChild(cover);
    const main = U.el("div", { class: "ml-main" });
    main.appendChild(U.el("div", { class: "ml-name", text: pl.name || "未命名歌单" }));
    main.appendChild(U.el("div", { class: "ml-artist", text: plSongs.length + " 首" }));
    item.appendChild(main);
    item.appendChild(U.el("div", { class: "ml-dur", html: global.Phone.IconLibrary.get("chevron-right", { size: 16 }) }));
    item.addEventListener("click", () => _openPlaylist(U, pl, songs, onDone));
    return item;
  }

  function _openPlaylist(U, pl, songs, onDone) {
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal", style: { maxWidth: "420px" } });
    modal.appendChild(U.el("div", { class: "modal-title", text: pl.name }));
    const body = U.el("div", { class: "modal-body", style: { textAlign: "left", maxHeight: "60vh", overflowY: "auto" } });

    const plSongs = (pl.songIds || []).map((id) => songs.find((s) => s.id === id)).filter(Boolean);
    if (plSongs.length === 0) {
      body.appendChild(U.el("div", { class: "empty-text", text: "歌单还空着，去音乐库添加吧~" }));
    } else {
      // 播放全部
      const playAllBtn = U.el("button", { class: "btn btn-sm", text: "播放全部", style: { marginBottom: "8px" } });
      playAllBtn.addEventListener("click", () => {
        global.Phone.MusicPlayer.playQueue(plSongs, 0);
        _showFull(U, document.getElementById("app-root").firstChild);
        mask.remove();
      });
      body.appendChild(playAllBtn);
      plSongs.forEach((s, i) => {
        body.appendChild(_songItem(U, s, false, () => {
          global.Phone.MusicPlayer.playQueue(plSongs, i);
          _incPlayCount(s);
          _showFull(U, document.getElementById("app-root").firstChild);
          mask.remove();
        }, () => _edit(U, s, () => onDone()), () => _toggleFav(U, s, () => onDone())));
      });
    }

    const actions = U.el("div", { class: "modal-actions", style: { flexDirection: "column", gap: "6px" } });
    const addBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: "+ 添加歌曲" });
    addBtn.addEventListener("click", async () => {
      const available = songs.filter((s) => !(pl.songIds || []).includes(s.id));
      if (available.length === 0) {
        global.Phone.Notify.push({ appId: "music", title: "没有可添加的歌曲" });
        return;
      }
      const opts = available.map((s, i) => (i + 1) + ". " + s.name + " - " + (s.artist || "")).join("\n");
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

  // ---------- 收藏切换 ----------
  async function _toggleFav(U, s, onDone) {
    s.favorited = !s.favorited;
    s.updatedAt = Date.now();
    await global.Phone.Storage.put("music", s);
    global.Phone.Notify.push({ appId: "music", title: s.favorited ? "已收藏" : "已取消收藏" });
    onDone();
  }

  // ---------- 增加播放次数 ----------
  async function _incPlayCount(s) {
    s.playCount = (s.playCount || 0) + 1;
    s.lastPlayedAt = Date.now();
    try { await global.Phone.Storage.put("music", s); } catch (e) {}
  }

  // ---------- 编辑歌曲 ----------
  function _edit(U, s, onDone) {
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: "编辑歌曲" }));

    const body = U.el("div", { class: "modal-body", style: { textAlign: "left" } });
    body.appendChild(U.el("div", { class: "form-label", text: "歌曲名" }));
    const nameIn = U.el("input", { class: "input", value: s.name || "" });
    body.appendChild(nameIn);
    body.appendChild(U.el("div", { class: "form-label", text: "歌手", style: { marginTop: "10px" } }));
    const artistIn = U.el("input", { class: "input", value: s.artist || "" });
    body.appendChild(artistIn);
    body.appendChild(U.el("div", { class: "form-label", text: "封面（可选）", style: { marginTop: "10px" } }));
    const coverPreview = U.el("div", { class: "an-cover-preview", style: { backgroundImage: s.cover ? "url(" + s.cover + ")" : "none", backgroundColor: s.cover ? "transparent" : "var(--bg-surface-2)" } });
    const coverBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: s.cover ? "更换封面" : "上传封面" });
    const coverInput = U.el("input", { type: "file", accept: "image/*", style: { display: "none" } });
    coverInput.addEventListener("change", () => {
      const f = coverInput.files[0];
      if (!f) return;
      if (f.size > 1.5 * 1024 * 1024) {
        global.Phone.Notify.push({ appId: "music", title: "图片太大啦" });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        s.cover = reader.result;
        coverPreview.style.backgroundImage = "url(" + s.cover + ")";
        coverPreview.style.backgroundColor = "transparent";
      };
      reader.readAsDataURL(f);
    });
    coverBtn.addEventListener("click", () => coverInput.click());
    body.appendChild(coverPreview);
    body.appendChild(coverBtn);
    modal.appendChild(body);

    const actions = U.el("div", { class: "modal-actions", style: { flexDirection: "column", gap: "6px" } });
    actions.appendChild(U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }));
    const saveBtn = U.el("button", { class: "btn", text: "保存" });
    saveBtn.addEventListener("click", async () => {
      s.name = nameIn.value.trim() || "未知歌曲";
      s.artist = artistIn.value.trim();
      s.updatedAt = Date.now();
      await global.Phone.Storage.put("music", s);
      global.Phone.Notify.push({ appId: "music", title: "已更新" });
      mask.remove();
      onDone();
    });
    actions.appendChild(saveBtn);
    const delBtn = U.el("button", { class: "btn btn-text btn-sm", text: "删除歌曲" });
    delBtn.addEventListener("click", async () => {
      const ok = await global.Phone.Modal.confirm({ title: "删除歌曲", message: "删除「" + (s.name || "未知") + "」？", danger: true });
      if (!ok) return;
      await global.Phone.Storage.del("music", s.id);
      mask.remove();
      onDone();
    });
    actions.appendChild(delBtn);
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
          favorited: false,
          playCount: 0,
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

    const openFull = () => _showFull(U, container);
    cover.addEventListener("click", openFull);
    main.addEventListener("click", openFull);

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

    const back = U.el("button", { class: "icon-btn", style: { position: "absolute", top: "calc(12px + env(safe-area-inset-top))", left: "12px" } });
    back.innerHTML = global.Phone.IconLibrary.get("chevron-down", { size: 24 });
    back.addEventListener("click", () => full.remove());
    full.appendChild(back);

    // 顶部右侧：收藏 + 分享 + 定时
    const topRight = U.el("div", { style: { position: "absolute", top: "calc(12px + env(safe-area-inset-top))", right: "12px", display: "flex", gap: "4px" } });
    const favBtn = U.el("button", { class: "icon-btn" });
    favBtn.innerHTML = global.Phone.IconLibrary.get(st.current.favorited ? "heart-fill" : "heart", { size: 20 });
    if (st.current.favorited) favBtn.style.color = "var(--color-accent)";
    favBtn.addEventListener("click", async () => {
      const cur = st.current;
      cur.favorited = !cur.favorited;
      await global.Phone.Storage.put("music", cur);
      favBtn.innerHTML = global.Phone.IconLibrary.get(cur.favorited ? "heart-fill" : "heart", { size: 20 });
      favBtn.style.color = cur.favorited ? "var(--color-accent)" : "";
      global.Phone.Notify.push({ appId: "music", title: cur.favorited ? "已收藏" : "已取消收藏" });
    });
    topRight.appendChild(favBtn);

    const sleepBtn = U.el("button", { class: "icon-btn" });
    sleepBtn.innerHTML = global.Phone.IconLibrary.get("clock", { size: 20 });
    sleepBtn.title = "定时关闭";
    sleepBtn.addEventListener("click", async () => {
      const opts = "1. 15 分钟\n2. 30 分钟\n3. 45 分钟\n4. 60 分钟\n5. 取消定时";
      const ans = await global.Phone.Modal.prompt({ title: "定时关闭", message: opts, placeholder: "1" });
      const idx = parseInt(ans, 10);
      if (_sleepTimer) { clearTimeout(_sleepTimer); _sleepTimer = null; }
      const mins = { 1: 15, 2: 30, 3: 45, 4: 60 }[idx];
      if (mins) {
        _sleepTimer = setTimeout(() => { MP.pause(); _sleepTimer = null; global.Phone.Notify.push({ appId: "music", title: "定时已到，已停止播放" }); }, mins * 60 * 1000);
        global.Phone.Notify.push({ appId: "music", title: mins + " 分钟后停止播放" });
      } else {
        global.Phone.Notify.push({ appId: "music", title: "已取消定时" });
      }
    });
    topRight.appendChild(sleepBtn);

    const share = U.el("button", { class: "icon-btn" });
    share.innerHTML = global.Phone.IconLibrary.get("share", { size: 20 });
    share.addEventListener("click", async () => {
      const ok = await global.Phone.Modal.confirm({
        title: "分享到朋友圈", message: "把「" + st.current.name + "」分享到朋友圈？", okText: "分享",
      });
      if (!ok) return;
      const moment = {
        id: U.uid("moment"),
        authorId: "user",
        content: "正在听：" + st.current.name + " - " + (st.current.artist || "") + "，旋律好温柔呀",
        topic: "正在听",
        mood: "calm",
        visibility: "public",
        images: st.current.cover ? [st.current.cover] : [],
        likes: [], comments: [], pinned: false,
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
      const EC = global.Phone.EventCenter;
      EC.emit(EC.TYPES.MUSIC_SHARED, {
        sourceApp: "music",
        data: { name: st.current.name, artist: st.current.artist },
        summary: "分享了歌曲：" + st.current.name,
      });
      global.Phone.Notify.push({ appId: "music", title: "已分享到朋友圈" });
    });
    topRight.appendChild(share);
    full.appendChild(topRight);

    // 封面
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

    const origRemove = full.remove.bind(full);
    full.remove = () => { if (_unsubFull) { try { _unsubFull(); } catch (e) {} _unsubFull = null; } origRemove(); _fullPage = null; };
  }

  // ---------- 设置页 ----------
  function _openSettings(U, onDone) {
    global.Phone.AppSettings.open({
      appId: "music",
      title: "音乐设置",
      build: (content, tools) => {
        const State = global.Phone.State;

        tools.section("显示");
        tools.toggle("显示统计概览", "关闭后隐藏顶部的数字卡片", "musicShowStats", null);
        tools.toggle("自动播放下一首", "歌曲结束后自动播放下一首", "musicAutoPlayNext", null);

        tools.section("排序");
        const curSort = State.get("musicDefaultSort") || "recent";
        const sortSeg = U.el("div", { class: "segment", style: { display: "flex", flexWrap: "wrap" } });
        [
          { v: "recent", l: "最近" },
          { v: "name", l: "名称" },
          { v: "artist", l: "歌手" },
          { v: "plays", l: "播放次数" },
        ].forEach((s) => {
          const node = U.el("div", { class: "segment-item" + (curSort === s.v ? " active" : ""), text: s.l });
          node.addEventListener("click", async () => {
            await State.set("musicDefaultSort", s.v);
            sortSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
            node.classList.add("active");
          });
          sortSeg.appendChild(node);
        });
        const sortGroup = U.el("div", { class: "settings-group", style: { padding: "12px 16px" } }, [sortSeg]);
        content.appendChild(sortGroup);

        tools.section("音量");
        tools.input("默认音量（0-1）", "musicDefaultVolume", { type: "number", min: "0", max: "1", step: "0.1" });

        tools.section("数据");
        tools.action("导出歌单（不含音频）", async () => {
          const list = await global.Phone.Storage.getAll("music");
          const light = list.map((s) => ({ id: s.id, name: s.name, artist: s.artist, favorited: s.favorited, playCount: s.playCount || 0 }));
          const blob = new Blob([JSON.stringify(light, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "music-" + new Date().toISOString().slice(0, 10) + ".json";
          a.click();
          URL.revokeObjectURL(url);
          global.Phone.Notify.push({ appId: "music", title: "已导出 " + light.length + " 首" });
        });
        tools.action("清空所有歌曲", async () => {
          const ok = await global.Phone.Modal.confirm({ title: "清空歌曲", message: "这会删除所有歌曲和音频文件，不可恢复哦。", danger: true });
          if (!ok) return;
          const list = await global.Phone.Storage.getAll("music");
          for (const s of list) await global.Phone.Storage.del("music", s.id);
          global.Phone.Notify.push({ appId: "music", title: "已清空" });
          onDone && onDone();
        }, { danger: true });
        tools.action("清空所有歌单", async () => {
          const ok = await global.Phone.Modal.confirm({ title: "清空歌单", message: "这会删除所有歌单（歌曲不删）。", danger: true });
          if (!ok) return;
          const list = await global.Phone.Storage.getAll("playlists");
          for (const p of list) await global.Phone.Storage.del("playlists", p.id);
          global.Phone.Notify.push({ appId: "music", title: "已清空歌单" });
          onDone && onDone();
        }, { danger: true });

        tools.section("关于");
        tools.hint("音乐 APP 帮你管理本地音乐，支持上传、歌单、收藏、播放模式、定时关闭。所有音频文件保存在本地 IndexedDB。");
      },
    });
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

  function _fmtDur(sec) {
    if (!sec) return "0分";
    const m = Math.floor(sec / 60);
    if (m < 60) return m + "分";
    const h = Math.floor(m / 60);
    return h + "时" + (m % 60) + "分";
  }

  function _nav(U, title, onAdd, onSettings) {
    const nav = U.el("div", { class: "navbar" });
    const navLeft = U.el("div", { class: "nav-left" });
    const back = U.el("button", { class: "icon-btn" });
    back.innerHTML = global.Phone.IconLibrary.get("chevron-left", { size: 22 });
    back.addEventListener("click", () => global.Phone.Router.back());
    navLeft.appendChild(back);
    nav.appendChild(navLeft);
    nav.appendChild(U.el("div", { class: "nav-title", text: title }));
    const navRight = U.el("div", { class: "nav-right" });
    if (onSettings) {
      const setBtn = U.el("button", { class: "icon-btn" });
      setBtn.innerHTML = global.Phone.IconLibrary.get("app-settings", { size: 20 });
      setBtn.addEventListener("click", onSettings);
      navRight.appendChild(setBtn);
    }
    if (onAdd) {
      const addBtn = U.el("button", { class: "icon-btn" });
      addBtn.innerHTML = global.Phone.IconLibrary.get("plus", { size: 22 });
      addBtn.addEventListener("click", onAdd);
      navRight.appendChild(addBtn);
    }
    nav.appendChild(navRight);
    return nav;
  }

  function _empty(U, title, sub) {
    return U.el("div", { class: "empty-state" }, [
      U.el("div", { class: "es-icon", html: global.Phone.IconLibrary.get("app-music", { size: 32 }) }),
      U.el("div", { class: "es-title", text: title }),
      U.el("div", { class: "es-sub", text: sub }),
    ]);
  }

  function _remount(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
    mount(container);
  }

  // ---------- 暴露 API ----------
  global.Phone.Music = {
    open, mount,
    /** 列出歌曲 */
    async list(filter) {
      let list = await global.Phone.Storage.getAll("music");
      if (filter) {
        if (filter.favorited != null) list = list.filter((s) => !!s.favorited === !!filter.favorited);
        if (filter.artist) list = list.filter((s) => s.artist === filter.artist);
        if (filter.since) list = list.filter((s) => s.createdAt >= filter.since);
      }
      return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },
    /** 列出歌单 */
    async listPlaylists() {
      return await global.Phone.Storage.getAll("playlists");
    },
    /** 收藏/取消收藏 */
    async setFavorite(songId, fav) {
      const s = await global.Phone.Storage.get("music", songId);
      if (!s) return { ok: false, error: "找不到歌曲" };
      s.favorited = !!fav;
      s.updatedAt = Date.now();
      await global.Phone.Storage.put("music", s);
      return { ok: true };
    },
    /** 创建歌单 */
    async createPlaylist(name, songIds) {
      const pl = {
        id: global.Phone.Utils.uid("pl"),
        name: name || "未命名歌单",
        songIds: songIds || [],
        createdAt: Date.now(),
      };
      await global.Phone.Storage.put("playlists", pl);
      return pl;
    },
    /** 统计 */
    async stats() {
      const songs = await global.Phone.Storage.getAll("music");
      const playlists = await global.Phone.Storage.getAll("playlists");
      return {
        songs: songs.length,
        playlists: playlists.length,
        favorites: songs.filter((s) => s.favorited).length,
        totalDuration: songs.reduce((acc, s) => acc + (s.duration || 0), 0),
        totalPlays: songs.reduce((acc, s) => acc + (s.playCount || 0), 0),
      };
    },
  };
})(window);
