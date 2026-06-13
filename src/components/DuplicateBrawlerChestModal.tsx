import { createPortal } from "react-dom";
import { BRAWLERS } from "../entities/BrawlerData";
import { useI18n, brawlerName } from "../i18n";

interface Props {
  brawlerId: string;
  onDone: () => void;
}

export default function DuplicateBrawlerChestModal({ brawlerId, onDone }: Props) {
  const { t } = useI18n();
  const brawler = BRAWLERS.find(b => b.id === brawlerId);
  const base = (import.meta as any).env?.BASE_URL ?? "/";
  if (!brawler) {
    onDone();
    return null;
  }

  return createPortal(
    <div
      onClick={onDone}
      style={{
        position: "fixed", inset: 0, zIndex: 999999,
        background: "radial-gradient(ellipse at center, rgba(255,215,64,0.22) 0%, rgba(0,0,8,0.96) 70%)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        cursor: "pointer", padding: 24,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 4, color: "#FFD54F", marginBottom: 16 }}>
        {t("duplicate.title")}
      </div>
      <img
        src={`${base}brawlers/${brawler.id}_front.png`}
        alt={brawlerName(brawler.id, brawler.name)}
        style={{
          width: 200, height: 200, objectFit: "contain",
          filter: `drop-shadow(0 0 24px ${brawler.color})`,
          animation: "dupBrawlerFloat 2s ease-in-out infinite",
        }}
      />
      <div style={{ fontSize: 28, fontWeight: 900, color: brawler.color, marginTop: 12, textShadow: `0 0 20px ${brawler.color}` }}>
        {brawlerName(brawler.id, brawler.name)}
      </div>
      <div style={{ marginTop: 16, fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.85)", textAlign: "center", maxWidth: 360 }}>
        {t("duplicate.starHint")}
      </div>
      <div style={{ marginTop: 28, fontSize: 12, color: "rgba(255,255,255,0.45)", letterSpacing: 2 }}>
        {t("duplicate.tapContinue")}
      </div>
      <style>{`
        @keyframes dupBrawlerFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
      `}</style>
    </div>,
    document.body,
  );
}
