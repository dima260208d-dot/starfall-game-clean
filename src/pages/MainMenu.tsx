import { useState, useEffect, useRef, useCallback, forwardRef, memo, type CSSProperties, type Ref } from "react";
import {
  getCurrentProfile, clashPassXpForLevel, MAX_CLASHPASS_LEVEL,
  canClaimDailyLadder, getOrRollDailyQuests, getQuestPool,
  getUnclaimedTrophyRoadCount, getUnclaimedClashPassCount, getUnopenedChestCount,
  getClaimableQuestCount, getActiveQuestCount,
  collectAutoClaimableQuests,
  getBrawlerTrophies, getBrawlerStarsCount,
  getPendingBrawlerStarPicks,
  getUnclaimedBrawlerMasteryCount,
  type UserProfile,
} from "../utils/localStorageAPI";
import { consumeMenuDailyWinsFx } from "../utils/dailyWinsMenuFx";
import DailyWinsStrip from "../components/DailyWinsStrip";
import RewardDropQueue from "../components/RewardDropQueue";
import type { RewardInfo } from "../components/RewardDropModal";
import { BRAWLERS, getBrawlerById } from "../entities/BrawlerData";
import { getProfileIconImage } from "../utils/profileIconUtils";
import { resolveUsernameStyle, resolveUsernameAccent } from "../utils/usernameDisplay";
import { ensureDevPowerUpToken, isStarGuardianActive } from "../utils/subscription";
import { CoinIcon, GemIcon, PowerIcon, TrophyIcon } from "../components/GameIcons";
import TrophyRoadMenuButton from "../components/TrophyRoadMenuButton";
import {
  RANKED_LEAGUES,
  getProfileRankedCups,
  getProfileRankedPeakCups,
  rankedLeagueIconUrl,
  rankedStandingFromTotalCups,
} from "../utils/rankedProgress";
import TrophyFlyBurst from "../components/TrophyFlyBurst";
import PassXpFlyBurst from "../components/PassXpFlyBurst";
import MasteryXpFlyBurst from "../components/MasteryXpFlyBurst";
import RankedCupFlyBurst from "../components/RankedCupFlyBurst";
import ProPassTokenFlyBurst from "../components/ProPassTokenFlyBurst";
import { consumeMenuTrophyFx, type PendingMenuTrophyFx } from "../utils/trophyMenuFx";
import { consumeMenuPassXpFx, type PendingMenuPassXpFx } from "../utils/passMenuFx";
import { consumeMenuMasteryXpFx, type PendingMenuMasteryXpFx } from "../utils/masteryMenuFx";
import { consumeMenuRankedCupFx, type PendingMenuRankedCupFx } from "../utils/rankedCupMenuFx";
import { consumeMenuProPassTokenFx, type PendingMenuProPassTokenFx } from "../utils/proPassTokenMenuFx";
import { getTrophyRoadSegment } from "../utils/trophyRoadProgress";
import { getModeInfo, type ModeInfo } from "../data/modes";
import ModeIconImg from "../components/ModeIconImg";
import ModeInfoModal from "../components/ModeInfoModal";
import DailyRewardModal from "../components/DailyRewardModal";
import QuestsModal from "../components/QuestsModal";
import BrawlerRankRewardsModal from "../components/BrawlerRankRewardsModal";
import BrawlerRankBar from "../components/BrawlerRankBar";
import RankedLeagueBar from "../components/RankedLeagueBar";
import { getUnclaimedProStarPassCount } from "../utils/proStarPass";
import { MENU_RANK_BADGE_SCALE } from "../utils/brawlerRankUI";
import BrawlerViewer3D from "../components/BrawlerViewer3D";
import PetSvg from "../components/PetSvg";
import { getPetById } from "../entities/PetData";
import { getProfileByPlayerId } from "../utils/playerGiftSend";
import HamburgerDrawer from "../components/HamburgerDrawer";
import { isAdminUnlocked } from "../utils/mapEditorAPI";
import {
  getTechBreakBattleBlockNotice,
  isBattleEntryBlockedByTechBreak,
  subscribeTechBreakChanges,
} from "../utils/techBreak";
import { ADMIN_SCHEDULE_CHANGED } from "../utils/adminScheduler";
import {
  hasAnyUnseenMap,
  MAP_SEEN_CHANGED_EVENT,
} from "../utils/mapSchedule";
import GiftClaimModal from "../components/GiftClaimModal";
import { getPendingGifts } from "../utils/gifts";
import { getUnreadClubChatCount, CLUB_CHAT_CHANGED_EVENT } from "../utils/clubs";
import { getUnreadNewsCount } from "../utils/news";
import { getUnreadInboxCount } from "../utils/messages";
import { sendFeedContestTestGiftIfNeeded } from "../utils/battleFeedContest";
import { getStarFeatMenuBadge } from "../utils/starFeatProgress";
import { syncStarFeatPeaks } from "../utils/localStorageAPI";
import { getCurrentUsername } from "../utils/localStorageAPI";
import StarGuardianBadge from "../components/StarGuardianBadge";
import { useI18n, localizedModeInfo, brawlerName } from "../i18n";
import WinStreakFlame from "../components/WinStreakFlame";
import { getBrawlerWinStreak, isWinStreakVisible } from "../utils/winStreak";
import AstralFloatingIcon from "../components/AstralFloatingIcon";
import AstralMenuPopup from "../components/AstralMenuPopup";
import { isAnyDealsGiftAvailable, isShopDealsNew } from "../utils/shopDailyGifts";
import {
  canClaimNewcomerGift,
  ensureNewcomerGiftPreview,
  isNewcomerGiftsActive,
} from "../utils/newcomerGifts";
import NewcomerGiftsModal from "../components/NewcomerGiftsModal";
import { bumpDealsPreviewIfNeeded } from "../utils/dailyDealsSeen";
import { getBossRaidCurrentLevel } from "../utils/bossRaidProgress";
import BossRaidPendingRewardsGate from "../components/BossRaidPendingRewardsGate";
import StarGuardianMainDailyGate from "../components/StarGuardianMainDailyGate";
import GlowingStar from "../components/GlowingStar";
import PartySidePanel from "../components/menu/PartySidePanel";
import PartyChatPanel from "../components/menu/PartyChatPanel";
import { getPartyChatUnreadCount, PARTY_CHAT_READ_EVENT } from "../utils/social/partyChat";
import PartyInviteModal from "../components/menu/PartyInviteModal";
import TeamBar from "../components/menu/TeamBar";
import TeammateActionMenu from "../components/menu/TeammateActionMenu";
import PartyBrawlerPickerModal from "../components/menu/PartyBrawlerPickerModal";
import PartyBrawlerSuggestBubble from "../components/menu/PartyBrawlerSuggestBubble";
import PartyBrawlerSuggestAcceptModal from "../components/menu/PartyBrawlerSuggestAcceptModal";
import {
  PARTY_CHANGED_EVENT,
  PARTY_INVITE_DECLINED_EVENT,
  amPartyLeader,
  acceptPartyBrawlerSuggestion,
  cancelOutgoingInvite,
  clearPartyBrawlerSuggestionIfRecipientChangedBrawler,
  declinePartyBrawlerSuggestion,
  getPartyBrawlerSuggestion,
  getOutgoingInvite,
  getMyPartyCode,
  getTeammatesForMenu,
  getPartyMemberCount,
  getMaxPartySizeForMenu,
  getPartyPlayReadyState,
  isPartyMemberPlayReady,
  isPartyPlayReadyActive,
  amIPartyPlayReady,
  allPartyMembersPlayReady,
  pressPartyPlayReady,
  cancelMyPartyPlayReady,
  clearPartyPlayReady,
  tickPartyPlayReadyExpired,
  getMyPartyRoom,
  kickPartyMember,
  maybeOfferDemoIncomingBrawlerSuggest,
  sendPartyBrawlerSuggestion,
  type PartySlot,
} from "../utils/social/party";
import {
  canInviteToParty,
  memberSlotsForMaxParty,
  partyModeFromProfile,
} from "../utils/social/partyConfig";
import {
  isLeftPartySlot,
  teammatesOnLeftLine,
  teammatesOnRightLine,
  partyStatsStaggerOffset,
} from "../utils/social/partyMenuFormation";
import { setMyPresence, PRESENCE_CHANGED_EVENT } from "../utils/social/presence";
import {
  getMenuActivityLabelForPlayerId,
  setMyMenuActivity,
} from "../utils/social/presence";
import { cyclePartyTestFriendsMenuActivity } from "../utils/social/party";
import { ensureTestFriendsSeeded, refreshTestFriendsPresence } from "../utils/social/seedTestFriends";
import type { PartyTeammateView, OutgoingPartyInvite, PartyBrawlerSuggestion } from "../utils/social/party";
import { canPartyObserveBattle, getPartySpectateTarget } from "../utils/social/partySpectate";
import { normalizePlayerIdQuery } from "../utils/playerId";

function menuBottomInset(compact: boolean): number {
  return compact ? 8 : 16;
}

function menuBottomBtnH(compact: boolean): number {
  return compact ? 44 : 76;
}

const MODE_MENU_ICON_SHRINK = new Set(["starstrike", "showdown", "megashowdown"]);

function menuModeIconSize(modeId: string, compact: boolean): number {
  const base = compact ? 80 : 112;
  return MODE_MENU_ICON_SHRINK.has(modeId) ? Math.round(base * 0.9) : base;
}

interface MainMenuProps {
  onPlay: () => void;
  /** Выбранный в ленте босс: над «Играть» показываем имя и уровень вызова */
  lobbyBossRaidBossId?: string | null;
  onCollection: () => void;
  onShop: () => void;
  onCustomization: () => void;
  onSettings: () => void;
  onProfile: () => void;
  onBattleFeed: () => void;
  onClashPass: () => void;
  onTrophyRoad: () => void;
  onRanked: () => void;
  onProStarPass: () => void;
  onChests: () => void;
  onPets: () => void;
  onStarFeats: () => void;
  onModeSelect: () => void;
  onBrawlerSelect: () => void;
  onMastery: (brawlerId: string) => void;
  onComic: (brawlerId: string) => void;
  onLogout: () => void;
  onRegister?: () => void;
  onAccounts?: () => void;
  onMapEditor: () => void;
  onNews: () => void;
  onMessages: () => void;
  onClubs: () => void;
  onFriends: () => void;
  onBattleHistory?: () => void;
  onRecords?: () => void;
  onViewPlayerProfile: (playerId: string) => void;
  onAdmin: () => void;
  onStarGuardianRewards: () => void;
  onSpectate: (playerId: string) => void;
}

function menuProfileSignature(profile: UserProfile | null): string {
  if (!profile) return "";
  try {
    return JSON.stringify(profile);
  } catch {
    return "";
  }
}

/** Сигнатура состава команды — меняется только при смене слотов/бойцов, не при активности. */
function partyMenuLayoutSignature(): string {
  const room = getMyPartyRoom();
  if (!room) return "";
  const invite = getOutgoingInvite();
  const ready = getPartyPlayReadyState();
  const memberSig = [...room.members]
    .sort((a, b) => a.playerId.localeCompare(b.playerId))
    .map(m => `${normalizePlayerIdQuery(m.playerId)}:${m.brawlerId}:${m.slot}`)
    .join("|");
  return [
    room.code,
    normalizePlayerIdQuery(room.leaderPlayerId),
    memberSig,
    invite?.side ?? "",
    ready?.deadlineAt ?? 0,
  ].join(";");
}

/** Стабильный 3D-превью в командном меню — не пересоздаёт WebGL при смене плашек активности. */
const MenuPartyBrawler3D = memo(function MenuPartyBrawler3D({
  brawlerId,
  color,
  size,
  paused,
  selfCenter,
}: {
  brawlerId: string;
  color: string;
  size: number;
  paused?: boolean;
  selfCenter?: boolean;
}) {
  return (
    <BrawlerViewer3D
      brawlerId={brawlerId}
      color={color}
      size={size}
      paused={paused}
      efficientPreview={!selfCenter}
      pixelRatioCap={selfCenter ? 1.5 : 1.25}
    />
  );
}, (prev, next) =>
  prev.brawlerId === next.brawlerId
  && prev.color === next.color
  && prev.size === next.size
  && prev.paused === next.paused
  && prev.selfCenter === next.selfCenter
);

