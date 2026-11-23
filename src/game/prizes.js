// =============================================================
// 景品の一覧と抽選・絵
// ラウンドごとに 5カテゴリー×9品。★1〜★5（各カテゴリーで★1〜★4が2品ずつ、★5が1品）
// 景品はステージの★レベル（ステージ1＝★1 … ステージ5＝★5、6でまた★1）の品からランダムに選ぶ
// 絵は画像ファイルを使わず、canvas にプログラムで描く（paintPrize → prizeArt.js）
// 商品名は一般名だけ（実在のブランド名は使わない）
// =============================================================
import { paintArt } from './prizeArt.js';

export const MAX_STARS = 5;
export const DUP_POINTS = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };   // ダブりでもらえるポイント（★の数）。アイテム交換所で使う

// shape：絵の形 / c：主な色 / c2：差し色 / label：絵の中のラベル文字
// ---- ラウンド1 ----
const ROUND1 = [
  {
    id: 'sweets', name: 'お菓子', color: '#ff8fb1',
    items: [
      { id: 'candy', name: 'キャンディ', rarity: 1, shape: 'candy', c: '#ff5e8a', c2: '#ffd1dc' },
      { id: 'gummy', name: 'グミ', rarity: 1, shape: 'jar', c: '#ffffff', c2: '#ff6b6b' },
      { id: 'chips', name: 'ポテトチップス', rarity: 2, shape: 'bag', c: '#f4c430', c2: '#d9481c' , label: 'ポテト' },
      { id: 'senbei', name: 'せんべい', rarity: 2, shape: 'senbei', c: '#c98a3f', c2: '#1e3a1e' },
      { id: 'choco', name: 'チョコレート', rarity: 3, shape: 'bar', c: '#6b3a1f', c2: '#c0392b' },
      { id: 'cookie', name: 'クッキー', rarity: 3, shape: 'cookie', c: '#d9a35b', c2: '#5a3416' },
      { id: 'momiji', name: 'もみじ饅頭', rarity: 4, shape: 'tbd', c: '#ff8fb1', c2: '#ffffff' },
      { id: 'monaka', name: '最中', rarity: 4, shape: 'tbd', c: '#ff8fb1', c2: '#ffffff' },
      { id: 'yokan', name: '高級羊羹', rarity: 5, shape: 'tbd', c: '#ff8fb1', c2: '#ffffff' }
    ]
  },
  {
    id: 'goods', name: '生活雑貨', color: '#7fb8ff',
    items: [
      { id: 'tissue', name: 'ティッシュ', rarity: 1, shape: 'tissue', c: '#8ec5ff', c2: '#ffffff' },
      { id: 'toilet', name: 'トイレットペーパー', rarity: 1, shape: 'roll', c: '#ffffff', c2: '#cfd8e3' },
      { id: 'toothset', name: '歯磨きセット', rarity: 2, shape: 'toothbrush', c: '#3fa7ff', c2: '#ffffff' },
      { id: 'detergent', name: '洗剤', rarity: 2, shape: 'detergent', c: '#2ecc71', c2: '#ffffff' },
      { id: 'bathtowel', name: 'バスタオル', rarity: 3, shape: 'towel', c: '#ff7a59', c2: '#ffffff' },
      { id: 'towel', name: 'フェイスタオル', rarity: 3, shape: 'towel', c: '#ffd166', c2: '#ffffff' },
      { id: 'umbrella', name: '傘', rarity: 4, shape: 'umbrella', c: '#5b6cff', c2: '#2b2b2b' },
      { id: 'clock', name: '目覚まし時計', rarity: 4, shape: 'clock', c: '#e74c3c', c2: '#ffffff' },
      { id: 'humidifier', name: 'USB加湿器', rarity: 5, shape: 'kettle', c: '#ecf0f1', c2: '#2c3e50' }
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

// ---- ラウンド2 ----
// 画像ができるまでは仮の絵（箱に品名。shape: 'tbd'）。c はカテゴリーの色
function tbd(color, list) {
  return list.map(([id, name, rarity]) => ({ id, name, rarity, shape: 'tbd', c: color, c2: '#ffffff' }));
}
const ROUND2 = [
  {
    id: 'goods2', name: '生活雑貨', color: '#7fb8ff',
    items: tbd('#7fb8ff', [
      ['wipes', '除菌シート', 1], ['bathsalt', '入浴剤', 1],
      ['deodorant', '消臭剤', 2], ['softener', '柔軟剤', 2],
      ['shampoo', 'シャンプー＆コンディショナー', 3], ['slippers', 'フック王スリッパ', 3],
      ['bathmat', 'フック王バスマット', 4], ['cushion', 'フック王クッション', 4],
      ['wallclock', 'フック王壁掛け時計', 5]
    ])
  },
  {
    id: 'chilled2', name: '冷凍・冷蔵食品', color: '#b39dff',
    items: tbd('#b39dff', [
      ['eggs', '卵（10個入り×2パック）', 1], ['hamburg', '冷凍ハンバーグ', 1],
      ['cheesecake', 'チーズケーキ', 2], ['gateau', 'ガトーショコラ', 2],
      ['porkbelly', '豚バラ肉', 3], ['yakitori', '焼き鳥', 3],
      ['unagi', '冷凍ウナギ', 4], ['gyutan', '牛タン', 4],
      ['steak', 'アンガス牛ステーキ', 5]
    ])
  },
  {
    id: 'instant', name: 'カップ麺・インスタント', color: '#ffb347',
    items: tbd('#ffb347', [
      ['cupsoup', 'カップスープ', 1], ['misosoup', 'インスタント味噌汁', 1],
      ['cupudon', 'カップうどん・そば', 2], ['cupramen', 'カップラーメン', 2],
      ['curry', 'レトルトカレー', 3], ['yakisoba', 'カップ焼そば', 3],
      ['curryhigh', '高級レトルトカレー', 4], ['stew', 'レトルトビーフシチュー', 4],
      ['emergency', '災害用非常食セット', 5]
    ])
  },
  {
    id: 'seasoning', name: '調味料', color: '#ff7f6e',
    items: tbd('#ff7f6e', [
      ['soysauce', '醤油', 1], ['dressing', 'ドレッシング', 1],
      ['yakinikusauce', '焼肉のタレ', 2], ['nabesoup', '鍋のスープ', 2],
      ['ketchup', 'ケチャップ', 3], ['mayo', 'マヨネーズ', 3],
      ['sesameoil', 'ごま油', 4], ['saladoil', 'サラダ油', 4],
      ['oliveoil', '高級オリーブオイル', 5]
    ])
  },
  {
    id: 'kitchen', name: 'キッチン用品', color: '#ffd166',
    items: tbd('#ffd166', [
      ['wrap', 'ラップ', 1], ['storagebag', '保存袋', 1],
      ['kpaper', 'キッチンペーパー', 2], ['tupper', 'タッパー', 2],
      ['dishsoap', '食器用洗剤', 3], ['donabe', 'ミニ土鍋', 3],
      ['hkmug', 'フック王マグカップ', 4], ['lunchbox', 'フック王ランチボックス', 4],
      ['apron', 'フック王エプロン', 5]
    ])
  }
];

// ラウンドの一覧。ROUND_SOON 番目以降は「準備中」（選べない）
export const ROUNDS = [ROUND1, ROUND2];
export const ROUND_SOON = 3;   // 選ぶ画面に「ラウンド3（準備中）」として出す

// 今のラウンドのカテゴリー・品（setRound で切り替える）
export let ROUND = 0;
export let CATEGORIES = ROUNDS[0];
export let ITEMS = [];
function withCat(cats) { return cats.flatMap(cat => cat.items.map(it => ({ ...it, cat: cat.id, catName: cat.name }))); }
export function setRound(i) {
  ROUND = Math.min(Math.max(0, Number(i) || 0), ROUNDS.length - 1);
  CATEGORIES = ROUNDS[ROUND];
  ITEMS = withCat(CATEGORIES);
}
setRound(0);

// すべてのラウンドの品（保存してある景品IDを探すとき・フォントの読み込み用）
export const ALL_ITEMS = ROUNDS.flatMap(withCat);
export function findItem(id) { return ALL_ITEMS.find(it => it.id === id); }
export function findCategory(id) { return ROUNDS.flat().find(c => c.id === id); }

// 抽選：今のラウンドの、指定した★の品の中から等確率
// filter：さらにしぼる条件（カテゴリー指定券・未所持確定券）。しぼって1つもなければ★だけで選ぶ
export function drawPrize(stars, rand = Math.random, filter = null) {
  let pool = ITEMS.filter(it => it.rarity === stars);
  if (filter && pool.some(filter)) pool = pool.filter(filter);
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
// 画像の中で、透明でない部分の範囲（景品パネルで余白を切り落として大きく出すため。品ごとに1回だけ調べる）
const contentBox = {};
function imageContent(id, img) {
  if (contentBox[id]) return contentBox[id];
  const w = img.naturalWidth, h = img.naturalHeight;
  let box = { x: 0, y: 0, w, h };
  try {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 16) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 >= x0) box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  } catch { /* 読み取れない環境では画像全体 */ }
  return (contentBox[id] = box);
}

// 景品パネル用：画像の透明な余白を切り落として、w×h の枠いっぱいに（縦横比はそのまま、中央に）描く
// 画像がない品は、枠に入る正方形でプログラムの絵を描く
export function paintPrizeFit(ctx, item, x, y, w, h) {
  const img = images[item.id];
  if (img) {
    const b = imageContent(item.id, img);
    const k = Math.min(w / b.w, h / b.h);
    const dw = b.w * k, dh = b.h * k;
    ctx.drawImage(img, b.x, b.y, b.w, b.h, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    return;
  }
  const size = Math.min(w, h);
  ctx.save(); ctx.translate(x + (w - size) / 2, y + (h - size) / 2);
  paintPrize(ctx, item, size);
  ctx.restore();
}

export function paintPrize(ctx, item, size) {
  const img = images[item.id];
  if (img) { ctx.drawImage(img, 0, 0, size, size); return; }
  ctx.save();
  ctx.scale(size / 100, size / 100);   // 100×100 の座標で描いて拡大（prizeArt.js）
  paintArt(ctx, item);
  ctx.restore();
}
