import { useState, useEffect } from "react";
import BrawlerViewer3D from "./BrawlerViewer3D";
import { getBrawlerRank, getBrawlerTrophies, getCurrentProfile } from "../utils/localStorageAPI";
import { BRAWLERS } from "../entities/BrawlerData";
import type { GameParticipant } from "../types/gameResult";

export type { GameParticipant };

import type { GrantBossRaidRewardResult } from "../utils/bossRaidRewards";

interface ResultScreenProps {
  won: boolean;
  mode: string;
  participants: GameParticipant[];
  result: { trophyDelta: number; xpGained: number; place: number } | null;
  matchStats: { damageDealt: number; healingDone: number; superUses: number; killCount: number; powerCubesCollected: number };
  questDeltas: Array<{ description: string; before: number; after: number; target: number; delta: number }>;
  bossRaidGrant?: GrantBossRaidRewardResult | null;
  onExit: () => void;
  onPlayAgain: () => void;
}

const isTeamMode = (mode: string) =>
  ["gemgrab", "heist", "crystals", "siege", "starstrike"].includes(mode);

function formatNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function getBrawlerColor(brawlerId: string): string {
  return BRAWLERS.find(b => b.id === brawlerId)?.color ?? "#7b2fbe";
}

interface QuestDelta {
  description: string;
  before: number;
  after: number;
  target: number;
  delta: number;
}

// ── Small stat chip ─────────────────────────────────────────────────────────
function StatChip({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "rgba(255,255,255,0.07)",
      border: `1px solid ${color}44`,
      borderRadius: 12, padding: "9px 14px",
      boxShadow: `0 0 14px ${color}22`,
    }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      </div>
    </div>
  );
}

