/**
 * 预览稿生成器
 * ------------------------------------------------------------
 * 作用：读取小程序同一份数据（utils/db.js + data/*.js），
 *      渲染出可在浏览器直接打开的 preview.html，用于快速确认视觉与交互。
 *
 * 运行：node tools/build-preview.js
 * 说明：preview.html 是「预览产物」，不是交付物本体；
 *      交付物本体是本目录下的微信小程序工程。
 *      该文件已在 project.config.json 的 packOptions.ignore 中排除，不会打进小程序包。
 * ------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const db = require(path.join(root, 'utils', 'db.js'));

/* ---------------- 组装预览所需数据 ---------------- */

/**
 * 把本地图片读成 base64 data URI 内嵌进预览稿。
 * 原因：preview.html 会被托管在临时目录下，/images/... 绝对路径取不到；
 *       内嵌后预览稿完全自包含，单文件即可分发查看。
 */
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
function toDataURI(absPath) {
  if (!fs.existsSync(absPath)) return '';
  const ext = path.extname(absPath).toLowerCase();
  if (!MIME[ext]) return '';
  return 'data:' + MIME[ext] + ';base64,' + fs.readFileSync(absPath).toString('base64');
}

const IMG_DIR = path.join(root, 'images');

/* 图片只内嵌一份，用 key 引用，避免同一张图在族谱/全阵容/详情里重复出现导致体积爆炸 */
const avatars = {};    // 角色 id -> data URI
const generics = {};   // 'm-young' 等 -> data URI

const characters = db.getCharacters().map((c) => {
  const d = db.decorate(c);
  const uri = toDataURI(path.join(IMG_DIR, 'characters', c.id + '.jpg'));
  if (uri) avatars[c.id] = uri;
  let fallbackKey = '';
  if (d.fallback) {
    fallbackKey = path.basename(d.fallback, path.extname(d.fallback));
    if (!generics[fallbackKey]) {
      generics[fallbackKey] = toDataURI(path.join(root, d.fallback.replace(/^\//, '')));
    }
  }
  return Object.assign({}, d, {
    avatar: uri ? '__AV__' + c.id : '',
    fallback: fallbackKey ? '__GEN__' + fallbackKey : ''
  });
});

/* 礼学考究配图：与头像同理，只内嵌一份，前端按 key 取用 */
const ritualImages = {};
db.getEpisodes().forEach((e) => {
  (e.rituals || []).forEach((r) => {
    if (!r.image) return;
    const key = path.basename(r.image, path.extname(r.image));
    if (!ritualImages[key]) {
      ritualImages[key] = toDataURI(path.join(root, r.image.replace(/^\//, '')));
    }
  });
});

/* 分享卡片背景（中式美学 · 参考剧集主 KV 风格） */
const shareBgUri = toDataURI(path.join(root, 'images', 'share', 'bg.jpg'));

const payload = {
  drama: {
    title: '兰香如故',
    subTitle: '角色图谱 · 全阵容',
    year: '2026',
    genre: '古装 / 爱情',
    episodes: '47 集',
    premiered: '2026-09-11',
    channel: 'CCTV-8 · 腾讯视频',
    original: '改编自禾晏山小说《兰香缘》',
    crew: '总编剧 桐华 ｜ 导演 黄颖湘、陈丹',
    tagline: '从三等丫鬟到当家主母——把命运握在自己手里。'
  },
  stats: db.getStats(),
  familyChips: [{ id: 'all', name: '全部家族', color: '#B08D57' }].concat(
    db.getFamilies()
      .filter((f) => f.id !== 'other')
      .map((f) => ({ id: f.id, name: f.name, color: f.color }))
  ),
  tree: db.buildTree(),
  roster: db.getAllForRoster().map((c) => {
    const found = characters.filter((x) => x.id === c.id)[0] || c;
    return found;
  }),
  characters: characters,
  avatars: avatars,
  generics: generics,
  ritualImages: ritualImages,
  shareBg: shareBgUri,
  historical: db.getAllHistorical(),
  actorWorks: {},

  /* 分集介绍 · 礼学考究 */
  episodes: db.getEpisodes(),
  episodeChips: db.getEpisodeChips(),
  episodeCategories: db.getRitualCategories(),
  episodeStats: db.getEpisodeStats(),
  episodeNotes: db.getEpisodeNotes()
};

// 演员代表作
const actorNames = {};
characters.forEach((c) => (actorNames[c.actor] = true));
Object.keys(actorNames).forEach((a) => {
  const w = db.getActorWorks(a);
  if (w && w.length) payload.actorWorks[a] = w;
});

// 族谱节点也用内嵌图（buildTree 里是 /images/... 本地路径，浏览器取不到）
payload.tree.forEach((node) => {
  node.generations.forEach((g) => {
    g.branches.forEach((br) => {
      br.members = br.members.map((m) => {
        const found = characters.filter((x) => x.id === m.id)[0];
        return found || m;
      });
    });
  });
  (node.servants || []).forEach((sg) => {
    sg.members = sg.members.map((m) => {
      const found = characters.filter((x) => x.id === m.id)[0];
      return found || m;
    });
  });
});

/* ---------------- 注入模板 ---------------- */

const tplPath = path.join(__dirname, 'preview-template.html');
const outPath = path.join(root, 'preview.html');

const tpl = fs.readFileSync(tplPath, 'utf8');

if (tpl.indexOf('__DATA_JSON__') === -1) {
  console.error('✗ 模板缺少 __DATA_JSON__ 占位符，已中止');
  process.exit(1);
}

const json = JSON.stringify(payload)
  // 防止内容里出现 </script> 提前闭合脚本
  .replace(/<\//g, '<\\/')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

fs.writeFileSync(outPath, tpl.replace('__DATA_JSON__', json), 'utf8');

/* ---------------- 输出统计 ---------------- */

const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log('✓ 已生成 preview.html');
console.log('  角色总数：' + payload.stats.charCount);
console.log('  家族数：' + payload.stats.familyCount);
console.log('  演员数：' + payload.stats.actorCount);
console.log('  有介绍的角色：' + payload.stats.withIntro);
console.log('  历史参考人物：' + payload.stats.historicalCount);
console.log('  族谱家族块：' + payload.tree.length);
console.log('  分集详介：' + payload.episodeStats.episodeCount + ' 集 / 剧情单元 ' + payload.episodeStats.unitCount + ' 个');
console.log('  礼学条目：' + payload.episodeStats.ritualCount + ' 条（含配图 ' + payload.episodeStats.imageCount + ' 张）');
console.log('  文件大小：' + kb + ' KB');
