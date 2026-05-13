import { BrawlerStats, getScaledStats } from "./BrawlerData";
import { GameMap, collidesWithWalls, isInBush, isInRiver } from "../game/MapRenderer";
import { Projectile, createProjectile } from "./Projectile";
import { spawnDamageNumber } from "../utils/damageNumbers";
import { spawnEffect, makeZigzag, spawnTaroTurretEffect } from "../utils/effects";
import { clamp, distance, angleTo } from "../utils/helpers";
import { addMatchStat } from "../utils/matchStats";
import { setRenderersBase, getCharRenderer, CHAR_3D_IDS, type CharAnim } from "../game/miyaTopDownRenderer";
import { drawBrawlerImage } from "../game/sprites";
import type { PetDef } from "./PetData";
import { renderPet } from "./PetRenderer";
import { getGemCanvas } from "../utils/powerModelCache";
import { flashPlayerDamage } from "../game/battleScreenFX";
import { BRAWLER_DRAW_SCALE } from "../game/battleVisualScale";

// Record the base URL so lazy renderers know where to find the GLBs.
// Models are loaded on-demand the first time a character is rendered in-battle.
if (typeof window !== "undefined") {
  setRenderersBase((import.meta as any).env?.BASE_URL ?? "/");
}

export type Team = string;

export interface StatusEffect {
  type: "slow" | "poison" | "stun" | "berserker" | "vulnerable";
  duration: number;
  value: number;
}

export class Brawler {
  id: string;
  stats: BrawlerStats;
  level: number;
  x: number;
  y: number;
  radius = 24;
  team: Team;
  isPlayer: boolean;

  maxHp: number;
  hp: number;
  speed: number;
  angle = 0;
  
  attackCharges: number;
  maxAttackCharges: number;
  attackCooldownTimer = 0;
  attackCooldown: number;
  
  superCharge = 0;
  maxSuperCharge = 100;
  superReady = false;
  
  regenTimer = 0;
  regenDelay = 3;
  lastDamageTime = 0;
  lastAttackTime = 0;
  
  statusEffects: StatusEffect[] = [];
  
  alive = true;
  invulnerable = false;
  invulnerableTimer = 0;
  hitFlash = 0;
  /** Brief soft glow + floating "+" on heal (model + numbers). */
  healGlowTimer = 0;
  
  animFrame = 0;
  attackAnim = 0;
  superAnim = 0;
  deathAnim = 0;
  isAttacking = false;

  // Tracked between frames so we can detect "is moving" for 3D-model brawlers
  // without changing the call sites that mutate position directly.
  private _lastRenderX = 0;
  private _lastRenderY = 0;
  private _movingSmoothed = 0;
  private _runAnimLatch = false;

  // Separate movement-facing angle: 3D characters face movement direction
  // when running/idle, and only briefly face attack direction when shooting.
  moveAngle = 0;
  private _smoothMoveAngle = 0;
  
  inBush = false;
  inRiver = false;
  bushRevealTimer = 0; // > 0 while briefly visible after attacking from a bush
  
  turret: Brawler | null = null;
  /** Stable id for deployables (Taro turret). In Mega equals squad slot so switching brawler does not orphan turrets. */
  turretPlacementId: string;
  
  powerCubes = 0;

  // Display name shown above the brawler in match. For bots this is set to a
  // Russian-sounding nickname; for the local player it is set to the active
  // account username at match start.
  displayName: string = "";
  isBot: boolean = false;

  /** Raid boss: no passive HP regen from brawler regenRate (only scripted heals). */
  suppressPassiveRegen = false;

  // ── Zafkiel "Time Cycle" mechanic ────────────────────────────────────────
  // normal mode: charges 0=Dalet, 1=Bet, 2=Zayin
  // enhanced mode (after super): 0=Aleph, 1=Gimmel, 2=Yud
  zafkielMode: "normal" | "enhanced" = "normal";
  zafkielChargeIdx: number = 0;
  // Position history for temporal-rewind effect (Dalet / super)
  posHistory: Array<{ x: number; y: number }> = [];
  private _posHistoryTimer: number = 0;

  // ── Per-mode badge (e.g. crystals carried, power cubes) ──────────────────
  // Set by game modes each frame; rendered above the name label.
  crystalCount: number = 0;

  // ── Equipped pet & its per-match runtime state ──────────────────────────
  // Set on the local player at battle start. Bots also receive a random pet
  // (see Bot constructor) so the battlefield feels populated with companions.
  equippedPet: PetDef | null = null;
  petHealTimer: number = 0;
  petShieldTimer: number = 0;
  petPhoenixUsed: boolean = false;
  // Smooth follower position (lerps toward a point behind the brawler).
  petFollowX: number = 0;
  petFollowY: number = 0;
  // Animation state for the in-battle pet renderer.
  private _petPrevX: number = 0;
  private _petPrevY: number = 0;
  private _petPrevT: number = 0;
  private _petMoveSmoothed: number = 0;
  private _petJoyTimer: number = 0;
  private _petLastHealTimer: number = 0;
  // Constellation stars enabled for this brawler in current match.
  constellationStars: number[] = [];
  // Temporary absorb shield used by specific constellation effects.
  tempShieldHp: number = 0;
  tempShieldTimer: number = 0;

  constructor(stats: BrawlerStats, level: number, x: number, y: number, team: Team, isPlayer = false) {
    this.id = `brawler_${Math.random().toString(36).slice(2)}`;
    this.turretPlacementId = this.id;
    this.stats = stats;
    this.level = level;
    this.x = x;
    this.y = y;
    this.team = team;
    this.isPlayer = isPlayer;
    
    const scaled = getScaledStats(stats, level);
    this.maxHp = scaled.hp;
    this.hp = scaled.hp;
    this.speed = scaled.speed;
    this.attackCharges = scaled.attackCharges;
    this.maxAttackCharges = scaled.attackCharges;
    this.attackCooldown = scaled.attackCooldown;

    // Initial spawn shield: 100% damage immunity for 5 seconds.
    this.grantSpawnShield(5);

    this._lastRenderX = x;
    this._lastRenderY = y;
    this._smoothMoveAngle = this.moveAngle;
  }

  /**
   * Facing used for Star Strike dribble offset — same rule as 3D iso render:
   * aim while attacking, otherwise smoothed move direction.
   */
  getBallCarryFacingRad(): number {
    if (!this.alive) return this.moveAngle;
    if (this.attackAnim > 0.02) return this.angle;
    return this._smoothMoveAngle;
  }

  setIdentity(displayName: string, isBot: boolean): void {
    this.displayName = displayName;
    this.isBot = isBot;
  }

  /** Equip a pet for this match. Resets per-match runtime state.
   *  Pass null to clear. */
  setEquippedPet(pet: PetDef | null): void {
    this.equippedPet = pet;
    this.petHealTimer = 0;
    this.petShieldTimer = 0;
    this.petPhoenixUsed = false;
    this.petFollowX = this.x - 32;
    this.petFollowY = this.y + 14;
  }

  /**
   * Restore this brawler at (x,y) with full HP, clear statuses, spawn shield.
   * Default (death in the same match): keep super charge; 1 ammo clip, rest recharge over time.
   * Pass `{ resetSuper: true, fullAmmo: true }` for a full reset (e.g. Star Strike after a goal).
   */
  respawn(
    x: number,
    y: number,
    opts?: { resetSuper?: boolean; fullAmmo?: boolean },
  ): void {
    this.x = x;
    this.y = y;
    this._lastRenderX = x;
    this._lastRenderY = y;
    this._smoothMoveAngle = this.moveAngle;
    this.hp = this.maxHp;
    this.alive = true;
    this.deathAnim = 0;
    this.statusEffects = [];

    const resetSuper = opts?.resetSuper === true;
    const fullAmmo = opts?.fullAmmo === true;

    if (resetSuper) {
      this.superCharge = 0;
      this.superReady = false;
    } else {
      this.superCharge = Math.min(this.maxSuperCharge, Math.max(0, this.superCharge));
      this.superReady = this.superCharge >= this.maxSuperCharge;
    }

    if (fullAmmo) {
      this.attackCharges = this.maxAttackCharges;
      this.attackCooldownTimer = 0;
    } else {
      if (this.maxAttackCharges <= 0) {
        this.attackCharges = 0;
        this.attackCooldownTimer = 0;
      } else {
        this.attackCharges = 1;
        this.attackCooldownTimer = this.maxAttackCharges > 1 ? this.attackCooldown : 0;
      }
    }

    this.hitFlash = 0;
    this.healGlowTimer = 0;
    this.grantSpawnShield(3);
  }

  /** Grant a damage-immunity bubble for `seconds` and spawn its visual ring. */
  grantSpawnShield(seconds: number): void {
    this.invulnerable = true;
    this.invulnerableTimer = seconds;
    spawnEffect({
      kind: "shieldDome",
      x: this.x, y: this.y,
      radius: this.radius + 14,
      color: "#80D8FF",
      timer: seconds, maxTimer: seconds,
      followBrawler: this,
    });
  }

  get scaledDamage(): number {
    return getScaledStats(this.stats, this.level).attackDamage * (1 + this.powerCubes * 0.1);
  }
  
