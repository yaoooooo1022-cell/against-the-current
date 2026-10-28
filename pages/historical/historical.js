/**
 * 历史参考人物详情页
 * ------------------------------------------------------------
 * 入参：?id=<historical.js 中的 id>
 * 展示：人物信息 / 生平 / 代表句 / 与剧中角色的对应说明
 * ------------------------------------------------------------
 */
const db = require('../../utils/db.js');
const layout = require('../../utils/layout.js');

Page({
  data: {
    nav: {},
    id: '',
    h: null,
    linkedChars: [],   // 关联到该历史人物的剧中角色
    notFound: false
  },

  onLoad(options) {
    layout.attach(this);

    const id = options.id || '';
    const h = db.getHistorical(id);

    if (!h) {
      this.setData({ id: id, notFound: true });
      return;
    }

    // 反向找：哪些剧中角色把 historicalId 指向了本历史人物
    const linkedChars = db
      .getCharacters()
      .filter((c) => c.historicalId === id)
      .map(db.decorate);

    this.setData({ id: id, h: h, linkedChars: linkedChars });
    wx.setNavigationBarTitle({ title: h.name });
  },

  onCharTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/character/character?id=' + id });
  },

  onBack() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/graph/graph' })
    });
  },

  onShareAppMessage() {
    const h = this.data.h;
    return {
      title: h ? '《兰香如故》历史参考人物 · ' + h.name : '历史参考人物',
      path: '/pages/historical/historical?id=' + this.data.id
    };
  }
});
