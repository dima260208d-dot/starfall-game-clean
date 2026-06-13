import { useEffect, useState } from "react";
import { PageBg, PageBody, PageHeader } from "../components/PageChrome";
import FriendRowCard from "../components/FriendRowCard";
import FriendshipBondBar from "../components/social/FriendshipBondBar";
import FriendshipLevelUpModal from "../components/social/FriendshipLevelUpModal";
import FriendshipTitleModal from "../components/social/FriendshipTitleModal";
import FriendshipRewardsPage from "./FriendshipRewardsPage";
import {
  addFriendByPlayerId,
  getFriendRows,
  getFriendsList,
  removeFriend,
  FRIENDS_CHANGED_EVENT,
} from "../utils/social/friends";
import {
  canCreateFriendshipTitle,
  FRIENDSHIP_CHANGED_EVENT,
  getFriendshipBond,
  getPendingFriendshipLevelUps,
  initFriendshipBondOnAdd,
  reconcileAllFriendships,
  prefillGiftRecipient,
  shiftPendingFriendshipLevelUp,
} from "../utils/social/friendship";
import { friendshipLevelFromXp } from "../data/friendshipLevels";
import { useI18n } from "../i18n";

interface Props {
  onBack: () => void;
  onViewProfile: (playerId: string) => void;
  onGiftShop?: () => void;
}

export default function FriendsPage({ onBack, onViewProfile, onGiftShop }: Props) {
  const { t } = useI18n();
  const [idInput, setIdInput] = useState("");
  const [msg, setMsg] = useState("");
  const [tick, setTick] = useState(0);
  const [actionId, setActionId] = useState<string | null>(null);
  const [levelUpNotice, setLevelUpNotice] = useState(
    () => getPendingFriendshipLevelUps()[0] ?? null,
  );
  const [titleFriendId, setTitleFriendId] = useState<string | null>(null);
  const [rewardsFriendId, setRewardsFriendId] = useState<string | null>(null);

  const refresh = () => setTick(t => t + 1);
  const rows = getFriendRows();

  useEffect(() => {
    for (const f of getFriendsList()) {
      initFriendshipBondOnAdd(f.playerId);
    }
    reconcileAllFriendships();
    refresh();
  }, []);

  useEffect(() => {
    const onChange = () => refresh();
    window.addEventListener(FRIENDS_CHANGED_EVENT, onChange);
    window.addEventListener(FRIENDSHIP_CHANGED_EVENT, onChange);
    const iv = setInterval(refresh, 8000);
    return () => {
      window.removeEventListener(FRIENDS_CHANGED_EVENT, onChange);
      window.removeEventListener(FRIENDSHIP_CHANGED_EVENT, onChange);
      clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    if (!levelUpNotice) {
      const next = shiftPendingFriendshipLevelUp();
      if (next) setLevelUpNotice(next);
    }
  }, [levelUpNotice, tick]);

  const handleAdd = () => {
    const r = addFriendByPlayerId(idInput);
    if (r.success) {
      setMsg(t("friends.added"));
      setIdInput("");
      refresh();
    } else {
      setMsg(r.error ?? t("common.error"));
    }
    setTimeout(() => setMsg(""), 2400);
  };

  const closeLevelUp = () => {
    setLevelUpNotice(null);
    const next = shiftPendingFriendshipLevelUp();
    if (next) setTimeout(() => setLevelUpNotice(next), 300);
  };

  if (rewardsFriendId) {
    return (
      <FriendshipRewardsPage
        friendPlayerId={rewardsFriendId}
        onBack={() => {
          setRewardsFriendId(null);
          refresh();
        }}
      />
    );
  }

  return (
    <PageBg variant="friends" style={{ fontFamily: "var(--app-font-sans)" }}>
      <PageHeader onBack={onBack} title={`👥 ${t("friends.title")}`} />
      <PageBody style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{
          background: "rgba(0,0,0,0.45)",
          border: "1px solid rgba(206,147,216,0.35)",
          borderRadius: 12,
          padding: 10,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.65)", marginBottom: 6 }}>
            {t("friends.addById")}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              className="ui-input"
              value={idInput}
              onChange={e => setIdInput(e.target.value)}
              placeholder={t("friends.idPlaceholder12")}
              style={{ flex: 1, fontSize: 13, fontFamily: "monospace" }}
            />
            <button type="button" className="ui-btn ui-btn--primary" onClick={handleAdd} style={{ minWidth: 88 }}>
              {t("friends.addBtn")}
            </button>
          </div>
          {msg && (
            <div style={{ marginTop: 6, fontSize: 11, color: msg === t("friends.added") ? "#69F0AE" : "#FF7043" }}>
              {msg}
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.75)" }}>
          {t("friends.listCount", { count: String(rows.length) })}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.length === 0 && (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.45)", fontSize: 13, padding: 24 }}>
              {t("friends.empty")}
            </div>
          )}
          {rows.map(row => (
            <FriendRowCard
              key={row.entry.playerId}
              username={row.entry.username}
              statusText={row.statusText}
              trophies={row.trophies}
              online={row.online}
              profileIconId={row.profileIconId}
              brawlerId={row.brawlerId}
              belowName={<FriendshipBondBar friendPlayerId={row.entry.playerId} />}
              onClick={() => setActionId(row.entry.playerId)}
            />
          ))}
        </div>
      </PageBody>

      {actionId && (
        <FriendActionModal
          playerId={actionId}
          onClose={() => setActionId(null)}
          onRemove={() => {
            removeFriend(actionId);
            setActionId(null);
            refresh();
          }}
          onProfile={() => {
            setActionId(null);
            onViewProfile(actionId);
          }}
          onGift={() => {
            prefillGiftRecipient(actionId);
            setActionId(null);
            onGiftShop?.();
          }}
          onCreateTitle={() => {
            setActionId(null);
            setTitleFriendId(actionId);
          }}
          onLevelRewards={() => {
            setActionId(null);
            setRewardsFriendId(actionId);
          }}
        />
      )}

      {levelUpNotice && (
        <FriendshipLevelUpModal notice={levelUpNotice} onClose={closeLevelUp} />
      )}

      {titleFriendId && (
        <FriendshipTitleModal
          friendPlayerId={titleFriendId}
          friendUsername={rows.find(r => r.entry.playerId === titleFriendId)?.entry.username ?? ""}
          onClose={() => setTitleFriendId(null)}
          onDone={() => { setTitleFriendId(null); refresh(); }}
        />
      )}
    </PageBg>
  );
}

