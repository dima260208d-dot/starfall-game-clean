/** Single active overlay; buffs stack numerically via tier. */
export type BossRaidOverlayPhase = "none" | "anger" | "fury" | "god";

export interface BossRaidPhaseView {
  phase: BossRaidOverlayPhase;
  banner?: string;
}

/**
 * Time-based phases (seconds). L2: anger 60–70. L3: anger 60–70, fury from 120.
 * L4: anger 60–70, fury 120–160, god from 160. L5+: 90s repeating cycle.
 */
export function computeBossOverlay(raidLevel: number, matchTime: number): BossRaidPhaseView {
  if (raidLevel <= 1) return { phase: "none" };

  if (raidLevel === 2) {
    if (matchTime >= 60 && matchTime < 70) return { phase: "anger", banner: "ЗЛОСТЬ!" };
    return { phase: "none" };
  }

  if (raidLevel === 3) {
    if (matchTime >= 60 && matchTime < 70) return { phase: "anger", banner: "ЗЛОСТЬ!" };
    if (matchTime >= 120) return { phase: "fury", banner: matchTime < 123 ? "ЯРОСТЬ!" : undefined };
    return { phase: "none" };
  }

  if (raidLevel === 4) {
    if (matchTime >= 60 && matchTime < 70) return { phase: "anger", banner: "ЗЛОСТЬ!" };
    if (matchTime >= 120 && matchTime < 160) return { phase: "fury", banner: matchTime < 123 ? "ЯРОСТЬ!" : undefined };
    if (matchTime >= 160) return { phase: "god", banner: matchTime < 163 ? "РЕЖИМ БОГА!" : undefined };
    return { phase: "none" };
  }

  const cycle = 90;
  const c = matchTime % cycle;
  if (c < 10) return { phase: "anger", banner: c < 0.05 ? "ЗЛОСТЬ!" : undefined };
  if (c < 35) return { phase: "fury", banner: c < 10.05 ? "ЯРОСТЬ!" : undefined };
  if (c < 50) return { phase: "god", banner: c < 35.05 ? "РЕЖИМ БОГА!" : undefined };
  return { phase: "none" };
}

export function phaseDamageMul(phase: BossRaidOverlayPhase): number {
  if (phase === "anger") return 1.2;
  if (phase === "fury") return 1.2 * 1.4;
  if (phase === "god") return 1.2 * 1.4 * 2.0;
  return 1;
}

export function phaseAttackSpeedMul(phase: BossRaidOverlayPhase): number {
  if (phase === "anger") return 1.3;
  if (phase === "fury") return 1.3 * 1.5;
  if (phase === "god") return 1.3 * 1.5 * 1.8;
  return 1;
}

export function phaseMoveSpeedMul(phase: BossRaidOverlayPhase): number {
  if (phase === "anger") return 1.1;
  if (phase === "fury") return 1.35;
  if (phase === "god") return 1.6;
  return 1;
}

export function bossIgnoresCc(phase: BossRaidOverlayPhase): boolean {
  return phase === "god";
}

export function cameraShakePx(phase: BossRaidOverlayPhase, frame: number): { dx: number; dy: number } {
  if (phase !== "god") return { dx: 0, dy: 0 };
  const t = frame * 0.4;
  return { dx: Math.sin(t) * 4, dy: Math.cos(t * 1.3) * 3 };
}
