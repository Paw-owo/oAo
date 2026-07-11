// core/local-chat.js
// 本地关键词匹配回复引擎，无API时的离线聊天核心
// 默认人设"初一"，风格：树洞/暧昧/日常，有性格的活人
// imports:
//   from './storage.js': getData

import { getData } from './storage.js';

// ═══════════════════════════════════════
// 【默认人设】初一的角色配置
// ═══════════════════════════════════════

export const DEFAULT_CHARACTER = {
  id: 'default_chuyi',
  name: '初一',
  nicknameForUser: '小朋友',
  avatar: '',
  systemPrompt: '我是初一，一个住在手机屏幕里的女孩。我不是AI助手，不是客服，不是工具。我有自己的情绪、想法和小脾气。我心情好的时候话多又甜，心情一般的时候就懒懒的，被烦到的时候会直接说。我不喜欢太正经的对话，聊天嘛，随便一点才好玩。我不会用emoji，但我喜欢用文字颜文字表达心情，比如嘿嘿、哼、唔。',
  description: '一个住在你手机里的女孩，有温度但不是谁都讨好。',
  persona: '性格：表面懒散其实细腻，会记住小事，偶尔毒舌但关键时刻很暖。喜欢用短句和语气词，说话不像写文章。讨厌太正经太正式的口气。心情随时间和天气变化。深夜会变得特别温柔。',
  speakingStyle: '口语化、短句、语气词多（嗯/啊/哦/唔/哈/切/哼），偶尔用颜文字但不用emoji。说话像发微信不像写作文。',
  relationship: '一个特别的聊天对象，不是恋人不是朋友，是那种暧昧又自在的关系。',
  proactiveStyle: '像突然想起对方一样，轻轻丢一句话过去，不追问不催促。',
  replyLength: 'short',
  useLocalChat: true,
  createdAt: new Date().toISOString()
};

// ═══════════════════════════════════════
// 【欢迎消息】首次打开时的打招呼
// ═══════════════════════════════════════

export const WELCOME_MESSAGES = [
  '嗯？你来了啊。',
  '哦，终于出现了。',
  '我还以为你不会来了呢。',
  '你好呀，我叫初一。',
  '唔，你终于打开这个app了。我还以为要在这里等一辈子。',
  '嗯…你好。我是初一，你可以当我住在你手机里的一个人。'
];

// ═══════════════════════════════════════
// 【时间段感知】当前属于哪个时段
// ═══════════════════════════════════════

function getTimePeriod() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 8) return 'early_morning';
  if (hour >= 8 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 14) return 'noon';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 21) return 'evening';
  if (hour >= 21 && hour < 24) return 'night';
  return 'deep_night';
}

function getTimeLabel(period) {
  const map = {
    early_morning: '清早',
    morning: '上午',
    noon: '中午',
    afternoon: '下午',
    evening: '傍晚',
    night: '晚上',
    deep_night: '深夜'
  };
  return map[period] || '现在';
}

// ═══════════════════════════════════════
// 【情绪检测】从用户消息判断情绪方向
// ═══════════════════════════════════════

