// =============================================================
// ゲームの画面：マイボックス（景品・アイテム）・アイテム交換所・カードパック・ステージ一覧・広告（仮）
// どれも画面全体にかぶせる表示（モーダル）
// =============================================================
import { CATEGORIES, paintPrize, DUP_POINTS } from '../game/prizes.js';
import { ITEMS, PACK_CARDS, CARD_IMG, iconTag } from '../game/items.js';

// canUseReady()：①を押す前か（プレイ中に使えないアイテムの判定）
// onUseItem(id, arg)：アイテムを使う（ゲーム側で処理）。戻り値 { ok, msg }
export function createScreens({ progress, onPickStage, canUseReady, onUseItem }) {
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

  // 残り時間の表示（時:分）
  function hm(ms) {
    const m = Math.ceil(ms / 60000);
    return `${Math.floor(m / 60)}時間${String(m % 60).padStart(2, '0')}分`;
  }

  // ---- マイボックス ----
  // 上のタブで「景品」と「アイテム」を切り替える
  let boxMode = 'prize';
  let boxTab = 0;
  function showBox() {
    if (boxMode === 'item') { showItems(); return; }
    const cat = CATEGORIES[boxTab];
    const have = cat.items.filter(it => progress.count(it.id) > 0).length;
    const done = have === cat.items.length;
    open(`
      ${boxHead()}
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
        <div class="m-note">同じ景品をまた取ると、★の数だけポイントが貯まります（★1＝${DUP_POINTS[1]}pt … ★5＝${DUP_POINTS[5]}pt）。カテゴリーをコンプリートするとカードパックが1つもらえます</div>
      </div>`);
    bindBoxMode();
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { boxTab = Number(b.dataset.tab); showBox(); }));
    root.querySelectorAll('.m-cell').forEach(cell => {
      const it = cat.items.find(x => x.id === cell.dataset.item);
      if (progress.count(it.id) > 0) cell.querySelector('.m-pic').appendChild(prizeCanvas(it, 64));
    });
  }

  function boxHead() {
    return `
      <div class="m-head">
        <b>マイボックス</b>
        <span class="m-pt">ポイント <b>${progress.points}</b>pt</span>
        <button class="m-x" data-close>×</button>
      </div>
      <div class="m-mode">
        <button data-mode="prize" class="${boxMode === 'prize' ? 'on' : ''}">景品</button>
        <button data-mode="item" class="${boxMode === 'item' ? 'on' : ''}">アイテム${progress.packs ? `<i>${progress.packs}</i>` : ''}</button>
      </div>`;
  }
  function bindBoxMode() {
    root.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { boxMode = b.dataset.mode; showBox(); }));
  }

  // ---- マイボックス：アイテム ----
  function showItems(msg = '') {
    const ready = canUseReady();
    const effects = [];
    if (progress.retryArmed) effects.push(`${iconTag(ITEMS.find(x => x.id === 'retry'), 'it-s')} リトライ券：使用中（次にはずれたらクレジットが戻ります）`);
    for (const it of ITEMS.filter(x => x.boost)) {
      const r = progress.boostRemain(it.id);
      if (r > 0) effects.push(`${iconTag(it, 'it-s')} ${it.name}：あと${hm(r)}`);
    }
    open(`
      ${boxHead()}
      ${msg ? `<div class="m-msg">${msg}</div>` : ''}
      <div class="m-pack">
        <img class="m-pack-pic" src="${CARD_IMG.pack}" alt="">
        <div class="m-pack-txt">カードパック <b>×${progress.packs}</b><small>${PACK_CARDS}枚入り。カテゴリーをコンプリートするともらえます</small></div>
        <button class="big" data-open ${progress.packs ? '' : 'disabled'}>開ける</button>
      </div>
      ${effects.length ? `<div class="m-effects">${effects.map(e => `<div>${e}</div>`).join('')}</div>` : ''}
      <div class="m-items">${ITEMS.map(it => {
        const n = progress.itemCount(it.id);
        const lock = it.when === 'ready' && !ready;
        return `<div class="m-item ${n ? '' : 'none'}">
          <div class="m-item-ic">${iconTag(it)}</div>
          <div class="m-item-txt"><b>${it.name}</b> <span>×${n}</span><small>${it.desc}</small></div>
          <button data-use="${it.id}" ${n && !lock ? '' : 'disabled'}>使う</button>
        </div>`;
      }).join('')}</div>
      <div class="m-note">${ready ? '' : '※ 景品やステージが変わるアイテムは、プレイ中は使えません。'}アイテムは「交換所」でポイントと交換できます</div>`);
    bindBoxMode();
    const btnOpen = root.querySelector('[data-open]');
    if (btnOpen) btnOpen.addEventListener('click', () => { const cards = progress.openPack(); if (cards) showPackOpen(cards); });
    root.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.use;
      if (id === 'catPick') { showCatPick(); return; }
      const r = onUseItem(id);
      if (r && r.close) { close(); return; }
      showItems(r ? r.msg : '');
    }));
  }

  // カテゴリー指定券：カテゴリーを選ぶ
  function showCatPick() {
    open(`
      <div class="m-head"><b>カテゴリーを選ぶ</b><button class="m-x" data-back>×</button></div>
      <div class="m-sum">今の景品を、選んだカテゴリーの景品に変えます（★の数は今のステージのまま）</div>
      <div class="m-cats">${CATEGORIES.map(c => `<button data-cat="${c.id}" style="--cat:${c.color}">${c.name}</button>`).join('')}</div>`);
    root.querySelector('[data-back]').addEventListener('click', () => showItems());
    root.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
      const r = onUseItem('catPick', b.dataset.cat);
      if (r && r.close) { close(); return; }
      showItems(r ? r.msg : '');
    }));
  }

  // ---- カードパックを開ける ----
  // パックをタップ → 裏向きのカードが3枚 → 左から1枚ずつ自動でめくれる
  function showPackOpen(cards) {
    open(`
      <div class="m-head"><b>カードパック</b></div>
      <div class="pk-stage">
        <button class="pk-pack" data-pack><img src="${CARD_IMG.pack}" alt=""><small>タップして開ける</small></button>
        <div class="pk-cards" hidden>${cards.map((c, i) => `
          <button class="pk-card" data-card="${i}">
            <span class="pk-back"></span>
            <span class="pk-front">${iconTag(c, 'pk-ic')}<b>${(c.card || [c.name]).join('<br>')}</b></span>
          </button>`).join('')}</div>
      </div>
      <div class="m-sum pk-msg">パックをタップしてください</div>
      <button class="big pk-ok" data-ok hidden>OK</button>`);
    const pack = root.querySelector('[data-pack]'), list = root.querySelector('.pk-cards');
    const msg = root.querySelector('.pk-msg'), ok = root.querySelector('[data-ok]');
    const FLIP_GAP = 600;   // めくれる間隔（ミリ秒）
    pack.addEventListener('click', () => {
      if (pack.classList.contains('open')) return;
      pack.classList.add('open');
      setTimeout(() => {
        pack.hidden = true; list.hidden = false; msg.textContent = '';
        root.querySelectorAll('[data-card]').forEach((b, i) => setTimeout(() => {
          b.classList.add('flip');
          if (i === cards.length - 1) setTimeout(() => { msg.textContent = 'アイテムに入りました'; ok.hidden = false; }, 450);
        }, FLIP_GAP * (i + 1)));
      }, 350);
    });
    ok.addEventListener('click', () => { boxMode = 'item'; showItems(); });
  }

  // ---- アイテム交換所 ----
  function showShop(msg = '') {
    open(`
      <div class="m-head">
        <b>アイテム交換所</b>
        <span class="m-pt">ポイント <b>${progress.points}</b>pt</span>
        <button class="m-x" data-close>×</button>
      </div>
      ${msg ? `<div class="m-msg">${msg}</div>` : ''}
      <div class="m-items">${ITEMS.map(it => `
        <div class="m-item">
          <div class="m-item-ic">${iconTag(it)}</div>
          <div class="m-item-txt"><b>${it.name}</b> <span>所持 ×${progress.itemCount(it.id)}</span><small>${it.desc}</small></div>
          <button data-buy="${it.id}" ${progress.points >= it.price ? '' : 'disabled'}>${it.price}pt</button>
        </div>`).join('')}</div>
      <div class="m-note">交換したアイテムは、マイボックスの「アイテム」から使えます。ポイントは、同じ景品をまた取ると貯まります</div>`);
    root.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
      const it = ITEMS.find(x => x.id === b.dataset.buy);
      showShop(progress.buyItem(it.id) ? `${it.name}と交換しました` : 'ポイントが足りません');
    }));
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
      <div class="m-sum">6分ごとに1クレジット回復します（${progress.regenMax}まで）。広告を見ると${AD_CREDITS}クレジット追加できます</div>
      <button class="big" data-ad>広告を見て ＋${AD_CREDITS} クレジット</button>`);
    root.querySelector('[data-ad]').addEventListener('click', () => showAd(onDone));
  }

  return { showBox, showShop, showStages, showAd, showNoCredit, close, prizeCanvas, get isOpen() { return !root.hidden; } };
}
