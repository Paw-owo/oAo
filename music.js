// apps/music.js
// imports:
//   from '../core/storage.js': getData, setData, generateId, getNow, getDB, setDB, deleteDB, getAllDB
//   from '../core/ui.js': createIcon, showToast

import {
  getData,
  setData,
  generateId,
  getNow,
  getDB,
  setDB,
  deleteDB,
  getAllDB
} from '../core/storage.js';

import { createIcon, showToast } from '../core/ui.js';
import { emit } from '../core/app-bus.js';

/* ═══════════════════════════════════════
   常量
   ═══════════════════════════════════════ */

const STYLE_ID = 'music-app-style';
const SONG_STORE = 'songs';
const PLAYLIST_STORE = 'playlists';
const BLOB_STORE = 'blobs';
const CHARACTER_STORE = 'characters';

const MUSIC_SETTINGS_KEY = 'music_app_settings';
const MUSIC_CURRENT_KEY = 'music_current_song';

const PRESET_FILM_WALLPAPERS = [
  { id: 'film_1', name: '经典胶片', gradient: 'linear-gradient(135deg, #3D2E28 0%, #4A3630 50%, #2E201C 100%)' },
  { id: 'film_2', name: '暖光胶片', gradient: 'linear-gradient(135deg, #4A3A2E 0%, #3E3028 50%, #342820 100%)' },
  { id: 'film_3', name: '冷调胶片', gradient: 'linear-gradient(135deg, #2E3438 0%, #343E44 50%, #282E34 100%)' },
  { id: 'film_4', name: '暮色胶片', gradient: 'linear-gradient(135deg, #3E2830 0%, #4A3038 50%, #342028 100%)' }
];

/* ═══════════════════════════════════════
   全局状态
   ═══════════════════════════════════════ */

// 防止 music:play 事件回环：外部请求播放时置 true，playSong 内不再 emit
let suppressMusicEmit = false;

let state = {
  mounted: false,
  rootEl: null,
  currentPage: 'player',
  songs: [],
  playlists: [],
  activePlaylistId: 'all',
  currentSongId: '',
  isPlaying: false,
  playMode: 'list',
  currentTime: 0,
  duration: 0,
  volume: 1,
  audioContext: null,
  audioSource: null,
  audioSourceConnected: false,
  analyser: null,
  gainNode: null,
  audioElement: null,
  lyrics: [],
  currentLyricIndex: -1,
  dualMode: false,
  selectedCharacterId: '',
  characters: [],
  filmWallpaper: PRESET_FILM_WALLPAPERS[0],
  customWallpaper: '',
  playerBg: '',
  listBg: '',
  coverRotation: 0,
  animationFrame: null,
  settingsDrawer: null,
  playlistDrawer: null,
  addToPlaylistDrawer: null,
  settings: {
    autoPlay: true,
    showLyrics: true,
    filmWallpaperId: 'film_1',
    playerBgKey: 'app_bg_music_player',
    listBgKey: 'app_bg_music_list',
    dualMode: false,
    selectedCharacterId: '',
    playMode: 'list'
  }
};

/* ═══════════════════════════════════════
   公开接口
   ═══════════════════════════════════════ */

export async function mount(containerEl) {
  if (state.mounted) return;

  state.rootEl = containerEl;
  state.mounted = true;

  await loadSettings();
  await loadCharacters();
  await loadSongs();
  await loadPlaylists();
  await loadCurrentSong();

  injectStyle();
  render();
  initAudioElement();
  startAnimationLoop();
  ensureMiniPlayer();

  const playerApi = {
    isPlaying: () => state.isPlaying,
    getCurrentSong: () => getCurrentSong(),
    togglePlay,
    playNext,
    playPrevious,
    playSong,
    getSongs: () => state.songs,
    getPlaylists: () => state.playlists
  };

  window.musicPlayer = playerApi;

  // 监听外部播放请求
  try {
    state.unsubscribeMusicPlay = window.AppBus?.on?.('music:play', (data) => {
      const songId = data?.songId;
      if (songId) {
        // 外部请求触发的播放不再回弹 music:play，避免事件循环
        suppressMusicEmit = true;
        playSong(songId).catch(() => {}).finally(() => { suppressMusicEmit = false; });
      } else {
        togglePlay();
      }
    });
  } catch (_) {}
}

export function unmount() {
  if (!state.mounted) return;

  stopAnimationLoop();

  if (state.audioElement) {
    state.audioElement.pause();
  }

  // 清理 appBus 订阅（保留 music API 注册，方便其他 APP 继续控制迷你播放条）
  if (state.unsubscribeMusicPlay) {
    try { state.unsubscribeMusicPlay(); } catch (_) {}
    state.unsubscribeMusicPlay = null;
  }

  state.mounted = false;
  state.rootEl = null;
  // 迷你播放条不移除，跟着歌曲生命周期走
}

/* ═══════════════════════════════════════
   样式注入
   ═══════════════════════════════════════ */

