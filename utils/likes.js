/**
 * 爱心支持 & 支持榜
 * ------------------------------------------------------------
 * 职责：记录「我支持了谁」，算出每个家族 / 角色的支持数，并提供排序。
 *
 * 数据诚实原则（与本项目一致）：
 *   本模块不预置、不伪造任何票数。计数只来自真实点击。
 *   未接云端时，榜上只会有本人的票（0 或 1），并明确标注为「本地榜」。
 *
 * 远端（全站榜）：
 *   通过 useRemote(adapter) 注入。
 *   adapter 需实现 pull() → Promise<{ id: count }> 与 push(id, liked) → Promise。
 *   接入方式见 utils/likes-cloud.js（微信云开发）。
 * ------------------------------------------------------------
 */

var MINE_KEY = 'lxrg_likes_v1';      // 我点过的目标：{ [id]: 1 }
var BOARD_KEY = 'lxrg_likes_board_v1'; // 远端返回的全站计数：{ [id]: n }

var _mine = null;
var _board = null;
var _remote = null;

/* ------------------------------ 本地读写 ------------------------------ */

function read(key) {
  try {
    return wx.getStorageSync(key) || null;
  } catch (e) {
    return null;
  }
}

function write(key, val) {
  try {
    wx.setStorageSync(key, val);
  } catch (e) {
    /* 存储失败不阻断交互 */
  }
}

function mine() {
  if (!_mine) _mine = read(MINE_KEY) || {};
  return _mine;
}

function board() {
  if (!_board) _board = read(BOARD_KEY) || {};
  return _board;
}

/* ------------------------------ 查询 ------------------------------ */

/** 当前模式：'local' 只统计本人 | 'cloud' 含全站 */
function mode() {
  return _remote ? 'cloud' : 'local';
}

/** 某目标的票数：本地票与全站票取较大者，避免云端回包前数字跳变 */
function count(id) {
  var local = mine()[id] ? 1 : 0;
  var remote = board()[id] || 0;
  return local > remote ? local : remote;
}

/** 我是否支持过 */
function isLiked(id) {
  return !!mine()[id];
}

/** 支持榜排序用的名次表：{ [id]: 1-based rank }，未上榜的为 0 */
function ranks(ids) {
  var sorted = ids.slice().sort(function (a, b) {
    return count(b) - count(a);
  });
  var map = {};
  for (var i = 0; i < sorted.length; i++) {
    map[sorted[i]] = count(sorted[i]) > 0 ? i + 1 : 0;
  }
  return map;
}

/* ------------------------------ 写入 ------------------------------ */

/**
 * 切换支持状态。
 * @returns {{ id, liked, count }}
 */
function toggle(id) {
  if (!id) return null;
  var m = mine();
  var liked = !m[id];
  if (liked) m[id] = 1;
  else delete m[id];
  write(MINE_KEY, m);

  var n = count(id);
  if (_remote && _remote.push) {
    // 异步直传，「我」的本地态立即生效，不用等回包
    _remote.push(id, liked).catch(function () {});
  }
  return { id: id, liked: liked, count: n };
}

/* ------------------------------ 给列表挂字段 ------------------------------ */

/**
 * 给家族 / 角色列表补上 likeCount、liked 字段
 * @param {Array} list
 * @param {string} key 取 id 的字段名，默认 'id'
 */
function attach(list, key) {
  var k = key || 'id';
  return list.map(function (x) {
    var id = x[k];
    return Object.assign({}, x, {
      likeCount: id ? count(id) : 0,
      liked: id ? isLiked(id) : false
    });
  });
}

/** 按支持数降序（稳定排序：同票保持原顺序） */
function sortByLikes(list) {
  return list
    .map(function (x, i) {
      return { x: x, i: i };
    })
    .sort(function (a, b) {
      var d = (b.x.likeCount || 0) - (a.x.likeCount || 0);
      return d !== 0 ? d : a.i - b.i;
    })
    .map(function (p) {
      return p.x;
    });
}

/* ------------------------------ 远端接入 ------------------------------ */

/** 注入远端适配器；传 null 则回到本地模式 */
function useRemote(adapter) {
  _remote = adapter || null;
  return mode();
}

/** 拉一次全站计数（未接远端时直接返回） */
function sync() {
  if (!_remote || !_remote.pull) return Promise.resolve(mode());
  return _remote
    .pull()
    .then(function (counts) {
      if (counts && typeof counts === 'object') {
        _board = counts;
        write(BOARD_KEY, counts);
      }
      return mode();
    })
    .catch(function () {
      return mode();
    });
}

module.exports = {
  mode: mode,
  count: count,
  isLiked: isLiked,
  ranks: ranks,
  toggle: toggle,
  attach: attach,
  sortByLikes: sortByLikes,
  useRemote: useRemote,
  sync: sync
};