export default function MainMenu(props: MainMenuProps) {
  const { t } = useI18n();
  const {
    onPlay, lobbyBossRaidBossId = null, onCollection, onShop, onCustomization, onSettings,
    onProfile, onBattleFeed, onClashPass, onTrophyRoad, onRanked, onProStarPass, onChests, onPets, onStarFeats,
    onModeSelect, onBrawlerSelect, onMastery, onComic, onLogout, onRegister, onAccounts, onMapEditor, onNews,
    onMessages: openMessages, onClubs, onFriends, onViewPlayerProfile, onAdmin,
    onStarGuardianRewards, onBattleHistory, onRecords, onSpectate,
  } = props;
  useState(() => {
    bumpDealsPreviewIfNeeded();
    return 0;
  });
  const [hasGifts, setHasGifts] = useState(() => getPendingGifts().length > 0);
  const [unreadNews, setUnreadNews] = useState(() =>
    getUnreadNewsCount(getCurrentUsername()),
  );
  const [unreadMessages, setUnreadMessages] = useState(() => getUnreadInboxCount());
  const [unreadClub, setUnreadClub] = useState(() => getUnreadClubChatCount());

  const [profile, setProfile] = useState(getCurrentProfile());
  const [notif, setNotif] = useState<string | null>(null);
  const [showDaily, setShowDaily] = useState(false);
  const [showNewcomerGifts, setShowNewcomerGifts] = useState(false);
  const [showQuests, setShowQuests] = useState(false);
  const [showModeInfo, setShowModeInfo] = useState(false);
  const [rankModalBrawlerId, setRankModalBrawlerId] = useState<string | null>(null);
  const playBtnRef = useRef<HTMLButtonElement>(null);
  const trophyRoadBarRef = useRef<HTMLDivElement>(null);
  const starPassBtnRef = useRef<HTMLButtonElement>(null);
  const rankedBtnRef = useRef<HTMLButtonElement>(null);
  const rankedBarRef = useRef<HTMLDivElement>(null);
  const masteryBtnRef = useRef<HTMLButtonElement>(null);
  const [menuTrophyFx, setMenuTrophyFx] = useState<PendingMenuTrophyFx | null>(null);
  const [menuPassXpFx, setMenuPassXpFx] = useState<PendingMenuPassXpFx | null>(null);
  const [menuMasteryXpFx, setMenuMasteryXpFx] = useState<PendingMenuMasteryXpFx | null>(null);
  const [menuRankedCupFx, setMenuRankedCupFx] = useState<PendingMenuRankedCupFx | null>(null);
  const [menuProPassTokenFx, setMenuProPassTokenFx] = useState<PendingMenuProPassTokenFx | null>(null);
  const [passFxPhase, setPassFxPhase] = useState<"idle" | "fly">("idle");
  const [masteryFxPhase, setMasteryFxPhase] = useState<"idle" | "fly">("idle");
  const [rankedFxPhase, setRankedFxPhase] = useState<"idle" | "pile" | "fly">("idle");
  const [proPassFxPhase, setProPassFxPhase] = useState<"idle" | "fly">("idle");
  const [hasModeMapNews, setHasModeMapNews] = useState(() => hasAnyUnseenMap());
  const profileMenuSigRef = useRef("");
  const [menuFxPhase, setMenuFxPhase] = useState<"idle" | "pile" | "fly">("idle");

  const MENU_TROPHY_PILE_SIZE = 70;
  const MENU_TROPHY_FLY_SIZE = 100;
  const MENU_PASS_XP_FLY_SIZE = 72;
  const MENU_MASTERY_XP_FLY_SIZE = 68;
  const MENU_RANKED_CUP_FLY_SIZE = 72;
  const MENU_PRO_PASS_TOKEN_FLY_SIZE = 68;
  const MENU_RANKED_CUP_PILE_SIZE = 56;

  const menuTrophyFxRef = useRef<PendingMenuTrophyFx | null>(null);
  menuTrophyFxRef.current = menuTrophyFx;

  const handleTrophyFlyArrive = useCallback((i: number) => {
    const fx = menuTrophyFxRef.current;
    if (!fx) return;
    const t = fx.trophiesEnd - fx.count + i + 1;
    setRoadDisplayTrophies(t);
    setRoadBarFill(getTrophyRoadSegment(t).fill);
  }, []);

  const handleTrophyFlyComplete = useCallback(() => {
    setMenuFxPhase("idle");
    setMenuTrophyFx(null);
    setRoadDisplayTrophies(null);
    setRoadBarFill(undefined);
  }, []);

  const handlePassXpFlyComplete = useCallback(() => {
    setPassFxPhase("idle");
    setMenuPassXpFx(null);
    setProfile(getCurrentProfile());
  }, []);

  const handleMasteryXpFlyComplete = useCallback(() => {
    setMasteryFxPhase("idle");
    setMenuMasteryXpFx(null);
    setProfile(getCurrentProfile());
  }, []);

  const menuRankedCupFxRef = useRef<PendingMenuRankedCupFx | null>(null);
  menuRankedCupFxRef.current = menuRankedCupFx;

  const handleRankedCupFlyArrive = useCallback((i: number) => {
    const fx = menuRankedCupFxRef.current;
    if (!fx) return;
    setRankedDisplayCups(fx.cupsEnd - fx.count + i + 1);
  }, []);

  const handleRankedCupFlyComplete = useCallback(() => {
    setRankedFxPhase("idle");
    setMenuRankedCupFx(null);
    setRankedDisplayCups(null);
    setProfile(getCurrentProfile());
  }, []);

  const handleProPassTokenFlyComplete = useCallback(() => {
    setProPassFxPhase("idle");
    setMenuProPassTokenFx(null);
    setProfile(getCurrentProfile());
  }, []);

  const [dailyWinsReward, setDailyWinsReward] = useState<RewardInfo | null>(null);
  const [questRewardQueue, setQuestRewardQueue] = useState<RewardInfo[] | null>(null);
  const [sgDailyPaused, setSgDailyPaused] = useState(true);
  const [roadDisplayTrophies, setRoadDisplayTrophies] = useState<number | null>(null);
  const [roadBarFill, setRoadBarFill] = useState<number | undefined>(undefined);
  const [rankedDisplayCups, setRankedDisplayCups] = useState<number | null>(null);
  const [showHamburger, setShowHamburger] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    typeof document !== "undefined" && !!document.fullscreenElement,
  );
  const [pseudoFullscreen, setPseudoFullscreen] = useState<boolean>(false);
  const [vw, setVw] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1280);
  const [vh, setVh] = useState<number>(typeof window !== "undefined" ? window.innerHeight : 720);
  // Legacy compact layout: narrow/short windows only — same as before mobile engine.
  const compact = vw < 900 || vh < 500;
  const artBase = (import.meta as any).env?.BASE_URL ?? "/";
  const [partyPanel, setPartyPanel] = useState<PartySlot | null>(null);
  const [showPartyChat, setShowPartyChat] = useState(false);
  const [partyChatBadgeTick, setPartyChatBadgeTick] = useState(0);
  const [partyActivityTick, setPartyActivityTick] = useState(0);
  const [partyReadyTick, setPartyReadyTick] = useState(0);
  const [partyTick, setPartyTick] = useState(0);
  const partyRefresh = () => setPartyTick(t => t + 1);
  const partyLaunchPendingRef = useRef(false);
  const partyLayoutSigRef = useRef("");
  const [teammateMenu, setTeammateMenu] = useState<{
    mate: PartyTeammateView;
    anchor: DOMRect;
    side: "left" | "right";
  } | null>(null);
  const [brawlerPickTarget, setBrawlerPickTarget] = useState<PartyTeammateView | null>(null);
  const [showSuggestAccept, setShowSuggestAccept] = useState(false);
  const prevSelectedBrawlerRef = useRef<string | null>(null);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    const onResize = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // True when the page is allowed to use the real Fullscreen API. Inside
  // sandboxed iframes (e.g. the Replit canvas preview) this is false, so we
  // fall back to a CSS-only "pseudo fullscreen" that fills the embed instead
  // of crashing.
  const canUseRealFullscreen =
    typeof document !== "undefined" &&
    (document.fullscreenEnabled ?? false) &&
    typeof document.documentElement?.requestFullscreen === "function";

  const toggleFullscreen = async () => {
    if (!canUseRealFullscreen) {
      setPseudoFullscreen((v) => !v);
      return;
    }
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        // Orientation lock only works while truly fullscreen, and only on
        // mobile. Desktop/iframe contexts reject silently.
        const so = (screen as any).orientation;
        if (so && typeof so.lock === "function") {
          try { await so.lock("landscape"); } catch { /* unsupported */ }
        }
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Permission denied or sandboxed — degrade to pseudo fullscreen.
      setPseudoFullscreen((v) => !v);
    }
  };

  useEffect(() => {
    sendFeedContestTestGiftIfNeeded();
  }, []);

  useEffect(() => {
    profileMenuSigRef.current = menuProfileSignature(getCurrentProfile());

    const interval = setInterval(() => {
      const nextProfile = getCurrentProfile();
      const sig = menuProfileSignature(nextProfile);
      if (sig !== profileMenuSigRef.current) {
        profileMenuSigRef.current = sig;
        setProfile(nextProfile);
      }

      setUnreadMessages(prev => {
        const next = getUnreadInboxCount();
        return next === prev ? prev : next;
      });
      setUnreadNews(prev => {
        const next = getUnreadNewsCount(getCurrentUsername());
        return next === prev ? prev : next;
      });
      setHasGifts(prev => {
        const next = getPendingGifts().length > 0;
        return next === prev ? prev : next;
      });
      setUnreadClub(prev => {
        const next = getUnreadClubChatCount();
        return next === prev ? prev : next;
      });
      setHasModeMapNews(prev => {
        const next = hasAnyUnseenMap();
        return prev === next ? prev : next;
      });
    }, 500);
    const onClubChat = () => {
      setUnreadClub(getUnreadClubChatCount());
    };
    window.addEventListener(CLUB_CHAT_CHANGED_EVENT, onClubChat);
    return () => {
      clearInterval(interval);
      window.removeEventListener(CLUB_CHAT_CHANGED_EVENT, onClubChat);
    };
  }, []);

  useEffect(() => {
    const onMapSeen = () => setHasModeMapNews(hasAnyUnseenMap());
    window.addEventListener(MAP_SEEN_CHANGED_EVENT, onMapSeen);
    return () => window.removeEventListener(MAP_SEEN_CHANGED_EVENT, onMapSeen);
  }, []);

  // Ensure today's quests are rolled the first time the lobby opens each day.
  useEffect(() => { getOrRollDailyQuests(); }, []);

  useEffect(() => {
    const rewards = collectAutoClaimableQuests();
    if (rewards.length > 0) {
      setQuestRewardQueue(rewards);
      setProfile(getCurrentProfile());
    }
  }, []);

  useEffect(() => {
    ensureNewcomerGiftPreview();
    ensureDevPowerUpToken();
    setProfile(getCurrentProfile());
  }, []);

  useEffect(() => {
    const dw = consumeMenuDailyWinsFx();
    if (dw) setDailyWinsReward(dw);
    else setSgDailyPaused(false);

    const pendingTrophy = consumeMenuTrophyFx();
    if (pendingTrophy) {
      const start = pendingTrophy.trophiesEnd - pendingTrophy.count;
      setMenuTrophyFx(pendingTrophy);
      setRoadDisplayTrophies(start);
      setRoadBarFill(getTrophyRoadSegment(start).fill);
      setMenuFxPhase("pile");
      window.setTimeout(() => setMenuFxPhase("fly"), 1500);
    }

    const pendingPass = consumeMenuPassXpFx();
    if (pendingPass) {
      setMenuPassXpFx(pendingPass);
      setPassFxPhase("fly");
    }

    const pendingMastery = consumeMenuMasteryXpFx();
    if (pendingMastery) {
      setMenuMasteryXpFx(pendingMastery);
      setMasteryFxPhase("fly");
    }

    const pendingRankedCup = consumeMenuRankedCupFx();
    if (pendingRankedCup) {
      const start = pendingRankedCup.cupsEnd - pendingRankedCup.count;
      setMenuRankedCupFx(pendingRankedCup);
      setRankedDisplayCups(start);
      setRankedFxPhase("pile");
      window.setTimeout(() => setRankedFxPhase("fly"), 1500);
    }

    const pendingProPass = consumeMenuProPassTokenFx();
    if (pendingProPass) {
      setMenuProPassTokenFx(pendingProPass);
      setProPassFxPhase("fly");
    }
  }, []);

  useEffect(() => {
    setMyPresence("menu");
    ensureTestFriendsSeeded();
    partyLayoutSigRef.current = partyMenuLayoutSignature();
    const onSocial = () => {
      const layoutSig = partyMenuLayoutSignature();
      if (layoutSig !== partyLayoutSigRef.current) {
        partyLayoutSigRef.current = layoutSig;
        partyRefresh();
      } else if (getPartyMemberCount() >= 2) {
        setPartyActivityTick(t => t + 1);
      }
      const nextProfile = getCurrentProfile();
      const sig = menuProfileSignature(nextProfile);
      if (sig !== profileMenuSigRef.current) {
        profileMenuSigRef.current = sig;
        setProfile(nextProfile);
      }
      if (getMyPartyCode()) {
        window.setTimeout(() => maybeOfferDemoIncomingBrawlerSuggest(), 600);
      }
    };
    const onDeclined = (e: Event) => {
      const name = (e as CustomEvent<{ username?: string }>).detail?.username ?? t("common.player");
      setNotif(t("nav.partyDeclined", { name }));
      setTimeout(() => setNotif(null), 2800);
      partyRefresh();
    };
    window.addEventListener(PARTY_CHANGED_EVENT, onSocial);
    window.addEventListener(PRESENCE_CHANGED_EVENT, onSocial);
    window.addEventListener(PARTY_INVITE_DECLINED_EVENT, onDeclined);
    const iv = setInterval(() => {
      refreshTestFriendsPresence();
      onSocial();
    }, 6000);
    const demoSuggestTimer = window.setTimeout(() => {
      maybeOfferDemoIncomingBrawlerSuggest();
      const layoutSig = partyMenuLayoutSignature();
      if (layoutSig !== partyLayoutSigRef.current) {
        partyLayoutSigRef.current = layoutSig;
        partyRefresh();
      } else if (getPartyMemberCount() >= 2) {
        setPartyActivityTick(t => t + 1);
      }
    }, 4500);
    return () => {
      window.removeEventListener(PARTY_CHANGED_EVENT, onSocial);
      window.removeEventListener(PRESENCE_CHANGED_EVENT, onSocial);
      window.removeEventListener(PARTY_INVITE_DECLINED_EVENT, onDeclined);
      clearInterval(iv);
      window.clearTimeout(demoSuggestTimer);
    };
  }, []);

  useEffect(() => {
    const bumpChatBadge = () => setPartyChatBadgeTick(t => t + 1);
    window.addEventListener(PARTY_CHANGED_EVENT, bumpChatBadge);
    window.addEventListener(PARTY_CHAT_READ_EVENT, bumpChatBadge);
    return () => {
      window.removeEventListener(PARTY_CHANGED_EVENT, bumpChatBadge);
      window.removeEventListener(PARTY_CHAT_READ_EVENT, bumpChatBadge);
    };
  }, []);

  useEffect(() => {
    if (getPartyMemberCount() <= 1) return;
    setMyMenuActivity(showQuests ? "quests" : null);
  }, [showQuests, partyTick]);

  useEffect(() => {
    if (getPartyMemberCount() < 2) return;
    let round = 0;
    const tickDemo = () => {
      if (getPartyMemberCount() < 2) return;
      if (cyclePartyTestFriendsMenuActivity(round)) {
        round += 1;
        setPartyActivityTick(t => t + 1);
      }
    };
    const demoIv = window.setInterval(tickDemo, 5000);
    return () => window.clearInterval(demoIv);
  }, []);

  useEffect(() => {
    if (getPartyMemberCount() <= 1 || !amIPartyPlayReady()) return;
    setShowQuests(false);
    setShowDaily(false);
    setShowNewcomerGifts(false);
    setShowModeInfo(false);
    setRankModalBrawlerId(null);
    setShowHamburger(false);
    setPartyPanel(null);
    setTeammateMenu(null);
    setBrawlerPickTarget(null);
    setShowSuggestAccept(false);
  }, [partyTick]);

  useEffect(() => {
    const cur = profile?.selectedBrawlerId ?? null;
    if (prevSelectedBrawlerRef.current && cur && prevSelectedBrawlerRef.current !== cur) {
      clearPartyBrawlerSuggestionIfRecipientChangedBrawler(cur);
      partyRefresh();
    }
    prevSelectedBrawlerRef.current = cur;
  }, [profile?.selectedBrawlerId]);

  const showTechBreakBlockNotice = useCallback(() => {
    const notice = getTechBreakBattleBlockNotice()
      ?? "Тех перерыв скоро — бой недоступен";
    setNotif(notice);
    window.setTimeout(() => setNotif(null), 5000);
  }, []);

  const tryStartBattle = useCallback(() => {
    if (isBattleEntryBlockedByTechBreak()) {
      showTechBreakBlockNotice();
      return false;
    }
    onPlay();
    return true;
  }, [onPlay, showTechBreakBlockNotice]);

  useEffect(() => {
    if (!profile || getPartyMemberCount() <= 1) {
      partyLaunchPendingRef.current = false;
      return;
    }
    if (!isPartyPlayReadyActive()) {
      partyLaunchPendingRef.current = false;
      return;
    }
    const iv = window.setInterval(() => {
      tickPartyPlayReadyExpired();
      setPartyReadyTick(t => t + 1);
    }, 1000);
    return () => window.clearInterval(iv);
  }, [profile, partyTick]);

  useEffect(() => {
    if (!profile || getPartyMemberCount() <= 1) return;
    const room = getMyPartyRoom();
    if (!room?.playReady || !allPartyMembersPlayReady(room)) return;
    if (partyLaunchPendingRef.current) return;
    partyLaunchPendingRef.current = true;
    clearPartyPlayReady();
    if (!tryStartBattle()) {
      partyLaunchPendingRef.current = false;
    }
  }, [profile, partyTick, tryStartBattle]);

  if (!profile) return null;

  void partyTick;
  void partyChatBadgeTick;
  void partyActivityTick;
  void partyReadyTick;
  const outgoingInvite = getOutgoingInvite();
  const partyBrawlerSuggest = getPartyBrawlerSuggestion();
  const teammates = getTeammatesForMenu();
  const maxParty = getMaxPartySizeForMenu();
  const partyCount = getPartyMemberCount();
  const inParty = partyCount > 1;
  const partyChatUnread = inParty ? getPartyChatUnreadCount() : 0;
  const partyPlayReady = getPartyPlayReadyState();
  const partyReadyActive = inParty && partyPlayReady !== null;
  const iAmPartyReady = amIPartyPlayReady();
  const partyMenuLocked = inParty && iAmPartyReady;
  const partyReadySecondsLeft = partyPlayReady
    ? Math.max(0, Math.ceil((partyPlayReady.deadlineAt - Date.now()) / 1000))
    : 0;
  const partyObserveTarget = canPartyObserveBattle() ? getPartySpectateTarget() : null;
  const showPartyObserve = !!partyObserveTarget && !partyReadyActive;
  const handleMenuPlayClick = () => {
    if (isBattleEntryBlockedByTechBreak()) {
      showTechBreakBlockNotice();
      return;
    }
    if (!inParty) {
      tryStartBattle();
      return;
    }
    if (iAmPartyReady) {
      cancelMyPartyPlayReady();
      partyRefresh();
      return;
    }
    setMyMenuActivity(null);
    pressPartyPlayReady();
    partyRefresh();
  };
  const handleObserveClick = () => {
    if (partyObserveTarget) onSpectate(partyObserveTarget);
  };
  const modeSel = partyModeFromProfile(profile);
  const canInvite = canInviteToParty(partyCount, modeSel);
  const allowedSlots = memberSlotsForMaxParty(maxParty);
  const mateBySlot = new Map(teammates.map(t => [t.slot, t]));
  const emptyInviteSlots = canInvite
    ? allowedSlots.filter(s => !mateBySlot.has(s))
    : [];
  const leftLine = teammatesOnLeftLine(teammates);
  const rightLine = teammatesOnRightLine(teammates);
  const staggerPartyStats = partyCount >= 4;
  let partyStatsStaggerIdx = 0;
  const leftEmptySlots = emptyInviteSlots.filter(isLeftPartySlot);
  const rightEmptySlots = emptyInviteSlots.filter(s => !isLeftPartySlot(s));
  const myPlayerId = profile.playerId ? normalizePlayerIdQuery(profile.playerId) : "";
  const suggestForPlayer = (playerId: string) => {
    if (!partyBrawlerSuggest || !playerId) return null;
    if (normalizePlayerIdQuery(partyBrawlerSuggest.fromPlayerId) !== normalizePlayerIdQuery(playerId)) {
      return null;
    }
    return partyBrawlerSuggest;
  };
  const canAnswerPartySuggest = !!partyBrawlerSuggest
    && normalizePlayerIdQuery(partyBrawlerSuggest.toPlayerId) === myPlayerId;

  const dailyWins = profile.dailyWins!;

  const mode = localizedModeInfo(getModeInfo(profile.selectedMode));
  const rankedStanding = rankedStandingFromTotalCups(getProfileRankedCups(profile));
  const rankedLeagueDef = RANKED_LEAGUES[rankedStanding.leagueIndex];
  const showRankedLobbyLine = profile.selectedMode === "ranked" && rankedLeagueDef;
  const showRankedBars = profile.selectedMode === "ranked";
  const rankedCups = rankedDisplayCups ?? getProfileRankedCups(profile);
  const rankedPeakCups = getProfileRankedPeakCups(profile);
  const proPassBadge = getUnclaimedProStarPassCount(profile);
  const brawler = BRAWLERS.find(b => b.id === profile.selectedBrawlerId) || BRAWLERS[0];
  const masteryBadge = getUnclaimedBrawlerMasteryCount(profile, brawler.id);
  const brawlerLevel = profile.brawlerLevels[brawler.id] || 1;
  const brawlerTrophies = getBrawlerTrophies(profile, brawler.id);
  const brawlerWinStreak = getBrawlerWinStreak(profile, brawler.id);
  const brawlerStarCount = getBrawlerStarsCount(profile, brawler.id);
  const base = (import.meta as any).env?.BASE_URL ?? "/";
  const profileIconSrc = getProfileIconImage(profile.profileIconId, base);
  const usernameAccent = resolveUsernameAccent(profile.usernameColor, isStarGuardianActive());
  const usernameStyle = resolveUsernameStyle(profile.usernameColor, isStarGuardianActive());
  const passLevel = profile.clashPassLevel;
  const passNeed = clashPassXpForLevel(passLevel);
  const passPct = passLevel >= MAX_CLASHPASS_LEVEL
    ? 100
    : Math.min(100, Math.round((profile.xp / passNeed) * 100));
  const canClaimDaily = canClaimDailyLadder(profile);
  const questPool = getQuestPool();
  const claimableQuestCount = getClaimableQuestCount({ ...profile, questPool: questPool ?? profile.questPool });
  const activeQuestCount = getActiveQuestCount({ ...profile, questPool: questPool ?? profile.questPool });
  const hasUnclaimedQuest = claimableQuestCount > 0;
  const trophyRoadBadge = getUnclaimedTrophyRoadCount(profile);
  const clashPassBadge = getUnclaimedClashPassCount(profile);
  const chestsBadge = getUnopenedChestCount(profile);
  const questsBadge = claimableQuestCount;
  const newBrawlerBadge = (profile.newBrawlers || []).length;
  const pendingStarBadge = getPendingBrawlerStarPicks(profile).length;
  const collectionBadge = newBrawlerBadge + pendingStarBadge;
  const newPetBadge = (profile.newPets || []).length;
  const starFeatBadge = getStarFeatMenuBadge(profile);
  const shopGiftBadge = isAnyDealsGiftAvailable();
  const shopDealsNewTag = isShopDealsNew();
  const newcomerGiftsVisible = isNewcomerGiftsActive(profile);
  const newcomerGiftsReady = newcomerGiftsVisible && canClaimNewcomerGift(profile);

  const raidBrawler = lobbyBossRaidBossId ? getBrawlerById(lobbyBossRaidBossId) : null;
  const raidBossLevel = lobbyBossRaidBossId ? getBossRaidCurrentLevel(profile, lobbyBossRaidBossId) : null;

  const handleSoonNotice = (text: string) => {
    setNotif(text);
    setTimeout(() => setNotif(null), 1800);
  };

  useEffect(() => {
    syncStarFeatPeaks(profile);
  }, [profile?.username, profile?.trophies, profile?.unlockedBrawlers?.length, profile?.clubId, profile?.clashPassLevel]);

  useEffect(() => {
    if (isAdminUnlocked()) return;
    let hideTimer = 0;
    let visible = false;

    const tick = () => {
      const notice = getTechBreakBattleBlockNotice();
      if (!notice) {
        visible = false;
        return;
      }
      setNotif(notice);
      if (!visible) {
        visible = true;
        if (hideTimer) window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => setNotif(null), 5000);
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    const onSched = () => tick();
    const offTb = subscribeTechBreakChanges(tick);
    window.addEventListener(ADMIN_SCHEDULE_CHANGED, onSched);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(ADMIN_SCHEDULE_CHANGED, onSched);
      offTb();
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, []);

  // Cinematic "Champions' Hall" main-menu background — a real painted scene
  // depicting a vast floor the selected brawler stands on, rather than a flat gradient.
  const menuBgImage = `url("${base}main-menu-bg.png")`;
  const menuBgStyle: React.CSSProperties = {
    backgroundImage: menuBgImage,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundColor: "#0a0028",
  };

  return (
    <div
      style={{
        ...(pseudoFullscreen
          ? {
              position: "fixed",
              inset: 0,
              width: "100vw",
              height: "100vh",
              zIndex: 99999,
              ...menuBgStyle,
            }
          : {
              height: "100%",
              width: "100%",
              ...menuBgStyle,
              position: "relative",
            }),
        overflow: "visible",
        fontFamily: "'Segoe UI', Arial, sans-serif",
      }}
    >
      <style>{`
        @keyframes pulse { 0%,100% { transform: scale(1);} 50% { transform: scale(1.04);} }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes floatY { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-12px);} }
        @keyframes sparkle {
          0%,100% { opacity: 0.25; transform: scale(0.8);} 50% { opacity:1; transform:scale(1.2);}
        }
        @keyframes glow {
          0%,100% { box-shadow: 0 0 30px rgba(206,147,216,0.3);}
          50% { box-shadow: 0 0 60px rgba(206,147,216,0.6);}
        }
        @keyframes bossRaidLinePulse {
          0%, 100% {
            text-shadow: 0 0 10px rgba(255,213,79,0.5), 0 0 22px rgba(213,0,249,0.35);
            filter: brightness(1);
          }
          50% {
            text-shadow: 0 0 18px rgba(255,213,79,0.85), 0 0 36px rgba(213,0,249,0.55);
            filter: brightness(1.06);
          }
        }
      `}</style>

      {/* Subtle vignette to keep focus on the centre brawler and harmonise UI panels with the painted background. */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at 50% 55%, transparent 35%, rgba(6,0,30,0.45) 100%)",
      }} />

      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 4,
          pointerEvents: partyMenuLocked ? "none" : undefined,
          ...(partyMenuLocked ? {
            filter: "grayscale(1) saturate(0.2) brightness(0.88)",
            transition: "filter 0.22s ease",
          } : {}),
        }}
      >
      {/* TOP BAR: слева профиль/подписка — по центру команда — справа ресурсы */}
      <div style={{
        position: "absolute",
        top: 16,
        left: compact ? 8 : 16,
        right: compact ? 8 : 16,
        zIndex: 8,
        display: "flex",
        alignItems: "center",
        gap: compact ? 4 : 8,
        pointerEvents: "none",
      }}>
      <div style={{ display: "flex", gap: compact ? 6 : 10, alignItems: "center", flexShrink: 0, pointerEvents: "auto" }}>
        <button
          onClick={onProfile}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "6px 14px 6px 6px",
            cursor: "pointer", color: "var(--t-1)",
            ["--ui-shear-fill" as string]: "linear-gradient(160deg, rgba(15,8,42,0.78), rgba(8,4,24,0.92))",
            ["--ui-shear-border" as string]: "var(--bd-2)",
            ["--ui-shear-shadow" as string]: "var(--sh-md), inset 0 1px 0 rgba(255,255,255,0.08)",
            ["--ui-shear-blur" as string]: "blur(14px) saturate(1.2)",
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10, overflow: "hidden",
            border: `1.5px solid ${usernameAccent}88`,
            flexShrink: 0,
            boxShadow: `0 0 10px ${usernameAccent}44`,
          }}>
            <img
              src={profileIconSrc}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
          {usernameStyle.kind === "shimmer" ? (
            <span
              className="subscriber-name-shimmer"
              style={{
                display: "inline-block",
                textAlign: "left",
                fontSize: 14,
                fontWeight: 800,
                lineHeight: 1.2,
                backgroundImage: usernameStyle.def.gradient,
                filter: `drop-shadow(0 0 6px ${usernameStyle.def.glow}) drop-shadow(0 1px 2px rgba(0,0,0,0.8))`,
              }}
            >
              {profile.username}
            </span>
          ) : (
            <div
              style={{
                textAlign: "left",
                fontSize: 14,
                fontWeight: 800,
                color: usernameStyle.color,
                textShadow: `0 0 12px ${usernameStyle.color}66, 0 1px 2px rgba(0,0,0,0.8)`,
                lineHeight: 1.2,
              }}
            >
              {profile.username}
            </div>
          )}
        </button>
        <SideButton
          icon="📺"
          imgSrc="ui/nav-feed.png"
          label={t("nav.feed")}
          onClick={onBattleFeed}
          color="#FF7043"
          compact={compact}
          menuBar
        />
        <TrophyRoadMenuButton
          trophies={profile.trophies}
          badgeCount={trophyRoadBadge}
          onClick={onTrophyRoad}
          displayTrophies={roadDisplayTrophies ?? undefined}
          barFillOverride={roadBarFill}
          barTargetRef={trophyRoadBarRef}
        />
        <SideButton
          icon="🏅"
          imgSrc="images/ranked-menu-btn.png"
          label={t("ranked.menuShort")}
          onClick={onRanked}
          color="#CE93D8"
          compact={compact}
          menuBar
          menuBarWidth={compact ? 68 : 76}
          menuBarIconSize={compact ? 64 : 72}
          menuBarIconScale={compact ? 1.3 : 1.34}
          menuBarHeight={52}
          menuBarPadding="0 4px"
          hideLabel
          menuBarIconCenter
          innerRef={rankedBtnRef}
          badge={proPassBadge > 0 ? proPassBadge : undefined}
        />
        <StarGuardianBadge onClick={onStarGuardianRewards} compact={compact} />
      </div>

      <div style={{
        flex: "1 1 0",
        minWidth: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        overflow: "visible",
        pointerEvents: "auto",
        padding: compact ? "0 4px" : "0 8px",
      }}>
        {getMyPartyCode() && (
          <TeamBar compact={compact} onLeave={partyRefresh} />
        )}
      </div>

      <div style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
        pointerEvents: "auto",
      }}>
        <div className="ui-resource-bar" style={{ gap: compact ? 4 : 6 }}>
          <span className="ui-resource-pill ui-resource-pill--gold" style={{ fontSize: compact ? 11 : 14, minHeight: compact ? 28 : 32 }}>
            <CoinIcon size={compact ? 22 : 26} /> {profile.coins.toLocaleString("ru-RU")}
          </span>
          <span className="ui-resource-pill ui-resource-pill--cyan" style={{ fontSize: compact ? 11 : 14, minHeight: compact ? 28 : 32 }}>
            <GemIcon size={compact ? 22 : 26} /> {profile.gems.toLocaleString("ru-RU")}
          </span>
          <span className="ui-resource-pill ui-resource-pill--violet" style={{ fontSize: compact ? 11 : 14, minHeight: compact ? 28 : 32 }}>
            <PowerIcon size={compact ? 22 : 26} /> {profile.powerPoints.toLocaleString("ru-RU")}
          </span>
          <div style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
            <button
              type="button"
              className="ui-resource-pill"
              onClick={() => setShowHamburger(true)}
              title={t("nav.menu")}
              style={{
                minHeight: compact ? 28 : 32,
                minWidth: compact ? 44 : 58,
                padding: compact ? "4px 12px" : "6px 18px",
                color: "var(--t-1)",
                fontWeight: 900,
                cursor: "pointer",
                lineHeight: 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "visible",
                border: "none",
                fontFamily: "inherit",
                fontSize: compact ? 20 : 24,
                letterSpacing: compact ? 1 : 2,
                ["--ui-shear-fill" as string]: "linear-gradient(160deg, rgba(15,8,42,0.78), rgba(8,4,24,0.92))",
                ["--ui-shear-border" as string]: "var(--bd-2)",
                ["--ui-shear-shadow" as string]: "var(--sh-md), inset 0 1px 0 rgba(255,255,255,0.1)",
                ["--ui-shear-blur" as string]: "blur(12px) saturate(1.2)",
              }}
            >☰</button>
            <NotificationBadge count={unreadMessages + unreadNews} notifyCorner="top-right" />
          </div>
        </div>
      </div>
      </div>


      {/* CENTER: лидер + до 2 напарников с каждой стороны */}
      <div style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        paddingTop: 40,
        overflow: "visible",
      }}>
        <div style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          width: "100%",
          boxSizing: "border-box",
          paddingLeft: compact ? 82 : 96,
          paddingRight: compact ? 82 : 96,
          transform: "translateX(-58px)",
          gap: compact ? 10 : 14,
          overflow: "visible",
        }}>
          <div style={{
            flex: 1,
            minWidth: 0,
            alignSelf: "stretch",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: leftLine.length <= 1 ? "flex-end" : "space-between",
            paddingRight: compact ? 4 : 6,
            overflow: "visible",
            position: "relative",
            zIndex: partyCount >= 4 ? 1 : undefined,
          }}>
            {leftLine.map((mate, i) => {
              const stagger = partyStatsStaggerOffset(partyStatsStaggerIdx++, staggerPartyStats, compact);
              return (
              <PartySlotArea
                key={mate.playerId}
                mate={mate}
                side="left"
                compact={compact}
                overlapMargin={i > 0 ? (compact ? -98 : -112) : 0}
                statsStagger={stagger}
                showReadyBadge={isPartyMemberPlayReady(mate.playerId)}
                activityLabel={
                  partyCount >= 2 && !isPartyMemberPlayReady(mate.playerId)
                    ? getMenuActivityLabelForPlayerId(mate.playerId)
                    : null
                }
                senderSuggest={suggestForPlayer(mate.playerId)}
                canAnswerSuggest={canAnswerPartySuggest}
                onTeammateClick={(rect) => setTeammateMenu({ mate, anchor: rect, side: "left" })}
                onSuggestBubbleClick={() => setShowSuggestAccept(true)}
                showRankedBars={showRankedBars}
                rankedCups={rankedCups}
                rankedPeakCups={rankedPeakCups}
              />
            );
            })}
            {leftEmptySlots.length > 0 && (
              <div style={{
                position: "absolute",
                top: "50%",
                ...(leftLine.length > 0
                  ? { right: compact ? 6 : 10, transform: "translateY(-50%)" }
                  : {
                    left: "50%",
                    transform: compact
                      ? "translate(calc(-50% + 18px), -50%)"
                      : "translate(calc(-50% + 24px), -50%)",
                  }),
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: compact ? 6 : 8,
                pointerEvents: "auto",
                zIndex: 7,
              }}>
                {leftEmptySlots.map(slot => (
                  <PartyPlusButton
                    key={slot}
                    slot={slot}
                    compact={compact}
                    embedded
                    outgoingInvite={outgoingInvite?.side === slot ? outgoingInvite : null}
                    onOpenPanel={() => setPartyPanel(slot)}
                    onCancelInvite={() => { cancelOutgoingInvite(); partyRefresh(); }}
                  />
                ))}
              </div>
            )}
          </div>
          <div style={{ flexShrink: 0, position: "relative", pointerEvents: "none", zIndex: partyCount >= 4 ? 12 : 5 }}>
          {(() => {
            const leaderStagger = partyStatsStaggerOffset(partyStatsStaggerIdx++, staggerPartyStats, compact);
            return (
              <>
          {suggestForPlayer(myPlayerId) && (
            <div style={{
              position: "absolute",
              bottom: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              marginBottom: 58 + leaderStagger,
              zIndex: 8,
              pointerEvents: "auto",
            }}>
              <PartyBrawlerSuggestBubble
                suggestion={suggestForPlayer(myPlayerId)!}
                compact={compact}
                onClick={canAnswerPartySuggest ? () => setShowSuggestAccept(true) : undefined}
              />
            </div>
          )}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              bottom: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              marginBottom: 10 + leaderStagger,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              pointerEvents: "auto",
              whiteSpace: "nowrap",
              zIndex: 6,
            }}
          >
            {showRankedBars ? (
              <RankedLeagueBar
                totalCups={rankedCups}
                peakCups={rankedPeakCups}
                layout="compact"
                badgeScale={MENU_RANK_BADGE_SCALE}
                powerLevel={brawlerLevel}
                barRef={rankedBarRef}
                onClick={onProStarPass}
                unclaimedCount={proPassBadge}
              />
            ) : (
              <BrawlerRankBar
                brawlerId={brawler.id}
                trophies={brawlerTrophies}
                layout="compact"
                badgeScale={MENU_RANK_BADGE_SCALE}
                powerLevel={brawlerLevel}
                onClick={() => setRankModalBrawlerId(brawler.id)}
              />
            )}
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "rgba(0,0,0,0.55)",
              border: "1px solid rgba(255,215,0,0.45)",
              borderRadius: 8, padding: "4px 8px",
              color: "#FFE082", fontSize: 12, fontWeight: 800,
            }}>
              ★ {brawlerStarCount}/6
            </span>
          </div>
              </>
            );
          })()}
        <div
          onClick={onBrawlerSelect}
          style={{
            pointerEvents: "auto", cursor: "pointer",
            position: "relative",
            width: compact ? 243 : 270,
            height: compact ? 259 : 288,
          }}
        >
          <button
            ref={masteryBtnRef}
            type="button"
            title={t("nav.mastery")}
            onClick={(e) => { e.stopPropagation(); onMastery(brawler.id); }}
            style={{
              position: "absolute",
              left: compact ? -2 : 0,
              bottom: compact ? 6 : 10,
              zIndex: 10,
              width: compact ? 54 : 60,
              minWidth: compact ? 54 : 60,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 0,
              padding: compact ? "0 2px 3px" : "0 2px 3px",
              background: "linear-gradient(160deg, rgba(15,8,42,0.72), rgba(8,4,24,0.86))",
              border: "1px solid rgba(186,104,255,0.45)",
              borderRadius: 12,
              cursor: "pointer",
              boxShadow: "var(--sh-sm), inset 0 1px 0 rgba(255,255,255,0.06)",
              pointerEvents: "auto",
              overflow: "visible",
            }}
          >
            <div style={{
              width: compact ? 54 : 60,
              height: compact ? 48 : 52,
              position: "relative",
              flexShrink: 0,
              overflow: "visible",
            }}>
              <img
                src={`${artBase}ui/nav-mastery.png`}
                alt=""
                className="ui-game-icon"
                style={{
                  position: "absolute",
                  left: "50%",
                  bottom: compact ? -4 : -5,
                  width: compact ? 58 : 64,
                  height: compact ? 58 : 64,
                  maxWidth: "none",
                  transform: `translateX(-50%) scale(${compact ? 1.16 : 1.2})`,
                  transformOrigin: "50% 100%",
                  pointerEvents: "none",
                  zIndex: 2,
                  filter: "drop-shadow(0 4px 12px rgba(186,104,255,0.75))",
                }}
              />
            </div>
            <span style={{
              fontSize: compact ? 7 : 8,
              fontWeight: 900,
              letterSpacing: 0.15,
              color: "#fff",
              whiteSpace: "nowrap",
              lineHeight: 1.1,
              textAlign: "center",
              position: "relative",
              zIndex: 1,
              textShadow: "0 1px 2px rgba(0,0,0,0.85)",
              WebkitFontSmoothing: "antialiased",
            }}>
              {t("nav.mastery")}
            </span>
            {masteryBadge > 0 && (
              <span style={{
                position: "absolute",
                top: 4,
                right: 4,
                minWidth: 16,
                height: 16,
                padding: "0 4px",
                borderRadius: 8,
                background: "#FF1744",
                color: "#fff",
                fontSize: 9,
                fontWeight: 900,
                lineHeight: "16px",
                textAlign: "center",
              }}>
                {masteryBadge > 99 ? "99+" : masteryBadge}
              </span>
            )}
          </button>
          <button
            type="button"
            title={t("nav.comic")}
            onClick={(e) => { e.stopPropagation(); onComic(brawler.id); }}
            style={{
              position: "absolute",
              left: compact ? 58 : 68,
              bottom: compact ? 6 : 10,
              zIndex: 10,
              width: compact ? 54 : 60,
              minWidth: compact ? 54 : 60,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 0,
              padding: compact ? "0 2px 3px" : "0 2px 3px",
              background: "linear-gradient(160deg, rgba(15,8,42,0.72), rgba(8,4,24,0.86))",
              border: "1px solid rgba(186,104,255,0.45)",
              borderRadius: 12,
              cursor: "pointer",
              boxShadow: "var(--sh-sm), inset 0 1px 0 rgba(255,255,255,0.06)",
              pointerEvents: "auto",
              overflow: "visible",
            }}
          >
            <div style={{
              width: compact ? 54 : 60,
              height: compact ? 48 : 52,
              position: "relative",
              flexShrink: 0,
              overflow: "visible",
            }}>
              <img
                src={`${artBase}ui/nav-comic.png`}
                alt=""
                className="ui-game-icon"
                style={{
                  position: "absolute",
                  left: "50%",
                  bottom: compact ? -4 : -5,
                  width: compact ? 58 : 64,
                  height: compact ? 58 : 64,
                  maxWidth: "none",
                  transform: `translateX(-50%) scale(${compact ? 1.16 : 1.2})`,
                  transformOrigin: "50% 100%",
                  pointerEvents: "none",
                  zIndex: 2,
                  filter: "drop-shadow(0 4px 12px rgba(186,104,255,0.75))",
                }}
              />
            </div>
            <span style={{
              fontSize: compact ? 7 : 8,
              fontWeight: 900,
              letterSpacing: 0.15,
              color: "#fff",
              whiteSpace: "nowrap",
              lineHeight: 1.1,
              textAlign: "center",
              position: "relative",
              zIndex: 1,
              textShadow: "0 1px 2px rgba(0,0,0,0.85)",
              WebkitFontSmoothing: "antialiased",
            }}>
              {t("nav.comic")}
            </span>
          </button>
          {inParty && (
            <button
              type="button"
              className="no-ui-shear"
              title={t("party.chatOpen")}
              onClick={(e) => { e.stopPropagation(); setShowPartyChat(true); }}
              style={{
                position: "absolute",
                right: compact ? 6 : 10,
                top: "46%",
                transform: "translate(100%, -50%)",
                zIndex: 9,
                width: compact ? 48 : 52,
                height: compact ? 48 : 52,
                borderRadius: 14,
                background: "linear-gradient(180deg, #fff 0%, #e8e8e8 100%)",
                border: "3px solid #1a1a1a",
                color: "#1a1a1a",
                fontSize: compact ? 21 : 23,
                cursor: "pointer",
                boxShadow: `0 3px 0 #1a1a1a, 0 0 18px ${brawler.color}88`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              💬
              {partyChatUnread > 0 && (
                <span className="no-ui-shear" style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  minWidth: 18,
                  height: 18,
                  padding: "0 5px",
                  borderRadius: 9,
                  background: "linear-gradient(135deg, #FF1744, #D50000)",
                  border: "2px solid #160048",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 900,
                  lineHeight: "14px",
                }}>
                  {partyChatUnread > 99 ? "99+" : partyChatUnread}
                </span>
              )}
            </button>
          )}
          <div
            style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: rankModalBrawlerId ? undefined : "floatY 3.5s ease-in-out infinite",
            }}
          >
            <div style={{
              position: "absolute", inset: 0,
              background: `radial-gradient(circle at 50% 60%, ${brawler.color}55 0%, transparent 65%)`,
            }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <MenuPartyBrawler3D
                key={`self-${brawler.id}`}
                brawlerId={brawler.id}
                color={brawler.color}
                size={compact ? 243 : 270}
                paused={!!rankModalBrawlerId}
                selfCenter
              />
            </div>
            {isPartyMemberPlayReady(myPlayerId) && <PartyReadyBadge compact={compact} />}
          </div>
          {(() => {
            const ep = getPetById(profile.equippedPetId);
            if (!ep) return null;
            return (
              <div
                style={{
                  position: "absolute",
                  right: partyCount >= 4 ? 2 : -28,
                  bottom: compact ? (partyCount >= 4 ? -12 : -20) : (partyCount >= 4 ? -16 : -26),
                  width: compact ? 80 : 96,
                  height: compact ? 80 : 96,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  pointerEvents: "auto",
                  zIndex: 15,
                  overflow: "visible",
                  filter: `drop-shadow(0 0 12px ${ep.color}aa)`,
                }}
                title={t("nav.pets")}
              >
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transform: ep.id === "swift_rabbit"
                    ? `translateY(${compact ? 8 : 10}px)`
                    : undefined,
                }}>
                  <PetSvg
                    pet={ep}
                    size={compact ? 76 : 92}
                    force3D
                    animated
                    haloPulse
                    clipPadding={ep.id === "swift_rabbit" ? 1.34 : 1.25}
                    onTap={() => onPets()}
                  />
                </div>
              </div>
            );
          })()}
        </div>
          </div>
          <div style={{
            flex: 1,
            minWidth: 0,
            alignSelf: "stretch",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "flex-start",
            paddingLeft: compact ? 4 : 6,
            marginLeft: rightLine.length >= 2 ? (compact ? -20 : -28) : 0,
            overflow: "visible",
            position: "relative",
            zIndex: partyCount >= 4 ? 1 : undefined,
          }}>
            {rightLine.map((mate, i) => {
              const stagger = partyStatsStaggerOffset(partyStatsStaggerIdx++, staggerPartyStats, compact);
              return (
              <PartySlotArea
                key={mate.playerId}
                mate={mate}
                side="right"
                compact={compact}
                overlapMargin={i > 0 ? (compact ? -98 : -112) : 0}
                statsStagger={stagger}
                showReadyBadge={isPartyMemberPlayReady(mate.playerId)}
                activityLabel={
                  partyCount >= 2 && !isPartyMemberPlayReady(mate.playerId)
                    ? getMenuActivityLabelForPlayerId(mate.playerId)
                    : null
                }
                senderSuggest={suggestForPlayer(mate.playerId)}
                canAnswerSuggest={canAnswerPartySuggest}
                onTeammateClick={(rect) => setTeammateMenu({ mate, anchor: rect, side: "right" })}
                onSuggestBubbleClick={() => setShowSuggestAccept(true)}
                showRankedBars={showRankedBars}
                rankedCups={rankedCups}
                rankedPeakCups={rankedPeakCups}
              />
            );
            })}
            {rightEmptySlots.length > 0 && (
              <div style={{
                position: "absolute",
                top: "50%",
                ...(rightLine.length > 0
                  ? { left: compact ? 6 : 10, transform: "translateY(-50%)" }
                  : { left: "50%", transform: "translate(-50%, -50%)" }),
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: compact ? 6 : 8,
                pointerEvents: "auto",
                zIndex: 7,
              }}>
                {rightEmptySlots.map(slot => (
                  <PartyPlusButton
                    key={slot}
                    slot={slot}
                    compact={compact}
                    embedded
                    outgoingInvite={outgoingInvite?.side === slot ? outgoingInvite : null}
                    onOpenPanel={() => setPartyPanel(slot)}
                    onCancelInvite={() => { cancelOutgoingInvite(); partyRefresh(); }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {partyPanel && (
        <PartySidePanel
          inviteSlot={partyPanel}
          onClose={() => { setPartyPanel(null); partyRefresh(); }}
          onViewProfile={(id) => { setPartyPanel(null); onViewPlayerProfile(id); }}
          onSpectate={(playerId) => onSpectate(playerId)}
        />
      )}

      {showPartyChat && inParty && (
        <PartyChatPanel
          brawlerId={brawler.id}
          onClose={() => setShowPartyChat(false)}
        />
      )}

      <PartyInviteModal
        onAccepted={partyRefresh}
        onDeclined={partyRefresh}
      />

      {teammateMenu && (
        <TeammateActionMenu
          username={teammateMenu.mate.username}
          anchor={teammateMenu.anchor}
          side={teammateMenu.side}
          canKick={amPartyLeader()}
          onClose={() => setTeammateMenu(null)}
          onSuggest={() => {
            setBrawlerPickTarget(teammateMenu.mate);
            setTeammateMenu(null);
          }}
          onProfile={() => {
            setTeammateMenu(null);
            onViewPlayerProfile(teammateMenu.mate.playerId);
          }}
          onKick={() => {
            const r = kickPartyMember(teammateMenu.mate.playerId);
            setTeammateMenu(null);
            if (!r.success) setNotif(r.error ?? t("common.error"));
            else partyRefresh();
            setTimeout(() => setNotif(null), 2400);
          }}
        />
      )}

      {brawlerPickTarget && (
        <PartyBrawlerPickerModal
          targetPlayerId={brawlerPickTarget.playerId}
          targetUsername={brawlerPickTarget.username}
          onClose={() => setBrawlerPickTarget(null)}
          onPick={(brawlerId) => {
            const r = sendPartyBrawlerSuggestion(brawlerPickTarget.playerId, brawlerId);
            setBrawlerPickTarget(null);
            if (!r.success) setNotif(r.error ?? t("common.error"));
            else partyRefresh();
            setTimeout(() => setNotif(null), 2200);
          }}
        />
      )}

      {showSuggestAccept && partyBrawlerSuggest && canAnswerPartySuggest && (
        <PartyBrawlerSuggestAcceptModal
          suggestion={partyBrawlerSuggest}
          onAccept={() => {
            acceptPartyBrawlerSuggestion();
            setShowSuggestAccept(false);
            partyRefresh();
          }}
          onDecline={() => {
            declinePartyBrawlerSuggestion();
            setShowSuggestAccept(false);
            partyRefresh();
          }}
        />
      )}

      {/* RIGHT SIDE BUTTONS — чуть ниже центра, но выше плашки «Победы дня» */}
      <div style={{
        position: "absolute",
        right: compact ? 8 : 18,
        top: compact ? "40%" : "44%",
        transform: "translateY(-50%)",
        display: "flex", flexDirection: "column", gap: compact ? 6 : 12, zIndex: 6,
      }}>
        <SideButton icon="🎒" imgSrc="ui/nav-collection.png" label={t("nav.collection")} onClick={onCollection} color="#40C4FF" compact={compact} badge={collectionBadge || undefined} notifyCorner="top-left" />
        <SideButton icon="🐾" imgSrc="ui/nav-pets.png" label={t("nav.pets")} onClick={onPets} color="#76FF03" compact={compact} badge={newPetBadge} notifyCorner="top-left" />
        <SideButton icon="⭐" imgSrc="ui/nav-feats.png" label={t("nav.feats")} onClick={onStarFeats} color="#FFD54F" compact={compact} badge={starFeatBadge} notifyCorner="top-left" />
        <SideButton icon="🏛️" imgSrc="ui/nav-clubs.png" label={t("nav.clubs")} onClick={onClubs} color="#FF8A65" compact={compact} badge={unreadClub || undefined} notifyCorner="top-left" />
        <SideButton icon="👥" imgSrc="ui/nav-friends.png" label={t("nav.friends")} onClick={onFriends} color="#CE93D8" compact={compact} notifyCorner="top-left" />
      </div>

      {/* LEFT SIDE — магазин, персонаж, бонус дня, сундуки */}
      <div style={{
        position: "absolute", left: compact ? 8 : 18, top: "50%", transform: "translateY(-50%)",
        display: "flex", flexDirection: "column", gap: compact ? 6 : 12, zIndex: 4,
      }}>
        <div style={{ display: "flex", flexDirection: "row", gap: compact ? 6 : 12 }}>
          <SideButton icon="🛒" imgSrc="ui/nav-shop.png" label={t("nav.shop")} onClick={onShop} color="#FFD700" compact={compact} giftTag={shopGiftBadge} dealsNewTag={shopDealsNewTag} notifyCorner="top-right" />
          {newcomerGiftsVisible && (
            <SideButton
              icon="🎁"
              imgSrc="ui/nav-gifts.png"
              label={t("nav.gifts")}
              onClick={() => setShowNewcomerGifts(true)}
              color="#E040FB"
              compact={compact}
              badge={newcomerGiftsReady ? 1 : undefined}
              pulse={newcomerGiftsReady}
              notifyCorner="top-right"
            />
          )}
        </div>
        <SideButton icon="🦸" imgSrc="ui/nav-character.png" label={t("nav.character")} onClick={onBrawlerSelect} color="#CE93D8" compact={compact} badge={newBrawlerBadge} notifyCorner="top-right" />
        <SideButton
          icon="🎁"
          imgSrc="ui/nav-bonus.png"
          label={t("nav.dailyBonus")}
          onClick={() => setShowDaily(true)}
          color={canClaimDaily ? "#FFD700" : "#888"}
          pulse={canClaimDaily}
          badge={canClaimDaily ? 1 : undefined}
          compact={compact}
          notifyCorner="top-right"
        />
        <SideButton icon="🗝️" imgSrc="ui/nav-chests.png" label={t("nav.chests")} onClick={onChests} color="#FF7043" badge={chestsBadge} compact={compact} notifyCorner="top-right" />
        <SideButton icon="🎨" imgSrc="ui/nav-customization.png" label={t("nav.customization")} onClick={onCustomization} color="#BA68C8" compact={compact} notifyCorner="top-right" />
      </div>

      {/* BOTTOM-LEFT: Quests button + Clash Pass card */}
      {compact ? (
        <button
          onClick={() => setShowQuests(true)}
          title={t("nav.questsDaily")}
          style={{
            position: "absolute", bottom: menuBottomInset(compact), left: compact ? 128 : 196, zIndex: 5,
            width: compact ? 48 : undefined,
            height: menuBottomBtnH(compact), minHeight: menuBottomBtnH(compact), maxHeight: menuBottomBtnH(compact), boxSizing: "border-box",
            background: hasUnclaimedQuest
              ? "linear-gradient(135deg, rgba(255,215,0,0.3), rgba(255,138,0,0.3))"
              : "rgba(0,0,0,0.4)",
            border: `1.5px solid ${hasUnclaimedQuest ? "#FFD700" : "rgba(206,147,216,0.5)"}`,
            borderRadius: 10,
            display: "inline-flex", flexDirection: "column",
            alignItems: "center", justifyContent: "flex-end",
            overflow: "visible",
            color: "white", cursor: "pointer",
            backdropFilter: "blur(10px)",
            padding: "2px 4px 3px",
            animation: hasUnclaimedQuest ? "pulse 1.6s ease-in-out infinite" : undefined,
            boxShadow: hasUnclaimedQuest ? "0 0 14px rgba(255,215,0,0.55)" : undefined,
          }}
        >
          <NotificationBadge count={questsBadge} />
          <img
            src={`${artBase}ui/nav-quests.png`}
            alt=""
            className="ui-game-icon"
            style={{
              width: 54, height: 54, flexShrink: 0,
              marginTop: -22, marginBottom: -6,
              position: "relative", zIndex: 2,
            }}
          />
          <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: 0.4, marginTop: 0, position: "relative", zIndex: 1, color: "#fff" }}>
            {t("nav.quests")} {activeQuestCount > 0 ? activeQuestCount : ""}
          </span>
        </button>
      ) : (
        <button
          onClick={() => setShowQuests(true)}
          style={{
            position: "absolute", bottom: menuBottomInset(compact), left: 196, zIndex: 5,
            overflow: "visible",
            background: hasUnclaimedQuest
              ? "linear-gradient(135deg, rgba(255,213,79,0.35), rgba(255,138,0,0.30))"
              : "linear-gradient(135deg, rgba(74,20,140,0.55), rgba(123,47,190,0.32))",
            border: `1px solid ${hasUnclaimedQuest ? "var(--bd-gold)" : "var(--bd-violet)"}`,
            borderRadius: "var(--r-md)",
            color: "var(--t-1)", cursor: "pointer",
            backdropFilter: "blur(12px) saturate(1.15)",
            WebkitBackdropFilter: "blur(12px) saturate(1.15)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 0,
            minWidth: 84,
            height: menuBottomBtnH(compact), minHeight: menuBottomBtnH(compact), maxHeight: menuBottomBtnH(compact), boxSizing: "border-box",
            padding: "2px 10px 5px",
            animation: hasUnclaimedQuest ? "pulse 1.6s ease-in-out infinite" : undefined,
            boxShadow: hasUnclaimedQuest
              ? "var(--sh-glow-gold), var(--sh-md)"
              : "var(--sh-md)",
          }}
          title={t("nav.questsDaily")}
        >
          <NotificationBadge count={questsBadge} />
          <img
            src={`${artBase}ui/nav-quests.png`}
            alt=""
            className="ui-game-icon"
            style={{
              width: 66, height: 66, flexShrink: 0,
              marginTop: -30, marginBottom: -8,
              position: "relative", zIndex: 2,
            }}
          />
          <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.6, lineHeight: 1.1, position: "relative", zIndex: 1, color: "#fff" }}>
            {t("nav.quests")} {activeQuestCount > 0 ? activeQuestCount : ""}
          </span>
        </button>
      )}

      <StarPassMenuButton
        ref={starPassBtnRef}
        compact={compact}
        onClick={onClashPass}
        artBase={artBase}
        passLevel={passLevel}
        passPct={passPct}
        xp={profile.xp}
        passNeed={passNeed}
        badge={clashPassBadge}
        atMax={passLevel >= MAX_CLASHPASS_LEVEL}
      />

      {/* BOTTOM-CENTER: mode selector pinned to the bottom edge */}
      <div
        style={{
          position: "absolute",
          bottom: menuBottomInset(compact),
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 5,
          height: menuBottomBtnH(compact),
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        <button
          onClick={onModeSelect}
          style={{
            position: "relative",
            overflow: "visible",
            height: menuBottomBtnH(compact),
            minHeight: menuBottomBtnH(compact),
            maxHeight: menuBottomBtnH(compact),
            boxSizing: "border-box",
            padding: compact ? "5px 10px" : "8px 22px",
            color: "var(--t-1)", cursor: "pointer",
            display: "flex", alignItems: "center", gap: compact ? 6 : 12,
            minWidth: compact ? 0 : 320,
            fontFamily: "inherit",
            ["--ui-shear-text" as string]: "#ffffff",
            ["--ui-shear-fill" as string]: `linear-gradient(135deg, ${mode.color}40, rgba(8,4,24,0.78))`,
            ["--ui-shear-border" as string]: mode.color,
            ["--ui-shear-shadow" as string]: `0 8px 28px ${mode.color}55, var(--sh-md), inset 0 1px 0 rgba(255,255,255,0.08)`,
            ["--ui-shear-blur" as string]: "blur(14px) saturate(1.2)",
          }}
        >
          <div
            style={{
              width: compact ? 40 : 56,
              height: compact ? 40 : 56,
              position: "relative",
              flexShrink: 0,
              overflow: "visible",
            }}
          >
            <ModeIconImg
              modeId={mode.id}
              alt={mode.name}
              size={menuModeIconSize(mode.id, !!compact)}
              color={mode.color}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
              }}
            />
          </div>
          <span style={{ flex: 1, textAlign: "left" }}>
            {!compact && (
              <span style={{ display: "block", color: "rgba(255,255,255,0.55)", fontSize: 10, letterSpacing: 1 }}>{t("common.mode")}</span>
            )}
            <span style={{ display: "block", fontSize: compact ? 11 : 16, fontWeight: 800, color: "#fff", whiteSpace: "nowrap" }}>{mode.name}</span>
            {!compact && (
              <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap", fontWeight: 600 }}>{mode.subtitle}</span>
            )}
          </span>
          {hasModeMapNews ? (
            <span
              className="no-ui-shear"
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                width: compact ? 44 : 72,
                minWidth: compact ? 44 : 72,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(180deg, #FFF59D 0%, #FFEB3B 50%, #FFC107 100%)",
                borderLeft: "2px solid rgba(255,255,255,0.55)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65), 0 0 18px rgba(255,235,59,0.75)",
                fontSize: compact ? 9 : 11,
                fontWeight: 900,
                letterSpacing: compact ? 0.5 : 1.2,
                color: "#fff",
                textShadow: "0 1px 5px rgba(255,143,0,0.9)",
                animation: "modeNewBadgePulse 2s ease-in-out infinite",
                zIndex: 1,
              }}
            >
              {t("common.new")}
            </span>
          ) : !compact ? (
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>{t("nav.changeMode")}</span>
          ) : null}
          <span
            role="button"
            title={t("nav.aboutMode")}
            onClick={(e) => { e.stopPropagation(); setShowModeInfo(true); }}
            style={{
              position: "absolute",
              top: compact ? -6 : -8,
              right: compact ? -6 : -8,
              width: compact ? 18 : 26,
              height: compact ? 18 : 26,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.85)",
              border: `1.5px solid ${mode.color}`,
              color: mode.color,
              fontSize: compact ? 10 : 14,
              fontWeight: 900, fontStyle: "italic",
              fontFamily: "Georgia, serif",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              boxShadow: `0 0 10px ${mode.color}88`,
              lineHeight: 1,
              zIndex: 5,
            }}
          >i</span>
        </button>
      </div>

      {/* BOTTOM-RIGHT: плашка побед дня + ИГРАТЬ */}
      <div
        style={{
          position: "absolute",
          bottom: menuBottomInset(compact),
          right: compact ? 8 : 24,
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: compact ? 6 : 10,
          maxWidth: compact ? "52vw" : 360,
          pointerEvents: "auto",
        }}
      >
        {raidBrawler != null && raidBossLevel != null && (
          <div
            style={{
              textAlign: "right",
              fontWeight: 900,
              fontSize: compact ? 11 : 15,
              letterSpacing: 0.4,
              lineHeight: 1.25,
              color: "#ffe082",
              animation: "bossRaidLinePulse 2.2s ease-in-out infinite",
            }}
          >
            {brawlerName(raidBrawler.id, raidBrawler.name)}
            <span style={{ color: "rgba(255,255,255,0.82)", fontWeight: 800 }}> · </span>
            {t("nav.raidLevel", { level: raidBossLevel })}
          </div>
        )}
        <div style={{ position: "relative", width: "100%" }}>
          <DailyWinsStrip
            dayType={dailyWins.dayType}
            slots={dailyWins.slots}
            claimedCount={dailyWins.claimedCount}
            compact={compact}
          />
          {menuFxPhase === "pile" && menuTrophyFx && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: "50%",
                bottom: "100%",
                transform: "translateX(-50%)",
                marginBottom: 6,
                width: 200,
                height: 120,
                pointerEvents: "none",
                zIndex: 8,
              }}
            >
              {Array.from({ length: Math.min(menuTrophyFx.count, 14) }, (_, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: 6 + (i % 4) * 46,
                    top: 4 + Math.floor(i / 4) * 44,
                    animation: `trophyPilePop 0.35s ease ${(i / Math.min(menuTrophyFx.count, 14)) * 1.2}s both`,
                    filter: "drop-shadow(0 4px 12px rgba(255,215,0,0.85))",
                  }}
                >
                  <TrophyIcon size={MENU_TROPHY_PILE_SIZE} lite />
                </div>
              ))}
            </div>
          )}
        </div>
        {partyReadyActive && (
          <div style={{
            textAlign: "right",
            fontSize: compact ? 10 : 12,
            fontWeight: 800,
            color: "rgba(255,255,255,0.72)",
            letterSpacing: "0.06em",
          }}>
            {t("nav.partyWaiting", { seconds: partyReadySecondsLeft })}
          </div>
        )}
        <button
          ref={playBtnRef}
          onClick={showPartyObserve ? handleObserveClick : handleMenuPlayClick}
          style={{
            position: "relative",
            overflow: showRankedLobbyLine && !partyReadyActive && !showPartyObserve ? "hidden" : "visible",
            alignSelf: "center",
            height: menuBottomBtnH(compact),
            minHeight: menuBottomBtnH(compact),
            maxHeight: menuBottomBtnH(compact),
            boxSizing: "border-box",
            display: "inline-flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            padding: compact ? "0 24px" : "0 56px",
            fontWeight: 900,
            fontSize: compact ? 14 : 24,
            letterSpacing: compact ? "0.16em" : "0.28em",
            cursor: "pointer",
            flexShrink: 0,
            transform: "none",
            ["--ui-shear-text" as string]: "#ffffff",
            ["--ui-shear-text-shadow" as string]: "0 2px 8px rgba(0,0,0,0.6)",
            fontFamily: "inherit",
            ["--ui-shear-fill" as string]: partyReadyActive && iAmPartyReady
              ? "linear-gradient(135deg, #B71C1C 0%, #E53935 45%, #FF5252 100%)"
              : showPartyObserve
                ? "linear-gradient(135deg, #004D40 0%, #00897B 45%, #26A69A 100%)"
                : "linear-gradient(135deg, #7B2FBE 0%, #D500F9 45%, #FF6F00 100%)",
            ["--ui-shear-border" as string]: partyReadyActive && iAmPartyReady
              ? "rgba(255,200,200,0.5)"
              : showPartyObserve
                ? "rgba(178,255,220,0.5)"
                : "rgba(255,255,255,0.45)",
            ["--ui-shear-shadow" as string]: partyReadyActive && iAmPartyReady
              ? "0 22px 56px rgba(229,57,53,0.55), 0 0 32px rgba(255,82,82,0.35), inset 0 1px 0 rgba(255,255,255,0.45)"
              : showPartyObserve
                ? "0 22px 56px rgba(0,137,123,0.55), 0 0 32px rgba(38,166,154,0.35), inset 0 1px 0 rgba(255,255,255,0.45)"
                : "0 22px 56px rgba(213,0,249,0.6), 0 0 44px rgba(255,111,0,0.35), 0 0 24px rgba(123,47,190,0.55), inset 0 1px 0 rgba(255,255,255,0.55)",
            ["--ui-shear-blur" as string]: "none",
            ["--ui-shear-outline" as string]: partyReadyActive && iAmPartyReady
              ? "rgba(255,180,180,0.35)"
              : showPartyObserve
                ? "rgba(128,255,212,0.35)"
                : "rgba(255,255,255,0.28)",
          }}
        >
          {showRankedLobbyLine && !partyReadyActive && !showPartyObserve && (
            <div
              className="no-ui-shear"
              style={{
                position: "absolute",
                top: compact ? 5 : 7,
                left: compact ? 8 : 16,
                right: compact ? 8 : 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: compact ? 4 : 6,
                lineHeight: 1,
                maxWidth: "calc(100% - 16px)",
                overflow: "hidden",
                pointerEvents: "none",
              }}
            >
              <img
                src={rankedLeagueIconUrl(rankedStanding.leagueId)}
                alt=""
                className="ui-game-icon ranked-league-icon"
                style={{ width: compact ? 18 : 22, height: compact ? 18 : 22, objectFit: "contain", flexShrink: 0, filter: "none" }}
              />
              <span
                style={{
                  fontWeight: 900,
                  fontSize: compact ? 8 : 10,
                  letterSpacing: 0.2,
                  lineHeight: 1,
                  color: rankedLeagueDef.color,
                  textShadow: `0 1px 4px rgba(0,0,0,0.85), 0 0 12px ${rankedLeagueDef.accent}44`,
                  fontStyle: "italic",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  minWidth: 0,
                }}
              >
                {t(`ranked.leagueFull.${rankedStanding.leagueId}`)}
              </span>
            </div>
          )}
          <span style={{ lineHeight: 1, position: "relative", zIndex: 1 }}>
            {partyReadyActive && iAmPartyReady
              ? t("nav.partyCancel")
              : showPartyObserve
                ? t("nav.observe")
                : t("nav.play")}
          </span>
        </button>
      </div>

      <AstralFloatingIcon compact={compact} />
      {isWinStreakVisible(brawlerWinStreak) && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: compact ? 10 : 18,
            left: compact ? "calc(50% - 88px)" : "calc(50% - 220px)",
            zIndex: 6,
            pointerEvents: "none",
          }}
        >
          <WinStreakFlame streak={brawlerWinStreak} size={compact ? 38 : 46} />
        </div>
      )}
      <AstralMenuPopup
        onCta={(target) => {
          if (partyMenuLocked) return;
          if (target === "shop") onShop();
          else if (target === "starGuardianRewards") onStarGuardianRewards();
          else if (target === "collection") onCollection();
          else if (target === "pets") onPets();
          else if (target === "clashPass") onClashPass();
        }}
      />
      </div>

      {partyMenuLocked && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 15,
            pointerEvents: "auto",
            cursor: "default",
          }}
        />
      )}

      {menuFxPhase === "fly" && menuTrophyFx && (
        <TrophyFlyBurst
          count={menuTrophyFx.count}
          fromEl={playBtnRef.current}
          toEl={trophyRoadBarRef.current}
          iconSize={MENU_TROPHY_FLY_SIZE}
          spawnDurationMs={1800}
          onArrive={handleTrophyFlyArrive}
          onComplete={handleTrophyFlyComplete}
        />
      )}

      {passFxPhase === "fly" && menuPassXpFx && (
        <PassXpFlyBurst
          count={menuPassXpFx.count}
          fromEl={playBtnRef.current}
          toEl={starPassBtnRef.current}
          iconSize={MENU_PASS_XP_FLY_SIZE}
          spawnDurationMs={1800}
          onComplete={handlePassXpFlyComplete}
        />
      )}

      {rankedFxPhase === "pile" && menuRankedCupFx && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: "50%",
            bottom: compact ? 72 : 96,
            transform: "translateX(-50%)",
            width: 200,
            height: 120,
            pointerEvents: "none",
            zIndex: 20000,
          }}
        >
          {Array.from({ length: Math.min(menuRankedCupFx.count, 14) }, (_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 6 + (i % 4) * 46,
                top: 4 + Math.floor(i / 4) * 44,
                animation: `trophyPilePop 0.35s ease ${(i / Math.min(menuRankedCupFx.count, 14)) * 1.2}s both`,
                filter: "drop-shadow(0 4px 12px rgba(206,147,216,0.85))",
              }}
            >
              <TrophyIcon size={MENU_RANKED_CUP_PILE_SIZE} lite />
            </div>
          ))}
        </div>
      )}

      {rankedFxPhase === "fly" && menuRankedCupFx && (
        <RankedCupFlyBurst
          count={menuRankedCupFx.count}
          fromEl={playBtnRef.current}
          toEl={rankedBarRef.current ?? rankedBtnRef.current}
          iconSize={MENU_RANKED_CUP_FLY_SIZE}
          spawnDurationMs={1800}
          onArrive={handleRankedCupFlyArrive}
          onComplete={handleRankedCupFlyComplete}
        />
      )}

      {proPassFxPhase === "fly" && menuProPassTokenFx && (
        <ProPassTokenFlyBurst
          count={menuProPassTokenFx.count}
          fromEl={playBtnRef.current}
          toEl={rankedBtnRef.current}
          iconSize={MENU_PRO_PASS_TOKEN_FLY_SIZE}
          spawnDurationMs={1800}
          onComplete={handleProPassTokenFlyComplete}
        />
      )}

      {masteryFxPhase === "fly" && menuMasteryXpFx && (
        <MasteryXpFlyBurst
          count={menuMasteryXpFx.count}
          fromEl={playBtnRef.current}
          toEl={masteryBtnRef.current}
          iconSize={MENU_MASTERY_XP_FLY_SIZE}
          spawnDurationMs={1800}
          onComplete={handleMasteryXpFlyComplete}
        />
      )}

      <style>{`
        @keyframes trophyPilePop {
          from { transform: scale(0) translateY(12px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes modeNewBadgePulse {
          0%, 100% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.65), 0 0 14px rgba(255,235,59,0.6); }
          50% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.85), 0 0 24px rgba(255,235,59,0.95); }
        }
      `}</style>

      {showDaily && <DailyRewardModal onClose={() => { setShowDaily(false); setProfile(getCurrentProfile()); }} />}
      {showNewcomerGifts && (
        <NewcomerGiftsModal
          onClose={() => { setShowNewcomerGifts(false); setProfile(getCurrentProfile()); }}
          onProfileChange={() => setProfile(getCurrentProfile())}
        />
      )}
      {showQuests && <QuestsModal onClose={() => { setShowQuests(false); setProfile(getCurrentProfile()); }} />}
      {showModeInfo && (
        <ModeInfoModal mode={mode} onClose={() => setShowModeInfo(false)} />
      )}
      {rankModalBrawlerId && (
        <BrawlerRankRewardsModal
          brawlerId={rankModalBrawlerId}
          onClose={() => { setRankModalBrawlerId(null); setProfile(getCurrentProfile()); }}
        />
      )}
      {showHamburger && (
        <HamburgerDrawer
          onClose={() => setShowHamburger(false)}
          onSettings={() => { setShowHamburger(false); onSettings(); }}
          onLogout={() => { setShowHamburger(false); onLogout(); }}
          onRegister={onRegister ? () => { setShowHamburger(false); onRegister(); } : undefined}
          onAccounts={onAccounts ? () => { setShowHamburger(false); onAccounts(); } : undefined}
          onNews={() => { setShowHamburger(false); onNews(); }}
          unreadNews={unreadNews}
          onMessages={() => { setShowHamburger(false); openMessages(); }}
          unreadMessages={unreadMessages}
          onBattleHistory={onBattleHistory ? () => { setShowHamburger(false); onBattleHistory(); } : undefined}
          onRecords={onRecords ? () => { setShowHamburger(false); onRecords(); } : undefined}
          onMapEditor={isAdminUnlocked() ? () => { setShowHamburger(false); onMapEditor(); } : undefined}
          onAdmin={() => { setShowHamburger(false); onAdmin(); }}
          isFullscreen={isFullscreen || pseudoFullscreen}
          onToggleFullscreen={() => { toggleFullscreen(); }}
        />
      )}

      {dailyWinsReward && (
        <RewardDropQueue
          rewards={[dailyWinsReward]}
          onDone={() => {
            setDailyWinsReward(null);
            setSgDailyPaused(false);
            setProfile(getCurrentProfile());
          }}
        />
      )}

      {questRewardQueue && questRewardQueue.length > 0 && !dailyWinsReward && (
        <RewardDropQueue
          rewards={questRewardQueue}
          onDone={() => {
            setQuestRewardQueue(null);
            setProfile(getCurrentProfile());
          }}
        />
      )}

      <StarGuardianMainDailyGate
        paused={sgDailyPaused || !!dailyWinsReward || !!questRewardQueue?.length}
        onClaimed={() => setProfile(getCurrentProfile())}
      />

      {hasGifts && !dailyWinsReward && !questRewardQueue?.length && (
        <GiftClaimModal onAllClaimed={() => setHasGifts(false)} />
      )}

      <BossRaidPendingRewardsGate onRewardsApplied={() => setProfile(getCurrentProfile())} />

      {notif && (
        <div
          className="ui-glass-strong"
          style={{
            position: "absolute",
            top: 90,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 12,
            maxWidth: "min(92vw, 520px)",
            padding: "10px 16px",
            color: "var(--t-1)",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textAlign: "center",
            whiteSpace: "normal",
            lineHeight: 1.35,
            overflow: "hidden",
            textOverflow: "ellipsis",
            boxShadow: "0 4px 20px rgba(0,0,0,0.45)",
            pointerEvents: "none",
          }}
        >
          {notif}
        </div>
      )}

    </div>
  );
}

