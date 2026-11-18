// =============================================================
// ゲームの画面：マイボックス（コレクション）・ステージ一覧・広告（仮）
// どれも画面全体にかぶせる表示（モーダル）
// =============================================================
import { CATEGORIES, paintPrize, DUP_POINTS } from '../game/prizes.js';

export function createScreens({ progress, onPickStage }) {
  const root = document.getElementById('modal');

  function open(html) {
    root.innerHTML = `<div class="m-card">${html}</div>`;
    root.hidden = false;
    root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  }
  function close() { root.hidden = true; root.innerHTML = ''; }

  function stars(n, max = n) {
    return '<span class="stars">' + '★'.repeat(n) + '<span class="off">' + '★'.repeat(Math.max(0, max - n)) + '</span></span>';
  }

  // 景品の絵を canvas で作る
  function prizeCanvas(item, size) {
    const c = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.height = Math.round(size * dpr);
    c.style.width = c.style.height = size + 'px';
    paintPrize(c.getContext('2d'), item, size * dpr);
    return c;
  }

  // ---- マイボックス ----
  let boxTab = 0;
  function showBox() {
    const cat = CATEGORIES[boxTab];
    const have = cat.items.filter(it => progress.count(it.id) > 0).length;
    const done = have === cat.items.length;
    open(`
      <div class="m-head">
        <b>マイボックス</b>
        <span class="m-pt">ポイント <b>${progress.points}</b>pt</span>
        <button class="m-x" data-close>×</button>
      </div>
      <div class="m-tabs">${CATEGORIES.map((c, i) => {
        const h = c.items.filter(it => progress.count(it.id) > 0).length;
        return `<button data-tab="${i}" class="${i === boxTab ? 'on' : ''}" style="--cat:${c.color}">${c.name}<small>${h}/9</small></button>`;
      }).join('')}</div>
      <div class="m-cat" style="--cat:${cat.color}">
        <div class="m-cat-title">${cat.name}　${have}/9 ${done ? '<span class="m-done">コンプリート！</span>' : ''}</div>
        <div class="m-bar"><i style="width:${have / 9 * 100}%"></i></div>
        <div class="m-grid">${cat.items.map(it => {
          const n = progress.count(it.id);
          return `<div class="m-cell ${n ? 'got' : ''}" data-item="${it.id}">
            <div class="m-star">${stars(it.rarity)}</div>
            <div class="m-pic"></div>
            <div class="m-name">${it.name}</div>
            ${n > 1 ? `<div class="m-num">×${n}</div>` : ''}
          </div>`;
        }).join('')}</div>
        <div class="m-note">同じ景品をまた取ると、★の数だけポイントが貯まります（★1＝${DUP_POINTS[1]}pt … ★5＝${DUP_POINTS[5]}pt）。カテゴリーをコンプリートすると確定チケットが1枚もらえます</div>
      </div>`);
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { boxTab = Number(b.dataset.tab); showBox(); }));
    root.querySelectorAll('.m-cell').forEach(cell => {
      const it = cat.items.find(x => x.id === cell.dataset.item);
      if (progress.count(it.id) > 0) cell.querySelector('.m-pic').appendChild(prizeCanvas(it, 64));
    });
  }

  // ---- ステージ一覧 ----
  // 先頭（いちばん先まで進んだステージ）と、スキップして未クリアのステージを並べる
  function showStages() {
    const un = progress.unclearedBefore();
    const list = un.slice(-300).reverse();   // 多すぎるときは新しい方から300個
    open(`
      <div class="m-head"><b>ステージ</b><button class="m-x" data-close>×</button></div>
      <div class="m-sum">クリア ${progress.clearedCount()} ／ いちばん先 STAGE ${progress.frontier + 1}</div>
      <button class="big m-front" data-stage="${progress.frontier}">いちばん先（STAGE ${progress.frontier + 1}）へ</button>
      <div class="m-sub">未クリアのステージ（${un.length}）${un.length > list.length ? `　新しい方から${list.length}個を表示` : ''}</div>
      <div class="m-stages">${list.length ? list.map(i => `<button data-stage="${i}" class="${i === progress.stage ? 'on' : ''}">STAGE ${i + 1}</button>`).join('') : '<div class="m-empty">ありません</div>'}</div>`);
    root.querySelectorAll('[data-stage]').forEach(b => b.addEventListener('click', () => { close(); onPickStage(Number(b.dataset.stage)); }));
  }

  // ---- 広告（仮）----
  // 本物の広告は、アプリにする段階で差し替える。今は試技中なので待ち時間なし（AD_SECONDS を3にすると3秒の仮画面）
  const AD_SECONDS = 0;
  const AD_CREDITS = 10;   // 広告1回で増えるクレジット（回数の制限なし）
  function showAd(onDone) {
    let t = AD_SECONDS;
    open(`
      <div class="m-head"><b>広告（仮）</b></div>
      <div class="m-ad">ここに広告が表示されます<div class="m-ad-t">${t}</div></div>`);
    const tEl = root.querySelector('.m-ad-t');
    const finish = () => {
      progress.addCredit(AD_CREDITS);
      root.querySelector('.m-ad').innerHTML = `<b>＋${AD_CREDITS} クレジット</b><button class="big" data-close>OK</button>`;
      root.querySelector('[data-close]').addEventListener('click', () => { close(); if (onDone) onDone(); });
    };
    if (t <= 0) { finish(); return; }
    const timer = setInterval(() => {
      t--;
      if (t > 0) { tEl.textContent = t; return; }
      clearInterval(timer);
      finish();
    }, 1000);
  }

  // クレジットが0のとき
  function showNoCredit(onDone) {
    open(`
      <div class="m-head"><b>クレジットがありません</b><button class="m-x" data-close>×</button></div>
      <div class="m-sum">6分ごとに1クレジット回復します（10まで）。広告を見ると${AD_CREDITS}クレジット追加できます</div>
      <button class="big" data-ad>広告を見て ＋${AD_CREDITS} クレジット</button>`);
    root.querySelector('[data-ad]').addEventListener('click', () => showAd(onDone));
  }

  return { showBox, showStages, showAd, showNoCredit, close, prizeCanvas, get isOpen() { return !root.hidden; } };
}
