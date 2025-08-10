// Algerian Runner - simple 90s-like platformer
// Internal resolution 320x180 scaled to 1280x720
(() => {
  const CANVAS_W = 1280, CANVAS_H = 720;
  const INTERNAL_W = 320, INTERNAL_H = 180;
  const SCALE = 4;
  const TILE = 16;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Offscreen internal buffer
  const buf = document.createElement('canvas');
  buf.width = INTERNAL_W; buf.height = INTERNAL_H;
  const bctx = buf.getContext('2d');

  // --- Assets ---
  const atlas = new Image(); atlas.src = "./assets/sprites.png";
  let sprites = null;
  fetch("./assets/sprites.json").then(r => r.json()).then(j => sprites = j);

  const KEYS = {};
  window.addEventListener('keydown', e => { KEYS[e.key.toLowerCase()] = true; if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault(); });
  window.addEventListener('keyup',   e => { KEYS[e.key.toLowerCase()] = false; });

  function now() { return performance.now()/1000; }

  // Pools
  function makePool(n, maker) {
    const pool = [];
    for (let i=0;i<n;i++) pool.push(maker());
    return {
      items: pool,
      firstFree() {
        return pool.find(o => !o.active);
      }
    };
  }

  // Camera
  const camera = { x:0, y:0, lookAhead: 24 };

  // World & Level
  let levelIndex = 0;
  const LEVELS = ["level1.json","level2.json","level3.json","boss.json"];
  let level = null;

  const solids = new Set([1,2,4]); // ground, platform, crate
  const hazards = new Set([3]);    // spikes

  // Player
  const player = {
    x: 32, y: 0, vx: 0, vy: 0, w: 12, h: 14,
    onGround: false, facing: 1,
    hearts: 3, invuln: 0, score: 0, lives: 3,
    jumpBuffer: 0, coyote: 0,
    fireCooldown: 0, checkpoint: {x:32,y:0}, dead:false
  };

  const GRAV = 800;
  const MAX_SPEED = 120;
  const ACCEL = 600;
  const FRICTION = 700;
  const JUMP_VEL = -220;
  const COYOTE_TIME = 0.12;
  const JUMP_BUFFER = 0.12;
  const FIRE_COOLDOWN = 0.25;

  // Enemies
  const enemyPool = makePool(32, () => ({
    x:0,y:0,vx:0,vy:0,w:14,h:12,hp:2,
    active:false, lunge:false, biteCooldown:0
  }));

  // Bullets
  const bulletPool = makePool(16, () => ({x:0,y:0,vx:0,vy:0,w:8,h:4,active:false,ttl:0.9}));

  // Explosions
  const boomPool = makePool(16, () => ({x:0,y:0,t:0,active:false}));

  // Collectibles
  const peppers = [];

  function rectsOverlap(a,b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function tileAt(px, py) {
    const {width,height,tiles} = level;
    const tx = Math.floor(px/TILE);
    const ty = Math.floor(py/TILE);
    if (tx<0 || ty<0 || tx>=width || ty>=height) return 0;
    return tiles[ty*width + tx];
  }

  function collideAndSlide(ent) {
    // Horizontal
    ent.x += ent.vx * dt;
    // Sample two vertical points
    const dirX = Math.sign(ent.vx);
    if (dirX !== 0) {
      const aheadX = dirX>0 ? ent.x + ent.w : ent.x;
      for (let i=0;i<ent.h;i+=8) {
        const t = tileAt(aheadX, ent.y + i + 1);
        if (solids.has(t)) { // push back
          if (dirX>0) ent.x = Math.floor((aheadX)/TILE)*TILE - ent.w - 0.001;
          else ent.x = Math.floor((aheadX)/TILE + 1)*TILE + 0.001;
          ent.vx = 0;
          break;
        }
      }
    }
    // Vertical
    ent.y += ent.vy * dt;
    const dirY = Math.sign(ent.vy);
    if (dirY !== 0) {
      const aheadY = dirY>0 ? ent.y + ent.h : ent.y;
      for (let i=0;i<ent.w;i+=8) {
        const t = tileAt(ent.x + i + 1, aheadY);
        if (solids.has(t)) {
          if (dirY>0) { ent.y = Math.floor((aheadY)/TILE)*TILE - ent.h - 0.001; ent.onGround = true; ent.coyote = COYOTE_TIME; }
          else ent.y = Math.floor((aheadY)/TILE + 1)*TILE + 0.001;
          ent.vy = 0;
          break;
        }
      }
    }
  }

  function spawnEnemy(x,y) {
    const e = enemyPool.firstFree();
    if (!e) return;
    Object.assign(e, {x:x, y:y, vx:0, vy:0, hp:2, active:true, lunge:false, biteCooldown:0});
  }

  function spawnBullet(x,y,dir) {
    const b = bulletPool.firstFree(); if (!b) return;
    Object.assign(b, {x:x, y:y, vx: dir*280, vy:0, active:true, ttl:0.9});
  }

  function spawnBoom(x,y) {
    const b = boomPool.firstFree(); if (!b) return;
    Object.assign(b, {x:x, y:y, t:0, active:true});
  }

  function drawSprite(name, dx, dy, flip=false) {
    if (!sprites) return;
    const r = sprites.entities[name] || sprites.tiles[name];
    if (!r) return;
    const [sx,sy,sw,sh] = r;
    bctx.save();
    if (flip) { bctx.scale(-1,1); dx = -dx - sw; }
    bctx.drawImage(atlas, sx, sy, sw, sh, Math.floor(dx), Math.floor(dy), sw, sh);
    bctx.restore();
  }

  let last = now(), dt = 0;
  let ready = false;

  function loadLevel(index) {
    return fetch("./levels/" + LEVELS[index]).then(r => r.json()).then(data => {
      level = data;
      player.x = data.spawn.x; player.y = data.spawn.y;
      player.vx = player.vy = 0; player.onGround = false;
      player.checkpoint = {x: data.spawn.x, y: data.spawn.y};
      // enemies
      enemyPool.items.forEach(e => e.active=false);
      data.enemies.forEach(e => spawnEnemy(e.x, e.y));
      // peppers
      peppers.length = 0;
      data.peppers.forEach(p => peppers.push({x:p.x, y:p.y, w:10, h:10, taken:false}));
      ready = true;
    });
  }

  function respawn() {
    player.x = player.checkpoint.x; player.y = player.checkpoint.y;
    player.vx = player.vy = 0; player.onGround = false; player.invuln = 1.0;
  }

  function updatePlayer() {
    const left = KEYS['arrowleft'] || KEYS['a'];
    const right = KEYS['arrowright'] || KEYS['d'];
    const jump = KEYS[' '] || KEYS['w'] || KEYS['arrowup'];
    const shoot = KEYS['x'];

    // Horizontal
    if (left) player.vx = Math.max(player.vx - ACCEL*dt, -MAX_SPEED);
    else if (right) player.vx = Math.min(player.vx + ACCEL*dt, MAX_SPEED);
    else {
      if (player.vx > 0) player.vx = Math.max(0, player.vx - FRICTION*dt);
      if (player.vx < 0) player.vx = Math.min(0, player.vx + FRICTION*dt);
    }
    if (right) player.facing = 1;
    if (left) player.facing = -1;

    // Gravity
    player.vy += GRAV * dt;
    player.onGround = false;

    // Jump buffering and coyote
    if (jump) player.jumpBuffer = JUMP_BUFFER;
    if (player.jumpBuffer > 0 && player.coyote > 0) {
      player.vy = JUMP_VEL;
      player.onGround = false;
      player.jumpBuffer = 0;
      player.coyote = 0;
    }
    player.jumpBuffer -= dt;
    player.coyote -= dt;

    // Variable jump
    if (!jump && player.vy < 0) player.vy += 600 * dt;

    collideAndSlide(player);

    // Fire
    player.fireCooldown -= dt;
    if (shoot && player.fireCooldown <= 0) {
      spawnBullet(player.x + (player.facing>0 ? player.w : 0), player.y + 8, player.facing);
      player.fireCooldown = FIRE_COOLDOWN;
    }

    // Hazards
    for (let i=0;i<player.w;i+=8) {
      const t = tileAt(player.x + i + 1, player.y + player.h);
      if (hazards.has(t)) takeDamage();
    }

    // Checkpoint & goal
    // simple: if near checkpoint tile index 5, set checkpoint
    const tx = Math.floor((player.x+player.w/2)/TILE);
    const ty = Math.floor((player.y+player.h/2)/TILE);
    const tIdx = level.tiles[ty*level.width + tx];
    if (tIdx === 5) { player.checkpoint = {x: tx*TILE, y: (ty-1)*TILE}; }
    if (tIdx === 6) { // goal
      levelIndex++;
      if (levelIndex >= LEVELS.length) levelIndex = 0;
      loadLevel(levelIndex);
    }

    // Peppers
    peppers.forEach(p => {
      if (!p.taken && rectsOverlap(player, p)) { p.taken = true; player.score += 1; if (player.score % 100 === 0) player.lives += 1; }
    });

    // Camera
    camera.x = player.x - INTERNAL_W/2 + player.facing*camera.lookAhead;
    camera.y = player.y - INTERNAL_H/2;
    camera.x = Math.max(0, Math.min(camera.x, level.width*TILE - INTERNAL_W));
    camera.y = Math.max(0, Math.min(camera.y, level.height*TILE - INTERNAL_H));
  }

  function takeDamage() {
    if (player.invuln > 0) return;
    player.hearts -= 1; player.invuln = 1.0;
    if (player.hearts <= 0) {
      player.lives -= 1; player.hearts = 3;
      respawn();
    }
  }

  function updateBullets() {
    bulletPool.items.forEach(b => {
      if (!b.active) return;
      b.x += b.vx * dt;
      b.ttl -= dt;
      if (b.ttl <= 0) b.active = false;
      // collide with world
      if (solids.has(tileAt(b.x + (b.vx>0?b.w:0), b.y))) { b.active=false; }
      // collide with enemies
      enemyPool.items.forEach(e => {
        if (!e.active) return;
        if (rectsOverlap(b, e)) {
          b.active = false;
          e.hp -= 1;
          if (e.hp <= 0) {
            spawnBoom(e.x, e.y);
            e.active = false;
          }
        }
      });
    });
  }

  function updateEnemies() {
    enemyPool.items.forEach(e => {
      if (!e.active) return;
      // simple chase
      const dir = Math.sign((player.x) - (e.x));
      e.vx += dir * 200 * dt;
      e.vx = Math.max(-60, Math.min(60, e.vx));
      e.vy += GRAV * dt;
      collideAndSlide(e);
      // lunge / bite if close
      const dist = Math.abs(player.x - e.x);
      e.biteCooldown -= dt;
      if (dist < 20 && e.biteCooldown <= 0) {
        // bite
        if (rectsOverlap(player, {x:e.x, y:e.y, w:e.w, h:e.h})) {
          takeDamage();
          e.biteCooldown = 0.8;
          // knockback
          player.vx += 150 * Math.sign(player.x - e.x);
          player.vy = -140;
        }
      }
      // hazards / world removed off-screen
      if (e.y > level.height*TILE + 64) e.active = false;
    });
  }

  function updateBooms() {
    boomPool.items.forEach(b => {
      if (!b.active) return;
      b.t += dt;
      if (b.t > 0.4) b.active = false;
    });
  }

  function drawWorld() {
    // sky
    bctx.fillStyle = '#0e1c2d';
    bctx.fillRect(0,0,INTERNAL_W,INTERNAL_H);
    // parallax silhouettes
    bctx.fillStyle = 'rgba(20,40,60,0.8)';
    for (let i=0;i<8;i++) {
      const x = (i*80 - (camera.x*0.5)%80);
      bctx.fillRect(x, 90, 50, 40);
    }
    const {width,height,tiles} = level;
    const startX = Math.floor(camera.x / TILE);
    const endX = Math.ceil((camera.x + INTERNAL_W) / TILE);
    const startY = Math.floor(camera.y / TILE);
    const endY = Math.ceil((camera.y + INTERNAL_H) / TILE);
    for (let ty=startY; ty<endY; ty++) {
      for (let tx=startX; tx<endX; tx++) {
        if (tx<0||ty<0||tx>=width||ty>=height) continue;
        const t = tiles[ty*width + tx];
        if (t===0) continue;
        const names = ['empty','ground','platform','spike','crate','checkpoint','goal','lantern'];
        const n = names[t];
        drawSprite(n, tx*TILE - camera.x, ty*TILE - camera.y);
      }
    }
    // peppers
    peppers.forEach(p => {
      if (!p.taken) drawSprite('pepper', p.x - camera.x - 8, p.y - camera.y - 8);
    });
  }

  function drawEntities() {
    // Player
    const anim = player.onGround ? (Math.abs(player.vx)>10 ? ((Math.floor(now()*10)%2) ? 'hero_run1' : 'hero_run2') : 'hero_idle') : 'hero_jump';
    drawSprite(anim, player.x - camera.x, player.y - camera.y, player.facing<0);
    // Enemies
    enemyPool.items.forEach(e => {
      if (!e.active) return;
      const n = (Math.floor(now()*6)%2) ? 'pig_walk1' : 'pig_walk2';
      drawSprite(n, e.x - camera.x, e.y - camera.y, (player.x<e.x));
    });
    // Bullets
    bulletPool.items.forEach(b => {
      if (!b.active) return;
      drawSprite('bullet', b.x - camera.x, b.y - camera.y, b.vx<0);
    });
    // Explosions
    boomPool.items.forEach(b => {
      if (!b.active) return;
      const frame = Math.min(3, Math.floor(b.t/0.1));
      drawSprite('explosion'+frame, b.x - camera.x, b.y - camera.y);
    });
    // UI
    for (let i=0;i<3;i++) {
      drawSprite(i < player.hearts ? 'heart_full' : 'heart_empty', 4 + i*18, 4);
    }
    // cooldown bar
    const cd = Math.max(0, player.fireCooldown) / 0.25;
    bctx.fillStyle = '#222';
    bctx.fillRect(4, 24, 40, 4);
    bctx.fillStyle = '#f44';
    bctx.fillRect(4, 24, 40*(1-cd), 4);
    // score
    bctx.fillStyle = '#fff';
    bctx.font = '8px monospace';
    bctx.fillText('Peppers: '+player.score, 4, 38);
  }

  function tick() {
    const t = now(); dt = Math.min(0.033, t - last); last = t;
    if (!ready || !sprites || !atlas.complete) { requestAnimationFrame(tick); return; }

    // Update
    player.invuln -= dt;
    updatePlayer();
    updateEnemies();
    updateBullets();
    updateBooms();

    // Render to buffer
    bctx.imageSmoothingEnabled = false;
    drawWorld();
    drawEntities();

    // Present scaled
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0,0,CANVAS_W,CANVAS_H);
    ctx.drawImage(buf, 0, 0, CANVAS_W, CANVAS_H);

    requestAnimationFrame(tick);
  }

  loadLevel(levelIndex).then(_ => tick());
})();