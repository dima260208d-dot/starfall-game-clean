import { useEffect, useMemo, useRef, useState } from "react";
import {
  getMyClub, getAllClubs, getMyClubInvites,
  joinClub, leaveClub, sendChatMessage,
  deleteClub,
  kickMember, setMemberRole, inviteUser, updateClubInfo,
  approveJoinRequest, denyJoinRequest, acceptInvite, declineInvite,
  CLUB_AVATAR_PRESETS, CLUB_BATTLES_PER_REWARD, CLUB_CHAT_MAX,
  CLUB_DESC_MAX, CLUB_NAME_MAX, CLUB_REWARD_COINS, CLUB_REWARD_GEMS, CLUB_REWARD_PP,
  CLUB_MEMBERS_MAX,
  type Club, type ClubMember, type ClubMessage, type ClubRole,
} from "../utils/clubs";
import {
  getCurrentUsername, getAllProfiles,
} from "../utils/localStorageAPI";
import { fileToDataUrl, NEWS_IMAGE_MAX_BYTES } from "../utils/news";
import ClubAvatar from "../components/ClubAvatar";
import CreateClubModal from "../components/CreateClubModal";
import { CoinIcon, GemIcon, PowerIcon } from "../components/GameIcons";

interface Props {
  onBack: () => void;
}

