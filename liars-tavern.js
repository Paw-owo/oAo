// apps/games/liars-tavern.js
// imports:
// import { getData, setData, getAllDB, getDB, setDB, deleteDB, generateId, getNow, compressImage } from '../../core/storage.js';
// import { createIcon, showToast, showBottomSheet, hideBottomSheet, showConfirm } from '../../core/ui.js';
// import { silentRequest } from '../../core/api.js';
// import { recordExternalInteraction } from '../../core/app-bus.js';

import {
  getData,
  setData,
  getAllDB,
  getDB,
  setDB,
  deleteDB,
  generateId,
  getNow,
  compressImage
} from '../../core/storage.js';
import {
  createIcon,
  showToast,
  showBottomSheet,
  hideBottomSheet,
  showConfirm
} from '../../core/ui.js';
import { silentRequest } from '../../core/api.js';
import { recordExternalInteraction } from '../../core/app-bus.js';

const SETTINGS_KEY = 'app_liars_tavern_settings';
const WALLPAPER_KEY = 'app_bg_liars_tavern';

const DEFAULT_SETTINGS = {
  sfxEnabled: true,
  ambienceEnabled: false,
  wallpaperOpacity: 0.36
};

const CARD_TYPES = ['Q', 'K', 'A'];
const DECK = [
  'Q', 'Q', 'Q', 'Q', 'Q', 'Q',
  'K', 'K', 'K', 'K', 'K', 'K',
  'A', 'A', 'A', 'A', 'A', 'A',
  'Joker', 'Joker'
];

const RANDOM_NAMES = [
  'Mara', 'Rex', 'Vex', 'Nora', 'Silas', 'Ivy', 'Crow', 'Lune',
  'Ash', 'Velvet', 'Noir', 'Eden', 'Moth', 'Riven'
];

const RANDOM_TRAITS = [
  '冷静、擅长算概率、话很少',
  '嘴硬、爱虚张声势、胆子其实很小',
  '混乱、凭直觉行动、经常做反常选择',
  '温柔但会突然下狠手',
  '喜欢观察别人手指和停顿',
  '装作漫不经心，其实会记每一张牌',
  '胆大、爱诈唬、越危险越兴奋',
  '谨慎、保守、只在必要时说谎'
];

let hostEl = null;
let navBack = null;
let sfx = null;
let timers = [];
let currentSheetInput = null;

let state = {
  scene: 'lobby',
  settings: { ...DEFAULT_SETTINGS },
  wallpaper: null,
  characters: [],
  selectedCharacterIds: [],
  players: [],
  phase: 'lobby',
  round: 0,
  tableCard: 'Q',
  turnOrder: [],
  currentTurnIndex: 0,
  tablePile: [],
  lastPlay: null,
  log: [],
  selectedCards: [],
  busy: false,
  winner: null,
  flash: false
};

// ═══════════════════════════════════════
// 【音效系统】
// ═══════════════════════════════════════

class TavernSFX {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.ambienceNode = null;
    this.enabled = true;
    this._glassTimer = null;
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.62;
    this.masterGain.connect(this.ctx.destination);
  }

  play(name) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this._sounds[name]) return;
    this._sounds[name].call(this);
  }

  toggle(value) {
    this.enabled = value !== undefined ? Boolean(value) : !this.enabled;
    if (!this.enabled) this.stopAmbience();
  }

  _noise(duration) {
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  _osc(freq, type = 'sine') {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    return osc;
  }

  _reverb(seconds = 1.5, decay = 2) {
    const convolver = this.ctx.createConvolver();
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c += 1) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < len; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    convolver.buffer = buffer;
    return convolver;
  }

  stopAmbience() {
    if (this._glassTimer) clearTimeout(this._glassTimer);
    this._glassTimer = null;
    if (this.ambienceNode) {
      try {
        this.ambienceNode.drone.stop();
        this.ambienceNode.drone2.stop();
      } catch (err) {}
      this.ambienceNode = null;
    }
  }

  _sounds = {
    ambience() {
      this.stopAmbience();
      const drone = this._osc(48, 'sawtooth');
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 120;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.025;

      drone.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      drone.start();

      const drone2 = this._osc(96, 'sine');
      const gain2 = this.ctx.createGain();
      gain2.gain.value = 0.012;
      drone2.connect(gain2);
      gain2.connect(this.masterGain);
      drone2.start();

      this.ambienceNode = { drone, drone2 };

      const schedule = () => {
        if (!this.enabled || !this.ambienceNode) return;
        this.play('glass_clink');
        this._glassTimer = setTimeout(schedule, 9000 + Math.random() * 16000);
      };
      this._glassTimer = setTimeout(schedule, 5000);
    },

    glass_clink() {
      const now = this.ctx.currentTime;
      const osc = this._osc(760 + Math.random() * 480, 'sine');
      const osc2 = this._osc(1200 + Math.random() * 600, 'sine');
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc2.start(now);
      osc.stop(now + 1.1);
      osc2.stop(now + 1.1);
    },

    card_play() {
      const now = this.ctx.currentTime;
      const noise = this._noise(0.12);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 360;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.13);

      const thud = this._osc(74, 'sine');
      const thudGain = this.ctx.createGain();
      thudGain.gain.setValueAtTime(0.13, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      thud.connect(thudGain);
      thudGain.connect(this.masterGain);
      thud.start(now);
      thud.stop(now + 0.09);
    },

    card_flip() {
      const now = this.ctx.currentTime;
      const noise = this._noise(0.28);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 520;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.24, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.28);
    },

    challenge() {
      const now = this.ctx.currentTime;
      const osc1 = this._osc(220, 'sawtooth');
      const osc2 = this._osc(330, 'sawtooth');
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(420, now);
      filter.frequency.exponentialRampToValueAtTime(1900, now + 0.42);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.58);
      osc2.stop(now + 0.58);
    },

    cylinder_spin() {
      const now = this.ctx.currentTime;
      const count = 7 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i += 1) {
        const t = now + i * 0.11;
        const osc = this._osc(1100 - i * 45, 'square');
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.11, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.04);
      }
    },

    trigger_empty() {
      const now = this.ctx.currentTime;
      const click = this._osc(1900, 'square');
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      click.connect(gain);
      gain.connect(this.masterGain);
      click.start(now);
      click.stop(now + 0.04);
    },

    gunshot() {
      const now = this.ctx.currentTime;
      const noise = this._noise(0.72);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3800, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + 0.32);
      const distortion = this.ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i += 1) {
        const x = (i * 2) / 256 - 1;
        curve[i] = ((Math.PI + 260) * x) / (Math.PI + 260 * Math.abs(x));
      }
      distortion.curve = curve;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.72, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);
      noise.connect(distortion);
      distortion.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.72);

      const boom = this._osc(52, 'sine');
      const boomGain = this.ctx.createGain();
      boomGain.gain.setValueAtTime(0.38, now);
      boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      boom.connect(boomGain);
      boomGain.connect(this.masterGain);
      boom.start(now);
      boom.stop(now + 0.38);
    },

    death() {
      const now = this.ctx.currentTime;
      const osc = this._osc(200, 'sawtooth');
      osc.frequency.exponentialRampToValueAtTime(40, now + 1.4);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 760;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
      const reverb = this._reverb(2.4, 1.6);
      const reverbGain = this.ctx.createGain();
      reverbGain.gain.value = 0.28;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      gain.connect(reverb);
      reverb.connect(reverbGain);
      reverbGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 1.6);
    },

    exposed() {
      const now = this.ctx.currentTime;
      const osc1 = this._osc(300, 'sawtooth');
      const osc2 = this._osc(450, 'square');
      osc1.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
      osc2.frequency.exponentialRampToValueAtTime(1800, now + 0.3);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.masterGain);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.48);
      osc2.stop(now + 0.48);
    },

    honest_reveal() {
      const now = this.ctx.currentTime;
      const osc = this._osc(440, 'sine');
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.13, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.38);
    },

    victory() {
      const now = this.ctx.currentTime;
      [330, 440, 550, 660].forEach((freq, i) => {
        const t = now + i * 0.15;
        const osc = this._osc(freq, 'triangle');
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.13, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.3);
      });
    }
  };
}

export async function mount(container, { onBack } = {}) {
  hostEl = container;
  navBack = onBack;
  sfx = new TavernSFX();

  state = {
    scene: 'lobby',
    settings: { ...DEFAULT_SETTINGS, ...(getData(SETTINGS_KEY, {}) || {}) },
    wallpaper: null,
    characters: [],
    selectedCharacterIds: [],
    players: [],
    phase: 'lobby',
    round: 0,
    tableCard: 'Q',
    turnOrder: [],
    currentTurnIndex: 0,
    tablePile: [],
    lastPlay: null,
    log: [],
    selectedCards: [],
    busy: false,
    winner: null,
    flash: false
  };

  state.characters = await safeGetAllCharacters();
  state.wallpaper = await getDB('blobs', WALLPAPER_KEY);

  injectStyle();
  render();

  if (state.settings.sfxEnabled) sfx.toggle(true);
  if (state.settings.ambienceEnabled) {
    delay(180).then(() => sfx.play('ambience'));
  }
}

