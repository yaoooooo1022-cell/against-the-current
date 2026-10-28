/**
 * 数据访问层（纯本地数据，无需网络 / 云开发）
 * ------------------------------------------------------------
 * 页面统一通过这里取数，后续若改为云开发，只需替换本文件的实现。
 * ------------------------------------------------------------
 */
const CHARACTERS = require('../data/characters.js');
const FAMILIES = require('../data/families.js');
const HISTORICAL = require('../data/historical.js');
const ACTORS = require('../data/actors.js');
const GENDER_DATA = require('../data/genders.js');
const EPISODE_DATA = require('../data/episodes.js');

const EPISODES = EPISODE_DATA.EPISODES;
const RITUAL_CATEGORIES = EPISODE_DATA.EPISODE_RITUAL_CATEGORIES;
const EPISODE_PARTS = EPISODE_DATA.EPISODE_PARTS;
const EPISODE_NOTES = EPISODE_DATA.EPISODE_NOTES;

const GENDER = GENDER_DATA.GENDER;
const AGE_OVERRIDE = GENDER_DATA.AGE_OVERRIDE;

/** 主要角色（逐张生成头像的层级） */
const MAIN_ROLES = ['lead', 'major', 'support'];

/** 通用头像：性别 + 年龄段（共 6 张，非主要角色共用） */
const GENERIC_AVATAR = {
  'm-young': '/images/generic/m-young.png',
  'm-middle': '/images/generic/m-middle.png',
  'm-old': '/images/generic/m-old.png',
  'f-young': '/images/generic/f-young.png',
  'f-middle': '/images/generic/f-middle.png',
  'f-old': '/images/generic/f-old.png'
};

const GEN_LABEL = {
  1: '第 一 代 · 祖辈',
  2: '第 二 代 · 父辈',
  3: '第 三 代 · 主辈',
  4: '第 四 代 · 晚辈'
};

const ROLE_LABEL = {
  lead: '领衔主演',
  major: '主要演员',
  support: '主要配角',
  minor: '参演'
};

/* ------------------------------ 基础查询 ------------------------------ */

function getFamilies() {
  return FAMILIES;
}

function getFamily(id) {
  return FAMILIES.filter((f) => f.id === id)[0] || null;
}

/** 全部角色（原始顺序） */
function getCharacters() {
  return CHARACTERS;
}

function getCharacter(id) {
  return CHARACTERS.filter((c) => c.id === id)[0] || null;
}

function getHistorical(id) {
  return HISTORICAL.filter((h) => h.id === id)[0] || null;
}

function getAllHistorical() {
  return HISTORICAL;
}

/** 演员代表作 */
function getActorWorks(actor) {
  return (ACTORS[actor] && ACTORS[actor].works) || [];
}

/* ------------------------------ 分集 / 礼学 ------------------------------ */

/** 礼学分类字典（带主色） */
function getRitualCategories() {
  return Object.keys(RITUAL_CATEGORIES).map(function (k) {
    return RITUAL_CATEGORIES[k];
  });
}

/**
 * 给分集条目补齐展示字段：
 *   partLabel / epLabel / rituals[].catName / rituals[].catColor / ritualCount
 */
function decorateEpisode(e) {
  if (!e) return null;
  const part = EPISODE_PARTS[e.part] || {};
  const rituals = (e.rituals || []).map(function (r) {
    const cat = RITUAL_CATEGORIES[r.category] || {};
    return Object.assign({}, r, {
      catName: cat.name || '其他',
      catColor: cat.color || '#6B7280'
    });
  });
  return Object.assign({}, e, {
    partLabel: part.label || '',
    partRange: part.range || '',
    epLabel: e.epLabel || '第 ' + e.ep + ' 集',
    rituals: rituals,
    ritualCount: rituals.length
  });
}

/** 全部分集（含后续剧情单元），按集数升序 */
function getEpisodes() {
  return EPISODES.slice()
    .sort(function (a, b) {
      return (a.ep || 0) - (b.ep || 0);
    })
    .map(decorateEpisode);
}

/** 单个分集 */
function getEpisode(id) {
  return decorateEpisode(EPISODES.filter(function (e) { return e.id === id; })[0] || null);
}

/** 顶部快捷跳转条（只列真正有分集正文的，不列后续单元） */
function getEpisodeChips() {
  return getEpisodes()
    .filter(function (e) { return !e.unit; })
    .map(function (e) {
      return { id: e.id, label: e.epLabel || ('第 ' + e.ep + ' 集'), title: e.title };
    });
}