function FriendActionModal({
  playerId,
  onClose,
  onRemove,
  onProfile,
  onGift,
  onCreateTitle,
  onLevelRewards,
}: {
  playerId: string;
  onClose: () => void;
  onRemove: () => void;
  onProfile: () => void;
  onGift: () => void;
  onCreateTitle: () => void;
  onLevelRewards: () => void;
}) {
  const { t } = useI18n();
  const bond = getFriendshipBond(playerId);
  const level = friendshipLevelFromXp(bond.xp);
  const showTitleBtn = canCreateFriendshipTitle(playerId);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "linear-gradient(160deg, rgba(25,12,55,0.96), rgba(8,4,24,0.98))",
          border: "1px solid rgba(206,147,216,0.5)",
          borderRadius: 14,
          padding: 16,
          minWidth: 260,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 900, color: "#FFD740", textAlign: "center", marginBottom: 4 }}>
          {t("friendship.levelShort", { level: String(level) })}
        </div>
        <button type="button" className="ui-btn ui-btn--primary" onClick={onProfile}>
          {t("friends.viewProfile")}
        </button>
        <button type="button" className="ui-btn ui-btn--primary" onClick={onGift}>
          🎁 {t("friendship.giftBtn")}
        </button>
        <button type="button" className="ui-btn ui-btn--primary" onClick={onLevelRewards}>
          🏆 {t("friendship.rewardsBtn")}
        </button>
        {showTitleBtn && (
          <button type="button" className="ui-btn ui-btn--primary" onClick={onCreateTitle} style={{ borderColor: "#FFD740" }}>
            ✨ {t("friendship.createTitleBtn")}
          </button>
        )}
        <button type="button" className="ui-btn ui-btn--danger" onClick={onRemove}>
          {t("friends.remove")}
        </button>
        <button type="button" className="ui-btn ui-btn--secondary" onClick={onClose}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
