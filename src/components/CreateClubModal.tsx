import { useState } from "react";
import {
  createClub,
  CLUB_NAME_MAX, CLUB_DESC_MAX, CLUB_AVATAR_PRESETS,
  type ClubType,
} from "../utils/clubs";
import ClubAvatar from "./ClubAvatar";
import { fileToDataUrl, NEWS_IMAGE_MAX_BYTES } from "../utils/news";

interface Props {
  onCancel: () => void;
  onCreated: (clubId: string) => void;
}

export default function CreateClubModal({ onCancel, onCreated }: Props) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [type, setType] = useState<ClubType>("open");
  const [presetId, setPresetId] = useState<string>(CLUB_AVATAR_PRESETS[0].id);
  const [uploadedAvatar, setUploadedAvatar] = useState<string | undefined>(undefined);
  const [err, setErr] = useState("");

  const handleUpload = async (f: File) => {
    if (f.size > NEWS_IMAGE_MAX_BYTES) {
      setErr(`Картинка > ${(NEWS_IMAGE_MAX_BYTES / 1024 / 1024) | 0} МБ`);
      return;
    }
    setUploadedAvatar(await fileToDataUrl(f));
    setErr("");
  };

  const handleCreate = () => {
    if (!name.trim()) { setErr("Название обязательно"); return; }
    const r = createClub({
      name: name.trim(),
      description: desc.trim(),
      type,
      avatarPreset: presetId,
      avatarDataUrl: uploadedAvatar,
    });
    if (r.success && r.club) onCreated(r.club.id);
    else setErr(r.error ?? "Ошибка");
  };

  const previewClub = {
    name: name || "Новый клуб",
    avatarDataUrl: uploadedAvatar,
    avatarPreset: presetId,
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9999, padding: 16,
    }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto",
        background: "linear-gradient(180deg, #1a2a44 0%, #0a1428 100%)",
        border: "1.5px solid rgba(255,213,79,0.45)",
        borderRadius: 14, padding: 20,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 14, paddingBottom: 10,
          borderBottom: "1px solid rgba(255,255,255,0.10)",
        }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#FFD54F", letterSpacing: 1.5 }}>
            СОЗДАНИЕ КЛУБА
          </div>
          <button onClick={onCancel} style={iconCloseStyle}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
          <ClubAvatar club={previewClub} size={64} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>
              {previewClub.name}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
              {desc || "(без описания)"}
            </div>
          </div>
        </div>

        <Field label={`Название (${name.length}/${CLUB_NAME_MAX})`}>
          <input
            value={name}
            onChange={e => setName(e.target.value.slice(0, CLUB_NAME_MAX))}
            placeholder="Название клуба"
            style={inputStyle()}
            maxLength={CLUB_NAME_MAX}
          />
        </Field>

        <Field label={`Описание (${desc.length}/${CLUB_DESC_MAX})`}>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value.slice(0, CLUB_DESC_MAX))}
            placeholder="Расскажите о клубе"
            rows={3}
            style={inputStyle()}
            maxLength={CLUB_DESC_MAX}
          />
        </Field>

        <Field label="Тип входа">
          <div style={{ display: "flex", gap: 8 }}>
            <TypeChoice
              active={type === "open"} color="#76FF03"
              icon="🚪" label="Открытый"
              sub="Все могут вступить"
              onClick={() => setType("open")}
            />
            <TypeChoice
              active={type === "closed"} color="#FF7043"
              icon="🔒" label="Закрытый"
              sub="Нужно одобрение"
              onClick={() => setType("closed")}
            />
          </div>
        </Field>

        <Field label="Аватар (выберите эмблему)">
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(54px, 1fr))",
            gap: 6, marginBottom: 8,
          }}>
            {CLUB_AVATAR_PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => { setPresetId(p.id); setUploadedAvatar(undefined); }}
                style={{
                  position: "relative",
                  background: !uploadedAvatar && presetId === p.id
                    ? `linear-gradient(135deg, ${p.gradient[0]}, ${p.gradient[1]})`
                    : "rgba(0,0,0,0.4)",
                  border: !uploadedAvatar && presetId === p.id
                    ? "2px solid white"
                    : "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  padding: 0, height: 50,
                  fontSize: 22, color: "white",
                  cursor: "pointer",
                  textShadow: "0 2px 4px rgba(0,0,0,0.45)",
                }}
              >{p.emoji}</button>
            ))}
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
              onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
          </label>
          {uploadedAvatar && (
            <button onClick={() => setUploadedAvatar(undefined)} style={{
              marginLeft: 8,
              background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8, padding: "7px 12px",
              color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 12, fontWeight: 700,
            }}>Убрать</button>
          )}
        </Field>

        {err && (
          <div style={{
            marginTop: 10, padding: 8, color: "#FF7070",
            background: "rgba(255,112,112,0.08)",
            border: "1px solid rgba(255,112,112,0.3)",
            borderRadius: 8, fontSize: 12, fontWeight: 700, textAlign: "center",
          }}>{err}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button onClick={onCancel} style={{
            flex: 1,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 10, padding: "10px 0",
            color: "rgba(255,255,255,0.7)",
            fontWeight: 800, fontSize: 13, cursor: "pointer",
          }}>Отмена</button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            style={{
              flex: 2,
              background: name.trim()
                ? "linear-gradient(135deg, #FFD54F, #FF8A00)"
                : "rgba(255,255,255,0.05)",
              border: "none", borderRadius: 10, padding: "10px 0",
              color: name.trim() ? "#1B1B1B" : "rgba(255,255,255,0.3)",
              fontWeight: 900, fontSize: 14, letterSpacing: 1.5,
              cursor: name.trim() ? "pointer" : "default",
              boxShadow: name.trim() ? "0 4px 14px rgba(255,213,79,0.5)" : "none",
            }}
          >СОЗДАТЬ КЛУБ</button>
        </div>
      </div>
    </div>
  );
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

function TypeChoice({ active, color, icon, label, sub, onClick }: {
  active: boolean; color: string; icon: string; label: string; sub: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      flex: 1,
      background: active ? `${color}26` : "rgba(0,0,0,0.4)",
      border: `1.5px solid ${active ? color : "rgba(255,255,255,0.1)"}`,
      borderRadius: 10, padding: "10px 8px",
      color: active ? color : "white",
      cursor: "pointer", textAlign: "left",
      boxShadow: active ? `0 0 12px ${color}55` : "none",
    }}>
      <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{sub}</div>
    </button>
  );
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

const iconCloseStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 8, padding: "4px 10px",
  color: "white", cursor: "pointer", fontWeight: 800,
};
