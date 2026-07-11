// core/tts.js
// imports: getData from './storage.js'

import { getData } from './storage.js';

/* ── constants ── */
const TTS_TIMEOUT = 45000;
const MAX_INPUT_LENGTH = 4000;
const DEFAULT_WEB_SPEECH_LANG = 'zh-CN';
const AZURE_DEFAULT_FORMAT = 'audio-16khz-128kbitrate-mono-mp3';

/* ── active playback tracking ── */
const activeInstances = new Set();

// ═══════════════════════════════════════
// 【工具函数】字符串、端点、provider 规范化
// ═══════════════════════════════════════

function pickFirstString(...args) {
  for (const arg of args) {
    if (typeof arg === 'string' && arg.trim()) {
      return arg.trim();
    }
  }
  return args[args.length - 1] || '';
}

function normalizeEndpoint(raw) {
  return String(raw || '').trim().replace(/\/+$/, '');
}

function normalizeProvider(provider, endpoint) {
  const p = String(provider || '').toLowerCase().trim();
  const ep = String(endpoint || '').toLowerCase();

  if (p === 'openai') return 'openai';
  if (p === 'elevenlabs') return 'elevenlabs';
  if (p === 'azure') return 'azure';
  if (p === 'custom') return 'custom';

  if (ep.includes('elevenlabs')) return 'elevenlabs';
  if (ep.includes('speech.microsoft.com') || ep.includes('tts.speech.microsoft.com') || ep.includes('azure')) return 'azure';
  if (ep.includes('openai')) return 'openai';

  return 'custom';
}

function toast(message) {
  try {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast(message);
    }
  } catch (error) {
    // silent
  }
}

// ═══════════════════════════════════════
// 【URL 智能检测】路径里已有关键词就不重复拼接
// ═══════════════════════════════════════

function urlHasPathKeyword(url, keyword) {
  try {
    return new URL(url).pathname.toLowerCase().includes(keyword.toLowerCase());
  } catch {
    return url.toLowerCase().includes(keyword.toLowerCase());
  }
}

function urlHasV1(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.includes('/v1');
  } catch {
    return url.toLowerCase().includes('/v1');
  }
}

function smartTTSUrl(base, provider, voiceId) {
  if (provider === 'elevenlabs') {
    if (urlHasPathKeyword(base, '/text-to-speech/')) return base;
    if (urlHasV1(base)) return base + '/text-to-speech/' + encodeURIComponent(voiceId || 'default');
    return base + '/v1/text-to-speech/' + encodeURIComponent(voiceId || 'default');
  }

  if (provider === 'azure') {
    if (urlHasPathKeyword(base, '/cognitiveservices/v1')) return base;
    return base + '/cognitiveservices/v1';
  }

  // openai / custom
  if (urlHasPathKeyword(base, '/audio/speech')) return base;
  if (urlHasV1(base)) return base + '/audio/speech';
  return base + '/v1/audio/speech';
}

// ═══════════════════════════════════════
// 【文本清理】去掉 markdown / 标签 / thinking 块
// ═══════════════════════════════════════