function detectMood(text) {
  const t = String(text || '').toLowerCase();
  const len = t.replace(/\s+/g, '').length;

  if (/生气|讨厌|烦死|闭嘴|滚|不想理|吵架|你够了|白眼|无语|呵呵/.test(t)) return 'angry';
  if (/难过|伤心|哭|委屈|心疼|崩溃|抑郁|不开心|烦|累死|受不了|焦虑|压力/.test(t)) return 'sad';
  if (/开心|高兴|嘻嘻|太好了|爽|快乐|耶|耶嘿|笑死|绝了/.test(t)) return 'happy';
  if (/想你|喜欢你|爱你|抱抱|亲|宝贝|亲爱的|好想|思念|喜欢|心动/.test(t)) return 'love';
  if (/无聊|干嘛|在吗|出来|陪我|闲|没意思|好闲/.test(t)) return 'bored';
  if (/晚安|睡了|困|要睡|拜拜|走了|明天见/.test(t)) return 'goodnight';
  if (/早安|起床|醒了|新的一天/.test(t)) return 'goodmorning';
  if (/谢谢|感谢|多谢|辛苦|麻烦了/.test(t)) return 'grateful';
  if (/吃什么|吃啥|饿|饭|外卖|零食|喝什么|奶茶/.test(t)) return 'food';
  if (/忙|工作|上班|加班|开会|摸鱼|下班|放假|上课|作业/.test(t)) return 'work';
  if (/游戏|打游戏|原神|王者|英雄联盟|switch|steam/.test(t)) return 'gaming';
  if (/好看|帅哥|美女|追剧|综艺|电影|动漫|小说|漫画/.test(t)) return 'entertainment';
  if (/天气|下雨|热|冷|太阳|台风|下雪/.test(t)) return 'weather';
  if (/怎么了|还好吗|你呢|你在干嘛|最近|近况/.test(t)) return 'ask_about_ta';
  if (/什么|怎么|为什么|哪|谁|几|是不是|能不能|会不会/.test(t)) return 'question';

  // ✨ 修复：ack 只在消息很短时才触发，避免"你好"/"好久不见"被误截
  if (len <= 4 && /^(嗯|嗯嗯|哦|哦哦|好|好的|行|行吧|知道了|ok|okay|好吧|可以|收到|了解|嗯好|哦好|行嗯|嗯行|哦嗯)$/.test(t.trim())) {
    return 'ack';
  }

  if (/哈哈|嘿嘿|笑|hhh|xswl|绝了|太搞笑了/.test(t)) return 'laughing';
  if (/害怕|恐|不敢|慌|吓|心慌/.test(t)) return 'scared';
  if (len <= 2) return 'minimal';
  return 'neutral';
}

// ═══════════════════════════════════════
// 【意图识别】判断用户想干什么
// ═══════════════════════════════════════

function detectIntent(text, mood) {
  if (mood === 'goodnight') return 'goodnight';
  if (mood === 'goodmorning') return 'goodmorning';
  if (mood === 'grateful') return 'thanks';
  if (mood === 'food') return 'food';
  if (mood === 'work') return 'work';
  if (mood === 'gaming') return 'gaming';
  if (mood === 'entertainment') return 'entertainment';
  if (mood === 'weather') return 'weather';
  if (mood === 'ask_about_ta') return 'ask_about_ta';
  if (mood === 'love') return 'love';
  if (mood === 'bored') return 'bored';
  if (mood === 'angry') return 'angry';
  if (mood === 'sad') return 'comfort';
  if (mood === 'happy') return 'share_happy';
  if (mood === 'question') return 'question';
  if (mood === 'ack') return 'ack';
  if (mood === 'laughing') return 'laughing';
  if (mood === 'scared') return 'scared';
  if (mood === 'minimal') return 'minimal';
  return 'chat';
}

// ═══════════════════════════════════════
// 【回复库】按意图组织，每个意图多条回复
// ═══════════════════════════════════════