export default function ClubsPage({ onBack }: Props) {
  const [tick, setTick] = useState(0);
  // Re-read from storage every render so chat messages and members stay in sync.
  const myClub = useMemo(() => getMyClub(), [tick]);
  const refresh = () => setTick(x => x + 1);

  return (
    <div style={{
      minHeight: "100%",
      background: "linear-gradient(135deg, #0a1d38 0%, #12345f 50%, #0a1d38 100%)",
      color: "white",
      display: "flex", flexDirection: "column",
      fontFamily: "'Segoe UI', Arial, sans-serif",
    }}>
      <div style={{
        display: "flex", alignItems: "center", padding: "14px 22px",
        borderBottom: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(0,0,0,0.34)",
      }}>
        <button onClick={onBack} style={backButtonStyle}>← Назад</button>
        <h2 style={{
          flex: 1, textAlign: "center", margin: 0,
          fontSize: 22, fontWeight: 900, letterSpacing: 2,
          color: "#FFD54F",
          textShadow: "0 0 14px rgba(255,213,79,0.5)",
        }}>🏛️ КЛУБЫ</h2>
        <div style={{ width: 110 }} />
      </div>

      {myClub ? (
        <MyClubView club={myClub} onChange={refresh} />
      ) : (
        <ClubsBrowse onChange={refresh} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BROWSE / JOIN / CREATE
// ─────────────────────────────────────────────────────────────────────────
function ClubsBrowse({ onChange }: { onChange: () => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState("");
  const me = getCurrentUsername();
  const all = useMemo(() => getAllClubs(), [showCreate, msg]);
  const invites = useMemo(() => getMyClubInvites(), [msg]);

  const visible = all.filter(c => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
  });

  const handleJoin = (club: Club) => {
    const r = joinClub(club.id);
    if (r.success) {
      setMsg(r.pending ? "Заявка отправлена!" : "Вы вступили в клуб");
      onChange();
    } else {
      setMsg(r.error ?? "Ошибка");
    }
    setTimeout(() => setMsg(""), 2400);
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 22 }}>
      {msg && (
        <div style={{
          marginBottom: 12, padding: "8px 14px", textAlign: "center",
          background: "rgba(255,213,79,0.12)",
          border: "1px solid rgba(255,213,79,0.3)",
          borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#FFD54F",
        }}>{msg}</div>
      )}

      {invites.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <SectionTitle>📩 Приглашения</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {invites.map(c => (
              <div key={c.id} style={cardStyle("#FFD54F")}>
                <ClubAvatar club={c} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>{c.name}</div>
                  <div style={{
                    fontSize: 11, color: "rgba(255,255,255,0.55)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{c.description || "—"}</div>
                </div>
                <button onClick={() => {
                  const r = acceptInvite(c.id);
                  if (r.success) onChange();
                  else setMsg(r.error ?? "Ошибка");
                }} style={primaryBtn("#76FF03")}>Принять</button>
                <button onClick={() => { declineInvite(c.id); onChange(); }} style={primaryBtn("#888")}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{
        display: "flex", gap: 10, marginBottom: 14,
      }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Поиск по названию или описанию"
          style={{ ...inputStyle(), flex: 1 }}
        />
        <button onClick={() => setShowCreate(true)} style={primaryBtn("#76FF03")}>
          + Создать клуб
        </button>
      </div>

      <SectionTitle>{visible.length === 0 ? "КЛУБОВ ПОКА НЕТ" : "СПИСОК КЛУБОВ"}</SectionTitle>
      {visible.length === 0 ? (
        <div style={{
          padding: 40, textAlign: "center",
          color: "rgba(255,255,255,0.55)",
        }}>
          <div style={{ fontSize: 56, marginBottom: 10 }}>🏛️</div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Создайте первый клуб!</div>
          <div style={{ fontSize: 11, marginTop: 6 }}>
            Соберите команду из 50 игроков и зарабатывайте награды вместе.
          </div>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 10,
        }}>
          {visible.map(c => {
            const full = c.members.length >= CLUB_MEMBERS_MAX;
            const youAlreadyAsked = c.pendingRequests.some(r => r.username === me);
            return (
              <div key={c.id} style={cardStyle(c.type === "open" ? "#76FF03" : "#FF7043", true)}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <ClubAvatar club={c} size={52} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: "white",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{c.name}</span>
                      <span style={typeBadge(c.type)}>{c.type === "open" ? "🚪 откр." : "🔒 закр."}</span>
                    </div>
                    <div style={{
                      fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2,
                      overflow: "hidden", textOverflow: "ellipsis",
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    }}>{c.description || "(без описания)"}</div>
                  </div>
                </div>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.65)",
                }}>
                  <span>👥 {c.members.length}/{CLUB_MEMBERS_MAX}</span>
                  <span>⚔️ {c.totalBattles}</span>
                  <span>🏆 циклов: {c.rewardsClaimed}</span>
                </div>
                <button
                  onClick={() => handleJoin(c)}
                  disabled={full || youAlreadyAsked}
                  style={{
                    marginTop: 10, width: "100%",
                    background: full ? "rgba(255,255,255,0.05)"
                      : youAlreadyAsked ? "rgba(255,255,255,0.05)"
                      : c.type === "open" ? "linear-gradient(135deg, #76FF03, #43A047)"
                      : "linear-gradient(135deg, #FF7043, #E64A19)",
                    color: full || youAlreadyAsked ? "rgba(255,255,255,0.4)" : "white",
                    border: "none", borderRadius: 10, padding: "8px 0",
                    fontSize: 12, fontWeight: 900, letterSpacing: 1.2,
                    cursor: (full || youAlreadyAsked) ? "default" : "pointer",
                    boxShadow: full || youAlreadyAsked ? "none" : "0 3px 10px rgba(0,0,0,0.4)",
                  }}
                >
                  {full ? "ЗАПОЛНЕН"
                    : youAlreadyAsked ? "ЗАЯВКА ОТПРАВЛЕНА"
                    : c.type === "open" ? "ВСТУПИТЬ" : "ПОДАТЬ ЗАЯВКУ"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateClubModal
          onCancel={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); onChange(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MEMBER / OWNED CLUB VIEW
// ─────────────────────────────────────────────────────────────────────────
type ClubView = "menu" | "club";

function MyClubView({ club, onChange }: { club: Club; onChange: () => void }) {
  const [view, setView] = useState<ClubView>("menu");
  const me = getCurrentUsername();
  const isFounder = me === club.createdBy;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{
        display: "flex", gap: 14, alignItems: "center",
        padding: "16px 22px",
        background: "rgba(0,0,0,0.3)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <ClubAvatar club={club} size={64} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: "white" }}>{club.name}</span>
            <span style={typeBadge(club.type)}>{club.type === "open" ? "🚪 откр." : "🔒 закр."}</span>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
            {club.description || "(без описания)"}
          </div>
          <div style={{
            fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4,
            display: "flex", gap: 14,
          }}>
            <span>👥 {club.members.length}/{CLUB_MEMBERS_MAX}</span>
            <span>⚔️ всего {club.totalBattles}</span>
            <span>🏆 циклов: {club.rewardsClaimed}</span>
            <span>📅 с {new Date(club.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        {view === "club" && (
          <button onClick={() => setView("menu")} style={primaryBtn("#40C4FF")}>← В меню клуба</button>
        )}
      </div>

      <ClubProgressBar club={club} />

      {view === "menu" ? (
        <ClubMenuView club={club} isFounder={isFounder} onChange={onChange} onOpenClub={() => setView("club")} />
      ) : (
        <ClubRoomView club={club} onChange={onChange} />
      )}
    </div>
  );
}

function ClubProgressBar({ club }: { club: Club }) {
  const pct = (club.battleCount / CLUB_BATTLES_PER_REWARD) * 100;
  return (
    <div style={{
      padding: "10px 22px", background: "rgba(0,0,0,0.18)",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 11, marginBottom: 6,
      }}>
        <span style={{ color: "#FFD54F", fontWeight: 800, letterSpacing: 1 }}>
          🏆 ПРОГРЕСС: {club.battleCount} / {CLUB_BATTLES_PER_REWARD} БОЁВ
        </span>
        <span style={{
          color: "rgba(255,255,255,0.6)", fontWeight: 700,
        }}>
          Награда: <CoinIcon size={11} /> {CLUB_REWARD_COINS} +
          <GemIcon size={11} /> {CLUB_REWARD_GEMS} +
          <PowerIcon size={11} /> {CLUB_REWARD_PP}
        </span>
      </div>
      <div style={{
        position: "relative", height: 10,
        background: "rgba(0,0,0,0.45)",
        borderRadius: 5, overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.1)",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          width: `${pct}%`,
          background: "linear-gradient(90deg, #FFD54F, #FF8A00)",
          boxShadow: "0 0 12px rgba(255,213,79,0.55)",
          transition: "width 0.4s ease",
        }} />
      </div>
    </div>
  );
}

// ─── Chat panel ─────────────────────────────────────────────────────────
function ChatPanel({ club, onChange }: { club: Club; onChange: () => void }) {
  const [text, setText] = useState("");
  const me = getCurrentUsername();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom on new messages.
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [club.chat.length]);

  const send = () => {
    if (!text.trim()) return;
    const r = sendChatMessage(club.id, text);
    if (r.success) {
      setText("");
      onChange();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div ref={scrollRef} style={{
        flex: 1, overflowY: "auto", padding: "16px 22px",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        {club.chat.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.5)", textAlign: "center", padding: 40 }}>
            Сообщений пока нет — поздоровайтесь с клубом!
          </div>
        ) : (
          club.chat.map(m => <ChatMessageRow key={m.id} message={m} isMine={m.username === me} />)
        )}
      </div>
      <div style={{
        display: "flex", gap: 8, padding: "10px 22px",
        background: "rgba(0,0,0,0.35)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}>
        <input
          value={text}
          onChange={e => setText(e.target.value.slice(0, CLUB_CHAT_MAX))}
          onKeyDown={e => { if (e.key === "Enter") send(); }}
          placeholder="Написать сообщение..."
          maxLength={CLUB_CHAT_MAX}
          style={{ ...inputStyle(), flex: 1 }}
        />
        <button onClick={send} disabled={!text.trim()} style={primaryBtn("#76FF03")}>
          ➤
        </button>
      </div>
    </div>
  );
}

function ClubMenuView({
  club, isFounder, onChange, onOpenClub,
}: {
  club: Club;
  isFounder: boolean;
  onChange: () => void;
  onOpenClub: () => void;
}) {
  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 12, padding: 14, overflow: "hidden" }}>
      <div style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflowY: "auto" }}>
        <InfoPanel club={club} isFounder={isFounder} onChange={onChange} />
      </div>
      <div style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflowY: "auto" }}>
        <MembersPanel club={club} isFounder={isFounder} canModerate={isFounder} onChange={onChange} />
      </div>
      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "center", paddingBottom: 6 }}>
        <button onClick={onOpenClub} style={primaryBtn("#FFD54F")}>ОТКРЫТЬ РАЗДЕЛ "САМ КЛУБ"</button>
      </div>
    </div>
  );
}

function ClubRoomView({ club, onChange }: { club: Club; onChange: () => void }) {
  const nextCycleWins = Math.max(0, CLUB_BATTLES_PER_REWARD - club.battleCount);
  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12, padding: 14, overflow: "hidden" }}>
      <div style={{ background: "rgba(0,0,0,0.28)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
        <ChatPanel club={club} onChange={onChange} />
      </div>
      <div style={{
        background: "rgba(0,0,0,0.28)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 14,
        overflowY: "auto",
      }}>
        <SectionTitle>🏆 Результаты клуба</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <StatRow label="Всего победных боёв клуба" value={String(club.totalBattles)} />
          <StatRow label="Получено наградных циклов" value={String(club.rewardsClaimed)} />
          <StatRow label="До следующей награды" value={`${nextCycleWins} боёв`} />
        </div>
        <SectionTitle>🎁 Награды</SectionTitle>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>
          <div>Получено клубом: <strong>{club.rewardsClaimed}</strong> циклов.</div>
          <div style={{ marginTop: 6 }}>
            Следующая награда за цикл:
            {" "}+{CLUB_REWARD_COINS} монет, +{CLUB_REWARD_GEMS} крист., +{CLUB_REWARD_PP} ОС
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatMessageRow({ message, isMine }: { message: ClubMessage; isMine: boolean }) {
  if (message.system) {
    return (
      <div style={{
        alignSelf: "center", maxWidth: "80%",
        padding: "5px 12px",
        background: "rgba(255,213,79,0.08)",
        border: "1px solid rgba(255,213,79,0.3)",
        borderRadius: 8,
        fontSize: 11, color: "#FFD54F", fontWeight: 700, textAlign: "center",
      }}>{message.text}</div>
    );
  }
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: isMine ? "flex-end" : "flex-start",
    }}>
      <div style={{
        maxWidth: "75%",
        background: isMine
          ? "linear-gradient(135deg, #1976D2, #0D47A1)"
          : "rgba(255,255,255,0.06)",
        border: `1px solid ${isMine ? "rgba(64,196,255,0.45)" : "rgba(255,255,255,0.1)"}`,
        borderRadius: 12,
        padding: "8px 12px",
      }}>
        {!isMine && (
          <div style={{
            fontSize: 10, fontWeight: 800, color: "#FFD54F",
            marginBottom: 2, letterSpacing: 0.5,
          }}>{message.username}</div>
        )}
        <div style={{ fontSize: 13, color: "white", lineHeight: 1.35, wordBreak: "break-word" }}>
          {message.text}
        </div>
      </div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 2, padding: "0 4px" }}>
        {new Date(message.sentAt).toLocaleString("ru-RU", {
          hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
        })}
      </div>
    </div>
  );
}

// ─── Members panel ──────────────────────────────────────────────────────
function MembersPanel({
  club, isFounder, canModerate, onChange,
}: {
  club: Club;
  isFounder: boolean;
  canModerate: boolean;
  onChange: () => void;
}) {
  const me = getCurrentUsername();
  const sorted = [...club.members].sort((a, b) => {
    const order = { leader: 0, helper: 1, member: 2 };
    if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
    return b.battlesContributed - a.battlesContributed;
  });

  return (
    <div style={{ padding: 16 }}>
      {canModerate && club.pendingRequests.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionTitle>📥 Заявки на вступление ({club.pendingRequests.length})</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {club.pendingRequests.map(r => (
              <div key={r.username} style={cardStyle("#FFD54F")}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "white", fontWeight: 800, fontSize: 13 }}>{r.username}</div>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>
                    подал {new Date(r.requestedAt).toLocaleDateString()}
                  </div>
                </div>
                <button onClick={() => {
                  const res = approveJoinRequest(club.id, r.username);
                  if (res.success) onChange();
                }} style={primaryBtn("#76FF03")}>Принять</button>
                <button onClick={() => { denyJoinRequest(club.id, r.username); onChange(); }} style={primaryBtn("#888")}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <SectionTitle>УЧАСТНИКИ</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sorted.map(m => (
          <MemberRow
            key={m.username}
            member={m}
            isMe={m.username === me}
            isFounder={m.username === club.createdBy}
            canModerate={isFounder}
            club={club}
            onSetRole={(role) => {
              const r = setMemberRole(club.id, m.username, role);
              if (r.success) onChange();
            }}
            onKick={() => {
              if (confirm(`Исключить ${m.username}?`)) {
                const r = kickMember(club.id, m.username);
                if (r.success) onChange();
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

function InviteRow({ club, onInvited }: { club: Club; onInvited: () => void }) {
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const allUsers = useMemo(() => Object.keys(getAllProfiles()), []);

  const handleInvite = () => {
    const r = inviteUser(club.id, name.trim());
    setMsg(r.success ? "Приглашение отправлено!" : (r.error ?? "Ошибка"));
    if (r.success) {
      setName("");
      onInvited();
    }
    setTimeout(() => setMsg(""), 2400);
  };

  return (
    <div style={{
      marginBottom: 16, padding: 12,
      background: "rgba(64,196,255,0.06)",
      border: "1px solid rgba(64,196,255,0.25)",
      borderRadius: 10,
    }}>
      <SectionTitle>📨 Пригласить игрока</SectionTitle>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          list="all-users-list"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Имя пользователя"
          style={{ ...inputStyle(), flex: 1 }}
        />
        <datalist id="all-users-list">
          {allUsers.map(u => <option key={u} value={u} />)}
        </datalist>
        <button onClick={handleInvite} disabled={!name.trim()} style={primaryBtn("#40C4FF")}>
          Пригласить
        </button>
      </div>
      {msg && (
        <div style={{
          marginTop: 6, fontSize: 11, color: msg.includes("отправлено") ? "#76FF03" : "#FF7070",
        }}>{msg}</div>
      )}
    </div>
  );
}

function MemberRow({
  member, isMe, isFounder, canModerate, club, onSetRole, onKick,
}: {
  member: ClubMember;
  isMe: boolean;
  isFounder: boolean;
  canModerate: boolean;
  club: Club;
  onSetRole: (role: ClubRole) => void;
  onKick: () => void;
}) {
  const profile = getAllProfiles()[member.username];
  const roleColor =
    member.role === "leader" ? "#FFD54F"
    : member.role === "helper" ? "#40C4FF"
    : "rgba(255,255,255,0.5)";
  const roleLabel =
    member.role === "leader" ? "👑 Лидер"
    : member.role === "helper" ? "⭐ Помощник"
    : "Участник";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: isMe ? "rgba(64,196,255,0.10)" : "rgba(0,0,0,0.30)",
      border: `1px solid ${isMe ? "rgba(64,196,255,0.4)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 10, padding: "10px 12px",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        background: `linear-gradient(135deg, ${roleColor}, ${roleColor}99)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#1B1B1B", fontWeight: 900, fontSize: 14,
      }}>{member.username[0]?.toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 13, fontWeight: 800, color: "white",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{member.username}{isMe ? " (вы)" : ""}</span>
          {isFounder && (
            <span style={{
              fontSize: 9, background: "#FFD54F", color: "#1B1B1B",
              padding: "1px 5px", borderRadius: 4, fontWeight: 900,
            }}>СОЗДАТЕЛЬ</span>
          )}
        </div>
        <div style={{
          fontSize: 11, color: roleColor, fontWeight: 700,
          marginTop: 2, display: "flex", gap: 10,
        }}>
          <span>{roleLabel}</span>
          <span style={{ color: "rgba(255,255,255,0.45)" }}>⚔️ {member.battlesContributed}</span>
          {profile && (
            <span style={{ color: "rgba(255,255,255,0.45)" }}>🏆 {profile.trophies}</span>
          )}
        </div>
      </div>
      {canModerate && !isFounder && (
        <>
          {member.role !== "helper" && (
            <button onClick={() => onSetRole("helper")} style={smallBtn("#40C4FF")}>+ помощник</button>
          )}
          {member.role === "helper" && (
            <button onClick={() => onSetRole("member")} style={smallBtn("#888")}>− помощник</button>
          )}
          <button onClick={onKick} style={smallBtn("#FF5252")}>Кикнуть</button>
        </>
      )}
    </div>
  );
}

// ─── Info panel (founder edit) ──────────────────────────────────────────
function InfoPanel({
  club, isFounder, onChange,
}: { club: Club; isFounder: boolean; onChange: () => void }) {
  const [name, setName]     = useState(club.name);
  const [desc, setDesc]     = useState(club.description);
  const [type, setType]     = useState(club.type);
  const [presetId, setPreset] = useState(club.avatarPreset ?? CLUB_AVATAR_PRESETS[0].id);
  const [uploaded, setUploaded] = useState<string | undefined>(club.avatarDataUrl);
  const [removeUploaded, setRemoveUploaded] = useState(false);
  const [saved, setSaved] = useState("");

  const previewClub = {
    name: name || club.name,
    avatarDataUrl: removeUploaded ? undefined : uploaded,
    avatarPreset: presetId,
  };

  const onPickFile = async (f: File) => {
    if (f.size > NEWS_IMAGE_MAX_BYTES) {
      setSaved("Картинка > 5 МБ");
      return;
    }
    setUploaded(await fileToDataUrl(f));
    setRemoveUploaded(false);
  };

  const save = () => {
    const r = updateClubInfo(club.id, {
      name, description: desc, type,
      avatarPreset: presetId,
      avatarDataUrl: removeUploaded ? null : uploaded,
    });
    if (r.success) {
      setSaved("✓ Сохранено");
      setRemoveUploaded(false);
      onChange();
    } else {
      setSaved(r.error ?? "Ошибка");
    }
    setTimeout(() => setSaved(""), 2400);
  };

  if (!isFounder) {
    return (
      <div style={{ padding: 22 }}>
        <div style={{
          padding: 16,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          display: "flex", gap: 14, alignItems: "center",
        }}>
          <ClubAvatar club={club} size={64} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "white" }}>{club.name}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
              {club.description || "(без описания)"}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 8 }}>
              Создатель: <strong>{club.createdBy}</strong> · {new Date(club.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
        <div style={{
          marginTop: 14, padding: 14,
          background: "rgba(255,213,79,0.08)",
          border: "1px solid rgba(255,213,79,0.3)",
          borderRadius: 10, fontSize: 12, color: "rgba(255,255,255,0.7)",
        }}>
          ℹ️ Редактировать информацию, приглашать и удалять участников может только директор клуба.
        </div>
        <button onClick={() => {
          if (confirm("Покинуть клуб?")) {
            const r = leaveClub();
            if (r.success) onChange();
          }
        }} style={{ ...primaryBtn("#FF5252"), marginTop: 12 }}>Выйти из клуба</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 22, maxWidth: 560, margin: "0 auto" }}>
      <SectionTitle>РЕДАКТИРОВАНИЕ КЛУБА</SectionTitle>
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
        <ClubAvatar club={previewClub} size={72} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "white" }}>{previewClub.name}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
            {desc || "(без описания)"}
          </div>
        </div>
      </div>

      <Field label={`Название (${name.length}/${CLUB_NAME_MAX})`}>
        <input
          value={name} maxLength={CLUB_NAME_MAX}
          onChange={e => setName(e.target.value.slice(0, CLUB_NAME_MAX))}
          style={inputStyle()}
        />
      </Field>
      <Field label={`Описание (${desc.length}/${CLUB_DESC_MAX})`}>
        <textarea
          value={desc} maxLength={CLUB_DESC_MAX} rows={3}
          onChange={e => setDesc(e.target.value.slice(0, CLUB_DESC_MAX))}
          style={inputStyle()}
        />
      </Field>
      <Field label="Тип входа">
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setType("open")}
            style={typeChoiceStyle(type === "open", "#76FF03")}
          >🚪 Открытый</button>
          <button
            onClick={() => setType("closed")}
            style={typeChoiceStyle(type === "closed", "#FF7043")}
          >🔒 Закрытый</button>
        </div>
      </Field>

      <Field label="Аватар">
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(54px, 1fr))",
          gap: 6, marginBottom: 8,
        }}>
          {CLUB_AVATAR_PRESETS.map(p => {
            const showsPreset = (removeUploaded || !uploaded) && presetId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => { setPreset(p.id); setRemoveUploaded(true); setUploaded(undefined); }}
                style={{
                  background: showsPreset
                    ? `linear-gradient(135deg, ${p.gradient[0]}, ${p.gradient[1]})`
                    : "rgba(0,0,0,0.4)",
                  border: showsPreset ? "2px solid white" : "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10, padding: 0, height: 50,
                  fontSize: 22, color: "white",
                  cursor: "pointer",
                  textShadow: "0 2px 4px rgba(0,0,0,0.45)",
                }}
              >{p.emoji}</button>
            );
          })}
        </div>
        <label style={{
          display: "inline-block",
          background: "linear-gradient(135deg, #40C4FF, #1E88E5)",
          color: "white",
          padding: "7px 14px", borderRadius: 8,
          fontSize: 12, fontWeight: 800, cursor: "pointer",
        }}>
          🖼️ Загрузить картинку
          <input
            type="file" hidden accept="image/png,image/jpeg,image/webp"
            onChange={e => e.target.files?.[0] && onPickFile(e.target.files[0])}
          />
        </label>
        {uploaded && !removeUploaded && (
          <button onClick={() => { setUploaded(undefined); setRemoveUploaded(true); }} style={{
            marginLeft: 8,
            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8, padding: "7px 12px",
            color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 12, fontWeight: 700,
          }}>Сбросить картинку</button>
        )}
      </Field>

      {saved && (
        <div style={{
          marginTop: 10, padding: 8, fontSize: 12, fontWeight: 700,
          background: saved.startsWith("✓") ? "rgba(118,255,3,0.10)" : "rgba(255,112,112,0.10)",
          border: `1px solid ${saved.startsWith("✓") ? "rgba(118,255,3,0.4)" : "rgba(255,112,112,0.4)"}`,
          borderRadius: 8, color: saved.startsWith("✓") ? "#76FF03" : "#FF7070",
          textAlign: "center",
        }}>{saved}</div>
      )}

      <button onClick={save} style={{
        marginTop: 14, width: "100%",
        background: "linear-gradient(135deg, #FFD54F, #FF8A00)",
        color: "#1B1B1B", border: "none",
        borderRadius: 10, padding: "10px 0",
        fontSize: 13, fontWeight: 900, letterSpacing: 1.5,
        cursor: "pointer", boxShadow: "0 4px 14px rgba(255,213,79,0.4)",
      }}>СОХРАНИТЬ</button>
      <div style={{ marginTop: 12 }}>
        <InviteRow club={club} onInvited={onChange} />
      </div>
      <button onClick={() => {
        if (confirm("Удалить клуб? Это действие нельзя отменить.")) {
          const r = deleteClub(club.id);
          if (r.success) onChange();
        }
      }} style={{ ...primaryBtn("#FF5252"), marginTop: 8, width: "100%" }}>Удалить клуб</button>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 8,
      padding: "8px 10px",
      fontSize: 12,
    }}>
      <span style={{ color: "rgba(255,255,255,0.7)" }}>{label}</span>
      <strong style={{ color: "#FFD54F" }}>{value}</strong>
    </div>
  );
}

