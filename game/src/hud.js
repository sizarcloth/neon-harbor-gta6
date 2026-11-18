// HUD: DOM readouts, toasts, banners, damage flash, and the minimap canvas.
import { ROADS, GARAGE, HOSPITAL } from './config.js';

export function createHud(world) {
  const el = (id) => document.getElementById(id);
  const hud = el('hud');
  const wantedEl = el('wanted');
  const moneyEl = el('money');
  const debtEl = el('debt');
  const healthFill = el('health-fill');
  const healthNum = el('health-num');
  const ammoEl = el('ammo');
  const objectiveEl = el('objective');
  const speedEl = el('speed');
  const toastEl = el('toast');
  const bannerEl = el('banner');
  const bannerTitle = el('banner-title');
  const bannerText = el('banner-text');
  const vignette = el('vignette');
  const minimap = el('minimap');
  const mctx = minimap.getContext('2d');
  let toastT = 0, bannerT = 0, flashT = 0;

  function toast(text, secs = 3) {
    toastEl.textContent = text;
    toastEl.style.opacity = '1';
    toastT = secs;
  }
  function showBanner(title, text) {
    bannerTitle.textContent = title;
    bannerText.textContent = text;
    bannerEl.style.opacity = '1';
    bannerT = 4;
  }
  function flash() { flashT = 0.35; }

  function drawMinimap() {
    const S = 176 / 400;
    const X = (x) => (x + 200) * S;
    const Y = (z) => (z + 200) * S;
    mctx.fillStyle = '#0c1020';
    mctx.fillRect(0, 0, 176, 176);
    // Sea: east edge and south edge.
    mctx.fillStyle = '#1e7f8c';
    mctx.fillRect(X(195), 0, 176 - X(195), 176);
    mctx.fillRect(0, Y(185), 176, 176 - Y(185));
    // Beach sand.
    mctx.fillStyle = '#c9a86a';
    mctx.fillRect(0, Y(168), X(195), Y(185) - Y(168));
    // Roads.
    mctx.strokeStyle = '#7d8290';
    mctx.lineWidth = 2;
    for (const r of ROADS) {
      mctx.beginPath(); mctx.moveTo(X(r), 0); mctx.lineTo(X(r), 176); mctx.stroke();
      mctx.beginPath(); mctx.moveTo(0, Y(r)); mctx.lineTo(176, Y(r)); mctx.stroke();
    }
    // Garage and hospital.
    mctx.fillStyle = '#2ee66b';
    mctx.fillRect(X(GARAGE.x) - 3, Y(GARAGE.z) - 3, 6, 6);
    mctx.fillStyle = '#ffffff';
    mctx.fillRect(X(HOSPITAL.x) - 3, Y(HOSPITAL.z) - 3, 6, 6);
    // Mission target.
    const target = world.missions.targetPoint();
    if (target && !world.missions.done) {
      const pulse = 3 + Math.sin(world.time * 4) * 1.5;
      mctx.fillStyle = '#ffb020';
      mctx.beginPath(); mctx.arc(X(target.x), Y(target.z), pulse + 2, 0, Math.PI * 2); mctx.fill();
    }
    // Police.
    mctx.fillStyle = '#4a90e8';
    for (const c of world.cars) {
      if (c.mode !== 'police') continue;
      mctx.beginPath(); mctx.arc(X(c.x), Y(c.z), 3, 0, Math.PI * 2); mctx.fill();
    }
    // Player: white triangle pointing along the heading.
    const px = X(world.player.x), py = Y(world.player.z);
    const h = world.inCar && world.playerCar ? world.playerCar.heading : world.player.heading;
    mctx.fillStyle = '#ffffff';
    mctx.save();
    mctx.translate(px, py);
    mctx.rotate(Math.atan2(Math.sin(h), -Math.cos(h)) + Math.PI);
    mctx.beginPath(); mctx.moveTo(0, -6); mctx.lineTo(4.5, 5); mctx.lineTo(-4.5, 5); mctx.closePath(); mctx.fill();
    mctx.restore();
  }

  function update(dt) {
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.style.opacity = '0'; }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) bannerEl.style.opacity = '0'; }
    if (flashT > 0) {
      flashT -= dt;
      vignette.style.opacity = String(Math.max(0, flashT / 0.35) * 0.55);
    }
    if (world.state !== 'playing' && world.state !== 'paused') return;
    wantedEl.textContent = '★'.repeat(world.wanted) + '☆'.repeat(5 - world.wanted);
    wantedEl.style.color = world.wanted >= 3 ? '#ff5a3c' : '#ffb020';
    moneyEl.textContent = `$${world.money}`;
    debtEl.textContent = world.debt > 0 ? `Debt $${world.debt}` : 'Debt paid';
    healthFill.style.width = `${Math.max(0, world.player.health)}%`;
    healthFill.style.background = world.player.health > 40 ? '#2ee66b' : '#ff5a3c';
    healthNum.textContent = `${Math.ceil(Math.max(0, world.player.health))}`;
    ammoEl.textContent = world.pistol ? `Pistol ${world.ammo}` : 'Fists';
    objectiveEl.textContent = world.missions.objectiveText();
    const spd = world.inCar && world.playerCar ? Math.abs(world.playerCar.speed) * 3.6 : 0;
    speedEl.style.display = world.inCar ? 'block' : 'none';
    speedEl.textContent = world.inCar ? `${Math.round(spd)} km/h` : '';
    drawMinimap();
  }

  return {
    toast, showBanner, flash, update,
    setVisible(playing) { hud.style.display = playing ? 'block' : 'none'; },
  };
}
