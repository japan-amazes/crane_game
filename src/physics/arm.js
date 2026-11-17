// =============================================================
// アーム（吊り元）の動き
// ①を押している間 横（+x）へ、離すと止まる
// ②を押している間 奥（-z）へ、離すと止まって下降 → 待機 → 上昇
// 失敗後に続ける場合：（途中の高さなら上まで上がる →）手前へ戻る → 横へ戻る → 初期位置で①待ち（揺れはそのまま残る）
// 判定は上がりきる前に確定することがある（finish()）
// 位置で動かすキネマティック物体。加速・減速があるので鎖とリングが揺れる
// =============================================================

export const PHASE = {
  READY: 'ready',          // ①待ち
  MOVE_X: 'moveX',         // ①押下中
  STOP_X: 'stopX',         // ①離して減速中
  WAIT_Z: 'waitZ',         // ②待ち
  MOVE_Z: 'moveZ',         // ②押下中
  STOP_Z: 'stopZ',         // ②離して減速中
  DESCEND: 'descend',      // 下降
  HOLD: 'hold',            // 下で待機
  ASCEND: 'ascend',        // 上昇
  JUDGE: 'judge',          // 上で判定待ち
  DONE: 'done',
  RETURN_UP: 'returnUp',   // 初期位置へ戻る（途中で判定が確定したときは、まず上まで上がる）
  RETURN_Z: 'returnZ',     // 初期位置へ戻る（まず手前へ）
  RETURN_X: 'returnX'      // 初期位置へ戻る（次に横へ）
};

const UPDOWN_ACCEL = 25; // 上下動の加減速（cm/s²）