// ─── Style helpers ──────────────────────────────────────────────────────
const backButtonStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.1)",
  border: "1px solid rgba(255,255,255,0.24)",
  borderRadius: 10, padding: "7px 16px",
  color: "rgba(255,255,255,0.85)", cursor: "pointer",
  fontSize: 13, fontWeight: 700,
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, color: "#FFD54F", letterSpacing: 2, fontWeight: 800,
      marginBottom: 8,
    }}>{children}</div>
  );
}

function cardStyle(accent: string, withGlow = false): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 10,
    padding: 12,
    background: `linear-gradient(180deg, ${accent}10 0%, rgba(0,0,0,0.45) 100%)`,
    border: `1px solid ${accent}55`,
    borderRadius: 14,
    boxShadow: withGlow ? `0 0 14px ${accent}22` : "none",
  };
}

function typeBadge(type: "open" | "closed"): React.CSSProperties {
  const color = type === "open" ? "#76FF03" : "#FF7043";
  return {
    background: `${color}22`, color,
    border: `1px solid ${color}66`,
    borderRadius: 6, padding: "2px 6px",
    fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
  };
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: "7px 16px",
    background: active ? "rgba(255,213,79,0.18)" : "rgba(255,255,255,0.04)",
    border: `1px solid ${active ? "#FFD54F" : "rgba(255,255,255,0.08)"}`,
    borderRadius: 8,
    color: active ? "#FFD54F" : "rgba(255,255,255,0.55)",
    fontWeight: 800, fontSize: 12, letterSpacing: 1,
    cursor: "pointer",
  };
}

