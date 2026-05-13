// =========================================================================
// CLUBS (Гильдии) — global directory of clubs with members, chat, and
// per-cycle battle rewards.
//
// Storage (all under localStorage):
//   clash_clubs_v1          — Record<clubId, Club>
//
// Per-profile we additionally stash (free-form, cast as any):
//   clubId            — current club id (string | null)
//   clubInvites       — string[] of pending club ids
//   clubRewardLog     — string[] reward ids the user has been credited (audit only)
// =========================================================================

import {
  getCurrentProfile, getCurrentUsername, updateProfile,
  getAllProfiles, saveProfiles,
} from "./localStorageAPI";

const CLUBS_KEY = "clash_clubs_v1";

export const CLUB_NAME_MAX        = 20;
export const CLUB_DESC_MAX        = 100;
export const CLUB_CHAT_MAX        = 200;
export const CLUB_MEMBERS_MAX     = 50;
export const CLUB_BATTLES_PER_REWARD = 30;
export const CLUB_CHAT_RETENTION_MS = 30 * 24 * 3600 * 1000; // 1 month
export const CLUB_REWARD_COINS    = 200;
export const CLUB_REWARD_GEMS     = 2;
export const CLUB_REWARD_PP       = 5;

export type ClubRole = "leader" | "helper" | "member";
export type ClubType = "open" | "closed";

export interface ClubMember {
  username: string;
  role: ClubRole;
  joinedAt: number;
  battlesContributed: number;
}

export interface ClubMessage {
  id: string;
  sentAt: number;
  username: string;        // empty if system === true
  text: string;
  system?: boolean;
}

export interface JoinRequest {
  username: string;
  requestedAt: number;
}

export interface Club {
  id: string;
  name: string;
  description: string;
  type: ClubType;
  avatarDataUrl?: string;          // user-uploaded image
  avatarPreset?: string;           // preset id (gradient + emoji)
  createdAt: number;
  createdBy: string;               // original founder username (immutable)
  members: ClubMember[];
  pendingRequests: JoinRequest[];
  battleCount: number;             // current cycle progress 0..CLUB_BATTLES_PER_REWARD-1
  totalBattles: number;            // lifetime battles
  rewardsClaimed: number;          // # of completed cycles
  chat: ClubMessage[];
}

// ── Avatar presets (procedural — no image generation API needed) ────────
export const CLUB_AVATAR_PRESETS = [
  { id: "fire",      emoji: "🔥", gradient: ["#FF6B35", "#FFD23F"] },
  { id: "lightning", emoji: "⚡", gradient: ["#FFE066", "#FFB300"] },
  { id: "skull",     emoji: "💀", gradient: ["#37474F", "#90A4AE"] },
  { id: "shield",    emoji: "🛡️", gradient: ["#1976D2", "#64B5F6"] },
  { id: "sword",     emoji: "⚔️", gradient: ["#5D4037", "#A1887F"] },
  { id: "crown",     emoji: "👑", gradient: ["#FFD700", "#FF8F00"] },
  { id: "rocket",    emoji: "🚀", gradient: ["#7B1FA2", "#E040FB"] },
  { id: "dragon",    emoji: "🐉", gradient: ["#388E3C", "#AED581"] },
  { id: "alien",     emoji: "👽", gradient: ["#00897B", "#80DEEA"] },
  { id: "ghost",     emoji: "👻", gradient: ["#5C6BC0", "#C5CAE9"] },
  { id: "star",      emoji: "⭐", gradient: ["#FFB300", "#FFE082"] },
  { id: "diamond",   emoji: "💎", gradient: ["#0288D1", "#81D4FA"] },
  { id: "wolf",      emoji: "🐺", gradient: ["#455A64", "#B0BEC5"] },
  { id: "lion",      emoji: "🦁", gradient: ["#E65100", "#FFCC80"] },
  { id: "phoenix",   emoji: "🦅", gradient: ["#D81B60", "#F48FB1"] },
  { id: "trophy",    emoji: "🏆", gradient: ["#F9A825", "#FFF176"] },
] as const;

// ── Storage helpers ─────────────────────────────────────────────────────
function readAll(): Record<string, Club> {
  try {
    const raw = localStorage.getItem(CLUBS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Club>) : {};
  } catch { return {}; }
}