function cleanTextForSpeech(text) {
  return String(text || '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ═══════════════════════════════════════
// 【配置解析】合并全局 TTS 配置和角色覆盖
// ═══════════════════════════════════════

function resolveConfig(configOverride = {}) {
  const settings = getData('app_settings') || {};
  const globalTts = settings.ttsGlobal || {};
  const override = configOverride || {};

  const endpoint = pickFirstString(override.endpoint, globalTts.endpoint, '');
  const apiKey = pickFirstString(override.apiKey, globalTts.apiKey, '');
  const voice = pickFirstString(override.voice, globalTts.voice, '');
  const voiceId = pickFirstString(override.voiceId, globalTts.voiceId, '');
  const provider = pickFirstString(override.provider, globalTts.provider, 'custom');
  const model = pickFirstString(override.model, globalTts.model, '');
  const language = pickFirstString(override.language, globalTts.language, DEFAULT_WEB_SPEECH_LANG);

  const normalizedEndpoint = normalizeEndpoint(endpoint);

  return {
    endpoint: normalizedEndpoint,
    apiKey: String(apiKey || '').trim(),
    voice: String(voice || '').trim(),
    voiceId: String(voiceId || '').trim(),
    provider: normalizeProvider(provider, normalizedEndpoint),
    model: String(model || '').trim(),
    language: String(language || '').trim() || DEFAULT_WEB_SPEECH_LANG
  };
}

// ═══════════════════════════════════════
// 【播放实例】创建可停止的播放状态
// ═══════════════════════════════════════

function createInstance() {
  const state = {
    stopped: false,
    audio: null,
    objectUrl: null,
    abortController: null,
    timer: null,
    utterance: null
  };

  const instance = {
    stop() {
      if (state.stopped) return;
      state.stopped = true;

      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }

      if (state.abortController) {
        state.abortController.abort();
        state.abortController = null;
      }

      if (state.audio) {
        try {
          state.audio.pause();
          state.audio.removeAttribute('src');
          state.audio.load();
        } catch (error) {
          // silent
        }
        state.audio = null;
      }

      if (state.utterance && typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch (error) {
          // silent
        }
        state.utterance = null;
      }

      if (state.objectUrl) {
        try {
          URL.revokeObjectURL(state.objectUrl);
        } catch (error) {
          // silent
        }
        state.objectUrl = null;
      }

      activeInstances.delete(instance);
    }
  };

  return { instance, state };
}

// ═══════════════════════════════════════
// 【Web Speech】浏览器内置语音回退
// ═══════════════════════════════════════

function canUseWebSpeech() {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof window.SpeechSynthesisUtterance !== 'undefined';
}

function speakWithWebSpeech(text, config, state, instance) {
  if (!canUseWebSpeech()) return false;

  try {
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = config.language || DEFAULT_WEB_SPEECH_LANG;

    if (config.voice && window.speechSynthesis.getVoices) {
      const voices = window.speechSynthesis.getVoices() || [];
      const matched = voices.find((voice) =>
        String(voice.name || '').toLowerCase() === String(config.voice || '').toLowerCase() ||
        String(voice.voiceURI || '').toLowerCase() === String(config.voice || '').toLowerCase()
      );
      if (matched) utterance.voice = matched;
    }

    utterance.onend = () => {
      activeInstances.delete(instance);
      state.utterance = null;
    };

    utterance.onerror = () => {
      activeInstances.delete(instance);
      state.utterance = null;
    };

    state.utterance = utterance;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch (error) {
    return false;
  }
}

// ═══════════════════════════════════════
// 【请求构建】各 provider 的 TTS 请求（智能拼 URL）
// ═══════════════════════════════════════

function resolveVoiceId(config) {
  return config.voiceId || config.voice || '';
}

function buildOpenAIRequest(config, text) {
  const base = normalizeEndpoint(config.endpoint);
  return {
    url: smartTTSUrl(base, 'openai'),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: {
      model: config.model || 'tts-1',
      voice: config.voice || 'alloy',
      voice_id: resolveVoiceId(config),
      input: text
    }
  };
}

function buildCustomRequest(config, text) {
  const base = normalizeEndpoint(config.endpoint);
  return {
    url: smartTTSUrl(base, 'custom'),
    headers: {
      'Content-Type': 'application/json'
    },
    body: {
      model: config.model || 'tts-1',
      voice: config.voice || 'alloy',
      voice_id: resolveVoiceId(config),
      input: text
    }
  };
}

function buildElevenLabsRequest(config, text) {
  const base = normalizeEndpoint(config.endpoint);
  const voiceId = resolveVoiceId(config) || 'default';
  return {
    url: smartTTSUrl(base, 'elevenlabs', voiceId),
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': config.apiKey
    },
    body: {
      text,
      model_id: config.model || undefined,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3,
        use_speaker_boost: true
      }
    }
  };
}

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildAzureSsml(text, config) {
  const voice = config.voice || 'zh-CN-XiaoxiaoNeural';
  const lang = config.language || DEFAULT_WEB_SPEECH_LANG;
  return `<?xml version="1.0" encoding="utf-8"?>
<speak version="1.0" xml:lang="${lang}" xmlns="http://www.w3.org/2001/10/synthesis">
  <voice name="${voice}">${escapeXml(text)}</voice>
</speak>`;
}

function buildAzureRequest(config, text) {
  const base = normalizeEndpoint(config.endpoint);
  return {
    url: smartTTSUrl(base, 'azure'),
    headers: {
      'Content-Type': 'application/ssml+xml',
      'Ocp-Apim-Subscription-Key': config.apiKey,
      'X-Microsoft-OutputFormat': AZURE_DEFAULT_FORMAT
    },
    body: buildAzureSsml(text, config)
  };
}

function buildTTSRequest(config, text) {
  if (config.provider === 'elevenlabs') return buildElevenLabsRequest(config, text);
  if (config.provider === 'azure') return buildAzureRequest(config, text);
  if (config.provider === 'openai') return buildOpenAIRequest(config, text);
  return buildCustomRequest(config, text);
}

// ═══════════════════════════════════════
// 【错误处理】HTTP 状态码翻译
// ═══════════════════════════════════════