// ── One brawler column in the team split ────────────────────────────────────
function ParticipantCard({
  p, size, highlight, revealed,
}: {
  p: GameParticipant;
  size: number;
  highlight?: boolean;
  revealed: boolean;
}) {
  const axisWidth = size;
  const modelZoneH = Math.round(size * 0.92);
  return (
    <div
      style={{
        width: axisWidth,
        height: modelZoneH + 66,
        opacity: revealed ? 1 : 0,
        transform: revealed ? "translateY(0)" : "translateY(30px)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
        position: "relative",
      }}
    >
      {highlight && (
        <div style={{
          position: "absolute",
          top: -18,
          left: "50%",
          transform: "translateX(-50%)",
          background: "linear-gradient(90deg, #ffd700, #ffab40)",
          borderRadius: 6, padding: "2px 10px",
          fontSize: 11, fontWeight: 900, letterSpacing: 1.5,
          color: "#1a0000",
          zIndex: 2,
        }}>
          ★ ЛИДЕР
        </div>
      )}
      <div
        style={{
          pointerEvents: "none",
          position: "absolute",
          left: "50%",
          top: -36,
          width: size,
          height: modelZoneH,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          transform: "translateX(-50%)",
        }}
      >
        <BrawlerViewer3D brawlerId={p.brawlerId} color={getBrawlerColor(p.brawlerId)} size={size} />
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: modelZoneH + 24,
          transform: "translateX(-40%)",
          textAlign: "center",
          width: axisWidth,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: "#fff",
            textShadow: "0 1px 4px #000",
            lineHeight: 1.1,
            minHeight: 17,
            width: "100%",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            padding: 0,
            margin: 0,
          }}
        >
          {p.displayName}
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 0,
            justifyContent: "center",
            alignItems: "center",
            minHeight: 15,
            width: "100%",
          }}
        >
          <span style={{ fontSize: 13, color: "#ffd700", fontWeight: 700 }}>🏆 {p.trophies} • R{getBrawlerRank(p.trophies)}</span>
          <span style={{ fontSize: 13, color: "#80d8ff", fontWeight: 700 }}>⚡ {p.level}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function ResultScreen({
  won, mode, participants, result, matchStats, questDeltas, bossRaidGrant = null, onExit, onPlayAgain,
}: ResultScreenProps) {
  const [phase, setPhase] = useState<1 | 2>(1);
  const [revealed, setRevealed] = useState(false);
  const [phase2In, setPhase2In] = useState(false);

  const profile = getCurrentProfile();
  const patchedParticipants = participants.map((p) => {
    if (!p.isPlayer) return p;
    const bt = getBrawlerTrophies(profile, p.brawlerId);
    return { ...p, trophies: bt };
  });

  const isBossRaid = mode === "bossraid";
  const player = patchedParticipants.find(p => p.isPlayer) || patchedParticipants[0];
  const starstrikeTeamSize = mode === "starstrike"
    ? Math.max(
        3,
        Math.min(
          5,
          Math.max(
            patchedParticipants.filter(p => p.team === "blue").length,
            patchedParticipants.filter(p => p.team === "red").length,
          ),
        ),
      )
    : 3;
  const playerTeam = patchedParticipants.filter(p => p.team === player.team).slice(0, isBossRaid ? 5 : 3);
  const enemyPool = patchedParticipants.filter(p => p.team !== player.team);
  const isClassicTeam = isTeamMode(mode);
  const isShowdownTeam = mode === "showdown" && playerTeam.length > 1;
  const isDualTeamResult = isClassicTeam;
  const isTeam = isClassicTeam || isShowdownTeam || isBossRaid;
  const blueTeam = isClassicTeam
    ? patchedParticipants.filter(p => p.team === "blue").slice(0, starstrikeTeamSize)
    : playerTeam;
  const redTeam = isClassicTeam
    ? patchedParticipants.filter(p => p.team === "red").slice(0, starstrikeTeamSize)
    : [];
  const teamCount = Math.max(1, blueTeam.length);
  const teamCardSize =
    isBossRaid && teamCount >= 5 ? 200 : teamCount >= 3 ? 410 : teamCount === 2 ? 520 : 650;
  const teamGap = isBossRaid && teamCount >= 5 ? 10 : teamCount >= 3 ? 18 : teamCount === 2 ? 46 : 0;
  const allies = playerTeam.filter(p => !p.isPlayer);
  const playerRank = getBrawlerRank(player.trophies);

  // Staggered reveal
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 120);
    return () => clearTimeout(t);
  }, []);

  const handleNext = () => {
    setPhase(2);
    setTimeout(() => setPhase2In(true), 50);
  };

  const trophyLabel = result
    ? (result.trophyDelta >= 0 ? `+${result.trophyDelta}` : `${result.trophyDelta}`)
    : "—";
  const trophyColor = result && result.trophyDelta >= 0 ? "#ffd700" : "#ff5252";
  const placeText = (mode === "showdown" || mode === "megashowdown") && result
    ? `${result.place} место`
    : "";
  const placeBigText = (mode === "showdown" || mode === "megashowdown") && result
    ? `МЕСТО: ${result.place}`
    : "";

  // ── Phase 1 – Team split ─────────────────────────────────────────────────
  if (phase === 1 && isTeam) {
    if (isDualTeamResult) {
      const dualCount = Math.max(blueTeam.length, redTeam.length, mode === "starstrike" ? starstrikeTeamSize : 3);
      const dualCardSize = dualCount >= 5 ? 220 : dualCount >= 3 ? 255 : 320;
      const dualGap = dualCount >= 5 ? 12 : 16;
      return (
        <div style={{ position: "absolute", inset: 0, zIndex: 20, overflow: "hidden", fontFamily: "'Segoe UI', sans-serif" }}>
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(90deg, #003a7a 0%, #0050aa 50%, #861a1a 50%, #b71c1c 100%)",
          }} />
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }} />

          <div style={{
            position: "absolute", top: 28, left: 36,
            opacity: revealed ? 1 : 0, transform: revealed ? "translateX(0)" : "translateX(-40px)",
            transition: "opacity 0.6s ease, transform 0.6s ease",
          }}>
            <div style={{
              fontSize: 52, fontWeight: 900, letterSpacing: 3,
              color: won ? "#ffd700" : "#ff5252",
              textShadow: `0 0 30px ${won ? "#ffd700" : "#ff5252"}, 0 2px 0 #000`,
              lineHeight: 1,
            }}>
              {won ? "ПОБЕДА!" : "ПОРАЖЕНИЕ"}
            </div>
            <div style={{
              fontSize: 28, fontWeight: 800, color: trophyColor,
              textShadow: `0 0 16px ${trophyColor}`,
              marginTop: 6,
            }}>
              🏆 {trophyLabel}
            </div>
          </div>

          <div style={{
            position: "absolute", top: 18, left: "25%", transform: "translateX(-50%)",
            color: "#82b1ff", fontWeight: 900, fontSize: 22, letterSpacing: 2, opacity: 0.92,
            textShadow: "0 2px 10px rgba(0,0,0,0.55)", pointerEvents: "none",
          }}>
            СИНЯЯ КОМАНДА
          </div>
          <div style={{
            position: "absolute", top: 18, left: "75%", transform: "translateX(-50%)",
            color: "#ff9a9a", fontWeight: 900, fontSize: 22, letterSpacing: 2, opacity: 0.92,
            textShadow: "0 2px 10px rgba(0,0,0,0.55)", pointerEvents: "none",
          }}>
            КРАСНАЯ КОМАНДА
          </div>

          <div style={{
            position: "absolute", left: "2%", bottom: "6%", width: "46%",
            display: "flex", justifyContent: "center", alignItems: "flex-end",
            flexWrap: "wrap", gap: dualGap, rowGap: 4,
          }}>
            {blueTeam.map((p, i) => (
              <ParticipantCard
                key={`blue-${p.brawlerId}-${i}`}
                p={p}
                size={dualCardSize}
                highlight={p.isPlayer && won}
                revealed={revealed}
              />
            ))}
          </div>

          <div style={{
            position: "absolute", right: "2%", bottom: "6%", width: "46%",
            display: "flex", justifyContent: "center", alignItems: "flex-end",
            flexWrap: "wrap", gap: dualGap, rowGap: 4,
          }}>
            {redTeam.map((p, i) => (
              <ParticipantCard
                key={`red-${p.brawlerId}-${i}`}
                p={p}
                size={dualCardSize}
                highlight={false}
                revealed={revealed}
              />
            ))}
          </div>

          <button
            onClick={handleNext}
            style={{
              position: "absolute", bottom: 30, right: 36,
              background: "linear-gradient(135deg, #ffd700, #ff9800)",
              border: "none", borderRadius: 14, padding: "14px 40px",
              color: "#1a0800", fontWeight: 900, fontSize: 18, letterSpacing: 2,
              cursor: "pointer", boxShadow: "0 6px 24px rgba(255,180,0,0.5)",
              opacity: revealed ? 1 : 0, transform: revealed ? "translateY(0)" : "translateY(20px)",
              transition: "opacity 0.6s ease 0.4s, transform 0.6s ease 0.4s",
            }}
          >
            ДАЛЕЕ ›
          </button>
        </div>
      );
    }
    return (
      <div style={{ position: "absolute", inset: 0, zIndex: 20, overflow: "hidden", fontFamily: "'Segoe UI', sans-serif" }}>
        {/* Team-only full background */}
        <div style={{
          position: "absolute", inset: 0,
          background: won
            ? "linear-gradient(170deg, #003a7a 0%, #0050aa 100%)"
            : "linear-gradient(170deg, #1a2e5a 0%, #193f7a 100%)",
        }} />
        {/* BG overlay fade */}
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)" }} />

        {/* Top left – result badge */}
        <div style={{
          position: "absolute", top: 28, left: 36,
          opacity: revealed ? 1 : 0, transform: revealed ? "translateX(0)" : "translateX(-40px)",
          transition: "opacity 0.6s ease, transform 0.6s ease",
        }}>
          <div style={{
            fontSize: 52, fontWeight: 900, letterSpacing: 3,
            color: won ? "#ffd700" : "#ff5252",
            textShadow: `0 0 30px ${won ? "#ffd700" : "#ff5252"}, 0 2px 0 #000`,
            lineHeight: 1,
          }}>
            {won ? "ПОБЕДА!" : "ПОРАЖЕНИЕ"}
          </div>
          {isBossRaid ? (
            <div style={{
              fontSize: 15,
              fontWeight: 700,
              color: "rgba(255,255,255,0.9)",
              marginTop: 10,
              maxWidth: 560,
              lineHeight: 1.35,
            }}>
              Рейд: кубки и опыт боя не начисляются.
              {bossRaidGrant?.granted && bossRaidGrant.reward ? (
                <span>
                  {" "}
                  Награда за первое прохождение уровня: +{bossRaidGrant.reward.coins} монет, +{bossRaidGrant.reward.powerPoints} силы, +{bossRaidGrant.reward.gems} гемов
                  {bossRaidGrant.reward.chest
                    ? `, сундук ×${bossRaidGrant.reward.chest.count} (${bossRaidGrant.reward.chest.rarity})`
                    : ""}.
                </span>
              ) : won ? (
                <span> Уровень уже был пройден с наградой или уровень без бонусного сундука.</span>
              ) : null}
            </div>
          ) : (
            <div style={{
              fontSize: 28, fontWeight: 800, color: trophyColor,
              textShadow: `0 0 16px ${trophyColor}`,
              marginTop: 6,
            }}>
              🏆 {trophyLabel}
            </div>
          )}
        </div>

        {/* Team labels */}
        <div style={{
          position: "absolute",
          top: 18,
          left: "50%",
          transform: "translateX(-50%)",
          color: "#82b1ff",
          fontWeight: 900,
          fontSize: 24,
          letterSpacing: 2.2,
          opacity: 0.92,
          textShadow: "0 2px 10px rgba(0,0,0,0.55)",
          pointerEvents: "none",
        }}>
          ВАША КОМАНДА
        </div>

        <div style={{
          position: "absolute",
          bottom: "8%",
          left: "50%",
          width: "min(1180px, 98vw)",
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-end",
          gap: teamGap,
          transform: "translateX(-50%)",
        }}>
          {blueTeam.map((p, i) => (
            <ParticipantCard
              key={p.brawlerId + i}
              p={p}
              size={teamCardSize}
              highlight={p.isPlayer && won}
              revealed={revealed}
            />
          ))}
        </div>

        

        {/* Next button */}
        <button
          onClick={handleNext}
          style={{
            position: "absolute", bottom: 30, right: 36,
            background: "linear-gradient(135deg, #ffd700, #ff9800)",
            border: "none", borderRadius: 14, padding: "14px 40px",
            color: "#1a0800", fontWeight: 900, fontSize: 18, letterSpacing: 2,
            cursor: "pointer", boxShadow: "0 6px 24px rgba(255,180,0,0.5)",
            opacity: revealed ? 1 : 0, transform: revealed ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.6s ease 0.4s, transform 0.6s ease 0.4s",
          }}
        >
          ДАЛЕЕ ›
        </button>

        <style>{`
          @keyframes slideInLeft { from { opacity:0; transform: translateX(-40px); } to { opacity:1; transform: none; } }
        `}</style>
      </div>
    );
  }

  // ── Phase 1 – Showdown / training (solo) ─────────────────────────────────
  if (phase === 1 && !isTeam) {
    return (
      <div style={{
        position: "absolute", inset: 0, zIndex: 20, overflow: "hidden",
        background: won
          ? "radial-gradient(ellipse at 50% 40%, #003a70 0%, #001030 100%)"
          : "radial-gradient(ellipse at 50% 40%, #3a0000 0%, #100008 100%)",
        fontFamily: "'Segoe UI', sans-serif",
      }}>
        {/* Glow orb behind brawler */}
        <div style={{
          position: "absolute", left: "50%", top: "38%", width: 280, height: 280,
          borderRadius: "50%", transform: "translate(-50%, -50%)",
          background: won
            ? "radial-gradient(circle, #40c4ff33 0%, transparent 70%)"
            : "radial-gradient(circle, #ff525233 0%, transparent 70%)",
          filter: "blur(20px)",
        }} />

        {/* Top left */}
        <div style={{
          position: "absolute", top: 28, left: 36,
          opacity: revealed ? 1 : 0, transform: revealed ? "none" : "translateX(-30px)",
          transition: "all 0.5s ease",
        }}>
          <div style={{
            fontSize: 52, fontWeight: 900, letterSpacing: 3,
            color: won ? "#ffd700" : "#ff5252",
            textShadow: `0 0 30px ${won ? "#ffd700" : "#ff5252"}`,
          }}>
            {won ? "ПОБЕДА!" : "ПОРАЖЕНИЕ"}
          </div>
          {placeBigText && (
            <div style={{
              fontSize: 46,
              fontWeight: 900,
              letterSpacing: 2,
              color: "#ffffff",
              textShadow: "0 0 22px rgba(255,255,255,0.45), 0 3px 0 rgba(0,0,0,0.75)",
              marginTop: 2,
              lineHeight: 1,
            }}>
              {placeBigText}
            </div>
          )}
          <div style={{ fontSize: 28, fontWeight: 800, color: trophyColor, marginTop: 6 }}>
            🏆 {trophyLabel}
          </div>
        </div>

        {/* Player brawler centered */}
        <div style={{
          position: "absolute", left: "50%", top: "18%", transform: "translate(-50%, 0)",
          opacity: revealed ? 1 : 0, transition: "all 0.5s ease 0.1s",
        }}>
          <div style={{ pointerEvents: "none" }}>
            <BrawlerViewer3D brawlerId={player.brawlerId} color={getBrawlerColor(player.brawlerId)} size={532} />
          </div>
        </div>

        {/* Player/team info below */}
        {isShowdownTeam ? (
          <div style={{
            position: "absolute", left: "50%", top: "70%", transform: "translateX(-50%)",
            display: "flex", justifyContent: "center", gap: 12,
            opacity: revealed ? 1 : 0, transition: "all 0.5s ease 0.2s",
          }}>
            {playerTeam.map((p, i) => (
              <ParticipantCard
                key={p.displayName + i}
                p={p}
                size={170}
                highlight={p.isPlayer}
                revealed={revealed}
              />
            ))}
          </div>
        ) : (
          <div style={{
            position: "absolute", left: "50%", top: "76%", transform: "translateX(-50%)",
            textAlign: "center",
            opacity: revealed ? 1 : 0, transition: "all 0.5s ease 0.2s",
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{player.displayName}</div>
            <div style={{ display: "flex", gap: 16, marginTop: 6, justifyContent: "center" }}>
              <span style={{ fontSize: 16, color: "#ffd700", fontWeight: 700 }}>🏆 {player.trophies}</span>
              <span style={{ fontSize: 16, color: "#80d8ff", fontWeight: 700 }}>⚡ {player.level}</span>
            </div>
            {placeText && (
              <div style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>{placeText}</div>
            )}
          </div>
        )}

        {/* Next button */}
        <button
          onClick={handleNext}
          style={{
            position: "absolute", bottom: 30, right: 36,
            background: "linear-gradient(135deg, #ffd700, #ff9800)",
            border: "none", borderRadius: 14, padding: "14px 40px",
            color: "#1a0800", fontWeight: 900, fontSize: 18, letterSpacing: 2,
            cursor: "pointer", boxShadow: "0 6px 24px rgba(255,180,0,0.5)",
            opacity: revealed ? 1 : 0, transition: "all 0.5s ease 0.4s",
          }}
        >
          ДАЛЕЕ ›
        </button>
      </div>
    );
  }

  // ── Phase 2 – Personal stats ─────────────────────────────────────────────
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 20, overflow: "hidden",
      background: won
        ? "radial-gradient(ellipse at 50% 40%, #003a70 0%, #00285a 60%, #001030 100%)"
        : "radial-gradient(ellipse at 50% 40%, #3a0000 0%, #250010 60%, #100008 100%)",
      fontFamily: "'Segoe UI', sans-serif",
    }}>
      {/* Subtle glow orb */}
      <div style={{
        position: "absolute", left: "50%", top: "45%", width: 320, height: 320,
        borderRadius: "50%", transform: "translate(-50%,-50%)",
        background: won ? "radial-gradient(#40c4ff22, transparent 70%)" : "radial-gradient(#ff525222, transparent 70%)",
        filter: "blur(30px)",
      }} />

      {/* ── Left ally (dimmed) ──────────────────────────────────────────── */}
      {isTeam && allies[0] && (
        <div style={{
          position: "absolute", left: "3%", bottom: "18%",
          opacity: phase2In ? 0.35 : 0,
          transform: phase2In ? "none" : "translateX(-40px)",
          transition: "all 0.6s ease",
        }}>
          <div style={{ opacity: 0.55, pointerEvents: "none" }}>
            <BrawlerViewer3D brawlerId={allies[0].brawlerId} color={getBrawlerColor(allies[0].brawlerId)} size={238} />
          </div>
          <div style={{ textAlign: "center", marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
            {allies[0].displayName}
          </div>
        </div>
      )}

      {/* ── Right ally (dimmed) ─────────────────────────────────────────── */}
      {isTeam && allies[1] && (
        <div style={{
          position: "absolute", right: "28%", bottom: "18%",
          opacity: phase2In ? 0.35 : 0,
          transform: phase2In ? "none" : "translateX(40px)",
          transition: "all 0.6s ease",
        }}>
          <div style={{ opacity: 0.55, pointerEvents: "none" }}>
            <BrawlerViewer3D brawlerId={allies[1].brawlerId} color={getBrawlerColor(allies[1].brawlerId)} size={238} />
          </div>
          <div style={{ textAlign: "center", marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
            {allies[1].displayName}
          </div>
        </div>
      )}

      {/* ── Player's brawler (center) ───────────────────────────────────── */}
      <div style={{
        position: "absolute",
        left: isTeam ? "44%" : "50%",
        bottom: "12%",
        transform: isTeam ? "translateX(-50%)" : "translateX(-50%)",
        opacity: phase2In ? 1 : 0,
        transition: "all 0.55s ease 0.05s",
      }}>
        <div style={{ pointerEvents: "none" }}>
          <BrawlerViewer3D brawlerId={player.brawlerId} color={getBrawlerColor(player.brawlerId)} size={371} />
        </div>
      </div>

      {/* ── Top left – result badge ──────────────────────────────────────── */}
      <div style={{
        position: "absolute", top: 24, left: 28,
        opacity: phase2In ? 1 : 0, transform: phase2In ? "none" : "translateX(-30px)",
        transition: "all 0.5s ease",
      }}>
        <div style={{
          fontSize: 40, fontWeight: 900, letterSpacing: 3,
          color: won ? "#ffd700" : "#ff5252",
          textShadow: `0 0 28px ${won ? "#ffd700" : "#ff5252"}, 0 2px 0 #000`,
        }}>
          {won ? "ПОБЕДА!" : "ПОРАЖЕНИЕ"}
        </div>
        {placeBigText && (
          <div style={{
            fontSize: 34,
            fontWeight: 900,
            letterSpacing: 1.5,
            color: "#ffffff",
            textShadow: "0 0 18px rgba(255,255,255,0.45), 0 2px 0 rgba(0,0,0,0.8)",
            marginTop: 2,
            lineHeight: 1,
          }}>
            {placeBigText}
          </div>
        )}
        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
          {isBossRaid ? (
            <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.82)" }}>
              Рейд: без кубков и опыта.
            </span>
          ) : (
            <span style={{ fontSize: 26, fontWeight: 900, color: trophyColor, textShadow: `0 0 14px ${trophyColor}` }}>
              🏆 {trophyLabel}
            </span>
          )}
          {!isBossRaid && player.trophies > 0 && (
            <span style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>
              R{playerRank}
            </span>
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{player.displayName}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 2, alignItems: "center" }}>
            <span style={{ fontSize: 14, color: "#ffd700", fontWeight: 700 }}>🏆 {player.trophies} • R{playerRank}</span>
            <span style={{ fontSize: 14, color: "#80d8ff", fontWeight: 700 }}>⚡ {player.level}</span>
          </div>
        </div>
        {placeText && (
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>{placeText}</div>
        )}
      </div>

      {/* ── Quests panel (bottom left) ──────────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 18, left: 20, maxWidth: 280,
        opacity: phase2In ? 1 : 0, transform: phase2In ? "none" : "translateY(30px)",
        transition: "all 0.55s ease 0.15s",
      }}>
        <>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>
            КВЕСТЫ
          </div>
          {questDeltas.length > 0 ? questDeltas.map((qd, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.07)", borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.1)",
              padding: "7px 12px", marginBottom: 5,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontSize: 14 }}>🎯</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", lineHeight: 1.3 }}>
                  {qd.description}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: 12, color: "#ffd700", fontWeight: 700 }}>
                    {qd.after}/{qd.target}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 800, color: "#4caf50",
                    background: "#4caf5022", borderRadius: 4, padding: "1px 5px",
                  }}>
                    +{qd.delta}
                  </span>
                </div>
              </div>
            </div>
          )) : (
            <div style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              padding: "8px 10px",
              fontSize: 11,
              color: "rgba(255,255,255,0.5)",
            }}>
              В этом бою прогресс квестов не изменился.
            </div>
          )}
        </>
      </div>

      {/* ── Stats panel (right) ─────────────────────────────────────────── */}
      <div style={{
        position: "absolute", top: "50%", right: 24,
        transform: phase2In ? "translateY(-50%)" : "translateY(-50%) translateX(60px)",
        opacity: phase2In ? 1 : 0, transition: "all 0.55s ease 0.1s",
        width: 210,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>
          БОЙ
        </div>
        <StatChip icon="⚔️" label="Урон" value={formatNum(matchStats.damageDealt)} color="#ff7043" />
        <StatChip icon="💚" label="Лечение" value={formatNum(matchStats.healingDone)} color="#66bb6a" />
        <StatChip icon="💀" label="Убийства" value={String(matchStats.killCount)} color="#ef5350" />
        <StatChip icon="⚡" label="Суперспособность" value={String(matchStats.superUses)} color="#ffd700" />
        {result && (
          <StatChip icon="⭐" label="Опыт" value={`+${result.xpGained}`} color="#ce93d8" />
        )}
      </div>

      {/* ── Bottom right – action buttons ───────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 24, right: 24,
        display: "flex", gap: 14,
        opacity: phase2In ? 1 : 0, transform: phase2In ? "none" : "translateY(20px)",
        transition: "all 0.5s ease 0.3s",
      }}>
        <button
          onClick={onExit}
          style={{
            background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.22)",
            borderRadius: 12, padding: "12px 28px", color: "#fff",
            fontWeight: 800, fontSize: 15, letterSpacing: 1.5, cursor: "pointer",
          }}
        >
          ВЫЙТИ
        </button>
        <button
          onClick={onPlayAgain}
          style={{
            background: "linear-gradient(135deg, #7b2fbe, #ce93d8)",
            border: "none", borderRadius: 12, padding: "12px 28px", color: "#fff",
            fontWeight: 800, fontSize: 15, letterSpacing: 1.5, cursor: "pointer",
            boxShadow: "0 6px 20px rgba(123,47,190,0.5)",
          }}
        >
          ЕЩЁ РАЗ ↺
        </button>
      </div>
    </div>
  );
}