function injectStyle() {
  const old = document.getElementById(STYLE_ID);
  if (old) old.remove();

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .music-app {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
      z-index: 0;
    }

    /* ── 顶栏 ── */

    .music-topbar {
      min-height: 58px;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 12px;
      padding: 0 20px 12px;
      z-index: 10;
    }

    .music-topbar-btn {
      width: 38px;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      background: color-mix(in srgb, var(--text-primary) 8%, transparent);
      color: var(--text-primary);
      border: none;
      outline: none;
      transition: all 200ms ease;
    }

    .music-topbar-btn:active {
      transform: scale(0.96);
    }

    .music-title {
      flex: 1;
      text-align: center;
      font-size: 17px;
      font-weight: 600;
      color: var(--text-primary);
    }

    /* ── 标签页 ── */

    .music-tabs {
      display: flex;
      gap: 6px;
      padding: 0 20px 12px;
    }

    .music-tab {
      flex: 1;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      background: color-mix(in srgb, var(--text-primary) 8%, transparent);
      color: var(--text-secondary);
      font-size: 14px;
      font-weight: 500;
      border: none;
      outline: none;
      transition: all 200ms ease;
    }

    .music-tab.active {
      background: var(--accent);
      color: #fff;
    }

    .music-tab:active {
      transform: scale(0.96);
    }

    /* ── 页面容器 ── */

    .music-page-container {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    .music-page {
      position: absolute;
      inset: 0;
      overflow-y: auto;
      transition: transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 250ms ease;
    }

    .music-page.hidden-right {
      transform: translateX(100%);
      opacity: 0;
      pointer-events: none;
    }

    .music-page.hidden-left {
      transform: translateX(-100%);
      opacity: 0;
      pointer-events: none;
    }

    /* ═══════════════════════════════════
       播放页 — 黑胶唱片
       ═══════════════════════════════════ */

    .player-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 16px 24px 20px;
      padding-bottom: calc(20px + env(safe-area-inset-bottom));
      position: relative;
      overflow: hidden;
      min-height: 100%;
      box-sizing: border-box;
      background-size: cover;
      background-position: center;
    }

    .player-bg-overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
    }

    .player-dual-header {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px 0 8px;
    }

    .dual-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: color-mix(in srgb, #fff 12%, transparent);
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      overflow: hidden;
      border: 3px solid rgba(0,0,0,0.3);
    }

    .dual-avatar:nth-child(2) {
      margin-left: -14px;
    }

    .dual-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .dual-avatar-ph {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.6);
    }

    .vinyl-stage {
      position: relative;
      z-index: 1;
      width: min(320px, 75vw);
      height: min(320px, 75vw);
      margin: 8px 0 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .vinyl-disc {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: radial-gradient(circle at 50% 50%,
        #1a1412 0%, #1a1412 38%,
        #2a2420 39%, #252018 42%,
        #2e2822 44%, #201c18 46%,
        #2e2822 48%, #1e1a16 50%,
        #2a2420 52%, #221e1a 54%,
        #2a2420 56%, #1e1a18 58%,
        #262220 60%, #201c18 62%,
        #282422 64%, #1e1a16 66%,
        #242018 68%, #201c18 70%,
        #282420 72%, #1e1a16 74%,
        #262220 76%, #1c1814 78%,
        #242018 80%, #1e1a18 82%,
        #282422 84%, #201c18 86%,
        #262220 88%, #1c1814 90%,
        #221e1a 92%, #1e1a16 94%,
        #282422 96%, #1e1a16 98%,
        #141210 100%
      );
      box-shadow:
        0 6px 30px rgba(0,0,0,0.5),
        0 2px 10px rgba(0,0,0,0.3),
        inset 0 0 40px rgba(0,0,0,0.4);
      transition: transform 80ms linear;
      will-change: transform;
    }

    .vinyl-disc::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 36%;
      height: 36%;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      box-shadow: 0 0 0 4px rgba(255,255,255,0.08);
    }

    .vinyl-cover {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 36%;
      height: 36%;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      overflow: hidden;
      box-shadow: 0 2px 12px rgba(0,0,0,0.4);
      z-index: 1;
    }

    .vinyl-cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .vinyl-cover-ph {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #4a3a30, #3a2a20);
      color: rgba(255,255,255,0.4);
    }

    .vinyl-center-dot {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 14px;
      height: 14px;
      margin: -7px 0 0 -7px;
      border-radius: 50%;
      background: #1a1412;
      box-shadow: 0 0 0 3px rgba(255,255,255,0.1);
      z-index: 2;
    }

    .vinyl-tonearm {
      position: absolute;
      top: -4%;
      right: 6%;
      width: 40%;
      z-index: 3;
      transform-origin: 85% 8%;
      transform: rotate(28deg);
      transition: transform 600ms cubic-bezier(0.34, 1.56, 0.64, 1);
      filter: drop-shadow(0 3px 6px rgba(0,0,0,0.4));
      pointer-events: none;
    }

    .vinyl-tonearm.playing {
      transform: rotate(8deg);
    }

    .player-song-info {
      position: relative;
      z-index: 1;
      text-align: center;
      width: 100%;
      padding: 0 10px;
      margin-bottom: 6px;
    }

    .player-song-title {
      font-size: 19px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-shadow: 0 1px 4px rgba(0,0,0,0.3);
    }

    .player-song-artist {
      font-size: 14px;
      color: rgba(255,255,255,0.6);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .player-progress {
      position: relative;
      z-index: 1;
      width: 100%;
      padding: 12px 0 4px;
    }

    .progress-bar {
      width: 100%;
      height: 3px;
      border-radius: 2px;
      background: rgba(255,255,255,0.15);
      cursor: pointer;
      position: relative;
    }

    .progress-fill {
      height: 100%;
      border-radius: 2px;
      background: #E8C9A0;
      transition: width 100ms linear;
    }

    .progress-thumb {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #E8C9A0;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      cursor: grab;
      transition: left 100ms linear;
    }

    .progress-times {
      display: flex;
      justify-content: space-between;
      padding-top: 8px;
      font-size: 11px;
      color: rgba(255,255,255,0.4);
      font-variant-numeric: tabular-nums;
    }

    .player-controls {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 32px;
      padding: 10px 0 8px;
    }

    .ctrl-btn {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: transparent;
      border: none;
      outline: none;
      color: rgba(255,255,255,0.7);
      transition: all 200ms ease;
    }

    .ctrl-btn:active {
      transform: scale(0.92);
    }

    .ctrl-btn.main-play {
      width: 64px;
      height: 64px;
      background: rgba(255,255,255,0.12);
      color: #fff;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    .ctrl-btn.main-play:active {
      background: rgba(255,255,255,0.2);
    }

    .player-extra {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-around;
      width: 100%;
      padding: 0 24px;
    }

    .extra-btn {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.4);
      border: none;
      outline: none;
      background: transparent;
      transition: all 200ms ease;
    }

    .extra-btn:active {
      transform: scale(0.92);
    }

    .extra-btn.active {
      color: #E8C9A0;
    }

    /* ═══════════════════════════════════
       歌单页
       ═══════════════════════════════════ */

    .list-page {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }

    .list-bg-overlay {
      position: absolute;
      inset: 0;
      background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      pointer-events: none;
    }

    .list-content {
      position: relative;
      z-index: 1;
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .list-hero {
      padding: 16px 20px 12px;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .list-hero-avatar {
      width: 64px;
      height: 64px;
      border-radius: var(--radius-lg);
      background: color-mix(in srgb, var(--accent) 12%, var(--bg-card));
      box-shadow: var(--shadow-md);
      overflow: hidden;
      flex-shrink: 0;
      cursor: pointer;
      position: relative;
    }

    .list-hero-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .list-hero-avatar-ph {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
    }

    .list-hero-avatar-edit {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--accent);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--shadow-sm);
    }

    .list-hero-info { flex: 1; }

    .list-hero-title {
      font-size: 19px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 3px;
    }

    .list-hero-count {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .list-pl-bar {
      display: flex;
      gap: 8px;
      padding: 0 20px 10px;
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .list-pl-bar::-webkit-scrollbar { display: none; }

    .list-pl-chip {
      flex-shrink: 0;
      height: 32px;
      padding: 0 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 500;
      box-shadow: var(--shadow-sm);
      border: none;
      outline: none;
      transition: all 200ms ease;
      gap: 6px;
    }

    .list-pl-chip.active {
      background: var(--accent);
      color: #fff;
    }

    .list-pl-chip:active { transform: scale(0.96); }

    .list-pl-chip svg { width: 14px; height: 14px; }

    .list-actions {
      padding: 0 20px 10px;
      display: flex;
      gap: 10px;
    }

    .list-act-btn {
      flex: 1;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-radius: var(--radius-md);
      background: var(--bg-card);
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 500;
      box-shadow: var(--shadow-sm);
      border: none;
      outline: none;
      transition: all 200ms ease;
    }

    .list-act-btn.primary {
      background: var(--accent);
      color: #fff;
    }

    .list-act-btn:active { transform: scale(0.96); }

    .song-list {
      flex: 1;
      overflow-y: auto;
      padding: 0 20px;
      padding-bottom: calc(110px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling: touch;
    }

    .song-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid color-mix(in srgb, var(--text-hint) 8%, transparent);
      cursor: pointer;
      transition: all 200ms ease;
    }

    .song-item:last-child { border-bottom: none; }

    .song-item:active { opacity: 0.7; }

    .song-item.active {
      background: color-mix(in srgb, var(--accent) 8%, transparent);
      border-radius: var(--radius-md);
      padding: 10px 12px;
      margin: 0 -12px;
    }

    .song-item-cover {
      width: 46px;
      height: 46px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--accent) 12%, var(--bg-card));
      overflow: hidden;
      flex-shrink: 0;
    }

    .song-item-cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .song-item-cover-ph {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
    }

    .song-item-info {
      flex: 1;
      min-width: 0;
    }

    .song-item-title {
      font-size: 15px;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .song-item.active .song-item-title { color: var(--accent); }

    .song-item-artist {
      font-size: 13px;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .song-item-dur {
      font-size: 12px;
      color: var(--text-hint);
      flex-shrink: 0;
      font-variant-numeric: tabular-nums;
    }

    .song-item-acts {
      display: flex;
      gap: 2px;
      flex-shrink: 0;
    }

    .song-item-act-btn {
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-hint);
      border: none;
      outline: none;
      background: transparent;
      transition: all 200ms ease;
    }

    .song-item-act-btn:active {
      transform: scale(0.9);
      color: var(--accent);
    }

    .song-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;
    }

    .song-empty-icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--accent) 12%, var(--bg-card));
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
      margin-bottom: 16px;
    }

    .song-empty-title {
      font-size: 16px;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 6px;
    }

    .song-empty-desc {
      font-size: 13px;
      color: var(--text-secondary);
    }

    /* ═══════════════════════════════════
       迷你播放条
       ═══════════════════════════════════ */

    .music-mini {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: calc(86px + env(safe-area-inset-bottom));
      z-index: 1000;
      height: 62px;
      border-radius: 18px;
      background: color-mix(in srgb, var(--bg-card) 94%, transparent);
      box-shadow: var(--shadow-md);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 14px;
      cursor: pointer;
      transform: translateY(100px);
      opacity: 0;
      transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
      overflow: hidden;
    }

    .music-mini.visible {
      transform: translateY(0);
      opacity: 1;
    }

    .music-mini:active {
      transform: scale(0.98);
    }

    .music-mini-progress {
      position: absolute;
      bottom: 0;
      left: 14px;
      right: 14px;
      height: 2px;
      border-radius: 1px;
      background: color-mix(in srgb, var(--text-hint) 15%, transparent);
      overflow: hidden;
    }

    .music-mini-progress-fill {
      height: 100%;
      border-radius: 1px;
      background: var(--accent);
      width: 0%;
      transition: width 300ms linear;
    }

    .music-mini-cover {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--accent) 12%, var(--bg-card));
      overflow: hidden;
      flex-shrink: 0;
    }

    .music-mini-cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .music-mini-cover-ph {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
    }

    .music-mini-info {
      flex: 1;
      min-width: 0;
    }

    .music-mini-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .music-mini-artist {
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .music-mini-ctrls {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }

    .music-mini-btn {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-primary);
      border: none;
      outline: none;
      background: transparent;
      transition: all 200ms ease;
    }

    .music-mini-btn:active { transform: scale(0.9); }

    /* ═══════════════════════════════════
       歌词面板
       ═══════════════════════════════════ */

    .music-lyrics-panel {
      position: fixed;
      inset: 0;
      z-index: 2000;
      background: linear-gradient(180deg, rgba(30,24,20,0.96), rgba(20,16,14,0.98));
      backdrop-filter: blur(40px);
      -webkit-backdrop-filter: blur(40px);
      transform: translateY(100%);
      transition: transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
      display: flex;
      flex-direction: column;
    }

    .music-lyrics-panel.open {
      transform: translateY(0);
    }

    .music-lyrics-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 20px 12px;
      min-height: 58px;
    }

    .music-lyrics-close {
      width: 38px;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      background: rgba(255,255,255,0.08);
      color: #fff;
      border: none;
      outline: none;
    }

    .music-lyrics-song {
      font-size: 15px;
      font-weight: 500;
      color: rgba(255,255,255,0.8);
      max-width: 60%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
    }

    .music-lyrics-placeholder {
      width: 38px;
    }

    .music-lyrics-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 20px 32px 60px;
      -webkit-overflow-scrolling: touch;
      mask-image: linear-gradient(180deg, transparent 0%, #000 12%, #000 80%, transparent 100%);
      -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 12%, #000 80%, transparent 100%);
    }

    .lyric-line {
      padding: 14px 0;
      font-size: 16px;
      line-height: 1.8;
      color: rgba(255,255,255,0.25);
      text-align: center;
      transition: all 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
      cursor: pointer;
    }

    .lyric-line:active { opacity: 0.7; }

    .lyric-line.active {
      font-size: 20px;
      font-weight: 600;
      color: #fff;
      text-shadow: 0 0 20px rgba(232,201,160,0.3);
      transform: scale(1.04);
    }

    .lyrics-empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 40px;
    }

    .lyrics-empty-icon {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: rgba(255,255,255,0.06);
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.3);
      margin-bottom: 20px;
    }

    .lyrics-empty-title {
      font-size: 17px;
      font-weight: 500;
      color: rgba(255,255,255,0.7);
      margin-bottom: 8px;
    }

    .lyrics-empty-desc {
      font-size: 13px;
      color: rgba(255,255,255,0.35);
      margin-bottom: 24px;
    }

    .lyrics-empty-btns {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 200px;
    }

    .lyrics-empty-btn {
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-radius: var(--radius-full);
      font-size: 14px;
      font-weight: 500;
      border: none;
      outline: none;
      transition: all 200ms ease;
    }

    .lyrics-empty-btn:active { transform: scale(0.96); }

    .lyrics-empty-btn.primary {
      background: #E8C9A0;
      color: #1a1412;
    }

    .lyrics-empty-btn.secondary {
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.7);
    }

    /* ═══════════════════════════════════
       抽屉通用
       ═══════════════════════════════════ */

    .music-drawer-bg {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.35);
      z-index: 50;
      opacity: 0;
      transition: opacity 250ms ease;
      pointer-events: none;
    }

    .music-drawer-bg.open {
      opacity: 1;
      pointer-events: auto;
    }

    .music-drawer {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 51;
      background: var(--bg-primary);
      border-radius: var(--radius-xl) var(--radius-xl) 0 0;
      box-shadow: 0 -4px 24px rgba(0,0,0,0.12);
      transform: translateY(100%);
      transition: transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
      max-height: 80vh;
      overflow-y: auto;
      padding-bottom: env(safe-area-inset-bottom);
    }

    .music-drawer.open {
      transform: translateY(0);
    }

    .drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px;
      border-bottom: 1px solid color-mix(in srgb, var(--text-hint) 8%, transparent);
      position: sticky;
      top: 0;
      background: var(--bg-primary);
      z-index: 1;
    }

    .drawer-title {
      font-size: 17px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .drawer-close {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      border: none;
      outline: none;
    }

    .setting-group {
      padding: 16px 20px;
    }

    .setting-group-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .setting-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      background: var(--bg-card);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
      margin-bottom: 8px;
    }

    .setting-label {
      font-size: 15px;
      color: var(--text-primary);
    }

    .setting-value {
      font-size: 14px;
      color: var(--text-secondary);
    }

    .music-toggle {
      width: 48px;
      height: 28px;
      border-radius: 14px;
      background: color-mix(in srgb, var(--text-hint) 25%, transparent);
      position: relative;
      cursor: pointer;
      transition: all 200ms ease;
    }

    .music-toggle.active {
      background: var(--accent);
    }

    .music-toggle::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #fff;
      box-shadow: var(--shadow-sm);
      transition: transform 200ms ease;
    }

    .music-toggle.active::after {
      transform: translateX(20px);
    }

    .volume-slider {
      width: 100%;
      height: 4px;
      border-radius: 2px;
      background: color-mix(in srgb, var(--text-hint) 25%, transparent);
      -webkit-appearance: none;
      appearance: none;
      outline: none;
    }

    .volume-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: var(--shadow-sm);
      cursor: grab;
    }

    .wp-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }

    .wp-item {
      height: 80px;
      border-radius: var(--radius-md);
      overflow: hidden;
      cursor: pointer;
      position: relative;
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .wp-item.active {
      box-shadow: 0 0 0 3px var(--accent);
    }

    .wp-item:active { transform: scale(0.96); }

    .char-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .char-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      transition: all 200ms ease;
    }

    .char-item:active { transform: scale(0.92); }

    .char-item:not(.active) { opacity: 0.5; }

    .char-avatar {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
    }

    .char-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .char-avatar-ph {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
    }

    .char-name {
      font-size: 11px;
      color: var(--text-secondary);
      max-width: 60px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
    }

    .pl-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      border-bottom: 1px solid color-mix(in srgb, var(--text-hint) 8%, transparent);
    }

    .pl-row-name {
      font-size: 15px;
      color: var(--text-primary);
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .pl-row-count {
      font-size: 12px;
      color: var(--text-hint);
      margin-left: 8px;
    }

    .pl-row-btns {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
      margin-left: 12px;
    }

    .pl-row-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-hint);
      border: none;
      outline: none;
      background: transparent;
      transition: all 200ms ease;
    }

    .pl-row-btn:active {
      transform: scale(0.9);
      color: var(--accent);
    }

    .pl-row-btn.danger:active {
      color: var(--accent);
    }

    .pl-add-btn {
      width: 100%;
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--accent);
      font-size: 14px;
      font-weight: 500;
      border: none;
      outline: none;
      background: transparent;
      transition: all 200ms ease;
    }

    .pl-add-btn:active { opacity: 0.7; }

    .music-spectrum {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 100px;
      z-index: 0;
      pointer-events: none;
      opacity: 0.2;
    }
  `;

  document.head.appendChild(style);
}

/* ═══════════════════════════════════════
   渲染主函数
   ═══════════════════════════════════════ */

function render() {
  if (!state.rootEl) return;

  state.rootEl.innerHTML = '';

  const app = document.createElement('section');
  app.className = 'music-app';

  app.appendChild(createTopbar());
  app.appendChild(createTabs());
  app.appendChild(createPageContainer());

  state.rootEl.appendChild(app);

  updateVinylState();
}

/* ── 顶栏 ── */

function createTopbar() {
  const bar = document.createElement('div');
  bar.className = 'music-topbar';

  const back = document.createElement('button');
  back.className = 'music-topbar-btn';
  back.appendChild(createIcon('back', 20));
  back.addEventListener('click', () => window.closeCurrentApp?.());

  const title = document.createElement('div');
  title.className = 'music-title';
  title.textContent = '音乐';

  const settings = document.createElement('button');
  settings.className = 'music-topbar-btn';
  settings.appendChild(createIcon('settings', 18));
  settings.addEventListener('click', openSettingsDrawer);

  bar.append(back, title, settings);
  return bar;
}

/* ── 标签页 ── */

function createTabs() {
  const tabs = document.createElement('div');
  tabs.className = 'music-tabs';

  const playerTab = document.createElement('button');
  playerTab.className = `music-tab${state.currentPage === 'player' ? ' active' : ''}`;
  playerTab.textContent = '播放';
  playerTab.addEventListener('click', () => switchPage('player'));

  const listTab = document.createElement('button');
  listTab.className = `music-tab${state.currentPage === 'list' ? ' active' : ''}`;
  listTab.textContent = '歌单';
  listTab.addEventListener('click', () => switchPage('list'));

  tabs.append(playerTab, listTab);
  return tabs;
}

/* ── 页面容器 ── */

function createPageContainer() {
  const wrap = document.createElement('div');
  wrap.className = 'music-page-container';

  const player = createPlayerPage();
  player.classList.add('music-page');
  if (state.currentPage !== 'player') player.classList.add('hidden-right');

  const list = createListPage();
  list.classList.add('music-page');
  if (state.currentPage !== 'list') list.classList.add('hidden-left');

  wrap.append(player, list);
  return wrap;
}

/* ── 切页 ── */

function switchPage(page) {
  state.currentPage = page;

  const pages = document.querySelectorAll('.music-page');
  if (pages.length < 2) return;

  const [playerPage, listPage] = pages;

  if (page === 'player') {
    playerPage.classList.remove('hidden-right', 'hidden-left');
    listPage.classList.remove('hidden-right');
    listPage.classList.add('hidden-left');
  } else {
    listPage.classList.remove('hidden-right', 'hidden-left');
    playerPage.classList.remove('hidden-left');
    playerPage.classList.add('hidden-right');
  }

  document.querySelectorAll('.music-tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && page === 'player') || (i === 1 && page === 'list'));
  });
}

/* ═══════════════════════════════════════
   播放页 — 黑胶唱片
   ═══════════════════════════════════════ */

function createPlayerPage() {
  const page = document.createElement('div');
  page.className = 'player-page';

  if (state.customWallpaper) {
    page.style.backgroundImage = `url(${state.customWallpaper})`;
  } else if (state.filmWallpaper?.gradient) {
    page.style.background = state.filmWallpaper.gradient;
  }

  const overlay = document.createElement('div');
  overlay.className = 'player-bg-overlay';
  overlay.style.background = 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.4) 100%)';
  page.appendChild(overlay);

  const spectrum = document.createElement('canvas');
  spectrum.className = 'music-spectrum';
  spectrum.id = 'music-spectrum-canvas';
  page.appendChild(spectrum);

  if (state.dualMode && state.selectedCharacterId) {
    page.appendChild(buildDualHeader());
  }

  page.appendChild(buildVinylStage());
  page.appendChild(buildSongInfo());
  page.appendChild(buildProgressBar());
  page.appendChild(buildControls());
  page.appendChild(buildExtraControls());

  return page;
}

function buildDualHeader() {
  const header = document.createElement('div');
  header.className = 'player-dual-header';

  const user = document.createElement('div');
  user.className = 'dual-avatar';
  const uImg = getUserAvatar();
  if (uImg) {
    const img = document.createElement('img');
    img.src = uImg;
    user.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'dual-avatar-ph';
    ph.appendChild(createIcon('star', 22));
    user.appendChild(ph);
  }

  const ai = document.createElement('div');
  ai.className = 'dual-avatar';
  const ch = state.characters.find(c => c.id === state.selectedCharacterId);
  if (ch?.avatar) {
    const img = document.createElement('img');
    img.src = ch.avatar;
    ai.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'dual-avatar-ph';
    ph.appendChild(createIcon('heart', 22));
    ai.appendChild(ph);
  }

  header.append(user, ai);
  return header;
}

function buildVinylStage() {
  const stage = document.createElement('div');
  stage.className = 'vinyl-stage';

  const disc = document.createElement('div');
  disc.className = 'vinyl-disc';
  disc.id = 'vinyl-disc';
  disc.style.transform = `rotate(${state.coverRotation}deg)`;

  const cover = document.createElement('div');
  cover.className = 'vinyl-cover';
  const song = getCurrentSong();
  if (song?.cover) {
    const img = document.createElement('img');
    img.src = song.cover;
    cover.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'vinyl-cover-ph';
    ph.appendChild(createIcon('music', 36));
    cover.appendChild(ph);
  }
  disc.appendChild(cover);
  disc.appendChild(Object.assign(document.createElement('div'), { className: 'vinyl-center-dot' }));

  const tonearm = document.createElement('div');
  tonearm.className = `vinyl-tonearm${state.isPlaying ? ' playing' : ''}`;
  tonearm.id = 'vinyl-tonearm';
  tonearm.innerHTML = `<svg viewBox="0 0 120 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="102" cy="16" r="14" fill="#666" stroke="#888" stroke-width="2"/>
    <circle cx="102" cy="16" r="5" fill="#444"/>
    <rect x="96" y="28" width="12" height="60" rx="4" fill="#888"/>
    <rect x="98" y="84" width="8" height="4" rx="2" fill="#666"/>
    <rect x="88" y="86" width="28" height="8" rx="3" fill="#999"/>
    <rect x="95" y="94" width="16" height="70" rx="5" fill="#777"/>
    <rect x="97" y="94" width="12" height="70" rx="4" fill="#888"/>
    <rect x="99" y="162" width="8" height="18" rx="3" fill="#666"/>
    <rect x="94" y="178" width="18" height="6" rx="2" fill="#aaa"/>
    <rect x="100" y="184" width="6" height="10" rx="1" fill="#999"/>
  </svg>`;

  stage.append(disc, tonearm);
  return stage;
}

function buildSongInfo() {
  const info = document.createElement('div');
  info.className = 'player-song-info';

  const song = getCurrentSong();

  const title = document.createElement('div');
  title.className = 'player-song-title';
  title.textContent = song?.title || '未播放';

  const artist = document.createElement('div');
  artist.className = 'player-song-artist';
  artist.textContent = song?.artist || '未知艺术家';

  info.append(title, artist);
  return info;
}

function buildProgressBar() {
  const wrap = document.createElement('div');
  wrap.className = 'player-progress';

  const bar = document.createElement('div');
  bar.className = 'progress-bar';

  const pct = state.duration ? (state.currentTime / state.duration) * 100 : 0;

  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  fill.style.width = pct + '%';

  const thumb = document.createElement('div');
  thumb.className = 'progress-thumb';
  thumb.style.left = pct + '%';

  bar.append(fill, thumb);

  bar.addEventListener('click', (e) => {
    if (!state.audioElement || !state.duration) return;
    const rect = bar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    state.audioElement.currentTime = percent * state.duration;
  });

  const times = document.createElement('div');
  times.className = 'progress-times';

  const cur = document.createElement('span');
  cur.textContent = formatTime(state.currentTime);

  const dur = document.createElement('span');
  dur.textContent = formatTime(state.duration);

  times.append(cur, dur);
  wrap.append(bar, times);
  return wrap;
}

function buildControls() {
  const ctrls = document.createElement('div');
  ctrls.className = 'player-controls';

  const prev = document.createElement('button');
  prev.className = 'ctrl-btn';
  prev.appendChild(createIcon('back', 24));
  prev.addEventListener('click', playPrevious);

  const play = document.createElement('button');
  play.className = 'ctrl-btn main-play';
  play.id = 'play-btn';
  play.appendChild(createIcon(state.isPlaying ? 'pause' : 'play', 28));
  play.addEventListener('click', togglePlay);

  const next = document.createElement('button');
  next.className = 'ctrl-btn';
  next.appendChild(createIcon('arrow-right', 24));
  next.addEventListener('click', playNext);

  ctrls.append(prev, play, next);
  return ctrls;
}

function buildExtraControls() {
  const wrap = document.createElement('div');
  wrap.className = 'player-extra';

  const lyrics = document.createElement('button');
  lyrics.className = `extra-btn${state.isLyricsOpen ? ' active' : ''}`;
  lyrics.appendChild(createIcon('edit', 20));
  lyrics.addEventListener('click', toggleLyricsPanel);

  const dual = document.createElement('button');
  dual.className = `extra-btn${state.dualMode ? ' active' : ''}`;
  dual.appendChild(createIcon('heart', 20));
  dual.addEventListener('click', () => {
    state.dualMode = !state.dualMode;
    saveSettings();
    render();
  });

  const loop = document.createElement('button');
  loop.className = `extra-btn${state.playMode === 'loop' ? ' active' : ''}`;
  loop.appendChild(createIcon('refresh', 20));
  loop.addEventListener('click', () => {
    state.playMode = state.playMode === 'loop' ? 'list' : 'loop';
    saveSettings();
    showToast(state.playMode === 'loop' ? '单曲循环' : '列表播放');
  });

  const shuffle = document.createElement('button');
  shuffle.className = `extra-btn${state.playMode === 'shuffle' ? ' active' : ''}`;
  shuffle.appendChild(createIcon('star', 20));
  shuffle.addEventListener('click', () => {
    state.playMode = state.playMode === 'shuffle' ? 'list' : 'shuffle';
    saveSettings();
    showToast(state.playMode === 'shuffle' ? '随机播放' : '列表播放');
  });

  wrap.append(lyrics, dual, loop, shuffle);
  return wrap;
}

/* ═══════════════════════════════════════
   歌单页
   ═══════════════════════════════════════ */

function createListPage() {
  const page = document.createElement('div');
  page.className = 'list-page';

  if (state.listBg) {
    page.style.backgroundImage = `url(${state.listBg})`;
    page.style.backgroundSize = 'cover';
    page.style.backgroundPosition = 'center';
  }

  const overlay = document.createElement('div');
  overlay.className = 'list-bg-overlay';
  page.appendChild(overlay);

  const content = document.createElement('div');
  content.className = 'list-content';

  content.append(
    buildListHero(),
    buildPlaylistBar(),
    buildListActions(),
    buildSongList()
  );

  page.appendChild(content);
  return page;
}

function buildListHero() {
  const hero = document.createElement('div');
  hero.className = 'list-hero';

  const avatar = document.createElement('div');
  avatar.className = 'list-hero-avatar';
  avatar.addEventListener('click', () => showToast('头像更换开发中'));

  const avImg = getListAvatar();
  if (avImg) {
    const img = document.createElement('img');
    img.src = avImg;
    avatar.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'list-hero-avatar-ph';
    ph.appendChild(createIcon('music', 28));
    avatar.appendChild(ph);
  }

  const edit = document.createElement('div');
  edit.className = 'list-hero-avatar-edit';
  edit.appendChild(createIcon('edit', 11));
  avatar.appendChild(edit);

  const info = document.createElement('div');
  info.className = 'list-hero-info';

  const pl = getActivePlaylist();
  const songs = getDisplaySongs();

  const title = document.createElement('div');
  title.className = 'list-hero-title';
  title.textContent = pl?.name || '全部歌曲';

  const count = document.createElement('div');
  count.className = 'list-hero-count';
  count.textContent = `${songs.length} 首歌曲`;

  info.append(title, count);
  hero.append(avatar, info);
  return hero;
}

function buildPlaylistBar() {
  const bar = document.createElement('div');
  bar.className = 'list-pl-bar';

  const all = document.createElement('button');
  all.className = `list-pl-chip${state.activePlaylistId === 'all' ? ' active' : ''}`;
  all.textContent = '全部';
  all.addEventListener('click', () => { state.activePlaylistId = 'all'; render(); });
  bar.appendChild(all);

  state.playlists.forEach(pl => {
    const chip = document.createElement('button');
    chip.className = `list-pl-chip${state.activePlaylistId === pl.id ? ' active' : ''}`;
    chip.textContent = pl.name || '未命名';
    chip.addEventListener('click', () => { state.activePlaylistId = pl.id; render(); });
    bar.appendChild(chip);
  });

  const manage = document.createElement('button');
  manage.className = 'list-pl-chip';
  manage.appendChild(createIcon('settings', 14));
  const mText = document.createElement('span');
  mText.textContent = '管理';
  manage.appendChild(mText);
  manage.addEventListener('click', openPlaylistDrawer);
  bar.appendChild(manage);

  return bar;
}

function buildListActions() {
  const acts = document.createElement('div');
  acts.className = 'list-actions';

  const importBtn = document.createElement('button');
  importBtn.className = 'list-act-btn primary';
  importBtn.appendChild(createIcon('upload', 16));
  const iText = document.createElement('span');
  iText.textContent = '导入歌曲';
  importBtn.appendChild(iText);
  importBtn.addEventListener('click', importSongs);

  const playAll = document.createElement('button');
  playAll.className = 'list-act-btn';
  playAll.appendChild(createIcon('play', 16));
  const pText = document.createElement('span');
  pText.textContent = '播放全部';
  playAll.appendChild(pText);
  playAll.addEventListener('click', playAllSongs);

  acts.append(importBtn, playAll);
  return acts;
}

function buildSongList() {
  const list = document.createElement('div');
  list.className = 'song-list';

  const songs = getDisplaySongs();

  if (!songs.length) {
    list.appendChild(buildSongEmpty());
    return list;
  }

  songs.forEach(s => list.appendChild(buildSongItem(s)));
  return list;
}

function buildSongEmpty() {
  const empty = document.createElement('div');
  empty.className = 'song-empty';

  const icon = document.createElement('div');
  icon.className = 'song-empty-icon';
  icon.appendChild(createIcon('music', 32));

  const title = document.createElement('div');
  title.className = 'song-empty-title';
  title.textContent = state.activePlaylistId === 'all' ? '还没有歌曲' : '歌单里还没有歌曲';

  const desc = document.createElement('div');
  desc.className = 'song-empty-desc';
  desc.textContent = state.activePlaylistId === 'all' ? '点击"导入歌曲"添加音乐' : '去全部歌曲里添加吧';

  empty.append(icon, title, desc);
  return empty;
}

function buildSongItem(song) {
  const item = document.createElement('div');
  item.className = `song-item${song.id === state.currentSongId ? ' active' : ''}`;
  item.addEventListener('click', () => playSong(song.id));

  const cover = document.createElement('div');
  cover.className = 'song-item-cover';
  if (song.cover) {
    const img = document.createElement('img');
    img.src = song.cover;
    cover.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'song-item-cover-ph';
    ph.appendChild(createIcon('music', 18));
    cover.appendChild(ph);
  }

  const info = document.createElement('div');
  info.className = 'song-item-info';

  const title = document.createElement('div');
  title.className = 'song-item-title';
  title.textContent = song.title || '未知歌曲';

  const artist = document.createElement('div');
  artist.className = 'song-item-artist';
  artist.textContent = song.artist || '未知艺术家';

  info.append(title, artist);

  const dur = document.createElement('div');
  dur.className = 'song-item-dur';
  dur.textContent = formatTime(song.duration || 0);

  const acts = document.createElement('div');
  acts.className = 'song-item-acts';

  const addBtn = document.createElement('button');
  addBtn.className = 'song-item-act-btn';
  addBtn.appendChild(createIcon('add', 16));
  addBtn.addEventListener('click', e => { e.stopPropagation(); openAddToPlaylistDrawer(song.id); });

  const delBtn = document.createElement('button');
  delBtn.className = 'song-item-act-btn';
  delBtn.appendChild(createIcon('close', 16));
  delBtn.addEventListener('click', e => { e.stopPropagation(); deleteSong(song.id); });

  acts.append(addBtn, delBtn);
  item.append(cover, info, dur, acts);
  return item;
}

/* ═══════════════════════════════════════
   设置抽屉
   ═══════════════════════════════════════ */

function openSettingsDrawer() {
  const bg = document.createElement('div');
  bg.className = 'music-drawer-bg';
  bg.style.zIndex = '50';
  bg.addEventListener('click', closeSettingsDrawer);

  const drawer = document.createElement('div');
  drawer.className = 'music-drawer';
  drawer.style.zIndex = '51';

  const header = document.createElement('div');
  header.className = 'drawer-header';

  const title = document.createElement('div');
  title.className = 'drawer-title';
  title.textContent = '播放器设置';

  const close = document.createElement('button');
  close.className = 'drawer-close';
  close.appendChild(createIcon('close', 16));
  close.addEventListener('click', closeSettingsDrawer);

  header.append(title, close);

  const content = document.createElement('div');
  content.append(
    buildWallpaperSection(),
    buildListWallpaperSection(),
    buildDualModeSection(),
    buildVolumeSection()
  );

  drawer.append(header, content);
  document.body.append(bg, drawer);

  requestAnimationFrame(() => {
    bg.classList.add('open');
    drawer.classList.add('open');
  });

  state.settingsDrawer = { bg, drawer };
}

function closeSettingsDrawer() {
  if (!state.settingsDrawer) return;
  const { bg, drawer } = state.settingsDrawer;
  bg.classList.remove('open');
  drawer.classList.remove('open');
  setTimeout(() => { bg.remove(); drawer.remove(); state.settingsDrawer = null; }, 350);
}

function buildWallpaperSection() {
  const sec = document.createElement('div');
  sec.className = 'setting-group';

  const title = document.createElement('div');
  title.className = 'setting-group-title';
  title.textContent = '播放页壁纸';

  const grid = document.createElement('div');
  grid.className = 'wp-grid';

  PRESET_FILM_WALLPAPERS.forEach(wp => {
    const item = document.createElement('div');
    item.className = `wp-item${state.filmWallpaper?.id === wp.id ? ' active' : ''}`;
    item.style.background = wp.gradient;
    item.addEventListener('click', () => {
      state.filmWallpaper = wp;
      state.customWallpaper = '';
      saveSettings();
      render();
    });
    grid.appendChild(item);
  });

  const custom = document.createElement('div');
  custom.className = `wp-item${state.customWallpaper ? ' active' : ''}`;
  custom.style.background = 'var(--bg-card)';
  if (!state.customWallpaper) {
    custom.style.display = 'flex';
    custom.style.alignItems = 'center';
    custom.style.justifyContent = 'center';
    custom.style.color = 'var(--accent)';
    custom.appendChild(createIcon('upload', 20));
  } else {
    custom.style.backgroundImage = `url(${state.customWallpaper})`;
    custom.style.backgroundSize = 'cover';
    custom.style.backgroundPosition = 'center';
  }
  custom.addEventListener('click', uploadWallpaper);
  grid.appendChild(custom);

  sec.append(title, grid);
  return sec;
}

function buildListWallpaperSection() {
  const sec = document.createElement('div');
  sec.className = 'setting-group';

  const title = document.createElement('div');
  title.className = 'setting-group-title';
  title.textContent = '列表页背景';

  const grid = document.createElement('div');
  grid.className = 'wp-grid';

  const custom = document.createElement('div');
  custom.className = `wp-item${state.listBg ? ' active' : ''}`;
  custom.style.background = 'var(--bg-card)';
  if (state.listBg) {
    custom.style.backgroundImage = `url(${state.listBg})`;
    custom.style.backgroundSize = 'cover';
    custom.style.backgroundPosition = 'center';
  } else {
    custom.style.display = 'flex';
    custom.style.alignItems = 'center';
    custom.style.justifyContent = 'center';
    custom.style.color = 'var(--accent)';
    custom.appendChild(createIcon('upload', 20));
  }
  custom.addEventListener('click', uploadListBg);
  grid.appendChild(custom);

  if (state.listBg) {
    const clear = document.createElement('div');
    clear.className = 'wp-item';
    clear.style.background = 'var(--bg-card)';
    clear.style.display = 'flex';
    clear.style.alignItems = 'center';
    clear.style.justifyContent = 'center';
    clear.style.color = 'var(--text-hint)';
    clear.appendChild(createIcon('close', 20));
    clear.addEventListener('click', async () => {
      state.listBg = '';
      await deleteDB(BLOB_STORE, 'app_bg_music_list');
      saveSettings();
      render();
    });
    grid.appendChild(clear);
  }

  sec.append(title, grid);
  return sec;
}

function buildDualModeSection() {
  const sec = document.createElement('div');
  sec.className = 'setting-group';

  const title = document.createElement('div');
  title.className = 'setting-group-title';
  title.textContent = '双人模式';

  const item = document.createElement('div');
  item.className = 'setting-item';

  const label = document.createElement('div');
  label.className = 'setting-label';
  label.textContent = '开启双人模式';

  const toggle = document.createElement('div');
  toggle.className = `music-toggle${state.dualMode ? ' active' : ''}`;
  toggle.addEventListener('click', () => {
    state.dualMode = !state.dualMode;
    saveSettings();
    render();
    closeSettingsDrawer();
    setTimeout(openSettingsDrawer, 350);
  });

  item.append(label, toggle);
  sec.appendChild(item);

  if (state.dualMode && state.characters.length > 0) {
    const cTitle = document.createElement('div');
    cTitle.className = 'setting-group-title';
    cTitle.style.marginTop = '16px';
    cTitle.textContent = '选择一起听的AI';

    const grid = document.createElement('div');
    grid.className = 'char-grid';

    state.characters.forEach(ch => {
      const ci = document.createElement('div');
      ci.className = `char-item${state.selectedCharacterId === ch.id ? ' active' : ''}`;
      ci.addEventListener('click', () => {
        state.selectedCharacterId = ch.id;
        saveSettings();
        render();
        closeSettingsDrawer();
        setTimeout(openSettingsDrawer, 350);
      });

      const av = document.createElement('div');
      av.className = 'char-avatar';
      if (ch.avatar) {
        const img = document.createElement('img');
        img.src = ch.avatar;
        av.appendChild(img);
      } else {
        const ph = document.createElement('div');
        ph.className = 'char-avatar-ph';
        ph.appendChild(createIcon('heart', 20));
        av.appendChild(ph);
      }

      const name = document.createElement('div');
      name.className = 'char-name';
      name.textContent = ch.name || 'AI';

      ci.append(av, name);
      grid.appendChild(ci);
    });

    sec.append(cTitle, grid);
  }

  return sec;
}

function buildVolumeSection() {
  const sec = document.createElement('div');
  sec.className = 'setting-group';

  const title = document.createElement('div');
  title.className = 'setting-group-title';
  title.textContent = '音量';

  const item = document.createElement('div');
  item.className = 'setting-item';
  item.style.flexWrap = 'wrap';
  item.style.gap = '8px';

  const label = document.createElement('div');
  label.className = 'setting-label';
  label.textContent = '音量';

  const value = document.createElement('div');
  value.className = 'setting-value';
  value.textContent = `${Math.round(state.volume * 100)}%`;

  const slider = document.createElement('input');
  slider.className = 'volume-slider';
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = String(Math.round(state.volume * 100));
  slider.style.width = '100%';
  slider.style.order = '3';
  slider.addEventListener('input', (e) => {
    state.volume = Number(e.target.value) / 100;
    if (state.audioElement) state.audioElement.volume = state.volume;
    if (state.gainNode) state.gainNode.gain.value = state.volume;
    value.textContent = `${Math.round(state.volume * 100)}%`;
    saveSettings();
  });

  item.append(label, value, slider);
  sec.appendChild(item);
  return sec;
}

/* ═══════════════════════════════════════
   歌单管理抽屉
   ═══════════════════════════════════════ */

function openPlaylistDrawer() {
  const bg = document.createElement('div');
  bg.className = 'music-drawer-bg';
  bg.style.zIndex = '52';
  bg.addEventListener('click', closePlaylistDrawer);

  const drawer = document.createElement('div');
  drawer.className = 'music-drawer';
  drawer.style.zIndex = '53';

  const header = document.createElement('div');
  header.className = 'drawer-header';

  const title = document.createElement('div');
  title.className = 'drawer-title';
  title.textContent = '管理歌单';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'drawer-close';
  closeBtn.appendChild(createIcon('close', 16));
  closeBtn.addEventListener('click', closePlaylistDrawer);

  header.append(title, closeBtn);

  const list = document.createElement('div');

  state.playlists.forEach(pl => {
    const row = document.createElement('div');
    row.className = 'pl-row';

    const name = document.createElement('div');
    name.className = 'pl-row-name';
    name.textContent = pl.name || '未命名歌单';

    const count = document.createElement('div');
    count.className = 'pl-row-count';
    count.textContent = `${(pl.songIds || []).length}首`;

    const btns = document.createElement('div');
    btns.className = 'pl-row-btns';

    const editBtn = document.createElement('button');
    editBtn.className = 'pl-row-btn';
    editBtn.appendChild(createIcon('edit', 16));
    editBtn.addEventListener('click', () => editPlaylist(pl.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'pl-row-btn danger';
    delBtn.appendChild(createIcon('close', 16));
    delBtn.addEventListener('click', () => deletePlaylist(pl.id));

    btns.append(editBtn, delBtn);
    row.append(name, count, btns);
    list.appendChild(row);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'pl-add-btn';
  addBtn.appendChild(createIcon('add', 16));
  const addText = document.createElement('span');
  addText.textContent = '新建歌单';
  addBtn.appendChild(addText);
  addBtn.addEventListener('click', createPlaylist);

  drawer.append(header, list, addBtn);
  document.body.append(bg, drawer);

  requestAnimationFrame(() => {
    bg.classList.add('open');
    drawer.classList.add('open');
  });

  state.playlistDrawer = { bg, drawer };
}

function closePlaylistDrawer() {
  if (!state.playlistDrawer) return;
  const { bg, drawer } = state.playlistDrawer;
  bg.classList.remove('open');
  drawer.classList.remove('open');
  setTimeout(() => { bg.remove(); drawer.remove(); state.playlistDrawer = null; }, 350);
}

function createPlaylist() {
  const name = prompt('歌单名称：');
  if (!name?.trim()) return;

  const pl = {
    id: generateId('playlist'),
    name: name.trim(),
    songIds: [],
    createdAt: getNow(),
    updatedAt: getNow()
  };

  state.playlists.push(pl);
  savePlaylists();
  closePlaylistDrawer();
  showToast('歌单已创建');
  render();
}

function editPlaylist(pid) {
  const pl = state.playlists.find(p => p.id === pid);
  if (!pl) return;

  const name = prompt('修改歌单名称：', pl.name);
  if (!name?.trim()) return;

  pl.name = name.trim();
  pl.updatedAt = getNow();
  savePlaylists();
  closePlaylistDrawer();
  showToast('歌单已更新');
  render();
}

async function deletePlaylist(pid) {
  if (!confirm('确定要删除这个歌单吗？')) return;

  state.playlists = state.playlists.filter(p => p.id !== pid);
  if (state.activePlaylistId === pid) state.activePlaylistId = 'all';

  await deleteDB(PLAYLIST_STORE, pid);
  closePlaylistDrawer();
  showToast('歌单已删除');
  render();
}

/* ── 添加到歌单抽屉 ── */

function openAddToPlaylistDrawer(songId) {
  if (!state.playlists.length) {
    showToast('还没有歌单，请先创建');
    return;
  }

  const bg = document.createElement('div');
  bg.className = 'music-drawer-bg';
  bg.style.zIndex = '54';
  bg.addEventListener('click', closeAddToPlaylistDrawer);

  const drawer = document.createElement('div');
  drawer.className = 'music-drawer';
  drawer.style.zIndex = '55';

  const header = document.createElement('div');
  header.className = 'drawer-header';

  const title = document.createElement('div');
  title.className = 'drawer-title';
  title.textContent = '添加到歌单';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'drawer-close';
  closeBtn.appendChild(createIcon('close', 16));
  closeBtn.addEventListener('click', closeAddToPlaylistDrawer);

  header.append(title, closeBtn);

  const list = document.createElement('div');

  state.playlists.forEach(pl => {
    const has = (pl.songIds || []).includes(songId);

    const row = document.createElement('div');
    row.className = 'pl-row';
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => {
      toggleSongInPlaylist(songId, pl.id);
      closeAddToPlaylistDrawer();
    });

    const name = document.createElement('div');
    name.className = 'pl-row-name';
    name.textContent = pl.name || '未命名歌单';

    const count = document.createElement('div');
    count.className = 'pl-row-count';
    count.textContent = has ? '已添加' : `${(pl.songIds || []).length}首`;

    row.append(name, count);
    list.appendChild(row);
  });

  drawer.append(header, list);
  document.body.append(bg, drawer);

  requestAnimationFrame(() => {
    bg.classList.add('open');
    drawer.classList.add('open');
  });

  state.addToPlaylistDrawer = { bg, drawer };
}

function closeAddToPlaylistDrawer() {
  if (!state.addToPlaylistDrawer) return;
  const { bg, drawer } = state.addToPlaylistDrawer;
  bg.classList.remove('open');
  drawer.classList.remove('open');
  setTimeout(() => { bg.remove(); drawer.remove(); state.addToPlaylistDrawer = null; }, 350);
}

function toggleSongInPlaylist(songId, pid) {
  const pl = state.playlists.find(p => p.id === pid);
  if (!pl) return;

  if (!Array.isArray(pl.songIds)) pl.songIds = [];

  const idx = pl.songIds.indexOf(songId);
  if (idx >= 0) {
    pl.songIds.splice(idx, 1);
    showToast('已从歌单移除');
  } else {
    pl.songIds.push(songId);
    showToast('已添加到歌单');
  }

  pl.updatedAt = getNow();
  savePlaylists();
  render();
}

/* ═══════════════════════════════════════
   歌词面板
   ═══════════════════════════════════════ */

function toggleLyricsPanel() {
  state.isLyricsOpen = !state.isLyricsOpen;

  let panel = document.querySelector('.music-lyrics-panel');

  if (state.isLyricsOpen) {
    if (!panel) {
      panel = buildLyricsPanel();
      document.body.appendChild(panel);
    }
    requestAnimationFrame(() => panel.classList.add('open'));
  } else if (panel) {
    panel.classList.remove('open');
    setTimeout(() => panel.remove(), 350);
  }
}

function buildLyricsPanel() {
  const panel = document.createElement('div');
  panel.className = 'music-lyrics-panel';

  const header = document.createElement('div');
  header.className = 'music-lyrics-header';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'music-lyrics-close';
  closeBtn.appendChild(createIcon('back', 20));
  closeBtn.addEventListener('click', toggleLyricsPanel);

  const songName = document.createElement('div');
  songName.className = 'music-lyrics-song';
  const curSong = getCurrentSong();
  songName.textContent = curSong?.title || '歌词';

  const placeholder = document.createElement('div');
  placeholder.className = 'music-lyrics-placeholder';

  header.append(closeBtn, songName, placeholder);

  if (state.lyrics.length > 0) {
    const scroll = document.createElement('div');
    scroll.className = 'music-lyrics-scroll';
    scroll.id = 'music-lyrics-scroll';

    const spacer = document.createElement('div');
    spacer.style.height = '30vh';
    scroll.appendChild(spacer);

    state.lyrics.forEach((line, i) => {
      const lineEl = document.createElement('div');
      lineEl.className = `lyric-line${i === state.currentLyricIndex ? ' active' : ''}`;
      lineEl.textContent = line.text;
      lineEl.dataset.index = i;
      lineEl.addEventListener('click', () => {
        if (state.audioElement && line.time != null) {
          state.audioElement.currentTime = line.time;
        }
      });
      scroll.appendChild(lineEl);
    });

    const spacerBottom = document.createElement('div');
    spacerBottom.style.height = '40vh';
    scroll.appendChild(spacerBottom);

    panel.append(header, scroll);
  } else {
    const empty = document.createElement('div');
    empty.className = 'lyrics-empty';

    const icon = document.createElement('div');
    icon.className = 'lyrics-empty-icon';
    icon.appendChild(createIcon('edit', 36));

    const title = document.createElement('div');
    title.className = 'lyrics-empty-title';
    title.textContent = '暂无歌词';

    const desc = document.createElement('div');
    desc.className = 'lyrics-empty-desc';
    desc.textContent = '可以手动上传或输入歌词';

    const btns = document.createElement('div');
    btns.className = 'lyrics-empty-btns';

    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'lyrics-empty-btn primary';
    uploadBtn.appendChild(createIcon('upload', 16));
    const uText = document.createElement('span');
    uText.textContent = '上传歌词';
    uploadBtn.appendChild(uText);
    uploadBtn.addEventListener('click', uploadLyrics);

    const inputBtn = document.createElement('button');
    inputBtn.className = 'lyrics-empty-btn secondary';
    inputBtn.appendChild(createIcon('edit', 16));
    const iText = document.createElement('span');
    iText.textContent = '手动输入';
    inputBtn.appendChild(iText);
    inputBtn.addEventListener('click', inputLyrics);

    btns.append(uploadBtn, inputBtn);
    empty.append(icon, title, desc, btns);
    panel.append(header, empty);
  }

  return panel;
}

/* ═══════════════════════════════════════
   音频引擎
   ═══════════════════════════════════════ */

function initAudioElement() {
  if (state.audioElement) return;

  state.audioElement = new Audio();
  state.audioElement.volume = state.volume;

  state.audioElement.addEventListener('timeupdate', () => {
    state.currentTime = state.audioElement.currentTime;
    updateProgressUI();
    updateLyricsIndex();
  });

  state.audioElement.addEventListener('loadedmetadata', () => {
    state.duration = state.audioElement.duration;
    updateProgressUI();
  });

  state.audioElement.addEventListener('ended', () => {
    state.isPlaying = false;
    updateVinylState();
    ensureMiniPlayer();
    handleSongEnded();
  });

  state.audioElement.addEventListener('play', () => {
    state.isPlaying = true;
    updateVinylState();
    ensureMiniPlayer();
  });

  state.audioElement.addEventListener('pause', () => {
    state.isPlaying = false;
    updateVinylState();
    ensureMiniPlayer();
  });

  initAudioContext();
}

function initAudioContext() {
  if (state.audioContext) return;
  try {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 256;
    state.gainNode = state.audioContext.createGain();
    state.gainNode.gain.value = state.volume;
    state.gainNode.connect(state.audioContext.destination);
    state.analyser.connect(state.gainNode);
    state.audioSource = state.audioContext.createMediaElementSource(state.audioElement);
    state.audioSource.connect(state.analyser);
    state.audioSourceConnected = true;
  } catch (e) {
    console.warn('Web Audio API init failed:', e);
  }
}

function handleSongEnded() {
  if (state.playMode === 'loop' && state.audioElement) {
    state.audioElement.currentTime = 0;
    state.audioElement.play();
    return;
  }
  playNext();
}

async function playSong(songId) {
  const song = state.songs.find(s => s.id === songId);
  if (!song) return;

  state.currentSongId = songId;
  state.currentTime = 0;
  state.lyrics = song.lyrics || [];
  state.currentLyricIndex = -1;

  const audioData = await getDB(BLOB_STORE, `audio_${songId}`);
  if (!audioData?.value) {
    showToast('音频数据不存在');
    return;
  }

  if (state.audioContext?.state === 'suspended') {
    await state.audioContext.resume();
  }

  state.audioElement.src = audioData.value;

  try {
    await state.audioElement.play();
    state.isPlaying = true;
  } catch {
    state.isPlaying = false;
  }

  saveCurrentSong();

  // 通知其他模块当前播放的歌曲（监听 music:play 的链路自洽）
  // 外部请求触发的播放不再回弹，避免事件循环
  if (!suppressMusicEmit) {
    try {
      emit('music:play', { songId: song.id, title: song.title || '', artist: song.artist || '' });
    } catch (_) {}
  }

  render();
  ensureMiniPlayer();
  updateVinylState();

  if (!state.lyrics.length && song.title) {
    fetchLyrics(song.title, song.artist || '').then(lyrics => {
      if (lyrics.length) {
        state.lyrics = lyrics;
        song.lyrics = lyrics;
        saveSong(song);
      }
    });
  }
}

function togglePlay() {
  if (!state.audioElement || !state.currentSongId) return;

  if (state.isPlaying) {
    state.audioElement.pause();
  } else {
    if (state.audioContext?.state === 'suspended') state.audioContext.resume();
    state.audioElement.play();
  }
}

function playPrevious() {
  const queue = getPlayQueue();
  if (!queue.length) return;
  const idx = queue.findIndex(s => s.id === state.currentSongId);
  const prev = idx > 0 ? idx - 1 : queue.length - 1;
  playSong(queue[prev].id);
}

function playNext() {
  const queue = getPlayQueue();
  if (!queue.length) return;

  if (state.playMode === 'shuffle') {
    playSong(queue[Math.floor(Math.random() * queue.length)].id);
    return;
  }

  const idx = queue.findIndex(s => s.id === state.currentSongId);
  const next = idx < queue.length - 1 ? idx + 1 : 0;
  playSong(queue[next].id);
}

function playAllSongs() {
  const queue = getPlayQueue();
  if (queue.length) playSong(queue[0].id);
}

function getPlayQueue() { return getDisplaySongs(); }

function getDisplaySongs() {
  if (state.activePlaylistId === 'all') return state.songs;
  const pl = state.playlists.find(p => p.id === state.activePlaylistId);
  return pl ? state.songs.filter(s => (pl.songIds || []).includes(s.id)) : state.songs;
}

function getActivePlaylist() {
  if (state.activePlaylistId === 'all') return { name: '全部歌曲' };
  return state.playlists.find(p => p.id === state.activePlaylistId) || { name: '全部歌曲' };
}

/* ── 唱片状态同步 ── */

function updateVinylState() {
  const disc = document.getElementById('vinyl-disc');
  const arm = document.getElementById('vinyl-tonearm');
  const playBtnEl = document.getElementById('play-btn');

  if (disc) {
    disc.style.transform = `rotate(${state.coverRotation}deg)`;
  }
  if (arm) {
    arm.classList.toggle('playing', state.isPlaying);
  }
  if (playBtnEl) {
    playBtnEl.innerHTML = '';
    playBtnEl.appendChild(createIcon(state.isPlaying ? 'pause' : 'play', 28));
  }
}

/* ═══════════════════════════════════════
   导入歌曲
   ═══════════════════════════════════════ */

async function importSongs() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/mp3,audio/flac,audio/wav,audio/ogg,audio/m4a';
  input.multiple = true;

  input.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    showToast(`正在导入 ${files.length} 首歌曲...`);
    let ok = 0;

    for (const file of files) {
      try {
        const song = await processAudioFile(file);
        if (song) {
          state.songs.push(song);
          await saveSong(song);
          ok++;
        }
      } catch (err) {
        console.warn('Import failed:', file.name, err);
      }
    }

    showToast(`成功导入 ${ok} 首歌曲`);
    render();
  });

  input.click();
}

async function processAudioFile(file) {
  const id = generateId('song');
  const audioData = await readFileAsDataURL(file);

  await setDB(BLOB_STORE, { key: `audio_${id}`, value: audioData, type: file.type, name: file.name });

  const tags = await readID3Tags(file);

  const song = {
    id,
    title: tags.title || file.name.replace(/\.[^.]+$/, ''),
    artist: tags.artist || '',
    album: tags.album || '',
    duration: 0,
    cover: tags.picture || '',
    lyrics: [],
    addedAt: getNow()
  };

  try {
    const audio = new Audio();
    audio.src = audioData;
    await new Promise(resolve => {
      audio.addEventListener('loadedmetadata', () => { song.duration = audio.duration; resolve(); });
      audio.addEventListener('error', resolve);
    });
  } catch {}

  try { song.lyrics = await fetchLyrics(song.title, song.artist); } catch {}

  return song;
}

async function deleteSong(sid) {
  if (!confirm('确定要删除这首歌吗？')) return;

  state.songs = state.songs.filter(s => s.id !== sid);
  state.playlists.forEach(pl => {
    if (Array.isArray(pl.songIds)) pl.songIds = pl.songIds.filter(id => id !== sid);
  });

  await deleteDB(SONG_STORE, sid);
  await deleteDB(BLOB_STORE, `audio_${sid}`);

  if (state.currentSongId === sid) {
    state.currentSongId = '';
    state.isPlaying = false;
    if (state.audioElement) { state.audioElement.pause(); state.audioElement.src = ''; }
  }

  savePlaylists();
  showToast('已删除');
  render();
  ensureMiniPlayer();
}

/* ═══════════════════════════════════════
   歌词功能
   ═══════════════════════════════════════ */

async function fetchLyrics(title, artist) {
  if (!title) return [];
  try {
    const q = encodeURIComponent(`${title} ${artist || ''}`.trim());
    const res = await fetch(`https://lrclib.net/api/search?q=${q}`, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return [];

    const synced = data.find(i => i.syncedLyrics);
    const plain = data.find(i => i.plainLyrics);

    if (synced?.syncedLyrics) return parseLRC(synced.syncedLyrics);
    if (plain?.plainLyrics) return plain.plainLyrics.split('\n').filter(Boolean).map((t, i) => ({ time: i * 5, text: t.trim() }));
    return [];
  } catch {
    return [];
  }
}

