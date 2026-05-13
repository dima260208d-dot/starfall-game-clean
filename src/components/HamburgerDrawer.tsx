import { useState, useEffect } from "react";
import { getAllProfiles, getBattleHistory, type BattleRecord } from "../utils/localStorageAPI";
import { BRAWLERS } from "../entities/BrawlerData";

interface Props {
  onClose: () => void;
  onSettings: () => void;
  onLogout: () => void;
  onNews?: () => void;
  unreadNews?: number;
  onMapEditor?: () => void;
  onAdmin?: () => void;
}

type Panel = "menu" | "battle" | "leaderboard";

const MODE_NAMES: Record<string, string> = {
  showdown: "Столкновение", crystals: "Вынос кристаллов", heist: "Ограбление",
  gemgrab: "Ограбление кристаллов", siege: "Осада", training: "Тренировка",
};

function modeName(m: string) { return MODE_NAMES[m] ?? m; }

function brawlerName(id: string) {
  return BRAWLERS.find(b => b.id === id)?.name ?? id;
}

function formatTs(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString("ru-RU") + " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function HamburgerDrawer({ onClose, onSettings, onLogout, onNews, unreadNews = 0, onMapEditor, onAdmin }: Props) {
  const [panel, setPanel] = useState<Panel>("menu");
  const [history, setHistory] = useState<BattleRecord[]>([]);
  const [profiles, setProfiles] = useState<ReturnType<typeof getAllProfiles>>({});

  useEffect(() => {
    setHistory(getBattleHistory());
    setProfiles(getAllProfiles());
  }, [panel]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 50,
          backdropFilter: "blur(4px)",
        }}
      />
      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: panel === "menu" ? 280 : 500,
        maxWidth: "95vw",
        background: "linear-gradient(180deg, rgba(14,26,58,0.98) 0%, rgba(8,16,38,0.98) 100%)",
        borderLeft: "1px solid rgba(255,255,255,0.16)",
        boxShadow: "-20px 0 70px rgba(0,0,0,0.62)",
        zIndex: 51,
        display: "flex", flexDirection: "column",
        animation: "slideInRight 0.2s ease-out",
        overflow: "hidden",
      }}>
        <style>{`
          @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        `}</style>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.06)",
        }}>
          {panel !== "menu" && (
            <button onClick={() => setPanel("menu")} style={iconBtnStyle}>← Назад</button>
          )}
          <span style={{ fontSize: 16, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginLeft: panel !== "menu" ? 8 : 0 }}>
            {panel === "menu" ? "Меню" : panel === "battle" ? "Данные боёв" : "Лидеры"}
          </span>
          <button onClick={onClose} style={{ ...iconBtnStyle, marginLeft: "auto" }}>✕</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
          {panel === "menu" && (
            <MenuPanel
              onSettings={onSettings}
              onLogout={onLogout}
              onNews={onNews}
              unreadNews={unreadNews}
              setPanel={setPanel}
              onMapEditor={onMapEditor}
              onAdmin={onAdmin}
            />
          )}
          {panel === "battle" && <BattlePanel history={history} />}
          {panel === "leaderboard" && <LeaderboardPanel profiles={profiles} />}
        </div>
      </div>
    </>
  );
}

function MenuPanel({ onSettings, onLogout, onNews, unreadNews, setPanel, onMapEditor, onAdmin }: {
  onSettings: () => void; onLogout: () => void;
  onNews?: () => void; unreadNews: number;
  setPanel: (p: Panel) => void; onMapEditor?: () => void; onAdmin?: () => void;
}) {
  const items = [
    { icon: "💬", label: "Сообщения", sub: "Скоро", onClick: () => {}, disabled: true },
    ...(onNews ? [{
      icon: "📰",
      label: unreadNews > 0 ? `Новости (${unreadNews})` : "Новости",
      sub: "Обновления и события",
      onClick: onNews,
      disabled: false,
    }] : []),
    { icon: "⚙️", label: "Настройки", sub: "Управление, звук, аккаунт", onClick: onSettings, disabled: false },
    { icon: "⚔️", label: "Данные боёв", sub: "Последние 20 игр", onClick: () => setPanel("battle"), disabled: false },
    { icon: "🏆", label: "Таблица лидеров", sub: "Лучшие игроки", onClick: () => setPanel("leaderboard"), disabled: false },
    ...(onMapEditor ? [{ icon: "🗺️", label: "Конструктор карт", sub: "Режим администратора", onClick: onMapEditor, disabled: false, admin: true }] : []),
    ...(onAdmin ? [{ icon: "🛡️", label: "Панель разработчика", sub: "Акции, новости, подарки", onClick: onAdmin, disabled: false, admin: true }] : []),
    { icon: "🚪", label: "Выйти", sub: "Выход из аккаунта", onClick: onLogout, disabled: false, danger: true },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 12px" }}>
      {items.map((item, i) => (
        <button key={i} onClick={item.disabled ? undefined : item.onClick} disabled={item.disabled} style={{
          display: "flex", alignItems: "center", gap: 14,
          background: (item as any).admin ? "rgba(255,215,0,0.06)" : item.danger ? "rgba(255,82,82,0.06)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${(item as any).admin ? "rgba(255,215,0,0.25)" : item.danger ? "rgba(255,82,82,0.2)" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 12, padding: "14px 16px",
          color: item.disabled ? "rgba(255,255,255,0.3)" : item.danger ? "#FF7070" : (item as any).admin ? "#FFD54F" : "white",
          cursor: item.disabled ? "not-allowed" : "pointer",
          textAlign: "left", width: "100%", fontFamily: "inherit",
          opacity: item.disabled ? 0.6 : 1,
        }}>
          <span style={{ fontSize: 22, width: 28, textAlign: "center" }}>{item.icon}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{item.label}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{item.sub}</div>
          </div>
          {!item.disabled && !item.danger && <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>›</span>}
        </button>
      ))}
    </div>
  );
}

