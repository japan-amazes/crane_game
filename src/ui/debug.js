// =============================================================
// 数値調整パネル（開発用）
// スライダーで台の設定を変え、「適用してやり直す」で作り直す
// 変更内容は端末に保存（localStorage）。完成版では非表示にする
// =============================================================

import { applyChainRatio } from '../game/chainRange.js';

const STORE_KEY = 'crane.debug.overrides.v1';

// path：プリセット内の場所 / label：表示名
const SCHEMA = [
  { group: 'アーム' },
  { path: 'arm.speedX', label: '横の速さ', min: 2, max: 15, step: 0.5, unit: 'cm/s' },
  { path: 'arm.speedZ', label: '奥の速さ', min: 2, max: 15, step: 0.5, unit: 'cm/s' },
  { path: 'arm.accel', label: '動き出しの急さ', min: 10, max: 200, step: 5, unit: 'cm/s²' },
  { path: 'arm.decel', label: '止まるときの急さ', min: 10, max: 300, step: 5, unit: 'cm/s²' },
  { path: 'field.startSide', label: '初期位置', options: { left: '左端（①で右へ）', right: '右端（①で左へ）' } },
  { path: 'field.xMin', label: '移動範囲：左端', min: -28, max: -2, step: 0.5, unit: 'cm' },
  { path: 'field.xMax', label: '移動範囲：右端', min: 2, max: 28, step: 0.5, unit: 'cm' },
  { path: 'field.zFront', label: '移動範囲：手前（初期位置）', min: 2, max: 23, step: 0.5, unit: 'cm' },
  { path: 'field.zBack', label: '移動範囲：奥', min: -23, max: -2, step: 0.5, unit: 'cm' },
  { path: 'field.armHeight', label: 'アームの高さ（板の上面から）', min: 15, max: 80, step: 0.1, unit: 'cm' },
  { path: 'arm.dropLimit', label: '下降制限（止まる高さ・板の上面から）', min: 5, max: 75, step: 0.1, unit: 'cm' },
  { path: 'arm.holdTime', label: '下での待ち時間', min: 0, max: 3, step: 0.1, unit: '秒' },
  { path: 'arm.ascendSpeed', label: '引き上げの速さ', min: 2, max: 15, step: 0.5, unit: 'cm/s' },
  { path: 'arm.judgeDelay', label: '判定までの時間（上昇開始から）', min: 0.5, max: 8, step: 0.1, unit: '秒' },
  { group: 'チェーン' },
  { path: 'chain.length', label: 'チェーンの長さ', min: 5, max: 70, step: 0.1, unit: 'cm' },
  { path: 'chain.pitch', label: 'コマの長さ（ピッチ）', min: 0.4, max: 1.5, step: 0.05, unit: 'cm' },
  { path: 'chain.linearDamping', label: '揺れの残りにくさ', min: 0, max: 2, step: 0.05, unit: '' },
  { path: 'chain.twistStiffness', label: 'ねじれの戻る強さ', min: 0, max: 2000, step: 20, unit: '' },
  { path: 'chain.twistDamping', label: 'ねじれの止まりやすさ', min: 0, max: 150, step: 2, unit: '' },
  { path: 'chain.rubDamping', label: 'コマ同士のこすれ', min: 0, max: 100, step: 2, unit: '' },
  { path: 'chain.maxBendDeg', label: 'コマが曲がる上限', min: 10, max: 150, step: 5, unit: '°' },
  { group: 'リング' },
  { path: 'ring.diameter', label: '直径（外径）', min: 3, max: 10, step: 0.1, unit: 'cm' },
  { path: 'ring.thickness', label: '太さ', min: 0.1, max: 1.2, step: 0.05, unit: 'cm' },
  { path: 'ring.mass', label: '重さ', min: 5, max: 60, step: 1, unit: 'g' },
  { path: 'ring.yawDeg', label: '向き', min: 0, max: 180, step: 5, unit: '°' },
  { path: 'ring.friction', label: 'すべりにくさ', min: 0, max: 1.2, step: 0.05, unit: '' },
  { path: 'ring.angularDamping', label: '回りにくさ', min: 0, max: 5, step: 0.1, unit: '' },
  { path: 'ring.initialTwistDeg', label: '初期のねじれ', min: -180, max: 180, step: 5, unit: '°' },
  { group: 'つなぎのリング' },
  { path: 'connector.diameter', label: '直径（外径）', min: 0.6, max: 3, step: 0.1, unit: 'cm' },
  { path: 'connector.thickness', label: '太さ', min: 0.1, max: 0.6, step: 0.05, unit: 'cm' },
  { group: 'フック' },
  { path: 'hook.height', label: '高さ（板からてっぺんまで）', min: 2.5, max: 8, step: 0.1, unit: 'cm' },
  { path: 'hook.thickness', label: '太さ', min: 0.2, max: 1, step: 0.02, unit: 'cm' },
  { path: 'hook.tipBallRadius', label: '先端の玉（0=なし）', min: 0, max: 0.6, step: 0.05, unit: 'cm' },
  { path: 'hook.yawDeg', label: '向き（0=手前 90=右）', min: 0, max: 359, step: 5, unit: '°' },
  { path: 'hook.offsetX', label: '位置（左右）', min: -5, max: 5, step: 0.25, unit: 'cm' },
  { path: 'hook.offsetZ', label: '位置（手前奥）', min: -4, max: 4, step: 0.25, unit: 'cm' },
  { path: 'hook.friction', label: 'すべりにくさ', min: 0, max: 1.2, step: 0.05, unit: '' },
  { group: '板・台' },
  { path: 'board.width', label: '板の幅（左右）', min: 4, max: 30, step: 0.5, unit: 'cm' },
  { path: 'board.depth', label: '板の奥行き', min: 4, max: 25, step: 0.5, unit: 'cm' },
  { path: 'board.height', label: '板の厚み', min: 0.3, max: 5, step: 0.1, unit: 'cm' },
  { path: 'board.mass', label: '板の重さ', min: 20, max: 400, step: 10, unit: 'g' },
  { path: 'board.material', label: '板の素材', options: { plastic: 'プラスチック', metal: '金属', wood: '木' } },
  { path: 'field.tableTiltDeg', label: '台の傾き（＋＝奥が低い）', min: -10, max: 10, step: 0.5, unit: '°' }
];

