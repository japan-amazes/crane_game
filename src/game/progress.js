// =============================================================
// 遊びの記録（スマホの中に保存）
// ステージの進み具合・クリア済み・コレクション・ポイント・アイテム・カードパック・クレジット
// =============================================================
import { CATEGORIES, ROUNDS, setRound, findItem, DUP_POINTS } from './prizes.js';
import { findItemDef, drawCard, PACK_CARDS, BOOST_MS } from './items.js';

const KEY = 'crane.progress.v1';
const OLD_STAGE_KEY = 'crane.stage.v1';
export const DAILY_CREDITS = 10;          // 1日1回（その日最初に開いたとき）もらえる
export const REGEN_MAX = 10;              // 時間で回復するのはここまで
export const REGEN_MS = 6 * 60 * 1000;    // 6分で1クレジット回復（0から1時間で満タン）
const BOOST_REGEN_MAX = 15;               // 回復上限アップが効いている間の上限
const BOOST_REGEN_MS = 4 * 60 * 1000;     // 回復の速さアップが効いている間

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function createProgress(stageTotal) {
  let st = {
    stage: 0,          // 今のステージ（0始まり）
    frontier: 0,       // いちばん先まで進んだステージ
    cleared: [],       // クリア済みのステージ番号
    box: {},           // 景品ID → 取った回数
    points: 0,
    items: {},         // アイテムID → 持っている数
    boosts: {},        // 強化アイテムID → 切れる時刻
    packs: 0,          // まだ開けていないカードパック
    retryArmed: false, // リトライ券を使用中（次にはずれたらクレジットが戻る）
    completed: [],     // コンプリート済みのカテゴリーID（ごほうびは1回だけ）
    lap: 0,            // 全コンプリートした回数
    trainingUnlocked: false,   // 全コンプリートで特訓モードが開放される
    round: 0,          // 今のラウンド（0始まり。0＝ラウンド1）
    roundsDone: [],    // 全コンプリートしたことのあるラウンド
    roundPick: false,  // 次のラウンドを選ぶ画面を出す（選ぶ前に閉じても、次に開いたときに出す）
    credits: DAILY_CREDITS,
    creditDay: today(),
    regenAt: Date.now(),  // 時間の回復を数え始めた時刻
    prizes: {}            // ステージ番号 → 出ている景品ID（再起動やスキップのあとで戻っても同じ景品を出す。獲得したら消す）
  };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) Object.assign(st, saved);
    else {
      // 前の版のステージ保存を引き継ぐ
      const old = JSON.parse(localStorage.getItem(OLD_STAGE_KEY) || 'null');
      if (old && Number.isFinite(old.stage)) { st.stage = old.stage; st.frontier = old.stage; }
    }
  } catch { /* 保存できない環境 */ }
  st.stage = clamp(st.stage);
  st.frontier = clamp(Math.max(st.frontier, st.stage));
  const clearedSet = new Set(st.cleared);

  function clamp(i) { return Math.min(Math.max(0, Number(i) || 0), stageTotal - 1); }
  function save() {
    st.cleared = [...clearedSet];
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* 保存できない環境 */ }
  }

  // ラウンド（前の版で全コンプリート済みならラウンド2から）
  if (!Number.isFinite(st.round)) st.round = st.lap > 0 ? 1 : 0;
  st.round = Math.min(Math.max(0, st.round), ROUNDS.length - 1);
  if (!Array.isArray(st.roundsDone)) st.roundsDone = [];
  setRound(st.round);
  if (!Number.isFinite(st.regenAt)) st.regenAt = Date.now();
  if (!st.prizes || typeof st.prizes !== 'object') st.prizes = {};
  // 前の版の確定チケットは、カードパックに置き換える
  if (st.tickets) { st.packs += st.tickets; }
  delete st.tickets;

  // 強化が効いているか・回復の上限と間隔
  function boostOn(id) { return (st.boosts[id] || 0) > Date.now(); }
  function regenMax() { return boostOn('regenMax') ? BOOST_REGEN_MAX : REGEN_MAX; }
  function regenMs() { return boostOn('regenFast') ? BOOST_REGEN_MS : REGEN_MS; }

  // クレジットの更新
  //   10より少ないときは、6分ごとに1ずつ回復（閉じていた間の分もまとめて）。10以上のときは回復しない
  //   （強化が効いている間は、上限15・4分ごと）
  //   日付が変わっていたら、1日1回の分を足す（残りはそのまま持ち越す）
  //   閉じていた間に強化が切れていたら、切れた時刻で区切って計算する
  //   （切れる前は強化の上限・間隔で回復し、そこまでに貯まった分は切れたあとも減らない）
  function refreshCredits() {
    let changed = false;
    const d = today(), now = Date.now();
    const start = st.regenAt, startCredits = st.credits;
    const ends = [st.boosts.regenMax, st.boosts.regenFast]
      .filter(t => Number.isFinite(t) && t > start && t < now).sort((a, b) => a - b);
    ends.push(now);
    let pos = start, segStart = start;
    for (const end of ends) {
      // この区間の上限・間隔（区間の始めに強化が効いていたか）
      const max = (st.boosts.regenMax || 0) > segStart ? BOOST_REGEN_MAX : REGEN_MAX;
      const ms = (st.boosts.regenFast || 0) > segStart ? BOOST_REGEN_MS : REGEN_MS;
      if (st.credits >= max) pos = end;   // 満タンの間は数え始めない
      else {
        const n = Math.floor((end - pos) / ms);
        if (n > 0) {
          st.credits = Math.min(max, st.credits + n);
          pos = st.credits >= max ? end : pos + n * ms;
        }
      }
      segStart = end;
    }
    if (pos !== start || st.credits !== startCredits) { st.regenAt = pos; changed = true; }
    const max = regenMax();
    // 1日1回の分は、時間の回復のあとに足す（閉じていた間の回復を先に済ませる）。上限（10、回復上限アップ中は15）まで
    if (st.creditDay !== d) { st.creditDay = d; capAdd(DAILY_CREDITS); changed = true; if (st.credits >= max) st.regenAt = now; }
    if (changed) save();
  }
  // クレジットを足す。どの足し方でも上限（10、回復上限アップ中は15）を超えない。
  // すでに上限以上のときは増やさない（減らしもしない）。実際に増えた数を返す
  function capAdd(n) {
    const before = st.credits;
    if (st.credits < regenMax()) st.credits = Math.min(regenMax(), st.credits + n);
    return st.credits - before;
  }
  refreshCredits();

  return {
    get stage() { return st.stage; },
    get frontier() { return st.frontier; },
    get points() { return st.points; },
    get credits() { refreshCredits(); return st.credits; },
    // 次の回復までの残り（ミリ秒）。10以上で回復しないときは null
    get regenRemain() {
      refreshCredits();
      return st.credits >= regenMax() ? null : Math.max(0, regenMs() - (Date.now() - st.regenAt));
    },
    get regenMax() { return regenMax(); },
    isCleared(i) { return clearedSet.has(i); },
    clearedCount() { return clearedSet.size; },
    // 先頭より前で、まだクリアしていないステージ（スキップしたもの）
    unclearedBefore() {
      const out = [];
      for (let i = 0; i < st.frontier; i++) if (!clearedSet.has(i)) out.push(i);
      return out;
    },
    count(id) { return st.box[id] || 0; },

    // ---- 今出ている景品（再起動で引き直せないように保存しておく）----
    savedPrize() { return st.prizes[st.stage] || null; },
    setPrize(id) { if (id) st.prizes[st.stage] = id; else delete st.prizes[st.stage]; save(); },

    // ---- ステージ ----
    goStage(i) { st.stage = clamp(i); st.frontier = Math.max(st.frontier, st.stage); save(); },
    resetAll() {
      st.stage = 0; st.frontier = 0; clearedSet.clear(); save();
    },
    // 獲得したとき：クリア済みにして、次に遊ぶステージを返す
    // 先頭で取ったら次へ、前のステージ（スキップしたもの）で取ったら先頭へ戻る
    clearStage() {
      clearedSet.add(st.stage);
      const next = st.stage >= st.frontier ? st.stage + 1 : st.frontier;
      const wrapped = next >= stageTotal;
      st.stage = wrapped ? 0 : next;
      st.frontier = wrapped ? st.frontier : Math.max(st.frontier, st.stage);
      save();
      return { wrapped };
    },
    // 「別のステージへ」：先頭なら次へ進む、前のステージからなら先頭へ戻る
    skipStage() {
      const next = st.stage >= st.frontier ? st.stage + 1 : st.frontier;
      st.stage = next >= stageTotal ? 0 : next;
      st.frontier = Math.max(st.frontier, st.stage);
      save();
    },

    // ---- クレジット ----
    useCredit(unlimited) {
      if (unlimited) return true;
      refreshCredits();
      if (st.credits <= 0) return false;
      st.credits--; save();
      return true;
    },
    addCredit(n = 1) { refreshCredits(); const added = capAdd(n); save(); return added; },
    // 上限に届いていて、足しても増えないとき true
    get creditsFull() { refreshCredits(); return st.credits >= regenMax(); },

    // ---- アイテム ----
    itemCount(id) { return st.items[id] || 0; },
    // ポイントで交換。足りなければ false
    buyItem(id) {
      const def = findItemDef(id);
      if (!def || st.points < def.price) return false;
      st.points -= def.price;
      st.items[id] = (st.items[id] || 0) + 1;
      save();
      return true;
    },
    // 1つ使う（数を減らして、その場で効くものは効かせる）。持っていなければ false
    useItem(id) {
      if (!(st.items[id] > 0)) return false;
      st.items[id]--;
      const def = findItemDef(id);
      if (id === 'credit10') { refreshCredits(); capAdd(10); }
      if (id === 'retry') st.retryArmed = true;
      if (def.boost) {
        refreshCredits();   // 切り替わる前の分の回復を済ませる
        st.boosts[id] = Math.max(st.boosts[id] || 0, Date.now()) + BOOST_MS;   // 効いている間なら時間を延ばす
      }
      save();
      return true;
    },
    // 強化の残り時間（ミリ秒）。効いていなければ 0
    boostRemain(id) { return Math.max(0, (st.boosts[id] || 0) - Date.now()); },
    get retryArmed() { return st.retryArmed; },
    // はずれたとき：リトライ券を使用中なら、クレジットを1戻して券を使い切る
    refundRetry() {
      if (!st.retryArmed) return false;
      st.retryArmed = false; refreshCredits(); capAdd(1); save();
      return true;
    },

    // ---- カードパック ----
    get packs() { return st.packs; },
    get lap() { return st.lap; },
    get trainingUnlocked() { return st.trainingUnlocked; },
    // 1パック開ける：3枚引いて持ち物に入れる。引いたアイテムの一覧を返す
    openPack() {
      if (st.packs <= 0) return null;
      st.packs--;
      const cards = [];
      for (let i = 0; i < PACK_CARDS; i++) {
        const def = drawCard();
        st.items[def.id] = (st.items[def.id] || 0) + 1;
        cards.push(def);
      }
      save();
      return cards;
    },

    // ---- ラウンド ----
    get round() { return st.round; },
    get roundPickPending() { return st.roundPick; },
    // ラウンドを切り替える：マイボックスの景品を空にして、ステージに出ていた景品も引き直す
    //   （ポイント・アイテム・カードパック・クレジット・ステージはそのまま）
    startRound(i) {
      st.round = Math.min(Math.max(0, Number(i) || 0), ROUNDS.length - 1);
      setRound(st.round);
      st.box = {};
      st.completed = [];
      st.prizes = {};
      st.roundPick = false;
      save();
    },

    // ---- コレクション ----
    // 獲得した景品を入れる。戻り値：{ isNew, points, completedCat, allComplete, trainingNew, nextRound }
    //   nextRound：自動で進んだラウンド（ラウンド1を初めてそろえたとき）。それ以外の全コンプリートは選ぶ画面（roundPickPending）
    addPrize(id) {
      const it = findItem(id);
      const had = st.box[id] || 0;
      st.box[id] = had + 1;
      let points = 0;
      if (had > 0) { points = DUP_POINTS[it.rarity]; st.points += points; }
      const completedCat = checkComplete(it.cat);
      // 全カテゴリーをコンプリート：特訓モードを開放して、次のラウンドへ
      const allComplete = !!completedCat && CATEGORIES.every(c => st.completed.includes(c.id));
      let trainingNew = false, nextRound = null;
      if (allComplete) {
        trainingNew = !st.trainingUnlocked;
        st.trainingUnlocked = true;
        st.lap++;
        if (!st.roundsDone.includes(st.round)) st.roundsDone.push(st.round);
        // ラウンド2をまだそろえていなければ、ラウンド2へ自動で進む。そろえたことがあれば選ぶ画面
        if (!st.roundsDone.includes(1)) { nextRound = 1; this.startRound(1); }
        else st.roundPick = true;
      }
      save();
      return { isNew: had === 0, points, completedCat, allComplete, trainingNew, nextRound };
    },
  };

  // カテゴリーの9品がそろったら、カードパックを1つ（カテゴリーごとに1回だけ）
  function checkComplete(catId) {
    if (st.completed.includes(catId)) return null;
    const cat = CATEGORIES.find(c => c.id === catId);
    if (!cat.items.every(it => (st.box[it.id] || 0) > 0)) return null;
    st.completed.push(catId);
    st.packs++;
    return cat;
  }
}
