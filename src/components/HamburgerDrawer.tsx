import { useState, useEffect } from "react";
import { useI18n } from "../i18n";
import { getBattleHistory, getCurrentProfile, isGuestProfile, type BattleRecord } from "../utils/localStorageAPI";
import { brawlerName } from "../i18n";
import { BRAWLERS } from "../entities/BrawlerData";

interface Props {
  onClose: () => void;
  onSettings: () => void;
  onLogout: () => void;
  isGuest?: boolean;
  onRegister?: () => void;
  onAccounts?: () => void;
  onNews?: () => void;
  unreadNews?: number;
  onMessages?: () => void;
  unreadMessages?: number;
  onMapEditor?: () => void;
  onAdmin?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onBattleHistory?: () => void;
  onRecords?: () => void;
}

type Panel = "menu" | "battle";

const MODE_NAME_KEYS: Record<string, string> = {
  showdown: "mode.drawer.showdown",
  crystals: "mode.drawer.crystals",
  heist: "mode.drawer.heist",
  gemgrab: "mode.drawer.gemgrab",
  siege: "mode.drawer.siege",
  training: "mode.drawer.training",
};


function formatTs(ts: number, localeTag: string) {
  const d = new Date(ts);
  return d.toLocaleDateString(localeTag) + " " + d.toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit" });
}

export default function HamburgerDrawer({ onClose, onSettings, onLogout, isGuest, onRegister, onAccounts, onNews, unreadNews = 0, onMessages, unreadMessages = 0, onMapEditor, onAdmin, isFullscreen = false, onToggleFullscreen, onBattleHistory, onRecords }: Props) {
  const { t, localeMeta } = useI18n();
  const localeTag = localeMeta.bcp47;
  const guest = isGuest ?? isGuestProfile(getCurrentProfile());
  const [panel, setPanel] = useState<Panel>("menu");
  const modeName = (m: string) => (MODE_NAME_KEYS[m] ? t(MODE_NAME_KEYS[m]) : m);
  const [history, setHistory] = useState<BattleRecord[]>([]);

  useEffect(() => {
    setHistory(getBattleHistory());
  }, [panel]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(2,0,18,0.08)", zIndex: 50,
        }}
      />
      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: panel === "menu" ? 280 : 500,
        maxWidth: "95vw",
        background: "linear-gradient(180deg, rgba(30,50,110,0.22) 0%, rgba(12,22,50,0.18) 48%, rgba(25,45,95,0.20) 100%)",
        borderLeft: "1px solid rgba(120,160,255,0.38)",
        boxShadow: "-20px 0 60px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.10)",
        backdropFilter: "blur(10px) saturate(1.2)",
        WebkitBackdropFilter: "blur(10px) saturate(1.2)",
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
            <button onClick={() => setPanel("menu")} style={iconBtnStyle}>{t("drawer.back")}</button>
          )}
          <span style={{ fontSize: 16, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginLeft: panel !== "menu" ? 8 : 0 }}>
            {panel === "menu" ? t("drawer.title.menu") : t("drawer.title.battles")}
          </span>
          <button onClick={onClose} style={{ ...iconBtnStyle, marginLeft: "auto" }}>✕</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
          {panel === "menu" && (
            <MenuPanel
              t={t}
              onSettings={onSettings}
              onLogout={onLogout}
              isGuest={guest}
              onRegister={onRegister}
              onAccounts={onAccounts}
              onNews={onNews}
              unreadNews={unreadNews}
              onMessages={onMessages}
              unreadMessages={unreadMessages}
              setPanel={setPanel}
              onMapEditor={onMapEditor}
              onAdmin={onAdmin}
              isFullscreen={isFullscreen}
              onToggleFullscreen={onToggleFullscreen}
              onBattleHistory={onBattleHistory}
              onRecords={onRecords}
            />
          )}
          {panel === "battle" && <BattlePanel history={history} t={t} modeName={modeName} localeTag={localeTag} />}
        </div>
      </div>
    </>
  );
}