function parseLRC(lrc) {
  const result = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

  lrc.split('\n').forEach(line => {
    const m = line.match(regex);
    if (!m) return;
    const time = parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3].padEnd(3, '0')) / 1000;
    const text = line.replace(regex, '').trim();
    if (text) result.push({ time, text });
  });

  return result.sort((a, b) => a.time - b.time);
}

function uploadLyrics() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.lrc,.txt';

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    state.lyrics = parseLRC(text);
    const song = getCurrentSong();
    if (song) { song.lyrics = state.lyrics; await saveSong(song); }
    showToast('歌词已导入');
    toggleLyricsPanel();
  });

  input.click();
}

function inputLyrics() {
  const text = prompt('请输入歌词（LRC格式或纯文本）：');
  if (!text) return;
  state.lyrics = text.includes('[') ? parseLRC(text) : text.split('\n').filter(Boolean).map((t, i) => ({ time: i * 5, text: t.trim() }));
  const song = getCurrentSong();
  if (song) { song.lyrics = state.lyrics; saveSong(song); }
  showToast('歌词已保存');
  toggleLyricsPanel();
}

/* ── 壁纸上传 ── */

async function uploadWallpaper() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await readFileAsDataURL(file);
    state.customWallpaper = dataUrl;
    await setDB(BLOB_STORE, { key: 'app_bg_music_player', value: dataUrl, type: file.type });
    saveSettings();
    render();
    showToast('壁纸已更换');
  });

  input.click();
}