export function unmount() {
  clearTimers();
  hideBottomSheet();
  currentSheetInput = null;
  if (sfx) {
    sfx.stopAmbience();
    sfx.toggle(false);
  }
  sfx = null;
  if (hostEl) hostEl.innerHTML = '';
  hostEl = null;
  navBack = null;
}

function render() {
  if (!hostEl) return;

  const wallpaperStyle = state.wallpaper?.value
    ? `style="background-image:url('${escapeAttr(state.wallpaper.value)}');opacity:${Number(state.settings.wallpaperOpacity || 0.36)}"`
    : '';

  hostEl.innerHTML = `
    <div class="lt-root ${state.flash ? 'lt-shake' : ''}">
      <div class="lt-wallpaper" ${wallpaperStyle}></div>
      <div class="lt-vignette"></div>
      <div class="lt-sparks">${renderSparks()}</div>

      <div class="lt-shell">
        <header class="lt-topbar">
          <button class="lt-icon-btn" data-action="back" aria-label="返回">${iconSvg('chevron-left')}</button>
          <div class="lt-title-wrap">
            <div class="lt-candle">${candleSvg()}</div>
            <div>
              <h1>骗子酒馆</h1>
              <p>${state.scene === 'game' ? `第 ${state.round} 局 · 主牌 ${state.tableCard}` : '今晚，谎言先落座'}</p>
            </div>
            <div class="lt-candle">${candleSvg()}</div>
          </div>
          <button class="lt-icon-btn" data-action="custom" aria-label="自定义">${iconSvg('sliders')}</button>
        </header>

        ${state.scene === 'lobby' ? renderLobby() : renderGame()}
      </div>
    </div>
  `;

  bindEvents();
}

function renderLobby() {
  const selected = new Set(state.selectedCharacterIds);
  const characterCards = state.characters.length
    ? state.characters.map(character => {
      const checked = selected.has(character.id);
      return `
        <button class="lt-character-card ${checked ? 'is-selected' : ''}" data-character-id="${escapeAttr(character.id)}">
          <div class="lt-avatar">${renderAvatar(character)}</div>
          <div>
            <strong>${escapeHtml(character.name || '未命名人设')}</strong>
            <span>${checked ? '已入座' : '邀请入座'}</span>
          </div>
        </button>
      `;
    }).join('')
    : `<div class="lt-empty">还没有可选人设。可以直接随机匹配，酒馆会替你凑齐牌局。</div>`;

  return `
    <main class="lt-lobby lt-scene-enter">
      <section class="lt-hero">
        <div class="lt-mask-mark">${maskSvg('main')}</div>
        <h2>选择今晚同桌的人</h2>
        <p>你可以自己组局，也可以随机匹配。人设不够时，酒馆会自动补上随机 AI。</p>
      </section>

      <section class="lt-panel">
        <div class="lt-section-head">
          <div>
            <h3>已有 AI 人设</h3>
            <p>最多邀请 3 位。没选满会自动补随机来客。</p>
          </div>
          <button class="lt-small-btn" data-action="clear-selected">清空</button>
        </div>
        <div class="lt-character-list">
          ${characterCards}
        </div>
      </section>

      <section class="lt-actions-grid">
        <button class="lt-main-btn lt-gold-btn" data-action="start-selected">
          自己组局
          <span>已选 ${state.selectedCharacterIds.length}/3</span>
        </button>
        <button class="lt-main-btn" data-action="start-random">
          随机匹配
          <span>陌生 AI 只陪玩，不写记忆</span>
        </button>
      </section>

      <section class="lt-rule-card">
        <h3>牌局规矩</h3>
        <p>每人 5 张牌。本局会随机指定 Q/K/A 作为主牌。轮到你时，背面出 1 到 3 张并声称它们都是主牌。下家可以相信，也可以质疑。Joker 永远能伪装成主牌。</p>
        <p>说谎被抓，或者质疑错了，就要扣动左轮。轮盘结束后会清桌重发，直到只剩最后一个人。</p>
      </section>
    </main>
  `;
}

function renderGame() {
  const current = getCurrentPlayer();
  const human = getHumanPlayer();
  const canHumanPlay = current?.isHuman && state.phase === 'playing' && !state.busy;
  const canChallenge = current?.isHuman && state.phase === 'playing' && state.lastPlay && !state.busy;
  const canPass = current?.isHuman && state.phase === 'playing' && state.lastPlay && !state.busy;

  return `
    <main class="lt-game lt-scene-enter">
      <section class="lt-table">
        <div class="lt-table-card">
          <span>主牌</span>
          <strong>${escapeHtml(state.tableCard)}</strong>
        </div>

        <div class="lt-player-ring">
          ${state.players.map(player => renderPlayerSeat(player, current?.id === player.id)).join('')}
        </div>

        <div class="lt-pile">
          <div class="lt-pile-stack">
            ${state.tablePile.slice(-6).map((card, index) => `
              <div class="lt-card-back" style="--i:${index}"></div>
            `).join('')}
          </div>
          <p>${state.tablePile.length ? `桌上已有 ${state.tablePile.length} 张暗牌` : '桌面还没有牌'}</p>
          ${state.lastPlay ? `<span>上一手：${escapeHtml(state.lastPlay.playerName)} 声称 ${state.lastPlay.claimedCount} 张 ${state.tableCard}</span>` : ''}
        </div>
      </section>

      <section class="lt-hand-panel">
        <div class="lt-section-head">
          <div>
            <h3>你的手牌</h3>
            <p>${canHumanPlay ? '点选 1 到 3 张，再推上桌。' : getTurnHint()}</p>
          </div>
          <div class="lt-turn-badge">${state.busy ? '酒馆沉默中' : escapeHtml(current?.name || '等待')}</div>
        </div>

        <div class="lt-hand">
          ${(human?.hand || []).map((card, index) => `
            <button class="lt-hand-card ${state.selectedCards.includes(index) ? 'is-picked' : ''} ${card === 'Joker' ? 'is-joker' : ''}"
              data-card-index="${index}"
              ${canHumanPlay ? '' : 'disabled'}>
              <span>${escapeHtml(card)}</span>
            </button>
          `).join('')}
        </div>

        <div class="lt-command-row">
          <button class="lt-main-btn lt-gold-btn" data-action="play-cards" ${canHumanPlay && state.selectedCards.length ? '' : 'disabled'}>
            推牌
            <span>${state.selectedCards.length ? `声称 ${state.selectedCards.length} 张 ${state.tableCard}` : '先选牌'}</span>
          </button>
          <button class="lt-main-btn" data-action="challenge" ${canChallenge ? '' : 'disabled'}>
            质疑
            <span>翻开上一手</span>
          </button>
          <button class="lt-main-btn" data-action="pass" ${canPass ? '' : 'disabled'}>
            相信
            <span>继续由你出牌</span>
          </button>
        </div>
      </section>

      <section class="lt-log-panel">
        <div class="lt-section-head">
          <div>
            <h3>酒馆记录</h3>
            <p>已创建人设会记住重要牌局；随机来客只陪玩。</p>
          </div>
          <button class="lt-small-btn" data-action="restart">重开</button>
        </div>
        <div class="lt-log-list">
          ${state.log.slice(-18).map(item => `
            <div class="lt-log-item ${item.type ? `is-${item.type}` : ''}">
              <span>${escapeHtml(item.time || '')}</span>
              <p>${escapeHtml(item.text || '')}</p>
            </div>
          `).join('')}
        </div>
      </section>

      ${state.phase === 'gameover' ? renderGameOver() : ''}
    </main>
  `;
}

function renderPlayerSeat(player, active) {
  const dead = !player.alive;
  return `
    <div class="lt-seat ${active ? 'is-active' : ''} ${dead ? 'is-dead' : ''}">
      <div class="lt-seat-avatar">
        ${player.isHuman ? userMaskSvg() : renderAvatar(player)}
      </div>
      <div class="lt-seat-info">
        <strong>${escapeHtml(player.name)}</strong>
        <span>${dead ? '出局' : `${player.hand.length} 张牌 · ${player.cylinder.firedCount}/6`}</span>
      </div>
      <div class="lt-cylinder">
        ${Array.from({ length: 6 }).map((_, i) => `
          <i class="${i < player.cylinder.firedCount ? 'is-fired' : ''} ${i === player.cylinder.firedCount && !dead ? 'is-current' : ''}"></i>
        `).join('')}
      </div>
    </div>
  `;
}

function renderGameOver() {
  return `
    <div class="lt-gameover">
      <div class="lt-gameover-card">
        <div class="lt-mask-mark">${maskSvg('win')}</div>
        <h2>${state.winner?.isHuman ? '你活到了最后' : `${escapeHtml(state.winner?.name || '某人')} 活到了最后`}</h2>
        <p>桌上的牌被收走，烛火还在跳。今晚的谎言已经记住了自己的主人。</p>
        <button class="lt-main-btn lt-gold-btn" data-action="restart">再开一局</button>
      </div>
    </div>
  `;
}

