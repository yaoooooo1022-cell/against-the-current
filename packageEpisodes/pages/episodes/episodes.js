/**
 * 剧情介绍 · 分集剧情 / 礼学整理
 * ------------------------------------------------------------
 * 数据来源：data/episodes.js（经 utils/db.js 统一取数）
 * 结构：
 *   Tab 1 分集剧情 —— 逐集卡片（集号 / 剧情主线 / 关键词 / 剧情简介）
 *   Tab 2 礼学整理 —— 按分类归组的全部礼学条目（跨集汇总）
 * 两条线索平行，chips 随 Tab 切换：剧情侧跳集、礼学侧跳分类。
 * ------------------------------------------------------------
 */
const db = require('../../../utils/db.js');
const layout = require('../../../utils/layout.js');

Page({
  data: {
    nav: {},            // 适配：状态栏 / 胶囊 / 安全区
    tab: 'plot',        // plot | ritual
    episodes: [],
    chips: [],
    ritualGroups: [],   // [{ key, name, color, list: [{...ritual, epId, epLabel}] }]
    stats: {},
    notes: null,
    activeId: '',
    chipInto: ''        // chips 横向滚动条自动滚到该元素
  },

  // 各集相对页面顶部的位置，用于剧情侧滚动高亮
  _tops: [],
  // 吸顶栏实测高度（px），用于锚点跳转时留出让位空间
  _barH: 0,
  _swipe: null,
  _swipeLock: false,        // 手指落在横向 chips 上时，锁掉「左右滑动切 Tab」

  onLoad() {
    layout.attach(this);

    const episodes = db.getEpisodes();
    const cats = db.getRitualCategories();

    // 礼学整理：按分类把全部条目归组，并回填所属集
    const ritualGroups = cats
      .map((cat) => ({ key: cat.key, name: cat.name, color: cat.color, list: [] }));
    episodes.forEach((ep) => {
      (ep.rituals || []).forEach((r) => {
        const g = ritualGroups.filter((x) => x.key === r.category)[0];
        if (g) {
          g.list.push(Object.assign({}, r, {
            epId: ep.id,
            epLabel: ep.epLabel,
            epUnit: !!ep.unit
          }));
        }
      });
    });

    this.setData({
      episodes: episodes,
      chips: db.getEpisodeChips(),
      categories: cats,
      ritualGroups: ritualGroups.filter((g) => g.list.length),
      stats: db.getEpisodeStats(),
      notes: db.getEpisodeNotes(),
      activeId: episodes.length ? episodes[0].id : '',
      chipInto: episodes.length ? 'chip-' + episodes[0].id : ''
    });

    this.measure();
  },

  /** 量取吸顶栏高度 + 剧情侧各集区块位置（用于滚动高亮当前集） */
  measure() {
    const query = wx.createSelectorQuery();
    query.selectAll('.ep').boundingClientRect();
    query.select('.stickybar').boundingClientRect();
    query.selectViewport().scrollOffset();
    query.exec((res) => {
      const rects = res[0] || [];
      const bar = res[1] || {};
      const viewport = res[2] || {};
      this._barH = bar.height || 0;
      const base = viewport.scrollTop || 0;
      this._tops = rects.map((r) => base + r.top);
    });
  },

  /** 吸顶栏 + 自定义导航条的总让位高度（px） */
  _topGuard() {
    return this._barH + ((this.data.nav && this.data.nav.barH) || 0);
  },

  /** 锚点跳转的垂直让位：吸顶栏 + 导航条 + 一点余量（px，负数向上回退） */
  _offsetTop() {
    return -(this._topGuard() + 10);
  },

  onPageScroll(e) {
    if (this.data.tab !== 'plot' || !this._tops.length) return;
    const top = e.scrollTop + this._topGuard() + 48;
    let idx = 0;
    for (let i = 0; i < this._tops.length; i++) {
      if (this._tops[i] <= top) idx = i;
    }
    const id = this.data.episodes[idx] && this.data.episodes[idx].id;
    if (id && id !== this.data.activeId) this._setActive(id);
  },

  /** 同时更新「当前高亮」和「chips 自动滚动位置」 */
  _setActive(id) {
    if (!id) return;
    if (id === this.data.activeId && ('chip-' + id) === this.data.chipInto) return;
    this.setData({ activeId: id, chipInto: 'chip-' + id });
  },

  /** 阻止滑动 / 点击继续冒泡（chips 自己要横滑，不能触发外层切 Tab） */
  noop() {},

  /* ---------------------------- Tab 切换 ---------------------------- */

  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    const first = tab === 'plot'
      ? (this.data.episodes[0] || {}).id
      : (this.data.ritualGroups[0] || {}).key;
    this.setData({ tab: tab, activeId: first || '', chipInto: first ? 'chip-' + first : '' }, () => {
      wx.pageScrollTo({ scrollTop: 0, duration: 0 });
      this.measure();
    });
  },

  /** 从分集卡片上的「礼学考究 N 条」切到礼学整理 */
  onRitualTab() {
    const first = (this.data.ritualGroups[0] || {}).key || '';
    this.setData({ tab: 'ritual', activeId: first, chipInto: first ? 'chip-' + first : '' }, () => {
      wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    });
  },

  /* ---------------------------- 快捷跳转 ---------------------------- */

  /** 剧情侧：跳到指定集 */
  onJump(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.pageScrollTo({ selector: '#' + id, duration: 260, offsetTop: this._offsetTop() });
    this._setActive(id);
  },

  /** 剧情侧：跳到最新一集（原为「跳到后续单元」，分集补齐后改为末集） */
  onJumpLatest() {
    const list = this.data.episodes;
    if (!list.length) return;
    const last = list[list.length - 1];
    wx.pageScrollTo({ selector: '#' + last.id, duration: 260, offsetTop: this._offsetTop() });
    this._setActive(last.id);
    this.setData({ chipInto: 'chip-' + last.id });
  },

  /** 礼学侧：跳到指定分类 */
  onCatJump(e) {
    const key = e.currentTarget.dataset.id;
    if (!key) return;
    wx.pageScrollTo({ selector: '#cat-' + key, duration: 260, offsetTop: this._offsetTop() });
    this._setActive(key);
  },

  /** 礼学侧：点条目上的集数角标 → 回到分集剧情并定位到该集 */
  onRitualEpTap(e) {
    const epId = e.currentTarget.dataset.ep;
    if (!epId) return;
    this.setData({ tab: 'plot', activeId: epId, chipInto: 'chip-' + epId }, () => {
      wx.pageScrollTo({ selector: '#' + epId, duration: 260, offsetTop: this._offsetTop() });
    });
  },

  /* ---------------------------- 其他 ---------------------------- */

  /* ---------------------------- 左右滑动切 Tab ---------------------------- */

  /* chips 吸顶区在 swipearea 之外，理论上不会被外层手势捕获；
     但保留这个锁标记，万一以后调整结构也不会退化成「点不动」。 */
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
    if (Math.abs(dx) < 56) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (Date.now() - s.t > 900) return;

    const want = dx < 0 ? 'ritual' : 'plot';   // 左滑看礼学，右滑回剧情
    if (want === this.data.tab) return;
    const first = want === 'plot'
      ? (this.data.episodes[0] || {}).id
      : (this.data.ritualGroups[0] || {}).key;
    this.setData({ tab: want, activeId: first || '', chipInto: first ? 'chip-' + first : '' }, () => {
      wx.pageScrollTo({ scrollTop: 0, duration: 0 });
      this.measure();
    });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light', fail: () => {} });
  },

  onBack() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/graph/graph' })
    });
  },

  onShareAppMessage() {
    return {
      title: '《兰香如故》剧情介绍 · 礼学考究',
      path: '/packageEpisodes/pages/episodes/episodes'
    };
  },

  onShareTimeline() {
    return { title: '《兰香如故》剧情介绍 · 礼学考究' };
  }
});