/** 分集页统计 */
function getEpisodeStats() {
  const list = getEpisodes();
  let ritualCount = 0;
  let imageCount = 0;
  const terms = {};
  list.forEach(function (e) {
    (e.rituals || []).forEach(function (r) {
      ritualCount += 1;
      terms[r.term] = true;
      if (r.image) imageCount += 1;
    });
  });
  return {
    episodeCount: list.filter(function (e) { return !e.unit; }).length,
    unitCount: list.filter(function (e) { return e.unit; }).length,
    ritualCount: ritualCount,
    imageCount: imageCount,
    termCount: Object.keys(terms).length
  };
}

/** 说明文案 */
function getEpisodeNotes() {
  return EPISODE_NOTES;
}

/* ------------------------------ 增强 / 装饰 ------------------------------ */

/** 取角色性别：'m' | 'f' | ''（未标注） */
function resolveGender(id) {
  return GENDER[id] || '';
}

/**
 * 取年龄段：child | young | middle | old
 * 优先用 genders.js 的覆盖值，否则按辈分推定（1 祖辈→old，2 父辈→middle，3/4→young）
 */
function resolveAge(id, gen) {
  if (AGE_OVERRIDE[id]) return AGE_OVERRIDE[id];
  if (gen === 1) return 'old';
  if (gen === 2) return 'middle';
  return 'young';
}

/** 该角色是否为「逐张生成头像」的主要角色 */
function isMainRole(role) {
  return MAIN_ROLES.indexOf(role) > -1;
}

/** 通用头像路径（儿童统一用青年形象，减少资源数） */
function resolveGenericAvatar(gender, age) {
  if (!gender) return '';
  const a = age === 'child' ? 'young' : age || 'young';
  return GENERIC_AVATAR[gender + '-' + a] || '';
}

/** 给角色补充展示用字段：首字、家族色、辈分文案、身份文案、头像地址 */
function decorate(c) {
  if (!c) return null;
  const fam = getFamily(c.family);
  const gender = resolveGender(c.id);
  const age = resolveAge(c.id, c.gen);

  return Object.assign({}, c, {
    initial: (c.name || '?').charAt(0),
    familyName: fam ? fam.name : '未归类',
    familyColor: fam ? fam.color : '#6B7280',
    familySoft: fam ? fam.soft : '#EDEFF2',
    genLabel: GEN_LABEL[c.gen] || '未分辈',
    roleLabel: ROLE_LABEL[c.role] || '',
    hasIntro: !!(c.intro && c.intro.length),

    gender: gender,
    genderLabel: gender === 'm' ? '男' : gender === 'f' ? '女' : '未标注',
    age: age,

    /**
     * 头像三级兜底约定（配合 components/avatar 使用）：
     *   第 1 级 avatar   —— 主要角色指向 /images/characters/{id}.jpg（远程 URL 亦可，在数据里显式写 avatar 即可覆盖）
     *   第 2 级 fallback —— 非主要角色按「性别 + 年龄段」共用通用头像
     *   第 3 级（组件内置）—— 上面都取不到时，降级为「姓氏印章」头像
     */
    avatar: c.avatar || (isMainRole(c.role) ? '/images/characters/' + c.id + '.jpg' : ''),
    fallback: c.fallback || resolveGenericAvatar(gender, age)
  });
}

/* ------------------------------ 搜索 ------------------------------ */

function searchCharacters(keyword) {
  const kw = (keyword || '').trim();
  if (!kw) return [];
  const lower = kw.toLowerCase();
  return CHARACTERS.filter((c) => {
    return (
      (c.name && c.name.indexOf(kw) > -1) ||
      (c.alias && c.alias.indexOf(kw) > -1) ||
      (c.actor && c.actor.indexOf(kw) > -1) ||
      (c.title && c.title.indexOf(kw) > -1) ||
      (c.name && c.name.toLowerCase().indexOf(lower) > -1)
    );
  }).map(decorate);
}

/* ------------------------------ 关系 ------------------------------ */

/**
 * 取某角色的人物关系
 * @returns [{ char, label }]
 */
function getRelations(id) {
  const c = getCharacter(id);
  if (!c || !c.relations) return [];
  return c.relations
    .map((r) => {
      const target = getCharacter(r.id);
      return target ? { char: decorate(target), label: r.label } : null;
    })
    .filter(Boolean);
}

/** 反向关系：谁与某人有关联 */
function getBacklinks(id) {
  return CHARACTERS.filter((c) =>
    (c.relations || []).some((r) => r.id === id)
  ).map(decorate);
}