function MenuPanel({ t, onSettings, onLogout, isGuest, onRegister, onAccounts, onNews, unreadNews, onMessages, unreadMessages, setPanel, onMapEditor, onAdmin, isFullscreen, onToggleFullscreen, onBattleHistory, onRecords }: {
  t: (key: string, params?: Record<string, string | number>) => string;
  onSettings: () => void; onLogout: () => void;
  isGuest: boolean;
  onRegister?: () => void;
  onAccounts?: () => void;
  onNews?: () => void; unreadNews: number;
  onMessages?: () => void; unreadMessages: number;
  setPanel: (p: Panel) => void; onMapEditor?: () => void; onAdmin?: () => void;
  isFullscreen?: boolean; onToggleFullscreen?: () => void;
  onBattleHistory?: () => void;
  onRecords?: () => void;
}) {
  const items = [
    ...(onToggleFullscreen ? [{
      icon: isFullscreen ? "🗗" : "⛶",
      label: isFullscreen ? t("drawer.fullscreen.exit") : t("drawer.fullscreen.enter"),
      sub: t("drawer.fullscreen.sub"),
      onClick: onToggleFullscreen,
      disabled: false,
    }] : []),
    ...(onMessages ? [{
      icon: "💬",
      label: t("drawer.messages"),
      sub: t("drawer.messages.sub"),
      onClick: onMessages,
      disabled: false,
      badge: unreadMessages,
    }] : []),
    ...(onNews ? [{
      icon: "📰",
      label: unreadNews > 0 ? t("drawer.newsWithCount", { count: unreadNews }) : t("drawer.news"),
      sub: t("drawer.news.sub"),
      onClick: onNews,
      disabled: false,
      badge: unreadNews,
    }] : []),
    { icon: "⚙️", label: t("drawer.settings"), sub: t("drawer.settings.sub"), onClick: onSettings, disabled: false },
    { icon: "⚔️", label: t("drawer.battles"), sub: t("drawer.battles.sub"), onClick: () => (onBattleHistory ? onBattleHistory() : setPanel("battle")), disabled: false },
    { icon: "🏆", label: t("drawer.leaderboard"), sub: t("drawer.leaderboard.sub"), onClick: () => (onRecords ? onRecords() : undefined), disabled: !onRecords },
    ...(onMapEditor ? [{ icon: "🗺️", label: t("drawer.mapEditor"), sub: t("drawer.mapEditor.sub"), onClick: onMapEditor, disabled: false, admin: true }] : []),
    ...(onAdmin ? [{ icon: "🛡️", label: t("drawer.admin"), sub: t("drawer.admin.sub"), onClick: onAdmin, disabled: false, admin: true }] : []),
    { icon: "🚪", label: t("drawer.logout"), sub: t("drawer.logout.sub"), onClick: onLogout, disabled: false, danger: true },
    ...(isGuest && onRegister ? [{ icon: "📝", label: t("drawer.registerAccount"), sub: t("drawer.registerAccount.sub"), onClick: onRegister, disabled: false }] : []),
    ...(!isGuest && onAccounts ? [{ icon: "👤", label: t("drawer.accounts"), sub: t("drawer.accounts.sub"), onClick: onAccounts, disabled: false }] : []),
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
          <span style={{ fontSize: 22, width: 28, textAlign: "center", position: "relative", display: "inline-flex", justifyContent: "center" }}>
            {item.icon}
            {(item as { badge?: number }).badge ? (
              <span className="no-ui-shear" style={{
                position: "absolute", top: -6, right: -8,
                minWidth: 16, height: 16, padding: "0 4px", borderRadius: 8,
                background: "linear-gradient(135deg, #FF1744, #D50000)",
                border: "2px solid #160048", color: "white",
                fontSize: 9, fontWeight: 900, lineHeight: "12px", textAlign: "center",
              }}>
                {(item as { badge?: number }).badge! > 99 ? "99+" : (item as { badge?: number }).badge}
              </span>
            ) : null}
          </span>
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

function BattlePanel({ history, t, modeName, localeTag }: {
  history: BattleRecord[];
  t: (key: string, params?: Record<string, string | number>) => string;
  modeName: (m: string) => string;
  localeTag: string;
}) {
  if (!history.length) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.4)" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚔️</div>
        <div style={{ fontSize: 14 }}>{t("drawer.battles.empty")}</div>
        <div style={{ fontSize: 12, marginTop: 6 }}>{t("drawer.battles.emptyHint")}</div>
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
              {r.won ? t("drawer.battle.win") : t("drawer.battle.loss")}
            </span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{formatTs(r.ts, localeTag)}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <Chip label={t("drawer.battle.mode")} value={modeName(r.mode)} />
            <Chip label={t("drawer.battle.brawler")} value={brawlerName(r.brawlerId, BRAWLERS.find(b => b.id === r.brawlerId)?.name ?? r.brawlerId)} />
            <Chip label={t("drawer.battle.place")} value={`${r.place} / ${r.totalPlayers}`} />
            {r.durationSec ? <Chip label={t("drawer.battle.time")} value={t("drawer.battle.timeSec", { sec: Math.round(r.durationSec) })} /> : null}
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