function bindEvents() {
  if (!hostEl) return;

  hostEl.querySelector('[data-action="back"]')?.addEventListener('click', () => {
    if (state.scene === 'game') {
      showConfirm('要离开这局骗子酒馆吗？当前牌局会结束。').then(ok => {
        if (!ok) return;
        state.scene = 'lobby';
        state.phase = 'lobby';
        sfx?.stopAmbience();
        render();
      });
      return;
    }
    if (typeof navBack === 'function') navBack();
  });

  hostEl.querySelector('[data-action="custom"]')?.addEventListener('click', openCustomSheet);
  hostEl.querySelector('[data-action="clear-selected"]')?.addEventListener('click', () => {
    state.selectedCharacterIds = [];
    render();
  });

  hostEl.querySelectorAll('[data-character-id]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.characterId;
      if (!id) return;
      const has = state.selectedCharacterIds.includes(id);
      if (has) {
        state.selectedCharacterIds = state.selectedCharacterIds.filter(item => item !== id);
      } else {
        if (state.selectedCharacterIds.length >= 3) {
          showToast('一桌最多再请 3 位 AI');
          return;
        }
        state.selectedCharacterIds.push(id);
      }
      render();
    });
  });

  hostEl.querySelector('[data-action="start-selected"]')?.addEventListener('click', () => startGame('selected'));
  hostEl.querySelector('[data-action="start-random"]')?.addEventListener('click', () => startGame('random'));

  hostEl.querySelectorAll('[data-card-index]').forEach(button => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.cardIndex);
      toggleSelectedCard(index);
    });
  });

  hostEl.querySelector('[data-action="play-cards"]')?.addEventListener('click', humanPlayCards);
  hostEl.querySelector('[data-action="challenge"]')?.addEventListener('click', () => humanChallenge());
  hostEl.querySelector('[data-action="pass"]')?.addEventListener('click', () => humanPass());
  hostEl.querySelector('[data-action="restart"]')?.addEventListener('click', () => {
    state.scene = 'lobby';
    state.phase = 'lobby';
    state.players = [];
    state.log = [];
    sfx?.stopAmbience();
    render();
  });
}

async function startGame(mode) {
  clearTimers();
  sfx?.toggle(state.settings.sfxEnabled);
  if (state.settings.ambienceEnabled) sfx?.play('ambience');

  const selectedCharacters = mode === 'selected'
    ? state.selectedCharacterIds
      .map(id => state.characters.find(character => character.id === id))
      .filter(Boolean)
      .slice(0, 3)
    : [];

  const players = [
    createHumanPlayer(),
    ...selectedCharacters.map(createCharacterPlayer)
  ];

  while (players.length < 4) {
    players.push(createRandomAiPlayer(players.length));
  }

  state.players = players;
  state.scene = 'game';
  state.phase = 'playing';
  state.round = 0;
  state.log = [];
  state.winner = null;
  addLog('欢迎来到骗子酒馆。请把真话和假话一起放在桌上。', 'system');

  await startRound();
}

async function startRound(startLoserId = null) {
  state.round += 1;
  state.phase = 'playing';
  state.busy = false;
  state.selectedCards = [];
  state.tablePile = [];
  state.lastPlay = null;
  state.tableCard = sample(CARD_TYPES);

  const alive = state.players.filter(player => player.alive);
  const deck = shuffle([...DECK]);

  alive.forEach(player => {
    player.hand = deck.splice(0, 5);
    player.lastClaim = null;
  });

  const aliveIds = alive.map(player => player.id);
  const firstId = startLoserId && aliveIds.includes(startLoserId)
    ? startLoserId
    : sample(aliveIds);

  state.turnOrder = rotateTo(aliveIds, firstId);
  state.currentTurnIndex = 0;

  addLog(`第 ${state.round} 局重新发牌。主牌是 ${state.tableCard}。`, 'system');
  render();

  await maybeAiTurn();
}

function toggleSelectedCard(index) {
  const current = getCurrentPlayer();
  if (!current?.isHuman || state.busy) return;

  if (state.selectedCards.includes(index)) {
    state.selectedCards = state.selectedCards.filter(item => item !== index);
  } else {
    if (state.selectedCards.length >= 3) {
      showToast('最多只能推 3 张牌');
      return;
    }
    state.selectedCards.push(index);
  }
  render();
}

async function humanPlayCards() {
  const player = getHumanPlayer();
  if (!player || state.selectedCards.length < 1 || state.selectedCards.length > 3 || state.busy) return;

  const indices = [...state.selectedCards].sort((a, b) => b - a);
  const cards = indices.map(index => player.hand[index]).filter(Boolean);
  indices.forEach(index => player.hand.splice(index, 1));

  playCards(player, cards, cards.length, `${cards.length} 张。`);
  state.selectedCards = [];
  render();

  await delay(500);
  await advanceTurn();
}

async function humanChallenge() {
  if (!state.lastPlay || state.busy) return;
  const challenger = getHumanPlayer();
  if (!challenger) return;
  await resolveChallenge(challenger);
}

async function humanPass() {
  if (!state.lastPlay || state.busy) return;
  addLog('你没有翻开那些牌。酒馆继续呼吸。', 'dialogue');
  await delay(300);
  render();
}

async function maybeAiTurn() {
  const current = getCurrentPlayer();
  if (!current || current.isHuman || state.phase !== 'playing' || state.busy) return;

  state.busy = true;
  render();

  await delay(700 + Math.random() * 900);

  const decision = await getAiDecision(current);
  if (state.phase !== 'playing' || !current.alive) return;

  if (state.lastPlay && decision.action === 'challenge') {
    state.busy = false;
    await resolveChallenge(current, decision.dialogue);
    return;
  }

  const playable = normalizeAiCards(current, decision.cardsPlayed, decision.claimedCount);
  playCards(current, playable.cards, playable.claimedCount, decision.dialogue || `${playable.claimedCount} 张。`);

  state.busy = false;
  render();

  await delay(700);
  await advanceTurn();
}

async function advanceTurn() {
  if (state.phase !== 'playing') return;

  const winner = getAlivePlayers()[0];
  if (getAlivePlayers().length <= 1 && winner) {
    await finishGame(winner);
    return;
  }

  const aliveIds = getAlivePlayers().map(player => player.id);
  state.turnOrder = state.turnOrder.filter(id => aliveIds.includes(id));
  if (!state.turnOrder.length) state.turnOrder = aliveIds;

  state.currentTurnIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;

  const current = getCurrentPlayer();
  if (!current?.alive) {
    await advanceTurn();
    return;
  }

  render();
  await maybeAiTurn();
}

function playCards(player, cards, claimedCount, dialogue) {
  const record = {
    playerId: player.id,
    playerName: player.name,
    cards: [...cards],
    claimedCount: clamp(Number(claimedCount) || cards.length, 1, 3),
    tableCard: state.tableCard,
    timestamp: getNow()
  };

  player.lastClaim = record;
  state.lastPlay = record;
  state.tablePile.push(...cards.map(card => ({
    card,
    by: player.id,
    round: state.round
  })));

  sfx?.play('card_play');
  addLog(`${player.name} 把 ${record.claimedCount} 张牌推到桌中央。`, 'play');
  if (dialogue) addLog(`${player.name}：${dialogue}`, 'dialogue');

  if (player.hand.length <= 0) {
    addLog(`${player.name} 手牌见底。下一次质疑会变得更危险。`, 'system');
  }
}

async function resolveChallenge(challenger, dialogue = '') {
  if (!state.lastPlay || state.busy) return;
  state.busy = true;
  state.phase = 'challenge';

  const target = state.players.find(player => player.id === state.lastPlay.playerId);
  if (!target) return;

  sfx?.play('challenge');
  addLog(dialogue ? `${challenger.name}：${dialogue}` : `${challenger.name} 伸手翻开了上一手牌。`, 'challenge');
  render();

  await delay(800);
  sfx?.play('card_flip');

  const honest = state.lastPlay.cards.every(card => card === state.tableCard || card === 'Joker');
  const loser = honest ? challenger : target;
  const resultText = honest
    ? `${target.name} 没有撒谎。${challenger.name} 质疑错了。`
    : `${target.name} 说谎了。`;

  if (honest) {
    sfx?.play('honest_reveal');
    addLog(resultText, 'honest');
  } else {
    triggerFlash();
    sfx?.play('exposed');
    addLog(resultText, 'caught');
  }

  render();
  await writeEventMemories({
    type: honest ? 'honest' : 'caught',
    target,
    challenger,
    loser,
    text: resultText
  });

  await delay(900);
  await roulette(loser);
}