export class Arm {
  // homeY：待機時の高さ / bottomY：下降しきった高さ（どちらも組み立て側で計算）
  constructor(RAPIER, world, preset, homeY, bottomY) {
    this.p = preset.arm;
    this.f = preset.field;
    this.homeY = homeY;
    this.bottomY = bottomY;
    // 初期位置：左端（①で右へ）か右端（①で左へ）。field.startSide で決まる
    this.dirX = this.f.startSide === 'right' ? -1 : 1;
    this.startX = this.dirX > 0 ? this.f.xMin : this.f.xMax;
    this.endX = this.dirX > 0 ? this.f.xMax : this.f.xMin;
    this.pos = { x: this.startX, y: homeY, z: this.f.zFront };
    this.vel = { x: 0, y: 0, z: 0 };
    this.phase = PHASE.READY;
    this.timer = 0;
    this.inputX = false;
    this.inputZ = false;
    this.zQueued = false;   // ①の減速中に②が押された
    this.onPhase = null;    // (newPhase, oldPhase) => void

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y, this.pos.z)
    );
    this.visual = {
      body: this.body,
      parts: [
        { type: 'box', size: [1.6, 1.2, 1.6], pos: [0, 0.6, 0], color: 0xc9ced8, castShadow: false },
        { type: 'box', size: [0.3, 40, 0.3], pos: [0, 20.6, 0], color: 0x8a92a3, castShadow: false }
      ]
    };
  }

  setInput(which, pressed) {
    if (which === 'x') {
      if (pressed && this.phase === PHASE.READY) this.setPhase(PHASE.MOVE_X);
      if (!pressed && this.phase === PHASE.MOVE_X) this.setPhase(PHASE.STOP_X);
      this.inputX = pressed;
    } else if (which === 'z') {
      if (pressed && this.phase === PHASE.WAIT_Z) this.setPhase(PHASE.MOVE_Z);
      if (pressed && this.phase === PHASE.STOP_X) this.zQueued = true;
      if (!pressed) {
        this.zQueued = false;
        if (this.phase === PHASE.MOVE_Z) this.setPhase(PHASE.STOP_Z);
      }
      this.inputZ = pressed;
    }
  }

  setPhase(next) {
    const prev = this.phase;
    this.phase = next;
    this.timer = 0;
    if (this.onPhase) this.onPhase(next, prev);
  }

  // 速度を目標値に近づける（加速は accel、減速は decel）
  approach(v, target, dt) {
    const rate = Math.abs(target) > Math.abs(v) ? this.p.accel : this.p.decel;
    const d = target - v;
    const step = rate * dt;
    return Math.abs(d) <= step ? target : v + Math.sign(d) * step;
  }

  // 初期位置へ戻り始める（失敗後に続けるとき）
  startReturn() {
    this.inputX = this.inputZ = false;
    this.zQueued = false;
    this.setPhase(this.pos.y < this.homeY - 0.01 ? PHASE.RETURN_UP : PHASE.RETURN_Z);
  }

  // 判定を確定して止める（上がりきる前に はずれ／獲得 が決まったとき）
  finish() {
    this.vel.y = 0;
    this.setPhase(PHASE.DONE);
  }

  // 目標までの残り距離から、減速が間に合う速さ（向き付き）を出す
  stopSpeed(speed, remaining) {
    const v = Math.min(speed, Math.sqrt(2 * this.p.decel * Math.abs(remaining)));
    return Math.sign(remaining) * v;
  }

  // 上下動の速さ：動き出しと止まり際をなめらかにする（急停止で揺れすぎないように）
  smooth(speed, remaining, elapsed) {
    const a = UPDOWN_ACCEL;
    const vStart = a * elapsed + 0.5;                       // 動き出し
    const vStop = Math.sqrt(2 * a * Math.max(remaining, 0)) + 0.5; // 止まり際
    return Math.min(speed, vStart, vStop);
  }

  update(dt) {
    const p = this.p, f = this.f;
    this.timer += dt;

    switch (this.phase) {
      case PHASE.MOVE_X:
        this.vel.x = this.approach(this.vel.x, this.dirX * p.speedX, dt);
        break;
      case PHASE.STOP_X:
        this.vel.x = this.approach(this.vel.x, 0, dt);
        if (this.vel.x === 0) {
          if (this.zQueued && this.inputZ) this.setPhase(PHASE.MOVE_Z);
          else this.setPhase(PHASE.WAIT_Z);
        }
        break;
      case PHASE.MOVE_Z:
        this.vel.z = this.approach(this.vel.z, -p.speedZ, dt);
        break;
      case PHASE.STOP_Z:
        this.vel.z = this.approach(this.vel.z, 0, dt);
        if (this.vel.z === 0) this.setPhase(PHASE.DESCEND);
        break;
      case PHASE.DESCEND:
        this.vel.y = -this.smooth(p.descendSpeed, this.pos.y - this.bottomY, this.timer);
        if (this.pos.y + this.vel.y * dt <= this.bottomY + 0.01) {
          this.pos.y = this.bottomY;
          this.vel.y = 0;
          this.setPhase(PHASE.HOLD);
        }
        break;
      case PHASE.HOLD:
        this.vel.y = 0;
        if (this.timer >= p.holdTime) this.setPhase(PHASE.ASCEND);
        break;
      case PHASE.ASCEND:
        this.vel.y = this.smooth(p.ascendSpeed, this.homeY - this.pos.y, this.timer);
        if (this.pos.y + this.vel.y * dt >= this.homeY - 0.01) {
          this.pos.y = this.homeY;
          this.vel.y = 0;
          this.setPhase(PHASE.JUDGE);
        }
        break;
      case PHASE.JUDGE:
        if (this.timer >= p.judgeTime) this.setPhase(PHASE.DONE);
        break;
      case PHASE.RETURN_UP:
        // 判定で止まった高さから上まで上がる
        this.vel.y = this.smooth(p.ascendSpeed, this.homeY - this.pos.y, this.timer);
        if (this.pos.y + this.vel.y * dt >= this.homeY - 0.01) {
          this.pos.y = this.homeY;
          this.vel.y = 0;
          this.setPhase(PHASE.RETURN_Z);
        }
        break;
      case PHASE.RETURN_Z:
        // 手前（zFront）へ。止まり際は減速して目標でぴったり止まる
        this.vel.z = this.approach(this.vel.z, this.stopSpeed(p.speedZ, f.zFront - this.pos.z), dt);
        if (Math.abs(f.zFront - this.pos.z) < 0.01 && Math.abs(this.vel.z) < 0.05) {
          this.pos.z = f.zFront; this.vel.z = 0;
          this.setPhase(PHASE.RETURN_X);
        }
        break;
      case PHASE.RETURN_X:
        // 横（xMin）へ
        this.vel.x = this.approach(this.vel.x, this.stopSpeed(p.speedX, this.startX - this.pos.x), dt);
        if (Math.abs(this.startX - this.pos.x) < 0.01 && Math.abs(this.vel.x) < 0.05) {
          this.pos.x = this.startX; this.vel.x = 0;
          this.setPhase(PHASE.READY);
        }
        break;
      default:
        break;
    }

    // 位置を進める＋可動範囲で止める
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;
    if ((this.pos.x - this.endX) * this.dirX > 0) {
      this.pos.x = this.endX; this.vel.x = 0;
      if (this.phase === PHASE.MOVE_X || this.phase === PHASE.STOP_X) this.setPhase(PHASE.WAIT_Z);
    }
    if (this.pos.z < f.zBack) {
      this.pos.z = f.zBack; this.vel.z = 0;
      if (this.phase === PHASE.MOVE_Z || this.phase === PHASE.STOP_Z) this.setPhase(PHASE.DESCEND);
    }

    this.body.setNextKinematicTranslation(this.pos);
  }
}
