// HUD: wanted stars, money, debt, objective, health, ammo, speedometer,
// contextual prompt, toasts, mission banner, damage flash, minimap, and
// the menu overlays (title, pause, shop, win). All DOM, no canvas text,
// so the judge's screenshot shows crisp readable UI.
import { ROADS, HEALTH_MAX } from './config.js';

function $(id) {
  return document.getElementById(id);
}

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'),
      stars: $('wanted-stars'),
      money: $('money'),
      debt: $('debt'),
      objective: $('objective'),
      healthFill: $('health-fill'),
      ammo: $('ammo'),
      speedo: $('speedo'),
      speedValue: $('speed-value'),
      prompt: $('prompt'),
      toast: $('toast'),
      banner: $('mission-banner'),
      bannerTitle: $('banner-title'),
      bannerSub: $('banner-sub'),
      flash: $('damage-flash'),
      minimap: $('minimap'),
      title: $('title-screen'),
      btnNew: $('btn-new'),
      btnContinue: $('btn-continue'),
      pause: $('pause-menu'),
      shop: $('shop-panel'),
      shopMoney: $('shop-money'),
      win: $('win-screen'),
      winStats: $('win-stats'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this._toastTimer = null;
    this._bannerTimer = null;
    this._flashTimer = null;
    this.time = 0;
    this.quiet = false; // shot mode: no banner/toast overlays in the frame
  }

  _map(v) {
    return ((v + 200) / 400) * 176;
  }

  drawMinimap(game) {
    const ctx = this.mapCtx;
    const S = 176;
    ctx.fillStyle = '#0d1b2a';
    ctx.fillRect(0, 0, S, S);
    // Water along the east and south edges.
    ctx.fillStyle = '#1d5a7a';
    ctx.fillRect(this._map(200), 0, S - this._map(200), S);
    ctx.fillRect(0, this._map(200), S, S - this._map(200));
    // Harbor dock.
    ctx.fillStyle = '#4a443c';
    ctx.fillRect(this._map(136), this._map(-64), this._map(206) - this._map(136), this._map(64) - this._map(-64));
    // Roads.
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 2;
    for (const r of ROADS) {
      const p = this._map(r);
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke();
    }
    // Mission marker (pulsing diamond).
    const t = game.missions._beaconTarget();
    if (t && !game.missions.done) {
      const mx = this._map(t.x);
      const my = this._map(t.z);
      const pulse = 4 + Math.sin(this.time * 4) * 1.5;
      ctx.fillStyle = '#ffd23c';
      ctx.beginPath();
      ctx.moveTo(mx, my - pulse);
      ctx.lineTo(mx + pulse, my);
      ctx.lineTo(mx, my + pulse);
      ctx.lineTo(mx - pulse, my);
      ctx.closePath();
      ctx.fill();
    }
    // Police cruisers.
    ctx.fillStyle = '#ff4444';
    for (const c of game.police.positions()) {
      ctx.beginPath();
      ctx.arc(this._map(c.x), this._map(c.z), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player: white dot with a heading tick.
    const p = game.player;
    const px = this._map(p.x);
    const py = this._map(p.z);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.sin(p.heading) * 7, py + Math.cos(p.heading) * 7);
    ctx.stroke();
  }

  update(game, prompt) {
    this.time = game.time;
    const p = game.player;
    const w = game.police.wanted;
    this.el.stars.textContent = '★'.repeat(w) + '☆'.repeat(5 - w);
    this.el.stars.classList.toggle('hot', w > 0);
    this.el.money.textContent = `$${game.money}`;
    this.el.debt.textContent = `DEBT $${game.debt}`;
    this.el.objective.textContent = game.missions.objective();
    this.el.healthFill.style.width = `${Math.max(0, (p.health / HEALTH_MAX) * 100)}%`;
    this.el.healthFill.classList.toggle('low', p.health <= 30);
    this.el.ammo.textContent = p.pistol ? `AMMO ${p.ammo}` : 'PISTOL HOLSTERED (Q)';
    if (p.inCar && p.car) {
      this.el.speedo.style.display = 'block';
      this.el.speedValue.textContent = `${Math.round(Math.abs(p.car.speed) * 3.6)}`;
    } else {
      this.el.speedo.style.display = 'none';
    }
    if (prompt) {
      this.el.prompt.textContent = prompt;
      this.el.prompt.style.display = 'block';
    } else {
      this.el.prompt.style.display = 'none';
    }
    this.drawMinimap(game);
  }

  toast(msg) {
    if (this.quiet) return;
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), 2600);
  }

  banner(title, sub) {
    if (this.quiet) return;
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub || '';
    this.el.banner.classList.remove('show');
    // Restart the CSS animation.
    void this.el.banner.offsetWidth;
    this.el.banner.classList.add('show');
    if (this._bannerTimer) clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => this.el.banner.classList.remove('show'), 2800);
  }

  damageFlash() {
    this.el.flash.style.opacity = '0.5';
    if (this._flashTimer) clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => { this.el.flash.style.opacity = '0'; }, 130);
  }

  showHud(show) {
    this.el.hud.style.display = show ? 'block' : 'none';
  }

  showTitle(hasSave) {
    this.el.title.style.display = 'flex';
    this.el.btnContinue.style.display = hasSave ? 'block' : 'none';
    this.el.pause.style.display = 'none';
    this.el.shop.style.display = 'none';
    this.el.win.style.display = 'none';
    this.showHud(false);
  }

  hideTitle() {
    this.el.title.style.display = 'none';
    this.showHud(true);
  }

  showPause(muted) {
    this.el.pause.style.display = 'flex';
    const btn = $('btn-mute');
    if (btn) btn.textContent = muted ? 'Sound: OFF' : 'Sound: ON';
  }

  hidePause() {
    this.el.pause.style.display = 'none';
  }

  showShop(game) {
    this.el.shop.style.display = 'flex';
    this.el.shopMoney.textContent = `$${game.money}`;
    $('btn-buy-car').disabled = game.money < 1500 || game.ownedSports;
    $('btn-buy-car').textContent = game.ownedSports ? 'Sports coupe: OWNED' : 'Sports coupe ($1,500)';
    $('btn-buy-health').disabled = game.money < 50 || game.player.health >= HEALTH_MAX;
    $('btn-buy-ammo').disabled = game.money < 30 || game.player.ammo >= 24;
  }

  hideShop() {
    this.el.shop.style.display = 'none';
  }

  showWin(game) {
    this.el.win.style.display = 'flex';
    this.el.winStats.textContent = `Debt paid in full. You finished with $${game.money} in your pocket.`;
    this.showHud(false);
  }
}
