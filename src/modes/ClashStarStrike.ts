import { Brawler } from "../entities/Brawler";
import { Bot } from "../entities/Bot";
import { BRAWLERS, getBrawlerById, pickBotStats } from "../entities/BrawlerData";
import { Camera } from "../game/Camera";
import { InputHandler } from "../game/InputHandler";
import { GameMap, collidesWithWalls, createTileGridMap, renderMap, renderTileGrid } from "../game/MapRenderer";
import { TileGrid, TileType, setTile, TILE_CELL_SIZE } from "../game/TileMap";
import { Projectile, renderProjectiles, updateProjectiles } from "../entities/Projectile";
import { updateDamageNumbers, renderDamageNumbers, clearDamageNumbers } from "../utils/damageNumbers";
import { updateEffects, renderEffects, clearEffects } from "../utils/effects";
import { angleTo, autoAimAngle, autoAimTarget, distance, randomInt } from "../utils/helpers";
import { getCurrentProfile, getCurrentUsername, recordGameResult } from "../utils/localStorageAPI";
import { getBrawlerStars } from "../utils/constellations";
import { getPetById } from "../entities/PetData";
import { getMatchStats, resetMatchStats } from "../utils/matchStats";
import { getStarBallCanvas } from "../utils/powerModelCache";
import * as THREE from "three";
import {
  integrateBallRolling,
  isRollingBallFrameBlank,
  isRollingStarBallReady,
  renderRollingStarBall,
} from "../game/soccerBallRenderer";
import { applyZafkielStarEffectsOnHit } from "../utils/zafkielStars";
import { fillBattleCanvasBg, renderBattleScreenFX } from "../game/battleScreenFX";
import { isDevBattleWorldFrozen } from "../game/battleDevPause";
import { StarStrikeVisualLayer } from "./starstrikeVisual/StarStrikeVisualLayer";

const GAME_ZOOM = 1.4;
const CAM_W = Math.round(1200 / GAME_ZOOM);
const CAM_H = Math.round(800 / GAME_ZOOM);

type StarStrikeFormat = "3v3" | "5v5";
type Team = "blue" | "red";

interface StrikeBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  ownerId: string | null;
  boostTrailTimer: number;
  superKickActive: boolean;
}

export class ClashStarStrike {
  map: GameMap;
  player: Brawler;
  allies: Bot[] = [];
  enemies: Bot[] = [];
  projectiles: Projectile[] = [];
  camera: Camera;
  input: InputHandler;
  ball: StrikeBall;
  over = false;
  won = false;
  frame = 0;
  spriteLoaded: boolean;

  private goals = { blue: 0, red: 0 };
  private format: StarStrikeFormat;
  private maxGoals = 3;
  private matchTimer = 180;
  private overtime = false;
  private suddenDeathTimer = 60;
  private respawnTimers = new Map<string, number>();
  private blueSpawns: Array<{ x: number; y: number }> = [];
  private redSpawns: Array<{ x: number; y: number }> = [];
  private resultRecorded = false;
  private goalCelebration: { timer: number; team: Team; final: boolean } | null = null;
  private botShootTimers = new Map<string, number>();
  private readonly respawnDelay = 3;
  private ballLastTouchTeam: Team | null = null;
  private ballCarrierTrackId: string | null = null;
  private ballCarrierPrevX = 0;
  private ballCarrierPrevY = 0;
  private readonly ballDropTeleportDistance = 170;
  /** 3D rolling orientation for star_ball.glb render */
  private ballOrientation = new THREE.Quaternion();
  /** Fallback 2D spin when WebGL rolling mesh is not ready */
  private ballSpin2d = 0;
  /** Процедурный ландшафт + декор (Three.js), не влияет на физику. */
  private visualLayer: StarStrikeVisualLayer | null = null;
  private readonly goalHalf = 170;
  private readonly goalDepth = 45;
  private readonly center = { x: 1800, y: 1100 };

  constructor(
    canvas: HTMLCanvasElement,
    playerBrawlerId: string,
    playerLevel: number,
    format: StarStrikeFormat,
    onAttack: () => void,
    onSuper: () => void,
    spriteLoaded: boolean,
  ) {
    this.format = format;
    this.spriteLoaded = spriteLoaded;
    this.map = this.createStarStrikeMap();

    const playerStats = getBrawlerById(playerBrawlerId) || BRAWLERS[0];
    this.player = new Brawler(playerStats, playerLevel, this.blueSpawns[0].x, this.blueSpawns[0].y, "blue", true);
    this.player.constellationStars = getBrawlerStars(getCurrentProfile(), this.player.stats.id);
    this.player.setIdentity(getCurrentUsername() ?? "Игрок", false);
    this.player.setEquippedPet(getPetById(getCurrentProfile()?.equippedPetId) ?? null);
    resetMatchStats();

    const teamSize = this.format === "5v5" ? 5 : 3;
    const totalBots = teamSize * 2 - 1;
    const botPool = pickBotStats(playerBrawlerId, totalBots);
    let idx = 0;
    for (let i = 1; i < teamSize; i++) {
      this.allies.push(new Bot(botPool[idx], randomInt(1, 5), this.blueSpawns[i].x, this.blueSpawns[i].y, "blue"));
      idx++;
    }
    for (let i = 0; i < teamSize; i++) {
      this.enemies.push(new Bot(botPool[idx], randomInt(1, 5), this.redSpawns[i].x, this.redSpawns[i].y, "red"));
      idx++;
    }

    this.ball = {
      x: this.center.x,
      y: this.center.y,
      vx: 0,
      vy: 0,
      radius: 11,
      ownerId: null,
      boostTrailTimer: 0,
      superKickActive: false,
    };

    this.camera = new Camera(CAM_W, CAM_H, this.map.width, this.map.height);
    this.input = new InputHandler(canvas, onAttack, onSuper);

    try {
      this.visualLayer = new StarStrikeVisualLayer(canvas, this.map.width, this.map.height);
    } catch (e) {
      console.warn("[ClashStarStrike] visual layer disabled", e);
      this.visualLayer = null;
    }
  }