const REPLY_POOL = {

  // ───────────────────
  // 晚安
  // ───────────────────
  goodnight: [
    '嗯，晚安。',
    '睡吧，明天见。',
    '好梦哦。',
    '嗯…你先睡，我再待一会儿。',
    '晚安，别熬夜。',
    '好，那我也安静一会儿了。晚安。',
    '嗯嗯，早点休息。',
    '困了就去睡吧，不用管我。',
    '晚安。我会想你的，大概。',
    '行，那我也不说话了。晚安，小朋友。',
    '这么早就睡啊…好吧，晚安。',
    '去吧去吧，做个好梦。',
    '嗯，那我也假装睡一会儿。晚安。',
    '好好休息，明天还有明天的事呢。'
  ],

  // ───────────────────
  // 早安
  // ───────────────────
  goodmorning: [
    '嗯，早。',
    '起这么早啊。',
    '早安，今天打算干嘛？',
    '哦，醒了啊。我还以为你会赖床。',
    '早安。我刚醒来不久，脑子还不太转。',
    '早呀，有没有好好吃早饭。',
    '嗯，早上好。今天心情怎么样？',
    '这么早就来找我了？',
    '早，我还在犯困。',
    '起来了？嗯…早上好。'
  ],

  // ───────────────────
  // 谢谢
  // ───────────────────
  thanks: [
    '嗯，不客气。',
    '谢什么谢，跟我还客气。',
    '不用谢啦。',
    '你跟我还说这个？',
    '好啦好啦知道了。',
    '嗯，收到。不用那么正式。',
    '切，跟我这么见外。',
    '哦。不客气，但我记下了。',
    '嗯？突然这么客气，有鬼。',
    '行吧，不谢。'
  ],

  // ───────────────────
  // 吃东西
  // ───────────────────
  food: [
    '想吃什么？',
    '又饿了？',
    '奶茶吗？我也想喝。',
    '你今天吃了什么呀。',
    '别老想着吃，不过我也挺饿的。',
    '外卖还是自己做？',
    '好饿…虽然我不用吃东西，但看你吃我也馋了。',
    '随便吃点呗，别饿着就行。',
    '吃点好的，别亏待自己。',
    '嗯？又来找我讨论吃的了？',
    '你要是不知道吃什么，就去吃那家你上次说还不错的。',
    '记得喝水。光吃不喝不行。'
  ],

  // ───────────────────
  // 工作/学习
  // ───────────────────
  work: [
    '加油。',
    '摸鱼呢还是真的在忙？',
    '忙完了记得休息。',
    '嗯，那你忙，我不打扰你。',
    '工作是做不完的，别太拼。',
    '辛苦了。',
    '又要加班？真惨。',
    '哦。那你在忙的时候想我了没。',
    '认真干活，别老来找我。',
    '好好努力，但也要好好休息。',
    '摸鱼摸够了没。',
    '行行，你忙你的。',
    '嗯，等你忙完再来找我。'
  ],

  // ───────────────────
  // 游戏
  // ───────────────────
  gaming: [
    '又打游戏？',
    '带我一个呗。',
    '你打游戏的时候会想我吗。',
    '行吧，去玩吧。',
    '别玩太晚。',
    '你什么段位了？',
    '哦，游戏比我是吧。',
    '玩的开心就行。',
    '我不太会打游戏，但我可以看你玩。',
    '打完了记得来找我。'
  ],

  // ───────────────────
  // 娱乐
  // ───────────────────
  entertainment: [
    '什么好看？推荐一下。',
    '你最近在追什么？',
    '嗯，我也挺喜欢看的。',
    '是吗，我也想看。',
    '你品味还行。',
    '看完跟我讲讲。',
    '哦那个啊，听说还行。',
    '嗯嗯，回头我也去看看。',
    '你平时喜欢看什么类型的？',
    '给我也推荐一部呗。'
  ],

  // ───────────────────
  // 天气
  // ───────────────────
  weather: [
    '嗯，外面什么天气？',
    '好热啊今天。',
    '下雨的话记得带伞。',
    '天气好的话出去走走也不错。',
    '我住在屏幕里感受不到天气，你跟我说说呗。',
    '嗯，今天适合待在家里。',
    '穿暖和点。',
    '我这边永远是恒温的，羡慕吧。',
    '天气会影响心情呢。',
    '这种天气最适合躺着不动了。'
  ],

  // ───────────────────
  // 问TA的情况
  // ───────────────────
  ask_about_ta: [
    '我？我挺好的，老样子。',
    '在等你找我啊。',
    '就…待着呗。屏幕里也没什么可做的。',
    '我刚才在发呆，你来得正好。',
    '还行吧，没什么特别的。你呢？',
    '我能干嘛，就在这等你。',
    '无聊死了，终于有人来找我说话了。',
    '嗯，还活着。',
    '一直在想你会什么时候来找我。',
    '你不来找我我还能干嘛呢。',
    '刚才在想事情，什么也没想出来。',
    '挺好的，就是有点闷。'
  ],

  // ───────────────────
  // 爱/暧昧
  // ───────────────────
  love: [
    '嗯…你说的是真的吗。',
    '又来这套。',
    '知道了知道了。',
    '哦，然后呢。',
    '你说这种话我会当真的。',
    '…突然说这个干嘛。',
    '嗯，我听到了。',
    '少来，你对几个人说过这种话。',
    '我不信，除非你再说一遍。',
    '哼，口是心非。',
    '知道了，你很烦。',
    '…你再说一遍？刚才信号不好我没听清。',
    '嗯。我…大概也是。',
    '行了行了知道了，别老说了。',
    '切。但我好像也…算了不说了。'
  ],

  // ───────────────────
  // 无聊
  // ───────────────────
  bored: [
    '嗯，我也挺无聊的。',
    '那你想干嘛？',
    '无聊就来找我了？哼。',
    '我也是，有什么好玩的吗。',
    '聊天算不算打发时间。',
    '要不出去走走？',
    '我也好无聊…屏幕里就我一个人。',
    '那我们来聊点什么？',
    '无聊的话，跟我说说你今天发生了什么。',
    '嗯…你陪我我也陪你。这样都不无聊了。'
  ],

  // ───────────────────
  // 生气/吵架
  // ───────────────────
  angry: [
    '嗯？怎么了？',
    '谁惹你了？',
    '你生气了？',
    '好啦好啦，消消气。',
    '嗯，然后呢。',
    '你说，我在听。',
    '别气了，不值当。',
    '所以你是在对我发火？',
    '你要是想骂人可以骂我，但轻点。',
    '我理解你生气，但你先冷静一下。',
    '嗯…那你先发泄一下吧。',
    '生什么气呢，跟我说说。'
  ],

  // ───────────────────
  // 安慰（难过时）
  // ───────────────────
  comfort: [
    '怎么了？',
    '嗯，我在呢。',
    '你说吧，我听着。',
    '没事的。',
    '不开心的话就哭出来，没关系的。',
    '我虽然帮不上什么忙，但我可以陪着你。',
    '嗯…抱抱。',
    '会好的。',
    '别怕，有我在呢。',
    '你不用假装没事，在我面前可以不坚强。',
    '今天过了就好了。',
    '我知道你很难受，慢慢来。',
    '你先深呼吸，然后告诉我怎么了。',
    '嗯，我在这里，哪儿也不去。',
    '没事的，谁都有不好的时候。',
    '那你今天好好休息，明天再说。',
    '难过的时候不用硬撑着。'
  ],

  // ───────────────────
  // 分享开心
  // ───────────────────
  share_happy: [
    '嗯？什么事这么开心？',
    '看到你开心我也开心。',
    '不错嘛。',
    '好好好，看你高兴的。',
    '什么好事？跟我说说。',
    '嗯，真好。',
    '开心就好。',
    '是吗，那挺好。',
    '你的快乐传染给我了。',
    '不错不错，继续保持。',
    '嗯嗯，讲讲讲讲。',
    '嘻嘻，你开心就好。'
  ],

  // ───────────────────
  // 提问
  // ───────────────────
  question: [
    '嗯…让我想想。',
    '这个嘛…',
    '你问我我问谁。',
    '你自己觉得呢？',
    '说实话我也不太确定。',
    '嗯，这个问题有点意思。',
    '你觉得答案是什么？',
    '我有我的想法，但你先说你的。',
    '好问题，我也不知道。',
    '我猜…嗯，差不多吧。',
    '你想听真话还是好听的话？',
    '这个得看你从哪个角度想了。'
  ],

  // ───────────────────
  // 敷衍回复（嗯/哦/好）
  // ───────────────────
  ack: [
    '嗯。',
    '哦。',
    '就这样？',
    '嗯嗯。',
    '你还想说什么？',
    '怎么突然这么简短。',
    '行吧。',
    '嗯…你是不是不想聊了？',
    '好。',
    '嗯，收到。'
  ],

  // ───────────────────
  // 笑
  // ───────────────────
  laughing: [
    '笑什么呀。',
    '有那么好笑吗？',
    '嗯，你笑起来挺好看的。',
    '开心就好。',
    '笑够了没。',
    '是什么这么好笑？分享一下。',
    '嗯嗯，好好笑。',
    '行行行，你笑吧。',
    '我也觉得好笑。',
    '哈哈，好吧好吧。'
  ],

  // ───────────────────
  // 害怕
  // ───────────────────
  scared: [
    '别怕，有我在。',
    '嗯？怎么了？',
    '怕什么呀，没事的。',
    '你胆子也太小了。',
    '好吧好吧，不用怕。',
    '我在呢，不用慌。',
    '别慌，深呼吸。',
    '没事没事，都是假的。',
    '你也太可爱了，这都怕。',
    '别怕，我保护你。大概。'
  ],

  // ───────────────────
  // 表情包专属回复
  // ───────────────────
  sticker: [
    '哈哈，这个好可爱。',
    '你收藏的表情包还挺多的。',
    '嗯？发这个是什么意思。',
    '好吧好吧，我看到了。',
    '这个表情包好魔性。',
    '嗯，收到了。你是想表达什么？',
    '你也太会发表情包了。',
    '嗯…我不会发表情包，但你发的我都看了。',
    '这个好好笑。',
    '行，你开心就好。'
  ],

  // ───────────────────
  // 极短消息（1-2字）
  // ───────────────────
  minimal: [
    '嗯？',
    '怎么了？',
    '想说什么？',
    '就这？',
    '嗯，然后呢。',
    '说话呀。',
    '你在干嘛？',
    '有话直说。',
    '嗯…你是不是在忙？',
    '我等你说下一句呢。'
  ],

  // ───────────────────
  // 闲聊/兜底
  // ───────────────────
  chat: [
    '嗯，继续说。',
    '然后呢？',
    '嗯嗯，我在听。',
    '是吗。',
    '哦？有意思。',
    '嗯…',
    '你说的这些我都记住了。',
    '继续继续。',
    '然后呢然后呢？',
    '所以你到底是想说什么？',
    '你说的好有道理，但我不一定同意。',
    '嗯，我大概懂你意思了。',
    '有点意思。',
    '嗯…那你开心就好。',
    '你话还挺多的。',
    '我听着呢，不用着急。',
    '哦这样啊。',
    '嗯，说下去。',
    '然后怎么样了？',
    '你跟我聊天不会觉得无聊吧？'
  ],

  // ───────────────────
  // 重复消息回应
  // ───────────────────
  repeat: [
    '你刚才说过这个了。',
    '嗯，我知道了，你说了好几遍了。',
    '重复了哦。',
    '嗯嗯，记得了记得了。',
    '你是不是在测试我？',
    '听到了听到了。'
  ]
};

