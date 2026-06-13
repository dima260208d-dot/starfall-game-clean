import { useEffect, useMemo, useState } from "react";
import { BRAWLERS } from "../entities/BrawlerData";
import { getBrawlerRank, getBrawlerTrophies, getCurrentProfile, MAX_BRAWLER_RANK } from "../utils/localStorageAPI";
import { getBrawlerComic, getBrawlerComicTrio, type BrawlerComicChapter } from "../data/brawlerComics";
import { PageBg, PageBody, PageHeader } from "../components/PageChrome";
import BrawlerViewer3D from "../components/BrawlerViewer3D";
import BrawlerRankBar from "../components/BrawlerRankBar";
import { brawlerName } from "../i18n";

interface Props {
  brawlerId: string;
  onBack: () => void;
}

function lockedText(chapter: BrawlerComicChapter, rank: number): string {
  return rank >= chapter.unlockRank
    ? "Открыто"
    : `Откроется на ранге ${chapter.unlockRank}`;
}

function ComicImage({
  title,
  assetPath,
  caption,
  primary,
  secondary,
  accent,
  large = false,
  onZoom,
}: {
  title: string;
  assetPath: string;
  caption?: string;
  primary: string;
  secondary: string;
  accent: string;
  large?: boolean;
  onZoom: (src: string, title: string) => void;
}) {
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setMissing(false);
  }, [assetPath]);

  return (
    <div
      style={{
        position: "relative",
        aspectRatio: "2 / 3",
        minHeight: large ? 520 : 460,
        maxHeight: large ? 760 : 680,
        borderRadius: large ? 26 : 22,
        overflow: "hidden",
        background: missing ? `
          radial-gradient(circle at 25% 20%, ${accent}cc 0%, transparent 26%),
          radial-gradient(circle at 80% 12%, rgba(255,255,255,0.52) 0%, transparent 18%),
          radial-gradient(circle at 62% 78%, ${primary}aa 0%, transparent 30%),
          linear-gradient(135deg, ${secondary}, #080419 58%, ${primary})
        ` : "#05020d",
        border: `2px solid ${accent}99`,
        boxShadow: `0 24px 60px rgba(0,0,0,0.45), inset 0 0 80px ${primary}55`,
        margin: "0 auto",
        width: "min(100%, 620px)",
      }}
    >
      {!missing ? (
        <img
          src={assetPath}
          alt={title}
          onError={() => setMissing(true)}
          onClick={() => onZoom(assetPath, title)}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "contain",
            background: "#05020d",
            cursor: "zoom-in",
          }}
        />
      ) : (
        <>
          <div style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "linear-gradient(120deg, rgba(255,255,255,0.12) 0 2px, transparent 2px 22px), radial-gradient(circle at 50% 50%, transparent 0 55%, rgba(0,0,0,0.38) 100%)",
            mixBlendMode: "screen",
            opacity: 0.62,
          }} />
          <div style={{
            position: "absolute",
            inset: 18,
            border: "1px solid rgba(255,255,255,0.22)",
            borderRadius: large ? 20 : 16,
          }} />
          <div style={{
            position: "absolute",
            left: 26,
            right: 26,
            bottom: 24,
            padding: "14px 16px",
            borderRadius: 16,
            background: "rgba(5,2,18,0.72)",
            border: "1px solid rgba(255,255,255,0.16)",
            backdropFilter: "blur(8px)",
          }}>
            <div style={{ fontSize: large ? 24 : 18, fontWeight: 1000, letterSpacing: 1, color: "#fff" }}>
              {title}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.45, color: "rgba(255,255,255,0.72)" }}>
              Файл ещё не сгенерирован: {assetPath}
            </div>
            {caption && (
              <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.45, color: "rgba(255,255,255,0.58)" }}>
                {caption}
              </div>
            )}
          </div>
        </>
      )}
      <div style={{
        position: "absolute",
        top: 14,
        right: 14,
        display: "flex",
        gap: 8,
      }}>
        <button
          type="button"
          onClick={() => onZoom(assetPath, title)}
          className="ui-btn ui-btn--ghost"
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            background: "rgba(0,0,0,0.48)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 900,
          }}
        >
          Увеличить
        </button>
        <a
          href={assetPath}
          target="_blank"
          rel="noreferrer"
          className="ui-btn ui-btn--ghost"
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            background: "rgba(0,0,0,0.48)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 900,
            textDecoration: "none",
          }}
        >
          Открыть
        </a>
      </div>
      <div style={{
        position: "absolute",
        left: 14,
        top: 14,
        padding: "6px 10px",
        borderRadius: 999,
        background: missing ? "rgba(0,0,0,0.42)" : "rgba(0,0,0,0.3)",
        border: "1px solid rgba(255,255,255,0.18)",
        color: "#fff",
        fontSize: 10,
        fontWeight: 900,
        letterSpacing: 1.2,
        textTransform: "uppercase",
      }}>
        {missing ? "Image missing" : "Comic image"}
      </div>
    </div>
  );
}

