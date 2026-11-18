// =============================================================
// 遊びの記録（スマホの中に保存）
// ステージの進み具合・クリア済み・コレクション・ポイント・確定チケット・クレジット
// =============================================================
import { CATEGORIES, findItem, DUP_POINTS } from './prizes.js';

const KEY = 'crane.progress.v1';
const OLD_STAGE_KEY = 'crane.stage.v1';
export const DAILY_CREDITS = 5;

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
    creditDay: today()
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

  // 日付が変わっていたらクレジットを戻す（前の日の残りは持ち越さない）
  function refreshCredits() {
    const d = today();
    if (st.creditDay !== d) { st.creditDay = d; st.credits = DAILY_CREDITS; save(); }
  }
  refreshCredits();

  return {
    get stage() { return st.stage; },
    get frontier() { return st.frontier; },
    get points() { return st.points; },
    get tickets() { return st.tickets; },
    get credits() { refreshCredits(); return st.credits; },
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