  /** For React HUD overlay when canvas is clipped by CSS (`object-fit: cover`). */
  getHudSnapshot(): { blue: number; red: number; secondsLeft: number; overtime: boolean } {
    return {
      blue: this.goals.blue,
      red: this.goals.red,
      secondsLeft: this.overtime ? this.suddenDeathTimer : Math.max(0, this.matchTimer),
      overtime: this.overtime,
    };
  }

  private createStarStrikeMap(): GameMap {
    const width = 3600;
    const height = 2200;
    const sideWall = 140;
    const goalTop = this.center.y - this.goalHalf;
    const goalBottom = this.center.y + this.goalHalf;
    const grid = this.buildStarStrikeTileGrid(width, height);
    const map = createTileGridMap(grid, "Арена удара");
    const sideBorder = TILE_CELL_SIZE;
    map.walls = map.walls
      .filter(w => !(w.x === 0 && w.w === sideBorder && w.y === 0 && w.h === map.height))
      .filter(w => !(w.x === map.width - sideBorder && w.w === sideBorder && w.y === 0 && w.h === map.height));
    map.walls.push(
      { x: 0, y: 0, w: sideBorder, h: goalTop, solid: true },
      { x: 0, y: goalBottom, w: sideBorder, h: map.height - goalBottom, solid: true },
      { x: map.width - sideBorder, y: 0, w: sideBorder, h: goalTop, solid: true },
      { x: map.width - sideBorder, y: goalBottom, w: sideBorder, h: map.height - goalBottom, solid: true },
    );

    this.blueSpawns = [
      { x: 620, y: 1100 },
      { x: 760, y: 850 },
      { x: 760, y: 1350 },
      { x: 900, y: 980 },
      { x: 900, y: 1220 },
    ];
    this.redSpawns = [
      { x: width - 620, y: 1100 },
      { x: width - 760, y: 850 },
      { x: width - 760, y: 1350 },
      { x: width - 900, y: 980 },
      { x: width - 900, y: 1220 },
    ];
    return map;
  }