function ZoomOverlay({
  src,
  title,
  onClose,
}: {
  src: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3000,
        padding: 24,
        background: "rgba(0,0,0,0.82)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "relative",
          width: "min(96vw, 980px)",
          height: "min(92vh, 1280px)",
          borderRadius: 22,
          background: "#05020d",
          border: "1px solid rgba(255,255,255,0.18)",
          boxShadow: "0 28px 90px rgba(0,0,0,0.68)",
          overflow: "hidden",
        }}
      >
        <img
          src={src}
          alt={title}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
          }}
        />
        <button
          type="button"
          onClick={onClose}
          className="ui-btn ui-btn--ghost"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: "rgba(0,0,0,0.58)",
            color: "#fff",
          }}
        >
          Закрыть
        </button>
        <div style={{
          position: "absolute",
          left: 16,
          right: 80,
          bottom: 14,
          padding: "10px 12px",
          borderRadius: 14,
          background: "rgba(0,0,0,0.58)",
          color: "#fff",
          fontWeight: 900,
        }}>
          {title}
        </div>
      </div>
    </div>
  );
}

export default function BrawlerComicPage({ brawlerId, onBack }: Props) {
  const profile = getCurrentProfile();
  const brawler = BRAWLERS.find(b => b.id === brawlerId) || BRAWLERS[0];
  const comic = getBrawlerComic(brawler.id);
  const trio = getBrawlerComicTrio(brawler.id);
  const trophies = getBrawlerTrophies(profile, brawler.id);
  const rank = getBrawlerRank(trophies);
  const firstUnlockedIndex = Math.max(0, comic.chapters.findLastIndex(ch => rank >= ch.unlockRank));
  const [chapterIndex, setChapterIndex] = useState(firstUnlockedIndex);
  const [pageIndex, setPageIndex] = useState(0);
  const [zoomImage, setZoomImage] = useState<{ src: string; title: string } | null>(null);

  const chapter = comic.chapters[chapterIndex] ?? comic.chapters[0];
  const unlocked = rank >= chapter.unlockRank;
  const page = chapter.pages[pageIndex] ?? chapter.pages[0];
  const trioNames = useMemo(
    () => trio.memberIds.map(id => BRAWLERS.find(b => b.id === id)?.name ?? id).join(" • "),
    [trio.memberIds],
  );

  const selectChapter = (idx: number) => {
    setChapterIndex(idx);
    setPageIndex(0);
  };

  const maxUnlockedChapter = comic.chapters.filter(ch => rank >= ch.unlockRank).length;
  const progressPct = Math.min(100, Math.round((maxUnlockedChapter / comic.chapters.length) * 100));

  return (
    <PageBg variant="comics">
      <PageHeader title={`Комикс: ${brawlerName(brawler.id, brawler.name)}`} onBack={onBack} transparent />
      <PageBody style={{ padding: "12px 18px 20px", minHeight: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)", gap: 18, minHeight: 0, height: "100%" }}>
          <aside style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
            <div className="ui-glass" style={{
              borderRadius: 22,
              padding: 16,
              border: `1px solid ${comic.palette.accent}66`,
              background: "linear-gradient(160deg, rgba(20,8,42,0.82), rgba(7,2,18,0.9))",
              boxShadow: "var(--sh-md)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <BrawlerViewer3D brawlerId={brawler.id} color={brawler.color} size={104} paused efficientPreview />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 1000, color: "#fff", lineHeight: 1.1 }}>{comic.title}</div>
                  <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.68)", lineHeight: 1.35 }}>{comic.subtitle}</div>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <BrawlerRankBar brawlerId={brawler.id} trophies={trophies} layout="compact" />
              </div>
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 10, borderRadius: 999, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                  <div style={{ width: `${progressPct}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${comic.palette.primary}, ${comic.palette.accent})` }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 900, color: "#fff" }}>{maxUnlockedChapter}/10</span>
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.58)", lineHeight: 1.35 }}>
                Трио «{trio.name}»: {trioNames}. Все связи зафиксированы один раз и не пересекаются с другими трио.
              </div>
            </div>

            <div className="quest-scroll" style={{ overflowY: "auto", minHeight: 0, paddingRight: 4 }}>
              {comic.chapters.map((ch, idx) => {
                const isOpen = rank >= ch.unlockRank;
                const active = idx === chapterIndex;
                return (
                  <button
                    key={ch.chapter}
                    type="button"
                    onClick={() => selectChapter(idx)}
                    className="ui-glass"
                    style={{
                      width: "100%",
                      textAlign: "left",
                      display: "block",
                      marginBottom: 8,
                      padding: "11px 12px",
                      borderRadius: 16,
                      cursor: "pointer",
                      opacity: isOpen ? 1 : 0.58,
                      background: active
                        ? `linear-gradient(135deg, ${comic.palette.primary}55, rgba(10,4,28,0.9))`
                        : "rgba(255,255,255,0.07)",
                      border: active ? `1px solid ${comic.palette.accent}` : "1px solid rgba(255,255,255,0.12)",
                      color: "#fff",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 1000 }}>Глава {ch.chapter}. {ch.title}</span>
                      <span style={{ fontSize: 10, fontWeight: 900, color: isOpen ? "#A5D6A7" : "#FFE082" }}>
                        {isOpen ? "Открыта" : `Ранг ${ch.unlockRank}`}
                      </span>
                    </div>
                    <div style={{ marginTop: 5, fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.35 }}>
                      {ch.summary}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="quest-scroll" style={{ minHeight: 0, overflowY: "auto", paddingRight: 6 }}>
            <ComicImage
              large
              title={comic.title}
              assetPath={comic.coverAssetPath}
              caption={comic.subtitle}
              primary={comic.palette.primary}
              secondary={comic.palette.secondary}
              accent={comic.palette.accent}
              onZoom={(src, title) => setZoomImage({ src, title })}
            />

            <section className="ui-glass" style={{
              marginTop: 14,
              borderRadius: 22,
              padding: 16,
              background: "linear-gradient(160deg, rgba(255,255,255,0.08), rgba(9,3,24,0.82))",
              border: `1px solid ${unlocked ? comic.palette.accent + "66" : "rgba(255,255,255,0.15)"}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: comic.palette.accent, letterSpacing: 1.3, textTransform: "uppercase" }}>
                    {lockedText(chapter, rank)}
                  </div>
                  <h2 style={{ margin: "4px 0 0", color: "#fff", fontSize: 28, lineHeight: 1.05 }}>
                    Глава {chapter.chapter}: {chapter.title}
                  </h2>
                  <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.72)", lineHeight: 1.5, maxWidth: 860 }}>
                    {chapter.summary}
                  </p>
                </div>
                <div style={{ textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 800 }}>
                  Ранг {rank}/{MAX_BRAWLER_RANK}<br />
                  Страница {pageIndex + 1}/{chapter.pages.length}
                </div>
              </div>

              {unlocked ? (
                <>
                  <div style={{ marginTop: 16 }}>
                    <ComicImage
                      title={`Страница ${page.page}`}
                      assetPath={page.assetPath}
                      caption={page.caption}
                      primary={comic.palette.primary}
                      secondary={comic.palette.secondary}
                      accent={comic.palette.accent}
                      onZoom={(src, title) => setZoomImage({ src, title })}
                    />
                  </div>
                  <div style={{
                    marginTop: 14,
                    padding: "14px 16px",
                    borderRadius: 16,
                    background: "rgba(0,0,0,0.35)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}>
                    <div style={{ fontSize: 17, fontWeight: 900, color: "#fff", lineHeight: 1.35 }}>
                      {page.caption}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13, color: "rgba(255,255,255,0.68)", lineHeight: 1.5 }}>
                      {page.storyBeat}
                    </div>
                  </div>
                  <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost"
                      disabled={pageIndex <= 0}
                      onClick={() => setPageIndex(i => Math.max(0, i - 1))}
                    >
                      ← Назад
                    </button>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center" }}>
                      {chapter.pages.map((p, idx) => (
                        <button
                          key={p.page}
                          type="button"
                          aria-label={`Страница ${p.page}`}
                          onClick={() => setPageIndex(idx)}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 9,
                            border: idx === pageIndex ? `2px solid ${comic.palette.accent}` : "1px solid rgba(255,255,255,0.18)",
                            background: idx === pageIndex ? `${comic.palette.primary}aa` : "rgba(255,255,255,0.08)",
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 900,
                            cursor: "pointer",
                          }}
                        >
                          {p.page}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="ui-btn ui-btn--primary"
                      disabled={pageIndex >= chapter.pages.length - 1}
                      onClick={() => setPageIndex(i => Math.min(chapter.pages.length - 1, i + 1))}
                    >
                      Вперёд →
                    </button>
                  </div>
                </>
              ) : (
                <div style={{
                  marginTop: 16,
                  minHeight: 300,
                  borderRadius: 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  padding: 24,
                  background: "linear-gradient(145deg, rgba(0,0,0,0.54), rgba(80,60,90,0.28))",
                  border: "1px dashed rgba(255,255,255,0.24)",
                  color: "rgba(255,255,255,0.72)",
                }}>
                  <div>
                    <div style={{ fontSize: 44, marginBottom: 10 }}>🔒</div>
                    <div style={{ fontSize: 19, fontWeight: 1000, color: "#fff" }}>Глава пока закрыта</div>
                    <div style={{ marginTop: 8, fontSize: 13 }}>
                      Наберите ранг {chapter.unlockRank} этим бойцом, чтобы открыть 10 страниц главы.
                    </div>
                  </div>
                </div>
              )}
            </section>
          </main>
        </div>
      </PageBody>
      {zoomImage && (
        <ZoomOverlay
          src={zoomImage.src}
          title={zoomImage.title}
          onClose={() => setZoomImage(null)}
        />
      )}
    </PageBg>
  );
}

