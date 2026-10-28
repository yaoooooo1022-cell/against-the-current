/**
 * 自定义导航条
 * ------------------------------------------------------------
 * 为什么不用系统导航栏：
 *   系统导航栏在 iOS 上无法与页面内容做视觉统一（宣纸底 + 鎏金），
 *   也无法精确控制「内容行与右侧胶囊按钮居中对齐」。
 *   改成自定义后，状态栏高度 / 胶囊位置 / Home 指示条全部由 utils/layout.js 实测。
 *
 * 用法：<navbar title="角色图谱" left-text="兰香如故" />
 *   title      —— 居中标题
 *   left-text  —— 无返回键时左侧显示的品牌小字
 *   back       —— auto（默认，按页面栈自动判断）| always | none
 *   line       —— 是否显示底部发丝线
 *   bg         —— 自定义背景色，缺省用宣纸底
 * ------------------------------------------------------------
 */
const layout = require('../../utils/layout.js');

Component({
  options: {
    addGlobalClass: true,
    multipleSlots: true
  },

  properties: {
    title: { type: String, value: '' },
    leftText: { type: String, value: '' },
    sub: { type: String, value: '' },
    back: { type: String, value: 'auto' },   // auto | always | none
    bg: { type: String, value: '' },
    line: { type: Boolean, value: true }
  },

  data: {
    L: null,
    showBack: false
  },

  lifetimes: {
    attached() {
      this._apply();
    },
    show() {
      // 页面被重新显示时，页面栈可能已变化（如 redirectTo 后返回键状态不同）
      this._apply();
    }
  },

  methods: {
    _apply() {
      const L = layout.get();
      let showBack = false;
      if (this.data.back === 'always') {
        showBack = true;
      } else if (this.data.back === 'none') {
        showBack = false;
      } else {
        showBack = safePages() > 1;
      }
      if (!this.data.L || this.data.showBack !== showBack) {
        this.setData({ L: L, showBack: showBack });
      } else {
        this.setData({ L: L });
      }
    },

    onBack() {
      if (this._locked) return;
      this._locked = true;
      const self = this;
      setTimeout(() => { self._locked = false; }, 400);
      try {
        wx.navigateBack({
          fail: () => {
            // 兜底：没有上一级时就回主页，避免点了没反应
            try { wx.reLaunch({ url: '/pages/graph/graph' }); } catch (e) {}
          }
        });
      } catch (e) {}
      this.triggerEvent('back');
    }
  }
});

function safePages() {
  try {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    return pages.length;
  } catch (e) {
    return 1;
  }
}
