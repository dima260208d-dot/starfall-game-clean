import { useState, useRef, useEffect } from "react";
import { chatRespond, executeCommand, looksLikeCommand } from "../ai/AstralAssistant";
import { isStarGuardianActive } from "../utils/subscription";

interface Msg { who: "user" | "astral"; text: string; time: number }

interface Props { onClose: () => void; initialMessage?: string }

export default function AstralChatModal({ onClose, initialMessage }: Props) {
  const [active, setActive] = useState(isStarGuardianActive());
  const [messages, setMessages] = useState<Msg[]>([
    {
      who: "astral",
      time: Date.now(),
      text: active
        ? "✨ Я к твоим услугам. Спрашивай или давай команды — «открой ящик», «прокачай Мию», «поставь питомца Феникс»."
        : "✨ Привет! Я Астрал. Спроси про любого бойца, режим или питомца. Со Star Guardian я могу ещё и выполнять команды.",
    },
  ]);
  const [input, setInput] = useState(initialMessage ?? "");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const t = setInterval(() => setActive(isStarGuardianActive()), 1500);
    return () => clearInterval(t);
  }, []);

  const send = (text?: string) => {
    const value = (text ?? input).trim();
    if (!value) return;
    setInput("");
    const userMsg: Msg = { who: "user", text: value, time: Date.now() };
    let reply = "";
    try {
      if (looksLikeCommand(value)) {
        const r = executeCommand(value);
        reply = r.handled ? r.reply : chatRespond(value).text;
      } else {
        reply = chatRespond(value).text;
      }
    } catch {
      reply = "⚠️ Я запутался в формулировке. Попробуй короче: «прокачай Мию до 5», «открой редкий сундук», «поставь питомца Лекарь».";
    }
    setMessages(prev => [...prev, userMsg, { who: "astral", text: reply, time: Date.now() + 1 }]);
  };

  const suggestions = active
    ? ["Открой ящик", "Прокачай Мию", "Расскажи про Сору", "Какие сегодня бонусы?"]
    : ["Расскажи про Мию", "Как играть в Star Battle?", "Что такое Star Guardian?", "Сколько стоят сундуки?"];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 250,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, backdropFilter: "blur(6px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 540, height: "min(680px, 90vh)",
          background: "linear-gradient(160deg, #1A0033 0%, #2D0050 60%, #4A148C 100%)",
          border: "2px solid #CE93D8",
          borderRadius: 20,
          boxShadow: "0 0 60px rgba(206,147,216,0.55)",
          display: "flex", flexDirection: "column",
          overflow: "hidden", color: "white",
          fontFamily: "'Segoe UI', Arial, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "14px 18px",
          background: "linear-gradient(90deg, rgba(255,215,64,0.18), transparent)",
          borderBottom: "1px solid rgba(206,147,216,0.4)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: "radial-gradient(circle at 35% 30%, #B388FF, #4A148C)",
            border: "2px solid #FFD740", display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: 22,
          }}>✨</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 17 }}>Астрал</div>
            <div style={{ fontSize: 11, color: active ? "#FFD740" : "#CE93D8" }}>
              {active ? "Star Guardian активен — все функции открыты" : "Бесплатный режим (только знания)"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8, color: "white", cursor: "pointer",
              padding: "4px 10px", fontWeight: 700,
            }}
          >✕</button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{
          flex: 1, overflowY: "auto", padding: "16px 18px",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.who === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              background: m.who === "user"
                ? "linear-gradient(135deg, #2962FF, #1A237E)"
                : "rgba(255,255,255,0.08)",
              border: m.who === "user"
                ? "1px solid rgba(64,196,255,0.5)"
                : "1px solid rgba(206,147,216,0.4)",
              borderRadius: 14,
              padding: "9px 14px",
              fontSize: 13.5, lineHeight: 1.45,
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {m.text}
            </div>
          ))}
        </div>

        {/* Suggestion chips */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 6,
          padding: "0 18px 8px",
        }}>
          {suggestions.map(s => (
            <button key={s}
              onClick={() => send(s)}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(206,147,216,0.4)",
                borderRadius: 16, padding: "4px 10px",
                color: "#CE93D8", cursor: "pointer",
                fontSize: 11, fontWeight: 600,
              }}>{s}</button>
          ))}
        </div>

        {/* Input */}
        <div style={{
          display: "flex", gap: 8, padding: 14,
          borderTop: "1px solid rgba(206,147,216,0.3)",
          background: "rgba(0,0,0,0.25)",
        }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder="Спроси что-нибудь…"
            style={{
              flex: 1, background: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(206,147,216,0.45)",
              borderRadius: 10, padding: "10px 12px",
              color: "white", fontSize: 13.5, outline: "none",
            }}
          />
          <button
            onClick={() => send()}
            style={{
              background: "linear-gradient(135deg, #FFD740, #FFA000)",
              border: "none", borderRadius: 10, padding: "0 16px",
              fontWeight: 800, color: "#3E2723", cursor: "pointer",
              fontSize: 13,
            }}>Отправить</button>
        </div>
      </div>
    </div>
  );
}