async function roulette(player) {
  state.phase = 'roulette';
  addLog(`${player.name} 拿起了左轮。`, 'danger');
  render();

  sfx?.play('cylinder_spin');
  await delay(1200);

  player.cylinder.firedCount += 1;
  const dead = player.cylinder.firedCount >= player.cylinder.bulletPos;

  if (dead) {
    sfx?.play('gunshot');
    triggerFlash();
    addLog(`枪声吞掉了 ${player.name} 的影子。`, 'danger');
    await delay(620);
    sfx?.play('death');
    player.alive = false;
    player.hand = [];
    addLog(`${player.name} 出局。`, 'dead');

    await writeEventMemories({
      type: 'dead',
      target: player,
      text: `${player.name} 在骗子酒馆第 ${state.round} 局轮盘中出局。`
    });
  } else {
    sfx?.play('trigger_empty');
    addLog(`空弹。${player.name} 还活着。(${player.cylinder.firedCount}/6)`, 'survive');

    await writeEventMemories({
      type: 'survive',
      target: player,
      text: `${player.name} 在骗子酒馆轮盘中扣下扳机，但只是空弹。`
    });
  }

  addLog('酒保收走桌上的暗牌。下一局重新发牌。', 'system');
  render();
  await delay(900);

  const alive = getAlivePlayers();
  if (alive.length <= 1) {
    await finishGame(alive[0]);
    return;
  }

  await startRound(player.alive ? player.id : sample(alive).id);
}

async function finishGame(winner) {
  state.phase = 'gameover';
  state.winner = winner;
  sfx?.play('victory');
  addLog(`${winner.name} 成了今晚最后还坐着的人。`, 'system');

  await writeEventMemories({
    type: 'victory',
    target: winner,
    text: `${winner.name} 在骗子酒馆中赢到了最后。`
  });

  render();
}

async function getAiDecision(npc) {
  const fallback = makeLocalAiDecision(npc);

  try {
    const prompt = buildNpcPrompt(npc);
    const response = await silentRequest({
      messages: [
        {
          role: 'system',
          content: prompt
        },
        {
          role: 'user',
          content: [
            '当前牌局状态如下。',
            '我只能输出 JSON，不能输出解释。',
            '我可以说谎、诈唬、质疑或相信，但我不能控制真实牌面、子弹、胜负。',
            JSON.stringify(buildAiVisibleState(npc), null, 2),
            '请输出：{"action":"play|challenge|pass","cardsPlayed":["Q"],"claimedCount":1,"dialogue":"我的一句台词","memory":"如果我是用户已创建的人设，并且这件事值得我记住，我用第一人称写一句记忆；否则为空字符串"}'
          ].join('\n')
        }
      ],
      temperature: 0.85,
      maxTokens: 420
    });

    const parsed = parseJsonFromText(response);
    if (!parsed || typeof parsed !== 'object') return fallback;

    const action = ['play', 'challenge', 'pass'].includes(parsed.action) ? parsed.action : fallback.action;

    if (parsed.memory && npc.characterId) {
      await recordExternalInteraction({
        characterId: npc.characterId,
        role: 'assistant',
        content: String(parsed.memory).slice(0, 280),
        source: 'liars_tavern'
      }).catch(() => null);
    }

    return {
      action,
      cardsPlayed: Array.isArray(parsed.cardsPlayed) ? parsed.cardsPlayed : fallback.cardsPlayed,
      claimedCount: clamp(Number(parsed.claimedCount) || fallback.claimedCount, 1, 3),
      dialogue: String(parsed.dialogue || fallback.dialogue || '').slice(0, 80)
    };
  } catch (err) {
    return fallback;
  }
}

function buildNpcPrompt(npc) {
  const name = npc.name || '陌生来客';
  const persona = npc.persona || npc.description || npc.systemPrompt || npc.profile || npc.trait || '我坐在骗子酒馆里，习惯观察别人。';
  const intelligence = npc.intelligence ?? 60;
  const risk = npc.risk ?? 50;
  const memoryRule = npc.characterId
    ? '我是用户已创建的人设，重要事件可以写入记忆。'
    : '我是随机匹配的陌生陪玩，我不会写入记忆，memory 必须为空字符串。';

  return [
    `我叫 ${name}。`,
    `我正在骗子酒馆玩一场说谎牌局。`,
    `我的人设：${persona}`,
    `我的智商倾向是 ${intelligence}/100。数值越高，我越会算概率；数值越低，我越凭感觉。`,
    `我的冒险倾向是 ${risk}/100。数值越高，我越敢撒谎和质疑；数值越低，我越保守。`,
    memoryRule,
    `我必须用第一人称理解自己，但输出 JSON 里的 dialogue 只写我说出口的话。`,
    `我知道规则：本局主牌是 ${state.tableCard}。Joker 可以当作任意主牌。`,
    `我可以出 1 到 3 张牌并声称它们都是主牌，也可以在别人刚出牌后质疑。`,
    `桌上的暗牌越多，谎言累积越重，我越应该认真考虑质疑。`,
    `我不能控制真实牌面、不能控制子弹、不能控制输赢。`,
    `如果我写 memory，必须用第一人称，像"我记得今晚在骗子酒馆里……"这样。`,
    `只返回 JSON，不要 Markdown，不要多余文字。`
  ].join('\n');
}

function buildAiVisibleState(npc) {
  return {
    phase: state.phase,
    round: state.round,
    tableCard: state.tableCard,
    myName: npc.name,
    myHand: npc.hand,
    myCylinder: `${npc.cylinder.firedCount}/6`,
    myAlive: npc.alive,
    isPersistentCharacter: Boolean(npc.characterId),
    tablePileCount: state.tablePile.length,
    lastPlay: state.lastPlay
      ? {
        playerName: state.lastPlay.playerName,
        claimedCount: state.lastPlay.claimedCount,
        tableCard: state.lastPlay.tableCard
      }
      : null,
    players: state.players.map(player => ({
      id: player.id,
      name: player.name,
      alive: player.alive,
      handCount: player.hand.length,
      cylinder: `${player.cylinder.firedCount}/6`,
      isMe: player.id === npc.id
    })),
    recentLog: state.log.slice(-8).map(item => item.text)
  };
}

function makeLocalAiDecision(npc) {
  const trueCards = npc.hand.filter(card => card === state.tableCard || card === 'Joker');
  const risk = npc.risk ?? 50;
  const intelligence = npc.intelligence ?? 50;

  if (state.lastPlay) {
    const claimed = state.lastPlay.claimedCount || 1;
    const pilePressure = state.tablePile.length;
    const handPressure = Math.max(0, 5 - npc.hand.length) * 5;
    const suspicion = (claimed * 18)
      + (pilePressure * 8)
      + handPressure
      + (risk * 0.55)
      + (intelligence * 0.18)
      + Math.random() * 36;

    if (suspicion > 76) {
      return {
        action: 'challenge',
        cardsPlayed: [],
        claimedCount: 0,
        dialogue: sample([
          '开。',
          '不对。翻开。',
          '这句话太干净了。',
          '我不信。',
          '桌上太满了。开。'
        ])
      };
    }
  }

  const count = clamp(
    trueCards.length > 1 && Math.random() * 100 > risk ? Math.min(trueCards.length, 2) : 1 + Math.floor(Math.random() * 3),
    1,
    Math.min(3, npc.hand.length)
  );

  const truthful = trueCards.length >= count && Math.random() * 100 > risk * 0.45;
  const cards = truthful
    ? takeCardsByValue(npc.hand, card => card === state.tableCard || card === 'Joker', count)
    : takeRandomCards(npc.hand, count);

  return {
    action: 'play',
    cardsPlayed: cards,
    claimedCount: count,
    dialogue: sample([
      `${count} 张。`,
      `${count} 张，别看太久。`,
      `就 ${count} 张。`,
      '信不信随你。',
      '桌子会替我说话。'
    ])
  };
}

function normalizeAiCards(player, requestedCards, requestedCount) {
  const count = clamp(Number(requestedCount) || 1, 1, Math.min(3, player.hand.length || 1));
  const cards = [];

  if (Array.isArray(requestedCards)) {
    requestedCards.forEach(card => {
      if (cards.length >= count) return;
      const index = player.hand.indexOf(card);
      if (index >= 0) {
        cards.push(player.hand.splice(index, 1)[0]);
      }
    });
  }

  while (cards.length < count && player.hand.length) {
    const index = Math.floor(Math.random() * player.hand.length);
    cards.push(player.hand.splice(index, 1)[0]);
  }

  return {
    cards,
    claimedCount: cards.length || 1
  };
}

// ═══════════════════════════════════════
// 【记忆写入】统一走 core/memory.js
// ═══════════════════════════════════════

async function writeEventMemories(event) {
  const affected = [event.target, event.challenger, event.loser]
    .filter(Boolean)
    .filter(player => !player.isHuman && player.characterId);

  const unique = Array.from(new Map(affected.map(player => [player.characterId, player])).values());

  await Promise.all(unique.map(async player => {
    const content = buildMemoryContent(player, event);
    if (content) {
      await recordExternalInteraction({
        characterId: player.characterId,
        role: 'assistant',
        content,
        source: 'liars_tavern'
      }).catch(() => null);
    }
  }));
}

