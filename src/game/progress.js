// =============================================================
// 遊びの記録（スマホの中に保存）
// ステージの進み具合・クリア済み・コレクション・ポイント・確定チケット・クレジット
// =============================================================
import { CATEGORIES, findItem, DUP_POINTS } from './prizes.js';

const KEY = 'crane.progress.v1';
const OLD_STAGE_KEY = 'crane.stage.v1';
export const DAILY_CREDITS = 10;          // 1日1回（その日最初に開いたとき）もらえる
export const REGEN_MAX = 10;              // 時間で回復するのはここまで
export const REGEN_MS = 6 * 60 * 1000;    // 6分で1クレジット回復（0から1時間で満タン）

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
    tickets: 0,
    completed: [],     // コンプリート済みのカテゴリーID（ごほうびは1回だけ）
    credits: DAILY_CREDITS,
    creditDay: today(),
    regenAt: Date.now()   // 時間の回復を数え始めた時刻
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

  if (!Number.isFinite(st.regenAt)) st.regenAt = Date.now();

  // クレジットの更新
  //   10より少ないときは、6分ごとに1ずつ回復（閉じていた間の分もまとめて）。10以上のときは回復しない
  //   日付が変わっていたら、1日1回の分を足す（残りはそのまま持ち越す）
  function refreshCredits() {
    let changed = false;
    const d = today(), now = Date.now();
    if (st.credits >= REGEN_MAX) {
      if (st.regenAt !== now) { st.regenAt = now; changed = true; }   // 満タンの間は数え始めない
    } else {
      const n = Math.floor((now - st.regenAt) / REGEN_MS);
      if (n > 0) {
        st.credits = Math.min(REGEN_MAX, st.credits + n);
        st.regenAt = st.credits >= REGEN_MAX ? now : st.regenAt + n * REGEN_MS;
        changed = true;
      }
    }
    // 1日1回の分は、時間の回復のあとに足す（閉じていた間の回復を先に済ませる）
    if (st.creditDay !== d) { st.creditDay = d; st.credits += DAILY_CREDITS; changed = true; if (st.credits >= REGEN_MAX) st.regenAt = now; }
    if (changed) save();
  }
  refreshCredits();

  return {
    get stage() { return st.stage; },
    get frontier() { return st.frontier; },
    get points() { return st.points; },
    get tickets() { return st.tickets; },
    get credits() { refreshCredits(); return st.credits; },
    // 次の回復までの残り（ミリ秒）。10以上で回復しないときは null
    get regenRemain() {
      refreshCredits();
      return st.credits >= REGEN_MAX ? null : Math.max(0, REGEN_MS - (Date.now() - st.regenAt));
    },
    isCleared(i) { return clearedSet.has(i); },
    clearedCount() { return clearedSet.size; },
    // 先頭より前で、まだクリアしていないステージ（スキップしたもの）
    unclearedBefore() {
      const out = [];
      for (let i = 0; i < st.frontier; i++) if (!clearedSet.has(i)) out.push(i);
      return out;
    },
    count(id) { return st.box[id] || 0; },

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
    addCredit(n = 1) { refreshCredits(); st.credits += n; save(); },

    // ---- 確定チケット ----
    useTicket() { if (st.tickets <= 0) return false; st.tickets--; save(); return true; },

    // ---- コレクション ----
    // 獲得した景品を入れる。戻り値：{ isNew, points, completedCat }
    addPrize(id) {
      const it = findItem(id);
      const had = st.box[id] || 0;
      st.box[id] = had + 1;
      let points = 0;
      if (had > 0) { points = DUP_POINTS[it.rarity]; st.points += points; }
      const completedCat = checkComplete(it.cat);
      save();
      return { isNew: had === 0, points, completedCat };
    },
  };

  // カテゴリーの9品がそろったら、確定チケットを1枚（カテゴリーごとに1回だけ）
  function checkComplete(catId) {
    if (st.completed.includes(catId)) return null;
    const cat = CATEGORIES.find(c => c.id === catId);
    if (!cat.items.every(it => (st.box[it.id] || 0) > 0)) return null;
    st.completed.push(catId);
    st.tickets++;
    return cat;
  }
}
