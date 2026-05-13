import { useEffect, useMemo, useState } from "react";
import {
  PETS, PET_RARITY_LABEL, PET_RARITY_ORDER, PET_GEM_COST,
  type PetDef, type PetRarity,
} from "../entities/PetData";
import {
  getCurrentProfile, equipPet, markPetSeen,
  unlockPetWithGems,
} from "../utils/localStorageAPI";
import PetSvg from "../components/PetSvg";
import { GemIcon } from "../components/GameIcons";

interface PetsPageProps {
  onBack: () => void;
}

const RARITY_TINT: Record<PetRarity, string> = {
  common:    "#9E9E9E",
  rare:      "#42A5F5",
  epic:      "#AB47BC",
  mythic:    "#FF7043",
  legendary: "#FFD54F",
};

export default function PetsPage({ onBack }: PetsPageProps) {
  const [profile, setProfile] = useState(getCurrentProfile());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const ownedPets = useMemo(() => {
    if (!profile) return [];
    const owned = (profile.unlockedPets || []);
    return PETS.filter(p => owned.includes(p.id))
      .sort((a, b) =>
        PET_RARITY_ORDER.indexOf(b.rarity) - PET_RARITY_ORDER.indexOf(a.rarity)
        || a.name.localeCompare(b.name));
  }, [profile]);

  const lockedPets = useMemo(() => {
    if (!profile) return [];
    const owned = new Set(profile.unlockedPets || []);
    return PETS.filter(p => !owned.has(p.id))
      .sort((a, b) =>
        PET_RARITY_ORDER.indexOf(a.rarity) - PET_RARITY_ORDER.indexOf(b.rarity));
  }, [profile]);

  const activeId = selectedId
    && (ownedPets.some(p => p.id === selectedId) || lockedPets.some(p => p.id === selectedId))
      ? selectedId
      : (ownedPets[0]?.id ?? lockedPets[0]?.id ?? null);

  // Mark currently displayed new pet as seen.
  useEffect(() => {
    if (!activeId) return;
    if ((profile?.newPets || []).includes(activeId)) {
      markPetSeen(activeId);
      setProfile(getCurrentProfile());
    }
  }, [activeId, profile?.newPets]);

  if (!profile) return null;

  const active: PetDef | null = activeId
    ? (PETS.find(p => p.id === activeId) ?? null)
    : null;
  const isOwned = active ? (profile.unlockedPets || []).includes(active.id) : false;
  const isEquipped = active ? profile.equippedPetId === active.id : false;

  const handleEquip = (petId: string | null) => {
    const r = equipPet(petId);
    if (r.success) {
      setProfile(getCurrentProfile());
      setMsg(petId ? "Питомец экипирован" : "Питомец снят");
    } else {
      setMsg(r.error || "Не удалось");
    }
    setTimeout(() => setMsg(""), 1800);
  };

  const handleUnlock = (petId: string) => {
    const r = unlockPetWithGems(petId);
    if (r.success) {
      setProfile(getCurrentProfile());
      setMsg("Питомец куплен");
      setSelectedId(petId);
    } else {
      setMsg(r.error || "Не удалось купить питомца");
    }
    setTimeout(() => setMsg(""), 1800);
  };

  return (
    <div style={{
      minHeight: "100%",
      background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
      color: "white", display: "flex", flexDirection: "column",
      fontFamily: "'Segoe UI', Arial, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "14px 22px",
        borderBottom: "1px solid rgba(118,255,3,0.18)",
        background: "rgba(0,0,0,0.25)",
      }}>
        <button onClick={onBack} style={{
          background: "rgba(118,255,3,0.10)",
          border: "1px solid rgba(118,255,3,0.35)",
          borderRadius: 10, padding: "7px 16px",
          color: "#B2FF59", cursor: "pointer", fontSize: 13, fontWeight: 700,
        }}>← Назад</button>
        <h2 style={{
          flex: 1, textAlign: "center", margin: 0,
          fontSize: 22, fontWeight: 900, letterSpacing: 2,
          color: "#B2FF59",
          textShadow: "0 0 14px rgba(118,255,3,0.45)",
        }}>🐾 ПИТОМЦЫ</h2>
        <div style={{
          minWidth: 100, textAlign: "right",
          fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 700,
        }}>
          {ownedPets.length} / {PETS.length}
        </div>
      </div>

      <div style={{
        flex: 1, display: "flex", overflow: "hidden",
        flexDirection: "row",
      }}>
        {/* Detail panel */}
        <div style={{
          flex: "0 0 380px", padding: 22,
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 14,
          borderRight: "1px solid rgba(118,255,3,0.12)",
          background: "rgba(0,0,0,0.20)",
        }}>
          {active ? (
            <>
              <div style={{
                fontSize: 10, fontWeight: 900, letterSpacing: 2,
                background: RARITY_TINT[active.rarity], color: "white",
                borderRadius: 8, padding: "3px 10px",
                boxShadow: `0 0 10px ${RARITY_TINT[active.rarity]}66`,
              }}>{PET_RARITY_LABEL[active.rarity]}</div>
              <div style={{
                width: 230, height: 230,
                display: "flex", alignItems: "center", justifyContent: "center",
                filter: isOwned ? "none" : "grayscale(0.7) brightness(0.55)",
                background: `radial-gradient(circle at 50% 60%, ${active.color}33 0%, transparent 70%)`,
                borderRadius: 999,
              }}>
                <PetSvg pet={active} size={210} animated={isOwned} haloPulse={isOwned} />
              </div>
              <div style={{
                fontSize: 24, fontWeight: 900, color: active.color, letterSpacing: 1,
                textShadow: "0 2px 6px rgba(0,0,0,0.6)",
              }}>{active.name}</div>
              <div style={{
                fontSize: 12, color: "rgba(255,255,255,0.78)",
                textAlign: "center", lineHeight: 1.5, maxWidth: 320,
              }}>{active.description}</div>
              <div style={{
                marginTop: 6, padding: "10px 14px",
                background: `${active.color}1A`,
                border: `1px solid ${active.color}55`,
                borderRadius: 12,
                fontSize: 13, fontWeight: 800, color: active.color, textAlign: "center",
                boxShadow: `0 0 10px ${active.color}33`,
              }}>⚡ {active.effectLabel}</div>

              {/* Action */}
              <div style={{ marginTop: 14, width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
                {isOwned ? (
                  isEquipped ? (
                    <button
                      onClick={() => handleEquip(null)}
                      style={{
                        width: "100%", padding: "12px 0",
                        background: "rgba(255,255,255,0.07)",
                        border: "1px solid rgba(255,255,255,0.18)",
                        borderRadius: 12,
                        color: "rgba(255,255,255,0.85)", fontWeight: 800, fontSize: 13,
                        letterSpacing: 1, cursor: "pointer",
                      }}
                    >СНЯТЬ ПИТОМЦА</button>
                  ) : (
                    <button
                      onClick={() => handleEquip(active.id)}
                      style={{
                        width: "100%", padding: "12px 0",
                        background: `linear-gradient(135deg, ${active.color}, ${active.secondaryColor})`,
                        border: "none", borderRadius: 12,
                        color: "white", fontWeight: 900, fontSize: 14,
                        letterSpacing: 1.5, cursor: "pointer",
                        boxShadow: `0 4px 14px ${active.color}66`,
                      }}
                    >ЭКИПИРОВАТЬ</button>
                  )
                ) : (
                  <>
                    <div style={{
                      width: "100%", padding: "10px 0", textAlign: "center",
                      background: "rgba(0,0,0,0.35)",
                      border: "1px dashed rgba(255,255,255,0.18)",
                      borderRadius: 12,
                      color: "rgba(255,255,255,0.55)", fontWeight: 700, fontSize: 12,
                      letterSpacing: 1,
                    }}>
                      🔒 Заблокирован — открывайте сундуки или купите за <GemIcon size={11} /> {PET_GEM_COST[active.rarity]}
                    </div>
                    <button
                      onClick={() => handleUnlock(active.id)}
                      disabled={profile.gems < PET_GEM_COST[active.rarity]}
                      style={{
                        width: "100%", padding: "12px 0",
                        background: profile.gems >= PET_GEM_COST[active.rarity]
                          ? "linear-gradient(135deg, #0288D1, #40C4FF)"
                          : "rgba(255,255,255,0.08)",
                        border: "none", borderRadius: 12,
                        color: profile.gems >= PET_GEM_COST[active.rarity] ? "white" : "rgba(255,255,255,0.4)",
                        fontWeight: 900, fontSize: 13, letterSpacing: 1.2,
                        cursor: profile.gems >= PET_GEM_COST[active.rarity] ? "pointer" : "default",
                      }}
                    >
                      КУПИТЬ ЗА 💎 {PET_GEM_COST[active.rarity]}
                    </button>
                  </>
                )}
                {msg && (
                  <div style={{
                    fontSize: 11, color: "#B2FF59", textAlign: "center", fontWeight: 700,
                  }}>{msg}</div>
                )}
              </div>
            </>
          ) : (
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginTop: 50 }}>
              Нет питомцев — открывайте сундуки!
            </div>
          )}
        </div>

        {/* Grid */}
        <div style={{ flex: 1, padding: 22, overflowY: "auto" }}>
          {ownedPets.length > 0 && (
            <Section title="МОИ ПИТОМЦЫ" count={ownedPets.length}>
              <Grid>
                {ownedPets.map(p => (
                  <PetCard
                    key={p.id}
                    pet={p}
                    owned
                    isEquipped={profile.equippedPetId === p.id}
                    isNew={(profile.newPets || []).includes(p.id)}
                    selected={p.id === activeId}
                    onClick={() => setSelectedId(p.id)}
                  />
                ))}
              </Grid>
            </Section>
          )}
          {lockedPets.length > 0 && (
            <Section title="ЕЩЁ НЕ ОТКРЫТЫ" count={lockedPets.length}>
              <Grid>
                {lockedPets.map(p => (
                  <PetCard
                    key={p.id}
                    pet={p}
                    owned={false}
                    isEquipped={false}
                    isNew={false}
                    selected={p.id === activeId}
                    onClick={() => setSelectedId(p.id)}
                  />
                ))}
              </Grid>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 11, color: "rgba(178,255,89,0.85)",
        letterSpacing: 3, fontWeight: 800, marginBottom: 10, paddingLeft: 4,
      }}>{title} <span style={{ color: "rgba(255,255,255,0.35)", marginLeft: 6 }}>{count}</span></div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
      gap: 12,
    }}>{children}</div>
  );
}

