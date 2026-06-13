import { useState, useEffect } from "react";
import { consumeGiftRecipientPrefill } from "../utils/social/friendship";
import {
  getCurrentProfile,
  purchasePinWithGems,
  purchaseProfileIcon,
} from "../utils/localStorageAPI";
import { parsePinId } from "../entities/PinData";
import { PageBg, PageBody, PageHeader, PageToolbar } from "../components/PageChrome";
import PinsShopTab from "../components/shop/PinsShopTab";
import ProfileIconsShopTab from "../components/shop/ProfileIconsShopTab";
import GiftPacksShopTab from "../components/shop/GiftPacksShopTab";
import RewardDropQueue from "../components/RewardDropQueue";
import { rewardInfoForPin, rewardInfoForProfileIcon } from "../utils/shopRewards";
import type { RewardInfo } from "../components/RewardDropModal";
import { useI18n } from "../i18n";

type CustomTab = "pins" | "icons" | "gifts";

const TAB_DEFS: { id: CustomTab; labelKey: string; icon: string; color: string }[] = [
  { id: "pins", labelKey: "custom.tab.pins", icon: "💬", color: "#7E57C2" },
  { id: "icons", labelKey: "custom.tab.icons", icon: "🖼️", color: "#CE93D8" },
  { id: "gifts", labelKey: "custom.tab.gifts", icon: "🎁", color: "#FF80AB" },
];

export default function CustomizationPage({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [profile, setProfile] = useState(getCurrentProfile());
  const [giftPrefillId] = useState(() => consumeGiftRecipientPrefill());
  const [activeTab, setActiveTab] = useState<CustomTab>(() => (giftPrefillId ? "gifts" : "pins"));
  const [msg, setMsg] = useState("");
  const [rewardQueue, setRewardQueue] = useState<RewardInfo[] | null>(null);

  const refresh = () => setProfile(getCurrentProfile());

  useEffect(() => {
    const interval = setInterval(refresh, 500);
    return () => clearInterval(interval);
  }, []);

  const showMsg = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(""), 2200);
  };

  return (
    <PageBg variant="customization" style={{ display: "flex", flexDirection: "column", fontFamily: "var(--app-font-sans)" }}>
      <PageHeader
        onBack={onBack}
        title={t("custom.title")}
        coins={profile?.coins || 0}
        gems={profile?.gems || 0}
        power={profile?.powerPoints || 0}
      />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <PageToolbar style={{
          display: "flex", justifyContent: "center", padding: "14px 14px 10px",
          background: "linear-gradient(180deg, rgba(6,4,18,0.55), rgba(6,4,18,0.22))",
          borderBottom: "1px solid var(--bd-1)",
        }}>
          <div className="ui-tab-bar" style={{ flexWrap: "wrap", overflow: "visible" }}>
            {TAB_DEFS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`ui-tab ${active ? "is-active" : ""}`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    ...(active ? { borderColor: tab.color, boxShadow: `0 0 12px ${tab.color}55` } : {}),
                  }}
                >
                  <span>{tab.icon}</span> {t(tab.labelKey)}
                </button>
              );
            })}
          </div>
        </PageToolbar>
        <PageBody className="shop-scroll-body" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px 28px" }}>
          {activeTab === "pins" && profile && (
            <PinsShopTab
              profileGems={profile.gems}
              onBuy={(pinId) => {
                const parsed = parsePinId(pinId);
                if (parsed && !profile.unlockedBrawlers.includes(parsed.brawlerId)) {
                  showMsg(t("custom.needBrawler"));
                  return;
                }
                const r = purchasePinWithGems(pinId);
                if (r.success) {
                  refresh();
                  setRewardQueue([rewardInfoForPin(pinId)]);
                } else showMsg(r.error || t("common.error"));
              }}
            />
          )}
          {activeTab === "icons" && profile && (
            <ProfileIconsShopTab
              profile={profile}
              onBuy={(iconId) => {
                const r = purchaseProfileIcon(iconId);
                if (r.success) {
                  refresh();
                  setRewardQueue([rewardInfoForProfileIcon(iconId)]);
                } else showMsg(r.error || t("common.error"));
              }}
            />
          )}
          {activeTab === "gifts" && profile && (
            <GiftPacksShopTab profileGems={profile.gems} onSent={refresh} initialRecipientId={giftPrefillId} />
          )}
          {msg && (
            <div className="ui-glass" style={{ marginTop: 18, textAlign: "center", padding: 14, color: "var(--c-gold-3)", fontWeight: 800 }}>
              {msg}
            </div>
          )}
        </PageBody>
      </div>
      {rewardQueue && rewardQueue.length > 0 && (
        <RewardDropQueue
          key={rewardQueue.map(r => r.label).join("|")}
          rewards={rewardQueue}
          onDone={() => { setRewardQueue(null); refresh(); }}
        />
      )}
    </PageBg>
  );
}