function buildMemoryContent(player, event) {
  if (!player?.characterId) return '';

  if (event.type === 'caught') {
    if (event.target?.id === player.id) {
      return `我记得今晚在骗子酒馆里，我被 ${event.challenger?.name || '某人'} 抓到说谎，那一刻桌上的空气像被烛火割开。`;
    }
    if (event.challenger?.id === player.id) {
      return `我记得今晚在骗子酒馆里，我质疑了 ${event.target?.name || '某人'}，并亲手翻开了谎言。`;
    }
  }

  if (event.type === 'honest') {
    if (event.target?.id === player.id) {
      return `我记得今晚在骗子酒馆里，我被质疑却没有撒谎，翻开的牌替我说了话。`;
    }
    if (event.challenger?.id === player.id) {
      return `我记得今晚在骗子酒馆里，我质疑错了 ${event.target?.name || '对手'}，因此不得不面对左轮。`;
    }
  }

  if (event.type === 'dead' && event.target?.id === player.id) {
    return `我记得今晚在骗子酒馆里，我倒在了轮盘之后，谎言和枪声一起留在桌边。`;
  }

  if (event.type === 'survive' && event.target?.id === player.id) {
    return `我记得今晚在骗子酒馆里，我扣下扳机却听见空响，自己又多活了一轮。`;
  }

  if (event.type === 'victory' && event.target?.id === player.id) {
    return `我记得今晚在骗子酒馆里，我撑到了最后，成为唯一还坐在桌边的人。`;
  }

  return event.text ? `我记得骗子酒馆里发生过这件事：${event.text}` : '';
}
async function openCustomSheet() {
  const sheet = document.createElement('div');
  sheet.className = 'lt-sheet';

  sheet.innerHTML = `
    <div class="lt-sheet-head">
      <h3>酒馆装扮</h3>
      <p>壁纸和声音都收在这里。</p>
    </div>

    <div class="lt-sheet-group">
      <button class="lt-sheet-row" data-sheet-action="upload-wallpaper">
        <span>${iconSvg('image')}</span>
        <div>
          <strong>更换壁纸</strong>
          <em>选择一张地下酒馆背景</em>
        </div>
      </button>

      <label class="lt-range-label">
        <span>壁纸透明度</span>
        <input type="range" min="0" max="0.85" step="0.01" value="${Number(state.settings.wallpaperOpacity || 0.36)}" data-sheet-action="wallpaper-opacity">
      </label>

      <button class="lt-sheet-row" data-sheet-action="clear-wallpaper">
        <span>${iconSvg('trash')}</span>
        <div>
          <strong>清除壁纸</strong>
          <em>回到默认黑粉酒馆</em>
        </div>
      </button>
    </div>

    <div class="lt-sheet-group">
      <button class="lt-sheet-row" data-sheet-action="toggle-sfx">
        <span>${iconSvg(state.settings.sfxEnabled ? 'volume-2' : 'volume-x')}</span>
        <div>
          <strong>音效</strong>
          <em>${state.settings.sfxEnabled ? '当前开启' : '当前关闭'}</em>
        </div>
      </button>

      <button class="lt-sheet-row" data-sheet-action="toggle-ambience">
        <span>${iconSvg(state.settings.ambienceEnabled ? 'waves' : 'volume-x')}</span>
        <div>
          <strong>环境音</strong>
          <em>${state.settings.ambienceEnabled ? '当前开启' : '当前关闭'}</em>
        </div>
      </button>
    </div>

    <input class="lt-hidden-file" type="file" accept="image/*">
  `;

  currentSheetInput = sheet.querySelector('.lt-hidden-file');

  sheet.querySelector('[data-sheet-action="upload-wallpaper"]')?.addEventListener('click', () => {
    currentSheetInput?.click();
  });

  currentSheetInput?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const value = await compressImage(file, 1600, 0.86);
    const record = {
      key: WALLPAPER_KEY,
      value,
      source: value,
      opacity: state.settings.wallpaperOpacity,
      updatedAt: getNow()
    };
    await setDB('blobs', WALLPAPER_KEY, record);
    state.wallpaper = record;
    render();
    hideBottomSheet();
    showToast('壁纸换好了');
  });

  sheet.querySelector('[data-sheet-action="clear-wallpaper"]')?.addEventListener('click', async () => {
    await deleteDB('blobs', WALLPAPER_KEY);
    state.wallpaper = null;
    render();
    hideBottomSheet();
    showToast('壁纸已经收起来');
  });

  sheet.querySelector('[data-sheet-action="wallpaper-opacity"]')?.addEventListener('input', async event => {
    state.settings.wallpaperOpacity = Number(event.target.value);
    await saveSettings();
    render();
  });

  sheet.querySelector('[data-sheet-action="toggle-sfx"]')?.addEventListener('click', async () => {
    state.settings.sfxEnabled = !state.settings.sfxEnabled;
    sfx?.toggle(state.settings.sfxEnabled);
    await saveSettings();
    hideBottomSheet();
    render();
    openCustomSheet();
  });

  sheet.querySelector('[data-sheet-action="toggle-ambience"]')?.addEventListener('click', async () => {
    state.settings.ambienceEnabled = !state.settings.ambienceEnabled;
    if (state.settings.ambienceEnabled) {
      sfx?.toggle(state.settings.sfxEnabled);
      sfx?.play('ambience');
    } else {
      sfx?.stopAmbience();
    }
    await saveSettings();
    hideBottomSheet();
    render();
    openCustomSheet();
  });

  showBottomSheet(sheet);
}

async function saveSettings() {
  await setData(SETTINGS_KEY, { ...state.settings });
}

function createHumanPlayer() {
  const user = getData('app_settings', {})?.user || getData('app_user', {}) || {};
  return {
    id: 'user',
    name: user.name || '你',
    isHuman: true,
    hand: [],
    cylinder: createCylinder(),
    alive: true,
    lastClaim: null
  };
}

function createCharacterPlayer(character, index) {
  return {
    id: `character_${character.id}`,
    characterId: character.id,
    name: character.name || `来客 ${index + 1}`,
    isHuman: false,
    avatar: normalizeImage(character.avatar || character.avatarUrl || character.imageBase64 || character.iconImage),
    persona: character.persona || character.description || character.systemPrompt || character.profile || '',
    intelligence: Number(character.gameIntelligence || character.intelligence || randomInt(42, 88)),
    risk: Number(character.gameRisk || character.risk || randomInt(28, 82)),
    trait: character.speakingStyle || '',
    hand: [],
    cylinder: createCylinder(),
    alive: true,
    lastClaim: null
  };
}

function createRandomAiPlayer(index) {
  const name = uniqueRandomName(index);
  const intelligence = randomInt(22, 86);
  const risk = randomInt(20, 92);
  const trait = sample(RANDOM_TRAITS);

  return {
    id: `random_${generateId('npc')}`,
    characterId: null,
    name,
    isHuman: false,
    avatar: '',
    persona: `我是随机匹配到骗子酒馆的陌生陪玩。我的性格是：${trait}。我的智商和胆量都不是固定的，我会根据桌面气氛临时改变策略。`,
    intelligence,
    risk,
    trait,
    hand: [],
    cylinder: createCylinder(),
    alive: true,
    lastClaim: null
  };
}

function createCylinder() {
  return {
    bulletPos: randomInt(1, 6),
    firedCount: 0
  };
}

async function safeGetAllCharacters() {
  try {
    const list = await getAllDB('characters');
    return Array.isArray(list) ? list.filter(item => item && item.id) : [];
  } catch (err) {
    return [];
  }
}

function getHumanPlayer() {
  return state.players.find(player => player.isHuman);
}

function getAlivePlayers() {
  return state.players.filter(player => player.alive);
}

function getCurrentPlayer() {
  const id = state.turnOrder[state.currentTurnIndex];
  return state.players.find(player => player.id === id);
}

function getTurnHint() {
  if (state.phase === 'gameover') return '牌局已经结束。';
  if (state.busy) return '有人正在思考。';
  const current = getCurrentPlayer();
  if (!current) return '等待下一轮。';
  if (current.isHuman) return '现在轮到你。';
  return `现在轮到 ${current.name}。`;
}

function addLog(text, type = '') {
  state.log.push({
    id: generateId('log'),
    text,
    type,
    time: formatTime(new Date())
  });
  if (state.log.length > 80) state.log = state.log.slice(-80);
}

function triggerFlash() {
  state.flash = true;
  render();
  const timer = setTimeout(() => {
    state.flash = false;
    render();
  }, 560);
  timers.push(timer);
}

function clearTimers() {
  timers.forEach(timer => clearTimeout(timer));
  timers = [];
}

function delay(ms) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    timers.push(timer);
  });
}