function writeAll(clubs: Record<string, Club>): void {
  localStorage.setItem(CLUBS_KEY, JSON.stringify(clubs));
}

function pruneChat(club: Club): Club {
  const cutoff = Date.now() - CLUB_CHAT_RETENTION_MS;
  const filtered = club.chat.filter(m => m.sentAt >= cutoff);
  if (filtered.length !== club.chat.length) {
    club.chat = filtered;
  }
  return club;
}

function uid(prefix = "c"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Public read API ─────────────────────────────────────────────────────
export function getAllClubs(): Club[] {
  return Object.values(readAll()).map(pruneChat);
}

export function searchClubs(query: string): Club[] {
  const q = query.trim().toLowerCase();
  const all = getAllClubs();
  if (!q) return all;
  return all.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.description.toLowerCase().includes(q),
  );
}

export function getClub(id: string): Club | null {
  const c = readAll()[id];
  return c ? pruneChat(c) : null;
}

export function getMyClub(): Club | null {
  const prof: any = getCurrentProfile();
  if (!prof?.clubId) return null;
  const club = getClub(prof.clubId);
  // Auto-heal: if profile thinks we're in a club we no longer belong to,
  // clear the stale pointer.
  if (!club) {
    updateProfile({ clubId: null } as any);
    return null;
  }
  const me = getCurrentUsername();
  if (!club.members.some(m => m.username === me)) {
    updateProfile({ clubId: null } as any);
    return null;
  }
  return club;
}

export function getMyClubInvites(): Club[] {
  const prof: any = getCurrentProfile();
  const ids: string[] = prof?.clubInvites ?? [];
  return ids.map(id => getClub(id)).filter(Boolean) as Club[];
}

export function getMyRole(club: Club): ClubRole | null {
  const me = getCurrentUsername();
  if (!me) return null;
  return club.members.find(m => m.username === me)?.role ?? null;
}

// ── Mutations ────────────────────────────────────────────────────────────
export function createClub(opts: {
  name: string;
  description: string;
  type: ClubType;
  avatarDataUrl?: string;
  avatarPreset?: string;
}): { success: boolean; club?: Club; error?: string } {
  const me = getCurrentUsername();
  if (!me) return { success: false, error: "Не авторизован" };
  const name = opts.name.trim().slice(0, CLUB_NAME_MAX);
  if (!name) return { success: false, error: "Название обязательно" };
  const description = (opts.description ?? "").trim().slice(0, CLUB_DESC_MAX);
  // Already in a club?
  if (getMyClub()) return { success: false, error: "Сначала покиньте текущий клуб" };

  const all = readAll();
  const id = uid("club");
  const club: Club = {
    id, name, description, type: opts.type,
    avatarDataUrl: opts.avatarDataUrl,
    avatarPreset: opts.avatarPreset ?? CLUB_AVATAR_PRESETS[0].id,
    createdAt: Date.now(),
    createdBy: me,
    members: [{ username: me, role: "leader", joinedAt: Date.now(), battlesContributed: 0 }],
    pendingRequests: [],
    battleCount: 0,
    totalBattles: 0,
    rewardsClaimed: 0,
    chat: [systemMsg("Клуб создан. Добро пожаловать!")],
  };
  all[id] = club;
  writeAll(all);
  updateProfile({ clubId: id } as any);
  return { success: true, club };
}

function systemMsg(text: string): ClubMessage {
  return { id: uid("m"), sentAt: Date.now(), username: "", text, system: true };
}

export function joinClub(clubId: string): { success: boolean; pending?: boolean; error?: string } {
  const me = getCurrentUsername();
  if (!me) return { success: false, error: "Не авторизован" };
  if (getMyClub()) return { success: false, error: "Сначала покиньте текущий клуб" };
  const all = readAll();
  const club = all[clubId];
  if (!club) return { success: false, error: "Клуб не найден" };
  if (club.members.length >= CLUB_MEMBERS_MAX) return { success: false, error: "Клуб заполнен" };

  if (club.type === "open") {
    addMember(club, me);
    pushChat(club, systemMsg(`${me} вступил(а) в клуб`));
    writeAll(all);
    updateProfile({ clubId: club.id } as any);
    return { success: true };
  }
  // Closed → request
  if (club.pendingRequests.some(r => r.username === me)) {
    return { success: false, pending: true, error: "Заявка уже отправлена" };
  }
  club.pendingRequests = [...club.pendingRequests, { username: me, requestedAt: Date.now() }];
  writeAll(all);
  return { success: true, pending: true };
}