  collectPowerCube(): void {
    this.powerCubes++;
    const baseHp = getScaledStats(this.stats, this.level).hp;
    this.maxHp = Math.floor(baseHp * (1 + this.powerCubes * 0.1));
    this.hp = Math.min(this.maxHp, this.hp + Math.floor(baseHp * 0.1));
  }

  update(dt: number, map: GameMap): void {
    if (!this.alive) {
      this.deathAnim += dt;
      return;
    }
    
    this.animFrame += dt * 60;
    if (this.attackAnim > 0) {
      this.attackAnim -= dt * 3;
      if (this.attackAnim <= 0) this.isAttacking = false;
    }
    if (this.superAnim > 0) this.superAnim -= dt * 2;
    
    if (this.hitFlash > 0) this.hitFlash -= dt * 3;
    if (this.healGlowTimer > 0) this.healGlowTimer = Math.max(0, this.healGlowTimer - dt * 2.4);
    if (this.bushRevealTimer > 0) this.bushRevealTimer -= dt;
    if (this.invulnerable) {
      this.invulnerableTimer -= dt;
      if (this.invulnerableTimer <= 0) this.invulnerable = false;
    }

    for (let i = this.statusEffects.length - 1; i >= 0; i--) {
      this.statusEffects[i].duration -= dt;
      if (this.statusEffects[i].type === "poison") {
        this.takeDamage(this.statusEffects[i].value * dt, null, { suppressScreenFlash: true });
      }
      if (this.statusEffects[i].duration <= 0) {
        this.statusEffects.splice(i, 1);
      }
    }

    if (this.attackCooldownTimer > 0) {
      this.attackCooldownTimer -= dt;
      if (this.attackCooldownTimer <= 0 && this.attackCharges < this.maxAttackCharges) {
        this.attackCharges++;
        if (this.attackCharges < this.maxAttackCharges) {
          this.attackCooldownTimer = this.attackCooldown;
        }
      }
    }

    const now = Date.now() / 1000;
    const timeSinceDamage = now - this.lastDamageTime;
    const timeSinceAttack = now - this.lastAttackTime;
    if (
      !this.suppressPassiveRegen &&
      timeSinceDamage >= this.regenDelay &&
      timeSinceAttack >= this.regenDelay &&
      !this.isAttacking &&
      this.hp < this.maxHp
    ) {
      this.hp = Math.min(this.maxHp, this.hp + this.stats.regenRate * dt);
    }

    // Track position history for temporal-rewind effect (Zafkiel Dalet / super)
    this._posHistoryTimer -= dt;
    if (this._posHistoryTimer <= 0) {
      this._posHistoryTimer = 0.2; // store every 200 ms
      this.posHistory.push({ x: this.x, y: this.y });
      if (this.posHistory.length > 10) this.posHistory.shift(); // keep ~2s
    }

    this.inBush = isInBush(this.x, this.y, map.bushes);
    this.inRiver = isInRiver(this.x, this.y, map.rivers);
    if (this.tempShieldTimer > 0) {
      this.tempShieldTimer -= dt;
      if (this.tempShieldTimer <= 0) this.tempShieldHp = 0;
    }

    const result = collidesWithWalls(this.x, this.y, this.radius, map.walls);
    if (result.collides) {
      this.x = clamp(result.nx, this.radius, map.width - this.radius);
      this.y = clamp(result.ny, this.radius, map.height - this.radius);
    }

    this.x = clamp(this.x, this.radius, map.width - this.radius);
    this.y = clamp(this.y, this.radius, map.height - this.radius);

    // Smooth move-facing (3D iso + dribble); same lerp as former render-only step.
    const rdt = Math.min(0.1, dt);
    let dAng = this.moveAngle - this._smoothMoveAngle;
    while (dAng > Math.PI) dAng -= 2 * Math.PI;
    while (dAng < -Math.PI) dAng += 2 * Math.PI;
    this._smoothMoveAngle += dAng * Math.min(1, rdt * 14);

    // ── Pet effect ticks (heal pulse, periodic shield) ──────────────────
    if (this.equippedPet) {
      const eff = this.equippedPet.effect;
      // Smoothly trail behind and slightly above the player so all of the
      // pet's body — wings, ears, tail — stays clear of the brawler sprite.
      const targetAngle = this.moveAngle + Math.PI; // behind facing direction
      const tx = this.x + Math.cos(targetAngle) * 46;
      const ty = this.y + Math.sin(targetAngle) * 30 - 4;
      const lerp = Math.min(1, dt * 6);
      this.petFollowX += (tx - this.petFollowX) * lerp;
      this.petFollowY += (ty - this.petFollowY) * lerp;

      if (eff.kind === "heal") {
        this.petHealTimer += dt;
        if (this.petHealTimer >= eff.intervalSec && this.hp < this.maxHp) {
          this.petHealTimer = 0;
          const before = this.hp;
          this.hp = Math.min(this.maxHp, this.hp + eff.amount);
          if (this.hp > before) {
            spawnEffect({
              kind: "burst", x: this.x, y: this.y - this.radius - 12,
              radius: 22, color: this.equippedPet.color,
              timer: 0.5, maxTimer: 0.5,
            });
            spawnDamageNumber(this.x, this.y - this.radius - 16, Math.floor(this.hp - before), "heal");
            this.healGlowTimer = Math.min(1, this.healGlowTimer + 0.9);
          }
        }
      } else if (eff.kind === "shield") {
        this.petShieldTimer += dt;
        if (this.petShieldTimer >= eff.intervalSec) {
          this.petShieldTimer = 0;
          this.grantSpawnShield(eff.amount);
        }
      }
    }
  }