function PetCard({
  pet, owned, isEquipped, isNew, selected, onClick,
}: {
  pet: PetDef;
  owned: boolean;
  isEquipped: boolean;
  isNew: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative",
        background: owned
          ? `linear-gradient(180deg, ${pet.color}26 0%, rgba(0,0,0,0.55) 100%)`
          : "rgba(0,0,0,0.45)",
        border: selected
          ? `2px solid ${pet.color}`
          : owned
            ? `1.5px solid ${pet.color}55`
            : "1.5px solid rgba(255,255,255,0.10)",
        borderRadius: 14,
        padding: "12px 8px 10px",
        cursor: "pointer",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        boxShadow: selected ? `0 0 18px ${pet.color}88` : "none",
        transition: "transform 0.15s, box-shadow 0.2s",
        transform: selected ? "translateY(-2px)" : "none",
      }}
    >
      {/* rarity dot */}
      <div style={{
        position: "absolute", top: 6, left: 6,
        width: 8, height: 8, borderRadius: 999,
        background: RARITY_TINT[pet.rarity],
        boxShadow: `0 0 6px ${RARITY_TINT[pet.rarity]}`,
      }} />
      {isEquipped && (
        <div style={{
          position: "absolute", top: 4, right: 4,
          fontSize: 8, fontWeight: 900, letterSpacing: 1,
          background: "#76FF03", color: "#1B5E20",
          borderRadius: 6, padding: "2px 5px",
        }}>ЭКИП</div>
      )}
      {isNew && (
        <div style={{
          position: "absolute", top: 4, right: isEquipped ? 50 : 4,
          fontSize: 8, fontWeight: 900, letterSpacing: 1,
          background: "#FF1744", color: "white",
          borderRadius: 6, padding: "2px 5px",
          animation: "pulse 1.4s ease-in-out infinite",
        }}>NEW</div>
      )}
      <div style={{
        width: 78, height: 78,
        display: "flex", alignItems: "center", justifyContent: "center",
        filter: owned ? "none" : "grayscale(0.85) brightness(0.55)",
      }}>
        <PetSvg pet={pet} size={72} animated={owned} haloPulse={owned && selected} />
      </div>
      <div style={{
        fontSize: 11, fontWeight: 800,
        color: owned ? pet.color : "rgba(255,255,255,0.5)",
        textAlign: "center", lineHeight: 1.2,
      }}>{owned ? pet.name : "???"}</div>
    </button>
  );
}
