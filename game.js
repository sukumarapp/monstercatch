const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const caughtCountEl = document.querySelector("#caughtCount");
const monsterCountEl = document.querySelector("#monsterCount");
const timerEl = document.querySelector("#timer");
const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlayTitle");
const overlayText = document.querySelector("#overlayText");
const startButton = document.querySelector("#startButton");
const instructionsModal = document.querySelector("#instructionsModal");
const instructionsButton = document.querySelector("#instructionsButton");

const sounds = {
  background: new Audio("music/background-music.mp3"),
  catch: new Audio("sound-effects/monster-catch.wav"),
  jail: new Audio("sound-effects/jail-drop.wav"),
};

sounds.background.loop = true;
sounds.background.volume = 0.35;
sounds.catch.volume = 0.75;
sounds.jail.volume = 0.85;

const W = canvas.width;
const H = canvas.height;
const jail = { x: 732, y: 126, w: 168, h: 204 };
const keys = new Set();
let player;
let monsters;
let particles;
let gameState;
let lastTime = 0;

const monsterPalette = [
  ["#ff80a3", "#ffd4df"],
  ["#62caef", "#d8f5ff"],
  ["#f9be45", "#fff0bb"],
  ["#9fd36a", "#edf9d0"],
  ["#b28cf2", "#efe4ff"],
  ["#ff8e5f", "#ffe0d1"],
];

function resetGame() {
  player = {
    x: 92,
    y: 470,
    r: 24,
    speed: 250,
    carried: null,
    facing: 1,
  };
  monsters = Array.from({ length: 6 }, (_, i) => ({
    id: i,
    x: 130 + (i % 3) * 155,
    y: 120 + Math.floor(i / 3) * 165,
    r: 23,
    vx: (i % 2 ? 1 : -1) * (64 + i * 9),
    vy: (i % 3 ? 1 : -1) * (54 + i * 7),
    color: monsterPalette[i][0],
    belly: monsterPalette[i][1],
    jailed: false,
    wobble: Math.random() * Math.PI * 2,
  }));
  particles = [];
  gameState = {
    running: false,
    won: false,
    caught: 0,
    timeLeft: 60,
  };
  updateHud();
  draw();
}

function startGame() {
  resetGame();
  overlay.hidden = true;
  instructionsModal.hidden = false;
}

function beginPlay() {
  instructionsModal.hidden = true;
  gameState.running = true;
  startBackgroundMusic();
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.035);
  lastTime = now;
  update(dt);
  draw();
  if (gameState.running) requestAnimationFrame(loop);
}

function update(dt) {
  gameState.timeLeft = Math.max(0, gameState.timeLeft - dt);
  movePlayer(dt);
  moveMonsters(dt);
  updateParticles(dt);
  tryCatchMonster();
  tryJailMonster();
  updateHud();

  if (gameState.caught === monsters.length) {
    endGame(true);
  } else if (gameState.timeLeft <= 0) {
    endGame(false);
  }
}

function movePlayer(dt) {
  let dx = 0;
  let dy = 0;
  if (keys.has("ArrowLeft")) dx -= 1;
  if (keys.has("ArrowRight")) dx += 1;
  if (keys.has("ArrowUp")) dy -= 1;
  if (keys.has("ArrowDown")) dy += 1;
  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    player.x += dx * player.speed * dt;
    player.y += dy * player.speed * dt;
    if (dx) player.facing = Math.sign(dx);
  }
  player.x = clamp(player.x, player.r, W - player.r);
  player.y = clamp(player.y, player.r + 58, H - player.r);

  if (player.carried !== null) {
    const carried = monsters[player.carried];
    carried.x = player.x + player.facing * 25;
    carried.y = player.y - 30;
  }
}

function moveMonsters(dt) {
  for (const m of monsters) {
    if (m.jailed || player.carried === m.id) continue;
    m.wobble += dt * 4;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    if (m.x < m.r || m.x > W - m.r) m.vx *= -1;
    if (m.y < m.r + 58 || m.y > H - m.r) m.vy *= -1;
    m.x = clamp(m.x, m.r, W - m.r);
    m.y = clamp(m.y, m.r + 58, H - m.r);
  }
}

