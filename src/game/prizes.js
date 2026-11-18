// =============================================================
// 景品の一覧と抽選・絵
// 5カテゴリー×9品。★1〜★5（各カテゴリーで★1〜★4が2品ずつ、★5が1品）
// 景品はステージの★レベル（ステージ1＝★1 … ステージ5＝★5、6でまた★1）の品からランダムに選ぶ
// 絵は画像ファイルを使わず、canvas にプログラムで描く（paintPrize → prizeArt.js）
// 商品名は一般名だけ（実在のブランド名は使わない）
// =============================================================
import { paintArt } from './prizeArt.js';

export const MAX_STARS = 5;
export const DUP_POINTS = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };   // ダブりでもらえるポイント（★の数）。交換などの使い道は未定

// shape：絵の形 / c：主な色 / c2：差し色 / label：絵の中のラベル文字
export const CATEGORIES = [
  {
    id: 'sweets', name: 'お菓子', color: '#ff8fb1',
    items: [
      { id: 'chips', name: 'ポテトチップス', rarity: 1, shape: 'bag', c: '#f4c430', c2: '#d9481c' , label: 'ポテト' },
      { id: 'choco', name: 'チョコレート', rarity: 2, shape: 'bar', c: '#6b3a1f', c2: '#c0392b' },
      { id: 'cookie', name: 'クッキー', rarity: 2, shape: 'cookie', c: '#d9a35b', c2: '#5a3416' },
      { id: 'candy', name: 'キャンディ', rarity: 1, shape: 'candy', c: '#ff5e8a', c2: '#ffd1dc' },
      { id: 'gummy', name: 'グミ', rarity: 3, shape: 'jar', c: '#ffffff', c2: '#ff6b6b' },
      { id: 'senbei', name: 'せんべい', rarity: 3, shape: 'senbei', c: '#c98a3f', c2: '#1e3a1e' },
      { id: 'donut', name: 'ドーナツ', rarity: 4, shape: 'donut', c: '#d9a35b', c2: '#ff8fb1' },
      { id: 'shortcake', name: 'ショートケーキ', rarity: 4, shape: 'cake', c: '#fff6e8', c2: '#e8263c' },
      { id: 'chocoset', name: '高級チョコ詰め合わせ', rarity: 5, shape: 'gift', c: '#3b1f12', c2: '#d4af37' }
    ]
  },
  {
    id: 'goods', name: '生活雑貨', color: '#7fb8ff',
    items: [
      { id: 'tissue', name: 'ティッシュ', rarity: 1, shape: 'tissue', c: '#8ec5ff', c2: '#ffffff' },
      { id: 'toilet', name: 'トイレットペーパー', rarity: 1, shape: 'roll', c: '#ffffff', c2: '#cfd8e3' },
      { id: 'toothbrush', name: '歯ブラシ', rarity: 2, shape: 'toothbrush', c: '#3fa7ff', c2: '#ffffff' },
      { id: 'detergent', name: '洗剤', rarity: 2, shape: 'detergent', c: '#2ecc71', c2: '#ffffff' },
      { id: 'mug', name: 'マグカップ', rarity: 3, shape: 'mug', c: '#ff7a59', c2: '#ffffff' },
      { id: 'towel', name: 'タオル', rarity: 3, shape: 'towel', c: '#ffd166', c2: '#ffffff' },
      { id: 'umbrella', name: '傘', rarity: 4, shape: 'umbrella', c: '#5b6cff', c2: '#2b2b2b' },
      { id: 'clock', name: '目覚まし時計', rarity: 4, shape: 'clock', c: '#e74c3c', c2: '#ffffff' },
      { id: 'kettle', name: '電気ケトル', rarity: 5, shape: 'kettle', c: '#ecf0f1', c2: '#2c3e50' }
    ]
  },
  {
    id: 'produce', name: '野菜・果物', color: '#7ed957',
    items: [
      { id: 'carrot', name: 'にんじん', rarity: 1, shape: 'carrot', c: '#ff8c1a', c2: '#3cb043' },
      { id: 'tomato', name: 'トマト', rarity: 2, shape: 'round', c: '#e8263c', c2: '#3cb043' },
      { id: 'onion', name: 'たまねぎ', rarity: 1, shape: 'onion', c: '#c98a3f', c2: '#8a5a2b' },
      { id: 'potato', name: 'じゃがいも', rarity: 2, shape: 'potato', c: '#c9a26b', c2: '#8a6a3f' },
      { id: 'apple', name: 'りんご', rarity: 3, shape: 'apple', c: '#d62828', c2: '#3cb043' },
      { id: 'banana', name: 'バナナ', rarity: 3, shape: 'banana', c: '#ffd93b', c2: '#7a5a1a' },
      { id: 'grape', name: 'ぶどう', rarity: 4, shape: 'grape', c: '#7b3fa0', c2: '#3cb043' },
      { id: 'melon', name: 'メロン', rarity: 4, shape: 'melon', c: '#9ccf5a', c2: '#e8f5d0' },
      { id: 'fruitbasket', name: 'フルーツ盛り合わせ', rarity: 5, shape: 'basket', c: '#c98a3f', c2: '#d62828' }
    ]
  },
  {
    id: 'drinks', name: '飲料', color: '#5fd3e8',
    items: [
      { id: 'tea', name: 'お茶', rarity: 1, shape: 'pet', c: '#3f8f3f', c2: '#d8f0c0' , label: 'お茶' },
      { id: 'water', name: '水', rarity: 1, shape: 'pet', c: '#3fa7ff', c2: '#e8f6ff' , label: '天然水' },
      { id: 'coffee', name: '缶コーヒー', rarity: 2, shape: 'can', c: '#6b3a1f', c2: '#f0e0c8' , label: 'COFFEE' },
      { id: 'orange', name: 'オレンジジュース', rarity: 2, shape: 'carton', c: '#ff9f1a', c2: '#ffffff' , label: 'オレンジ' },
      { id: 'soda', name: '炭酸ソーダ', rarity: 3, shape: 'pet', c: '#2bc4d9', c2: '#ffffff' , label: 'ソーダ' },
      { id: 'milk', name: '牛乳', rarity: 3, shape: 'carton', c: '#3f7fff', c2: '#ffffff' , label: '牛乳' },
      { id: 'sports', name: 'スポーツドリンク', rarity: 4, shape: 'pet', c: '#1f6fd9', c2: '#e8f6ff' , label: 'スポーツ' },
      { id: 'energy', name: 'エナジードリンク', rarity: 4, shape: 'can', c: '#1c1c1c', c2: '#9dff2e' , label: 'ENERGY' },
      { id: 'juiceset', name: 'ジュースギフトセット', rarity: 5, shape: 'gift', c: '#ff9f1a', c2: '#ffffff' }
    ]
  },
  {
    id: 'chilled', name: '冷凍・冷蔵食品', color: '#b39dff',
    items: [
      { id: 'popsicle', name: 'アイスキャンディ', rarity: 1, shape: 'popsicle', c: '#5fd3e8', c2: '#d9a35b' },
      { id: 'yogurt', name: 'ヨーグルト', rarity: 1, shape: 'cup', c: '#ffffff', c2: '#ff8fb1' , label: 'ヨーグルト' },
      { id: 'gyoza', name: '冷凍ギョーザ', rarity: 2, shape: 'gyoza', c: '#f3e3c3', c2: '#d9481c' },
      { id: 'pudding', name: 'プリン', rarity: 2, shape: 'pudding', c: '#ffd166', c2: '#7a3f12' },
      { id: 'pizza', name: '冷凍ピザ', rarity: 4, shape: 'pizza', c: '#f4c430', c2: '#d62828' },
      { id: 'cheese', name: 'チーズ', rarity: 3, shape: 'cheese', c: '#ffd93b', c2: '#e0b020' },
      { id: 'icecup', name: 'カップアイス', rarity: 3, shape: 'cup', c: '#fff6e8', c2: '#6b3a1f' , label: 'バニラ' },
      { id: 'shrimp', name: '冷凍エビ', rarity: 4, shape: 'shrimp', c: '#ff8a65', c2: '#ffffff' },
      { id: 'icegift', name: '高級アイス詰め合わせ', rarity: 5, shape: 'gift', c: '#5fd3e8', c2: '#d4af37' }
    ]
  }
];

