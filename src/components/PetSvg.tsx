/**
 * PetSvg — hand-drawn animated SVG pet renderer with a pseudo-3D feel.
 * Each pet kind has a unique silhouette built from primitive shapes.
 * The component bobs, rotates and animates idle motion using CSS keyframes
 * and inline SVG transforms.
 */
import type { PetDef } from "../entities/PetData";

interface PetSvgProps {
  pet: PetDef;
  size?: number;
  animated?: boolean;     // master toggle for idle motion
  facing?: "left" | "right";
  haloPulse?: boolean;    // adds a glowing aura around the pet
}

const KEYFRAMES = `
  @keyframes petBob   { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
  @keyframes petTail  { 0%,100% { transform: rotate(-8deg); }  50% { transform: rotate(12deg); } }
  @keyframes petWing  { 0%,100% { transform: scaleY(0.85); }   50% { transform: scaleY(1.15); } }
  @keyframes petFlap  { 0%,100% { transform: rotate(-22deg); } 50% { transform: rotate(22deg); } }
  @keyframes petBlink { 0%,92%,100% { transform: scaleY(1); }  96% { transform: scaleY(0.1); } }
  @keyframes petSparkle { 0%,100% { opacity: 0.25; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.25); } }
  @keyframes petHalo  { 0%,100% { opacity: 0.45; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.18); } }
`;