function tryCatchMonster() {
  if (player.carried !== null) return;
  for (const m of monsters) {
    if (m.jailed) continue;
    if (distance(player, m) < player.r + m.r + 4) {
      player.carried = m.id;
      burst(m.x, m.y, m.color, 10);
      playSound(sounds.catch);
      break;
    }
  }
}

function tryJailMonster() {
  if (player.carried === null) return;
  const m = monsters[player.carried];
  const insideJail =
    player.x > jail.x &&
    player.x < jail.x + jail.w &&
    player.y > jail.y &&
    player.y < jail.y + jail.h;
  if (!insideJail) return;
  m.jailed = true;
  m.x = jail.x + 45 + (gameState.caught % 3) * 38;
  m.y = jail.y + 134 + Math.floor(gameState.caught / 3) * 32;
  player.carried = null;
  gameState.caught += 1;
  burst(m.x, m.y, "#ffe56d", 18);
  playSound(sounds.jail);
}

function updateParticles(dt) {
  particles = particles.filter((p) => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 140 * dt;
    return p.life > 0;
  });
}

function endGame(won) {
  gameState.running = false;
  gameState.won = won;
  stopBackgroundMusic();
  instructionsModal.hidden = true;
  overlay.hidden = false;
  overlayTitle.textContent = won ? "All jailed!" : "Time's up!";
  overlayText.textContent = won
    ? "Nice work. Every silly monster is safely in jail."
    : "Some monsters are still loose. Try a faster patrol.";
  startButton.textContent = "Play Again";
}

function startBackgroundMusic() {
  sounds.background.currentTime = 0;
  sounds.background.play().catch(() => {
    // Browsers can block audio until a direct user gesture; the Start button normally satisfies that.
  });
}

function stopBackgroundMusic() {
  sounds.background.pause();
  sounds.background.currentTime = 0;
}

function playSound(sound) {
  sound.currentTime = 0;
  sound.play().catch(() => {});
}

function updateHud() {
  caughtCountEl.textContent = String(gameState.caught);
  monsterCountEl.textContent = String(monsters.length - gameState.caught);
  timerEl.textContent = String(Math.ceil(gameState.timeLeft));
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawWorld();
  drawJail();
  for (const m of monsters) {
    if (m.jailed) drawMonster(m, 0.85);
  }
  for (const m of monsters) {
    if (!m.jailed && player.carried !== m.id) drawMonster(m, 1);
  }
  if (player.carried !== null) drawMonster(monsters[player.carried], 0.92);
  drawPlayer();
  drawParticles();
}

function drawWorld() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#8fd5f1");
  sky.addColorStop(0.58, "#c9ec90");
  sky.addColorStop(1, "#7cc85f");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  cloud(112, 92, 1);
  cloud(428, 70, 0.75);
  cloud(604, 118, 0.65);

  ctx.fillStyle = "#70b957";
  for (let x = -20; x < W; x += 72) {
    ctx.beginPath();
    ctx.ellipse(x, H - 24, 56, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.32)";
  roundedRect(44, 96, 590, 420, 26);
  ctx.fill();
}

