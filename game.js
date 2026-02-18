
// ═══ CONFIG ═══
const WORLD_SIZE = 2000;
const SEGMENT_DIST = 8;
const BASE_SPEED = 3;
const BOOST_SPEED = 6;
const TURN_SPEED = 0.06;
const FOOD_COUNT = 200;
const DEFAULT_AI = 10;

// ═══ UTILS ═══
const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max));
const dist = (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
const lerp = (a, b, t) => a + (b - a) * t;

// ═══ COLOR UTILS (optimized — no per-frame string parsing) ═══
function hexToRgb(hex) {
    if (typeof hex === 'number') hex = '#' + hex.toString(16).padStart(6, '0');
    if (typeof hex !== 'string' || hex.length < 7) return { r: 128, g: 128, b: 128 };
    return {
        r: parseInt(hex.substring(1, 3), 16),
        g: parseInt(hex.substring(3, 5), 16),
        b: parseInt(hex.substring(5, 7), 16)
    };
}

function shadeRgb(rgb, pct) {
    return {
        r: Math.min(255, Math.max(0, Math.floor(rgb.r * (100 + pct) / 100))),
        g: Math.min(255, Math.max(0, Math.floor(rgb.g * (100 + pct) / 100))),
        b: Math.min(255, Math.max(0, Math.floor(rgb.b * (100 + pct) / 100)))
    };
}

function rgbStr(rgb, alpha) {
    if (alpha !== undefined) return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
    return `rgb(${rgb.r},${rgb.g},${rgb.b})`;
}

// Pre-compute a shaded hex string (used only during init, not per-frame)
function shadeColor(color, pct) {
    if (typeof color === 'string' && color.startsWith('hsl')) return color;
    const rgb = hexToRgb(color);
    const s = shadeRgb(rgb, pct);
    return `rgb(${s.r},${s.g},${s.b})`;
}

// ═══ PATTERN PRESETS (line dash patterns for snake bodies) ═══
const LINE_PATTERNS = [
    [],                     // solid
    [12, 6],               // dashes
    [4, 4],                // dots
    [16, 4, 4, 4],         // dash-dot
    [8, 4, 2, 4],          // morse
    [20, 8],               // long dash
    [6, 3],                // short dash
    [10, 3, 3, 3, 3, 3],   // dash-dot-dot
    [2, 8],                // sparse dots
    [14, 4, 6, 4],         // mixed
];

// ═══ SNAKE SKIN PRESETS ═══
const SKIN_PRESETS = [
    ['#2d8c3c', '#1a5c27', '#4aba5c'],
    ['#c0392b', '#8b1a1a', '#e74c3c'],
    ['#f39c12', '#c87604', '#f1c40f'],
    ['#8e44ad', '#5b2c80', '#bb6bd9'],
    ['#2980b9', '#1a5276', '#3498db'],
    ['#1abc9c', '#0e8c73', '#48d4a0'],
    ['#d35400', '#a04000', '#e67e22'],
    ['#2c3e50', '#1a252f', '#546e7a'],
    ['#e91e63', '#ad1457', '#f06292'],
    ['#795548', '#4e342e', '#a1887f'],
];

const PATTERN_SKINS = [
    { colors: ['#c0392b', '#f5f5f5'], name: '산호뱀' },
    { colors: ['#27ae60', '#f1c40f'], name: '독사' },
    { colors: ['#2c3e50', '#00bcd4'], name: '바다뱀' },
    { colors: ['#9b59b6', '#1a1a2e'], name: '독뱀' },
    { colors: ['#e67e22', '#ecf0f1'], name: '킹스네이크' },
];

// ═══ GAME CLASS ═══
class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();

        this.player = null;
        this.snakes = [];
        this.foods = [];

        this.camera = { x: 0, y: 0, zoom: 1 };
        this.mouse = { x: 0, y: 0, down: false };

        this.isRunning = false;
        this.isPaused = false;
        this.lives = 3;
        this.score = 0;
        this.keys = {};

        this.minimapCanvas = document.getElementById('minimap');
        this.minimapCtx = this.minimapCanvas.getContext('2d');

        // Grid cache (Fix 3)
        this.gridCanvas = null;
        this.gridDirty = true;

        // Viewport culling bounds (updated per frame)
        this.vpLeft = 0;
        this.vpRight = 0;
        this.vpTop = 0;
        this.vpBottom = 0;

        this.hudTimer = 0;

        this.initInput();
        this.loop();
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.gridDirty = true;
    }

    initInput() {
        window.addEventListener('resize', () => this.resize());

        window.addEventListener('mousemove', e => {
            this.mouse.x = e.clientX - this.width / 2;
            this.mouse.y = e.clientY - this.height / 2;
        });
        window.addEventListener('mousedown', () => this.mouse.down = true);
        window.addEventListener('mouseup', () => this.mouse.down = false);

        window.addEventListener('keydown', e => {
            this.keys[e.code] = true;
            if (e.code === 'Space') this.mouse.down = true;
            if (e.code === 'Escape' && this.isRunning) this.togglePause();
        });
        window.addEventListener('keyup', e => {
            this.keys[e.code] = false;
            if (e.code === 'Space') this.mouse.down = false;
        });

        document.getElementById('btn-start').addEventListener('click', () => {
            document.getElementById('start-screen').style.display = 'none';
            this.startGame();
        });
        document.getElementById('btn-restart').addEventListener('click', () => {
            document.getElementById('game-over-screen').style.display = 'none';
            this.backToStart();
        });
        document.getElementById('btn-continue').addEventListener('click', () => {
            this.continueGame();
        });
        document.getElementById('btn-pause').addEventListener('click', () => {
            this.togglePause();
        });
        document.getElementById('btn-resume').addEventListener('click', () => {
            this.togglePause();
        });
        document.getElementById('btn-pause-home').addEventListener('click', () => {
            document.getElementById('pause-screen').style.display = 'none';
            this.backToStart();
        });

        const aiSlider = document.getElementById('ai-count');
        const aiLabel = document.getElementById('ai-count-label');
        if (aiSlider && aiLabel) {
            aiSlider.addEventListener('input', e => aiLabel.innerText = e.target.value);
        }

        document.querySelectorAll('.skin-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.skin-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
            });
        });
    }

    startGame() {
        this.isRunning = true;
        this.snakes = [];
        this.foods = [];
        this.score = 0;
        this.lives = 3;
        Snake.idCounter = 0; // Reset ID counter for clean numbering

        const selectedSkin = document.querySelector('.skin-option.selected');
        let playerSkin;
        if (selectedSkin.dataset.type === 'solid') {
            const hex = selectedSkin.dataset.color;
            playerSkin = { primary: hex, secondary: shadeColor(hex, -30), accent: shadeColor(hex, 30) };
        } else {
            const pIdx = parseInt(selectedSkin.dataset.p);
            const p = PATTERN_SKINS[pIdx % PATTERN_SKINS.length];
            playerSkin = { primary: p.colors[0], secondary: p.colors[1], accent: p.colors[0], pattern: true };
        }

        this.player = new Snake(this, true, playerSkin);
        this.snakes.push(this.player);

        this.targetAICount = parseInt(document.getElementById('ai-count').value) || DEFAULT_AI;
        this.difficulty = document.getElementById('difficulty').value;

        for (let i = 0; i < this.targetAICount; i++) this.spawnAI();
        for (let i = 0; i < FOOD_COUNT; i++) this.spawnFood();

        document.getElementById('hud').style.display = 'block';
        this.updateHUD();
    }

    spawnAI() {
        const preset = SKIN_PRESETS[randInt(0, SKIN_PRESETS.length)];
        const skin = { primary: preset[0], secondary: preset[1], accent: preset[2] };
        if (Math.random() < 0.3) skin.pattern = true;
        const ai = new AISnake(this, false, skin, this.difficulty);
        this.snakes.push(ai);
    }

    spawnFood(pos = null, value = 1) {
        const isBig = value > 3;
        const hue = rand(0, 360);
        // Pre-compute color as RGB (Fix 4 — no per-frame string creation)
        const r0 = Math.floor(128 + 127 * Math.cos(hue * Math.PI / 180));
        const g0 = Math.floor(128 + 127 * Math.cos((hue - 120) * Math.PI / 180));
        const b0 = Math.floor(128 + 127 * Math.cos((hue + 120) * Math.PI / 180));
        const colorStr = `rgb(${r0},${g0},${b0})`;

        this.foods.push({
            x: pos ? pos.x : rand(-WORLD_SIZE + 20, WORLD_SIZE - 20),
            y: pos ? pos.y : rand(-WORLD_SIZE + 20, WORLD_SIZE - 20),
            radius: isBig ? 8 : rand(3, 6),
            value: value,
            color: colorStr,
            r: r0, g: g0, b: b0,
            pulse: rand(0, Math.PI * 2),
            active: true
        });
    }

    loop() {
        requestAnimationFrame(() => this.loop());
        if (!this.isRunning || this.isPaused) return;

        // Update
        this.snakes.forEach(s => s.update());
        this.snakes = this.snakes.filter(s => s.alive);

        const currentAI = this.snakes.filter(s => !s.isPlayer).length;
        if (currentAI < this.targetAICount) this.spawnAI();

        if (this.foods.length < FOOD_COUNT && Math.random() < 0.1) this.spawnFood();

        // Pulse food (batched, not individual timers)
        for (let i = 0; i < this.foods.length; i++) this.foods[i].pulse += 0.05;

        // Camera follow
        if (this.player && this.player.alive) {
            this.camera.x = lerp(this.camera.x, this.player.x, 0.08);
            this.camera.y = lerp(this.camera.y, this.player.y, 0.08);
        }

        // Compute viewport bounds for culling
        const halfW = (this.width / 2) / this.camera.zoom + 100;
        const halfH = (this.height / 2) / this.camera.zoom + 100;
        this.vpLeft = this.camera.x - halfW;
        this.vpRight = this.camera.x + halfW;
        this.vpTop = this.camera.y - halfH;
        this.vpBottom = this.camera.y + halfH;

        this.draw();

        // HUD updates throttled
        this.hudTimer++;
        if (this.hudTimer > 6) {
            this.updateHUD();
            this.drawMinimap();
            this.hudTimer = 0;
        }
    }

    draw() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        ctx.fillStyle = '#0a0e17';
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(this.camera.zoom, this.camera.zoom);
        ctx.translate(-this.camera.x, -this.camera.y);

        // ═══ Grid (cached — Fix 3) ═══
        this.drawGrid(ctx);

        // ═══ World Boundary — no shadowBlur ═══
        ctx.strokeStyle = 'rgba(255, 0, 80, 0.4)';
        ctx.lineWidth = 4;
        ctx.strokeRect(-WORLD_SIZE, -WORLD_SIZE, WORLD_SIZE * 2, WORLD_SIZE * 2);
        // Glow as second wider transparent stroke
        ctx.strokeStyle = 'rgba(255, 0, 80, 0.15)';
        ctx.lineWidth = 12;
        ctx.strokeRect(-WORLD_SIZE, -WORLD_SIZE, WORLD_SIZE * 2, WORLD_SIZE * 2);

        // ═══ Food (no shadowBlur — Fix 2) ═══
        for (let i = 0; i < this.foods.length; i++) {
            const f = this.foods[i];
            if (!f.active) continue;

            // Viewport culling
            if (f.x < this.vpLeft || f.x > this.vpRight || f.y < this.vpTop || f.y > this.vpBottom) continue;

            const r = f.radius + Math.sin(f.pulse) * 1.2;

            // Manual glow (cheap translucent circle instead of shadowBlur)
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = f.color;
            ctx.beginPath();
            ctx.arc(f.x, f.y, r * 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Main food circle (solid, no gradient — Fix 1 for food)
            ctx.globalAlpha = 1.0;
            // Simple 2-tone: highlight dot + base
            ctx.fillStyle = f.color;
            ctx.beginPath();
            ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
            ctx.fill();

            // Highlight dot
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath();
            ctx.arc(f.x - r * 0.3, f.y - r * 0.3, r * 0.35, 0, Math.PI * 2);
            ctx.fill();
        }

        // ═══ Snakes (sorted: smaller first) ═══
        const sorted = this.snakes.slice().sort((a, b) => a.nodes.length - b.nodes.length);
        for (let i = 0; i < sorted.length; i++) sorted[i].draw(ctx);

        ctx.restore();
    }

    // ═══ Grid — cached to offscreen canvas (Fix 3) ═══
    drawGrid(ctx) {
        if (this.gridDirty || !this.gridCanvas) {
            const gridSize = WORLD_SIZE * 2;
            // Use a smaller resolution for the grid cache (1/4 res)
            const scale = 0.25;
            const cw = gridSize * scale;
            const ch = gridSize * scale;

            this.gridCanvas = document.createElement('canvas');
            this.gridCanvas.width = cw;
            this.gridCanvas.height = ch;
            const gc = this.gridCanvas.getContext('2d');
            gc.scale(scale, scale);

            // Grid lines
            const spacing = 60;
            gc.strokeStyle = 'rgba(30, 50, 80, 0.3)';
            gc.lineWidth = 1 / scale; // compensate for scale
            gc.beginPath();
            for (let x = 0; x <= gridSize; x += spacing) {
                gc.moveTo(x, 0);
                gc.lineTo(x, gridSize);
            }
            for (let y = 0; y <= gridSize; y += spacing) {
                gc.moveTo(0, y);
                gc.lineTo(gridSize, y);
            }
            gc.stroke();

            // Vignette
            const grad = gc.createRadialGradient(gridSize / 2, gridSize / 2, 0, gridSize / 2, gridSize / 2, gridSize / 2);
            grad.addColorStop(0, 'rgba(20, 40, 60, 0.15)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
            gc.fillStyle = grad;
            gc.fillRect(0, 0, gridSize, gridSize);

            this.gridDirty = false;
        }

        // Blit cached grid
        ctx.drawImage(this.gridCanvas, -WORLD_SIZE, -WORLD_SIZE, WORLD_SIZE * 2, WORLD_SIZE * 2);
    }

    drawMinimap() {
        const ctx = this.minimapCtx;
        const size = 150;
        ctx.clearRect(0, 0, size, size);

        ctx.fillStyle = 'rgba(0, 20, 40, 0.9)';
        ctx.beginPath();
        ctx.arc(75, 75, 72, 0, Math.PI * 2);
        ctx.fill();

        const scale = size / (WORLD_SIZE * 2);
        const toMap = v => (v + WORLD_SIZE) * scale;

        // Foods (sparse — draw every 8th)
        ctx.fillStyle = 'rgba(0, 200, 180, 0.4)';
        for (let i = 0; i < this.foods.length; i += 8) {
            const f = this.foods[i];
            ctx.fillRect(toMap(f.x), toMap(f.y), 1, 1);
        }

        // Snakes
        for (let i = 0; i < this.snakes.length; i++) {
            const s = this.snakes[i];
            if (s.nodes.length === 0) continue;
            ctx.fillStyle = s.isPlayer ? '#00ff88' : '#ff3366';
            ctx.beginPath();
            ctx.arc(toMap(s.x), toMap(s.y), s.isPlayer ? 3 : 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(75, 75, 72, 0, Math.PI * 2);
        ctx.stroke();
    }

    updateHUD() {
        if (!this.player) return;
        document.getElementById('score').innerText = Math.floor(this.score);
        document.getElementById('length').innerText = this.player.nodes.length;
        document.getElementById('lives').innerText = '❤️'.repeat(this.lives);

        const boostPct = Math.max(0, (this.player.energy / 100) * 100);
        document.getElementById('boost-bar').style.width = `${boostPct}%`;

        const list = this.snakes.slice().sort((a, b) => b.nodes.length - a.nodes.length);
        const el = document.getElementById('ranking-list');
        el.innerHTML = '';
        let aiNum = 0;
        for (let i = 0; i < list.length; i++) {
            const s = list[i];
            const div = document.createElement('div');
            div.className = `rank-item ${s === this.player ? 'me' : ''}`;
            const name = s === this.player ? '나 🐍' : `AI ${++aiNum}`;
            div.innerHTML = `<span>#${i + 1} ${name}</span><span>${s.nodes.length}</span>`;
            el.appendChild(div);
        }
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        document.getElementById('pause-screen').style.display = this.isPaused ? 'flex' : 'none';
    }

    continueGame() {
        document.getElementById('game-over-screen').style.display = 'none';
        document.getElementById('hud').style.display = 'block';
        this.lives = 3;
        this.player.respawn();
        this.player.alive = true;
        if (!this.snakes.includes(this.player)) this.snakes.push(this.player);
        this.isRunning = true;
        this.isPaused = false;
    }

    backToStart() {
        this.isRunning = false;
        this.isPaused = false;
        document.getElementById('hud').style.display = 'none';
        document.getElementById('game-over-screen').style.display = 'none';
        document.getElementById('pause-screen').style.display = 'none';
        document.getElementById('start-screen').style.display = 'flex';
    }

    gameOver() {
        this.lives--;
        if (this.lives > 0) {
            this.player.respawn();
        } else {
            this.isRunning = false;
            document.getElementById('hud').style.display = 'none';
            document.getElementById('game-over-screen').style.display = 'flex';
            document.getElementById('final-score').innerText = Math.floor(this.score);
            document.getElementById('final-length').innerText = this.player.nodes.length;
        }
    }
}

// ═══ SNAKE CLASS ═══
class Snake {
    static idCounter = 0;

    constructor(game, isPlayer, skin) {
        this.game = game;
        this.isPlayer = isPlayer;
        this.id = Snake.idCounter++;
        this.skin = skin;

        // ═══ Pre-compute colors (Fix 4) ═══
        this.primaryRgb = hexToRgb(skin.primary);
        this.secondaryRgb = hexToRgb(skin.secondary);
        this.accentRgb = skin.accent ? hexToRgb(skin.accent) : this.primaryRgb;
        this.darkBorderColor = rgbStr(shadeRgb(this.primaryRgb, -60));
        this.headHighlight = rgbStr(shadeRgb(this.primaryRgb, 40));
        this.headDark = rgbStr(shadeRgb(this.primaryRgb, -50));
        this.snoutColor = rgbStr(shadeRgb(this.primaryRgb, 20));
        this.nostrilColor = rgbStr(shadeRgb(this.primaryRgb, -50));

        this.x = 0;
        this.y = 0;
        this.angle = rand(0, Math.PI * 2);
        this.targetAngle = this.angle;

        this.speed = BASE_SPEED;
        this.baseSpeed = BASE_SPEED;
        this.boostSpeed = BOOST_SPEED;
        this.turnSpeed = TURN_SPEED;
        this.energy = 100;
        this.boosting = false;

        this.nodes = [];
        this.alive = true;
        this.kills = 0;
        this.maxLength = 15;

        // Assign a unique pattern for this snake's body
        this.patternDash = LINE_PATTERNS[this.id % LINE_PATTERNS.length];

        this.tongueTimer = 0;
        this.tongueOut = false;

        this.respawn();
    }

    respawn() {
        this.x = rand(-WORLD_SIZE / 2, WORLD_SIZE / 2);
        this.y = rand(-WORLD_SIZE / 2, WORLD_SIZE / 2);
        this.angle = rand(0, Math.PI * 2);
        this.targetAngle = this.angle;
        this.alive = true;
        this.energy = 100;
        this.maxLength = 15;
        this.nodes = [];

        for (let i = 0; i < 15; i++) {
            this.nodes.push({
                x: this.x - Math.cos(this.angle) * i * SEGMENT_DIST,
                y: this.y - Math.sin(this.angle) * i * SEGMENT_DIST
            });
        }
    }

    update() {
        if (!this.alive) return;
        this.handleInput();
        this.move();
        this.checkCollision();

        this.tongueTimer -= 1;
        if (this.tongueTimer <= 0) {
            this.tongueOut = !this.tongueOut;
            this.tongueTimer = this.tongueOut ? 8 : randInt(30, 80);
        }

        if (!this.boosting && this.energy < 100) this.energy += 0.15;
    }

    handleInput() {
        if (this.isPlayer) {
            this.targetAngle = Math.atan2(this.game.mouse.y, this.game.mouse.x);

            if (this.game.keys['KeyA'] || this.game.keys['ArrowLeft']) this.targetAngle = this.angle - 0.15;
            if (this.game.keys['KeyD'] || this.game.keys['ArrowRight']) this.targetAngle = this.angle + 0.15;

            this.boosting = this.game.mouse.down && this.energy > 0;
            if (this.boosting) {
                this.energy -= 0.4;
                this.speed = this.boostSpeed;
                if (Math.random() < 0.15 && this.nodes.length > 15) {
                    const tail = this.nodes[this.nodes.length - 1];
                    this.game.spawnFood({ x: tail.x, y: tail.y }, 1);
                    this.nodes.pop();
                }
            } else {
                this.speed = this.baseSpeed;
            }
        } else {
            this.aiThink();
        }
    }

    move() {
        let diff = this.targetAngle - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.angle += diff * this.turnSpeed;

        const spd = this.boosting ? this.boostSpeed : this.speed;
        this.x += Math.cos(this.angle) * spd;
        this.y += Math.sin(this.angle) * spd;

        if (this.x < -WORLD_SIZE) this.x = -WORLD_SIZE;
        if (this.x > WORLD_SIZE) this.x = WORLD_SIZE;
        if (this.y < -WORLD_SIZE) this.y = -WORLD_SIZE;
        if (this.y > WORLD_SIZE) this.y = WORLD_SIZE;

        this.nodes.unshift({ x: this.x, y: this.y });

        for (let i = 1; i < this.nodes.length; i++) {
            const prev = this.nodes[i - 1];
            const curr = this.nodes[i];
            const dx = prev.x - curr.x;
            const dy = prev.y - curr.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > SEGMENT_DIST) {
                const t = (d - SEGMENT_DIST) / d;
                curr.x += dx * t;
                curr.y += dy * t;
            }
        }

        while (this.nodes.length > this.maxLength) this.nodes.pop();
    }

    checkCollision() {
        const headR = this.getBodyWidth() / 2;

        // Food — use squared distance to avoid sqrt
        for (let i = this.game.foods.length - 1; i >= 0; i--) {
            const f = this.game.foods[i];
            if (!f.active) continue;
            const dx = this.x - f.x;
            const dy = this.y - f.y;
            const range = headR + f.radius;
            if (dx * dx + dy * dy < range * range) {
                f.active = false;
                this.game.foods.splice(i, 1);
                this.grow(f.value);
                if (this.isPlayer) this.game.score += f.value * 10;
            }
        }

        // Snake collision
        for (let si = 0; si < this.game.snakes.length; si++) {
            const other = this.game.snakes[si];
            if (other === this || !other.alive) continue;

            const maxRange = other.nodes.length * SEGMENT_DIST + 50;
            const dx0 = this.x - other.x;
            const dy0 = this.y - other.y;
            if (dx0 * dx0 + dy0 * dy0 > maxRange * maxRange) continue;

            const otherR = other.getBodyWidth() / 2;
            for (let i = 4; i < other.nodes.length; i += 2) {
                const seg = other.nodes[i];
                const range2 = headR + otherR - 2;
                const sdx = this.x - seg.x;
                const sdy = this.y - seg.y;
                if (sdx * sdx + sdy * sdy < range2 * range2) {
                    this.die(other);
                    return;
                }
            }
        }
    }

    getBodyWidth() {
        return Math.min(14, 6 + Math.floor(this.nodes.length / 12));
    }

    grow(amount) {
        this.maxLength += amount * 2;
    }

    die(killer) {
        this.alive = false;
        if (killer) killer.kills++;
        for (let i = 0; i < this.nodes.length; i += 3) {
            this.game.spawnFood(this.nodes[i], 3);
        }
        if (this.isPlayer) this.game.gameOver();
    }

    aiThink() { }

    // ═══ LINE-BASED DRAWING (ultra fast) ═══
    draw(ctx) {
        if (this.nodes.length < 2) return;

        const total = this.nodes.length;
        const vp = this.game;
        const margin = total * SEGMENT_DIST;
        if (this.x + margin < vp.vpLeft || this.x - margin > vp.vpRight ||
            this.y + margin < vp.vpTop || this.y - margin > vp.vpBottom) return;

        const w = this.getBodyWidth();

        // Build path once, reuse for all passes
        // --- Pass 1: Shadow ---
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.08;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = w + 4;
        ctx.beginPath();
        ctx.moveTo(this.nodes[0].x + 3, this.nodes[0].y + 4);
        for (let i = 1; i < total; i += 2) {
            ctx.lineTo(this.nodes[i].x + 3, this.nodes[i].y + 4);
        }
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // --- Pass 2: Dark outline ---
        ctx.strokeStyle = this.darkBorderColor;
        ctx.lineWidth = w + 3;
        ctx.beginPath();
        ctx.moveTo(this.nodes[0].x, this.nodes[0].y);
        for (let i = 1; i < total; i++) ctx.lineTo(this.nodes[i].x, this.nodes[i].y);
        ctx.stroke();

        // --- Pass 3: Main body color ---
        ctx.strokeStyle = rgbStr(this.primaryRgb);
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(this.nodes[0].x, this.nodes[0].y);
        for (let i = 1; i < total; i++) ctx.lineTo(this.nodes[i].x, this.nodes[i].y);
        ctx.stroke();

        // --- Pass 4: Pattern overlay ---
        if (this.patternDash.length > 0) {
            ctx.setLineDash(this.patternDash);
            ctx.strokeStyle = rgbStr(this.secondaryRgb);
            ctx.lineWidth = w - 2;
            ctx.beginPath();
            ctx.moveTo(this.nodes[0].x, this.nodes[0].y);
            for (let i = 1; i < total; i++) ctx.lineTo(this.nodes[i].x, this.nodes[i].y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // --- Pass 5: Highlight stripe (center line for 3D feel) ---
        ctx.globalAlpha = 0.15;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = Math.max(1, w * 0.25);
        ctx.beginPath();
        ctx.moveTo(this.nodes[0].x, this.nodes[0].y);
        for (let i = 1; i < total; i += 2) ctx.lineTo(this.nodes[i].x, this.nodes[i].y);
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // Head
        this.drawHead(ctx);
    }

    drawHead(ctx) {
        const head = this.nodes[0];
        const w = this.getBodyWidth();
        const r = w * 0.7;
        const angle = this.angle;

        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(angle);

        // Head ellipse (dark outline)
        ctx.fillStyle = this.darkBorderColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.4, r * 1.1, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head color
        ctx.fillStyle = rgbStr(this.primaryRgb);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.3, r * 1.0, 0, 0, Math.PI * 2);
        ctx.fill();

        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.2, -r * 0.2, r * 0.7, r * 0.4, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Tongue
        if (this.tongueOut) {
            ctx.strokeStyle = '#cc2244';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(r * 1.3, 0);
            ctx.lineTo(r * 2.0, 0);
            ctx.moveTo(r * 1.8, 0);
            ctx.lineTo(r * 2.2, -r * 0.3);
            ctx.moveTo(r * 1.8, 0);
            ctx.lineTo(r * 2.2, r * 0.3);
            ctx.stroke();
        }

        // Eyes
        const ex = r * 0.5;
        const ey = r * 0.55;
        const er = r * 0.25;

        ctx.fillStyle = '#f0e68c';
        ctx.beginPath();
        ctx.arc(ex, -ey, er, 0, Math.PI * 2);
        ctx.arc(ex, ey, er, 0, Math.PI * 2);
        ctx.fill();

        // Pupils (vertical slit)
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.ellipse(ex, -ey, er * 0.2, er * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(ex, ey, er * 0.2, er * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Name tag
        if (this.isPlayer) {
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.font = 'bold 12px Outfit';
            ctx.textAlign = 'center';
            ctx.fillText('나', head.x, head.y - r - 8);
        }
    }
}

// ═══ AI SNAKE CLASS ═══
class AISnake extends Snake {
    constructor(game, isPlayer, skin, difficulty) {
        super(game, isPlayer, skin);

        switch (difficulty) {
            case 'easy':
                this.turnSpeed = 0.04;
                this.fov = 150;
                this.reactTimer = 50;
                break;
            case 'hard':
                this.turnSpeed = 0.09;
                this.fov = 350;
                this.reactTimer = 15;
                break;
            case 'normal':
            default:
                this.turnSpeed = 0.06;
                this.fov = 250;
                this.reactTimer = 30;
                break;
        }
        this.timer = 0;
        this.target = null;
    }

    aiThink() {
        this.timer--;

        // Collision Avoidance — optimized with squared distances
        const feelers = [
            { angle: 0, d: this.fov * 0.3 },
            { angle: 0.4, d: this.fov * 0.2 },
            { angle: -0.4, d: this.fov * 0.2 }
        ];

        let dangerLeft = 0;
        let dangerRight = 0;

        for (let fi = 0; fi < 3; fi++) {
            const f = feelers[fi];
            const fa = this.angle + f.angle;
            const fx = this.x + Math.cos(fa) * f.d;
            const fy = this.y + Math.sin(fa) * f.d;

            if (fx < -WORLD_SIZE + 100 || fx > WORLD_SIZE - 100 ||
                fy < -WORLD_SIZE + 100 || fy > WORLD_SIZE - 100) {
                if (f.angle > 0) dangerLeft += 10;
                else if (f.angle < 0) dangerRight += 10;
                else { dangerLeft += 5; dangerRight += 5; }
            }

            // Only check nearby snakes (squared distance pre-filter)
            for (let si = 0; si < this.game.snakes.length; si++) {
                const s = this.game.snakes[si];
                if (!s.alive || s === this) continue;

                // Quick distance check to head
                const hd = (fx - s.x) * (fx - s.x) + (fy - s.y) * (fy - s.y);
                const maxCheckDist = s.nodes.length * SEGMENT_DIST + 50;
                if (hd > maxCheckDist * maxCheckDist) continue;

                for (let i = 0; i < s.nodes.length; i += 5) {
                    const sdx = fx - s.nodes[i].x;
                    const sdy = fy - s.nodes[i].y;
                    const threshold = s.getBodyWidth() / 2 + 10;
                    if (sdx * sdx + sdy * sdy < threshold * threshold) {
                        if (f.angle > 0) dangerLeft += 10;
                        else if (f.angle < 0) dangerRight += 10;
                        else { dangerLeft += 5; dangerRight += 5; }
                        break; // One hit per snake is enough
                    }
                }
            }
        }

        if (dangerLeft > dangerRight) {
            this.targetAngle = this.angle - this.turnSpeed * 3;
            this.boosting = this.energy > 30;
            if (this.boosting) this.energy -= 0.3;
            return;
        } else if (dangerRight > dangerLeft) {
            this.targetAngle = this.angle + this.turnSpeed * 3;
            this.boosting = this.energy > 30;
            if (this.boosting) this.energy -= 0.3;
            return;
        }

        this.boosting = false;

        // Border avoidance
        const margin = 200;
        if (this.x < -WORLD_SIZE + margin) { this.targetAngle = 0; return; }
        if (this.x > WORLD_SIZE - margin) { this.targetAngle = Math.PI; return; }
        if (this.y < -WORLD_SIZE + margin) { this.targetAngle = Math.PI / 2; return; }
        if (this.y > WORLD_SIZE - margin) { this.targetAngle = -Math.PI / 2; return; }

        // Food Seeking
        if (this.timer <= 0 || !this.target || !this.target.active) {
            this.target = this.findBestFood();
            this.timer = this.reactTimer;
        }

        if (this.target) {
            this.targetAngle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        } else {
            if (Math.random() < 0.03) this.targetAngle += rand(-0.5, 0.5);
        }
    }

    findBestFood() {
        let best = null;
        let bestScore = -Infinity;
        const foods = this.game.foods;
        const len = foods.length;

        for (let i = 0; i < 20; i++) {
            const f = foods[randInt(0, len)];
            if (!f || !f.active) continue;
            const dx = this.x - f.x;
            const dy = this.y - f.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > this.fov * this.fov) continue;
            const score = f.value / (d2 + 1);
            if (score > bestScore) {
                bestScore = score;
                best = f;
            }
        }
        return best;
    }
}

// ═══ INIT ═══
window.onload = () => new Game();