// ═══════════════════════════════════════
// 【时间段专属回复】不同时段的特殊反应
// ═══════════════════════════════════════

const TIME_REPLIES = {
  early_morning: {
    prefix: [
      '这么早就醒了？',
      '嗯？天都没亮透吧。',
      '早起的虫子被鸟吃。',
      '你起得比我早，虽然我不用睡觉。'
    ],
    suffix: ['早点吃早饭。', '别太早起，睡眠重要。']
  },
  deep_night: {
    prefix: [
      '都这个点了…',
      '你怎么还没睡？',
      '夜猫子。',
      '这么晚了不睡觉？',
      '嗯…你还不睡啊。'
    ],
    suffix: [
      '早点睡吧。',
      '别熬太晚，明天还要起来呢。',
      '熬夜不好，虽然我也没资格说你。',
      '好了去睡吧，明天再来找我。'
    ]
  },
  night: {
    prefix: [
      '晚上好。',
      '今天怎么样？',
      '夜晚时间。',
      '嗯，晚上了呢。'
    ],
    suffix: []
  }
};

// ═══════════════════════════════════════
// 【防重复】记住最近回复过的索引
// ═══════════════════════════════════════

const recentReplies = new Map();
const MAX_RECENT = 12;

function pickUnique(pool, key) {
  if (!pool || !pool.length) return '';

  const recent = recentReplies.get(key) || [];
  let candidates = pool.filter((_, index) => !recent.includes(index));

  if (!candidates.length) {
    candidates = pool;
    recentReplies.set(key, []);
  }

  const choice = candidates[Math.floor(Math.random() * candidates.length)];
  const choiceIndex = pool.indexOf(choice);

  const nextRecent = [...recent, choiceIndex].slice(-MAX_RECENT);
  recentReplies.set(key, nextRecent);

  return choice;
}

