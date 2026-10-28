/**
 * 角色头像组件（三级兜底）
 * ------------------------------------------------------------
 * 加载优先级：
 *   1. properties.src      —— 主要角色的专属头像（本地 /images/characters/{id}.jpg 或远程 URL）
 *   2. properties.fallback —— 非主要角色按「性别 + 年龄段」共用的通用头像
 *   3. 内置姓氏印章        —— 上面都取不到时，用「角色名首字 + 家族主题色」生成
 *
 * 外部接口
 *   properties
 *     src       {String}  专属头像地址，可为空
 *     fallback  {String}  通用头像地址，可为空
 *     name      {String}  角色名（取首字作印章字）
 *     color     {String}  家族主题色，如 '#9C3D3D'
 *     soft      {String}  家族浅色（印章底）
 *     size      {String}  's' | 'm' | 'l'，默认 'm'
 *     badge     {String}  右下角角标文案（如「少年」「成年」），可空
 *   events
 *     bindtap  —— 点击头像（页面自行处理跳转）
 * ------------------------------------------------------------
 */
Component({
  properties: {
    src: { type: String, value: '' },
    fallback: { type: String, value: '' },
    name: { type: String, value: '' },
    color: { type: String, value: '#8C2B2B' },
    soft: { type: String, value: '#F7E7E4' },
    size: { type: String, value: 'm' },
    badge: { type: String, value: '' }
  },

  data: {
    srcFailed: false,
    fbFailed: false,
    initial: '',
    fg: '#8C2B2B'
  },

  observers: {
    'name, color': function (name, color) {
      this.setData({
        initial: (name || '?').charAt(0),
        fg: color || '#8C2B2B'
      });
    },
    src: function () {
      // src 变化时重置失败状态，允许换图重试
      if (this.data.srcFailed) this.setData({ srcFailed: false });
    },
    fallback: function () {
      if (this.data.fbFailed) this.setData({ fbFailed: false });
    }
  },

  methods: {
    onSrcError() {
      // 第 1 级失效 → 顺延到第 2 级 / 第 3 级
      this.setData({ srcFailed: true });
    },
    onFallbackError() {
      // 第 2 级也失效 → 落到姓氏印章
      this.setData({ fbFailed: true });
    },
    onTap() {
      this.triggerEvent('tap');
    }
  }
});
