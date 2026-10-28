/**
 * 角色图谱主页
 * ------------------------------------------------------------
 * 两种视图：
 *   族谱  —— 按家族 + 辈分分层展示，头像节点 + 连线，点击进入角色详情
 *   全阵容 —— 演员表全景，支持关键词搜索（角色名 / 演员名 / 身份）
 *
 * 支持榜：家族卡与角色行均可点爱心支持，两种视图都能按支持数排序。
 *         计数逻辑见 utils/likes.js（未接云端时仅统计本人票数）。
 * ------------------------------------------------------------
 */
const db = require('../../utils/db.js');
const likes = require('../../utils/likes.js');
const layout = require('../../utils/layout.js');
const app = getApp();

Page({
  data: {
    drama: {},
    stats: {},

    /* 适配：状态栏 / 胶囊 / 安全区（详见 utils/layout.js） */
    nav: {},
    /* 分享卡实测尺寸（px），按屏幕高度自适应，不再写死 760rpx */
    card: { w: 310, h: 465 },

    tab: 'tree',            // tree | roster
    familyFilter: 'all',    // all | shen | lin | ...
    familyChips: [],
    chipInto: '',           // 家族 chips 自动滚动到该 id

    tree: [],
    roster: [],
    treeSort: 'default',    // default 辈分序 | likes 支持榜
    rosterSort: 'default',  // default 原始序 | likes 支持榜
    likeMode: 'local',      // local 只统计本人 | cloud 全站榜

    shareCard: null,        // 分享卡数据 { type:'family'|'char', id, name, sub, count }；null = 关闭

    keyword: '',
    results: [],
    searching: false
  },

  _searchTimer: null,
  _treeRaw: [],             // 未挂支持数 / 未排序的原始族谱
  _rosterRaw: [],
  _swipe: null,             // 左右滑动手势起点
  _swipeLock: false,        // 手指落在横向 chips 上时，锁掉「左右滑动切 Tab」

  onLoad() {
    const families = db.getFamilies().filter((f) => f.id !== 'other');

    const familyChips = [{ id: 'all', name: '全部家族', color: '#B08D57' }].concat(
      families.map((f) => ({ id: f.id, name: f.name, color: f.color }))
    );

    this._treeRaw = db.buildTree();
    this._rosterRaw = db.getAllForRoster();

    const nav = layout.get();

    this.setData({
      drama: app.globalData.drama,
      stats: db.getStats(),
      familyChips: familyChips,
      likeMode: likes.mode(),
      nav: nav,
      card: this._cardSize(nav)
    });

    this.refreshTree();
    this.refreshRoster();

    // 若已接云端，拉一次全站计数后刷新榜单
    likes.sync().then((mode) => {
      if (mode === 'cloud') {
        this.setData({ likeMode: mode });
        this.refreshTree();
        this.refreshRoster();
      }
    });
  },

  /**
   * 分享卡尺寸：固定 5:7.5（背景图 750×1125）比例，
   * 高度再按「屏幕高度 - 导航条 - 安全区」收上限，保证 iPhone SE ~ iPhone 15 Pro Max 都不出屏。
   */
  _cardSize(nav) {
    const w = Math.min(310, Math.max(240, nav.windowWidth - 40));
    const availH = Math.max(300, nav.windowHeight - nav.barH - nav.safeBottom - 48);
    const h = Math.max(360, Math.min(w * (1125 / 750), availH));
    return { w: Math.round(w), h: Math.round(h) };
  },

  /* ---------------------------- 支持榜 ---------------------------- */

  /** 给家族卡挂上支持数，并按当前排序模式输出 */
  refreshTree() {
    // 家族 id 同时作为支持目标的 key
    let list = likes.attach(this._treeRaw, 'fid');
    if (this.data.treeSort === 'likes') list = likes.sortByLikes(list);
    this.setData({ tree: list });
  },

  refreshRoster() {
    let list = likes.attach(this._rosterRaw, 'id');
    if (this.data.rosterSort === 'likes') list = likes.sortByLikes(list);
    this.setData({ roster: list });
  },

  /** 家族卡：点爱心支持该家族 */
  onLikeFamily(e) {
    const id = e.currentTarget.dataset.id;
    const r = likes.toggle(id);
    if (!r) return;
    this._patchLaid('tree', 'fid', id, r);
    if (r.liked) this._openShareCard('family', id);
  },

  /** 角色行：点爱心支持该角色 */
  onLikeChar(e) {
    const id = e.currentTarget.dataset.id;
    const r = likes.toggle(id);
    if (!r) return;
    this._patchLaid('roster', 'id', id, r);
    if (r.liked) this._openShareCard('char', id);
  },

  /* ---------------------------- 分享卡片 ---------------------------- */

  /**
   * 点爱心支持成功后弹出分享图。
   * 文案模板统一，差异仅在「吾为 XX 执灯」的 XX。
   */
  _openShareCard(type, id) {
    let name = '';
    let sub = '';
    let count = 0;

    if (type === 'family') {
      const node = this.data.tree.filter((n) => n.fid === id)[0];
      if (!node) return;
      name = node.family.name;
      sub = node.family.tag || '';
      count = node.likeCount;
    } else {
      const item = this.data.roster.filter((c) => c.id === id)[0];
      if (!item) return;
      name = item.name;
      sub = item.title || item.familyName || '';
      count = item.likeCount;
    }

    this.setData({
      shareCard: { type: type, id: id, name: name, sub: sub, count: count }
    });
  },

  onShareCardClose() {
    this.setData({ shareCard: null });
  },

  /** 阻止卡片内点击冒泡到遮罩层 */
  noop() {},

  /**
   * 只改这一个节点的 liked / likeCount，避免整棵族谱重新 setData。
   * 排序开启时再整体重排（由排序开关触发，属用户主动操作）。
   */
  _patchLaid(listKey, idKey, id, r) {
    const list = this.data[listKey];
    let idx = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i][idKey] === id) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;

    const patch = {};
    patch[listKey + '[' + idx + '].liked'] = r.liked;
    patch[listKey + '[' + idx + '].likeCount'] = r.count;
    this.setData(patch);

    if (wx.vibrateShort) wx.vibrateShort({ type: 'light', fail: () => {} });
  },

  /** 单按钮切换：默认序 ↔ 支持榜 */
  onSortToggle() {
    if (this.data.tab === 'tree') {
      const next = this.data.treeSort === 'likes' ? 'default' : 'likes';
      this.setData({ treeSort: next }, () => this.refreshTree());
    } else {
      const next = this.data.rosterSort === 'likes' ? 'default' : 'likes';
      this.setData({ rosterSort: next }, () => this.refreshRoster());
    }
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  /* ---------------------------- 视图切换 ---------------------------- */

  onTabChange(e) {
    this.switchTab(e.currentTarget.dataset.tab);
  },

  onFamilyFilter(e) {
    const id = e.currentTarget.dataset.id;
    // 过滤后重新构建原始数据，再补支持数
    this._treeRaw = db.buildTree({ familyId: id });
    // chips 自动把选中的家族滚到可视区（横向滑动条的直接拖动不被打断）
    this.setData({ familyFilter: id, chipInto: 'chip-' + id });
    this.refreshTree();
  },

  onShow() {
    // 从详情页返回时，存储里的支持态可能已被别处改动，重算一次
    if (this._treeRaw.length) {
      this.refreshTree();
      this.refreshRoster();
    }
  },

  /* ---------------------------- 左右滑动切 Tab ---------------------------- */
  /* iOS 上左右滑动返回手势与容器内横向滑动会冲突，这里只认「明显的水平位移」，
     并要求水平位移大于垂直位移，避免把上下滚动误判成切 Tab。 */

  /* chips 是横向滚动条：手指落在它上面时，锁掉外层的「左右滑动切 Tab」，
     否则横滑 chips 会顺带把整个视图切走（但不能用 catch，那会连点击一起吃掉）。 */
  onChipTouchStart() {
    this._swipeLock = true;
  },

  onChipTouchEnd() {
    this._swipeLock = false;
  },

  onSwipeStart(e) {
    if (this._swipeLock) return;
    const t = (e && e.touches && e.touches[0]) || {};
    this._swipe = { x: t.clientX || 0, y: t.clientY || 0, t: Date.now() };
  },

  onSwipeEnd(e) {
    const s = this._swipe;
    this._swipe = null;
    if (!s || this._swipeLock) return;
    const t = (e && e.changedTouches && e.changedTouches[0]) || {};
    const dx = (t.clientX || 0) - s.x;
    const dy = (t.clientY || 0) - s.y;
    if (Math.abs(dx) < 56) return;              // 位移太小
    if (Math.abs(dx) < Math.abs(dy) * 1.4) return; // 更像上下滚动
    if (Date.now() - s.t > 900) return;          // 拖太久不是轻扫

    const next = dx < 0 ? 'roster' : 'tree';     // 左滑看全阵容，右滑看族谱
    this.switchTab(next);
  },

  switchTab(tab) {
    if (tab === this.data.tab) return;
    this.setData({ tab: tab });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light', fail: () => {} });
  },

  /* ---------------------------- 搜索 ---------------------------- */

  onSearchInput(e) {
    const keyword = e.detail.value;
    this.setData({ keyword: keyword });

    if (this._searchTimer) clearTimeout(this._searchTimer);

    if (!keyword.trim()) {
      this.setData({ results: [], searching: false });
      return;
    }

    this.setData({ searching: true });
    // 简单防抖，避免每次输入都全量过滤
    this._searchTimer = setTimeout(() => {
      this.setData({ results: db.searchCharacters(keyword) });
    }, 180);
  },

  onClearSearch() {
    this.setData({ keyword: '', results: [], searching: false });
  },

  /* ---------------------------- 跳转 ---------------------------- */

  /** 点整块 Banner → 剧情介绍 / 礼学考究页（分包） */
  onBannerTap() {
    wx.navigateTo({
      url: '/packageEpisodes/pages/episodes/episodes',
      fail: (err) => {
        console.error('跳转失败', err);
        wx.showToast({ title: '页面跳转失败', icon: 'none' });
      }
    });
  },

  onMemberTap(e) {
    const id = e.currentTarget.dataset.id;
    this.gotoCharacter(id);
  },

  gotoCharacter(id) {
    if (!id) return;
    wx.navigateTo({
      url: '/pages/character/character?id=' + id,
      fail: (err) => {
        console.error('跳转失败', err);
        wx.showToast({ title: '页面跳转失败', icon: 'none' });
      }
    });
  },

  /* ---------------------------- 分享 ---------------------------- */

  onShareAppMessage() {
    // 有分享卡数据 → 用「吾为 XX 执灯」定制文案；否则用默认
    const sc = this.data.shareCard;
    if (sc) {
      const path = sc.type === 'char'
        ? '/pages/character/character?id=' + sc.id
        : '/pages/graph/graph';
      return {
        title: '吾为「' + sc.name + '」执灯 · 《兰香如故》角色图谱',
        path: path
      };
    }
    return {
      title: '《兰香如故》角色图谱 · 全阵容头像族谱',
      path: '/pages/graph/graph'
    };
  },

  onShareTimeline() {
    const sc = this.data.shareCard;
    if (sc) {
      return { title: '吾为「' + sc.name + '」执灯 · 《兰香如故》角色图谱' };
    }
    return { title: '《兰香如故》角色图谱 · 全阵容头像族谱' };
  },

  onUnload() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
  }
});
