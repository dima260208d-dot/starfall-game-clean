import { useState } from "react";
import { BRAWLERS } from "../entities/BrawlerData";
import { getCurrentProfile } from "../utils/localStorageAPI";

interface MegaSquadPickerPageProps {
  onConfirm: (squadIds: string[], squadLevels: number[]) => void;
  onBack: () => void;
}

export default function MegaSquadPickerPage({ onConfirm, onBack }: MegaSquadPickerPageProps) {
  const profile = getCurrentProfile();
  const ownedIds = profile?.unlockedBrawlers ?? [];
  const ownedBrawlers = BRAWLERS.filter(b => ownedIds.includes(b.id));

  // Pre-fill squad with the active brawler + first 2 owned (avoiding duplicates).
  const initialPick = (() => {
    const seed: string[] = [];
    if (profile?.selectedBrawlerId && ownedIds.includes(profile.selectedBrawlerId)) {
      seed.push(profile.selectedBrawlerId);
    }
    for (const b of ownedBrawlers) {
      if (seed.length >= 3) break;
      if (!seed.includes(b.id)) seed.push(b.id);
    }
    while (seed.length < 3) seed.push("");
    return seed;
  })();
  const [squad, setSquad] = useState<string[]>(initialPick);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);

  const setSlot = (idx: number, id: string) => {
    setSquad(prev => {
      const next = [...prev];
      // If this brawler is already in another slot, swap them.
      const existingIdx = next.indexOf(id);
      if (existingIdx >= 0 && existingIdx !== idx) {
        next[existingIdx] = next[idx];
      }
      next[idx] = id;
      return next;
    });
    setEditingSlot(null);
  };

  const allFilled = squad.every(id => id !== "");

  const handleConfirm = () => {
    if (!allFilled) return;
    const levels = squad.map(id => profile?.brawlerLevels?.[id] ?? 1);
    onConfirm(squad, levels);
  };

  return (
    <div
      style={{
        minHeight: "100%",
        background: "linear-gradient(135deg, #2D1B0A 0%, #6A040F 50%, #DC2F02 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px 20px",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        position: "relative",
      }}
    >
      <button
        onClick={onBack}
        style={{
          position: "absolute",
          top: 20, left: 20,
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 10,
          padding: "8px 18px",
          color: "rgba(255,255,255,0.7)",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        ← Назад
      </button>

      <div style={{ textAlign: "center", marginBottom: 24, marginTop: 12 }}>
        <h1 style={{
          fontSize: 38,
          fontWeight: 900,
          color: "#FFD54F",
          margin: 0,
          textShadow: "0 0 18px rgba(255,213,79,0.5)",
        }}>
          ✨ Соберите отряд ✨
        </h1>
        <p style={{ color: "rgba(255,255,255,0.7)", marginTop: 8, fontSize: 14 }}>
          Выберите 3 бойца. Первый выйдет на арену, остальные ждут в резерве.
        </p>
      </div>

      <div style={{
        display: "flex",
        gap: 18,
        justifyContent: "center",
        flexWrap: "wrap",
        marginBottom: 30,
      }}>
        {squad.map((id, idx) => {
          const b = BRAWLERS.find(br => br.id === id);
          const lvl = id ? (profile?.brawlerLevels?.[id] ?? 1) : 0;
          const trophies = id ? (profile?.brawlerTrophies?.[id] ?? 0) : 0;
          return (
            <div key={idx} style={{
              width: 200,
              padding: 16,
              borderRadius: 18,
              background: b
                ? `linear-gradient(180deg, ${b.color}33, rgba(0,0,0,0.5))`
                : "rgba(255,255,255,0.05)",
              border: `2px solid ${b ? b.color + "AA" : "rgba(255,255,255,0.15)"}`,
              boxShadow: b ? `0 0 30px ${b.color}44` : "none",
              cursor: "pointer",
              textAlign: "center",
              transition: "transform 0.2s",
            }}
              onClick={() => setEditingSlot(idx)}
              onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-4px)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "none")}
            >
              <div style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.5)",
                fontWeight: 700,
                letterSpacing: 1.5,
                marginBottom: 6,
              }}>
                СЛОТ {idx + 1}{idx === 0 ? " · НАЧАЛЬНЫЙ" : ""}
              </div>
              {b ? (
                <>
                  <div style={{
                    width: 80, height: 80, borderRadius: 16,
                    margin: "0 auto 8px",
                    background: `radial-gradient(circle, ${b.color}, ${b.secondaryColor || "#000"})`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "white", fontWeight: 900, fontSize: 28,
                    border: `2px solid ${b.color}`,
                    boxShadow: `0 0 18px ${b.color}88`,
                  }}>
                    {b.name.charAt(0)}
                  </div>
                  <div style={{ color: "white", fontWeight: 800, fontSize: 17 }}>
                    {b.name}
                  </div>
                  <div style={{ color: b.color, fontSize: 12, fontWeight: 700, marginTop: 4 }}>
                    Ур. {lvl} · 🏆 {trophies}
                  </div>
                </>
              ) : (
                <div style={{
                  height: 130,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 16,
                  fontWeight: 700,
                }}>
                  + Выбрать бойца
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={handleConfirm}
        disabled={!allFilled}
        style={{
          background: allFilled
            ? "linear-gradient(135deg, #B71C1C, #FFD54F)"
            : "rgba(255,255,255,0.08)",
          border: "none",
          borderRadius: 16,
          padding: "16px 56px",
          color: "white",
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: 3,
          cursor: allFilled ? "pointer" : "not-allowed",
          boxShadow: allFilled ? "0 10px 40px rgba(183,28,28,0.5)" : "none",
          opacity: allFilled ? 1 : 0.5,
        }}
      >
        ▶ В БОЙ
      </button>

      {editingSlot !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 20,
          }}
          onClick={() => setEditingSlot(null)}
        >
          <div
            style={{
              background: "linear-gradient(180deg, #1A1A2E, #0F0F1B)",
              borderRadius: 20,
              padding: 24,
              maxWidth: 720,
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
              border: "1px solid rgba(255,213,79,0.3)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ color: "white", fontSize: 22, fontWeight: 900, marginBottom: 16, textAlign: "center" }}>
              Выберите бойца для слота {editingSlot + 1}
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 12,
            }}>
              {ownedBrawlers.map(b => {
                const lvl = profile?.brawlerLevels?.[b.id] ?? 1;
                const isInSquad = squad.includes(b.id);
                return (
                  <div
                    key={b.id}
                    onClick={() => setSlot(editingSlot, b.id)}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: `linear-gradient(180deg, ${b.color}33, rgba(0,0,0,0.4))`,
                      border: `1.5px solid ${isInSquad ? "#FFD54F" : b.color + "55"}`,
                      cursor: "pointer",
                      textAlign: "center",
                      transition: "transform 0.15s",
                      position: "relative",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.04)")}
                    onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                  >
                    {isInSquad && (
                      <div style={{
                        position: "absolute",
                        top: 4, right: 6,
                        fontSize: 10, color: "#FFD54F", fontWeight: 800,
                      }}>В ОТРЯДЕ</div>
                    )}
                    <div style={{
                      width: 56, height: 56, borderRadius: 12,
                      margin: "0 auto 6px",
                      background: `radial-gradient(circle, ${b.color}, ${b.secondaryColor || "#000"})`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "white", fontWeight: 900, fontSize: 20,
                    }}>
                      {b.name.charAt(0)}
                    </div>
                    <div style={{ color: "white", fontWeight: 700, fontSize: 13 }}>
                      {b.name}
                    </div>
                    <div style={{ color: b.color, fontSize: 11, fontWeight: 700 }}>
                      Ур. {lvl}
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setEditingSlot(null)}
              style={{
                marginTop: 16,
                width: "100%",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 10,
                padding: "10px",
                color: "rgba(255,255,255,0.7)",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