/* ------------------------------ 族谱构建 ------------------------------ */

/**
 * 构建族谱结构
 * @returns [{ family, generations: [{ gen, label, members: [] }], memberCount }]
 * 说明：少年 / 青年 / 成年版本（variantOf 非空）不进入族谱，避免重复；
 *       仆从（gen = 0）不进辈分层，单独放「府中仆从」段。
 *       每一代内部按 branch（大房/二房）分组，夫妻妾排在一起。
 */
function buildTree(opts) {
  const options = opts || {};
  const onlyFamily = options.familyId || 'all';

  return FAMILIES.filter((f) => f.id !== 'other')
    .filter((f) => onlyFamily === 'all' || f.id === onlyFamily)
    .map((family) => {
      const allInFam = CHARACTERS.filter(
        (c) => c.family === family.id && !c.variantOf
      );
      const familyMembers = allInFam.filter((c) => c.gen > 0);
      const servants = allInFam.filter((c) => c.gen === 0);

      /* 每一代按 branch 分组 */
      var gens = [];
      [1, 2, 3, 4].forEach(function (g) {
        var genList = familyMembers.filter(function (c) { return c.gen === g; });
        if (!genList.length) return;

        var branchMap = {};
        var branchOrder = [];
        genList.forEach(function (m) {
          var b = m.branch || '';
          if (!branchMap[b]) {
            branchMap[b] = [];
            branchOrder.push(b);
          }
          branchMap[b].push(decorate(m));
        });

        var branches = branchOrder.map(function (b) {
          return { branch: b, members: branchMap[b] };
        });

        gens.push({ gen: g, label: GEN_LABEL[g], branches: branches });
      });

      /* 仆从按 servantRole 分组 */
      var roleMap = {};
      var roleOrder = [];
      servants.forEach(function (m) {
        var r = m.servantRole || '仆从';
        if (!roleMap[r]) {
          roleMap[r] = [];
          roleOrder.push(r);
        }
        roleMap[r].push(decorate(m));
      });
      var servantGroups = roleOrder.map(function (r) {
        return { role: r, members: roleMap[r] };
      });

      return {
        fid: family.id,
        family: family,
        generations: gens,
        servants: servantGroups,
        memberCount: familyMembers.length,
        servantCount: servants.length
      };
    })
    .filter(function (node) { return node.memberCount > 0 || node.servantCount > 0; });
}

/** 未归入家族的「剧中其他角色」，用于全阵容列表 */
function getUngrouped() {
  return CHARACTERS.filter((c) => c.family === 'other').map(decorate);
}

/** 全阵容（按 领衔 → 主要 → 配角 → 参演 排序），用于全阵容 Tab */
function getAllForRoster() {
  const weight = { lead: 0, major: 1, support: 2, minor: 3 };
  return CHARACTERS.slice()
    .sort((a, b) => {
      const d = (weight[a.role] || 9) - (weight[b.role] || 9);
      return d !== 0 ? d : CHARACTERS.indexOf(a) - CHARACTERS.indexOf(b);
    })
    .map(decorate);
}

/* ------------------------------ 统计 ------------------------------ */

function getStats() {
  const families = FAMILIES.filter((f) => f.id !== 'other');
  const cast = {};
  CHARACTERS.forEach((c) => {
    cast[c.actor] = true;
  });
  /* 礼学词条数：首页 banner 展示用（历史参考目前仅 1 条，展示价值低） */
  const ritualStats = getEpisodeStats();
  return {
    charCount: CHARACTERS.length,
    familyCount: families.filter(
      (f) => CHARACTERS.some((c) => c.family === f.id)
    ).length,
    actorCount: Object.keys(cast).length,
    historicalCount: HISTORICAL.length,
    ritualCount: ritualStats.ritualCount,
    termCount: ritualStats.termCount,
    withIntro: CHARACTERS.filter((c) => c.intro).length
  };
}

module.exports = {
  GEN_LABEL,
  ROLE_LABEL,
  MAIN_ROLES,
  getFamilies,
  getFamily,
  getCharacters,
  getCharacter,
  getHistorical,
  getAllHistorical,
  getActorWorks,
  decorate,
  resolveGender,
  resolveAge,
  isMainRole,
  searchCharacters,
  getRelations,
  getBacklinks,
  buildTree,
  getUngrouped,
  getAllForRoster,
  getStats,
  getRitualCategories,
  getEpisodes,
  getEpisode,
  getEpisodeChips,
  getEpisodeStats,
  getEpisodeNotes
};