function addMember(club: Club, username: string, role: ClubRole = "member"): void {
  if (club.members.some(m => m.username === username)) return;
  club.members.push({ username, role, joinedAt: Date.now(), battlesContributed: 0 });
}

export function leaveClub(): { success: boolean; error?: string } {
  const me = getCurrentUsername();
  if (!me) return { success: false, error: "Не авторизован" };
  const club = getMyClub();
  if (!club) return { success: false, error: "Вы не в клубе" };
  const all = readAll();
  const c = all[club.id];
  if (!c) return { success: false, error: "Клуб не найден" };
  c.members = c.members.filter(m => m.username !== me);
  // If leader left, promote a successor (helper first, otherwise oldest member)
  if (!c.members.some(m => m.role === "leader")) {
    const helper = c.members.find(m => m.role === "helper");
    if (helper) helper.role = "leader";
    else if (c.members.length > 0) {
      c.members.sort((a, b) => a.joinedAt - b.joinedAt);
      c.members[0].role = "leader";
    }
  }
  pushChat(c, systemMsg(`${me} покинул(а) клуб`));
  if (c.members.length === 0) {
    delete all[club.id];
  }
  writeAll(all);
  updateProfile({ clubId: null } as any);
  return { success: true };
}

export function deleteClub(clubId: string): { success: boolean; error?: string } {
  const me = getCurrentUsername();
  const all = readAll();
  const c = all[clubId];
  if (!c) return { success: false, error: "Клуб не найден" };
  if (c.createdBy !== me) return { success: false, error: "Только создатель может удалить клуб" };

  const profiles = getAllProfiles();
  for (const m of c.members) {
    if (!profiles[m.username]) continue;
    (profiles[m.username] as any).clubId = null;
  }
  saveProfiles(profiles);
  delete all[clubId];
  writeAll(all);

  // Ensure active profile immediately reflects deletion.
  updateProfile({ clubId: null } as any);
  return { success: true };
}

export function kickMember(clubId: string, username: string): { success: boolean; error?: string } {
  const me = getCurrentUsername();
  const all = readAll();
  const c = all[clubId];
  if (!c) return { success: false, error: "Клуб не найден" };
  // Per spec: only the founder/creator can kick.
  if (c.createdBy !== me) return { success: false, error: "Только создатель клуба может выгонять" };
  if (username === c.createdBy) return { success: false, error: "Нельзя выгнать создателя" };
  if (!c.members.some(m => m.username === username)) return { success: false, error: "Не участник" };
  c.members = c.members.filter(m => m.username !== username);
  pushChat(c, systemMsg(`${username} был(а) исключён(а) лидером`));
  writeAll(all);
  // Clear the kicked user's clubId on their profile.
  const profiles = getAllProfiles();
  if (profiles[username]) {
    (profiles[username] as any).clubId = null;
    saveProfiles(profiles);
  }
  return { success: true };
}

export function setMemberRole(clubId: string, username: string, role: ClubRole):
{ success: boolean; error?: string } {
  const me = getCurrentUsername();
  const all = readAll();
  const c = all[clubId];
  if (!c) return { success: false, error: "Клуб не найден" };
  if (c.createdBy !== me) return { success: false, error: "Только создатель может назначать роли" };
  // Disallow changing the founder's role away from "leader".
  if (username === c.createdBy && role !== "leader") {
    return { success: false, error: "Нельзя сменить роль создателя" };
  }
  const m = c.members.find(x => x.username === username);
  if (!m) return { success: false, error: "Не участник" };
  m.role = role;
  pushChat(c, systemMsg(`${username} теперь ${role === "leader" ? "лидер" : role === "helper" ? "помощник" : "участник"}`));
  writeAll(all);
  return { success: true };
}