export default function PetSvg({
  pet,
  size = 96,
  animated = true,
  facing = "right",
  haloPulse = true,
}: PetSvgProps) {
  const v = pet.visual;
  const flip = facing === "left" ? "scale(-1, 1)" : undefined;

  return (
    <div style={{
      width: size, height: size,
      position: "relative",
      display: "inline-flex",
      alignItems: "center", justifyContent: "center",
    }}>
      <style>{KEYFRAMES}</style>

      {haloPulse && (
        <div style={{
          position: "absolute", inset: 0,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${pet.color}55 0%, ${pet.color}22 40%, transparent 70%)`,
          animation: animated ? "petHalo 2.4s ease-in-out infinite" : undefined,
          pointerEvents: "none",
        }} />
      )}

      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        style={{
          position: "relative", zIndex: 1,
          overflow: "visible",
          animation: animated ? "petBob 2.5s ease-in-out infinite" : undefined,
          transform: flip,
          filter: `drop-shadow(0 6px 4px rgba(0,0,0,0.35)) drop-shadow(0 0 8px ${pet.color}66)`,
        }}
      >
        <defs>
          <radialGradient id={`body_${pet.id}`} cx="40%" cy="35%" r="65%">
            <stop offset="0%"  stopColor="#FFFFFF" stopOpacity="0.45" />
            <stop offset="55%" stopColor={v.bodyColor} />
            <stop offset="100%" stopColor={v.bodyColor} stopOpacity="1" />
          </radialGradient>
          <radialGradient id={`shadow_${pet.id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="rgba(0,0,0,0.5)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <linearGradient id={`accent_${pet.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor={v.accentColor} />
            <stop offset="100%" stopColor={v.bodyColor} />
          </linearGradient>
        </defs>

        {/* Floor shadow — gives a hint of 3D grounding */}
        <ellipse cx="50" cy="92" rx="22" ry="4" fill={`url(#shadow_${pet.id})`} />

        {renderPetBody(pet, animated)}

        {/* Sparkles around the pet for high-rarity flair */}
        {(pet.rarity === "epic" || pet.rarity === "mythic" || pet.rarity === "legendary") && (
          <g style={{ transformOrigin: "50px 50px" }}>
            {[0, 90, 180, 270].map((rot, i) => (
              <circle
                key={i}
                cx="50" cy="10" r="1.6"
                fill={pet.color}
                style={{
                  transformOrigin: "50px 50px",
                  transform: `rotate(${rot}deg)`,
                  animation: animated ? `petSparkle 1.4s ease-in-out ${i * 0.25}s infinite` : undefined,
                }}
              />
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}

function renderPetBody(pet: PetDef, anim: boolean) {
  const v = pet.visual;
  const id = pet.id;

  switch (v.kind) {
    case "cat":
      return (
        <g>
          {/* tail */}
          <path
            d="M 28 65 Q 12 60 12 45 Q 12 30 22 30"
            fill="none" stroke={v.bodyColor} strokeWidth="6" strokeLinecap="round"
            style={{ transformOrigin: "28px 60px", animation: anim ? "petTail 1.6s ease-in-out infinite" : undefined }}
          />
          {/* body */}
          <ellipse cx="50" cy="64" rx="22" ry="18" fill={`url(#body_${id})`} />
          {/* hind paw */}
          <ellipse cx="62" cy="80" rx="6" ry="3" fill={v.bodyColor} />
          <ellipse cx="40" cy="80" rx="6" ry="3" fill={v.bodyColor} />
          {/* head */}
          <circle cx="50" cy="40" r="18" fill={`url(#body_${id})`} />
          {/* ears */}
          <polygon points="36,25 38,40 46,32" fill={v.bodyColor} />
          <polygon points="64,25 62,40 54,32" fill={v.bodyColor} />
          <polygon points="38,28 40,38 44,33" fill={v.accentColor} />
          <polygon points="62,28 60,38 56,33" fill={v.accentColor} />
          {/* eyes */}
          <ellipse cx="44" cy="42" rx="3.2" ry="4.2" fill={v.eyeColor}
            style={{ transformOrigin: "44px 42px", animation: anim ? "petBlink 4s ease-in-out infinite" : undefined }} />
          <ellipse cx="56" cy="42" rx="3.2" ry="4.2" fill={v.eyeColor}
            style={{ transformOrigin: "56px 42px", animation: anim ? "petBlink 4s ease-in-out infinite" : undefined }} />
          <circle cx="44" cy="42" r="0.9" fill="#000" />
          <circle cx="56" cy="42" r="0.9" fill="#000" />
          {/* nose + smile */}
          <path d="M 48 47 L 52 47 L 50 49 Z" fill="#FF80AB" />
          <path d="M 50 49 Q 47 52 45 51 M 50 49 Q 53 52 55 51" stroke="#000" strokeWidth="0.8" fill="none" />
          {/* whiskers */}
          <path d="M 42 47 L 33 46 M 42 49 L 33 50 M 58 47 L 67 46 M 58 49 L 67 50" stroke={v.bodyColor} strokeWidth="0.6" />
        </g>
      );

    case "dragon":
      return (
        <g>
          {/* tail */}
          <path
            d="M 30 70 Q 12 70 10 55"
            fill="none" stroke={v.bodyColor} strokeWidth="7" strokeLinecap="round"
            style={{ transformOrigin: "30px 70px", animation: anim ? "petTail 1.4s ease-in-out infinite" : undefined }}
          />
          {/* wings */}
          <g style={{ transformOrigin: "50px 50px", animation: anim ? "petFlap 0.6s ease-in-out infinite" : undefined }}>
            <path d="M 38 50 Q 18 30 22 55 L 38 60 Z" fill={v.accentColor} opacity="0.85" />
            <path d="M 62 50 Q 82 30 78 55 L 62 60 Z" fill={v.accentColor} opacity="0.85" />
          </g>
          {/* body */}
          <ellipse cx="50" cy="62" rx="20" ry="16" fill={`url(#body_${id})`} />
          {/* belly scales */}
          <ellipse cx="50" cy="68" rx="12" ry="8" fill={v.accentColor} opacity="0.65" />
          {/* head */}
          <ellipse cx="50" cy="38" rx="16" ry="14" fill={`url(#body_${id})`} />
          {/* horns */}
          <polygon points="40,26 42,18 47,28" fill={v.accentColor} />
          <polygon points="60,26 58,18 53,28" fill={v.accentColor} />
          {/* eyes */}
          <circle cx="44" cy="38" r="2.8" fill="#FFF" />
          <circle cx="56" cy="38" r="2.8" fill="#FFF" />
          <circle cx="44" cy="38.5" r="1.4" fill={v.eyeColor} />
          <circle cx="56" cy="38.5" r="1.4" fill={v.eyeColor} />
          {/* fire breath */}
          <g style={{ animation: anim ? "petSparkle 0.7s ease-in-out infinite" : undefined }}>
            <circle cx="68" cy="42" r="1.8" fill="#FFD740" />
            <circle cx="72" cy="40" r="1.4" fill="#FF6F00" />
            <circle cx="76" cy="42" r="1" fill="#FF1744" />
          </g>
        </g>
      );

    case "wolf":
      return (
        <g>
          {/* tail */}
          <path
            d="M 28 65 Q 14 55 16 38"
            fill="none" stroke={v.bodyColor} strokeWidth="6" strokeLinecap="round"
            style={{ transformOrigin: "28px 60px", animation: anim ? "petTail 1.5s ease-in-out infinite" : undefined }}
          />
          {/* body */}
          <ellipse cx="50" cy="64" rx="22" ry="16" fill={`url(#body_${id})`} />
          {/* legs */}
          <rect x="36" y="74" width="6" height="10" rx="2" fill={v.bodyColor} />
          <rect x="58" y="74" width="6" height="10" rx="2" fill={v.bodyColor} />
          {/* head */}
          <ellipse cx="50" cy="42" rx="17" ry="15" fill={`url(#body_${id})`} />
          {/* snout */}
          <ellipse cx="50" cy="48" rx="8" ry="5" fill={v.accentColor} />
          {/* ears */}
          <polygon points="36,28 32,18 44,30" fill={v.bodyColor} />
          <polygon points="64,28 68,18 56,30" fill={v.bodyColor} />
          <polygon points="38,28 38,22 43,29" fill={v.accentColor} />
          <polygon points="62,28 62,22 57,29" fill={v.accentColor} />
          {/* glowing eyes */}
          <ellipse cx="44" cy="40" rx="2.4" ry="3" fill={v.eyeColor} />
          <ellipse cx="56" cy="40" rx="2.4" ry="3" fill={v.eyeColor} />
          {/* fangs */}
          <polygon points="48,50 47,54 49,52" fill="#FFF" />
          <polygon points="52,50 53,54 51,52" fill="#FFF" />
        </g>
      );

    case "beetle":
      return (
        <g>
          {/* legs */}
          <path d="M 28 60 L 18 55 M 28 65 L 16 65 M 28 70 L 20 78" stroke={v.bodyColor} strokeWidth="2" strokeLinecap="round" />
          <path d="M 72 60 L 82 55 M 72 65 L 84 65 M 72 70 L 80 78" stroke={v.bodyColor} strokeWidth="2" strokeLinecap="round" />
          {/* shell */}
          <ellipse cx="50" cy="60" rx="26" ry="22" fill={`url(#body_${id})`} />
          {/* shell mid line */}
          <line x1="50" y1="40" x2="50" y2="80" stroke={v.accentColor} strokeWidth="1.5" />
          {/* shell highlights */}
          <ellipse cx="42" cy="50" rx="6" ry="4" fill="#FFFFFF" opacity="0.4" />
          <ellipse cx="58" cy="50" rx="6" ry="4" fill="#FFFFFF" opacity="0.25" />
          {/* head */}
          <ellipse cx="50" cy="34" rx="11" ry="9" fill={v.bodyColor} />
          {/* horn */}
          <path d="M 50 22 L 44 14 L 50 18 L 56 14 L 50 22 Z" fill={v.accentColor} />
          {/* eyes */}
          <circle cx="46" cy="35" r="2" fill={v.eyeColor} />
          <circle cx="54" cy="35" r="2" fill={v.eyeColor} />
          {/* gold sparkle */}
          <g style={{ animation: anim ? "petSparkle 1.2s ease-in-out infinite" : undefined }}>
            <polygon points="62,46 64,50 68,48 64,52 66,57 62,53 58,57 60,52 56,48 60,50" fill="#FFD740" />
          </g>
        </g>
      );

    case "phoenix":
      return (
        <g>
          {/* wings */}
          <g style={{ transformOrigin: "50px 50px", animation: anim ? "petFlap 0.5s ease-in-out infinite" : undefined }}>
            <path d="M 35 50 Q 8 30 12 60 Q 22 58 35 56 Z" fill={v.accentColor} opacity="0.9" />
            <path d="M 65 50 Q 92 30 88 60 Q 78 58 65 56 Z" fill={v.accentColor} opacity="0.9" />
            <path d="M 35 50 Q 14 38 18 58 Q 26 56 35 54 Z" fill={v.bodyColor} opacity="0.85" />
            <path d="M 65 50 Q 86 38 82 58 Q 74 56 65 54 Z" fill={v.bodyColor} opacity="0.85" />
          </g>
          {/* body */}
          <ellipse cx="50" cy="56" rx="14" ry="18" fill={`url(#body_${id})`} />
          {/* tail flames */}
          <g style={{ animation: anim ? "petSparkle 0.9s ease-in-out infinite" : undefined }}>
            <path d="M 50 72 Q 42 88 38 80 Q 46 80 44 72 Z" fill="#FFD600" />
            <path d="M 50 72 Q 58 88 62 80 Q 54 80 56 72 Z" fill="#FF6F00" />
            <path d="M 50 76 Q 50 92 48 86 Q 50 84 50 76 Z" fill="#FF1744" />
          </g>
          {/* head */}
          <circle cx="50" cy="36" r="11" fill={`url(#body_${id})`} />
          {/* crest */}
          <path d="M 50 22 L 47 12 L 50 18 L 53 12 L 50 22 Z" fill="#FFD600" />
          {/* eyes */}
          <circle cx="46" cy="36" r="1.6" fill={v.eyeColor} />
          <circle cx="54" cy="36" r="1.6" fill={v.eyeColor} />
          {/* beak */}
          <polygon points="50,40 47,46 53,46" fill="#FFB300" />
        </g>
      );

    case "owl":
      return (
        <g>
          {/* wings */}
          <g style={{ transformOrigin: "50px 55px", animation: anim ? "petWing 1.4s ease-in-out infinite" : undefined }}>
            <ellipse cx="32" cy="58" rx="9" ry="14" fill={v.bodyColor} />
            <ellipse cx="68" cy="58" rx="9" ry="14" fill={v.bodyColor} />
          </g>
          {/* body */}
          <ellipse cx="50" cy="60" rx="20" ry="22" fill={`url(#body_${id})`} />
          {/* belly */}
          <ellipse cx="50" cy="65" rx="12" ry="14" fill={v.accentColor} opacity="0.6" />
          {/* head */}
          <circle cx="50" cy="38" r="18" fill={`url(#body_${id})`} />
          {/* ear tufts */}
          <polygon points="38,22 35,12 44,24" fill={v.bodyColor} />
          <polygon points="62,22 65,12 56,24" fill={v.bodyColor} />
          {/* eyes */}
          <circle cx="42" cy="38" r="6" fill="#FFF" />
          <circle cx="58" cy="38" r="6" fill="#FFF" />
          <circle cx="42" cy="38" r="3" fill={v.eyeColor} />
          <circle cx="58" cy="38" r="3" fill={v.eyeColor} />
          <circle cx="42" cy="38" r="1.2" fill="#000" />
          <circle cx="58" cy="38" r="1.2" fill="#000" />
          {/* beak */}
          <polygon points="50,42 46,49 54,49" fill="#FFA000" />
        </g>
      );

    case "fox":
      return (
        <g>
          {/* tail */}
          <path
            d="M 28 65 Q 8 60 14 35 L 22 50 Q 26 55 30 60 Z"
            fill={v.bodyColor}
            style={{ transformOrigin: "28px 60px", animation: anim ? "petTail 1.7s ease-in-out infinite" : undefined }}
          />
          <path d="M 14 35 Q 18 38 22 36" fill="#FFFFFF" opacity="0.85" />
          {/* body */}
          <ellipse cx="50" cy="62" rx="20" ry="14" fill={`url(#body_${id})`} />
          {/* legs */}
          <rect x="38" y="72" width="5" height="9" rx="2" fill={v.bodyColor} />
          <rect x="56" y="72" width="5" height="9" rx="2" fill={v.bodyColor} />
          {/* head */}
          <ellipse cx="50" cy="40" rx="15" ry="14" fill={`url(#body_${id})`} />
          {/* snout */}
          <polygon points="50,50 44,46 56,46" fill={v.accentColor} />
          <circle cx="50" cy="51" r="1.3" fill="#000" />
          {/* ears */}
          <polygon points="36,28 32,16 44,28" fill={v.bodyColor} />
          <polygon points="64,28 68,16 56,28" fill={v.bodyColor} />
          {/* eyes */}
          <ellipse cx="44" cy="38" rx="2" ry="3" fill={v.eyeColor} />
          <ellipse cx="56" cy="38" rx="2" ry="3" fill={v.eyeColor} />
          {/* flame trim */}
          <g style={{ animation: anim ? "petSparkle 0.9s ease-in-out infinite" : undefined }}>
            <circle cx="20" cy="38" r="1.4" fill="#FFD740" />
            <circle cx="14" cy="48" r="1.2" fill="#FF6F00" />
          </g>
        </g>
      );

    case "turtle":
      return (
        <g>
          {/* legs */}
          <ellipse cx="28" cy="68" rx="6" ry="4" fill={v.bodyColor} />
          <ellipse cx="72" cy="68" rx="6" ry="4" fill={v.bodyColor} />
          <ellipse cx="34" cy="80" rx="5" ry="3" fill={v.bodyColor} />
          <ellipse cx="66" cy="80" rx="5" ry="3" fill={v.bodyColor} />
          {/* shell */}
          <ellipse cx="50" cy="58" rx="26" ry="20" fill={`url(#body_${id})`} />
          {/* shell pattern */}
          {[
            [38, 50], [50, 46], [62, 50], [44, 60], [56, 60], [50, 70],
          ].map(([cx, cy], i) => (
            <polygon
              key={i}
              points={`${cx},${cy - 5} ${cx + 5},${cy} ${cx},${cy + 5} ${cx - 5},${cy}`}
              fill={v.accentColor} opacity="0.85"
            />
          ))}
          {/* head */}
          <ellipse cx="50" cy="34" rx="11" ry="9" fill={v.bodyColor} />
          {/* eyes */}
          <circle cx="46" cy="34" r="1.8" fill={v.eyeColor} />
          <circle cx="54" cy="34" r="1.8" fill={v.eyeColor} />
          {/* mouth */}
          <path d="M 47 39 Q 50 41 53 39" stroke="#000" strokeWidth="0.8" fill="none" />
        </g>
      );

    case "rabbit":
      return (
        <g>
          {/* feet */}
          <ellipse cx="38" cy="84" rx="8" ry="3.5" fill={v.bodyColor} />
          <ellipse cx="62" cy="84" rx="8" ry="3.5" fill={v.bodyColor} />
          {/* body */}
          <ellipse cx="50" cy="64" rx="20" ry="18" fill={`url(#body_${id})`} />
          {/* head */}
          <circle cx="50" cy="40" r="16" fill={`url(#body_${id})`} />
          {/* ears */}
          <ellipse cx="42" cy="20" rx="4" ry="13" fill={v.bodyColor}
            style={{ transformOrigin: "42px 30px", animation: anim ? "petWing 1.6s ease-in-out infinite" : undefined }} />
          <ellipse cx="58" cy="20" rx="4" ry="13" fill={v.bodyColor}
            style={{ transformOrigin: "58px 30px", animation: anim ? "petWing 1.6s ease-in-out infinite 0.2s" : undefined }} />
          <ellipse cx="42" cy="22" rx="2" ry="9" fill={v.accentColor} />
          <ellipse cx="58" cy="22" rx="2" ry="9" fill={v.accentColor} />
          {/* eyes */}
          <circle cx="44" cy="40" r="2.4" fill={v.eyeColor} />
          <circle cx="56" cy="40" r="2.4" fill={v.eyeColor} />
          <circle cx="44" cy="40" r="1" fill="#000" />
          <circle cx="56" cy="40" r="1" fill="#000" />
          {/* nose */}
          <ellipse cx="50" cy="46" rx="2" ry="1.4" fill="#FF80AB" />
          {/* tail */}
          <circle cx="22" cy="62" r="6" fill="#FFF"
            style={{ transformOrigin: "22px 62px", animation: anim ? "petBob 0.8s ease-in-out infinite" : undefined }} />
        </g>
      );

    case "spirit":
      return (
        <g>
          {/* aura layers */}
          <ellipse cx="50" cy="60" rx="22" ry="16" fill={v.bodyColor} opacity="0.45"
            style={{ transformOrigin: "50px 60px", animation: anim ? "petHalo 2s ease-in-out infinite" : undefined }} />
          {/* body — wisp */}
          <path
            d="M 30 56 Q 30 30 50 30 Q 70 30 70 56 Q 72 78 60 78 L 56 70 L 50 78 L 44 70 L 40 78 Q 28 78 30 56 Z"
            fill={`url(#body_${id})`}
          />
          {/* eyes */}
          <ellipse cx="44" cy="50" rx="2.2" ry="3" fill={v.eyeColor} />
          <ellipse cx="56" cy="50" rx="2.2" ry="3" fill={v.eyeColor} />
          {/* mouth */}
          <path d="M 47 58 Q 50 61 53 58" stroke="#1A237E" strokeWidth="1" fill="none" />
          {/* sparkles around */}
          <g style={{ animation: anim ? "petSparkle 1.5s ease-in-out infinite" : undefined }}>
            <circle cx="22" cy="38" r="1.6" fill={v.accentColor} />
            <circle cx="78" cy="40" r="1.4" fill={v.accentColor} />
            <circle cx="80" cy="68" r="1.3" fill={v.accentColor} />
            <circle cx="20" cy="66" r="1.3" fill={v.accentColor} />
          </g>
        </g>
      );
  }
}