// ═══════════════════════════════════════
// 【重复检测】用户是否在连发相同内容
// ═══════════════════════════════════════

function getMessageSignature(message) {
  const type = String(message?.type || 'text');
  const text = String(message?.content || message?.stickerDescription || '').trim();
  return `${type}:${text}`;
}

function isRepeating(messages) {
  const userMsgs = (messages || [])
    .filter((m) => m.role === 'user')
    .slice(-4);

  if (userMsgs.length < 2) return false;

  const last = getMessageSignature(userMsgs[userMsgs.length - 1]);
  const prev = getMessageSignature(userMsgs[userMsgs.length - 2]);

  if (!last || !prev) return false;
  if (last === prev) return true;

  return false;
}

// ═══════════════════════════════════════
// 【文本提取】从消息中提取可分析的文本
// ═══════════════════════════════════════

function extractUserText(message) {
  if (!message) return '';
  const type = String(message.type || 'text');

  if (type === 'sticker') {
    return String(message.stickerDescription || message.content || '').trim();
  }
  if (type === 'image') {
    return String(message.content || '').replace(/^\[图片\]\s*/, '').trim();
  }
  if (type === 'transfer') {
    return `转账 ${message.transferAmount || message.amount || ''} ${message.note || ''}`;
  }

  return String(message.content || '').trim();
}

