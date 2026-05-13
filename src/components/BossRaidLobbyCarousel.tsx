import { useEffect, useState } from "react";
import { BRAWLERS } from "../entities/BrawlerData";
import BrawlerViewer3D from "./BrawlerViewer3D";
import ChestVisual from "./ChestVisual";
import { CoinIcon, GemIcon, PowerIcon } from "./GameIcons";
import { getCurrentProfile } from "../utils/localStorageAPI";
import { getBossRaidCurrentLevel, isBossRaidLevelFirstClearDone } from "../utils/bossRaidProgress";
import { BOSS_RAID_LEVEL_REWARDS, type BossRaidLevelReward } from "../utils/bossRaidRewards";

interface BossRaidLobbyCarouselProps {
  onSelectBoss: (bossId: string) => void;
}

/** Одна горизонтальная строка: монеты · сила · кристаллы (без переноса). */
function LevelRewardIcons({ reward }: { reward: BossRaidLevelReward }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        flexWrap: "nowrap",
        flexShrink: 0,
      }}
    >
      {reward.coins > 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <CoinIcon size={14} />
          <span style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>{reward.coins}</span>
        </span>
      )}
      {reward.powerPoints > 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <PowerIcon size={14} />
          <span style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>{reward.powerPoints}</span>
        </span>
      )}
      {reward.gems > 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <GemIcon size={14} />
          <span style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>{reward.gems}</span>
        </span>
      )}
    </div>
  );
}

export default function BossRaidLobbyCarousel({ onSelectBoss }: BossRaidLobbyCarouselProps) {
  const [, bump] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => bump((n) => n + 1), 700);
    return () => window.clearInterval(id);
  }, []);

  const profile = getCurrentProfile();

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1120,
        display: "flex",
        gap: 14,
        overflowX: "auto",
        padding: "4px 8px 20px",
        scrollSnapType: "x mandatory",
        WebkitOverflowScrolling: "touch",
        boxSizing: "border-box",
      }}
    >
      {BRAWLERS.map((b) => {
        const current = getBossRaidCurrentLevel(profile, b.id);
        return (
          <div
            key={b.id}
            data-boss-lobby-card
            style={{
              flex: "0 0 min(92vw, 480px)",
              scrollSnapAlign: "center",
              borderRadius: 20,
              border: "1px solid rgba(255,213,79,0.28)",
              background: "linear-gradient(120deg, rgba(60,20,80,0.72), rgba(25,15,45,0.94), rgba(40,25,70,0.82))",
              boxShadow: "0 18px 48px rgba(0,0,0,0.42), 0 0 28px rgba(213,0,249,0.12)",
              padding: 8,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div style={{ display: "flex", flexDirection: "row", gap: 8, flex: 1, minHeight: 0, alignItems: "stretch" }}>
              <div
                style={{
                  flex: "0 0 42%",
                  maxWidth: 200,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    flex: 1,
                    minHeight: 172,
                    height: 172,
                    borderRadius: 14,
                    background: "radial-gradient(ellipse at center, rgba(126,87,194,0.38), rgba(0,0,0,0.52))",
                    border: "1px solid rgba(255,255,255,0.12)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {/*
                    BrawlerViewer3D `size` = canvas side in CSS px. Геометрический центр канваса — в центре рамки.
                  */}
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      width: 256,
                      height: 256,
                      transform: "translate(calc(-50% - 6px), -50%)",
                      pointerEvents: "auto",
                    }}
                  >
                    <BrawlerViewer3D brawlerId={b.id} color={b.color} size={256} />
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 900, marginTop: 4, textAlign: "center", lineHeight: 1.1 }}>
                  {b.name}
                </div>
                <div style={{ fontSize: 9, opacity: 0.76, textAlign: "center", marginTop: 1 }}>
                  {b.role} · {b.rarity}
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.95)", lineHeight: 1.1 }}>
                  Уровни и награды
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 8,
                    lineHeight: 1.25,
                    color: "rgba(255,255,255,0.55)",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as const,
                    overflow: "hidden",
                  }}
                >
                  Первые 5 — награда за 1-е прохождение, дальше +5% к боссу за уровень.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 1 }}>
                  {[1, 2, 3, 4, 5].map((lv) => {
                    const done = isBossRaidLevelFirstClearDone(profile, b.id, lv);
                    const locked = lv > current;
                    const reward = BOSS_RAID_LEVEL_REWARDS[lv];
                    return (
                      <div
                        key={lv}
                        style={{
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 5,
                          padding: "3px 5px",
                          borderRadius: 8,
                          background: locked ? "rgba(0,0,0,0.38)" : done ? "rgba(30,40,55,0.88)" : "rgba(60,40,90,0.42)",
                          border: `1px solid ${done ? "rgba(100,200,120,0.28)" : "rgba(255,255,255,0.1)"}`,
                          opacity: locked ? 0.68 : 1,
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 900,
                            fontSize: 12,
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                            width: 38,
                            letterSpacing: 0.1,
                          }}
                        >
                          Ур. {lv}
                        </span>
                        {/* Одна строка: награды слева, сундук сразу после них (не уезжает вправо). */}
                        <div
                          style={{
                            flex: 1,
                            minWidth: 0,
                            display: "flex",
                            flexDirection: "row",
                            flexWrap: "nowrap",
                            alignItems: "center",
                            justifyContent: "flex-start",
                            gap: 4,
                            overflow: "hidden",
                          }}
                        >
                          {reward && <LevelRewardIcons reward={reward} />}
                          {reward?.chest && (
                            <div
                              style={{
                                flexShrink: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 36,
                                height: 36,
                                marginLeft: 0,
                                transform: "translateX(-3px)",
                              }}
                            >
                              <ChestVisual rarity={reward.chest.rarity} size={34} animated={false} />
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            flexShrink: 0,
                            width: 46,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            textAlign: "center",
                          }}
                        >
                          {done && (
                            <span
                              style={{
                                color: "#66bb6a",
                                fontSize: 22,
                                fontWeight: 900,
                                lineHeight: 1,
                                textShadow: "0 0 10px rgba(102,187,106,0.55)",
                              }}
                              aria-hidden
                            >
                              ✓
                            </span>
                          )}
                          {locked && (
                            <span style={{ fontSize: 9, fontWeight: 800, opacity: 0.72, lineHeight: 1.05 }}>
                              Закрыто
                            </span>
                          )}
                          {!locked && !done && lv === current && (
                            <span style={{ color: "#ffd54f", fontSize: 10, fontWeight: 900, lineHeight: 1.05 }}>
                              Сейчас
                            </span>
                          )}
                          {!locked && !done && lv !== current && (
                            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, fontWeight: 700 }}>—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelectBoss(b.id)}
              style={{
                marginTop: 6,
                width: "100%",
                padding: "8px 0",
                borderRadius: 10,
                border: "none",
                fontWeight: 900,
                fontSize: 13,
                letterSpacing: 0.6,
                cursor: "pointer",
                background: "linear-gradient(90deg, #ff6f00, #d500f9)",
                color: "#fff",
                boxShadow: "0 6px 22px rgba(213,0,249,0.35)",
              }}
            >
              ВЫБРАТЬ
            </button>
            <div style={{ fontSize: 8, opacity: 0.5, marginTop: 4, textAlign: "center", lineHeight: 1.25 }}>
              Уровень боя: {current}. Кубки за матч не начисляются.
            </div>
          </div>
        );
      })}
    </div>
  );
}