function drawJail() {
  ctx.save();
  ctx.fillStyle = "#f8f2d6";
  roundedRect(jail.x - 16, jail.y - 30, jail.w + 32, jail.h + 50, 8);
  ctx.fill();
  ctx.strokeStyle = "#3f5960";
  ctx.lineWidth = 7;
  roundedRect(jail.x, jail.y, jail.w, jail.h, 8);
  ctx.stroke();

  ctx.fillStyle = "#3f5960";
  for (let x = jail.x + 25; x < jail.x + jail.w; x += 34) {
    roundedRect(x, jail.y + 8, 10, jail.h - 16, 5);
    ctx.fill();
  }
  ctx.fillRect(jail.x, jail.y + 70, jail.w, 8);
  ctx.fillRect(jail.x, jail.y + 138, jail.w, 8);

  ctx.fillStyle = "#e44d6c";
  roundedRect(jail.x + 28, jail.y - 58, jail.w - 56, 38, 8);
  ctx.fill();
  ctx.fillStyle = "#fff8d5";
  ctx.font = "800 22px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("JAIL", jail.x + jail.w / 2, jail.y - 32);
  ctx.restore();
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.scale(player.facing, 1);
  ctx.fillStyle = "rgba(24, 51, 58, 0.18)";
  ctx.beginPath();
  ctx.ellipse(0, 25, 25, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#286fd1";
  roundedRect(-18, -4, 36, 42, 14);
  ctx.fill();
  ctx.fillStyle = "#ffe2b8";
  ctx.beginPath();
  ctx.arc(0, -24, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6b3b25";
  ctx.beginPath();
  ctx.arc(-2, -34, 23, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#18333a";
  ctx.beginPath();
  ctx.arc(-8, -24, 3, 0, Math.PI * 2);
  ctx.arc(9, -24, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#18333a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(1, -18, 8, 0.15, Math.PI - 0.15);
  ctx.stroke();
  ctx.strokeStyle = "#ffe2b8";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-16, 7);
  ctx.lineTo(-31, 22);
  ctx.moveTo(16, 7);
  ctx.lineTo(31, 17);
  ctx.stroke();
  ctx.restore();
}

function drawMonster(m, scale) {
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.scale(scale, scale);
  const bounce = Math.sin(m.wobble) * 4;
  ctx.translate(0, bounce);
  ctx.fillStyle = "rgba(24, 51, 58, 0.18)";
  ctx.beginPath();
  ctx.ellipse(0, 25, 25, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = m.color;
  roundedRect(-26, -22, 52, 52, 18);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-16, -20, 13, 0, Math.PI * 2);
  ctx.arc(16, -20, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = m.belly;
  ctx.beginPath();
  ctx.ellipse(0, 10, 16, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-10, -8, 8, 0, Math.PI * 2);
  ctx.arc(11, -8, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#18333a";
  ctx.beginPath();
  ctx.arc(-8, -6, 3, 0, Math.PI * 2);
  ctx.arc(9, -6, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#18333a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(1, 5, 8, 0.1, Math.PI - 0.1);
  ctx.stroke();
  ctx.strokeStyle = m.color;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-21, 7);
  ctx.lineTo(-34, 18);
  ctx.moveTo(21, 7);
  ctx.lineTo(34, 18);
  ctx.stroke();
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(p.life / p.maxLife, 0);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function cloud(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.arc(0, 8, 24, 0, Math.PI * 2);
  ctx.arc(28, 0, 32, 0, Math.PI * 2);
  ctx.arc(65, 11, 24, 0, Math.PI * 2);
  ctx.rect(0, 7, 65, 24);
  ctx.fill();
  ctx.restore();
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 160;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 60,
      r: 3 + Math.random() * 5,
      color,
      life: 0.45 + Math.random() * 0.35,
      maxLife: 0.8,
    });
  }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setKey(key, pressed) {
  if (!key.startsWith("Arrow")) return;
  if (pressed) keys.add(key);
  else keys.delete(key);
}

window.addEventListener("keydown", (event) => {
  if (event.key.startsWith("Arrow")) event.preventDefault();
  setKey(event.key, true);
});

window.addEventListener("keyup", (event) => setKey(event.key, false));

startButton.addEventListener("click", startGame);
instructionsButton.addEventListener("click", beginPlay);

const touchButtons = [
  ["upBtn", "ArrowUp"],
  ["leftBtn", "ArrowLeft"],
  ["downBtn", "ArrowDown"],
  ["rightBtn", "ArrowRight"],
];

for (const [id, key] of touchButtons) {
  const btn = document.querySelector(`#${id}`);
  btn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    keys.add(key);
    btn.setPointerCapture(event.pointerId);
  });
  btn.addEventListener("pointerup", () => keys.delete(key));
  btn.addEventListener("pointercancel", () => keys.delete(key));
  btn.addEventListener("pointerleave", () => keys.delete(key));
}

resetGame();