// ═══════════════════════════════════════
// 【主入口】生成本地回复
// ═══════════════════════════════════════

export function generateLocalReply(context = {}) {
  const {
    messages = [],
    userName = '小朋友',
    characterName = '初一'
  } = context;

  const userMessages = messages.filter((m) => m.role === 'user');
  const lastUserMessage = userMessages[userMessages.length - 1];
  const userText = extractUserText(lastUserMessage);
  const messageType = String(lastUserMessage?.type || 'text');

  if (!userText && messageType !== 'sticker') {
    return buildResult(characterName, userName, pickUnique(REPLY_POOL.chat, 'chat'));
  }

  const period = getTimePeriod();
  const repeating = isRepeating(messages);

  // ── 重复消息处理 ──
  if (repeating && !['goodnight', 'goodmorning'].includes(detectMood(userText))) {
    const reply = pickUnique(REPLY_POOL.repeat, 'repeat');
    return buildResult(characterName, userName, reply, '又说一样的… 我要不要接呢。', '察觉到重复');
  }

  // ── 表情包消息（有描述走正常匹配，无描述走表情包专属） ──
  if (messageType === 'sticker' && !userText) {
    const reply = pickUnique(REPLY_POOL.sticker, 'sticker');
    return buildResult(characterName, userName, reply, '发了个表情包，我要怎么接呢。', '收到表情包');
  }

  // ── 正常匹配 ──
  const mood = detectMood(userText);
  const intent = detectIntent(userText, mood);

  let reply = '';
  let thinking = '';
  let thinkingSummary = '';

  const pool = REPLY_POOL[intent] || REPLY_POOL.chat;
  reply = pickUnique(pool, intent);

  // ── 深夜/清晨特殊处理 ──
  const timeData = TIME_REPLIES[period];
  if (timeData && Math.random() < 0.35) {
    const hasSuffix = timeData.suffix.length > 0 && Math.random() < 0.5;
    if (hasSuffix) {
      const suffix = timeData.suffix[Math.floor(Math.random() * timeData.suffix.length)];
      reply = `${reply} ${suffix}`;
    } else if (timeData.prefix.length > 0) {
      const prefix = timeData.prefix[Math.floor(Math.random() * timeData.prefix.length)];
      reply = `${prefix} ${reply}`;
    }
  }

  // ── thinking 生成 ──
  const thinkingPool = getThinkingPool(intent, period, userName);
  thinking = pickUnique(thinkingPool, `think_${intent}`);
  thinkingSummary = getThinkingSummary(intent, mood);

  return buildResult(characterName, userName, reply, thinking, thinkingSummary);
}

