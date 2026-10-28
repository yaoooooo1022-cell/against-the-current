/**
 * 家族 / 势力定义
 * ------------------------------------------------------------
 * 说明：本文件为《兰香如故》角色图谱的家族分组元数据。
 * 每条记录包含：
 *   id      家族唯一标识（与 characters.js 中的 family 字段对应）
 *   name    家族显示名
 *   tag     家族一句话定位
 *   color   家族主题色（用于头像描边、族谱连线、标签底色）
 *   soft    主题色的浅色版（用于标签底色 / 卡片底纹）
 *   motto   家族关键词（族谱区块右上角展示）
 *
 * 数据来源：腾讯视频 / 猫眼专业版 / 新浪娱乐公开剧集资料整理
 * 家族归属由公开资料推断，标注为「推断」的角色请在档案中核对。
 * ------------------------------------------------------------
 */
module.exports = [
  {
    id: 'shen',
    name: '沈家',
    tag: '大学士府 · 显赫书香',
    color: '#3E5C76',
    soft: '#E4EBF2',
    motto: '满门风骨'
  },
  {
    id: 'lin',
    name: '林家',
    tag: '吏部尚书府 · 江南世家',
    color: '#9C3D3D',
    soft: '#F7E7E4',
    motto: '簪缨望族'
  },
  {
    id: 'zhao',
    name: '赵家',
    tag: '御前新贵 · 朝堂新宠',
    color: '#B0821F',
    soft: '#F7EED8',
    motto: '炙手可热'
  },
  {
    id: 'xu',
    name: '许家',
    tag: '林府家奴 · 一诺千金',
    color: '#8A6A4A',
    soft: '#F1E9DE',
    motto: '微末之义'
  },
  {
    id: 'han',
    name: '韩家',
    tag: '寒门书香 · 才名在外',
    color: '#4F7942',
    soft: '#E6EFE2',
    motto: '清直自守'
  },
  {
    id: 'du',
    name: '杜家',
    tag: '寒门孤女 · 步步为营',
    color: '#7B5E7B',
    soft: '#F0E8F0',
    motto: '困兽之争'
  },
  {
    id: 'yuan',
    name: '永昌侯府',
    tag: '武将勋爵 · 海疆殉节',
    color: '#4A7C7C',
    soft: '#E4F0F0',
    motto: '忠勇传家'
  },
  {
    id: 'zheng',
    name: '显国公府',
    tag: '权臣勋爵 · 卖主求荣',
    color: '#6B5D4A',
    soft: '#F0EBE5',
    motto: '权柄难持'
  },
  {
    id: 'lu',
    name: '鲁家',
    tag: '七品小官 · 附逆破家',
    color: '#8A7B5C',
    soft: '#F0EDE5',
    motto: '贪嗔痴慢'
  },
  {
    id: 'royal',
    name: '宗室',
    tag: '天家贵胄 · 皇权倾轧',
    color: '#A63A2E',
    soft: '#F8E6E1',
    motto: '雷霆天威'
  },
  {
    id: 'other',
    name: '剧中其他角色',
    tag: '演员表角色 · 家族归属待补充',
    color: '#6B7280',
    soft: '#EDEFF2',
    motto: '众生相'
  }
];