function parseRemoteError(status, provider) {
  const label = provider === 'custom' ? 'TTS' : `${provider} TTS`;
  if (status === 401) return `${label} API Key 无效或已过期`;
  if (status === 403) return `${label} 没有访问权限`;
  if (status === 404) return `${label} 地址不正确`;
  if (status === 429) return `${label} 请求太频繁，请稍后再试`;
  if (status >= 500) return `${label} 服务暂时不可用`;
  return `${label} 请求失败 (${status})`;
}

// ═══════════════════════════════════════
// 【音频播放】响应判断和 blob 播放
// ═══════════════════════════════════════

function canUseResponseAudio(response) {
  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
  return contentType.startsWith('audio/') || contentType.includes('application/octet-stream') || contentType.includes('binary');
}

async function tryPlayBlob(blob, state, instance) {
  if (!blob || blob.size === 0) return false;

  state.objectUrl = URL.createObjectURL(blob);
  const audio = new Audio();
  state.audio = audio;

  audio.addEventListener('ended', () => {
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = null;
    }
    activeInstances.delete(instance);
  }, { once: true });

  audio.addEventListener('error', () => {
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = null;
    }
    activeInstances.delete(instance);
  }, { once: true });

  audio.src = state.objectUrl;
  await audio.play();
  return true;
}

async function playRemoteTTS(config, text, state, instance) {
  const request = buildTTSRequest(config, text);

  if ((config.provider === 'azure' || config.provider === 'openai' || config.provider === 'custom') && !config.endpoint) {
    return false;
  }

  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: typeof request.body === 'string' ? request.body : JSON.stringify(request.body),
    signal: state.abortController.signal
  });

  if (state.stopped) return true;

  if (!response.ok) {
    toast(parseRemoteError(response.status, config.provider));
    return false;
  }

  const blob = await response.blob();
  if (state.stopped) return true;

  if (!canUseResponseAudio(response) && !(blob && blob.size > 0)) {
    return false;
  }

  return await tryPlayBlob(blob, state, instance);
}

// ═══════════════════════════════════════
// 【公开 API】playTTS / stopAll
// ═══════════════════════════════════════

export function playTTS(text, configOverride) {
  const { instance, state } = createInstance();

  let cleaned = cleanTextForSpeech(text || '');
  if (!cleaned) {
    // 空内容也返回 Promise，保证调用方 .catch 不报错
    return Promise.resolve(instance);
  }

  if (cleaned.length > MAX_INPUT_LENGTH) {
    cleaned = cleaned.slice(0, MAX_INPUT_LENGTH);
  }

  activeInstances.add(instance);

  // 始终返回 Promise：成功启动 resolve，失败安全 resolve + console.warn，
  // 不让调用方的 .catch 报 "is not a function"，也不抛未捕获异常
  return new Promise((resolve) => {
    (async () => {
      try {
        const config = resolveConfig(configOverride);
        const hasWebSpeech = canUseWebSpeech();
        const hasRemote = Boolean(config.endpoint || config.apiKey);

        if (!hasRemote) {
          if (hasWebSpeech) {
            speakWithWebSpeech(cleaned, config, state, instance);
          } else {
            activeInstances.delete(instance);
          }
          resolve(instance);
          return;
        }

        state.abortController = new AbortController();
        state.timer = setTimeout(() => {
          instance.stop();
        }, TTS_TIMEOUT);

        const played = await playRemoteTTS(config, cleaned, state, instance);

        if (state.stopped) {
          resolve(instance);
          return;
        }

        if (!played && hasWebSpeech) {
          speakWithWebSpeech(cleaned, config, state, instance);
        } else if (!played) {
          activeInstances.delete(instance);
        }

        if (state.timer) {
          clearTimeout(state.timer);
          state.timer = null;
        }

        resolve(instance);
      } catch (error) {
        if (state.timer) {
          clearTimeout(state.timer);
          state.timer = null;
        }

        if (error?.name === 'AbortError') {
          resolve(instance);
          return;
        }

        if (canUseWebSpeech()) {
          speakWithWebSpeech(cleaned, resolveConfig(configOverride), state, instance);
          resolve(instance);
          return;
        }

        activeInstances.delete(instance);
        // 播放失败：安全 resolve（不 reject，避免未处理 rejection），仅 console.warn
        console.warn('[tts] play failed:', error?.message || error);
        resolve(instance);
      }
    })();
  });
}

export function stopAll() {
  const copies = [...activeInstances];
  for (const inst of copies) {
    inst.stop();
  }
  activeInstances.clear();
}

// 依赖：./storage.js(getData)