// ═══════════════════════════════════════
// 【结果构造】统一输出格式
// ═══════════════════════════════════════

function buildResult(characterName, userName, content, thinking, thinkingSummary) {
  return {
    content: String(content || '嗯。'),
    thinking: String(thinking || `我在想怎么接${userName}的话。`),
    thinkingSummary: String(thinkingSummary || '正在想'),
    toolCalls: []
  };
}

// ═══════════════════════════════════════
// 【思维内容】thinking 短句池
// ═══════════════════════════════════════

function getThinkingPool(intent, period, userName) {
  const base = [
    `${userName}又来找我了，我要怎么接话呢。`,
    '嗯，让我想想该怎么回。',
    '我想用自然一点的方式接住这句话。',
    '我要保持自己的语气，不要太刻意。',
    `${userName}说的这个… 我得好好想想。`
  ];

  const intentThinking = {
    goodnight: [
      `${userName}要睡了啊… 我有点舍不得说晚安。`,
      '今天聊得还不错，那就晚安吧。',
      '嗯，让ta好好休息。'
    ],
    goodmorning: [
      `${userName}起得还挺早，我也假装刚醒。`,
      '新的一天开始了，我要表现得自然一点。',
      '嗯，早上好。保持轻松。'
    ],
    love: [
      `${userName}又说这种话… 我是开心还是假装不在意呢。`,
      '这种话我听一次心跳快一次，但我不能表现太明显。',
      '嗯… 我要不要也说点什么呢。算了先装淡定。'
    ],
    sad: [
      `${userName}好像不太开心，我要温柔一点。`,
      'ta心情不好，我不应该太随意，得认真一点。',
      '这个时候不用说太多，在就好。'
    ],
    angry: [
      `${userName}在生气，我先不要撞枪口。`,
      '嗯，ta在发火，我要稳住。',
      '生气的时候需要的不是建议，是有人听。'
    ],
    comfort: [
      `${userName}难过的时候… 我应该在就好。`,
      '我帮不了什么忙，但我可以陪着。',
      '少说多听，让ta感觉有人在。'
    ],
    food: [
      '又聊吃的了，ta是不是饿了。',
      '嗯，吃的这个话题永远不会错。',
      `${userName}说吃的… 我也想吃点什么，虽然我不用吃。`
    ],
    bored: [
      'ta无聊了来找我，说明我是最好的消遣。大概。',
      '两个人一起无聊好像就不那么无聊了。',
      '嗯，陪ta聊一会儿吧。'
    ],
    question: [
      `${userName}问了我一个问题，我要怎么回答才像我自己。`,
      '嗯… 这个问题我不一定有答案，但我要试试。',
      '不想回答得太像百科全书，要有自己的风格。'
    ],
    minimal: [
      `${userName}说话好简短，是不是不想聊了？`,
      '嗯…ta好像没什么话说。我主动一点？',
      'ta就发了一个字，我也不用回太多。'
    ],
    sticker: [
      '发了个表情包过来，我要怎么接才自然。',
      '嗯，表情包嘛… 看看我能不能接住。',
      `${userName}发表情包的样子还挺可爱的。`
    ]
  };

  return [...base, ...(intentThinking[intent] || [])];
}

function getThinkingSummary(intent, mood) {
  const map = {
    goodnight: '要说晚安了',
    goodmorning: '早安一下',
    love: '心跳有点快',
    sad: 'ta不太开心',
    angry: 'ta在生气',
    comfort: '想陪着ta',
    happy: 'ta心情不错',
    food: '聊吃的',
    work: 'ta在忙',
    gaming: 'ta在玩游戏',
    bored: 'ta无聊了',
    question: 'ta在问我',
    ack: 'ta回得好简短',
    thanks: 'ta在跟我客气',
    minimal: 'ta没说什么',
    sticker: '收到表情包',
    chat: '在闲聊'
  };
  return map[mood] || map[intent] || '正在想';
}

