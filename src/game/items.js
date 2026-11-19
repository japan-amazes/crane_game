// =============================================================
// アイテム（ポイントで交換・カードパックから出る）
//   use：マイボックスの「アイテム」タブから使う
//   when：使えるとき  any＝いつでも / ready＝①を押す前（プレイ中でないとき）
//   boost：時間が来ると切れる強化（効いている間に使うと時間が延びる）
// =============================================================

export const BOOST_MS = 24 * 60 * 60 * 1000;   // 強化カードの効く時間（24時間）

export const ITEMS = [
  { id: 'credit10', name: 'クレジット＋10', icon: '🪙', price: 20, when: 'any',
    desc: 'クレジットが10増えます' },
  { id: 'skip', name: 'ステージスキップ券', icon: '⏭', price: 10, when: 'ready',
    desc: '今のステージを飛ばして、次のステージへ進みます（クリアにはなりません）' },
  { id: 'retry', name: 'リトライ券', icon: '🔁', price: 10, when: 'ready',
    desc: '使っておくと、次にはずれたときにそのプレイのクレジットが戻ります（はずれるまで効きます）' },
  { id: 'catPick', name: 'カテゴリー指定券', icon: '🗂', price: 20, when: 'ready',
    desc: '今の景品を、選んだカテゴリーの景品に変えます（★の数は今のステージのまま）' },
  { id: 'newPick', name: '未所持確定券', icon: '🆕', price: 30, when: 'ready',
    desc: '今の景品を、まだ持っていない景品に変えます（星レベルが同一のステージで使用可能）' },
  { id: 'regenMax', name: '回復上限アップ', icon: '🔋', price: 50, when: 'any', boost: true,
    desc: '24時間、時間で回復するクレジットの上限が10→15になります' },
  { id: 'regenFast', name: '回復の速さアップ', icon: '⚡', price: 50, when: 'any', boost: true,
    desc: '24時間、クレジットの回復が6分→4分ごとになります' }
];

export function findItemDef(id) { return ITEMS.find(it => it.id === id); }

// カードパック：1パック3枚。安いアイテムほど出やすい（出やすさ＝値段に反比例）
export const PACK_CARDS = 3;
export function drawCard(rand = Math.random) {
  const w = ITEMS.map(it => 1 / it.price);
  let r = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ITEMS.length; i++) { r -= w[i]; if (r <= 0) return ITEMS[i]; }
  return ITEMS[ITEMS.length - 1];
}