async function uploadListBg() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await readFileAsDataURL(file);
    state.listBg = dataUrl;
    await setDB(BLOB_STORE, { key: 'app_bg_music_list', value: dataUrl, type: file.type });
    saveSettings();
    render();
    showToast('背景已更换');
  });

  input.click();
}

/* ═══════════════════════════════════════
   动画循环
   ═══════════════════════════════════════ */

function startAnimationLoop() {
  function animate() {
    state.animationFrame = requestAnimationFrame(animate);
    updateCoverRotation();
    drawSpectrum();
    updateMiniPlayerProgress();
  }
  animate();
}

function stopAnimationLoop() {
  if (state.animationFrame) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }
}

function updateCoverRotation() {
  if (!state.isPlaying) return;

  state.coverRotation = (state.coverRotation + 0.15) % 360;
  const disc = document.getElementById('vinyl-disc');
  if (disc) {
    disc.style.transform = `rotate(${state.coverRotation}deg)`;
  }
}

function drawSpectrum() {
  const canvas = document.getElementById('music-spectrum-canvas');
  if (!canvas || !state.analyser) return;

  const ctx = canvas.getContext('2d');
  const len = state.analyser.frequencyBinCount;
  const data = new Uint8Array(len);
  state.analyser.getByteFrequencyData(data);

  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const barW = (canvas.width / len) * 2.5;
  let x = 0;

  for (let i = 0; i < len; i++) {
    const h = (data[i] / 255) * canvas.height;
    ctx.fillStyle = '#E8C9A0';
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x, canvas.height - h, barW, h);
    x += barW + 1;
  }
}

