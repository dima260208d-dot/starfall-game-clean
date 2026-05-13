import { useState } from "react";
import { createProfile, loginProfile, createGuestProfile } from "../utils/localStorageAPI";

interface AuthPageProps {
  onAuth: () => void;
}

export default function AuthPage({ onAuth }: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [particles] = useState(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 6 + 2,
      speed: Math.random() * 1 + 0.3,
      color: ["#4DD0E1", "#40C4FF", "#FFD700", "#FF5252", "#69F0AE"][Math.floor(Math.random() * 5)],
    }))
  );

  const handleSubmit = () => {
    setError("");
    if (mode === "register") {
      const result = createProfile(username.trim(), password);
      if (result.success) onAuth();
      else setError(result.error || "Error");
    } else {
      const result = loginProfile(username.trim(), password);
      if (result.success) onAuth();
      else setError(result.error || "Error");
    }
  };

  const handleGuest = () => {
    createGuestProfile();
    onAuth();
  };

  return (
    <div
      style={{
        minHeight: "100%",
        background: "linear-gradient(135deg, #064E3B 0%, #047857 40%, #0EA5E9 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: p.color,
            opacity: 0.6,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            animation: `float ${3 + p.speed}s ease-in-out infinite alternate`,
          }}
        />
      ))}

      <style>{`
        @keyframes float {
          0% { transform: translateY(0px) scale(1); }
          100% { transform: translateY(-20px) scale(1.2); }
        }
        @keyframes glow {
          0%, 100% { text-shadow: 0 0 20px #34D399, 0 0 40px #34D399; }
          50% { text-shadow: 0 0 30px #FFD700, 0 0 60px #FFD700; }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        input::placeholder { color: rgba(255,255,255,0.3); }
      `}</style>

      <div
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(52,211,153,0.35)",
          borderRadius: 20,
          padding: "40px 50px",
          width: 380,
          backdropFilter: "blur(20px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(52,211,153,0.12)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <div
            style={{
              fontSize: 52,
              fontWeight: 900,
              background: "linear-gradient(135deg, #34D399, #FFD700, #40C4FF)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundSize: "200% auto",
              animation: "shimmer 3s linear infinite",
              letterSpacing: 2,
              lineHeight: 1,
            }}
          >
            STARFALL
          </div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 5 }}>
            Эпичная аниме арена
          </div>
        </div>

        <div
          style={{
            display: "flex",
            background: "rgba(255,255,255,0.05)",
            borderRadius: 10,
            padding: 4,
            marginBottom: 24,
          }}
        >
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(""); }}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 13,
                background: mode === m ? "rgba(52,211,153,0.3)" : "transparent",
                color: mode === m ? "#34D399" : "rgba(255,255,255,0.4)",
                transition: "all 0.2s",
              }}
            >
              {m === "login" ? "Вход" : "Регистрация"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input
            type="text"
            placeholder="Имя пользователя"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(52,211,153,0.35)",
              borderRadius: 10,
              padding: "12px 16px",
              color: "white",
              fontSize: 15,
              outline: "none",
              transition: "border-color 0.2s",
            }}
          />
          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(52,211,153,0.35)",
              borderRadius: 10,
              padding: "12px 16px",
              color: "white",
              fontSize: 15,
              outline: "none",
            }}
          />

          {error && (
            <div
              style={{
                background: "rgba(255,82,82,0.15)",
                border: "1px solid rgba(255,82,82,0.4)",
                borderRadius: 8,
                padding: "8px 12px",
                color: "#FF5252",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            style={{
              background: "linear-gradient(135deg, #047857, #34D399)",
              border: "none",
              borderRadius: 12,
              padding: "14px 0",
              color: "white",
              fontWeight: 800,
              fontSize: 16,
              cursor: "pointer",
              letterSpacing: 1,
              boxShadow: "0 4px 20px rgba(4,120,87,0.45)",
              transition: "transform 0.1s, box-shadow 0.1s",
            }}
            onMouseOver={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 30px rgba(4,120,87,0.65)"; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 4px 20px rgba(4,120,87,0.45)"; }}
          >
            {mode === "login" ? "ВОЙТИ НА АРЕНУ" : "ПРИСОЕДИНИТЬСЯ"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>или</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
          </div>

          <button
            onClick={handleGuest}
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 12,
              padding: "12px 0",
              color: "rgba(255,255,255,0.6)",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "white"; }}
            onMouseOut={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
          >
Играть как гость (прогресс не сохранится)
          </button>
        </div>
      </div>
    </div>
  );
}