type NotifyCorner = "top-left" | "top-right";

function cornerBadgeStyle(corner: NotifyCorner): CSSProperties {
  return corner === "top-right"
    ? { top: -10, right: -12, left: "auto", bottom: "auto" }
    : { top: -10, left: -12, right: "auto", bottom: "auto" };
}

const StarPassMenuButton = forwardRef<HTMLButtonElement, {
  compact?: boolean;
  onClick: () => void;
  artBase: string;
  passLevel: number;
  passPct: number;
  xp: number;
  passNeed: number;
  badge: number;
  atMax: boolean;
}>(function StarPassMenuButton({
  compact,
  onClick,
  artBase,
  passLevel,
  passPct,
  xp,
  passNeed,
  badge,
  atMax,
}, ref) {
  const { t } = useI18n();
  const passW = compact ? 112 : 172;
  const ticketSize = compact ? 46 : 118;
  const starSize = compact ? 28 : 56;
  const barH = compact ? 16 : 22;
  const topRowH = compact ? 22 : 34;
  const xpLabel = compact ? 7 : 9;
  const xpInBar = compact ? 9 : 12;
  const xpText = atMax ? "MAX" : `${xp} / ${passNeed}`;

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      title={t("pass.title")}
      style={{
        position: "absolute",
        bottom: menuBottomInset(compact),
        left: compact ? 8 : 16,
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: compact ? 2 : 3,
        padding: compact ? "4px 5px 4px" : "8px 10px 8px",
        width: passW,
        maxWidth: passW,
        height: menuBottomBtnH(compact),
        minHeight: menuBottomBtnH(compact),
        maxHeight: menuBottomBtnH(compact),
        boxSizing: "border-box",
        cursor: "pointer",
        ["--ui-shear-text" as string]: "#ffffff",
        ["--ui-shear-text-shadow" as string]: "0 1px 2px rgba(0,0,0,0.65)",
        overflow: "visible",
        animation: compact ? undefined : "glow 3s ease-in-out infinite",
        ["--ui-shear-fill" as string]: compact
          ? "linear-gradient(135deg, rgba(74,20,140,0.6), rgba(206,147,216,0.4))"
          : "linear-gradient(160deg, rgba(74,20,140,0.7), rgba(123,47,190,0.45))",
        ["--ui-shear-border" as string]: compact ? "rgba(206,147,216,0.6)" : "var(--bd-violet)",
        ["--ui-shear-shadow" as string]: compact ? undefined : "var(--sh-md), var(--sh-glow-violet)",
        ["--ui-shear-blur" as string]: compact ? "blur(10px)" : "blur(14px) saturate(1.2)",
        ["--ui-shear-outline" as string]: "rgba(206,147,216,0.35)",
      }}
    >
      <NotificationBadge count={badge} notifyCorner="top-right" />
      <div style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        width: "100%",
        height: topRowH,
        minHeight: topRowH,
        maxHeight: topRowH,
        padding: compact ? "0 2px" : "0 4px",
        boxSizing: "border-box",
        overflow: "visible",
      }}>
        <img
          src={`${artBase}ui/star-pass-ticket.png`}
          alt=""
          className="ui-game-icon"
          style={{
            width: ticketSize,
            height: ticketSize,
            flexShrink: 0,
            marginLeft: compact ? -8 : -10,
            marginTop: compact ? -12 : -26,
            marginBottom: compact ? -14 : -30,
            pointerEvents: "none",
            filter: compact
              ? "drop-shadow(0 3px 10px rgba(255,213,79,0.7))"
              : "drop-shadow(0 5px 14px rgba(255,213,79,0.75))",
          }}
        />
        <PassLevelStar level={passLevel} size={starSize} overlap={compact ? -6 : -10} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: compact ? 3 : 5, flexShrink: 0 }}>
        <span style={{
          flexShrink: 0,
          fontSize: xpLabel,
          fontWeight: 900,
          letterSpacing: 0.5,
          color: "rgba(255,255,255,0.92)",
          lineHeight: 1,
        }}>XP</span>
        <div style={{
          position: "relative",
          flex: 1,
          height: barH,
          borderRadius: barH / 2,
          background: "rgba(0,0,0,0.45)",
          overflow: "hidden",
        }}>
          <div style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${passPct}%`,
            background: "linear-gradient(90deg, #FFD700, #CE93D8)",
            transition: "width 0.4s",
          }} />
          <span style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: xpInBar,
            fontWeight: 900,
            color: "#fff",
            letterSpacing: 0.3,
            lineHeight: 1,
            textShadow: "0 1px 2px rgba(0,0,0,0.85), 0 0 8px rgba(0,0,0,0.45)",
            pointerEvents: "none",
          }}>
            {xpText}
          </span>
        </div>
      </div>
    </button>
  );
});

function PassLevelStar({ level, size, overlap = 0, pullLeft = 0 }: { level: number; size: number; overlap?: number; pullLeft?: number }) {
  const fontSize = Math.max(10, Math.round(size * 0.34));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0, marginBottom: overlap, marginLeft: pullLeft ? -pullLeft : undefined }}>
      <GlowingStar filled size={size} />
      <span style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize,
        fontWeight: 900,
        color: "#3E2723",
        textShadow: "0 1px 0 rgba(255,255,255,0.45)",
        lineHeight: 1,
        pointerEvents: "none",
      }}>
        {level}
      </span>
    </div>
  );
}

function partyPlusEdgeStyle(
  edgeSide: "left" | "right",
  edgeIndex: number,
  compact?: boolean,
): CSSProperties {
  const top = (compact ? 44 : 46) + edgeIndex * (compact ? 10 : 11);
  return {
    position: "absolute",
    top: `${top}%`,
    transform: "translateY(-50%)",
    zIndex: 7,
    pointerEvents: "auto",
    ...(edgeSide === "left"
      ? { left: compact ? 76 : 92 }
      : { right: compact ? 76 : 92 }),
  };
}

function PartyPlusButton({
  slot,
  edgeSide,
  edgeIndex,
  compact,
  embedded = false,
  outgoingInvite,
  onOpenPanel,
  onCancelInvite,
}: {
  slot: PartySlot;
  edgeSide?: "left" | "right";
  edgeIndex?: number;
  compact?: boolean;
  embedded?: boolean;
  outgoingInvite: OutgoingPartyInvite | null;
  onOpenPanel: () => void;
  onCancelInvite: () => void;
}) {
  const { t } = useI18n();
  const color = "#CE93D8";
  const pos = embedded
    ? undefined
    : partyPlusEdgeStyle(edgeSide ?? "left", edgeIndex ?? 0, compact);

  return (
    <div style={pos}>
      {outgoingInvite && (
        <div style={{
          position: "absolute",
          bottom: "100%",
          left: "50%",
          transform: "translateX(-50%)",
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          gap: 4,
          whiteSpace: "nowrap",
          fontSize: 9,
          fontWeight: 800,
          color: "#FFE082",
          background: "rgba(0,0,0,0.72)",
          border: "1px solid rgba(255,224,130,0.45)",
          borderRadius: 8,
          padding: "4px 6px 4px 8px",
          zIndex: 8,
        }}>
          <span>{t("nav.inviting", { username: outgoingInvite.targetUsername })}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCancelInvite(); }}
            title={t("nav.inviteCancel")}
            style={{
              width: 18,
              height: 18,
              border: "none",
              borderRadius: 4,
              background: "rgba(255,80,80,0.35)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 900,
              lineHeight: 1,
              cursor: "pointer",
              padding: 0,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={onOpenPanel}
        title={t("nav.inviteTeam")}
        style={{
          width: compact ? 48 : 56,
          height: compact ? 48 : 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: compact ? 28 : 32,
          fontWeight: 900,
          color: "#fff",
          cursor: "pointer",
          opacity: 0.82,
          transition: "opacity 0.2s, box-shadow 0.2s",
          ["--ui-shear-fill" as string]: "linear-gradient(160deg, rgba(15,8,42,0.68), rgba(8,4,24,0.78))",
          ["--ui-shear-border" as string]: color,
          ["--ui-shear-shadow" as string]: `0 0 18px ${color}55, var(--sh-md)`,
          ["--ui-shear-blur" as string]: "blur(12px) saturate(1.2)",
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = "0.82"; }}
      >
        +
      </button>
    </div>
  );
}

function PartyReadyBadge({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <PartyMemberStatusBadge
      compact={compact}
      label={t("nav.partyReady")}
      variant="ready"
    />
  );
}

function PartyActivityBadge({ compact, label }: { compact?: boolean; label: string }) {
  return (
    <PartyMemberStatusBadge
      compact={compact}
      label={label}
      variant="activity"
    />
  );
}

function PartyMemberStatusBadge({
  compact,
  label,
  variant,
}: {
  compact?: boolean;
  label: string;
  variant: "ready" | "activity";
}) {
  const ready = variant === "ready";
  const long = label.length > 14;
  return (
    <div
      className="no-ui-shear"
      style={{
        position: "absolute",
        top: "52%",
        left: "58%",
        transform: "translate(-50%, -50%)",
        zIndex: 5,
        pointerEvents: "none",
        padding: compact ? "5px 10px" : "7px 14px",
        maxWidth: compact ? 118 : 148,
        background: "rgba(0, 0, 0, 0.42)",
        border: ready
          ? "1.5px solid rgba(129, 199, 132, 0.7)"
          : "1.5px solid rgba(100, 181, 246, 0.75)",
        borderRadius: 8,
        color: ready ? "rgba(220, 255, 225, 0.95)" : "rgba(210, 235, 255, 0.96)",
        fontSize: compact ? (long ? 8 : 10) : (long ? 10 : 12),
        fontWeight: 900,
        letterSpacing: ready ? "0.14em" : "0.04em",
        textTransform: ready ? "uppercase" : "none",
        textAlign: "center",
        lineHeight: 1.15,
        boxShadow: "0 4px 18px rgba(0,0,0,0.4)",
        backdropFilter: "blur(4px)",
      }}
    >
      {label}
    </div>
  );
}

function PartySlotArea({
  compact,
  mate,
  side,
  overlapMargin = 0,
  statsStagger = 0,
  showReadyBadge = false,
  activityLabel = null,
  senderSuggest,
  canAnswerSuggest,
  onTeammateClick,
  onSuggestBubbleClick,
  showRankedBars = false,
  rankedCups = 0,
  rankedPeakCups = 0,
}: {
  compact?: boolean;
  mate: PartyTeammateView;
  side: "left" | "right";
  overlapMargin?: number;
  statsStagger?: number;
  showReadyBadge?: boolean;
  activityLabel?: string | null;
  senderSuggest?: PartyBrawlerSuggestion | null;
  canAnswerSuggest?: boolean;
  onTeammateClick: (anchor: DOMRect) => void;
  onSuggestBubbleClick: () => void;
  showRankedBars?: boolean;
  rankedCups?: number;
  rankedPeakCups?: number;
}) {
  const brawlerW = compact ? 243 : 270;
  const brawlerH = compact ? 259 : 288;
  const b = getBrawlerById(mate.brawlerId);
  const mateProfile = getProfileByPlayerId(mate.playerId);
  const mateTrophies = getBrawlerTrophies(mateProfile, mate.brawlerId)
    || mateProfile?.trophies
    || 0;
  const mateLevel = mateProfile?.brawlerLevels?.[mate.brawlerId] || 1;
  const mateStars = getBrawlerStarsCount(mateProfile, mate.brawlerId);

  return (
    <div
      style={{
        width: brawlerW,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        pointerEvents: "auto",
        cursor: "pointer",
        flexShrink: 0,
        marginLeft: overlapMargin,
        overflow: "visible",
      }}
      onClick={(e) => onTeammateClick((e.currentTarget as HTMLElement).getBoundingClientRect())}
      title={mate.username}
    >
      <div style={{
        position: "relative",
        width: brawlerW,
        height: brawlerH,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {senderSuggest && (
          <div
            style={{
              position: "absolute",
              bottom: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              marginBottom: 52 + statsStagger,
              zIndex: 8,
            }}
            onClick={e => e.stopPropagation()}
          >
            <PartyBrawlerSuggestBubble
              suggestion={senderSuggest}
              compact={compact}
              onClick={canAnswerSuggest ? onSuggestBubbleClick : undefined}
            />
          </div>
        )}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginBottom: 10 + statsStagger,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            whiteSpace: "nowrap",
            zIndex: 6,
            maxWidth: brawlerW + 40,
          }}
        >
          <div style={{
            fontSize: compact ? 10 : 11,
            fontWeight: 800,
            color: "#CE93D8",
            maxWidth: brawlerW + 40,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "center",
          }}>
            {mate.username}
          </div>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: compact ? 6 : 8,
          }}>
            {showRankedBars ? (
              <RankedLeagueBar
                totalCups={rankedCups}
                peakCups={rankedPeakCups}
                layout="compact"
                badgeScale={MENU_RANK_BADGE_SCALE}
                powerLevel={mateLevel}
              />
            ) : (
              <BrawlerRankBar
                brawlerId={mate.brawlerId}
                trophies={mateTrophies}
                layout="compact"
                badgeScale={MENU_RANK_BADGE_SCALE}
                powerLevel={mateLevel}
                clickable={false}
                showUnclaimedBadge={false}
              />
            )}
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "rgba(0,0,0,0.55)",
              border: "1px solid rgba(255,215,0,0.45)",
              borderRadius: 8,
              padding: compact ? "3px 6px" : "4px 8px",
              color: "#FFE082",
              fontSize: compact ? 11 : 12,
              fontWeight: 800,
            }}>
              ★ {mateStars}/6
            </span>
          </div>
        </div>
        <div style={{
          position: "absolute",
          inset: 0,
          minWidth: brawlerW,
          minHeight: brawlerH,
          background: `radial-gradient(circle at 50% 60%, ${b?.color ?? "#CE93D8"}55 0%, transparent 65%)`,
        }} />
        <MenuPartyBrawler3D
          key={`mate-${mate.playerId}-${mate.brawlerId}`}
          brawlerId={mate.brawlerId}
          color={b?.color ?? "#CE93D8"}
          size={brawlerW}
        />
        {showReadyBadge && <PartyReadyBadge compact={compact} />}
        {!showReadyBadge && activityLabel && (
          <PartyActivityBadge compact={compact} label={activityLabel} />
        )}
      </div>
    </div>
  );
}

function SideButton({
  icon, imgSrc, label, onClick, color, pulse, badge, compact, giftTag, dealsNewTag, notifyCorner = "top-right", menuBar,
  menuBarWidth, menuBarIconSize, menuBarIconScale, menuBarIconBottom, menuBarHeight, menuBarPadding, labelWrap, hideLabel, menuBarIconCenter,
  innerRef,
}: {
  icon: string; imgSrc?: string; label: string; onClick: () => void; color: string;
  pulse?: boolean; badge?: number; compact?: boolean; giftTag?: boolean; dealsNewTag?: boolean; notifyCorner?: NotifyCorner;
  /** Compact top-bar variant: same icon/button ratio as side nav, fits menu header row */
  menuBar?: boolean;
  /** Optional menu-bar overrides (e.g. ranked button: wider + larger icon). */
  menuBarWidth?: number;
  menuBarIconSize?: number;
  menuBarIconScale?: number;
  /** Icon anchor offset from slot bottom (more negative = lower). */
  menuBarIconBottom?: number;
  /** Fixed menu-bar height (e.g. 52 to match TrophyRoadMenuButton). */
  menuBarHeight?: number;
  menuBarPadding?: string;
  /** Allow multi-line label at the same font size when text is longer than btn width. */
  labelWrap?: boolean;
  /** Hide visible label (tooltip/alt still use label text). */
  hideLabel?: boolean;
  /** Center icon in the button instead of anchoring to bottom. */
  menuBarIconCenter?: boolean;
  innerRef?: Ref<HTMLButtonElement>;
}) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const base = (import.meta as any).env?.BASE_URL ?? "/";
  const fill = hovered
    ? `linear-gradient(160deg, ${color}30, rgba(8,4,24,0.92))`
    : "linear-gradient(160deg, rgba(15,8,42,0.72), rgba(8,4,24,0.86))";
  const border = hovered ? color : "var(--bd-1)";
  const shadow = hovered
    ? `0 0 22px ${color}66, var(--sh-md), inset 0 1px 0 rgba(255,255,255,0.12)`
    : "var(--sh-sm), inset 0 1px 0 rgba(255,255,255,0.06)";
  const btnW = menuBarWidth ?? (menuBar ? (compact ? 50 : 56) : (compact ? 56 : 64));
  const labelSize = menuBar ? (compact ? 9 : 10) : (compact ? 8 : 10);
  const labelLineH = labelSize * 1.1;
  const labelBlockH = hideLabel ? 0 : labelWrap ? labelLineH * 2 : labelLineH;
  const btnPadding = menuBarPadding ?? (menuBar ? (compact ? "0 1px 2px" : "0 2px 3px") : (compact ? "0 2px 3px" : "0 3px 4px"));
  const iconSlotH = menuBarHeight && (hideLabel || menuBarIconCenter)
    ? menuBarHeight
    : menuBarHeight
      ? Math.max(18, menuBarHeight - 3 - 6 - labelBlockH)
      : menuBar ? (compact ? 38 : 42) : (compact ? 50 : 56);
  const iconPx = menuBarIconSize ?? (menuBar ? (compact ? 52 : 58) : (compact ? 60 : 68));
  const iconScale = menuBarIconScale ?? (menuBar ? (compact ? 1.14 : 1.18) : (compact ? 1.16 : 1.2));
  const iconBottom = menuBarIconBottom ?? (menuBar ? (compact ? -2 : -3) : (compact ? -4 : -5));
  const giftPos = cornerBadgeStyle(notifyCorner);
  return (
    <button
      ref={innerRef}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: menuBarIconCenter || hideLabel ? "center" : "flex-end",
        gap: 0,
        overflow: "visible",
        padding: btnPadding,
        color: "var(--t-1)", cursor: "pointer",
        width: btnW,
        minWidth: btnW,
        ...(menuBarHeight ? { minHeight: menuBarHeight, maxHeight: menuBarHeight, height: menuBarHeight } : {}),
        transition: "box-shadow var(--ease-mid), border-color var(--ease-mid)",
        animation: pulse ? "pulse 1.6s ease-in-out infinite" : undefined,
        letterSpacing: "0.04em",
        ["--ui-shear-text" as string]: "#ffffff",
        ["--ui-shear-fill" as string]: fill,
        ["--ui-shear-border" as string]: border,
        ["--ui-shear-shadow" as string]: shadow,
        ["--ui-shear-blur" as string]: "blur(12px) saturate(1.18)",
        ["--ui-shear-outline" as string]: hovered ? `${color}55` : "rgba(255,255,255,0.12)",
      }}
    >
      <div style={{
        width: btnW,
        height: iconSlotH,
        position: "relative",
        flexShrink: 0,
        overflow: "visible",
      }}>
        {imgSrc ? (
          <img
            src={`${base}${imgSrc}`}
            alt={label}
            className="ui-game-icon"
            style={{
              position: "absolute",
              left: "50%",
              ...(menuBarIconCenter
                ? { top: "50%", transform: `translate(-50%, -50%) scale(${iconScale})`, transformOrigin: "50% 50%" }
                : { bottom: iconBottom, transform: `translateX(-50%) scale(${iconScale})`, transformOrigin: "50% 100%" }),
              width: iconPx,
              height: iconPx,
              maxWidth: "none",
              pointerEvents: "none",
              zIndex: 2,
              filter: hovered ? `drop-shadow(0 0 10px ${color})` : "none",
              transition: "filter 0.2s",
            }}
          />
        ) : (
          <span style={{
            position: "absolute",
            left: "50%",
            bottom: 0,
            transform: `translateX(-50%) scale(${iconScale})`,
            transformOrigin: "50% 100%",
            fontSize: iconPx * 0.55,
            lineHeight: 1,
            zIndex: 2,
          }}>{icon}</span>
        )}
      </div>
      {!hideLabel && (
        <span style={{
          fontSize: labelSize,
          fontWeight: 900,
          letterSpacing: labelWrap ? 0.05 : 0.15,
          color: "#fff",
          whiteSpace: labelWrap ? "normal" : "nowrap",
          lineHeight: 1.1,
          textAlign: "center",
          maxWidth: labelWrap ? btnW : undefined,
          position: "relative",
          zIndex: 1,
          textShadow: "0 1px 2px rgba(0,0,0,0.85)",
          WebkitFontSmoothing: "antialiased",
        }}>{label}</span>
      )}
      {giftTag && (
        <span className="no-ui-shear" style={{
          position: "absolute", zIndex: 12, ...giftPos,
          background: "linear-gradient(135deg, #00C853, #69F0AE)",
          border: "1px solid rgba(255,255,255,0.45)",
          color: "#003b1b",
          borderRadius: 999,
          fontSize: compact ? 7 : 9,
          fontWeight: 900,
          padding: compact ? "1px 5px" : "2px 7px",
          letterSpacing: 0.4,
          boxShadow: "0 0 14px rgba(105,240,174,0.95), 0 0 24px rgba(105,240,174,0.45)",
        }}>{t("common.gift")}</span>
      )}
      {dealsNewTag && (
        <span className="no-ui-shear" style={{
          position: "absolute",
          zIndex: 12,
          top: compact ? (giftTag ? 10 : 2) : (giftTag ? 12 : 4),
          right: compact ? -6 : -8,
          background: "linear-gradient(135deg, #FF1744, #D50000)",
          border: "1px solid rgba(255,255,255,0.45)",
          color: "#fff",
          borderRadius: 999,
          fontSize: compact ? 7 : 9,
          fontWeight: 900,
          padding: compact ? "1px 5px" : "2px 7px",
          letterSpacing: 0.4,
          boxShadow: "0 0 14px rgba(255,23,68,0.95), 0 0 24px rgba(255,23,68,0.45)",
        }}>{t("common.new")}</span>
      )}
      <NotificationBadge count={badge ?? 0} notifyCorner={notifyCorner} />
    </button>
  );
}

// Small red circular indicator showing the number of unclaimed/unread items.
// Positioned in the top-right corner of any `position: relative` container.
// Renders nothing when count is 0 so it disappears once everything is claimed.
function NotificationBadge({
  count, style, notifyCorner = "top-right",
}: { count: number; style?: CSSProperties; notifyCorner?: NotifyCorner }) {
  if (!count || count <= 0) return null;
  const display = count > 99 ? "99+" : String(count);
  return (
    <span
      className="no-ui-shear"
      style={{
        position: "absolute",
        ...cornerBadgeStyle(notifyCorner),
        minWidth: 20, height: 20,
        padding: "0 6px",
        borderRadius: 10,
        background: "linear-gradient(135deg, #FF1744, #D50000)",
        border: "2px solid #160048",
        color: "white",
        fontSize: 11, fontWeight: 900, letterSpacing: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 12px rgba(255,23,68,0.85), 0 0 22px rgba(255,23,68,0.35)",
        animation: "pulse 1.4s ease-in-out infinite",
        pointerEvents: "none",
        zIndex: 12,
        lineHeight: 1,
        ...style,
      }}
    >
      {display}
    </span>
  );
}
