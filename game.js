
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
const hslToStr = (h, s, l) => `hsl(${h},${s}%,${l}%)`;

// ═══ SNAKE SKIN PRESETS ═══
const SKIN_PRESETS = [
    // [primary, secondary, accent] — realistic color combos
    ['#2d8c3c', '#1a5c27', '#4aba5c'],   // 초록 뱀
    ['#c0392b', '#8b1a1a', '#e74c3c'],   // 붉은 뱀
    ['#f39c12', '#c87604', '#f1c40f'],   // 황금 뱀
    ['#8e44ad', '#5b2c80', '#bb6bd9'],   // 보라 뱀
    ['#2980b9', '#1a5276', '#3498db'],   // 파란 뱀
    ['#1abc9c', '#0e8c73', '#48d4a0'],   // 민트 뱀
    ['#d35400', '#a04000', '#e67e22'],   // 주황 뱀
    ['#2c3e50', '#1a252f', '#546e7a'],   // 검은 뱀
    ['#e91e63', '#ad1457', '#f06292'],   // 분홍 뱀
    ['#795548', '#4e342e', '#a1887f'],   // 갈색 뱀
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
        this.lives = 3;
        this.score = 0;
        this.keys = {};

        this.minimapCanvas = document.getElementById('minimap');
        this.minimapCtx = this.minimapCanvas.getContext('2d');

        // Background cache
        this.bgCanvas = null;
        this.bgDirty = true;

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
        this.bgDirty = true;
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
        });
        window.addEventListener('keyup', e => {
            this.keys[e.code] = false;
            if (e.code === 'Space') this.mouse.down = false;
        });

        // UI Buttons
        document.getElementById('btn-start').addEventListener('click', () => {
            document.getElementById('start-screen').style.display = 'none';
            this.startGame();
        });
        document.getElementById('btn-restart').addEventListener('click', () => {
            document.getElementById('game-over-screen').style.display = 'none';
            document.getElementById('start-screen').style.display = 'flex';
        });

        // AI Slider
        const aiSlider = document.getElementById('ai-count');
        const aiLabel = document.getElementById('ai-count-label');
        if (aiSlider && aiLabel) {
            aiSlider.addEventListener('input', e => aiLabel.innerText = e.target.value);
        }

        // Skin Selector
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

        // Player skin
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

        // AI Settings
        this.targetAICount = parseInt(document.getElementById('ai-count').value) || DEFAULT_AI;
        this.difficulty = document.getElementById('difficulty').value;

        for (let i = 0; i < this.targetAICount; i++) {
            this.spawnAI();
        }
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
        this.foods.push({
            x: pos ? pos.x : rand(-WORLD_SIZE + 20, WORLD_SIZE - 20),
            y: pos ? pos.y : rand(-WORLD_SIZE + 20, WORLD_SIZE - 20),
            radius: isBig ? 8 : rand(3, 6),
            value: value,
            color: `hsl(${rand(0, 360)}, 80%, 60%)`,
            glowColor: `hsla(${rand(0, 360)}, 100%, 70%, 0.4)`,
            pulse: rand(0, Math.PI * 2),
            active: true
        });
    }

    loop() {
        requestAnimationFrame(() => this.loop());
        if (!this.isRunning) return;

        // Update
        this.snakes.forEach(s => s.update());
        this.snakes = this.snakes.filter(s => s.alive);

        // Respawn AI
        const currentAI = this.snakes.filter(s => !s.isPlayer).length;
        if (currentAI < this.targetAICount) this.spawnAI();

        // Respawn food
        if (this.foods.length < FOOD_COUNT && Math.random() < 0.1) this.spawnFood();

        // Pulse food
        this.foods.forEach(f => f.pulse += 0.05);

        // Camera follow
        if (this.player && this.player.alive) {
            this.camera.x = lerp(this.camera.x, this.player.x, 0.08);
            this.camera.y = lerp(this.camera.y, this.player.y, 0.08);
        }

        this.draw();
        if (Math.random() < 0.1) this.updateHUD();
        this.drawMinimap();
    }

    draw() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // ═══ Background ═══
        ctx.fillStyle = '#0a0e17';
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(this.camera.zoom, this.camera.zoom);
        ctx.translate(-this.camera.x, -this.camera.y);

        // ═══ Grid (pseudo-3D perspective feel) ═══
        this.drawGrid(ctx);

        // ═══ World Boundary ═══
        ctx.strokeStyle = 'rgba(255, 0, 80, 0.4)';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'rgba(255, 0, 80, 0.6)';
        ctx.strokeRect(-WORLD_SIZE, -WORLD_SIZE, WORLD_SIZE * 2, WORLD_SIZE * 2);
        ctx.shadowBlur = 0;

        // ═══ Food ═══
        this.foods.forEach(f => {
            if (!f.active) return;
            const r = f.radius + Math.sin(f.pulse) * 1.5;

            // Glow
            ctx.shadowBlur = 12;
            ctx.shadowColor = f.glowColor;

            // 3D-ish food with gradient
            const grad = ctx.createRadialGradient(f.x - r * 0.3, f.y - r * 0.3, 0, f.x, f.y, r);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.3, f.color);
            grad.addColorStop(1, shadeColor(f.color, -40));

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });

        // ═══ Snakes (sorted: smaller first) ═══
        const sorted = [...this.snakes].sort((a, b) => a.nodes.length - b.nodes.length);
        sorted.forEach(s => s.draw(ctx));

        ctx.restore();
    }

    drawGrid(ctx) {
        const spacing = 60;
        const startX = Math.floor((-WORLD_SIZE) / spacing) * spacing;
        const startY = Math.floor((-WORLD_SIZE) / spacing) * spacing;

        ctx.strokeStyle = 'rgba(30, 50, 80, 0.3)';
        ctx.lineWidth = 1;

        ctx.beginPath();
        for (let x = startX; x <= WORLD_SIZE; x += spacing) {
            ctx.moveTo(x, -WORLD_SIZE);
            ctx.lineTo(x, WORLD_SIZE);
        }
        for (let y = startY; y <= WORLD_SIZE; y += spacing) {
            ctx.moveTo(-WORLD_SIZE, y);
            ctx.lineTo(WORLD_SIZE, y);
        }
        ctx.stroke();

        // Subtle radial vignette on the ground
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, WORLD_SIZE);
        grad.addColorStop(0, 'rgba(20, 40, 60, 0.15)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
        ctx.fillStyle = grad;
        ctx.fillRect(-WORLD_SIZE, -WORLD_SIZE, WORLD_SIZE * 2, WORLD_SIZE * 2);
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

        // Foods (sparse)
        ctx.fillStyle = 'rgba(0, 200, 180, 0.4)';
        for (let i = 0; i < this.foods.length; i += 5) {
            const f = this.foods[i];
            ctx.fillRect(toMap(f.x), toMap(f.y), 1, 1);
        }

        // Snakes
        this.snakes.forEach(s => {
            if (s.nodes.length === 0) return;
            ctx.fillStyle = s.isPlayer ? '#00ff88' : '#ff3366';
            ctx.beginPath();
            ctx.arc(toMap(s.x), toMap(s.y), s.isPlayer ? 3 : 2, 0, Math.PI * 2);
            ctx.fill();
        });

        // Border
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

        const list = [...this.snakes].sort((a, b) => b.nodes.length - a.nodes.length);
        const el = document.getElementById('ranking-list');
        el.innerHTML = '';
        list.slice(0, 5).forEach((s, i) => {
            const div = document.createElement('div');
            div.className = `rank-item ${s === this.player ? 'me' : ''}`;
            const name = s === this.player ? '플레이어' : `AI #${s.id}`;
            div.innerHTML = `<span>#${i + 1} ${name}</span><span>${s.nodes.length}</span>`;
            el.appendChild(div);
        });
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

        // Visual properties
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

        // Tongue flick timer
        this.tongueTimer -= 1;
        if (this.tongueTimer <= 0) {
            this.tongueOut = !this.tongueOut;
            this.tongueTimer = this.tongueOut ? 8 : randInt(30, 80);
        }

        if (!this.boosting && this.energy < 100) this.energy += 0.15;
    }

    handleInput() {
        if (this.isPlayer) {
            // Mouse direction
            this.targetAngle = Math.atan2(this.game.mouse.y, this.game.mouse.x);

            // Keyboard override
            if (this.game.keys['KeyA'] || this.game.keys['ArrowLeft']) this.targetAngle = this.angle - 0.15;
            if (this.game.keys['KeyD'] || this.game.keys['ArrowRight']) this.targetAngle = this.angle + 0.15;
            if (this.game.keys['KeyW'] || this.game.keys['ArrowUp']) { /* keep current angle, just go forward */ }

            this.boosting = this.game.mouse.down && this.energy > 0;
            if (this.boosting) {
                this.energy -= 0.4;
                this.speed = this.boostSpeed;
                // Drop trail
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
        // Smooth turning
        let diff = this.targetAngle - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.angle += diff * this.turnSpeed;

        const spd = this.boosting ? this.boostSpeed : this.speed;
        this.x += Math.cos(this.angle) * spd;
        this.y += Math.sin(this.angle) * spd;

        // Clamp to world
        if (this.x < -WORLD_SIZE) this.x = -WORLD_SIZE;
        if (this.x > WORLD_SIZE) this.x = WORLD_SIZE;
        if (this.y < -WORLD_SIZE) this.y = -WORLD_SIZE;
        if (this.y > WORLD_SIZE) this.y = WORLD_SIZE;

        // Add new head node
        this.nodes.unshift({ x: this.x, y: this.y });

        // Segment following (smooth)
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

        // Trim excess
        const maxNodes = Math.max(15, this.nodes.length);
        while (this.nodes.length > maxNodes) this.nodes.pop();
    }

    checkCollision() {
        // Food
        const headR = this.getRadius(0);
        for (let i = this.game.foods.length - 1; i >= 0; i--) {
            const f = this.game.foods[i];
            if (!f.active) continue;
            if (dist(this.x, this.y, f.x, f.y) < headR + f.radius) {
                f.active = false;
                this.game.foods.splice(i, 1);
                this.grow(f.value);
                if (this.isPlayer) this.game.score += f.value * 10;
            }
        }

        // Snake collision
        for (const other of this.game.snakes) {
            if (other === this || !other.alive) continue;
            if (dist(this.x, this.y, other.x, other.y) > other.nodes.length * SEGMENT_DIST + 50) continue;

            for (let i = 4; i < other.nodes.length; i += 2) {
                const seg = other.nodes[i];
                const otherR = other.getRadius(i);
                if (dist(this.x, this.y, seg.x, seg.y) < headR + otherR - 2) {
                    this.die(other);
                    return;
                }
            }
        }
    }

    getRadius(index) {
        const total = this.nodes.length;
        if (total === 0) return 6;
        const t = index / total;
        // Head is slightly narrower, body fattens, tapers at tail
        const baseR = 5 + Math.floor(total / 15);
        if (t < 0.05) return baseR * 0.85; // Head - slightly narrower
        if (t < 0.15) return baseR * lerp(0.85, 1.0, (t - 0.05) / 0.1); // Neck widens
        if (t > 0.8) return baseR * lerp(1.0, 0.3, (t - 0.8) / 0.2); // Tail tapers
        return baseR;
    }

    grow(amount) {
        const tail = this.nodes[this.nodes.length - 1];
        for (let i = 0; i < amount * 2; i++) {
            this.nodes.push({ x: tail.x, y: tail.y });
        }
    }

    die(killer) {
        this.alive = false;
        if (killer) killer.kills++;
        // Drop food
        for (let i = 0; i < this.nodes.length; i += 3) {
            this.game.spawnFood(this.nodes[i], 3);
        }
        if (this.isPlayer) this.game.gameOver();
    }

    aiThink() { }

    // ═══ DRAWING ═══
    draw(ctx) {
        if (this.nodes.length < 2) return;

        const total = this.nodes.length;

        // ═══ Drop Shadow ═══
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = '#000';
        for (let i = 0; i < total; i += 2) {
            const n = this.nodes[i];
            const r = this.getRadius(i);
            ctx.beginPath();
            ctx.arc(n.x + 4, n.y + 6, r + 1, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // ═══ Body (thick outline for 3D depth) ═══
        // Dark outline pass
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw body segments as circles with gradient for 3D effect
        for (let i = total - 1; i >= 1; i--) {
            const n = this.nodes[i];
            const r = this.getRadius(i);
            const t = i / total;

            // Determine color
            let baseColor = this.skin.primary;
            if (this.skin.pattern && i % 6 < 3) {
                baseColor = this.skin.secondary;
            }

            // 3D sphere gradient per segment
            const grad = ctx.createRadialGradient(
                n.x - r * 0.3, n.y - r * 0.3, r * 0.1,
                n.x, n.y, r
            );
            grad.addColorStop(0, shadeColor(baseColor, 50));  // highlight
            grad.addColorStop(0.5, baseColor);
            grad.addColorStop(1, shadeColor(baseColor, -40)); // shadow

            // Dark border
            ctx.beginPath();
            ctx.arc(n.x, n.y, r + 1, 0, Math.PI * 2);
            ctx.fillStyle = shadeColor(baseColor, -60);
            ctx.fill();

            // Main body
            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();

            // Scale pattern (subtle diamond marks)
            if (i % 3 === 0 && r > 4) {
                ctx.save();
                ctx.globalAlpha = 0.15;
                ctx.translate(n.x, n.y);
                const segAngle = Math.atan2(
                    this.nodes[Math.max(0, i - 1)].y - n.y,
                    this.nodes[Math.max(0, i - 1)].x - n.x
                );
                ctx.rotate(segAngle);

                ctx.fillStyle = '#000';
                // Diamond scale
                ctx.beginPath();
                ctx.moveTo(0, -r * 0.4);
                ctx.lineTo(r * 0.3, 0);
                ctx.lineTo(0, r * 0.4);
                ctx.lineTo(-r * 0.3, 0);
                ctx.closePath();
                ctx.fill();

                ctx.restore();
            }
        }

        // ═══ Head ═══
        this.drawHead(ctx);
    }

    drawHead(ctx) {
        const head = this.nodes[0];
        const r = this.getRadius(0);
        const angle = this.angle;

        // Head shape (elongated ellipse)
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(angle);

        // Head shadow
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(3, 5, r * 1.3, r * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Head gradient (3D)
        const headGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.3, 0, 0, 0, r * 1.3);
        headGrad.addColorStop(0, shadeColor(this.skin.primary, 40));
        headGrad.addColorStop(0.6, this.skin.primary);
        headGrad.addColorStop(1, shadeColor(this.skin.primary, -50));

        // Dark outline
        ctx.fillStyle = shadeColor(this.skin.primary, -60);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.35, r * 1.0, 0, 0, Math.PI * 2);
        ctx.fill();

        // Main head
        ctx.fillStyle = headGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.3, r * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();

        // Snout (lighter triangle at front)
        ctx.fillStyle = shadeColor(this.skin.primary, 20);
        ctx.beginPath();
        ctx.moveTo(r * 1.3, 0);
        ctx.lineTo(r * 0.6, -r * 0.5);
        ctx.lineTo(r * 0.6, r * 0.5);
        ctx.closePath();
        ctx.globalAlpha = 0.3;
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // ═══ Tongue ═══
        if (this.tongueOut) {
            ctx.strokeStyle = '#cc2244';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(r * 1.3, 0);
            ctx.lineTo(r * 1.3 + r * 0.8, 0);
            // Fork
            ctx.moveTo(r * 1.3 + r * 0.6, 0);
            ctx.lineTo(r * 1.3 + r * 1.0, -r * 0.25);
            ctx.moveTo(r * 1.3 + r * 0.6, 0);
            ctx.lineTo(r * 1.3 + r * 1.0, r * 0.25);
            ctx.stroke();
        }

        // ═══ Eyes ═══
        const eyeOffX = r * 0.55;
        const eyeOffY = r * 0.5;
        const eyeR = r * 0.22;
        const pupilR = eyeR * 0.55;

        // Left eye
        ctx.fillStyle = '#f0e68c'; // yellowish snake eye
        ctx.beginPath();
        ctx.ellipse(eyeOffX, -eyeOffY, eyeR, eyeR * 1.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Left pupil (vertical slit)
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.ellipse(eyeOffX, -eyeOffY, pupilR * 0.35, pupilR * 1.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Right eye
        ctx.fillStyle = '#f0e68c';
        ctx.beginPath();
        ctx.ellipse(eyeOffX, eyeOffY, eyeR, eyeR * 1.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Right pupil
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.ellipse(eyeOffX, eyeOffY, pupilR * 0.35, pupilR * 1.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Eye highlight
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(eyeOffX - pupilR * 0.3, -eyeOffY - pupilR * 0.4, pupilR * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(eyeOffX - pupilR * 0.3, eyeOffY - pupilR * 0.4, pupilR * 0.35, 0, Math.PI * 2);
        ctx.fill();

        // Nostril dots
        ctx.fillStyle = shadeColor(this.skin.primary, -50);
        ctx.beginPath();
        ctx.arc(r * 1.1, -r * 0.15, 1, 0, Math.PI * 2);
        ctx.arc(r * 1.1, r * 0.15, 1, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // ═══ Name tag ═══
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

        // ═══ Collision Avoidance ═══
        const feelers = [
            { angle: 0, dist: this.fov * 0.3 },
            { angle: 0.4, dist: this.fov * 0.2 },
            { angle: -0.4, dist: this.fov * 0.2 }
        ];

        let dangerLeft = 0;
        let dangerRight = 0;

        for (const f of feelers) {
            const fa = this.angle + f.angle;
            const fx = this.x + Math.cos(fa) * f.dist;
            const fy = this.y + Math.sin(fa) * f.dist;

            // Wall check
            if (fx < -WORLD_SIZE + 100 || fx > WORLD_SIZE - 100 ||
                fy < -WORLD_SIZE + 100 || fy > WORLD_SIZE - 100) {
                if (f.angle > 0) dangerLeft += 10;
                else if (f.angle < 0) dangerRight += 10;
                else { dangerLeft += 5; dangerRight += 5; }
            }

            // Snake collision check
            for (const s of this.game.snakes) {
                if (!s.alive || s === this) continue;
                for (let i = 0; i < s.nodes.length; i += 4) {
                    if (dist(fx, fy, s.nodes[i].x, s.nodes[i].y) < s.getRadius(i) + 10) {
                        if (f.angle > 0) dangerLeft += 10;
                        else if (f.angle < 0) dangerRight += 10;
                        else { dangerLeft += 5; dangerRight += 5; }
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

        // ═══ Border Avoidance ═══
        const margin = 200;
        if (this.x < -WORLD_SIZE + margin) { this.targetAngle = 0; return; }
        if (this.x > WORLD_SIZE - margin) { this.targetAngle = Math.PI; return; }
        if (this.y < -WORLD_SIZE + margin) { this.targetAngle = Math.PI / 2; return; }
        if (this.y > WORLD_SIZE - margin) { this.targetAngle = -Math.PI / 2; return; }

        // ═══ Food Seeking ═══
        if (this.timer <= 0 || !this.target || !this.target.active) {
            this.target = this.findBestFood();
            this.timer = this.reactTimer;
        }

        if (this.target) {
            this.targetAngle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        } else {
            // Wander
            if (Math.random() < 0.03) this.targetAngle += rand(-0.5, 0.5);
        }
    }

    findBestFood() {
        let best = null;
        let bestScore = -Infinity;

        for (let i = 0; i < 30; i++) {
            const f = this.game.foods[randInt(0, this.game.foods.length)];
            if (!f || !f.active) continue;
            const d = dist(this.x, this.y, f.x, f.y);
            if (d > this.fov) continue;
            const score = f.value / (d + 1);
            if (score > bestScore) {
                bestScore = score;
                best = f;
            }
        }
        return best;
    }
}

// ═══ UTILITY ═══
function shadeColor(color, percent) {
    // Handle hsl() strings
    if (typeof color === 'string' && color.startsWith('hsl')) {
        return color; // Can't easily shade hsl strings, return as-is
    }
    // Handle hex numbers
    if (typeof color === 'number') {
        color = '#' + color.toString(16).padStart(6, '0');
    }
    // Handle hex string
    let R = parseInt(color.substring(1, 3), 16);
    let G = parseInt(color.substring(3, 5), 16);
    let B = parseInt(color.substring(5, 7), 16);

    R = Math.min(255, Math.max(0, Math.floor(R * (100 + percent) / 100)));
    G = Math.min(255, Math.max(0, Math.floor(G * (100 + percent) / 100)));
    B = Math.min(255, Math.max(0, Math.floor(B * (100 + percent) / 100)));

    return '#' + R.toString(16).padStart(2, '0') + G.toString(16).padStart(2, '0') + B.toString(16).padStart(2, '0');
}

// ═══ INIT ═══
window.onload = () => new Game();
