/**
 * 角色详情页
 * ------------------------------------------------------------
 * 入参：?id=<角色id>
 * 展示：角色基本信息 / 角色介绍 / 演员信息 / 人物关系 / 历史参考人物
 * ------------------------------------------------------------
 */
const db = require('../../utils/db.js');
const layout = require('../../utils/layout.js');

Page({
  data: {
    nav: {},
    id: '',
    char: null,
    relations: [],
    variantOfChar: null,     // 该条目是某个角色的少年/青年/成年版时的本体
    historical: null,        // 关联的历史参考人物
    actorWorks: [],
    notFound: false
  },

  onLoad(options) {
    layout.attach(this);

    const id = options.id || '';
    const raw = db.getCharacter(id);

    if (!raw) {
      this.setData({ id: id, notFound: true });
      wx.setNavigationBarTitle({ title: '角色详情' });
      return;
    }

    const char = db.decorate(raw);
    const relations = db.getRelations(id);
    const historical = raw.historicalId ? db.getHistorical(raw.historicalId) : null;
    const variantOfChar = raw.variantOf ? db.decorate(db.getCharacter(raw.variantOf)) : null;

    this.setData({
      id: id,
      char: char,
      relations: relations,
      historical: historical,
      variantOfChar: variantOfChar,
      actorWorks: db.getActorWorks(raw.actor)
    });

    wx.setNavigationBarTitle({ title: char.name });
  },

  /** 点击关系卡 → 跳到另一个角色 */
  onRelationTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    // 用 redirectTo 避免关系链层层堆栈（返回键体验更好）
    wx.redirectTo({ url: '/pages/character/character?id=' + id });
  },

  /** 点击头像本身 → 查看大图 */
  onAvatarTap() {
    const char = this.data.char;
    if (!char || !char.avatar) {
      wx.showToast({ title: '暂无剧照', icon: 'none' });
      return;
    }
    wx.previewImage({ urls: [char.avatar], current: char.avatar });
  },

  /** 跳转历史参考人物 */
  onHistoricalTap() {
    const h = this.data.historical;
    if (!h) return;
    wx.navigateTo({ url: '/pages/historical/historical?id=' + h.id });
  },

  onBackToGraph() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/graph/graph' })
    });
  },

  onShareAppMessage() {
    const char = this.data.char;
    return {
      title: char ? '《兰香如故》' + char.name + '（' + char.actor + ' 饰）' : '角色详情',
      path: '/pages/character/character?id=' + this.data.id
    };
  }
});