export const ALL_ITEMS = CATEGORIES.flatMap(cat => cat.items.map(it => ({ ...it, cat: cat.id, catName: cat.name })));
export function findItem(id) { return ALL_ITEMS.find(it => it.id === id); }

// 抽選：指定した★の品の中から等確率
export function drawPrize(stars, rand = Math.random) {
  const pool = ALL_ITEMS.filter(it => it.rarity === stars);
  return pool[Math.floor(rand() * pool.length)];
}

// ---------------------------------------------------------------
// 景品の画像（assets/prizes/ID.webp）。index.json に書いてある品だけ読み込む
// 画像がある品は画像を、無い品はプログラムの絵（prizeArt.js）を使う
// ---------------------------------------------------------------
const images = {};
export async function loadPrizeImages(base = './assets/prizes/') {
  try {
    const r = await fetch(base + 'index.json');
    if (!r.ok) return;
    const { images: ids = [] } = await r.json();
    await Promise.all(ids.map(id => new Promise(res => {
      const img = new Image();
      img.onload = () => { images[id] = img; res(); };
      img.onerror = () => res();   // 読めなければプログラムの絵のまま
      img.src = base + id + '.webp';
    })));
  } catch (e) { console.warn('景品の画像を読み込めませんでした', e); }
}

// ---------------------------------------------------------------
// 絵。size×size の正方形に描く
// ---------------------------------------------------------------
export function paintPrize(ctx, item, size) {
  const img = images[item.id];
  if (img) { ctx.drawImage(img, 0, 0, size, size); return; }
  ctx.save();
  ctx.scale(size / 100, size / 100);   // 100×100 の座標で描いて拡大（prizeArt.js）
  paintArt(ctx, item);
  ctx.restore();
}
