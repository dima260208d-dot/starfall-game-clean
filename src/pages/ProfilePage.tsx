import { useState } from "react";
import {
  getCurrentProfile,
  setFavoriteBrawler,
  renamePlayer,
  RENAME_GEM_COST,
  getBrawlerTrophies,
  getBrawlerRank,
  MAX_BRAWLER_RANK,
} from "../utils/localStorageAPI";
import { BRAWLERS } from "../entities/BrawlerData";
import BrawlerRankRewardsModal from "../components/BrawlerRankRewardsModal";
import { TrophyIcon, GemIcon } from "../components/GameIcons";
import { isStarGuardianActive, getStarGuardianDaysRemaining } from "../utils/subscription";

interface Props {
  onBack: () => void;
}

export default function ProfilePage({ onBack }: Props) {
  const [profile, setProfile] = useState(getCurrentProfile());
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [rankModalBrawlerId, setRankModalBrawlerId] = useState<string | null>(null);

  const refresh = () => setProfile(getCurrentProfile());

  if (!profile) return null;
  const base = (import.meta as any).env?.BASE_URL ?? "/";
  const fav = BRAWLERS.find(b => b.id === profile.favoriteBrawlerId) || BRAWLERS[0];
  const favLevel = profile.brawlerLevels[fav.id] || 1;
  const favTrophies = getBrawlerTrophies(profile, fav.id);
  const favRank = getBrawlerRank(favTrophies);
  const winrate = profile.totalGamesPlayed
    ? Math.round((profile.totalWins / profile.totalGamesPlayed) * 100)
    : 0;
  const starGuardianActive = isStarGuardianActive();
  const sgDays = getStarGuardianDaysRemaining();

  const handleRename = () => {
    const r = renamePlayer(newName);
    setMsg({ text: r.success ? "Имя изменено!" : (r.error || "Ошибка"), ok: !!r.success });
    if (r.success) {
      setRenaming(false);
      setNewName("");
      refresh();
    }
    setTimeout(() => setMsg(null), 2500);
  };

  const handleFav = (id: string) => {
    setFavoriteBrawler(id);
    refresh();
  };

  return (
    <div
      style={{
        minHeight: "100%",
        background: "linear-gradient(135deg, #0c2244 0%, #153665 50%, #255797 100%)",
        padding: "30px 20px",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        color: "white",
      }}
    >
      <button onClick={onBack} style={backBtn}>← Назад</button>

      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={title}>Профиль</h1>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "260px 1fr",
            gap: 24,
            marginTop: 30,
          }}
        >
          {/* Left: avatar */}
          <div style={card}>
            <button
              onClick={() => setRankModalBrawlerId(fav.id)}
              title="Награды за ранги"
              style={{
                display: "flex", justifyContent: "center", gap: 8, marginBottom: 10, flexWrap: "wrap",
                background: "transparent", border: "none", padding: 0, cursor: "pointer",
                width: "100%",
              }}
            >
              <span style={{
                background: "linear-gradient(135deg, #F9A825, #FFD700)",
                color: "#000", borderRadius: 8, padding: "4px 10px",
                fontSize: 12, fontWeight: 900, letterSpacing: 0.5,
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              }}>
                РАНГ {favRank}/{MAX_BRAWLER_RANK}
              </span>
              <span style={{
                background: "linear-gradient(135deg, #B8860B, #D4A017)",
                color: "#1a1a1a", borderRadius: 8, padding: "4px 10px",
                fontSize: 12, fontWeight: 900, letterSpacing: 0.5,
                border: "1px solid rgba(255,215,0,0.6)",
              }}>
                ⚡ СИЛА {favLevel}
              </span>
              <span style={{
                background: "rgba(0,0,0,0.45)",
                color: "#FFD700", borderRadius: 8, padding: "4px 10px",
                fontSize: 12, fontWeight: 900, letterSpacing: 0.5,
                border: "1px solid rgba(255,215,0,0.5)",
              }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><TrophyIcon size={14} /> {favTrophies}</span>
              </span>
            </button>
            <div style={{
              width: "100%", aspectRatio: "1/1", borderRadius: 16,
              background: `radial-gradient(circle at 50% 30%, ${fav.color}55, transparent 70%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: starGuardianActive
                ? "2px solid #FFD700"
                : `2px solid ${fav.color}`,
              overflow: "hidden",
              marginBottom: 14,
              boxShadow: starGuardianActive
                ? "0 0 20px rgba(255,215,0,0.45), 0 0 42px rgba(206,147,216,0.32)"
                : undefined,
            }}>
              <img
                src={`${base}brawlers/${fav.id}_front.png`}
                alt={fav.name}
                style={{ width: "85%", filter: `drop-shadow(0 8px 20px ${fav.color})` }}
              />
            </div>
            <div style={{ textAlign: "center", fontSize: 22, fontWeight: 800, color: fav.color }}>
              {profile.username}
            </div>
            {starGuardianActive && (
              <div style={{
                marginTop: 6,
                textAlign: "center",
                background: "linear-gradient(135deg, #FFD700, #CE93D8)",
                color: "#311B92",
                borderRadius: 999,
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: 0.6,
                border: "1px solid rgba(255,255,255,0.4)",
              }}>
                ✨ STAR GUARDIAN · {sgDays} дн.
              </div>
            )}
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 4 }}>
              Любимый персонаж: {fav.name}
            </div>
            {!renaming ? (
              <button
                onClick={() => { setRenaming(true); setNewName(profile.username); }}
                style={{ ...miniBtn, marginTop: 14, width: "100%" }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>✏️ Сменить имя ({RENAME_GEM_COST} <GemIcon size={14} />)</span>
              </button>
            ) : (
              <div style={{ marginTop: 14 }}>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={16}
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.3)",
                    color: "white", fontSize: 14, boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button onClick={handleRename} style={{ ...miniBtn, flex: 1, background: "rgba(105,240,174,0.2)", color: "#69F0AE" }}>OK</button>
                  <button onClick={() => setRenaming(false)} style={{ ...miniBtn, flex: 1 }}>Отмена</button>
                </div>
              </div>
            )}
            {msg && (
              <div style={{
                marginTop: 8, fontSize: 12, textAlign: "center",
                color: msg.ok ? "#69F0AE" : "#FF7043",
              }}>
                {msg.text}
              </div>
            )}
          </div>

          {/* Right: stats */}
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <Stat label="Кубков" value={profile.trophies} color="#FFD700" icon={<TrophyIcon size={32} />} />
              <Stat label="Игр" value={profile.totalGamesPlayed} color="#40C4FF" icon="🎮" />
              <Stat label="Винрейт" value={`${winrate}%`} color="#69F0AE" icon="📈" />
              <Stat label="Побед" value={profile.totalWins} color="#69F0AE" icon="🥇" />
              <Stat label="Поражений" value={profile.totalLosses} color="#FF7043" icon="💀" />
              <Stat label="Star Pass" value={profile.clashPassLevel} color="#CE93D8" icon="🎟️" />
            </div>

            <h3 style={{ marginTop: 28, marginBottom: 12, color: "rgba(255,255,255,0.7)", fontWeight: 700, letterSpacing: 1 }}>
              СТАТИСТИКА ПО РЕЖИМАМ
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              {(["showdown","crystals","heist","gemgrab","siege"] as const).map(m => {
                const s = profile.modeStats[m] || { games: 0, wins: 0, losses: 0 };
                const wr = s.games ? Math.round((s.wins / s.games) * 100) : 0;
                const labels: Record<string,string> = {
                  showdown: "Столкновение", crystals: "Вынос кристаллов", heist: "Ограбление",
                  gemgrab: "Ограбление кристаллов", siege: "Осада",
                };
                return (
                  <div key={m} style={{ ...card, padding: 12 }}>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>{labels[m]}</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                      {s.wins}/{s.losses} <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>({wr}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <h3 style={{ marginTop: 28, marginBottom: 12, color: "rgba(255,255,255,0.7)", fontWeight: 700, letterSpacing: 1 }}>
              ВЫБОР ЛЮБИМОГО ПЕРСОНАЖА
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {BRAWLERS.map(b => {
                const active = b.id === profile.favoriteBrawlerId;
                return (
                  <button
                    key={b.id}
                    onClick={() => handleFav(b.id)}
                    style={{
                      width: 64, height: 64, borderRadius: 12,
                      background: active ? `${b.color}22` : "rgba(255,255,255,0.04)",
                      border: `2px solid ${active ? b.color : "rgba(255,255,255,0.1)"}`,
                      cursor: "pointer", padding: 0, overflow: "hidden",
                      transform: active ? "scale(1.05)" : "scale(1)",
                      transition: "transform 0.15s",
                    }}
                  >
                    <img src={`${base}brawlers/${b.id}_front.png`} alt={b.name} style={{ width: "100%" }} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {rankModalBrawlerId && (
        <BrawlerRankRewardsModal
          brawlerId={rankModalBrawlerId}
          onClose={() => { setRankModalBrawlerId(null); refresh(); }}
        />
      )}
    </div>
  );
}

const backBtn: React.CSSProperties = {
  position: "absolute", top: 20, left: 20,
  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 10, padding: "8px 18px", color: "rgba(255,255,255,0.7)",
  cursor: "pointer", fontSize: 14, fontWeight: 600,
};
const title: React.CSSProperties = {
  fontSize: 36, fontWeight: 900, margin: 0, textAlign: "center",
  background: "linear-gradient(135deg, #FFD700, #FF8A00)",
  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
};
const card: React.CSSProperties = {
  background: "linear-gradient(170deg, rgba(255,255,255,0.1), rgba(8,20,44,0.68))",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 18, padding: 18,
  boxShadow: "0 14px 34px rgba(0,0,0,0.32)",
};
const miniBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 10, padding: "8px 12px", color: "white", fontSize: 12,
  cursor: "pointer", fontWeight: 700,
};

function Stat({ label, value, color, icon }: { label: string; value: number | string; color: string; icon: React.ReactNode }) {
  return (
    <div style={{ ...card, display: "flex", alignItems: "center", gap: 10, padding: 14 }}>
      <div style={{ fontSize: 28, display: "flex", alignItems: "center" }}>{icon}</div>
      <div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, letterSpacing: 1 }}>{label}</div>
        <div style={{ color, fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{value}</div>
      </div>
    </div>
  );
}
