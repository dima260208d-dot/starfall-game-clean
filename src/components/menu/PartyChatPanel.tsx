import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { getCurrentProfile } from "../../utils/localStorageAPI";
import { normalizePlayerIdQuery } from "../../utils/playerId";
import ChatPinTray from "../ChatPinTray";
import {
  getPartyChatMessages,
  markPartyChatRead,
  sendPartyChatPin,
  sendPartyChatText,
  scheduleGuardianAiPartyRescan,
} from "../../utils/social/partyChat";
import { PARTY_CHANGED_EVENT } from "../../utils/social/party";
import { ChatPinBubble } from "../ChatPinBubble";

const PIN_COOLDOWN_MS = 2500;

interface Props {
  brawlerId: string;
  onClose: () => void;
}

export default function PartyChatPanel({ brawlerId, onClose }: Props) {
  const { t, localeMeta } = useI18n();
  const [text, setText] = useState("");
  const [showPins, setShowPins] = useState(false);
  const [tick, setTick] = useState(0);
  const [pinCooldownUntil, setPinCooldownUntil] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bump = () => setTick(n => n + 1);
    window.addEventListener(PARTY_CHANGED_EVENT, bump);
    return () => window.removeEventListener(PARTY_CHANGED_EVENT, bump);
  }, []);

  useEffect(() => {
    scheduleGuardianAiPartyRescan(2500);
  }, []);

  const messages = getPartyChatMessages();
  void tick;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useLayoutEffect(() => {
    markPartyChatRead();
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const sendText = async () => {
    const r = await sendPartyChatText(text);
    if (r.success) {
      setText("");
    }
    setTick(n => n + 1);
    requestAnimationFrame(() => scrollToBottom("smooth"));
  };

  const sendPin = (pinId: string) => {
    if (Date.now() < pinCooldownUntil) return;
    const r = sendPartyChatPin(pinId, brawlerId);
    if (r.success) {
      setPinCooldownUntil(Date.now() + PIN_COOLDOWN_MS);
      setShowPins(false);
      setTick(n => n + 1);
      requestAnimationFrame(() => scrollToBottom("smooth"));
    }
  };

  const pinCooldown = Date.now() < pinCooldownUntil;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 52, background: "rgba(2,0,18,0.45)" }}
      />
      <div style={{
        position: "fixed",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 53,
        width: "min(560px, 96vw)",
        height: "min(78vh, 720px)",
        maxHeight: "min(78vh, 720px)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "linear-gradient(165deg, rgba(22,12,52,0.97), rgba(8,4,24,0.98))",
        border: "1px solid rgba(206,147,216,0.42)",
        borderRadius: 16,
        boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.04)",
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#CE93D8" }}>
            {t("party.chatTitle")}
          </div>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose} style={{ minHeight: 0, padding: "6px 10px" }}>
            ✕
          </button>
        </div>

        <div
          ref={scrollRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {messages.length === 0 ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.45)", padding: "48px 16px", fontSize: 15 }}>
              {t("party.chatEmpty")}
            </div>
          ) : (
            messages.map(m => {
              const me = getCurrentProfile();
              const isMine = !!(me?.playerId && normalizePlayerIdQuery(m.playerId) === normalizePlayerIdQuery(me.playerId));
              if (m.system) {
                return (
                  <div key={m.id} style={{
                    alignSelf: "center", maxWidth: "92%",
                    padding: "6px 12px",
                    background: "rgba(255,213,79,0.08)",
                    border: "1px solid rgba(255,213,79,0.3)",
                    borderRadius: 8,
                    fontSize: 11, color: "#FFD54F", fontWeight: 700, textAlign: "center",
                  }}>
                    {m.text}
                  </div>
                );
              }
              if (m.astral) {
                return (
                  <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", width: "100%" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#CE93D8", marginBottom: 3, padding: "0 4px" }}>
                      {m.username}
                    </div>
                    <div style={{
                      maxWidth: "85%",
                      background: "linear-gradient(135deg, rgba(123,31,162,0.45), rgba(74,20,140,0.55))",
                      border: "1px solid rgba(206,147,216,0.55)",
                      borderRadius: 12,
                      padding: "10px 14px",
                      fontSize: 14,
                      color: "#F3E5F5",
                      lineHeight: 1.35,
                      wordBreak: "break-word",
                      boxShadow: "0 0 12px rgba(156,39,176,0.25)",
                    }}>
                      {m.text}
                    </div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 2, padding: "0 4px" }}>
                      {new Date(m.sentAt).toLocaleString(localeMeta.bcp47, {
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isMine ? "flex-end" : "flex-start",
                  }}
                >
                  {!isMine && (
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#CE93D8", marginBottom: 3, padding: "0 4px" }}>
                      {m.username}
                    </div>
                  )}
                  {m.pinId ? (
                    <ChatPinBubble pinId={m.pinId} size={72} />
                  ) : (
                    <div style={{
                      maxWidth: "85%",
                      background: isMine
                        ? "linear-gradient(135deg, #7B1FA2, #4A148C)"
                        : "rgba(255,255,255,0.07)",
                      border: `1px solid ${isMine ? "rgba(206,147,216,0.45)" : "rgba(255,255,255,0.12)"}`,
                      borderRadius: 12,
                      padding: "10px 14px",
                      fontSize: 14,
                      color: "#fff",
                      lineHeight: 1.35,
                      wordBreak: "break-word",
                    }}>
                      {m.text}
                    </div>
                  )}
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 2, padding: "0 4px" }}>
                    {new Date(m.sentAt).toLocaleString(localeMeta.bcp47, {
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {showPins && (
          <div style={{
            padding: "8px 14px 0",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(0,0,0,0.2)",
            flexShrink: 0,
          }}>
            <ChatPinTray
              brawlerId={brawlerId}
              onPick={sendPin}
              disabled={pinCooldown}
              compact
            />
          </div>
        )}

        <div style={{
          display: "flex",
          gap: 8,
          padding: "14px 18px 18px",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          flexShrink: 0,
        }}>
          <button
            type="button"
            className="ui-btn ui-btn--secondary"
            title={t("chatPin.title")}
            disabled={pinCooldown}
            onClick={() => setShowPins(v => !v)}
            style={{ minWidth: 48, minHeight: 0, padding: "10px 12px", fontSize: 20 }}
          >
            📌
          </button>
          <input
            className="ui-input"
            value={text}
            onChange={e => setText(e.target.value.slice(0, 120))}
            onKeyDown={e => { if (e.key === "Enter") sendText(); }}
            placeholder={t("party.chatPlaceholder")}
            style={{ flex: 1, minHeight: 0, fontSize: 15 }}
          />
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            onClick={sendText}
            disabled={!text.trim()}
            style={{ minHeight: 0, padding: "8px 16px", fontWeight: 800 }}
          >
            {t("common.send")}
          </button>
        </div>
      </div>
    </>
  );
}