function BattlePanel({ history }: { history: BattleRecord[] }) {
  if (!history.length) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.4)" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚔️</div>
        <div style={{ fontSize: 14 }}>Нет данных о боях</div>
        <div style={{ fontSize: 12, marginTop: 6 }}>Сыграйте несколько игр</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 12px" }}>
      {history.map(r => (
        <div key={r.id} style={{
          background: r.won ? "rgba(105,240,174,0.06)" : "rgba(255,82,82,0.06)",
          border: `1px solid ${r.won ? "rgba(105,240,174,0.2)" : "rgba(255,82,82,0.2)"}`,
          borderRadius: 12, padding: "12px 14px",
          borderLeft: `4px solid ${r.won ? "#69F0AE" : "#FF5252"}`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: r.won ? "#69F0AE" : "#FF5252" }}>
              {r.won ? "🏆 ПОБЕДА" : "💀 ПОРАЖЕНИЕ"}
            </span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{formatTs(r.ts)}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <Chip label="Режим" value={modeName(r.mode)} />
            <Chip label="Боец" value={brawlerName(r.brawlerId)} />
            <Chip label="Место" value={`${r.place} / ${r.totalPlayers}`} />
            {r.durationSec ? <Chip label="Время" value={`${Math.round(r.durationSec)}с`} /> : null}
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
            <span>🏆 {r.trophyDelta >= 0 ? "+" : ""}{r.trophyDelta}</span>
            <span>⭐ +{r.xpGained} XP</span>
            <span>🪙 +{r.coinsEarned}</span>
          </div>
          {r.enemies.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {r.enemies.slice(0, 8).map((e, i) => (
                <span key={i} style={{
                  background: "rgba(255,255,255,0.06)", borderRadius: 6,
                  padding: "2px 6px", fontSize: 10, color: "rgba(255,255,255,0.55)",
                }}>
                  {e.isBot ? "🤖" : "👤"} {e.name}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LeaderboardPanel({ profiles }: { profiles: ReturnType<typeof getAllProfiles> }) {
  const sorted = Object.values(profiles).sort((a, b) => b.trophies - a.trophies);

  if (!sorted.length) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.4)" }}>
        <div style={{ fontSize: 14 }}>Нет зарегистрированных аккаунтов</div>
      </div>
    );
  }

  const MEDALS = ["🥇", "🥈", "🥉"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 12px" }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 2, fontWeight: 700, padding: "4px 4px 8px" }}>
        РЕЙТИНГ — {sorted.length} ИГРОКОВ
      </div>
      {sorted.map((p, i) => (
        <div key={p.username} style={{
          display: "flex", alignItems: "center", gap: 12,
          background: i < 3 ? "rgba(255,215,0,0.06)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${i < 3 ? "rgba(255,215,0,0.2)" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 12, padding: "12px 14px",
        }}>
          <span style={{ fontSize: 20, width: 28, textAlign: "center" }}>{MEDALS[i] ?? `#${i + 1}`}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{p.username}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
              Игр: {p.totalGamesPlayed} • Побед: {p.totalWins}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#FFD700" }}>🏆 {p.trophies}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
              Lv.{p.clashPassLevel} Battle Pass
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span style={{
      background: "rgba(255,255,255,0.07)", borderRadius: 6,
      padding: "3px 8px", fontSize: 11, color: "rgba(255,255,255,0.7)",
    }}>
      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>{label}: </span>{value}
    </span>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8, padding: "5px 10px",
  color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 12, fontWeight: 700,
  fontFamily: "inherit",
};