function shuffle(array) {
  const next = [...array];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function sample(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rotateTo(array, firstId) {
  const index = array.indexOf(firstId);
  if (index < 0) return [...array];
  return [...array.slice(index), ...array.slice(0, index)];
}

function takeCardsByValue(hand, predicate, count) {
  const cards = [];
  for (let i = 0; i < hand.length && cards.length < count; i += 1) {
    if (predicate(hand[i])) cards.push(hand[i]);
  }
  while (cards.length < count && hand.length) {
    const card = sample(hand);
    if (!cards.includes(card) || hand.filter(item => item === card).length > cards.filter(item => item === card).length) {
      cards.push(card);
    }
  }
  return cards;
}

function takeRandomCards(hand, count) {
  return shuffle(hand).slice(0, count);
}

function uniqueRandomName(index) {
  const used = new Set(state.players.map(player => player.name));
  const available = RANDOM_NAMES.filter(name => !used.has(name));
  return available.length ? sample(available) : `来客 ${index}`;
}

function parseJsonFromText(text) {
  if (!text) return null;
  if (typeof text === 'object') return text;
  const raw = String(text).trim();
  try {
    return JSON.parse(raw);
  } catch (err) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (error) {
      return null;
    }
  }
}

function normalizeImage(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.value || value.source || value.image || value.imageBase64 || value.url || value.src || '';
}

function renderAvatar(person) {
  const image = normalizeImage(person.avatar || person.image || person.iconImage || person.imageBase64);
  if (image) {
    return `<img src="${escapeAttr(image)}" alt="">`;
  }
  return maskSvg(person.name || 'npc');
}

function renderSparks() {
  return Array.from({ length: 18 }).map((_, i) => `
    <i style="--x:${randomInt(2, 98)}%;--y:${randomInt(12, 96)}%;--delay:${(i * 0.17).toFixed(2)}s;--dur:${(1.6 + Math.random() * 1.5).toFixed(2)}s;--drift:${randomInt(-10, 10)}px"></i>
  `).join('');
}

function candleSvg() {
  return `
    <svg viewBox="0 0 20 36" aria-hidden="true">
      <ellipse cx="10" cy="9" rx="5" ry="8" class="lt-flame-outer"></ellipse>
      <ellipse cx="10" cy="11" rx="2.5" ry="4.5" class="lt-flame-inner"></ellipse>
      <ellipse cx="10" cy="10" rx="8" ry="10" class="lt-flame-glow"></ellipse>
      <rect x="7.5" y="17" width="5" height="19" rx="0.8" class="lt-candle-body"></rect>
      <path d="M10 17 Q8 20 8.5 24 Q9 22 10 17Z" class="lt-wax"></path>
    </svg>
  `;
}

function maskSvg(seed = '') {
  const offset = String(seed).length % 6;
  return `
    <svg viewBox="0 0 60 70" aria-hidden="true">
      <ellipse cx="30" cy="32" rx="22" ry="26" class="lt-mask-face"></ellipse>
      <ellipse cx="${20 - offset * 0.2}" cy="28" rx="6" ry="4" class="lt-mask-eye"></ellipse>
      <ellipse cx="${40 + offset * 0.2}" cy="28" rx="6" ry="4" class="lt-mask-eye"></ellipse>
      <circle cx="${20 - offset * 0.2}" cy="28" r="1.5" class="lt-mask-glow"></circle>
      <circle cx="${40 + offset * 0.2}" cy="28" r="1.5" class="lt-mask-glow"></circle>
      <path d="M22 44 Q30 ${48 + offset * 0.3} 38 44" class="lt-mask-mouth"></path>
      <path d="M12 20 L18 26" class="lt-mask-line"></path>
      <path d="M48 20 L42 26" class="lt-mask-line"></path>
    </svg>
  `;
}

function userMaskSvg() {
  return `
    <svg viewBox="0 0 60 70" aria-hidden="true">
      <ellipse cx="30" cy="32" rx="22" ry="26" class="lt-mask-face is-user"></ellipse>
      <path d="M16 28 Q20 23 25 28" class="lt-mask-mouth"></path>
      <path d="M35 28 Q40 23 44 28" class="lt-mask-mouth"></path>
      <path d="M21 45 Q30 50 39 45" class="lt-mask-mouth"></path>
      <circle cx="30" cy="16" r="2" class="lt-mask-glow"></circle>
    </svg>
  `;
}

function iconSvg(name) {
  const map = {
    'chevron-left': '<path d="M15 18l-6-6 6-6"></path>',
    sliders: '<path d="M4 7h9"></path><path d="M17 7h3"></path><circle cx="15" cy="7" r="2"></circle><path d="M4 17h3"></path><path d="M11 17h9"></path><circle cx="9" cy="17" r="2"></circle>',
    image: '<rect x="4" y="5" width="16" height="14" rx="2"></rect><circle cx="9" cy="10" r="1.5"></circle><path d="M7 17l4-4 3 3 2-2 2 3"></path>',
    trash: '<path d="M5 7h14"></path><path d="M9 7V5h6v2"></path><path d="M8 10l1 9h6l1-9"></path>',
    'volume-2': '<path d="M4 10v4h4l5 4V6l-5 4H4z"></path><path d="M16 9c1 1 1 5 0 6"></path><path d="M18 7c2 2 2 8 0 10"></path>',
    'volume-x': '<path d="M4 10v4h4l5 4V6l-5 4H4z"></path><path d="M17 9l4 4"></path><path d="M21 9l-4 4"></path>',
    waves: '<path d="M3 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0"></path><path d="M3 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"></path>'
  };

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      ${map[name] || map.sliders}
    </svg>
  `;
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function injectStyle() {
  if (document.getElementById('liars-tavern-style')) return;

  const style = document.createElement('style');
  style.id = 'liars-tavern-style';
  style.textContent = `
    .lt-root {
      --lt-bg-void: #070308;
      --lt-bg-deep: #110a0f;
      --lt-bg-surface: #1c1018;
      --lt-bg-hover: #241420;
      --lt-pink-neon: #e8197a;
      --lt-pink-dim: #7a1040;
      --lt-pink-deep: #3d0820;
      --lt-pink-glow: rgba(232,25,122,0.15);
      --lt-pink-flash: rgba(232,25,122,0.38);
      --lt-gold-worn: #7a5a10;
      --lt-gold-light: #c49a2a;
      --lt-gold-dim: rgba(139,105,20,0.4);
      --lt-text-primary: #e2ceb8;
      --lt-text-dim: #7a6355;
      --lt-blood: #6b0f1a;
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      color: var(--lt-text-primary);
      background-color: var(--lt-bg-void);
      background-image:
        radial-gradient(ellipse at 50% -10%, rgba(232,25,122,0.11) 0%, transparent 55%),
        radial-gradient(ellipse at 80% 100%, rgba(122,16,64,0.08) 0%, transparent 50%);
      font-family: "STKaiti", "SimSun", var(--font-main);
      line-height: 1.7;
      touch-action: manipulation;
    }
    .lt-root *, .lt-root *::before, .lt-root *::after { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

    .lt-wallpaper { position: absolute; inset: 0; background-size: cover; background-position: center; pointer-events: none; filter: saturate(0.8) contrast(1.08) brightness(0.72); transition: all 200ms ease; }

    .lt-vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at center, transparent 24%, rgba(0,0,0,0.74) 100%), url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E"); z-index: 1; }

    .lt-shell { position: relative; z-index: 2; height: 100%; max-width: 520px; margin: 0 auto; padding: 18px 16px 22px; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }

    .lt-topbar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0 16px; background: linear-gradient(to bottom, rgba(7,3,8,0.94), rgba(7,3,8,0)); }

    .lt-title-wrap { display: flex; align-items: center; justify-content: center; min-width: 0; gap: 10px; text-align: center; }
    .lt-title-wrap h1 { margin: 0; color: var(--lt-gold-light); font-family: "Playfair Display", "STKaiti", "SimSun", serif; font-style: italic; font-size: 22px; font-weight: 700; letter-spacing: 0.14em; text-shadow: 0 0 20px rgba(196,154,42,0.34), 0 0 40px rgba(232,25,122,0.16); }
    .lt-title-wrap p { margin: 2px 0 0; color: var(--lt-text-dim); font-size: 12px; letter-spacing: 0.08em; white-space: nowrap; }

    .lt-icon-btn, .lt-small-btn, .lt-main-btn, .lt-character-card, .lt-hand-card, .lt-sheet-row { appearance: none; font: inherit; color: inherit; background: transparent; outline: transparent solid 1px; border-color: transparent; box-shadow: none; cursor: pointer; transition: all 200ms ease; touch-action: manipulation; }
    .lt-icon-btn { display: grid; place-items: center; width: 38px; height: 38px; color: var(--lt-text-primary); background: rgba(28,16,24,0.7); box-shadow: 0 2px 12px rgba(0,0,0,0.28), inset 0 0 0 1px var(--lt-gold-dim); }
    .lt-icon-btn svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }

    .lt-icon-btn:active, .lt-small-btn:active, .lt-main-btn:active, .lt-character-card:active, .lt-hand-card:active, .lt-sheet-row:active { transform: scale(0.96); }

    .lt-candle { width: 18px; height: 32px; opacity: 0.9; flex: 0 0 auto; }
    .lt-candle svg { width: 100%; height: 100%; }
    .lt-flame-outer { fill: var(--lt-pink-neon); opacity: 0.82; animation: ltFlame 1.8s ease-in-out infinite; }
    .lt-flame-inner { fill: var(--lt-text-primary); opacity: 0.58; animation: ltFlame 1.25s ease-in-out infinite reverse; }
    .lt-flame-glow { fill: var(--lt-pink-neon); opacity: 0.08; animation: ltGlow 2s ease-in-out infinite; }
    .lt-candle-body { fill: var(--lt-bg-surface); }
    .lt-wax { fill: var(--lt-pink-deep); opacity: 0.7; }

    .lt-scene-enter { animation: ltDoorOpen 0.78s cubic-bezier(0.4, 0, 0.2, 1) both; }

    .lt-hero, .lt-panel, .lt-rule-card, .lt-table, .lt-hand-panel, .lt-log-panel, .lt-gameover-card { position: relative; padding: 20px; background: rgba(17,10,15,0.88); box-shadow: 0 2px 12px rgba(0,0,0,0.36), inset 0 0 40px rgba(0,0,0,0.42), inset 0 0 0 1px rgba(122,90,16,0.58); }
    .lt-hero::before, .lt-panel::before, .lt-rule-card::before, .lt-table::before, .lt-hand-panel::before, .lt-log-panel::before, .lt-gameover-card::before { content: ""; position: absolute; top: 0; left: 0; width: 18px; height: 18px; background-image: url("data:image/svg+xml,%3Csvg width='18' height='18' viewBox='0 0 18 18' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 18 L0 0 L18 0' stroke='%23c49a2a' stroke-width='1.5' fill='none'/%3E%3Cpath d='M3 15 L3 3 L15 3' stroke='%237a5a10' stroke-width='0.6' fill='none' opacity='0.7'/%3E%3Ccircle cx='1' cy='1' r='1.5' fill='%23c49a2a' opacity='0.9'/%3E%3C/svg%3E"); pointer-events: none; }
    .lt-hero::after, .lt-panel::after, .lt-rule-card::after, .lt-table::after, .lt-hand-panel::after, .lt-log-panel::after, .lt-gameover-card::after { content: ""; position: absolute; right: 0; bottom: 0; width: 18px; height: 18px; background-image: url("data:image/svg+xml,%3Csvg width='18' height='18' viewBox='0 0 18 18' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M18 0 L18 18 L0 18' stroke='%23c49a2a' stroke-width='1.5' fill='none'/%3E%3Cpath d='M15 3 L15 15 L3 15' stroke='%237a5a10' stroke-width='0.6' fill='none' opacity='0.7'/%3E%3Ccircle cx='17' cy='17' r='1.5' fill='%23c49a2a' opacity='0.9'/%3E%3C/svg%3E"); pointer-events: none; }

    .lt-hero { margin: 10px 0 16px; text-align: center; }
    .lt-mask-mark { width: 74px; height: 86px; margin: 0 auto 8px; color: var(--lt-gold-light); }
    .lt-mask-mark svg, .lt-avatar svg, .lt-seat-avatar svg { width: 100%; height: 100%; }
    .lt-mask-face { fill: var(--lt-bg-deep); stroke: var(--lt-gold-worn); stroke-width: 1; }
    .lt-mask-face.is-user { stroke: var(--lt-pink-dim); }
    .lt-mask-eye { fill: var(--lt-bg-void); }
    .lt-mask-glow { fill: var(--lt-pink-neon); opacity: 0.9; animation: ltEye 3s ease-in-out infinite; }
    .lt-mask-mouth, .lt-mask-line { fill: none; stroke: var(--lt-gold-worn); stroke-width: 1; stroke-linecap: round; }
    .lt-mask-line { stroke-width: 0.5; opacity: 0.55; }

    .lt-hero h2, .lt-gameover-card h2 { margin: 0; color: var(--lt-gold-light); font-size: 21px; font-weight: 700; letter-spacing: 0.08em; }
    .lt-hero p, .lt-rule-card p, .lt-section-head p, .lt-gameover-card p { margin: 8px 0 0; color: var(--lt-text-dim); font-size: 14px; line-height: 1.7; }

    .lt-panel, .lt-rule-card, .lt-hand-panel, .lt-log-panel { margin-top: 14px; }

    .lt-section-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
    .lt-section-head h3 { margin: 0; color: var(--lt-text-primary); font-size: 17px; font-weight: 600; letter-spacing: 0.06em; }
    .lt-small-btn { flex: 0 0 auto; padding: 7px 12px; color: var(--lt-text-dim); background: rgba(28,16,24,0.75); box-shadow: inset 0 0 0 1px rgba(122,16,64,0.7); font-size: 12px; letter-spacing: 0.08em; }

    .lt-character-list { display: grid; grid-template-columns: 1fr; gap: 10px; max-height: 310px; overflow-y: auto; overscroll-behavior: contain; padding-right: 2px; }
    .lt-character-card { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px; text-align: left; background: rgba(28,16,24,0.72); box-shadow: inset 0 0 0 1px rgba(122,90,16,0.34); }
    .lt-character-card.is-selected { background: rgba(61,8,32,0.72); box-shadow: 0 0 18px rgba(232,25,122,0.12), inset 0 0 0 1px rgba(232,25,122,0.46); }

    .lt-avatar { width: 44px; height: 44px; overflow: hidden; flex: 0 0 auto; background: rgba(7,3,8,0.62); box-shadow: inset 0 0 0 1px var(--lt-gold-dim); }
    .lt-avatar img, .lt-seat-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; filter: saturate(0.84) contrast(1.05); }

    .lt-character-card strong { display: block; color: var(--lt-text-primary); font-size: 15px; font-weight: 600; }
    .lt-character-card span { display: block; color: var(--lt-text-dim); font-size: 12px; margin-top: 2px; }
    .lt-empty { padding: 18px; color: var(--lt-text-dim); background: rgba(28,16,24,0.54); line-height: 1.7; box-shadow: inset 0 0 0 1px rgba(122,90,16,0.32); }

    .lt-actions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
    .lt-main-btn { display: flex; flex-direction: column; justify-content: center; gap: 2px; min-height: 58px; padding: 12px 14px; color: var(--lt-text-primary); background: rgba(28,16,24,0.78); box-shadow: inset 0 0 0 1px rgba(122,16,64,0.72), 0 2px 12px rgba(0,0,0,0.18); font-size: 14px; letter-spacing: 0.1em; text-align: center; }
    .lt-main-btn span { color: var(--lt-text-dim); font-size: 11px; letter-spacing: 0.04em; }
    .lt-gold-btn { color: var(--lt-gold-light); box-shadow: inset 0 0 0 1px rgba(196,154,42,0.56), 0 0 18px rgba(196,154,42,0.08); }
    .lt-main-btn:disabled, .lt-hand-card:disabled { opacity: 0.42; cursor: default; transform: none; }

    .lt-table { margin-top: 10px; min-height: 310px; }
    .lt-table-card { position: absolute; left: 50%; top: 50%; z-index: 2; transform: translate(-50%, -50%); display: grid; place-items: center; width: 92px; height: 122px; background: radial-gradient(circle at 50% 0%, rgba(232,25,122,0.16), rgba(17,10,15,0.96) 62%); box-shadow: 0 0 28px rgba(232,25,122,0.14), inset 0 0 0 1px rgba(196,154,42,0.54), inset 0 0 24px rgba(0,0,0,0.48); }
    .lt-table-card span { color: var(--lt-text-dim); font-size: 12px; letter-spacing: 0.18em; }
    .lt-table-card strong { color: var(--lt-gold-light); font-family: "Courier New", monospace; font-size: 38px; line-height: 1; text-shadow: 0 0 20px rgba(232,25,122,0.2); }

    .lt-player-ring { position: relative; z-index: 3; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .lt-seat { display: flex; align-items: center; gap: 10px; min-height: 78px; padding: 10px; background: rgba(28,16,24,0.66); box-shadow: inset 0 0 0 1px rgba(122,90,16,0.32); transition: all 200ms ease; }
    .lt-seat.is-active { background: rgba(61,8,32,0.66); box-shadow: 0 0 18px rgba(232,25,122,0.14), inset 0 0 0 1px rgba(232,25,122,0.52); }
    .lt-seat.is-dead { opacity: 0.45; filter: grayscale(0.8); }
    .lt-seat-avatar { width: 42px; height: 48px; flex: 0 0 auto; overflow: hidden; background: rgba(7,3,8,0.62); box-shadow: inset 0 0 0 1px var(--lt-gold-dim); }
    .lt-seat-info { min-width: 0; flex: 1; }
    .lt-seat-info strong { display: block; color: var(--lt-text-primary); font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lt-seat-info span { display: block; color: var(--lt-text-dim); font-size: 11px; margin-top: 2px; }

    .lt-cylinder { display: grid; grid-template-columns: repeat(3, 6px); gap: 3px; flex: 0 0 auto; }
    .lt-cylinder i { width: 6px; height: 6px; background: rgba(122,90,16,0.32); box-shadow: 0 0 0 1px rgba(196,154,42,0.16); }
    .lt-cylinder i.is-fired { background: rgba(0,0,0,0.72); }
    .lt-cylinder i.is-current { background: var(--lt-pink-neon); box-shadow: 0 0 8px rgba(232,25,122,0.56); }

    .lt-pile { position: relative; z-index: 1; margin: 120px auto 0; text-align: center; color: var(--lt-text-dim); font-size: 12px; }
    .lt-pile-stack { position: relative; width: 86px; height: 58px; margin: 0 auto 6px; }
    .lt-card-back { position: absolute; left: 16px; top: 8px; width: 52px; height: 72px; background: linear-gradient(145deg, rgba(61,8,32,0.92), rgba(17,10,15,0.98)); box-shadow: inset 0 0 0 1px rgba(196,154,42,0.48), 0 3px 10px rgba(0,0,0,0.28); transform: translate(calc(var(--i) * 4px), calc(var(--i) * -2px)) rotate(calc(var(--i) * 4deg - 8deg)); }
    .lt-pile p { margin: 0; }
    .lt-pile span { display: block; margin-top: 2px; color: var(--lt-gold-light); }

    .lt-turn-badge { padding: 7px 10px; color: var(--lt-pink-neon); background: rgba(61,8,32,0.5); box-shadow: inset 0 0 0 1px rgba(232,25,122,0.3); font-size: 12px; white-space: nowrap; }

    .lt-hand { display: flex; gap: 10px; overflow-x: auto; padding: 6px 2px 12px; overscroll-behavior: contain; }
    .lt-hand-card { flex: 0 0 66px; height: 92px; color: var(--lt-text-primary); background: rgba(17,10,15,0.94); box-shadow: inset 0 0 0 1px rgba(196,154,42,0.5), inset 0 0 24px rgba(0,0,0,0.45), 0 2px 12px rgba(0,0,0,0.22); transform: translateY(0); }
    .lt-hand-card span { display: grid; place-items: center; width: 100%; height: 100%; color: var(--lt-gold-light); font-family: "Courier New", monospace; font-size: 22px; font-weight: 700; }
    .lt-hand-card.is-picked { transform: translateY(-10px); box-shadow: 0 0 18px rgba(232,25,122,0.22), inset 0 0 0 1px rgba(232,25,122,0.72), inset 0 0 24px rgba(0,0,0,0.45); }
    .lt-hand-card.is-joker span { color: var(--lt-pink-neon); text-shadow: 0 0 12px rgba(232,25,122,0.45); }

    .lt-command-row { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 10px; }

    .lt-log-list { display: flex; flex-direction: column; gap: 8px; max-height: 260px; overflow-y: auto; overscroll-behavior: contain; padding-right: 2px; }
    .lt-log-item { padding: 10px 12px; background: rgba(28,16,24,0.56); box-shadow: inset 0 0 0 1px rgba(122,90,16,0.22); }
    .lt-log-item span { display: block; color: var(--lt-text-dim); font-size: 10px; letter-spacing: 0.08em; margin-bottom: 3px; }
    .lt-log-item p { margin: 0; color: var(--lt-text-primary); font-size: 14px; line-height: 1.6; }
    .lt-log-item.is-dialogue p { color: var(--lt-gold-light); }
    .lt-log-item.is-challenge p, .lt-log-item.is-caught p { color: var(--lt-pink-neon); }
    .lt-log-item.is-danger p, .lt-log-item.is-dead p { color: #d8a1a1; }
    .lt-log-item.is-honest p, .lt-log-item.is-survive p { color: var(--lt-text-primary); }

    .lt-gameover { position: fixed; inset: 0; z-index: 12; display: grid; place-items: center; padding: 24px; background: rgba(7,3,8,0.78); backdrop-filter: blur(6px); }
    .lt-gameover-card { width: min(420px, 100%); text-align: center; }
    .lt-gameover-card .lt-main-btn { width: 100%; margin-top: 18px; }

    .lt-sparks { position: absolute; inset: 0; z-index: 2; pointer-events: none; overflow: hidden; }
    .lt-sparks i { position: absolute; left: var(--x); top: var(--y); width: 2px; height: 3px; background: var(--lt-pink-neon); box-shadow: 0 0 4px var(--lt-pink-neon), 0 0 8px rgba(232,25,122,0.5); opacity: 0; animation: ltSpark var(--dur) ease-out infinite; animation-delay: var(--delay); }

    .lt-shake { animation: ltExposeShake 0.55s cubic-bezier(0.36, 0.07, 0.19, 0.97); }
    .lt-shake::after { content: ""; position: fixed; inset: 0; z-index: 99; pointer-events: none; background: radial-gradient(circle at center, rgba(232,25,122,0.35), rgba(122,16,64,0.1)); animation: ltFlashFade 0.6s ease-out forwards; }

    .lt-sheet { padding: 4px 0 10px; color: var(--text-primary); }
    .lt-sheet-head { padding: 2px 2px 14px; }
    .lt-sheet-head h3 { margin: 0; font-size: 17px; font-weight: 600; color: var(--text-primary); }
    .lt-sheet-head p { margin: 4px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
    .lt-sheet-group { display: grid; gap: 10px; margin-top: 10px; }
    .lt-sheet-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px; color: var(--text-primary); background: var(--bg-card); box-shadow: var(--shadow-sm); text-align: left; }
    .lt-sheet-row span { display: grid; place-items: center; width: 34px; height: 34px; color: var(--accent); background: var(--accent-light); flex: 0 0 auto; }
    .lt-sheet-row svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
    .lt-sheet-row strong { display: block; font-size: 15px; font-weight: 600; }
    .lt-sheet-row em { display: block; margin-top: 2px; color: var(--text-secondary); font-style: normal; font-size: 12px; }
    .lt-range-label { display: grid; gap: 8px; padding: 14px; color: var(--text-primary); background: var(--bg-card); box-shadow: var(--shadow-sm); font-size: 14px; }
    .lt-range-label input { width: 100%; accent-color: var(--accent); }
    .lt-hidden-file { display: none; }

    @keyframes ltFlame { 0%, 100% { transform: translateX(0) scaleY(1); opacity: 0.82; } 45% { transform: translateX(-0.8px) scaleY(1.16); opacity: 0.68; } 70% { transform: translateX(0.8px) scaleY(0.9); opacity: 0.95; } }
    @keyframes ltGlow { 0%, 100% { transform: scale(1); opacity: 0.08; } 50% { transform: scale(1.18); opacity: 0.14; } }
    @keyframes ltEye { 0%, 100% { opacity: 0.9; } 50% { opacity: 0.34; } }
    @keyframes ltDoorOpen { 0% { opacity: 0; transform: scale(1.04) translateY(10px); filter: blur(4px); } 100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); } }
    @keyframes ltSpark { 0% { opacity: 0.9; transform: translateY(0) translateX(0) scale(1); } 50% { opacity: 0.5; transform: translateY(-30px) translateX(var(--drift)) scale(0.6); } 100% { opacity: 0; transform: translateY(-60px) translateX(calc(var(--drift) * 1.5)) scale(0.2); } }
    @keyframes ltExposeShake { 0% { transform: translate(0,0); filter: brightness(1); } 10% { transform: translate(-5px, 2px); filter: brightness(1.5) saturate(1.6); } 20% { transform: translate(5px, -3px); filter: brightness(1); } 30% { transform: translate(-3px, 4px); } 40% { transform: translate(4px, -2px); filter: brightness(1.7); } 50% { transform: translate(-2px, 1px); filter: brightness(1); } 60% { transform: translate(2px, 2px); } 100% { transform: translate(0,0); filter: brightness(1); } }
    @keyframes ltFlashFade { 0% { opacity: 1; } 60% { opacity: 0.4; } 100% { opacity: 0; } }

    @media (max-width: 390px) {
      .lt-shell { padding-left: 12px; padding-right: 12px; }
      .lt-player-ring { grid-template-columns: 1fr; }
      .lt-command-row, .lt-actions-grid { grid-template-columns: 1fr; }
      .lt-title-wrap h1 { font-size: 18px; }
      .lt-candle { display: none; }
    }
  `;
  document.head.appendChild(style);
}

// 依赖：../../core/storage.js(getData,setData,getAllDB,getDB,setDB,deleteDB,generateId,getNow,compressImage)；../../core/ui.js(createIcon,showToast,showBottomSheet,hideBottomSheet,showConfirm)；../../core/api.js(silentRequest)；../../core/memory.js(recordExternalInteraction)