  move(dx: number, dy: number, dt: number): void {
    if (!this.alive) return;
    
    // Stun freezes all movement
    if (this.statusEffects.some(e => e.type === "stun")) return;
    
    let spd = this.speed * 60;
    
    if (this.inRiver) spd *= 0.6;
    
    const slowEffect = this.statusEffects.find(e => e.type === "slow");
    if (slowEffect) spd *= (1 - slowEffect.value);
    
    const berserk = this.statusEffects.find(e => e.type === "berserker");
    if (berserk) spd *= 1.4;

    // Pet: low-HP speed boost
    if (this.equippedPet?.effect.kind === "lowHpSpeed") {
      const e = this.equippedPet.effect;
      if (this.hp / this.maxHp <= e.hpThreshold) spd *= e.speedMult;
    }

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      this.x += (dx / len) * spd * dt;
      this.y += (dy / len) * spd * dt;
      this.moveAngle = Math.atan2(dy, dx);
      if (!this.isPlayer) {
        this.angle = this.moveAngle;
      }
    }
  }

  takeDamage(
    amount: number,
    attacker: Brawler | null,
    opts?: { suppressScreenFlash?: boolean },
  ): number {
    if (!this.alive || this.invulnerable) return 0;
    
    let dmg = amount;
    const vuln = this.statusEffects.find(e => e.type === "vulnerable");
    if (vuln) dmg *= (1 + vuln.value);
    
    const shield = this.statusEffects.find(e => e.type === "stun");
    if (shield && this.stats.id === "ronin") {
      dmg *= 0.5;
      if (attacker) {
        attacker.takeDamage(dmg * 0.3, null, { suppressScreenFlash: true });
      }
    }
    
    const berserk = this.statusEffects.find(e => e.type === "berserker");
    if (berserk) dmg *= 1.2;

    // Pet: outgoing damage buff (attacker side)
    if (attacker?.equippedPet?.effect.kind === "damageBuff" && attacker.team !== this.team) {
      dmg *= attacker.equippedPet.effect.multiplier;
    }
    
    if (this.tempShieldHp > 0) {
      const blocked = Math.min(this.tempShieldHp, dmg);
      this.tempShieldHp -= blocked;
      dmg -= blocked;
    }
    this.hp -= dmg;
    this.lastDamageTime = Date.now() / 1000;
    this.hitFlash = 1;
    if (this.isPlayer && dmg > 0 && !opts?.suppressScreenFlash) {
      flashPlayerDamage(dmg, this.maxHp);
    }

    if (this.isPlayer) {
      spawnDamageNumber(this.x, this.y - this.radius - 10, Math.floor(dmg), "player");
    } else {
      spawnDamageNumber(this.x, this.y - this.radius - 10, Math.floor(dmg), "damage");
    }

    // Pet: thorns — defender reflects part of incoming damage back.
    if (
      this.equippedPet?.effect.kind === "thorns" &&
      attacker && attacker.alive && attacker.team !== this.team
    ) {
      const reflect = dmg * this.equippedPet.effect.reflectPct;
      attacker.hp -= reflect;
      attacker.lastDamageTime = Date.now() / 1000;
      attacker.hitFlash = 1;
      spawnDamageNumber(attacker.x, attacker.y - attacker.radius - 10, Math.floor(reflect), "damage");
      if (attacker.hp <= 0) {
        attacker.hp = 0;
        attacker.alive = false;
        attacker.deathAnim = 0;
        spawnEffect({
          kind: "burst", x: attacker.x, y: attacker.y,
          radius: 70, color: attacker.stats.accentColor || attacker.stats.color,
          timer: 0.45, maxTimer: 0.45,
        });
        spawnEffect({
          kind: "shockwave", x: attacker.x, y: attacker.y,
          radius: 90, color: attacker.stats.color,
          timer: 0.35, maxTimer: 0.35,
        });
      }
    }

    // Pet: ignite chance — attacker stacks a poison DoT on the target.
    if (
      attacker?.equippedPet?.effect.kind === "ignite" &&
      attacker.alive && attacker.team !== this.team &&
      Math.random() < attacker.equippedPet.effect.chance
    ) {
      const ig = attacker.equippedPet.effect;
      this.statusEffects.push({ type: "poison", duration: ig.durationSec, value: ig.dps });
      spawnEffect({
        kind: "burst", x: this.x, y: this.y - this.radius - 8,
        radius: 18, color: attacker.equippedPet.color,
        timer: 0.35, maxTimer: 0.35,
      });
    }
    
    // Super now charges ONLY from successfully landing a hit on an enemy —
    // no passive/auto-fill. Each brawler has its own per-hit charge rate
    // (see BrawlerStats.superChargePerHit). Damage-over-time / environmental
    // ticks pass attacker = null and intentionally award no charge.
    if (attacker && attacker.alive && attacker.team !== this.team) {
      const gain = (attacker.stats.superChargePerHit / 100) * attacker.maxSuperCharge;
      attacker.superCharge = Math.min(attacker.maxSuperCharge, attacker.superCharge + gain);
      if (attacker.superCharge >= attacker.maxSuperCharge) attacker.superReady = true;
      // Track damage for quest stats (player attacking enemy)
      if (attacker.isPlayer) addMatchStat("damageDealt", dmg);
    }
    
    if (this.hp <= 0) {
      // Pet: phoenix-style revive (one-shot per match) — only the local player
      // benefits from a revive, since pets aren't carried by bots.
      if (
        this.equippedPet?.effect.kind === "revive" &&
        !this.petPhoenixUsed && this.isPlayer
      ) {
        this.petPhoenixUsed = true;
        const restoreFrac = this.equippedPet.effect.hpRestoredPct;
        this.hp = Math.max(1, Math.floor(this.maxHp * restoreFrac));
        this.statusEffects = [];
        this.grantSpawnShield(2);
        spawnEffect({
          kind: "burst", x: this.x, y: this.y,
          radius: 90, color: this.equippedPet.color,
          timer: 0.7, maxTimer: 0.7, secondary: this.equippedPet.secondaryColor,
        });
        spawnDamageNumber(this.x, this.y - this.radius - 16, Math.floor(this.hp), "heal");
        this.healGlowTimer = 1;
        return dmg;
      }

      this.hp = 0;
      this.alive = false;
      this.deathAnim = 0;
      // Death burst: short explosion + shockwave, then body fades out.
      spawnEffect({
        kind: "burst", x: this.x, y: this.y,
        radius: 70, color: this.stats.accentColor || this.stats.color,
        timer: 0.45, maxTimer: 0.45,
      });
      spawnEffect({
        kind: "shockwave", x: this.x, y: this.y,
        radius: 90, color: this.stats.color,
        timer: 0.35, maxTimer: 0.35,
      });
      // Track kill for quest stats (player killed an enemy)
      if (attacker?.isPlayer && !this.isPlayer) {
        addMatchStat("killCount", 1);
        // Pet bonuses on kill (only attacker is the local player)
        const ap = attacker.equippedPet;
        if (ap?.effect.kind === "killCoins") {
          addMatchStat("petBonusCoins", ap.effect.coins);
        }
        if (ap?.effect.kind === "supercharge") {
          const gain = (ap.effect.perKill / 100) * attacker.maxSuperCharge;
          attacker.superCharge = Math.min(attacker.maxSuperCharge, attacker.superCharge + gain);
          if (attacker.superCharge >= attacker.maxSuperCharge) attacker.superReady = true;
        }
      }
    }
    
    return dmg;
  }

  heal(amount: number): void {
    if (!this.alive) return;
    const actual = Math.min(this.maxHp - this.hp, amount);
    this.hp = Math.min(this.maxHp, this.hp + amount);
    spawnDamageNumber(this.x, this.y - this.radius - 10, Math.floor(amount), "heal");
    if (actual > 0) this.healGlowTimer = Math.min(1, this.healGlowTimer + 0.95);
    if (this.isPlayer && actual > 0) addMatchStat("healingDone", actual);
  }

  addStatus(type: StatusEffect["type"], duration: number, value = 0): void {
    const existing = this.statusEffects.findIndex(e => e.type === type);
    if (existing >= 0) {
      this.statusEffects[existing].duration = duration;
    } else {
      this.statusEffects.push({ type, duration, value });
    }
  }

  grantTempShield(amount: number, duration: number, maxStack: number): void {
    this.tempShieldHp = Math.min(maxStack, this.tempShieldHp + amount);
    this.tempShieldTimer = Math.max(this.tempShieldTimer, duration);
  }

  canAttack(): boolean {
    return this.alive && this.attackCharges > 0;
  }

  useAttackCharge(): void {
    if (this.attackCharges <= 0) return;
    this.attackCharges--;
    this.isAttacking = true;
    this.attackAnim = 1;
    this.lastAttackTime = Date.now() / 1000;
    if (this.attackCharges < this.maxAttackCharges && this.attackCooldownTimer <= 0) {
      this.attackCooldownTimer = this.attackCooldown;
    }
  }

  canUseSuper(): boolean {
    return this.alive && this.superReady;
  }

  useSuper(): void {
    this.superReady = false;
    this.superCharge = 0;
    this.superAnim = 1;
  }

  shoot(angle: number): Projectile[] {
    const projs: Projectile[] = [];
    const spd = 400;
    const dmg = this.scaledDamage;
    
    // Shooting from a bush briefly reveals the brawler to enemies (0.8s)
    if (this.inBush) this.bushRevealTimer = 0.8;
    
    this.useAttackCharge();

    // Generic muzzle flash so every shot has visual feedback (size keyed
    // off accentColor — this gives each brawler a uniquely tinted burst).
    spawnEffect({
      kind: "burst",
      x: this.x + Math.cos(angle) * (this.radius + 4),
      y: this.y + Math.sin(angle) * (this.radius + 4),
      radius: 14,
      color: this.stats.accentColor || this.stats.color,
      timer: 0.22, maxTimer: 0.22,
    });
    // A few outward sparks for kinetic punch.
    for (let i = 0; i < 4; i++) {
      const a = angle + (Math.random() - 0.5) * 0.7;
      const dist = 22 + Math.random() * 14;
      spawnEffect({
        kind: "spark",
        x: this.x + Math.cos(angle) * (this.radius + 4),
        y: this.y + Math.sin(angle) * (this.radius + 4),
        toX: this.x + Math.cos(angle) * (this.radius + 4) + Math.cos(a) * dist,
        toY: this.y + Math.sin(angle) * (this.radius + 4) + Math.sin(a) * dist,
        radius: 3,
        color: this.stats.accentColor || this.stats.color,
        timer: 0.28, maxTimer: 0.28,
      });
    }

    switch (this.stats.id) {
      case "miya": {
        for (const offset of [-0.26, 0, 0.26]) {
          const a = angle + offset;
          projs.push(createProjectile({
            x: this.x, y: this.y,
            vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
            radius: 8, damage: dmg,
            speed: spd, range: this.stats.attackRange,
            ownerId: this.id, ownerTeam: this.team,
            color: "#CE93D8", type: "shuriken", piercing: true,
          }));
        }
        break;
      }
      case "yuki": {
        projs.push(createProjectile({
          x: this.x, y: this.y,
          vx: Math.cos(angle) * 300, vy: Math.sin(angle) * 300,
          radius: 12, damage: dmg,
          speed: 300, range: this.stats.attackRange,
          ownerId: this.id, ownerTeam: this.team,
          color: "#B3E5FC", type: "snowball", piercing: false, slow: true,
        }));
        break;
      }
      case "sora": {
        projs.push(createProjectile({
          x: this.x, y: this.y,
          vx: Math.cos(angle) * 350, vy: Math.sin(angle) * 350,
          radius: 12, damage: dmg,
          speed: 350, range: this.stats.attackRange,
          ownerId: this.id, ownerTeam: this.team,
          color: "#FF6F00", type: "fireball", piercing: false,
          explosionRadius: 60,
        }));
        break;
      }
      case "rin": {
        projs.push(createProjectile({
          x: this.x, y: this.y,
          vx: Math.cos(angle) * 450, vy: Math.sin(angle) * 450,
          radius: 8, damage: dmg,
          speed: 450, range: this.stats.attackRange,
          ownerId: this.id, ownerTeam: this.team,
          color: "#69F0AE", type: "dagger", piercing: false, poison: true,
        }));
        break;
      }
      case "hana": {
        projs.push(createProjectile({
          x: this.x, y: this.y,
          vx: Math.cos(angle) * 420, vy: Math.sin(angle) * 420,
          radius: 8, damage: dmg,
          speed: 420, range: this.stats.attackRange,
          ownerId: this.id, ownerTeam: this.team,
          color: "#FF80AB", type: "bullet", piercing: false,
        }));
        break;
      }
      case "zafkiel": {
        const cIdx = this.zafkielChargeIdx % 3;
        // Muzzle origin slightly ahead of the caster
        const muzzleX = this.x + Math.cos(angle) * 18;
        const muzzleY = this.y + Math.sin(angle) * 18;

        if (this.zafkielMode === "normal") {
          if (cIdx === 0) {
            // ── Dalet: temporal ash shot — grey-white orb, slow + rewind ──
            projs.push(createProjectile({
              x: this.x, y: this.y,
              vx: Math.cos(angle) * 380, vy: Math.sin(angle) * 380,
              radius: 11, damage: Math.round(dmg * 0.86),
              speed: 380, range: this.stats.attackRange,
              ownerId: this.id, ownerTeam: this.team,
              color: "#ECEFF1", type: "bullet", piercing: false,
              slow: true, temporalRewind: 1.0,
            }));
            // Ghostly muzzle burst — clockface particles
            spawnEffect({ kind: "burst", x: muzzleX, y: muzzleY, radius: 28, color: "#CFD8DC", timer: 0.35, maxTimer: 0.35, secondary: "#90A4AE" });
            // Pale shockwave ring around caster
            spawnEffect({ kind: "shockwave", x: this.x, y: this.y, radius: 18, color: "#B0BEC5", timer: 0.22, maxTimer: 0.22 });
            // Trailing clock-hand spark along fire direction
            spawnEffect({ kind: "trail", x: this.x, y: this.y, toX: muzzleX + Math.cos(angle) * 40, toY: muzzleY + Math.sin(angle) * 40, radius: 3, color: "#E0E0E0", timer: 0.18, maxTimer: 0.18 });
          } else if (cIdx === 1) {
            // ── Bet: deep-blue slow orb ──
            projs.push(createProjectile({
              x: this.x, y: this.y,
              vx: Math.cos(angle) * 360, vy: Math.sin(angle) * 360,
              radius: 13, damage: Math.round(dmg),
              speed: 360, range: this.stats.attackRange,
              ownerId: this.id, ownerTeam: this.team,
              color: "#1E88E5", type: "snowball", piercing: false,
              slow: true,
            }));
            // Frosty muzzle burst with cyan inner glow
            spawnEffect({ kind: "burst", x: muzzleX, y: muzzleY, radius: 26, color: "#42A5F5", timer: 0.30, maxTimer: 0.30, secondary: "#0D47A1" });
            spawnEffect({ kind: "shockwave", x: this.x, y: this.y, radius: 16, color: "#1565C0", timer: 0.20, maxTimer: 0.20 });
          } else {
            // ── Zayin: purple stun bolt ──
            projs.push(createProjectile({
              x: this.x, y: this.y,
              vx: Math.cos(angle) * 340, vy: Math.sin(angle) * 340,
              radius: 11, damage: Math.round(dmg * 1.29),
              speed: 340, range: this.stats.attackRange,
              ownerId: this.id, ownerTeam: this.team,
              color: "#9C27B0", type: "bullet", piercing: false,
              stunDuration: 0.6,
            }));
            spawnEffect({ kind: "burst", x: muzzleX, y: muzzleY, radius: 30, color: "#CE93D8", timer: 0.35, maxTimer: 0.35, secondary: "#6A1B9A" });
            // Lightning snap along attack direction
            spawnEffect({ kind: "lightningBolt", x: this.x, y: this.y, toX: muzzleX + Math.cos(angle) * 55, toY: muzzleY + Math.sin(angle) * 55, radius: 4, color: "#E040FB", timer: 0.18, maxTimer: 0.18 });
            spawnEffect({ kind: "shockwave", x: this.x, y: this.y, radius: 20, color: "#7B1FA2", timer: 0.25, maxTimer: 0.25 });
          }
        } else {
          // ── Enhanced mode (after Врата Вечности super) ──
          if (cIdx === 0) {
            // Aleph: blazing red hyper-bullet (2× speed)
            projs.push(createProjectile({
              x: this.x, y: this.y,
              vx: Math.cos(angle) * 760, vy: Math.sin(angle) * 760,
              radius: 10, damage: Math.round(dmg * 1.09),
              speed: 760, range: this.stats.attackRange * 1.2,
              ownerId: this.id, ownerTeam: this.team,
              color: "#FF1744", type: "bullet", piercing: false,
            }));
            spawnEffect({ kind: "burst", x: muzzleX, y: muzzleY, radius: 28, color: "#FF5252", timer: 0.22, maxTimer: 0.22, secondary: "#B71C1C" });
            spawnEffect({ kind: "lightningBolt", x: this.x, y: this.y, toX: muzzleX + Math.cos(angle) * 60, toY: muzzleY + Math.sin(angle) * 60, radius: 5, color: "#FF6D00", timer: 0.16, maxTimer: 0.16 });
            spawnEffect({ kind: "shockwave", x: this.x, y: this.y, radius: 22, color: "#D50000", timer: 0.22, maxTimer: 0.22 });
          } else if (cIdx === 1) {
            // Gimmel: lime-gold poison dagger
            projs.push(createProjectile({
              x: this.x, y: this.y,
              vx: Math.cos(angle) * 380, vy: Math.sin(angle) * 380,
              radius: 11, damage: Math.round(dmg * 0.86),
              speed: 380, range: this.stats.attackRange,
              ownerId: this.id, ownerTeam: this.team,
              color: "#AEEA00", type: "dagger", piercing: false,
              poison: true,
            }));
            spawnEffect({ kind: "burst", x: muzzleX, y: muzzleY, radius: 26, color: "#CCFF90", timer: 0.30, maxTimer: 0.30, secondary: "#33691E" });
            // Poison cloud wisps
            spawnEffect({ kind: "spark", x: muzzleX, y: muzzleY, radius: 14, color: "#76FF03", timer: 0.40, maxTimer: 0.40 });
            spawnEffect({ kind: "shockwave", x: this.x, y: this.y, radius: 16, color: "#AEEA00", timer: 0.20, maxTimer: 0.20 });
          } else {
            // Yud: amber homing orb — locks on and chases
            projs.push(createProjectile({
              x: this.x, y: this.y,
              vx: Math.cos(angle) * 360, vy: Math.sin(angle) * 360,
              radius: 14, damage: Math.round(dmg * 1.14),
              speed: 360, range: this.stats.attackRange * 1.5,
              ownerId: this.id, ownerTeam: this.team,
              color: "#FFAB00", type: "bullet", piercing: false,
              homing: true,
            }));
            spawnEffect({ kind: "burst", x: muzzleX, y: muzzleY, radius: 30, color: "#FFD740", timer: 0.35, maxTimer: 0.35, secondary: "#E65100" });
            spawnEffect({ kind: "shockwave", x: this.x, y: this.y, radius: 24, color: "#FF8F00", timer: 0.28, maxTimer: 0.28 });
          }
          // After all 3 enhanced charges, cycle returns to normal
          if (cIdx === 2) {
            this.zafkielMode = "normal";
            this.zafkielChargeIdx = 0;
            // Grand cycle-end visual: double shockwave + burst
            spawnEffect({ kind: "shockwave", x: this.x, y: this.y, radius: 40, color: "#7C4DFF", timer: 0.5, maxTimer: 0.5 });
            spawnEffect({ kind: "burst",     x: this.x, y: this.y, radius: 36, color: "#B388FF", timer: 0.4, maxTimer: 0.4 });
            break;
          }
        }
        this.zafkielChargeIdx = (this.zafkielChargeIdx + 1) % 3;
        break;
      }
      default: {
        projs.push(createProjectile({
          x: this.x, y: this.y,
          vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
          radius: 8, damage: dmg,
          speed: spd, range: this.stats.attackRange,
          ownerId: this.id, ownerTeam: this.team,
          color: this.stats.color, type: "bullet", piercing: false,
        }));
      }
    }
    
    return projs;
  }

  meleeAttack(targets: Brawler[]): void {
    this.useAttackCharge();
    // Visual swing arc — a quick crescent burst in front of the brawler.
    const reach = this.stats.attackRange + this.radius;
    spawnEffect({
      kind: "burst",
      x: this.x + Math.cos(this.angle) * reach * 0.5,
      y: this.y + Math.sin(this.angle) * reach * 0.5,
      radius: reach * 0.55,
      color: this.stats.accentColor || this.stats.color,
      timer: 0.28, maxTimer: 0.28,
    });
    for (const target of targets) {
      if (target.id === this.id || !target.alive) continue;
      if (target.team === this.team) continue;
      const d = distance(this.x, this.y, target.x, target.y);
      
      let range = this.stats.attackRange;
      
      if (this.stats.id === "goro") {
        range = 90;
        if (d < range + target.radius) {
          const berserk = this.statusEffects.find(e => e.type === "berserker");
          const dmgMult = berserk ? 1.5 : 1;
          target.takeDamage(this.scaledDamage * dmgMult, this);
        }
      } else if (this.stats.id === "ronin") {
        const angle = Math.atan2(target.y - this.y, target.x - this.x);
        const diff = Math.abs(angleTo(this.x, this.y, target.x, target.y) - this.angle);
        if (d < range + target.radius && diff < Math.PI / 3) {
          target.takeDamage(this.scaledDamage, this);
        }
      } else if (this.stats.id === "taro") {
        if (d < range + target.radius) {
          target.takeDamage(this.scaledDamage, this);
        }
      }
    }
  }

  activateSuper(targets: Brawler[], map: GameMap, projectiles: Projectile[], targetX?: number, targetY?: number): void {
    if (!this.canUseSuper()) return;
    if (this.isPlayer) addMatchStat("superUses", 1);
    this.useSuper();

    // Generic "super-cast" flash centered on the brawler — every super
    // gets a bright golden ring so the moment of activation is unmistakable.
    spawnEffect({
      kind: "shockwave", x: this.x, y: this.y,
      radius: this.radius * 2.5, color: "#FFD700",
      timer: 0.55, maxTimer: 0.55,
    });

    switch (this.stats.id) {
      case "miya": {
        let nearest: Brawler | null = null;
        let nearestDist = 350;
        for (const t of targets) {
          if (!t.alive || t.team === this.team) continue;
          const d = distance(this.x, this.y, t.x, t.y);
          if (d < nearestDist) { nearestDist = d; nearest = t; }
        }
        if (nearest) {
          const fromX = this.x, fromY = this.y;
          const angle = angleTo(nearest.x, nearest.y, this.x, this.y);
          this.x = clamp(nearest.x + Math.cos(angle) * 40, this.radius, map.width - this.radius);
          this.y = clamp(nearest.y + Math.sin(angle) * 40, this.radius, map.height - this.radius);
          // Teleport strike: Miya deals her standard super burst on arrival.
          nearest.takeDamage(this.scaledDamage * 1.6, this);
          nearest.addStatus("slow", 1.5, 0.5);
          // Departure swirl
          spawnEffect({
            kind: "teleportFlash", x: fromX, y: fromY,
            radius: 36, color: "#CE93D8",
            timer: 0.6, maxTimer: 0.6,
          });
          // Purple trail line connecting both points
          spawnEffect({
            kind: "trail", x: fromX, y: fromY, toX: this.x, toY: this.y,
            radius: 6, color: "#CE93D8", secondary: "#FFFFFF",
            timer: 0.45, maxTimer: 0.45,
          });
          // Arrival swirl
          spawnEffect({
            kind: "teleportFlash", x: this.x, y: this.y,
            radius: 38, color: "#CE93D8",
            timer: 0.6, maxTimer: 0.6,
          });
        }
        break;
      }
      case "ronin": {
        this.addStatus("stun", 4, 0);
        this.invulnerable = false;
        // Persistent shield dome that follows the brawler for the duration.
        spawnEffect({
          kind: "shieldDome", x: this.x, y: this.y,
          radius: this.radius + 18, color: "#FFD700",
          timer: 4, maxTimer: 4,
          followBrawler: this,
          linkedStatus: "stun",
        });
        break;
      }
      case "yuki": {
        for (const t of targets) {
          if (!t.alive || t.team !== this.team) continue;
          if (distance(this.x, this.y, t.x, t.y) < 140) {
            t.addStatus("slow", 3, -0.3);
            t.heal(900);
          }
        }
        // Snow zone visual lasting for the buff duration.
        spawnEffect({
          kind: "snowZone", x: this.x, y: this.y,
          radius: 140, color: "#B3E5FC",
          timer: 6, maxTimer: 6,
          particleCount: 18,
        });
        break;
      }
      case "kenji": {
        let chain = 3;
        let lastX = this.x, lastY = this.y;
        for (const t of targets) {
          if (!t.alive || t.team === this.team || chain <= 0) continue;
          if (distance(lastX, lastY, t.x, t.y) < 200) {
            t.takeDamage(this.scaledDamage * 2, this);
            t.addStatus("slow", 5, 0.3);
            // Lightning chain segment from last hit to this target.
            spawnEffect({
              kind: "lightningBolt", x: lastX, y: lastY, toX: t.x, toY: t.y,
              radius: 4, color: "#FFEB3B",
              timer: 0.5, maxTimer: 0.5,
              zigzag: makeZigzag(lastX, lastY, t.x, t.y, 7, 22),
            });
            spawnEffect({
              kind: "burst", x: t.x, y: t.y,
              radius: 28, color: "#FFEB3B",
              timer: 0.45, maxTimer: 0.45,
            });
            lastX = t.x; lastY = t.y;
            chain--;
          }
        }
        // Persistent electric cage centered on the activator (5 sec).
        spawnEffect({
          kind: "lightCage", x: this.x, y: this.y,
          radius: 110, color: "#FFEB3B",
          timer: 5, maxTimer: 5,
        });
        break;
      }
      case "hana": {
        for (const t of targets) {
          if (!t.alive || t.team !== this.team) continue;
          if (distance(this.x, this.y, t.x, t.y) < 160) {
            t.heal(1200);
          }
        }
        for (const t of targets) {
          if (!t.alive || t.team === this.team) continue;
          if (distance(this.x, this.y, t.x, t.y) < 160) {
            t.takeDamage(300, this);
          }
        }
        // Garden zone visual that lingers for 5 seconds.
        spawnEffect({
          kind: "petalZone", x: this.x, y: this.y,
          radius: 160, color: "#FF80AB",
          timer: 5, maxTimer: 5,
          particleCount: 20,
        });
        break;
      }
      case "goro": {
        this.addStatus("berserker", 5, 0.4);
        // Fire aura that follows the brawler while berserker is active.
        spawnEffect({
          kind: "berserkAura", x: this.x, y: this.y,
          radius: this.radius + 8, color: "#FF3D00",
          timer: 5, maxTimer: 5,
          followBrawler: this,
          linkedStatus: "berserker",
        });
        break;
      }
      case "sora": {
        const targetX = this.x + Math.cos(this.angle) * 200;
        const targetY = this.y + Math.sin(this.angle) * 200;
        // Spawn 5 staggered meteors with a 0.6s warning each. The meteor
        // effect itself handles delay → damage → shockwave.
        for (let i = 0; i < 5; i++) {
          const mx = targetX + (Math.random() - 0.5) * 200;
          const my = targetY + (Math.random() - 0.5) * 200;
          spawnEffect({
            kind: "meteor", x: mx, y: my,
            radius: 16, color: "#FF6F00",
            timer: 1.6 + i * 0.25, maxTimer: 1.6 + i * 0.25,
            delay: 0.6 + i * 0.25,
            tickRange: 60,
            ownerId: this.id, ownerTeam: this.team,
            damagePerTick: 250,
            fallHeight: 360,
          });
        }
        break;
      }
      case "rin": {
        // Place the poison cloud at the aimed location (capped to 300 units
        // from Rin). When no aim is supplied (e.g. bots) it falls back to
        // her current position.
        let zx = this.x, zy = this.y;
        if (typeof targetX === "number" && typeof targetY === "number") {
          const dx = targetX - this.x, dy = targetY - this.y;
          const d = Math.hypot(dx, dy);
          const maxR = 300;
          if (d > maxR && d > 0) {
            zx = this.x + (dx / d) * maxR;
            zy = this.y + (dy / d) * maxR;
          } else {
            zx = targetX; zy = targetY;
          }
          zx = clamp(zx, this.radius, map.width - this.radius);
          zy = clamp(zy, this.radius, map.height - this.radius);
        }
        for (const t of targets) {
          if (!t.alive || t.team === this.team) continue;
          if (distance(zx, zy, t.x, t.y) < 100) {
            t.addStatus("poison", 6, 150);
          }
        }
        spawnEffect({
          kind: "poisonZone", x: zx, y: zy,
          radius: 100, color: "#69F0AE",
          timer: 4, maxTimer: 4,
          particleCount: 14,
        });
        break;
      }
      case "taro": {
        // Drop a stationary mech turret in front of the brawler.
        const tx = clamp(this.x + Math.cos(this.angle) * 50, this.radius, map.width - this.radius);
        const ty = clamp(this.y + Math.sin(this.angle) * 50, this.radius, map.height - this.radius);
        spawnTaroTurretEffect(this.turretPlacementId, this.team, {
          x: tx, y: ty,
          radius: 30, color: "#FFEB3B",
          timer: 12, maxTimer: 12,
          tickInterval: 0.55, tickTimer: 0.4,
          tickRange: 250, damagePerTick: 150,
        });
        break;
      }
      case "zafkiel": {
        // Врата Вечности — area that rewinds enemies to their past position
        const has6 = this.constellationStars.includes(6);
        const superRadius = has6 ? 130 : 120;
        const superX = typeof targetX === "number" ? clamp(targetX, this.radius, map.width - this.radius) : this.x;
        const superY = typeof targetY === "number" ? clamp(targetY, this.radius, map.height - this.radius) : this.y;

        // Rewind all enemies in range to 2s-ago position
        for (const t of targets) {
          if (!t.alive || t.team === this.team) continue;
          if (distance(superX, superY, t.x, t.y) < superRadius) {
            // Teleport to 2s-ago position (posHistory[0]) or slow if no history
            if (t.posHistory.length >= 2) {
              const pastPos = t.posHistory[0];
              // Flash at current position
              spawnEffect({
                kind: "teleportFlash", x: t.x, y: t.y,
                radius: 28, color: "#B388FF",
                timer: 0.5, maxTimer: 0.5,
              });
              t.x = clamp(pastPos.x, t.radius, map.width - t.radius);
              t.y = clamp(pastPos.y, t.radius, map.height - t.radius);
              spawnEffect({
                kind: "teleportFlash", x: t.x, y: t.y,
                radius: 28, color: "#7C4DFF",
                timer: 0.5, maxTimer: 0.5,
              });
            } else {
              // No position history — apply slow instead
              t.addStatus("slow", 2, 0.5);
            }
          }
        }

        // ── Врата Вечности: layered gate-opening visual ──
        // 1. Outer golden shockwave — announces the gate
        spawnEffect({ kind: "shockwave", x: superX, y: superY, radius: superRadius * 1.2, color: "#FFD700", timer: 0.55, maxTimer: 0.55 });
        // 2. Inner dark-purple shockwave
        spawnEffect({ kind: "shockwave", x: superX, y: superY, radius: superRadius * 0.7, color: "#7C4DFF", timer: 0.45, maxTimer: 0.45 });
        // 3. Swirling temporal zone (snowZone = swirling particles)
        spawnEffect({
          kind: "snowZone", x: superX, y: superY,
          radius: superRadius, color: "#9C27B0",
          timer: 4.5, maxTimer: 4.5,
          particleCount: 28,
        });
        // 4. Lightning arcs around the gate centre
        spawnEffect({ kind: "lightningBolt", x: superX, y: superY, toX: superX + superRadius * 0.8, toY: superY, radius: 5, color: "#E040FB", timer: 0.25, maxTimer: 0.25 });
        spawnEffect({ kind: "lightningBolt", x: superX, y: superY, toX: superX - superRadius * 0.8, toY: superY, radius: 5, color: "#E040FB", timer: 0.25, maxTimer: 0.25 });
        spawnEffect({ kind: "lightningBolt", x: superX, y: superY, toX: superX, toY: superY - superRadius * 0.8, radius: 5, color: "#CE93D8", timer: 0.25, maxTimer: 0.25 });
        // 5. Large burst at centre
        spawnEffect({ kind: "burst", x: superX, y: superY, radius: 55, color: "#B388FF", timer: 0.40, maxTimer: 0.40, secondary: "#4A148C" });
        if (has6) {
          // Persistent trap-like zone.
          spawnEffect({
            kind: "poisonZone", x: superX, y: superY,
            radius: superRadius, color: "#B388FF",
            timer: 10, maxTimer: 10, particleCount: 18,
          });
        }

        // Switch to enhanced mode with 3 powered charges
        this.zafkielMode = "enhanced";
        this.zafkielChargeIdx = 0;
        if (this.constellationStars.includes(2)) {
          this.attackCharges = Math.min(this.maxAttackCharges, this.attackCharges + 1);
        }
        // 6. Violet berserk aura on Zafkiel herself while enhanced
        spawnEffect({
          kind: "berserkAura", x: this.x, y: this.y,
          radius: this.radius + 12, color: "#7C4DFF",
          timer: 4.5, maxTimer: 4.5,
          followBrawler: this,
        });
        // 7. Teleport flash at caster to signal power-up
        spawnEffect({ kind: "teleportFlash", x: this.x, y: this.y, radius: 32, color: "#EDE7F6", timer: 0.45, maxTimer: 0.45 });
        break;
      }
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    camX: number,
    camY: number,
    spriteLoaded: boolean,
    viewerTeam?: string,
    friendlies?: { x: number; y: number }[],
    projSY?: number,
    /** ISO tile maps: split so tall walls can Y-sort against the body; HUD stays projected. */
    layer: "all" | "world" | "hud" = "all",
  ): void {
    const sx = this.x - camX;
    const hudSY = projSY !== undefined ? projSY : this.y - camY;

    // ── HUD only (drawn after ISO world merge, uses screen-projected Y) ──
    if (layer === "hud") {
      if (!this.alive) return;
      const isEnemyToViewer = viewerTeam !== undefined && !this.isPlayer && this.team !== viewerTeam;
      if (this.inBush && isEnemyToViewer) {
        const REVEAL_RADIUS = 140;
        let revealed = this.bushRevealTimer > 0;
        if (!revealed && friendlies) {
          for (const f of friendlies) {
            const ddx = f.x - this.x;
            const ddy = f.y - this.y;
            if (ddx * ddx + ddy * ddy <= REVEAL_RADIUS * REVEAL_RADIUS) {
              revealed = true;
              break;
            }
          }
        }
        if (!revealed) return;
      }
      if (sx < -this.radius * 2 || sx > 1200 + this.radius * 2) return;
      if (hudSY < -this.radius * 2 || hudSY > 800 + this.radius * 2) return;
      this.renderNameLabel(ctx, sx, hudSY, viewerTeam);
      this.renderHPBar(ctx, sx, hudSY, viewerTeam);
      this.renderAmmoBar(ctx, sx, hudSY, viewerTeam);
      if (this.isPlayer) this.renderSuperBar(ctx, sx, hudSY);
      return;
    }

    // Dead brawlers: never render the body after death.
    // Death VFX is handled separately via spawnEffect() on kill.
    if (!this.alive) return;

    const sy = layer === "world" ? this.y - camY : hudSY;
    if (sx < -this.radius * 2 || sx > 1200 + this.radius * 2) return;
    if (sy < -this.radius * 2 || sy > 800 + this.radius * 2) return;

    // Hide enemies in bushes — revealed only when a friendly is close or they shot recently
    const isEnemyToViewer = viewerTeam !== undefined && !this.isPlayer && this.team !== viewerTeam;
    if (this.alive && this.inBush && isEnemyToViewer) {
      const REVEAL_RADIUS = 140;
      let revealed = this.bushRevealTimer > 0; // briefly visible after shooting
      if (!revealed && friendlies) {
        for (const f of friendlies) {
          const ddx = f.x - this.x;
          const ddy = f.y - this.y;
          if (ddx * ddx + ddy * ddy <= REVEAL_RADIUS * REVEAL_RADIUS) {
            revealed = true;
            break;
          }
        }
      }
      if (!revealed) return;
    }
    
    let alpha = 1;
    if (!this.alive) {
      // Fade out to zero in under 1 second.
      alpha = Math.max(0, 1 - this.deathAnim * 1.25);
    } else if (this.inBush && this.isPlayer) {
      alpha = 0.6;
    } else if (this.inBush) {
      alpha = 0.85;
    }
    
    // Team relation indicator ring at feet (true circle — flat ellipse read as “wrong aspect”).
    if (this.alive && viewerTeam !== undefined) {
      let ringColor: string;
      if (this.isPlayer) ringColor = "#4CAF50";
      else if (this.team === viewerTeam) ringColor = "#2196F3";
      else ringColor = "#F44336";
      const ringR = this.radius * 0.88;
      const ringCy = sy + this.radius - 2;
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 3;
      ctx.shadowColor = ringColor;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(sx, ringCy, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.globalAlpha = alpha * 0.32;
      ctx.fillStyle = ringColor;
      ctx.beginPath();
      ctx.arc(sx, ringCy, ringR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Ground shadow — soft oval, slightly down-right (milder ellipse so it doesn’t read as stretch).
    if (this.alive) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.30;
      const ox = 2.5;
      const oy = 3;
      const shadowW = this.radius * 1.22;
      const shadowH = this.radius * 0.56;
      const cx = sx + ox;
      const cy = sy + this.radius + 1 + oy;
      const grad = ctx.createRadialGradient(
        cx, cy, shadowH * 0.18,
        cx, cy, shadowW
      );
      grad.addColorStop(0, "rgba(0,0,0,0.42)");
      grad.addColorStop(0.55, "rgba(0,0,0,0.12)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, shadowW, shadowH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    
    const poisoned = this.statusEffects.some(e => e.type === "poison");
    if (poisoned) {
      ctx.save();
      ctx.globalAlpha = alpha * (0.32 + Math.sin(this.animFrame * 0.11) * 0.08);
      const pg = ctx.createRadialGradient(sx, sy - 6, 0, sx, sy, this.radius * 1.65);
      pg.addColorStop(0, "rgba(129,199,132,0.55)");
      pg.addColorStop(0.45, "rgba(56,142,60,0.28)");
      pg.addColorStop(1, "rgba(27,94,32,0)");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(sx, sy, this.radius * 1.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (this.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = this.hitFlash * 0.32;
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.beginPath();
      ctx.arc(sx, sy, this.radius + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (this.alive && this.tempShieldHp > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.min(0.45, this.tempShieldHp / 1000);
      ctx.strokeStyle = "#80D8FF";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#80D8FF";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(sx, sy, this.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Pet follows behind the brawler logically — draw before the body so overlap reads as "under" the model.
    if (this.alive && this.equippedPet) {
      this.renderPetFollower(ctx, camX, camY);
    }

    const glowColor = this.statusEffects.some(e => e.type === "berserker") ? "#FF1744" :
      this.equippedPet?.effect.kind === "damageBuff" ? "#FF5722" :
        this.statusEffects.some(e => e.type === "stun") ? "#FFD700" : undefined;

    // 3D characters are rendered via an off-screen WebGL renderer.
    const charRenderer = CHAR_3D_IDS.has(this.stats.id) ? getCharRenderer(this.stats.id) : null;
    if (charRenderer && charRenderer.isReady()) {
      const dx = this.x - this._lastRenderX;
      const dy = this.y - this._lastRenderY;
      const moved = Math.hypot(dx, dy);
      const isMovingNow = moved > 0.3 ? 1 : 0;
      this._movingSmoothed = this._movingSmoothed * 0.7 + isMovingNow * 0.3;
      this._lastRenderX = this.x;
      this._lastRenderY = this.y;

      if (this._runAnimLatch) {
        if (this._movingSmoothed < 0.38) this._runAnimLatch = false;
      } else if (this._movingSmoothed > 0.52) {
        this._runAnimLatch = true;
      }

      const anim: CharAnim = !this.alive
        ? "dead"
        : this.attackAnim > 0.02
          ? "attack"
          : this._runAnimLatch ? "run" : "still";
      // Dead: keep last facing angle. Attack: aim direction. Otherwise: smooth move angle.
      const renderAngle = anim === "dead" ? this._smoothMoveAngle
        : anim === "attack" ? this.angle : this._smoothMoveAngle;

      const off = charRenderer.render(this.id, anim, renderAngle);
      const drawSize = this.radius * BRAWLER_DRAW_SCALE;
      if (off) {
        ctx.save();
        ctx.globalAlpha = alpha;
        if (glowColor) {
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = 24;
        }
        ctx.drawImage(off, sx - drawSize / 2, sy - drawSize * 0.60, drawSize, drawSize);
        ctx.restore();
      } else {
        drawBrawlerImage(ctx, this.stats.id, sx, sy, drawSize, renderAngle, alpha, glowColor);
      }

      // Full orbit on top of the 3D sprite (split behind/front was mostly hidden under the opaque render).
      if (this.alive && this.constellationStars.length > 0) {
        this.drawConstellationOrbit(ctx, sx, sy, alpha, renderAngle, "all");
      }
    } else {
      drawBrawlerImage(ctx, this.stats.id, sx, sy, this.radius * BRAWLER_DRAW_SCALE, this.moveAngle, alpha, glowColor);
      if (this.alive && this.constellationStars.length > 0) {
        this.drawConstellationOrbit(ctx, sx, sy, alpha, this.moveAngle, "all");
      }
    }

    if (poisoned) {
      this.drawPoisonSkulls(ctx, sx, sy, alpha);
    }

    if (this.healGlowTimer > 0) {
      const hg = this.healGlowTimer;
      ctx.save();
      ctx.globalAlpha = alpha * hg * 0.42;
      const hgGrad = ctx.createRadialGradient(sx, sy - 10, 0, sx, sy, this.radius * 1.75);
      hgGrad.addColorStop(0, "rgba(255,255,255,0.9)");
      hgGrad.addColorStop(0.35, "rgba(255,249,196,0.45)");
      hgGrad.addColorStop(0.7, "rgba(200,230,201,0.2)");
      hgGrad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hgGrad;
      ctx.beginPath();
      ctx.arc(sx, sy, this.radius * 1.72, 0, Math.PI * 2);
      ctx.fill();
      const f = this.animFrame;
      for (let i = 0; i < 5; i++) {
        const ang = f * 0.045 + (i / 5) * Math.PI * 2;
        const bob = Math.sin(f * 0.09 + i * 1.1) * 4;
        const pr = this.radius * (0.75 + (i % 2) * 0.22);
        const px = sx + Math.cos(ang) * pr;
        const py = sy + Math.sin(ang) * pr * 0.58 - 10 + bob;
        ctx.globalAlpha = alpha * hg * (0.55 + Math.sin(f * 0.13 + i) * 0.25);
        ctx.font = "bold 13px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.strokeStyle = "rgba(46,125,50,0.75)";
        ctx.lineWidth = 2;
        ctx.fillStyle = "#FFFDE7";
        ctx.strokeText("+", px, py);
        ctx.fillText("+", px, py);
      }
      ctx.restore();
    }

    if (this.attackAnim > 0) {
      ctx.save();
      ctx.globalAlpha = this.attackAnim * 0.7;
      ctx.strokeStyle = this.stats.accentColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, this.radius + 8 + (1 - this.attackAnim) * 10, -0.5, 0.5);
      ctx.stroke();
      ctx.restore();
    }

    if (this.superAnim > 0) {
      ctx.save();
      ctx.globalAlpha = this.superAnim * 0.8;
      ctx.strokeStyle = "#FFD700";
      ctx.lineWidth = 4;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + this.superAnim * Math.PI;
        const r = this.radius + 15 + (1 - this.superAnim) * 20;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * (r - 8), sy + Math.sin(a) * (r - 8));
        ctx.lineTo(sx + Math.cos(a) * (r + 8), sy + Math.sin(a) * (r + 8));
        ctx.stroke();
      }
      ctx.restore();
    }

    if (layer === "all" && this.alive) {
      this.renderNameLabel(ctx, sx, sy, viewerTeam);
      this.renderHPBar(ctx, sx, sy, viewerTeam);
      this.renderAmmoBar(ctx, sx, sy, viewerTeam);
    }

    if (layer === "all" && this.alive && this.isPlayer) {
      this.renderSuperBar(ctx, sx, sy);
    }

  }

  /** Small skull chips orbiting the brawler when poisoned. */
  private drawPoisonSkulls(ctx: CanvasRenderingContext2D, sx: number, sy: number, alpha: number): void {
    const f = this.animFrame;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const ang = f * 0.038 + (i / n) * Math.PI * 2 + Math.sin(f * 0.05 + i) * 0.15;
      const rr = this.radius + 12 + Math.sin(f * 0.07 + i * 1.3) * 4;
      const px = sx + Math.cos(ang) * rr;
      const py = sy + Math.sin(ang) * rr * 0.52 - 8;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.sin(f * 0.04 + i) * 0.35);
      ctx.globalAlpha = alpha * (0.45 + Math.sin(f * 0.1 + i) * 0.35);
      ctx.fillStyle = "#E8F5E9";
      ctx.strokeStyle = "#1B5E20";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(0, -0.5, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#1B5E20";
      ctx.beginPath();
      ctx.arc(-1.6, -1.8, 0.85, 0, Math.PI * 2);
      ctx.arc(1.6, -1.8, 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-2.8, 0.8);
      ctx.quadraticCurveTo(0, 3.2, 2.8, 0.8);
      ctx.lineTo(2.2, 4.2);
      ctx.lineTo(-2.2, 4.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Orbit stars split by pseudo-depth: negative dot with facing = behind the model (under),
   * positive = in front (over). Matches top-down “back vs face” of the 3D turn.
   */
  private drawConstellationOrbit(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    alpha: number,
    facing: number,
    layer: "behind" | "front" | "all",
  ): void {
    if (this.constellationStars.length === 0) return;
    const t = this.animFrame * 0.03;
    const cnt = Math.min(6, this.constellationStars.length);
    const orbitR = this.radius + 16;
    const fx = Math.cos(facing);
    const fy = Math.sin(facing);
    ctx.save();
    ctx.globalAlpha = 0.92 * alpha;
    for (let i = 0; i < cnt; i++) {
      const a = t + (i / cnt) * Math.PI * 2;
      const ox = Math.cos(a) * orbitR;
      const oy = Math.sin(a) * (orbitR * 0.42) - this.radius * 0.35;
      const depth = ox * fx + oy * fy;
      if (layer === "behind" && depth > 0) continue;
      if (layer === "front" && depth <= 0) continue;
      ctx.fillStyle = "#FFD740";
      ctx.shadowColor = "#FFAB00";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(sx + ox, sy + oy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Cartoon-style animated pet follower. Each `visual.kind` gets its own
   *  per-kind drawer in `PetRenderer.ts` with independently animated limbs,
   *  ears, tail, wings and eyes. Walk vs idle is detected from the pet's
   *  own velocity (smoothed) so the cycle keeps swishing for a moment after
   *  the player stops. Joy pops briefly when a heal pulse fires; sad mood
   *  triggers droopy ears + downward gaze when the owner is on low HP. */
  private renderPetFollower(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const pet = this.equippedPet;
    if (!pet) return;
    const px = this.petFollowX - camX;
    const py = this.petFollowY - camY;
    const t = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;

    // ── Motion smoothing ──────────────────────────────────────────────────
    if (this._petPrevT === 0) {
      this._petPrevX = this.petFollowX;
      this._petPrevY = this.petFollowY;
      this._petPrevT = t;
      this._petLastHealTimer = this.petHealTimer;
    }
    const ddt = Math.max(0.001, Math.min(0.1, t - this._petPrevT));
    const vx = (this.petFollowX - this._petPrevX) / ddt;
    const vy = (this.petFollowY - this._petPrevY) / ddt;
    const speed = Math.hypot(vx, vy);
    const targetMove = speed > 25 ? 1 : 0;
    this._petMoveSmoothed += (targetMove - this._petMoveSmoothed) * Math.min(1, ddt * 5);
    this._petPrevX = this.petFollowX;
    this._petPrevY = this.petFollowY;
    this._petPrevT = t;

    // ── Mood detection ────────────────────────────────────────────────────
    // Heal pulse just fired? petHealTimer wraps from ≥interval back to ~0.
    if (pet.effect.kind === "heal" && this.petHealTimer < this._petLastHealTimer) {
      this._petJoyTimer = 1.0;
    }
    this._petLastHealTimer = this.petHealTimer;
    this._petJoyTimer = Math.max(0, this._petJoyTimer - ddt);
    const joy = this._petJoyTimer > 0;
    const sad = !joy && (this.hp / Math.max(1, this.maxHp)) < 0.30 && this.alive;

    const moveStrength = this._petMoveSmoothed;
    const bob = Math.sin(t * 4) * 1.5 * (1 - moveStrength) + Math.sin(t * 16) * 2.5 * moveStrength;
    const walkPhase = t * 8 * (0.6 + moveStrength * 0.8);

    ctx.save();
    // Soft halo (bigger on joy)
    const haloR = 30 + (joy ? 10 : 0) + moveStrength * 4;
    const glow = ctx.createRadialGradient(px, py - 2 + bob, 4, px, py - 2 + bob, haloR);
    glow.addColorStop(0, pet.color + (joy ? "DD" : "99"));
    glow.addColorStop(1, pet.color + "00");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py - 2 + bob, haloR, 0, Math.PI * 2);
    ctx.fill();

    // Pet origin: translate, then optional joy-pop scale.
    ctx.translate(px, py + bob);
    if (joy) {
      const pop = 1 + Math.sin(this._petJoyTimer * Math.PI) * 0.18;
      ctx.scale(pop, pop);
    }
    // Slight lean toward the owner so the pet "faces" them.
    const facing = Math.atan2(this.y - this.petFollowY, this.x - this.petFollowX);
    ctx.rotate(Math.cos(facing) * 0.10);

    renderPet(ctx, pet, { walkPhase, moveStrength, t, joy, sad, facing });
    ctx.restore();
  }

  private renderNameLabel(ctx: CanvasRenderingContext2D, sx: number, sy: number, viewerTeam?: string): void {
    if (!this.displayName) return;
    const labelY = sy - this.radius - 56;
    ctx.save();
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 4;

    if (this.isBot) {
      const tag = "БОТ";
      const nm = ` ${this.displayName}`;
      const tagW = ctx.measureText(tag).width;
      const nmW = ctx.measureText(nm).width;
      const totalW = tagW + nmW;
      const startX = sx - totalW / 2;
      ctx.textAlign = "left";
      ctx.fillStyle = "#FFD740";
      ctx.fillText(tag, startX, labelY);
      ctx.fillStyle = viewerTeam !== undefined && this.team !== viewerTeam
        ? "#FF8A80"
        : "rgba(255,255,255,0.92)";
      ctx.fillText(nm, startX + tagW, labelY);
    } else {
      ctx.fillStyle = this.isPlayer
        ? "#FFFFFF"
        : (viewerTeam !== undefined && this.team !== viewerTeam ? "#FF8A80" : "#A5D6A7");
      ctx.fillText(this.displayName, sx, labelY);
    }
    ctx.restore();

    // ── Badges above the name ──────────────────────────────────────────────
    // Stack up from labelY - 2: powerCubes (jars) and crystalCount
    let badgeTop = labelY - 20;

    if (this.powerCubes > 0) {
      // Mini jar + count
      const jarR = 6;
      ctx.save();
      ctx.shadowColor = "#E040FB";
      ctx.shadowBlur = 6;
      // pill background
      const pillW = 36, pillH = 14;
      ctx.fillStyle = "rgba(0,0,0,0.68)";
      ctx.beginPath();
      ctx.roundRect(sx - pillW / 2, badgeTop - pillH / 2, pillW, pillH, 5);
      ctx.fill();
      // jar body
      const jGrad = ctx.createLinearGradient(sx - pillW * 0.4, badgeTop - jarR, sx - pillW * 0.4 + jarR * 1.4, badgeTop + jarR);
      jGrad.addColorStop(0, "#CE93D8");
      jGrad.addColorStop(1, "#7B1FA2");
      ctx.fillStyle = jGrad;
      ctx.beginPath();
      ctx.roundRect(sx - pillW * 0.42, badgeTop - jarR * 0.85, jarR * 1.3, jarR * 1.7, jarR * 0.35);
      ctx.fill();
      // jar lid
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#FFD700";
      ctx.fillRect(sx - pillW * 0.42, badgeTop - jarR * 0.85 - 2, jarR * 1.3, 2.5);
      // count
      ctx.fillStyle = "#FFE082";
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`×${this.powerCubes}`, sx + pillW * 0.13, badgeTop);
      ctx.restore();
      badgeTop -= 16;
    }

    if (this.crystalCount > 0) {
      // Mini 3D crystal + count
      ctx.save();
      ctx.shadowColor = "#00E5FF";
      ctx.shadowBlur = 6;
      const pillW = 34, pillH = 14;
      ctx.fillStyle = "rgba(0,0,0,0.68)";
      ctx.beginPath();
      ctx.roundRect(sx - pillW / 2, badgeTop - pillH / 2, pillW, pillH, 5);
      ctx.fill();
      const gem = getGemCanvas();
      const cx0 = sx - pillW * 0.25;
      const cy0 = badgeTop;
      if (gem) {
        const gs = 11;
        ctx.drawImage(gem, cx0 - gs / 2, cy0 - gs / 2, gs, gs);
      } else {
        const cs = 5;
        ctx.fillStyle = "#00E5FF";
        ctx.beginPath();
        ctx.moveTo(cx0, cy0 - cs); ctx.lineTo(cx0 + cs * 0.7, cy0);
        ctx.lineTo(cx0, cy0 + cs); ctx.lineTo(cx0 - cs * 0.7, cy0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.beginPath();
        ctx.moveTo(cx0 - cs * 0.2, cy0 - cs * 0.6); ctx.lineTo(cx0 + cs * 0.3, cy0 - cs * 0.1);
        ctx.lineTo(cx0 - cs * 0.05, cy0 + cs * 0.4); ctx.closePath();
        ctx.fill();
      }
      // count
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#80DEEA";
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`×${this.crystalCount}`, sx + pillW * 0.15, badgeTop);
      ctx.restore();
    }
  }

  private renderAmmoBar(ctx: CanvasRenderingContext2D, sx: number, sy: number, viewerTeam?: string): void {
    if (this.maxAttackCharges <= 0) return;
    // Don't show ammo count to enemies — only player and allies see ammo bars
    if (viewerTeam !== undefined && !this.isPlayer && this.team !== viewerTeam) return;
    // Sit just below the HP bar, which now lives at sy - radius - 38.
    const by = sy - this.radius - 26;
    const totalW = this.radius * 2.6;
    const segGap = 2;
    const segW = (totalW - segGap * (this.maxAttackCharges - 1)) / this.maxAttackCharges;
    const segH = 4;
    const startX = sx - totalW / 2;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(startX - 1, by - 1, totalW + 2, segH + 2);
    for (let i = 0; i < this.maxAttackCharges; i++) {
      const x = startX + i * (segW + segGap);
      const filled = i < this.attackCharges;
      if (filled) {
        ctx.fillStyle = this.stats.accentColor;
      } else {
        // Show recharge progress on the next-empty slot.
        const isNext = i === Math.floor(this.attackCharges);
        const partial = isNext ? 1 - (this.attackCooldownTimer / this.attackCooldown) : 0;
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(x, by, segW, segH);
        if (partial > 0) {
          ctx.fillStyle = `${this.stats.accentColor}`;
          ctx.globalAlpha = 0.55;
          ctx.fillRect(x, by, segW * partial, segH);
          ctx.globalAlpha = 1;
        }
        continue;
      }
      ctx.fillRect(x, by, segW, segH);
    }
    ctx.restore();
  }

  private renderHPBar(ctx: CanvasRenderingContext2D, sx: number, sy: number, viewerTeam?: string): void {
    const bw = this.radius * 2.6;
    const bh = 7;
    const bx = sx - bw / 2;
    // Raised so the HP bar (and the ammo row right under it) no longer
    // overlaps the brawler sprite. Was sy-radius-20.
    const by = sy - this.radius - 38;
    const ratio = Math.max(0, Math.min(1, this.hp / this.maxHp));
    
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    
    let barColor = "#4CAF50";
    if (viewerTeam !== undefined) {
      if (this.isPlayer || this.team === viewerTeam) barColor = "#4CAF50";
      else barColor = "#F44336";
    } else {
      const r = Math.floor(255 * (1 - ratio));
      const g = Math.floor(255 * ratio);
      barColor = `rgb(${r},${g},0)`;
    }
    ctx.fillStyle = barColor;
    ctx.fillRect(bx, by, bw * ratio, bh);
    
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 10px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 3;
    ctx.fillText(`${Math.ceil(this.hp)} / ${this.maxHp}`, sx, by + bh / 2 + 0.5);
    ctx.restore();
  }

  private renderSuperBar(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
    const bw = this.radius * 2.5;
    const bh = 4;
    const bx = sx - bw / 2;
    // Slim super-charge bar tucked just above the HP/ammo cluster.
    const by = sy - this.radius - 46;
    const ratio = this.superCharge / this.maxSuperCharge;
    
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = this.superReady ? "#FFD700" : "#7986CB";
    ctx.fillRect(bx, by, bw * ratio, bh);
  }
}