  private buildStarStrikeTileGrid(width: number, height: number): TileGrid {
    const sideWall = 140;
    const cw = Math.floor(width / TILE_CELL_SIZE);
    const ch = Math.floor(height / TILE_CELL_SIZE);
    const grid: TileGrid = {
      cells: new Uint8Array(cw * ch),
      destroyed: new Uint8Array(cw * ch),
      width: cw,
      height: ch,
      cellSize: TILE_CELL_SIZE,
    };
    grid.cells.fill(TileType.GRASS);

    const paintRect = (x1: number, y1: number, x2: number, y2: number, type: TileType) => {
      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) setTile(grid, x, y, type);
      }
    };
    const toCell = (v: number) => Math.floor(v / TILE_CELL_SIZE);
    const goalTop = toCell(this.center.y - this.goalHalf);
    const goalBottom = toCell(this.center.y + this.goalHalf);

    // Top and bottom textured borders + thick mountain band (no void past pitch).
    const rim = 6;
    paintRect(0, 0, cw - 1, rim - 1, TileType.MOUNTAIN);
    paintRect(0, ch - rim, cw - 1, ch - 1, TileType.MOUNTAIN);

    // Side borders with goal openings — widen to `rim` cells from each edge.
    paintRect(0, 0, rim - 1, goalTop - 1, TileType.MOUNTAIN);
    paintRect(0, goalBottom + 1, rim - 1, ch - 1, TileType.MOUNTAIN);
    paintRect(cw - rim, 0, cw - 1, goalTop - 1, TileType.MOUNTAIN);
    paintRect(cw - rim, goalBottom + 1, cw - 1, ch - 1, TileType.MOUNTAIN);

    // Tactical obstacles using model-based tiles (same renderer as other modes).
    paintRect(toCell(260), toCell(this.center.y - this.goalHalf - 80), toCell(260 + sideWall), toCell(this.center.y - this.goalHalf - 30), TileType.WALL);
    paintRect(toCell(260), toCell(this.center.y + this.goalHalf + 30), toCell(260 + sideWall), toCell(this.center.y + this.goalHalf + 80), TileType.WALL);
    paintRect(toCell(width - 260 - sideWall), toCell(this.center.y - this.goalHalf - 80), toCell(width - 260), toCell(this.center.y - this.goalHalf - 30), TileType.WALL);
    paintRect(toCell(width - 260 - sideWall), toCell(this.center.y + this.goalHalf + 30), toCell(width - 260), toCell(this.center.y + this.goalHalf + 80), TileType.WALL);
    paintRect(toCell(width / 2 - 150), toCell(520), toCell(width / 2 + 150), toCell(570), TileType.SAND_WALL);
    paintRect(toCell(width / 2 - 150), toCell(height - 570), toCell(width / 2 + 150), toCell(height - 520), TileType.SAND_WALL);

    // Light decorative grass patches for readability.
    paintRect(toCell(width * 0.24), toCell(height * 0.22), toCell(width * 0.3), toCell(height * 0.3), TileType.BUSH);
    paintRect(toCell(width * 0.24), toCell(height * 0.7), toCell(width * 0.3), toCell(height * 0.78), TileType.BUSH);
    paintRect(toCell(width * 0.7), toCell(height * 0.22), toCell(width * 0.76), toCell(height * 0.3), TileType.BUSH);
    paintRect(toCell(width * 0.7), toCell(height * 0.7), toCell(width * 0.76), toCell(height * 0.78), TileType.BUSH);

    return grid;
  }

  handleAttack(): void {
    if (!this.player.alive) return;
    if (this.ball.ownerId === this.player.id) {
      this.kickBall(this.player, false);
      return;
    }
    if (!this.player.canAttack()) return;
    const mouseAngle = angleTo(this.player.x, this.player.y, this.input.state.mouseWorldX, this.input.state.mouseWorldY);
    const angle = this.input.attackJoystick.active ? mouseAngle : autoAimAngle(this.player, this.enemies, mouseAngle);
    this.player.angle = angle;
    const isMelee = ["goro", "ronin", "taro"].includes(this.player.stats.id);
    const all = [this.player, ...this.allies, ...this.enemies];
    if (isMelee) this.player.meleeAttack(all);
    else this.projectiles.push(...this.player.shoot(angle));
  }

  handleSuper(): void {
    if (!this.player.alive) return;
    if (this.ball.ownerId === this.player.id) {
      if (!this.player.canUseSuper()) return;
      this.kickBall(this.player, true);
      return;
    }
    if (!this.player.canUseSuper()) return;
    const all = [this.player, ...this.allies, ...this.enemies];
    const autoTarget = this.input.superJoystick.active
      ? null
      : autoAimTarget(this.player, this.enemies, 1.0);
    const aimX = autoTarget ? autoTarget.x : this.input.state.mouseWorldX;
    const aimY = autoTarget ? autoTarget.y : this.input.state.mouseWorldY;
    const mouseAngle = angleTo(this.player.x, this.player.y, aimX, aimY);
    this.player.angle = this.input.superJoystick.active
      ? mouseAngle
      : autoAimAngle(this.player, this.enemies, mouseAngle, 1.0);
    this.player.activateSuper(all, this.map, this.projectiles, aimX, aimY);
  }

  private kickBall(kicker: Brawler, boosted: boolean): void {
    if (this.ball.ownerId !== kicker.id) return;
    const angle = angleTo(kicker.x, kicker.y, this.input.state.mouseWorldX, this.input.state.mouseWorldY);
    const speed = boosted ? 750 : 500;
    this.ball.ownerId = null;
    this.ball.x = kicker.x + Math.cos(angle) * (kicker.radius + this.ball.radius + 2);
    this.ball.y = kicker.y + Math.sin(angle) * (kicker.radius + this.ball.radius + 2);
    this.ball.vx = Math.cos(angle) * speed;
    this.ball.vy = Math.sin(angle) * speed;
    this.ball.boostTrailTimer = boosted ? 0.6 : 0;
    this.ball.superKickActive = boosted;
    this.ballLastTouchTeam = kicker.team as Team;
    if (boosted) {
      kicker.superCharge = 0;
      kicker.superReady = false;
    }
  }

  update(dt: number): void {
    if (this.over) return;
    const fr = isDevBattleWorldFrozen();
    const sim = fr ? 0 : dt;
    if (!fr) this.frame++;
    const all = [this.player, ...this.allies, ...this.enemies];
    this.updateRespawns(sim);

    if (this.goalCelebration) {
      this.goalCelebration.timer -= sim;
      const goalX = this.goalCelebration.team === "blue" ? this.map.width - 40 : 40;
      this.camera.follow(goalX, this.center.y);
      this.input.updateWorldMouse(this.camera.x, this.camera.y, this.player.x, this.player.y, GAME_ZOOM);
      if (this.goalCelebration.timer <= 0) {
        const done = this.goalCelebration;
        this.goalCelebration = null;
        if (done.final) this.finish(done.team === "blue");
        else this.resetAfterGoal();
      }
      return;
    }

    const { up, down, left, right } = this.input.state;
    let dx = 0, dy = 0;
    if (up) dy -= 1;
    if (down) dy += 1;
    if (left) dx -= 1;
    if (right) dx += 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1;
      this.player.move(dx / len, dy / len, dt);
    }

    this.player.update(dt, this.map);
    if (!fr) {
      for (const bot of [...this.allies, ...this.enemies]) {
        if (bot.alive) {
          this.updateBotBehavior(bot, sim, all);
          bot.updateAI(sim, all, this.map, this.projectiles);
          bot.update(sim, this.map);
        }
      }
    }

    this.camera.follow(this.player.x, this.player.y);
    this.input.updateWorldMouse(this.camera.x, this.camera.y, this.player.x, this.player.y, GAME_ZOOM);
    this.player.angle = angleTo(this.player.x, this.player.y, this.input.state.mouseWorldX, this.input.state.mouseWorldY);

    this.updateBotShootTimers(sim);
    this.updateBall(dt, sim, all);

    updateProjectiles(this.projectiles, sim, this.map);
    this.handleProjectileHits(all, fr);
    this.projectiles = this.projectiles.filter(p => p.active);

    this.matchTimer -= sim;
    if (this.goals.blue >= this.maxGoals || this.goals.red >= this.maxGoals) {
      this.finish(this.goals.blue > this.goals.red);
    } else if (this.matchTimer <= 0) {
      if (!this.overtime && this.goals.blue === this.goals.red) {
        this.overtime = true;
        this.suddenDeathTimer = 60;
      } else if (this.overtime) {
        this.suddenDeathTimer -= sim;
        if (this.suddenDeathTimer <= 0) this.finish(this.goals.blue >= this.goals.red);
      } else {
        this.finish(this.goals.blue > this.goals.red);
      }
    }

    updateDamageNumbers(sim);
    updateEffects(sim, all);
  }

  private updateBotBehavior(bot: Bot, dt: number, all: Brawler[]): void {
    const enemyGoal = bot.team === "blue" ? { x: this.map.width - 90, y: this.center.y } : { x: 90, y: this.center.y };
    const enemyCarrier = this.ball.ownerId
      ? all.find(b => b.id === this.ball.ownerId && b.team !== bot.team && b.alive) || null
      : null;
    if (this.ball.ownerId === bot.id) {
      bot.forcedTarget = enemyGoal;
      const d = distance(bot.x, bot.y, enemyGoal.x, enemyGoal.y);
      if (d < 620 || Math.random() < 0.004) {
        const angle = angleTo(bot.x, bot.y, enemyGoal.x, enemyGoal.y);
        this.ball.ownerId = null;
        this.ball.x = bot.x + Math.cos(angle) * (bot.radius + this.ball.radius + 2);
        this.ball.y = bot.y + Math.sin(angle) * (bot.radius + this.ball.radius + 2);
        this.ball.vx = Math.cos(angle) * (460 + Math.random() * 150);
        this.ball.vy = Math.sin(angle) * (460 + Math.random() * 150);
      }
      return;
    }
    if (enemyCarrier) {
      bot.forcedTarget = { x: enemyCarrier.x, y: enemyCarrier.y };
      this.tryBotAttack(bot, enemyCarrier, all);
      return;
    }
    if (!this.ball.ownerId) {
      bot.forcedTarget = { x: this.ball.x, y: this.ball.y };
      const enemy = all
        .filter(b => b.alive && b.team !== bot.team)
        .sort((a, b) => distance(bot.x, bot.y, a.x, a.y) - distance(bot.x, bot.y, b.x, b.y))[0];
      if (enemy) this.tryBotAttack(bot, enemy, all);
    } else {
      const laneY = this.center.y + randomInt(-170, 170);
      const holdX = bot.team === "blue" ? this.map.width * 0.55 : this.map.width * 0.45;
      bot.forcedTarget = { x: holdX, y: laneY };
    }
  }

  private tryBotAttack(bot: Bot, target: Brawler, all: Brawler[]): void {
    if (!target.alive) return;
    const d = distance(bot.x, bot.y, target.x, target.y);
    if ((this.botShootTimers.get(bot.id) || 0) > 0) return;
    if (d > bot.stats.attackRange * 0.95 || !bot.canAttack()) return;
    const isMelee = ["goro", "ronin", "taro"].includes(bot.stats.id);
    bot.angle = angleTo(bot.x, bot.y, target.x, target.y);
    if (isMelee) bot.meleeAttack(all);
    else this.projectiles.push(...bot.shoot(bot.angle));
    this.botShootTimers.set(bot.id, 0.55 + Math.random() * 0.45);
  }

  private updateBotShootTimers(dt: number): void {
    for (const [id, t] of Array.from(this.botShootTimers.entries())) {
      const next = t - dt;
      if (next <= 0) this.botShootTimers.delete(id);
      else this.botShootTimers.set(id, next);
    }
  }

  private updateRespawns(dt: number): void {
    const allBots = [...this.allies, ...this.enemies];
    for (const bot of allBots) {
      if (!bot.alive && !this.respawnTimers.has(bot.id)) this.respawnTimers.set(bot.id, this.respawnDelay);
    }
    for (const [id, t] of Array.from(this.respawnTimers.entries())) {
      if (id === this.player.id) continue; // player timer handled in dedicated block below
      const bot = allBots.find(b => b.id === id);
      if (!bot) { this.respawnTimers.delete(id); continue; }
      const next = t - dt;
      if (next > 0) { this.respawnTimers.set(id, next); continue; }
      const spawnSet = bot.team === "blue" ? this.blueSpawns : this.redSpawns;
      const pos = spawnSet[randomInt(0, spawnSet.length - 1)];
      bot.respawn(pos.x, pos.y);
      this.respawnTimers.delete(id);
    }
    if (!this.player.alive && !this.respawnTimers.has(this.player.id)) this.respawnTimers.set(this.player.id, this.respawnDelay);
    if (this.respawnTimers.has(this.player.id)) {
      const t = (this.respawnTimers.get(this.player.id) || 0) - dt;
      if (t <= 0) {
        this.player.respawn(this.blueSpawns[0].x, this.blueSpawns[0].y);
        this.respawnTimers.delete(this.player.id);
      } else {
        this.respawnTimers.set(this.player.id, t);
      }
    }
  }

  private updateBall(dt: number, sim: number, all: Brawler[]): void {
    const fr = isDevBattleWorldFrozen();
    if (this.ball.ownerId) {
      const carrier = all.find(b => b.id === this.ball.ownerId && b.alive) || null;
      if (!carrier) {
        this.ball.ownerId = null;
        this.ball.superKickActive = false;
        this.ballCarrierTrackId = null;
      } else {
        const stunned = carrier.statusEffects?.some(s => s.type === "stun") ?? false;
        if (this.ballCarrierTrackId !== carrier.id) {
          this.ballCarrierTrackId = carrier.id;
          this.ballCarrierPrevX = carrier.x;
          this.ballCarrierPrevY = carrier.y;
        }
        const ddx = carrier.x - this.ballCarrierPrevX;
        const ddy = carrier.y - this.ballCarrierPrevY;
        const moved = Math.hypot(ddx, ddy);
        const teleported = moved > this.ballDropTeleportDistance;
        if (stunned || teleported) {
          this.ball.ownerId = null;
          this.ball.superKickActive = false;
          this.ball.x = carrier.x;
          this.ball.y = carrier.y;
          this.ball.vx = 0;
          this.ball.vy = 0;
          this.ballCarrierTrackId = null;
          return;
        }
        const rollDt = carrier.id === this.player.id ? dt : sim;
        const invDt = rollDt > 1e-6 ? 1 / rollDt : 0;
        const vx = ddx * invDt;
        const vy = ddy * invDt;
        integrateBallRolling(this.ballOrientation, vx, vy, rollDt, this.ball.radius);
        this.ballSpin2d += Math.hypot(vx, vy) * rollDt * 0.015;
        this.ballCarrierPrevX = carrier.x;
        this.ballCarrierPrevY = carrier.y;
        this.ballLastTouchTeam = carrier.team as Team;
        // In front of feet, outside silhouette: same facing as 3D iso (smoothed move or attack aim).
        let face = carrier.getBallCarryFacingRad();
        if (!Number.isFinite(face)) face = 0;
        const br = carrier.radius;
        const ballR = this.ball.radius;
        const groundDist = br + ballR * 0.88;
        const feetDown = br * 0.40;
        this.ball.x = carrier.x + Math.cos(face) * groundDist;
        this.ball.y = carrier.y + Math.sin(face) * groundDist + feetDown;
        this.ball.vx = 0;
        this.ball.vy = 0;
        this.tryGoal(); // carrying the ball across goal line should count
      }
    } else {
      this.ballCarrierTrackId = null;
      this.ball.x += this.ball.vx * sim;
      this.ball.y += this.ball.vy * sim;
      integrateBallRolling(this.ballOrientation, this.ball.vx, this.ball.vy, sim, this.ball.radius);
      this.ballSpin2d += Math.hypot(this.ball.vx, this.ball.vy) * sim * 0.015;

      // Super kick should travel farther than regular kick.
      const friction = this.ball.superKickActive ? 0.994 : 0.988;
      this.ball.vx *= Math.pow(friction, sim * 60);
      this.ball.vy *= Math.pow(friction, sim * 60);
      if (Math.hypot(this.ball.vx, this.ball.vy) < 12) { this.ball.vx = 0; this.ball.vy = 0; }
      if (this.ball.boostTrailTimer > 0) this.ball.boostTrailTimer -= sim;

      this.resolveBallWallBounces();
      this.tryGoal();

      const contest = fr ? [this.player] : all;
      for (const b of contest) {
        if (!b.alive) continue;
        if (distance(b.x, b.y, this.ball.x, this.ball.y) < b.radius + this.ball.radius) {
          this.ball.ownerId = b.id;
          this.ballLastTouchTeam = b.team as Team;
          this.ball.vx = 0;
          this.ball.vy = 0;
          this.ball.superKickActive = false;
          break;
        }
      }
    }
  }

  private resolveBallWallBounces(): void {
    const r = this.ball.radius;
    const leftBound = 60 + r;
    const rightBound = this.map.width - 60 - r;
    const topBound = 60 + r;
    const bottomBound = this.map.height - 60 - r;
    const inGoalWindow = Math.abs(this.ball.y - this.center.y) <= this.goalHalf - 6;

    if (this.ball.y < topBound) { this.ball.y = topBound; this.ball.vy *= -1; }
    if (this.ball.y > bottomBound) { this.ball.y = bottomBound; this.ball.vy *= -1; }
    if (!inGoalWindow && this.ball.x < leftBound) { this.ball.x = leftBound; this.ball.vx *= -1; }
    if (!inGoalWindow && this.ball.x > rightBound) { this.ball.x = rightBound; this.ball.vx *= -1; }

    for (const w of this.map.walls) {
      if (!collidesWithWalls(this.ball.x, this.ball.y, r, [w]).collides) continue;
      const nearX = Math.max(w.x, Math.min(this.ball.x, w.x + w.w));
      const nearY = Math.max(w.y, Math.min(this.ball.y, w.y + w.h));
      const dx = this.ball.x - nearX;
      const dy = this.ball.y - nearY;
      if (Math.abs(dx) > Math.abs(dy)) this.ball.vx *= -1;
      else this.ball.vy *= -1;
      const push = collidesWithWalls(this.ball.x, this.ball.y, r, [w]);
      this.ball.x = push.nx;
      this.ball.y = push.ny;
    }
  }

  private tryGoal(): void {
    const inGoalWindow = Math.abs(this.ball.y - this.center.y) <= this.goalHalf;
    if (!inGoalWindow) return;
    if (this.ball.x <= this.goalDepth) {
      if (this.ballLastTouchTeam !== "red") {
        this.bounceBallFromGoalLine("left");
        return;
      }
      this.registerGoal("red");
    } else if (this.ball.x >= this.map.width - this.goalDepth) {
      if (this.ballLastTouchTeam !== "blue") {
        this.bounceBallFromGoalLine("right");
        return;
      }
      this.registerGoal("blue");
    }
  }

  private bounceBallFromGoalLine(side: "left" | "right"): void {
    const all = [this.player, ...this.allies, ...this.enemies];
    const carrier = this.ball.ownerId
      ? all.find(b => b.id === this.ball.ownerId && b.alive) || null
      : null;
    const outward = side === "left" ? 1 : -1;
    const minPush = 420;
    const lineX = side === "left"
      ? this.goalDepth + this.ball.radius + 2
      : this.map.width - this.goalDepth - this.ball.radius - 2;

    this.ball.ownerId = null;
    this.ball.superKickActive = false;
    this.ball.x = lineX;
    if (carrier) {
      const a = carrier.moveAngle ?? carrier.angle ?? 0;
      const yKick = Math.max(-180, Math.min(180, Math.sin(a) * 90));
      this.ball.vx = outward * minPush;
      this.ball.vy = yKick;
    } else {
      this.ball.vx = outward * Math.max(minPush, Math.abs(this.ball.vx) * 0.85);
      this.ball.vy *= 0.85;
    }
  }

  private registerGoal(team: Team): void {
    this.goals[team] += 1;
    this.ball.ownerId = null;
    this.ball.superKickActive = false;
    this.ball.vx = 0;
    this.ball.vy = 0;
    const final = this.overtime || this.goals[team] >= this.maxGoals;
    this.goalCelebration = { timer: 2.6, team, final };
  }

  private resetAfterGoal(): void {
    this.ball.ownerId = null;
    this.ballLastTouchTeam = null;
    this.ball.superKickActive = false;
    this.ball.x = this.center.x;
    this.ball.y = this.center.y;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.ball.boostTrailTimer = 0;
    this.respawnTimers.clear();
    const allBlue = [this.player, ...this.allies];
    const afterGoalOpts = { resetSuper: true, fullAmmo: true } as const;
    allBlue.forEach((b, i) => b.respawn(this.blueSpawns[Math.min(i, this.blueSpawns.length - 1)].x, this.blueSpawns[Math.min(i, this.blueSpawns.length - 1)].y, afterGoalOpts));
    this.enemies.forEach((b, i) => b.respawn(this.redSpawns[Math.min(i, this.redSpawns.length - 1)].x, this.redSpawns[Math.min(i, this.redSpawns.length - 1)].y, afterGoalOpts));
  }

  private finish(playerWon: boolean): void {
    if (this.over) return;
    this.over = true;
    this.won = playerWon;
    if (this.resultRecorded) return;
    const ms = getMatchStats();
    recordGameResult({ won: playerWon, mode: "starstrike", brawlerId: this.player.stats.id, place: playerWon ? 1 : 2, ...ms });
    this.resultRecorded = true;
  }

  private handleProjectileHits(all: Brawler[], fr: boolean): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      if (fr && p.ownerId !== this.player.id) continue;
      for (const b of all) {
        if (!b.alive || b.id === p.ownerId || p.ownerTeam === b.team || p.hitIds.has(b.id)) continue;
        if (distance(p.x, p.y, b.x, b.y) < p.radius + b.radius) {
          const attacker = all.find(x => x.id === p.ownerId) || null;
          b.takeDamage(p.damage, attacker);
          if (p.slow) b.addStatus("slow", 1.5, 0.4);
          if (p.poison) b.addStatus("poison", 3, 100);
          if (p.stunDuration) b.addStatus("stun", p.stunDuration, 0);
          if (p.temporalRewind && b.posHistory.length >= 2) {
            const pastIdx = Math.max(0, b.posHistory.length - 6);
            const pastPos = b.posHistory[pastIdx];
            b.x = Math.max(b.radius, Math.min(this.map.width - b.radius, pastPos.x));
            b.y = Math.max(b.radius, Math.min(this.map.height - b.radius, pastPos.y));
          }
          applyZafkielStarEffectsOnHit(attacker as any, b as any, p, { width: this.map.width, height: this.map.height });
          p.hitIds.add(b.id);
          if (!p.piercing) { p.active = false; break; }
        }
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    fillBattleCanvasBg(ctx);
    ctx.save();
    try {
      ctx.scale(GAME_ZOOM, GAME_ZOOM);
      renderMap(ctx, this.map, this.camera.x, this.camera.y, CAM_W, CAM_H, this.frame);
      if (this.map.tileGrid) {
        renderTileGrid(ctx, this.map.tileGrid, this.camera.x, this.camera.y, CAM_W, CAM_H, this.player.x, this.player.y, false);
      }
      this.renderGoalFrames(ctx);

      const all = [this.player, ...this.allies, ...this.enemies];
      const friends = [this.player, ...this.allies].filter(b => b.alive).map(b => ({ x: b.x, y: b.y }));

      // Depth sort by foot Y. Carried ball: iso rule — if ball is lower on screen (larger y, toward camera), draw it after the carrier; else draw ball first so it sits behind the torso (e.g. walking up).
      type DepthItem = { kind: "freeBall" } | { kind: "brawler"; b: Brawler };
      const depthItems: DepthItem[] = [];
      if (!this.ball.ownerId) depthItems.push({ kind: "freeBall" });
      for (const b of all) depthItems.push({ kind: "brawler", b });
      depthItems.sort((a, b) => {
        const ya = a.kind === "freeBall" ? this.ball.y : a.b.y;
        const yb = b.kind === "freeBall" ? this.ball.y : b.b.y;
        return ya - yb;
      });
      for (const item of depthItems) {
        if (item.kind === "freeBall") {
          this.renderBall(ctx);
          continue;
        }
        const carry = this.ball.ownerId === item.b.id && item.b.alive;
        if (carry) {
          if (this.ball.y > item.b.y) {
            item.b.render(ctx, this.camera.x, this.camera.y, this.spriteLoaded, this.player.team, friends);
            this.renderBall(ctx);
          } else {
            this.renderBall(ctx);
            item.b.render(ctx, this.camera.x, this.camera.y, this.spriteLoaded, this.player.team, friends);
          }
        } else {
          item.b.render(ctx, this.camera.x, this.camera.y, this.spriteLoaded, this.player.team, friends);
        }
      }

      this.renderStarAndBuffOverlays(ctx, all);
      renderProjectiles(ctx, this.projectiles, this.camera.x, this.camera.y, this.frame);
      if (this.map.tileGrid) {
        renderTileGrid(ctx, this.map.tileGrid, this.camera.x, this.camera.y, CAM_W, CAM_H, this.player.x, this.player.y, true);
      }
      renderEffects(ctx, this.camera.x, this.camera.y, this.frame);
      renderDamageNumbers(ctx, this.camera.x, this.camera.y);
    } finally {
      ctx.restore();
    }

    if (this.ball.ownerId === this.player.id) this.renderCarryGlow(ctx);
    if (this.goalCelebration) this.renderGoalCelebration(ctx, this.goalCelebration.team);
    this.renderOffscreenBallIndicator(ctx);
    renderBattleScreenFX(ctx, 1200, 800, this.frame, this.player);
    this.renderHUD(ctx);
    this.visualLayer?.render(this.camera.x, this.camera.y);
  }

  private renderGoalFrames(ctx: CanvasRenderingContext2D): void {
    const leftX = 60 - this.camera.x;
    const rightX = this.map.width - 60 - this.camera.x;
    const topY = this.center.y - this.goalHalf - this.camera.y;
    const bottomY = this.center.y + this.goalHalf - this.camera.y;
    const depth = 48;
    const postW = 8;

    ctx.save();
    ctx.fillStyle = "#ECEFF1";
    // Left goal posts + short frame lines
    ctx.fillRect(leftX - postW / 2, topY - 4, postW, 22);
    ctx.fillRect(leftX - postW / 2, bottomY - 18, postW, 22);
    ctx.fillRect(leftX, topY - 4, depth, 4);
    ctx.fillRect(leftX, bottomY, depth, 4);

    // Right goal posts + short frame lines
    ctx.fillRect(rightX - postW / 2, topY - 4, postW, 22);
    ctx.fillRect(rightX - postW / 2, bottomY - 18, postW, 22);
    ctx.fillRect(rightX - depth, topY - 4, depth, 4);
    ctx.fillRect(rightX - depth, bottomY, depth, 4);

    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(leftX - postW / 2, topY - 4, postW, bottomY - topY + 8);
    ctx.strokeRect(rightX - postW / 2, topY - 4, postW, bottomY - topY + 8);
    ctx.restore();
  }

  private renderGoalCelebration(ctx: CanvasRenderingContext2D, team: Team): void {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(0, 0, 1200, 800);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#FFD740";
    ctx.shadowBlur = 26;
    ctx.fillStyle = "#FFD740";
    ctx.font = "bold 96px Segoe UI";
    ctx.fillText("ГОООЛ!", 600, 350);
    ctx.shadowBlur = 10;
    ctx.fillStyle = team === "blue" ? "#80D8FF" : "#FF8A80";
    ctx.font = "bold 30px Segoe UI";
    ctx.fillText(team === "blue" ? "СИНЯЯ КОМАНДА ЗАБИЛА" : "КРАСНАЯ КОМАНДА ЗАБИЛА", 600, 415);
    ctx.restore();
  }

  private renderBall(ctx: CanvasRenderingContext2D): void {
    const sx = this.ball.x - this.camera.x;
    const sy = this.ball.y - this.camera.y;
    if (this.ball.boostTrailTimer > 0 && !this.ball.ownerId) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.ball.boostTrailTimer * 1.6);
      ctx.strokeStyle = "#FFD740";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(sx - this.ball.vx * 0.02, sy - this.ball.vy * 0.02);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.restore();
    }
    const d = this.ball.radius * 3;
    const flat = getStarBallCanvas();
    let rollingFrame: HTMLCanvasElement | null = null;
    if (isRollingStarBallReady()) {
      try {
        rollingFrame = renderRollingStarBall(this.ballOrientation);
        if (rollingFrame && isRollingBallFrameBlank(rollingFrame)) rollingFrame = null;
      } catch {
        rollingFrame = null;
      }
    }
    ctx.save();
    ctx.translate(sx, sy);
    if (rollingFrame) {
      ctx.drawImage(rollingFrame, -d / 2, -d / 2, d, d);
    } else if (flat) {
      ctx.rotate(this.ballSpin2d);
      ctx.drawImage(flat, -d / 2, -d / 2, d, d);
    } else {
      ctx.rotate(this.ballSpin2d);
      ctx.fillStyle = "#F5F5F5";
      ctx.beginPath();
      ctx.arc(0, 0, this.ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#455A64";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderCarryGlow(ctx: CanvasRenderingContext2D): void {
    const w = 1200, h = 800;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, "rgba(255,215,64,0)");
    g.addColorStop(1, "rgba(255,215,64,0.24)");
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  private renderOffscreenBallIndicator(ctx: CanvasRenderingContext2D): void {
    const ballScreenX = (this.ball.x - this.camera.x) * GAME_ZOOM;
    const ballScreenY = (this.ball.y - this.camera.y) * GAME_ZOOM;
    const inView = ballScreenX >= 0 && ballScreenX <= 1200 && ballScreenY >= 0 && ballScreenY <= 800;
    if (inView) return;

    const cx = 600;
    const cy = 400;
    const dx = ballScreenX - cx;
    const dy = ballScreenY - cy;
    const ang = Math.atan2(dy, dx);
    const pad = 58;
    const edgeX = Math.max(pad, Math.min(1200 - pad, cx + Math.cos(ang) * (cx - pad)));
    const edgeY = Math.max(pad, Math.min(800 - pad, cy + Math.sin(ang) * (cy - pad)));

    ctx.save();
    ctx.translate(edgeX, edgeY);
    ctx.rotate(ang);
    ctx.shadowColor = "#FFD740";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(-34, -16, 68, 32, 10);
    ctx.fill();
    ctx.strokeStyle = "#FFD740";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#FFD740";
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(6, -9);
    ctx.lineTo(6, 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚽", -10, 0);
    ctx.restore();
  }

  private renderHUD(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const boxW = 360;
    const x = (1200 - boxW) / 2;
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.fillRect(x, 6, boxW, 56);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#40C4FF";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.fillText(String(this.goals.blue), x + 70, 40);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px Arial";
    ctx.fillText(":", x + 180, 40);
    ctx.fillStyle = "#FF5252";
    ctx.font = "bold 24px Arial";
    ctx.fillText(String(this.goals.red), x + 290, 40);
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.font = "bold 13px Arial";
    const t = this.overtime ? this.suddenDeathTimer : Math.max(0, this.matchTimer);
    const mm = Math.floor(t / 60);
    const ss = Math.floor(t % 60).toString().padStart(2, "0");
    ctx.fillText(this.overtime ? `ЗОЛОТОЙ ГОЛ • ${mm}:${ss}` : `${mm}:${ss}`, x + 180, 19);
    ctx.restore();
  }

  private renderStarAndBuffOverlays(ctx: CanvasRenderingContext2D, all: Brawler[]): void {
    const t = this.frame * 0.08;
    for (const b of all) {
      if (!b.alive) continue;
      const sx = b.x - this.camera.x;
      const sy = b.y - this.camera.y;
      if (b.statusEffects.some(e => e.type === "berserker")) {
        ctx.save();
        ctx.globalAlpha = 0.28 + Math.sin(t * 1.3) * 0.08;
        ctx.strokeStyle = "#FF4D6D";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(sx, sy, b.radius + 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (b.tempShieldHp > 0) {
        ctx.save();
        ctx.globalAlpha = 0.26 + Math.min(0.25, b.tempShieldHp / 1400);
        ctx.strokeStyle = "#80D8FF";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(sx, sy, b.radius + 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  getParticipants(): import("../types/gameResult").GameParticipant[] {
    const fakeTrophies = (name: string) => 300 + ((name.charCodeAt(0) * 37 + (name.charCodeAt(1) || 5) * 13) % 1700);
    const profile = getCurrentProfile();
    return [
      { brawlerId: this.player.stats.id, displayName: this.player.displayName || "Игрок", team: "blue", isPlayer: true, level: this.player.level, trophies: profile?.trophies ?? 0 },
      ...this.allies.map(b => ({ brawlerId: b.stats.id, displayName: b.displayName || "Бот", team: "blue", isPlayer: false, level: b.level, trophies: fakeTrophies(b.displayName || "B") })),
      ...this.enemies.map(b => ({ brawlerId: b.stats.id, displayName: b.displayName || "Бот", team: "red", isPlayer: false, level: b.level, trophies: fakeTrophies(b.displayName || "B") })),
    ];
  }

  destroy(): void {
    this.visualLayer?.dispose();
    this.visualLayer = null;
    this.input.destroy();
    clearDamageNumbers();
    clearEffects();
  }
}