/* ── 进度更新 ── */

function updateProgressUI() {
  const fill = document.querySelector('.progress-fill');
  const thumb = document.querySelector('.progress-thumb');
  const curEl = document.querySelector('.progress-times span:first-child');
  const durEl = document.querySelector('.progress-times span:last-child');

  const pct = state.duration ? (state.currentTime / state.duration) * 100 : 0;

  if (fill) fill.style.width = pct + '%';
  if (thumb) thumb.style.left = pct + '%';
  if (curEl) curEl.textContent = formatTime(state.currentTime);
  if (durEl) durEl.textContent = formatTime(state.duration);
}

function updateLyricsIndex() {
  if (!state.lyrics.length) return;

  let newIdx = -1;
  for (let i = state.lyrics.length - 1; i >= 0; i--) {
    if (state.currentTime >= state.lyrics[i].time) { newIdx = i; break; }
  }

  if (newIdx !== state.currentLyricIndex) {
    state.currentLyricIndex = newIdx;

    document.querySelectorAll('.lyric-line').forEach((el, i) => {
      el.classList.toggle('active', i === newIdx);
    });

    if (newIdx >= 0) {
      const active = document.querySelector('.lyric-line.active');
      if (active) active.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

/* ═══════════════════════════════════════
   迷你播放条 — 无缓存版
   ═══════════════════════════════════════ */

function ensureMiniPlayer() {
  const mini = document.querySelector('.music-mini');

  if (!state.currentSongId) {
    if (mini) {
      mini.classList.remove('visible');
      setTimeout(() => mini.remove(), 300);
    }
    return;
  }

  if (!mini) {
    const el = buildMiniPlayer();
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
  }

  updateMiniPlayerContent();
}

function buildMiniPlayer() {
  const mini = document.createElement('div');
  mini.className = 'music-mini';
  mini.addEventListener('click', () => {
    if (typeof window.openApp === 'function') window.openApp('music');
  });

  const cover = document.createElement('div');
  cover.className = 'music-mini-cover';

  const info = document.createElement('div');
  info.className = 'music-mini-info';

  const title = document.createElement('div');
  title.className = 'music-mini-title';
  title.textContent = '未播放';

  const artist = document.createElement('div');
  artist.className = 'music-mini-artist';

  info.append(title, artist);

  const ctrls = document.createElement('div');
  ctrls.className = 'music-mini-ctrls';

  const playBtn = document.createElement('button');
  playBtn.className = 'music-mini-btn music-mini-play-icon';
  playBtn.appendChild(createIcon(state.isPlaying ? 'pause' : 'play', 20));
  playBtn.addEventListener('click', e => { e.stopPropagation(); togglePlay(); });

  const nextBtn = document.createElement('button');
  nextBtn.className = 'music-mini-btn';
  nextBtn.appendChild(createIcon('arrow-right', 18));
  nextBtn.addEventListener('click', e => { e.stopPropagation(); playNext(); });

  ctrls.append(playBtn, nextBtn);

  const progress = document.createElement('div');
  progress.className = 'music-mini-progress';
  const progressFill = document.createElement('div');
  progressFill.className = 'music-mini-progress-fill';
  progress.appendChild(progressFill);

  mini.append(cover, info, ctrls, progress);
  return mini;
}

function updateMiniPlayerContent() {
  const song = getCurrentSong();

  const titleEl = document.querySelector('.music-mini-title');
  const artistEl = document.querySelector('.music-mini-artist');
  const coverEl = document.querySelector('.music-mini-cover');
  const playIcon = document.querySelector('.music-mini-play-icon');

  if (titleEl) titleEl.textContent = song?.title || '未播放';
  if (artistEl) artistEl.textContent = song?.artist || '';

  if (coverEl) {
    coverEl.innerHTML = '';
    if (song?.cover) {
      const img = document.createElement('img');
      img.src = song.cover;
      coverEl.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'music-mini-cover-ph';
      ph.appendChild(createIcon('music', 20));
      coverEl.appendChild(ph);
    }
  }

  if (playIcon) {
    playIcon.innerHTML = '';
    playIcon.appendChild(createIcon(state.isPlaying ? 'pause' : 'play', 20));
  }
}

function updateMiniPlayerProgress() {
  const fill = document.querySelector('.music-mini-progress-fill');
  if (!fill) return;
  const pct = state.duration ? (state.currentTime / state.duration) * 100 : 0;
  fill.style.width = pct + '%';
}

/* ═══════════════════════════════════════
   数据存取
   ═══════════════════════════════════════ */

async function loadSettings() {
  const saved = getData(MUSIC_SETTINGS_KEY) || {};
  state.settings = { ...state.settings, ...saved };
  state.dualMode = state.settings.dualMode;
  state.selectedCharacterId = state.settings.selectedCharacterId;
  state.volume = state.settings.volume ?? 1;
  state.playMode = state.settings.playMode || 'list';

  if (state.settings.filmWallpaperId) {
    state.filmWallpaper = PRESET_FILM_WALLPAPERS.find(w => w.id === state.settings.filmWallpaperId) || PRESET_FILM_WALLPAPERS[0];
  }

  if (state.settings.useCustomWallpaper) {
    try {
      const wp = await getDB(BLOB_STORE, 'app_bg_music_player');
      state.customWallpaper = wp?.value || '';
    } catch { state.customWallpaper = ''; }
  } else {
    state.customWallpaper = '';
  }

  try {
    const bg = await getDB(BLOB_STORE, 'app_bg_music_list');
    state.listBg = bg?.value || '';
  } catch { state.listBg = ''; }
}

function saveSettings() {
  state.settings = {
    ...state.settings,
    dualMode: state.dualMode,
    selectedCharacterId: state.selectedCharacterId,
    filmWallpaperId: state.filmWallpaper?.id || 'film_1',
    useCustomWallpaper: Boolean(state.customWallpaper),
    volume: state.volume,
    playMode: state.playMode
  };
  setData(MUSIC_SETTINGS_KEY, state.settings);
}

async function loadCharacters() {
  try {
    const chars = await getAllDB(CHARACTER_STORE);
    state.characters = Array.isArray(chars) ? chars : [];
  } catch { state.characters = []; }
}

async function loadSongs() {
  const songs = await getAllDB(SONG_STORE);
  state.songs = Array.isArray(songs) ? songs : [];
}

async function loadPlaylists() {
  const pls = await getAllDB(PLAYLIST_STORE);
  state.playlists = Array.isArray(pls) ? pls : [];
}

async function savePlaylists() {
  for (const pl of state.playlists) await setDB(PLAYLIST_STORE, pl);
}

async function saveSong(song) {
  await setDB(SONG_STORE, song);
}

async function loadCurrentSong() {
  const cur = getData(MUSIC_CURRENT_KEY);
  if (cur?.songId) {
    state.currentSongId = cur.songId;
    const song = state.songs.find(s => s.id === cur.songId);
    if (song) state.lyrics = song.lyrics || [];
  }
}

function saveCurrentSong() {
  setData(MUSIC_CURRENT_KEY, { songId: state.currentSongId, updatedAt: getNow() });
}

/* ═══════════════════════════════════════
   工具函数
   ═══════════════════════════════════════ */

function getCurrentSong() {
  return state.songs.find(s => s.id === state.currentSongId) || null;
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getUserAvatar() {
  return (getData('app_settings') || {}).user?.avatar || '';
}

function getListAvatar() {
  return getData('music_list_avatar') || '';
}

async function readID3Tags(file) {
  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    const tags = { title: '', artist: '', album: '', picture: '' };

    if (view.getUint8(0) === 0x49 && view.getUint8(1) === 0x44 && view.getUint8(2) === 0x33) {
      const version = view.getUint8(3);
      const size = decodeSynchsafe(view, 6, 4);
      let offset = 10;
      const end = Math.min(10 + size, buffer.byteLength);

      while (offset < end - 10) {
        const fid = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
        const fSize = version >= 4 ? decodeSynchsafe(view, offset + 4, 4) : view.getUint32(offset + 4);
        if (fSize <= 0 || offset + 10 + fSize > end) break;

        if (fid === 'TIT2') tags.title = readTextFrame(view, offset + 10, fSize);
        else if (fid === 'TPE1') tags.artist = readTextFrame(view, offset + 10, fSize);
        else if (fid === 'TALB') tags.album = readTextFrame(view, offset + 10, fSize);
        else if (fid === 'APIC') tags.picture = readPictureFrame(buffer, offset + 10, fSize);

        offset += 10 + fSize;
      }
    }
    return tags;
  } catch {
    return { title: '', artist: '', album: '', picture: '' };
  }
}

function decodeSynchsafe(view, offset, length) {
  let v = 0;
  for (let i = 0; i < length; i++) v = (v << 7) | (view.getUint8(offset + i) & 0x7F);
  return v;
}

function readTextFrame(view, offset, size) {
  if (size < 2) return '';
  const enc = view.getUint8(offset);
  const bytes = new Uint8Array(view.buffer, offset + 1, size - 1);
  return new TextDecoder(enc === 0 ? 'latin1' : 'utf-8').decode(bytes).replace(/\0/g, '');
}

function readPictureFrame(buffer, offset, size) {
  try {
    const view = new DataView(buffer);
    let pos = offset + 1;
    let mime = '';
    while (pos < offset + size && view.getUint8(pos) !== 0) { mime += String.fromCharCode(view.getUint8(pos)); pos++; }
    pos++;
    pos++;
    while (pos < offset + size && view.getUint8(pos) !== 0) pos++;
    pos++;
    const data = new Uint8Array(buffer, pos, offset + size - pos);
    const binary = Array.from(data).map(b => String.fromCharCode(b)).join('');
    return `data:${mime || 'image/jpeg'};base64,${btoa(binary)}`;
  } catch { return ''; }
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