// Leader sends a direct invite to a username. The invitee sees it in their
// invites list and can accept it from the clubs page.
export function inviteUser(clubId: string, username: string): { success: boolean; error?: string } {
  const me = getCurrentUsername();
  const all = readAll();
  const c = all[clubId];
  if (!c) return { success: false, error: "Клуб не найден" };
  if (c.createdBy !== me) return { success: false, error: "Только создатель может приглашать" };
  if (c.members.some(m => m.username === username)) return { success: false, error: "Уже в клубе" };
  if (c.members.length >= CLUB_MEMBERS_MAX) return { success: false, error: "Клуб заполнен" };
  const profiles = getAllProfiles();
  if (!profiles[username]) return { success: false, error: "Игрок не найден" };
  const list: string[] = (profiles[username] as any).clubInvites ?? [];
  if (list.includes(clubId)) return { success: false, error: "Уже приглашён" };
  (profiles[username] as any).clubInvites = [...list, clubId];
  saveProfiles(profiles);
  pushChat(c, systemMsg(`${username} приглашён(а) в клуб`));
  writeAll(all);
  return { success: true };
}

export function acceptInvite(clubId: string): { success: boolean; error?: string } {
  const me = getCurrentUsername();
  if (!me) return { success: false, error: "Не авторизован" };
  if (getMyClub()) return { success: false, error: "Сначала покиньте текущий клуб" };
  const all = readAll();
  const c = all[clubId];
  if (!c) return { success: false, error: "Клуб не найден" };
  if (c.members.length >= CLUB_MEMBERS_MAX) return { success: false, error: "Клуб заполнен" };
  addMember(c, me);
  pushChat(c, systemMsg(`${me} принял(а) приглашение`));
  writeAll(all);
  // Clear the invite from profile and set new club.
  const prof: any = getCurrentProfile();
  const list: string[] = prof?.clubInvites ?? [];
  updateProfile({
    clubId: c.id,
    clubInvites: list.filter(id => id !== clubId),
  } as any);
  return { success: true };
}

export function declineInvite(clubId: string): void {
  const prof: any = getCurrentProfile();
  const list: string[] = prof?.clubInvites ?? [];
  updateProfile({ clubInvites: list.filter(id => id !== clubId) } as any);
}

export function approveJoinRequest(clubId: string, username: string):
{ success: boolean; error?: string } {
  const me = getCurrentUsername();
  const all = readAll();
  const c = all[clubId];
  if (!c) return { success: false, error: "Клуб не найден" };
  const myRole = c.members.find(m => m.username === me)?.role;
  if (!(myRole === "leader" || myRole === "helper")) {
    return { success: false, error: "Нет прав" };
  }
  if (!c.pendingRequests.some(r => r.username === username)) {
    return { success: false, error: "Заявки нет" };
  }
  if (c.members.length >= CLUB_MEMBERS_MAX) return { success: false, error: "Клуб заполнен" };
  c.pendingRequests = c.pendingRequests.filter(r => r.username !== username);
  addMember(c, username);
  pushChat(c, systemMsg(`${username} вступил(а) в клуб`));
  writeAll(all);
  // Update the joiner's profile pointer.
  const profiles = getAllProfiles();
  if (profiles[username]) {
    (profiles[username] as any).clubId = c.id;
    saveProfiles(profiles);
  }
  return { success: true };
}

export function denyJoinRequest(clubId: string, username: string): void {
  const me = getCurrentUsername();
  const all = readAll();
  const c = all[clubId];
  if (!c) return;
  const myRole = c.members.find(m => m.username === me)?.role;
  if (!(myRole === "leader" || myRole === "helper")) return;
  c.pendingRequests = c.pendingRequests.filter(r => r.username !== username);
  writeAll(all);
}

export function updateClubInfo(clubId: string, patch: {
  name?: string; description?: string; type?: ClubType;
  avatarDataUrl?: string | null; avatarPreset?: string;
}): { success: boolean; error?: string } {
  const me = getCurrentUsername();
  const all = readAll();
  const c = all[clubId];
  if (!c) return { success: false, error: "Клуб не найден" };
  // Only the founder can edit name (per spec). Description/type/avatar can
  // be tweaked by helpers too, but to keep things simple we reuse the same
  // gate — only the creator can edit anything club-info-wise.
  if (c.createdBy !== me) return { success: false, error: "Только создатель может изменять клуб" };
  if (patch.name !== undefined) c.name = patch.name.trim().slice(0, CLUB_NAME_MAX) || c.name;
  if (patch.description !== undefined) c.description = patch.description.slice(0, CLUB_DESC_MAX);
  if (patch.type !== undefined) c.type = patch.type;
  if (patch.avatarDataUrl !== undefined) {
    c.avatarDataUrl = patch.avatarDataUrl ?? undefined;
  }
  if (patch.avatarPreset !== undefined) c.avatarPreset = patch.avatarPreset;
  writeAll(all);
  return { success: true };
}

