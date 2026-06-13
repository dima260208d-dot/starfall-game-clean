import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { TrophyIcon } from "./GameIcons";
import { brawlerAvatarUrl } from "../utils/modeAssets";
import { getProfileIconImage } from "../utils/profileIconUtils";

const base = (import.meta as any).env?.BASE_URL ?? "/";

export function FriendAvatar({
  profileIconId,
  brawlerId,
  username,
  online,
  size = 48,
}: {
  profileIconId?: string | null;
  brawlerId?: string;
  username: string;
  online?: boolean;
  size?: number;
}) {
  const src = profileIconId
    ? getProfileIconImage(profileIconId, base)
    : brawlerAvatarUrl(brawlerId || "miya");

  return (
    <img
      src={src}
      alt={username}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        border: online ? "2px solid rgba(105,240,174,0.75)" : "2px solid rgba(255,255,255,0.22)",
        boxShadow: online ? "0 0 10px rgba(105,240,174,0.35)" : "0 2px 8px rgba(0,0,0,0.35)",
      }}
    />
  );
}

export interface FriendRowCardProps {
  username: string;
  statusText: string;
  trophies: number;
  online: boolean;
  profileIconId?: string | null;
  brawlerId?: string;
  compact?: boolean;
  modeIconUrl?: string | null;
  trailing?: ReactNode;
  belowName?: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
}

export default function FriendRowCard({
  username,
  statusText,
  trophies,
  online,
  profileIconId,
  brawlerId,
  compact = false,
  modeIconUrl,
  trailing,
  belowName,
  onClick,
  style,
}: FriendRowCardProps) {
  const avatarSize = compact ? 40 : 48;
  const Wrapper = "div";
  const wrapperProps: Record<string, unknown> = {};
  if (onClick) {
    wrapperProps.onClick = onClick;
    wrapperProps.role = "button";
    wrapperProps.tabIndex = 0;
    wrapperProps.onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    };
  }

  return (
    <Wrapper
      {...wrapperProps}
      style={{
        display: "grid",
        gridTemplateColumns: trailing ? `${avatarSize}px 1fr auto auto` : `${avatarSize}px 1fr auto`,
        alignItems: "center",
        gap: compact ? 8 : 10,
        padding: compact ? "6px 8px" : "10px 12px",
        background: "linear-gradient(135deg, rgba(30,15,60,0.75), rgba(10,5,30,0.9))",
        border: `1px solid ${online ? "rgba(105,240,174,0.45)" : "rgba(255,255,255,0.12)"}`,
        borderRadius: compact ? 10 : 12,
        color: "#fff",
        textAlign: "left",
        cursor: onClick ? "pointer" : "default",
        width: "100%",
        fontFamily: "inherit",
        ...style,
      }}
    >
      <div style={{ position: "relative", width: avatarSize, height: avatarSize, flexShrink: 0 }}>
        <FriendAvatar
          profileIconId={profileIconId}
          brawlerId={brawlerId}
          username={username}
          online={online}
          size={avatarSize}
        />
        {modeIconUrl && (
          <img
            src={modeIconUrl}
            alt=""
            style={{
              position: "absolute",
              right: -4,
              bottom: -4,
              width: compact ? 18 : 22,
              height: compact ? 18 : 22,
              borderRadius: 6,
              border: "2px solid rgba(8,4,24,0.95)",
              objectFit: "cover",
              boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
            }}
          />
        )}
      </div>

      <div style={{ minWidth: 0, textAlign: "center" }}>
        <div
          style={{
            fontWeight: 900,
            fontSize: compact ? 11 : 14,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {username}
        </div>
        <div
          style={{
            fontSize: compact ? 10 : 12,
            marginTop: 2,
            fontWeight: 700,
            color: online ? "#69F0AE" : "rgba(255,255,255,0.55)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {statusText}
        </div>
        {belowName}
      </div>

      <div
        style={{
          fontSize: compact ? 13 : 16,
          fontWeight: 900,
          color: "#FFD700",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          flexShrink: 0,
          justifySelf: "end",
        }}
      >
        <TrophyIcon size={compact ? 12 : 14} lite />
        {trophies}
      </div>

      {trailing}
    </Wrapper>
  );
}
