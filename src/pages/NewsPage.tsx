import { useEffect, useMemo, useState } from "react";
import {
  getNewsSorted, getNewsCategories, markNewsSeen,
  type NewsItem, type NewsCategory,
} from "../utils/news";
import { getCurrentUsername } from "../utils/localStorageAPI";

interface NewsPageProps {
  onBack: () => void;
}

export default function NewsPage({ onBack }: NewsPageProps) {
  const [items, setItems] = useState<NewsItem[]>(() => getNewsSorted());
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const [filter, setFilter] = useState<string>("all");
  const cats = useMemo(() => getNewsCategories(), []);
  const user = getCurrentUsername();

  useEffect(() => { setItems(getNewsSorted()); }, []);

  const visible = useMemo(() => (
    filter === "all" ? items : items.filter(n => n.categoryId === filter)
  ), [items, filter]);

  const active = visible.find(n => n.id === activeId)
    ?? items.find(n => n.id === activeId)
    ?? visible[0]
    ?? null;

  // Mark active as seen on click.
  useEffect(() => {
    if (active && user) markNewsSeen(user, active.id);
  }, [active?.id, user]);

  return (
    <div style={{
      minHeight: "100%",
      background: "linear-gradient(135deg, #0f2450 0%, #1b3b75 50%, #245297 100%)",
      color: "white", display: "flex", flexDirection: "column",
      fontFamily: "'Segoe UI', Arial, sans-serif",
    }}>
      <div style={{
        display: "flex", alignItems: "center",
        padding: "14px 22px",
        borderBottom: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.25)",
      }}>
        <button onClick={onBack} style={{
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 10, padding: "7px 16px",
          color: "rgba(255,255,255,0.85)", cursor: "pointer",
          fontSize: 13, fontWeight: 700,
        }}>← Назад</button>
        <h2 style={{
          flex: 1, textAlign: "center", margin: 0,
          fontSize: 22, fontWeight: 900, letterSpacing: 2,
          color: "#FFD54F",
          textShadow: "0 0 14px rgba(255,213,79,0.5)",
        }}>📰 НОВОСТИ</h2>
        <div style={{ width: 110 }} />
      </div>

      {/* Category filter chips */}
      <div style={{
        display: "flex", gap: 8, padding: "10px 22px",
        overflowX: "auto", borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(0,0,0,0.18)",
      }}>
        <Chip active={filter === "all"} color="#FFD54F" onClick={() => setFilter("all")}>
          Все ({items.length})
        </Chip>
        {cats.map(c => {
          const count = items.filter(n => n.categoryId === c.id).length;
          if (count === 0) return null;
          return (
            <Chip key={c.id} active={filter === c.id} color={c.color} onClick={() => setFilter(c.id)}>
              {c.icon} {c.label} ({count})
            </Chip>
          );
        })}
      </div>

      {items.length === 0 ? (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          color: "rgba(255,255,255,0.55)", textAlign: "center", padding: 40,
        }}>
          <div style={{ fontSize: 64, marginBottom: 14 }}>📭</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Новостей пока нет</div>
          <div style={{ fontSize: 12, marginTop: 6, maxWidth: 360 }}>
            Когда команда разработки опубликует обновление или ивент, оно появится здесь.
          </div>
        </div>
      ) : (
        <div style={{
          flex: 1, display: "flex", overflow: "hidden",
        }}>
          {/* List */}
          <div style={{
            flex: "0 0 320px", overflowY: "auto",
            borderRight: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(0,0,0,0.18)",
          }}>
            {visible.map(n => {
              const cat = cats.find(c => c.id === n.categoryId);
              const isActive = active?.id === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setActiveId(n.id)}
                  style={{
                    width: "100%", display: "flex", flexDirection: "column",
                    gap: 6, padding: "12px 16px", textAlign: "left",
                    background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                    borderLeft: isActive ? `4px solid ${cat?.color ?? "#FFD54F"}` : "4px solid transparent",
                    border: "none", borderBottom: "1px solid rgba(255,255,255,0.05)",
                    cursor: "pointer", color: "white",
                  }}
                >
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    fontSize: 10, color: cat?.color ?? "#FFD54F",
                    fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase",
                  }}>
                    <span>{cat?.icon}</span>
                    <span>{cat?.label ?? "—"}</span>
                    <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.4)", letterSpacing: 0 }}>
                      {new Date(n.publishedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.3 }}>
                    {n.title}
                  </div>
                  <div style={{
                    fontSize: 11, color: "rgba(255,255,255,0.55)",
                    overflow: "hidden", textOverflow: "ellipsis",
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  }}>{n.body.slice(0, 120)}</div>
                </button>
              );
            })}
          </div>
          {/* Detail */}
          <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
            {active ? (
              <NewsDetail item={active} cat={cats.find(c => c.id === active.categoryId)} />
            ) : (
              <div style={{ color: "rgba(255,255,255,0.55)" }}>Выберите новость слева</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  active, color, onClick, children,
}: {
  active: boolean; color: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        background: active ? `${color}26` : "rgba(255,255,255,0.04)",
        border: `1.5px solid ${active ? color : "rgba(255,255,255,0.10)"}`,
        borderRadius: 999,
        color: active ? color : "rgba(255,255,255,0.65)",
        fontWeight: 800, fontSize: 11, letterSpacing: 1,
        whiteSpace: "nowrap", cursor: "pointer",
        boxShadow: active ? `0 0 10px ${color}55` : "none",
      }}
    >{children}</button>
  );
}

function NewsDetail({ item, cat }: { item: NewsItem; cat: NewsCategory | undefined }) {
  return (
    <article style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: cat ? `${cat.color}26` : "rgba(255,255,255,0.05)",
        border: `1px solid ${cat?.color ?? "rgba(255,255,255,0.18)"}`,
        borderRadius: 999, padding: "4px 12px",
        fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: cat?.color ?? "#FFD54F",
      }}>
        <span>{cat?.icon ?? "📰"}</span> {cat?.label ?? "—"}
      </div>
      <h1 style={{
        margin: "12px 0 4px",
        fontSize: 28, fontWeight: 900,
        color: "white", lineHeight: 1.2,
        textShadow: "0 2px 6px rgba(0,0,0,0.5)",
      }}>{item.title}</h1>
      <div style={{
        fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 18,
        fontWeight: 600,
      }}>{new Date(item.publishedAt).toLocaleString()}</div>
      <NewsMedia item={item} />
      <div style={{
        whiteSpace: "pre-wrap", lineHeight: 1.6,
        fontSize: 14, color: "rgba(255,255,255,0.88)",
        marginTop: 16,
      }}>{item.body}</div>
    </article>
  );
}

function NewsMedia({ item }: { item: NewsItem }) {
  if (item.youtubeId) {
    return (
      <div style={{
        width: "100%", aspectRatio: "16/9", borderRadius: 14, overflow: "hidden",
        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
      }}>
        <iframe
          src={`https://www.youtube.com/embed/${item.youtubeId}`}
          title={item.title}
          width="100%" height="100%"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ border: "none", display: "block" }}
        />
      </div>
    );
  }
  if (item.videoDataUrl) {
    return (
      <video
        src={item.videoDataUrl}
        controls
        style={{
          width: "100%", maxHeight: 460, borderRadius: 14,
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)", background: "black",
        }}
      />
    );
  }
  if (item.imageDataUrl) {
    return (
      <img
        src={item.imageDataUrl}
        alt={item.title}
        style={{
          width: "100%", maxHeight: 460, objectFit: "cover", borderRadius: 14,
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
        }}
      />
    );
  }
  return null;
}