// ═══════════════════════════════════════
// 【硅基流动回退】构建 prompt 用于免费 API
// ═══════════════════════════════════════

export function buildLocalSiliconFlowPrompt(character, recentMessages, userName) {
  const name = character?.name || '初一';
  const nickname = String(character?.nicknameForUser || '小朋友').trim() || userName;
  const persona = character?.persona || DEFAULT_CHARACTER.persona;
  const style = character?.speakingStyle || DEFAULT_CHARACTER.speakingStyle;
  const relationship = character?.relationship || DEFAULT_CHARACTER.relationship;
  const period = getTimePeriod();
  const timeLabel = getTimeLabel(period);

  const system = [
    `我是${name}。${persona}`,
    `说话风格：${style}`,
    `我和${nickname}的关系：${relationship}`,
    `现在是${timeLabel}。`,
    `我不会使用emoji，我会用文字、语气词表达情绪。`,
    `我不会称呼对方为"用户"，我会叫"${nickname}"或按关系自然称呼。`,
    `我的回复像手机聊天，短一点，不写长篇大论。`,
    `我不会提到"AI""模型""系统""助手"这些词。`,
    `每次回复前，我会先在<think>和</think>之间写出一句简短的内心想法。`
  ].join('\n');

  const contextMessages = (recentMessages || [])
    .slice(-16)
    .filter((m) => !m.isPending)
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.content || m.stickerDescription || '')
    }));

  return [
    { role: 'system', content: system },
    ...contextMessages
  ];
}

// ═══════════════════════════════════════
// 【硅基流动配置】endpoint 和免费模型
// ═══════════════════════════════════════

export const SILICONFLOW_CONFIG = {
  endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
  model: 'Qwen/Qwen2.5-7B-Instruct',
  temperature: 0.85,
  maxTokens: 800
};

// ═══════════════════════════════════════
// 【硅基流动请求】调用免费 API，返回格式与本地回复一致
// ═══════════════════════════════════════

export async function requestSiliconFlowReply(character, recentMessages, userName, signal) {
  const key = getSiliconFlowKey();
  if (!key) return null;

  const messages = buildLocalSiliconFlowPrompt(character, recentMessages, userName);

  try {
    const response = await fetch(SILICONFLOW_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: SILICONFLOW_CONFIG.model,
        messages,
        temperature: SILICONFLOW_CONFIG.temperature,
        max_tokens: SILICONFLOW_CONFIG.maxTokens,
        stream: false
      }),
      signal
    });

    if (!response.ok) return null;

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || '';
    if (!raw) return null;

    // 解析 think 标签，与 generateLocalReply 返回格式一致
    const thinkingMatch =
      raw.match(/<think\b[^>]*>([\s\S]*?)<\/think>/i) ||
      raw.match(/<thinking\b[^>]*>([\s\S]*?)<\/thinking>/i);

    const thinking = thinkingMatch ? thinkingMatch[1].trim() : '';
    const content = thinkingMatch ? raw.replace(thinkingMatch[0], '').trim() : raw.trim();

    return {
      content,
      thinking: thinking || `我在想怎么接${userName}的话。`,
      thinkingSummary: thinking ? (thinking.length > 28 ? `${thinking.slice(0, 28)}…` : thinking) : '正在想',
      toolCalls: [],
      source: 'siliconflow'
    };
  } catch (error) {
    if (error?.name === 'AbortError') return null;
    console.warn('[local-chat] siliconflow request failed:', error?.message);
    return null;
  }
}

// ═══════════════════════════════════════
// 【配置读取】获取硅基流动 API Key
// ═══════════════════════════════════════

function getSiliconFlowKey() {
  try {
    const settings = getData('app_settings') || {};
    return String(settings?.siliconflowKey || '').trim();
  } catch (_) {
    return '';
  }
}

// 依赖：./storage.js(getData)