function primaryBtn(color: string): React.CSSProperties {
  return {
    background: color === "#888"
      ? "rgba(255,255,255,0.07)"
      : `linear-gradient(135deg, ${color}, ${color}cc)`,
    border: color === "#888" ? "1px solid rgba(255,255,255,0.15)" : "none",
    borderRadius: 10, padding: "8px 14px",
    color: color === "#888" ? "rgba(255,255,255,0.7)" : (color === "#FFD54F" ? "#1B1B1B" : "white"),
    fontSize: 12, fontWeight: 900, letterSpacing: 1, cursor: "pointer",
    boxShadow: color === "#888" ? "none" : `0 3px 10px ${color}44`,
    whiteSpace: "nowrap",
  };
}

function smallBtn(color: string): React.CSSProperties {
  return {
    background: `${color}22`,
    border: `1px solid ${color}66`,
    borderRadius: 6, padding: "4px 10px",
    color, fontSize: 11, fontWeight: 800,
    cursor: "pointer", whiteSpace: "nowrap",
  };
}

function typeChoiceStyle(active: boolean, color: string): React.CSSProperties {
  return {
    flex: 1,
    background: active ? `${color}26` : "rgba(0,0,0,0.4)",
    border: `1.5px solid ${active ? color : "rgba(255,255,255,0.1)"}`,
    borderRadius: 10, padding: "10px 8px",
    color: active ? color : "white",
    cursor: "pointer", fontSize: 12, fontWeight: 800,
    boxShadow: active ? `0 0 10px ${color}55` : "none",
  };
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%", boxSizing: "border-box",
    background: "rgba(0,0,0,0.5)",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 8, padding: "8px 10px",
    color: "white", fontSize: 13, fontWeight: 600,
    fontFamily: "inherit",
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10 }}>
      <label style={{
        display: "block", fontSize: 10, color: "rgba(255,255,255,0.55)",
        fontWeight: 700, letterSpacing: 1.5, marginBottom: 6,
      }}>{label}</label>
      {children}
    </div>
  );
}
