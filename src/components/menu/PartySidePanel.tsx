import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import FriendRowCard from "../FriendRowCard";
import { getModeIconUrl } from "../../utils/modeAssets";
import {
  getOnlineFriendsForParty,
  inviteFriendToParty,
  joinPartyByCode,
  PARTY_CHANGED_EVENT,
  type PartySlot,
} from "../../utils/social/party";

/** Ширина доп. меню (HamburgerDrawer, panel «menu»). */
export const AUX_MENU_WIDTH = 280;
/** Панель «В сети» — в 2 раза шире доп. меню. */
export const ONLINE_PANEL_WIDTH = AUX_MENU_WIDTH * 2;

export type PartyPanelSide = "left" | "right";

function panelSideForSlot(slot: PartySlot): PartyPanelSide {
  return slot.includes("right") ? "right" : "left";
}

interface Props {
  inviteSlot: PartySlot;
  onClose: () => void;
  onViewProfile: (playerId: string) => void;
  onSpectate?: (playerId: string) => void;
}

const iconBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  padding: "5px 10px",
  color: "rgba(255,255,255,0.7)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  fontFamily: "inherit",
};

export default function PartySidePanel({ inviteSlot, onClose, onViewProfile, onSpectate }: Props) {
  const { t } = useI18n();
  const side = panelSideForSlot(inviteSlot);
  const [codeInput, setCodeInput] = useState("");
  const [msg, setMsg] = useState("");
  const [actionPlayer, setActionPlayer] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const friends = useMemo(() => getOnlineFriendsForParty(), [tick]);

  useEffect(() => {
    const bump = () => setTick(t => t + 1);
    window.addEventListener(PARTY_CHANGED_EVENT, bump);
    return () => window.removeEventListener(PARTY_CHANGED_EVENT, bump);
  }, []);

  const handleInvite = (playerId: string) => {
    const r = inviteFriendToParty(playerId, inviteSlot);
    setMsg(r.success ? t("party.inviteSent") : (r.error ?? t("common.error")));
    setTick(t => t + 1);
    setTimeout(() => setMsg(""), 2200);
  };

  const handleJoinCode = () => {
    const r = joinPartyByCode(codeInput);
    setMsg(r.success ? t("party.joinedTeam") : (r.error ?? t("common.error")));
    if (r.success) onClose();
    setTimeout(() => setMsg(""), 2200);
  };

  const selected = actionPlayer
    ? friends.find(f => f.playerId === actionPlayer)
    : null;

  const slideAnim = side === "right" ? "partySlideInRight 0.22s ease-out" : "partySlideInLeft 0.22s ease-out";

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          background: "rgba(2,0,18,0.12)",
        }}
      />

      <div
        style={{
          position: "fixed",
          top: 0,
          bottom: 0,
          ...(side === "right" ? { right: 0 } : { left: 0 }),
          width: ONLINE_PANEL_WIDTH,
          maxWidth: "96vw",
          zIndex: 51,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: slideAnim,
          background: "linear-gradient(180deg, rgba(36,18,72,0.94) 0%, rgba(12,6,32,0.97) 52%, rgba(24,12,52,0.95) 100%)",
          ...(side === "right"
            ? {
                borderLeft: "1px solid rgba(206,147,216,0.42)",
                boxShadow: "-20px 0 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
              }
            : {
                borderRight: "1px solid rgba(206,147,216,0.42)",
                boxShadow: "20px 0 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
              }),
          backdropFilter: "blur(12px) saturate(1.15)",
          WebkitBackdropFilter: "blur(12px) saturate(1.15)",
        }}
      >
        <style>{`
          @keyframes partySlideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
          @keyframes partySlideInLeft { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        `}</style>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 22px",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.05)",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 900, color: "#CE93D8", letterSpacing: "0.02em" }}>
              {t("party.online", { count: friends.length })}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.42)", marginTop: 4, fontWeight: 600 }}>
              {t("party.inviteHint")}
            </div>
          </div>
          <button type="button" onClick={onClose} style={iconBtnStyle} aria-label={t("common.close")}>
            ✕
          </button>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {friends.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "48px 24px",
                color: "rgba(255,255,255,0.42)",
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{t("party.noFriendsOnline")}</div>
            </div>
          )}

          {friends.map(f => (
            <FriendRowCard
              key={f.playerId}
              username={f.username}
              statusText={f.screen === "battle" ? t("presence.screen.battle") : f.statusText}
              trophies={f.trophies}
              online={f.online}
              profileIconId={f.profileIconId}
              brawlerId={f.brawlerId}
              modeIconUrl={f.battleMode ? getModeIconUrl(f.battleMode) : null}
              onClick={() => setActionPlayer(f.playerId)}
              trailing={
                f.inMyParty ? (
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#CE93D8",
                      padding: "6px 10px",
                      whiteSpace: "nowrap",
                      background: "rgba(206,147,216,0.12)",
                      borderRadius: 8,
                      border: "1px solid rgba(206,147,216,0.28)",
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    {t("party.inTeam")}
                  </span>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    {f.screen === "battle" && f.online && onSpectate && (
                      <button
                        type="button"
                        className="ui-btn ui-btn--secondary"
                        title={t("party.spectateBattle")}
                        style={{
                          fontSize: 12,
                          padding: "8px 12px",
                          minHeight: 0,
                          fontWeight: 800,
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          onSpectate(f.playerId);
                          onClose();
                        }}
                      >
                        👁 {t("party.spectateShort")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="ui-btn ui-btn--primary"
                      style={{
                        fontSize: 12,
                        padding: "8px 14px",
                        minHeight: 0,
                        fontWeight: 800,
                      }}
                      onClick={e => {
                        e.stopPropagation();
                        handleInvite(f.playerId);
                      }}
                    >
                      {t("party.invite")}
                    </button>
                  </div>
                )
              }
            />
          ))}
        </div>

        <div
          style={{
            padding: "16px 20px 20px",
            borderTop: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.18)",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>
            {t("party.teamCode")}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              className="ui-input"
              value={codeInput}
              onChange={e => setCodeInput(e.target.value.toUpperCase())}
              placeholder="XXXXXX"
              style={{
                flex: 1,
                fontSize: 14,
                fontFamily: "monospace",
                minHeight: 0,
                padding: "10px 14px",
                letterSpacing: "0.12em",
              }}
            />
            <button
              type="button"
              className="ui-btn ui-btn--secondary"
              onClick={handleJoinCode}
              style={{ fontSize: 13, padding: "10px 18px", minHeight: 0, fontWeight: 800 }}
            >
              {t("party.join")}
            </button>
          </div>
          {msg && (
            <div style={{ fontSize: 12, marginTop: 10, color: "#69F0AE", fontWeight: 700 }}>
              {msg}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 55,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.45)",
          }}
          onClick={() => setActionPlayer(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "rgba(15,8,42,0.96)",
              border: "1px solid rgba(206,147,216,0.4)",
              borderRadius: 14,
              padding: 16,
              minWidth: 280,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", marginBottom: 4, textAlign: "center" }}>
              {selected.username}
            </div>
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              onClick={() => { onViewProfile(selected.playerId); setActionPlayer(null); onClose(); }}
            >
              {t("party.profile")}
            </button>
            {selected.screen === "battle" && selected.online && onSpectate && (
              <button
                type="button"
                className="ui-btn ui-btn--secondary"
                onClick={() => { onSpectate(selected.playerId); setActionPlayer(null); }}
              >
                {t("party.spectateBattle")}
              </button>
            )}
            {!selected.inMyParty && (
              <button
                type="button"
                className="ui-btn ui-btn--primary"
                onClick={() => { handleInvite(selected.playerId); setActionPlayer(null); }}
              >
                {t("party.invite")}
              </button>
            )}
            <button type="button" className="ui-btn ui-btn--secondary" onClick={() => setActionPlayer(null)}>
              {t("common.close")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
