export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  attack: boolean;
  super: boolean;
  mouseX: number;
  mouseY: number;
  mouseWorldX: number;
  mouseWorldY: number;
}

import { clientToCanvasBitmapPx } from "../utils/canvasObjectFitCover";

export class InputHandler {
  state: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    attack: false,
    super: false,
    mouseX: 0,
    mouseY: 0,
    mouseWorldX: 0,
    mouseWorldY: 0,
  };

  // Joystick (mobile) overrides. When `active`, the corresponding aim
  // direction supersedes the mouse-derived aim used by all modes.
  attackJoystick: { active: boolean; angle: number } = { active: false, angle: 0 };
  superJoystick:  { active: boolean; angle: number } = { active: false, angle: 0 };
  // Tracks whether mobile controls are currently driving movement.
  // While true, keyboard movement keys are ignored so a stuck `WASD` value
  // can never linger between modes.
  movementJoystick: { active: boolean; angle: number; magnitude: number } = {
    active: false, angle: 0, magnitude: 0,
  };

  private canvas: HTMLCanvasElement;
  private onAttack?: () => void;
  private onSuper?: () => void;

  constructor(canvas: HTMLCanvasElement, onAttack?: () => void, onSuper?: () => void) {
    this.canvas = canvas;
    this.onAttack = onAttack;
    this.onSuper = onSuper;
    this.bindEvents();
  }

  private bindEvents(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    switch (e.code) {
      case "KeyW": case "ArrowUp": this.state.up = true; break;
      case "KeyS": case "ArrowDown": this.state.down = true; break;
      case "KeyA": case "ArrowLeft": this.state.left = true; break;
      case "KeyD": case "ArrowRight": this.state.right = true; break;
      case "Space":
        if (!this.state.attack) { this.state.attack = true; this.onAttack?.(); }
        e.preventDefault();
        break;
      case "KeyE":
      case "KeyQ":
        if (!this.state.super) { this.state.super = true; this.onSuper?.(); }
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    switch (e.code) {
      case "KeyW": case "ArrowUp": this.state.up = false; break;
      case "KeyS": case "ArrowDown": this.state.down = false; break;
      case "KeyA": case "ArrowLeft": this.state.left = false; break;
      case "KeyD": case "ArrowRight": this.state.right = false; break;
      case "Space": this.state.attack = false; break;
      case "KeyE": case "KeyQ": this.state.super = false; break;
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    const p = clientToCanvasBitmapPx(this.canvas, e.clientX, e.clientY);
    this.state.mouseX = p.x;
    this.state.mouseY = p.y;
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.state.attack = true;
      this.onAttack?.();
    } else if (e.button === 2) {
      this.state.super = true;
      this.onSuper?.();
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.state.attack = false;
    if (e.button === 2) this.state.super = false;
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  /**
   * Updates the world-space cursor every frame.
   *
   * If a joystick is currently steering aim, the world cursor is anchored
   * relative to the player's world position so that downstream `angleTo`
   * computations produce the joystick's chosen angle. Otherwise the mouse
   * position (in screen coords) is mapped through the camera offset as
   * before. The optional `playerX/Y` arguments allow modes to opt into
   * joystick aiming without restructuring their update loop.
   */
  updateWorldMouse(camX: number, camY: number, playerX?: number, playerY?: number, zoom = 1.0): void {
    if (
      typeof playerX === "number" && typeof playerY === "number" &&
      (this.attackJoystick.active || this.superJoystick.active)
    ) {
      // Active super takes priority for the visible aim while held — release
      // restores the attack joystick's choice (or last mouse pos).
      const angle = this.superJoystick.active ? this.superJoystick.angle : this.attackJoystick.angle;
      this.state.mouseWorldX = playerX + Math.cos(angle) * 1000;
      this.state.mouseWorldY = playerY + Math.sin(angle) * 1000;
      return;
    }
    // Screen pixel → world unit: divide by zoom factor then offset by camera.
    this.state.mouseWorldX = this.state.mouseX / zoom + camX;
    this.state.mouseWorldY = this.state.mouseY / zoom + camY;
  }

  // ------------------ Mobile joystick API ------------------

  /**
   * Sets the analog movement joystick. Magnitude > deadzone activates the
   * 4 movement booleans by quadrant decomposition (sign of dx/dy).
   * Magnitude 0 / inactive clears all four. Keyboard movement keeps working
   * while the movement joystick is idle.
   */
  setMovementJoystick(dx: number, dy: number): void {
    const mag = Math.hypot(dx, dy);
    if (mag < 0.18) {
      this.movementJoystick.active = false;
      this.movementJoystick.magnitude = 0;
      this.state.up = false;
      this.state.down = false;
      this.state.left = false;
      this.state.right = false;
      return;
    }
    const angle = Math.atan2(dy, dx);
    this.movementJoystick.active = true;
    this.movementJoystick.angle = angle;
    this.movementJoystick.magnitude = Math.min(1, mag);
    this.state.right = dx >  0.18;
    this.state.left  = dx < -0.18;
    this.state.down  = dy >  0.18;
    this.state.up    = dy < -0.18;
  }

  /** Updates the attack joystick's aim. When `active` is true the world
   * cursor anchors to the player + cos/sin(angle) on the next update. */
  setAttackJoystick(active: boolean, angle: number): void {
    this.attackJoystick.active = active;
    if (active) this.attackJoystick.angle = angle;
  }

  setSuperJoystick(active: boolean, angle: number): void {
    this.superJoystick.active = active;
    if (active) this.superJoystick.angle = angle;
  }

  /**
   * Fire the attack callback exactly once. When called from the mobile
   * joystick, pass the player's current world position so the world-space
   * cursor is committed synchronously from the joystick angle — eliminating
   * the up-to-one-frame staleness that would otherwise occur between the
   * pointer-up event and the next `updateWorldMouse` tick.
   */
  triggerAttack(playerX?: number, playerY?: number): void {
    if (!this.onAttack) return;
    if (
      typeof playerX === "number" && typeof playerY === "number" &&
      this.attackJoystick.active
    ) {
      const angle = this.attackJoystick.angle;
      this.state.mouseWorldX = playerX + Math.cos(angle) * 1000;
      this.state.mouseWorldY = playerY + Math.sin(angle) * 1000;
    }
    this.state.attack = true;
    this.onAttack();
    queueMicrotask(() => { this.state.attack = false; });
  }

  triggerSuper(playerX?: number, playerY?: number): void {
    if (!this.onSuper) return;
    if (
      typeof playerX === "number" && typeof playerY === "number" &&
      this.superJoystick.active
    ) {
      const angle = this.superJoystick.angle;
      this.state.mouseWorldX = playerX + Math.cos(angle) * 1000;
      this.state.mouseWorldY = playerY + Math.sin(angle) * 1000;
    }
    this.state.super = true;
    this.onSuper();
    queueMicrotask(() => { this.state.super = false; });
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
  }
}