// basePreset：今のステージの設定（ステージが変わったら setBase で差し替える）
// onStageReset：「ステージ1からやり直す」を押したとき
export function createDebugPanel(container, basePreset, onApply, heightInfo, onStageReset) {
  let overrides = load();
  let inputs = {};
  let guide = true;
  let unlimited = false;   // クレジット無制限（テスト用）
  try { unlimited = localStorage.getItem('crane.debug.unlimited') === '1'; } catch { /* 保存できない環境 */ }
  let info;

  build();

  function build() {
    inputs = {};
    container.innerHTML = '';
    const head = el('div', 'dbg-head');
    head.innerHTML = '<b>数値調整</b><span class="dbg-sub">開発用。今のステージの設定を表示。変更は「適用」でやり直し（試し遊び用で、ステージの設定自体は変わらない。次のステージに進むと元に戻る）</span>';
    container.appendChild(head);

    // 高さの目安（チェーン・下降制限などを動かすとその場で再計算）
    info = el('div', 'dbg-info');
    container.appendChild(info);

    const guideRow = el('label', 'dbg-row dbg-check');
    guideRow.innerHTML = `<input type="checkbox"${guide ? ' checked' : ''}> 真下ガイドを表示`;
    guideRow.querySelector('input').addEventListener('change', e => { guide = e.target.checked; });
    container.appendChild(guideRow);

    const unlRow = el('label', 'dbg-row dbg-check');
    unlRow.innerHTML = `<input type="checkbox"${unlimited ? ' checked' : ''}> クレジット無制限（テスト用）`;
    unlRow.querySelector('input').addEventListener('change', e => {
      unlimited = e.target.checked;
      try { localStorage.setItem('crane.debug.unlimited', unlimited ? '1' : '0'); } catch { /* 保存できない環境 */ }
    });
    container.appendChild(unlRow);

    for (const item of SCHEMA) {
      if (item.group) {
        const g = el('div', 'dbg-group');
        g.textContent = item.group;
        container.appendChild(g);
        continue;
      }
      const row = el('div', 'dbg-row');
      const label = el('div', 'dbg-label');
      const value = el('span', 'dbg-value');
      label.textContent = item.label;
      label.appendChild(value);
      row.appendChild(label);

      let input;
      if (item.options) {
        input = document.createElement('select');
        for (const [k, v] of Object.entries(item.options)) {
          const o = document.createElement('option');
          o.value = k; o.textContent = v;
          input.appendChild(o);
        }
      } else {
        input = document.createElement('input');
        input.type = 'range';
        input.min = item.min; input.max = item.max; input.step = item.step;
      }
      const cur = valueOf(item.path);
      input.value = cur;
      const show = () => {
        value.textContent = item.options ? '' : ` ${input.value}${item.unit ? ' ' + item.unit : ''}`;
        row.classList.toggle('changed', String(input.value) !== String(getPath(basePreset, item.path)));
      };
      input.addEventListener('input', () => { show(); updateInfo(); });
      show();
      row.appendChild(input);
      container.appendChild(row);
      inputs[item.path] = { input, item };
    }

    const btns = el('div', 'dbg-buttons');
    const apply = el('button', 'big');
    apply.textContent = '適用してやり直す';
    apply.addEventListener('click', () => {
      overrides = {};
      for (const [path, { input, item }] of Object.entries(inputs)) {
        const v = item.options ? input.value : Number(input.value);
        if (String(v) !== String(getPath(basePreset, path))) overrides[path] = v;
      }
      save(overrides);
      toggle(false);
      onApply();
    });
    const reset = el('button', '');
    reset.textContent = '初期値に戻す';
    reset.addEventListener('click', () => {
      overrides = {};
      save(overrides);
      for (const [path, { input }] of Object.entries(inputs)) {
        input.value = getPath(basePreset, path);
        input.dispatchEvent(new Event('input'));
      }
    });
    const close = el('button', '');
    close.textContent = '閉じる';
    close.addEventListener('click', () => toggle(false));
    btns.append(apply, reset, close);
    if (onStageReset) {
      const stage1 = el('button', '');
      stage1.textContent = 'ステージ1からやり直す';
      stage1.addEventListener('click', () => { toggle(false); onStageReset(); });
      btns.append(stage1);
    }
    container.appendChild(btns);
    updateInfo();
  }

  // 入力中の値で高さの目安を計算して表示
  function updateInfo() {
    if (!heightInfo) return;
    const p = JSON.parse(JSON.stringify(basePreset));
    for (const [path, { input, item }] of Object.entries(inputs)) {
      setPath(p, path, item.options ? input.value : Number(input.value));
    }
    const h = heightInfo(p);
    const stop = h.bottomAtStop >= 0
      ? `板から ${h.bottomAtStop.toFixed(1)}cm 上で止まる（板に届かない）`
      : `板に着いて ${(-h.bottomAtStop).toFixed(1)}cm たるむ`;
    info.innerHTML = `待機中のリング下端：フックのてっぺんより ${h.gapAtHome.toFixed(1)}cm ${h.gapAtHome >= 0 ? '上' : '下（フックに当たる）'}<br>下がりきったとき：${stop}`;
  }

  function valueOf(path) {
    return path in overrides ? overrides[path] : getPath(basePreset, path);
  }

  function currentPreset() {
    const p = JSON.parse(JSON.stringify(basePreset));
    for (const [path, v] of Object.entries(overrides)) setPath(p, path, v);
    // チェーンの長さを直接変えたら、ステージの「割合」より優先。そうでなければ、下降制限・リングを変えたときに割合から計算し直す
    if ('chain.length' in overrides) p.chain.lengthRatio = null;
    return applyChainRatio(p);
  }

  function toggle(force) {
    const open = typeof force === 'boolean' ? force : container.hidden;
    container.hidden = !open;
  }

  // ステージが変わったとき：表示する設定を差し替え、試しの変更は消す
  function setBase(p) {
    basePreset = p;
    overrides = {};
    save(overrides);
    build();
  }

  return {
    currentPreset,
    setBase,
    toggle,
    get guide() { return guide; },
    get unlimited() { return unlimited; }
  };
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
}

function setPath(obj, path, v) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  o[ks[ks.length - 1]] = v;
}

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}

function save(v) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* 保存できない環境では無視 */ }
}