// ── Chat ────────────────────────────────────────────────────────────────
function pushChat(club: Club, msg: ClubMessage): void {
  club.chat = [...club.chat, msg];
  pruneChat(club);
}

export function sendChatMessage(clubId: string, text: string): { success: boolean; error?: string } {
  const me = getCurrentUsername();
  if (!me) return { success: false, error: "Не авторизован" };
  const trimmed = text.trim().slice(0, CLUB_CHAT_MAX);
  if (!trimmed) return { success: false, error: "Пустое сообщение" };
  const all = readAll();
  const c = all[clubId];
  if (!c) return { success: false, error: "Клуб не найден" };
  if (!c.members.some(m => m.username === me)) return { success: false, error: "Только участники клуба могут писать" };
  pushChat(c, { id: uid("m"), sentAt: Date.now(), username: me, text: trimmed });
  writeAll(all);
  return { success: true };
}

// ── Battle hook ─────────────────────────────────────────────────────────
// Called from recordGameResult after every non-training match. The increment
// applies to the calling user's own club. Once the cycle completes, every
// member of the club is granted the reward by mutating each profile.
export function recordClubBattle(username: string, mode: string): void {
  if (mode === "training") return;
  const profiles = getAllProfiles();
  const prof: any = profiles[username];
  const clubId: string | undefined = prof?.clubId ?? undefined;
  if (!clubId) return;
  const all = readAll();
  const club = all[clubId];
  if (!club) return;
  // Bump per-member contribution + cycle counter.
  const me = club.members.find(m => m.username === username);
  if (me) me.battlesContributed += 1;
  club.battleCount += 1;
  club.totalBattles += 1;
  if (club.battleCount >= CLUB_BATTLES_PER_REWARD) {
    club.battleCount = 0;
    club.rewardsClaimed += 1;
    pushChat(club, systemMsg(
      `Клуб достиг ${CLUB_BATTLES_PER_REWARD} боёв! ` +
      `Все участники получили награду: +${CLUB_REWARD_COINS} монет, +${CLUB_REWARD_GEMS} крист., +${CLUB_REWARD_PP} ОС`,
    ));
    // Distribute the reward to every member's profile.
    for (const m of club.members) {
      const p: any = profiles[m.username];
      if (!p) continue;
      p.coins = (p.coins ?? 0) + CLUB_REWARD_COINS;
      p.gems = (p.gems ?? 0) + CLUB_REWARD_GEMS;
      p.powerPoints = (p.powerPoints ?? 0) + CLUB_REWARD_PP;
      // Also leave a breadcrumb so we can show a one-shot "club reward!" toast.
      const log: string[] = p.clubRewardLog ?? [];
      p.clubRewardLog = [...log, `${club.id}_${club.rewardsClaimed}`].slice(-20);
    }
  }
  saveProfiles(profiles);
  all[clubId] = club;
  writeAll(all);
}

// Auto-subscribe to the battle-finished event dispatched by recordGameResult
// in localStorageAPI.ts. We use an event bridge instead of a direct import to
// avoid a circular ESM dependency (clubs.ts already imports from that module).
if (typeof window !== "undefined" && !(window as any).__clashClubsHookInstalled) {
  (window as any).__clashClubsHookInstalled = true;
  window.addEventListener("clash:battle-finished", (e: Event) => {
    const detail = (e as CustomEvent).detail as { username: string; mode: string } | undefined;
    if (!detail) return;
    try { recordClubBattle(detail.username, detail.mode); } catch { /* ignore */ }
  });
}

// Returns and clears the most recent unread reward marker for the current user.
export function consumePendingClubReward(): { coins: number; gems: number; pp: number } | null {
  const prof: any = getCurrentProfile();
  const log: string[] = prof?.clubRewardLog ?? [];
  if (log.length === 0) return null;
  // We use the simple convention: any non-empty log triggers a single toast,
  // then the log is cleared (so reopening the menu doesn't spam toasts).
  updateProfile({ clubRewardLog: [] } as any);
  return { coins: CLUB_REWARD_COINS, gems: CLUB_REWARD_GEMS, pp: CLUB_REWARD_PP };
}
