import { useEffect, useMemo, useState } from "react";
import {
  isAdminUnlocked, tryAdminLogin,
} from "../utils/mapEditorAPI";
import {
  getDealPool, saveDealPool, upsertDealTemplate, removeDealTemplate,
  regenerateTodayDeals, getDealsHistory, getTodaysDeals,
  setForcedDeal, getForcedDealId,
  type DealTemplate, type DealItem, type Currency,
} from "../utils/dailyDeals";
import {
  getNews, getNewsCategories, addNews, updateNews, deleteNews, moveNews,
  upsertNewsCategory, deleteNewsCategory,
  exportNewsJson, importNewsJson,
  extractYouTubeId, fileToDataUrl,
  NEWS_VIDEO_MAX_BYTES, NEWS_IMAGE_MAX_BYTES,
  type NewsItem, type NewsCategory,
} from "../utils/news";
import {
  broadcastGift, describeGiftItem,
  MAX_GIFT_ITEMS, MAX_GIFT_MESSAGE,
  MAX_AMOUNT_COINS, MAX_AMOUNT_GEMS, MAX_AMOUNT_PP, MAX_AMOUNT_CHEST,
  type GiftItem,
} from "../utils/gifts";
import { CHESTS, CHEST_RARITY_ORDER, type ChestRarity } from "../utils/chests";
import { PETS } from "../entities/PetData";
import { BRAWLERS } from "../entities/BrawlerData";

type Tab = "deals" | "news" | "gifts";

interface Props {
  onBack: () => void;
}

export default function AdminPanel({ onBack }: Props) {
  const [unlocked, setUnlocked] = useState(isAdminUnlocked());
  const [login, setLogin] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("deals");

  if (!unlocked) {
    return (
      <div style={frame()}>
        <Header title="🛡️ ПАНЕЛЬ РАЗРАБОТЧИКА" onBack={onBack} />
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24,
        }}>
          <div style={{
            width: "100%", maxWidth: 400,
            background: "rgba(0,0,0,0.45)",
            border: "1px solid rgba(255,213,79,0.3)",
            borderRadius: 14, padding: 24,
          }}>
            <h3 style={{ margin: "0 0 14px", color: "#FFD54F", textAlign: "center" }}>
              Требуется вход
            </h3>
            <input
              placeholder="Логин"
              value={login}
              onChange={e => setLogin(e.target.value)}
              style={inputStyle()}
            />
            <input
              placeholder="Пароль"
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              style={{ ...inputStyle(), marginTop: 10 }}
              onKeyDown={e => { if (e.key === "Enter") doLogin(); }}
            />
            {err && (
              <div style={{ marginTop: 10, color: "#FF7070", fontSize: 12, textAlign: "center" }}>
                {err}
              </div>
            )}
            <button
              onClick={doLogin}
              style={{
                marginTop: 14, width: "100%",
                background: "linear-gradient(135deg, #FFD54F, #FF8A00)",
                color: "#1B1B1B", border: "none",
                borderRadius: 10, padding: "10px 0",
                fontSize: 13, fontWeight: 900, letterSpacing: 1.5,
                cursor: "pointer",
              }}
            >ВОЙТИ</button>
          </div>
        </div>
      </div>
    );
  }

  function doLogin() {
    if (tryAdminLogin(login, pass)) {
      setUnlocked(true);
      setErr("");
    } else {
      setErr("Неверный логин или пароль");
    }
  }

  return (
    <div style={frame()}>
      <Header title="🛡️ ПАНЕЛЬ РАЗРАБОТЧИКА" onBack={onBack} />
      <div style={{
        display: "flex", justifyContent: "center", gap: 8,
        padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(0,0,0,0.20)",
      }}>
        {([
          ["deals", "🔥 АКЦИИ"],
          ["news",  "📰 НОВОСТИ"],
          ["gifts", "🎁 ПОДАРКИ"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={tabBtn(tab === key)}
          >{label}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 22 }}>
        {tab === "deals" && <DealsEditor />}
        {tab === "news"  && <NewsEditor />}
        {tab === "gifts" && <GiftBroadcaster />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DEALS EDITOR
// ─────────────────────────────────────────────────────────────────────────
function DealsEditor() {
  const [pool, setPool] = useState<DealTemplate[]>(() => getDealPool());
  const [editing, setEditing] = useState<DealTemplate | null>(null);
  const [today, setToday] = useState(() => getTodaysDeals());
  const [forced, setForced] = useState<string | null>(getForcedDealId());
  const history = useMemo(() => getDealsHistory(), [today.length]);

  const refresh = () => {
    setPool(getDealPool());
    setToday(getTodaysDeals());
    setForced(getForcedDealId());
  };

  const handleRegen = () => {
    setToday(regenerateTodayDeals());
  };

  const handleSave = (t: DealTemplate) => {
    upsertDealTemplate(t);
    setEditing(null);
    refresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Today's deals strip */}
      <Section title="СЕГОДНЯШНИЕ АКЦИИ" subtitle={`${today.length} активных`}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <button onClick={handleRegen} style={primaryBtn("#FFD54F")}>
            🎲 Перегенерировать сейчас
          </button>
          <button
            onClick={() => { setForcedDeal(null); refresh(); }}
            style={primaryBtn("#FF7043")}
            disabled={!forced}
          >Сбросить пин</button>
          {forced && (
            <span style={{ alignSelf: "center", fontSize: 11, color: "#FFD54F", fontWeight: 700 }}>
              Пинится: {pool.find(p => p.id === forced)?.title ?? forced}
            </span>
          )}
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 8,
        }}>
          {today.map(d => (
            <div key={d.instanceId} style={miniCard(d.iconColor)}>
              <div style={{ fontSize: 11, fontWeight: 800, color: d.iconColor }}>
                {d.title}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
                {d.priceAmount} {d.priceCurrency === "coins" ? "монет" : "кристаллов"}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                {d.items.length} предмет(ов)
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Pool */}
      <Section title="ПУЛ АКЦИЙ (ШАБЛОНЫ)" subtitle={`${pool.length} в пуле`}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button onClick={() => setEditing(blankTemplate())} style={primaryBtn("#76FF03")}>
            + Добавить шаблон
          </button>
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 10,
        }}>
          {pool.map(p => (
            <div key={p.id} style={poolCard(p.iconColor)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: p.iconColor || "#FFD54F", flex: 1 }}>
                  {p.title}
                </div>
                {p.special && (
                  <span style={{
                    fontSize: 9, background: "#FF7043", color: "white",
                    padding: "2px 5px", borderRadius: 5, fontWeight: 900,
                  }}>HOT</span>
                )}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                {p.items.map(describeDealItem).join(" + ")}
              </div>
              <div style={{
                fontSize: 11, color: "white", marginTop: 6,
                display: "flex", justifyContent: "space-between",
              }}>
                <span>Цена: {p.priceAmount} {p.priceCurrency === "coins" ? "🪙" : "💎"}</span>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>w={p.weight}</span>
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                <button onClick={() => setEditing(p)} style={smallBtn("#40C4FF")}>Изм.</button>
                <button onClick={() => { setForcedDeal(p.id); refresh(); }} style={smallBtn("#FFD54F")}>📌 Пин</button>
                <button onClick={() => {
                  if (confirm(`Удалить «${p.title}»?`)) {
                    removeDealTemplate(p.id);
                    refresh();
                  }
                }} style={smallBtn("#FF7070")}>×</button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* History */}
      {history.length > 0 && (
        <Section title="ИСТОРИЯ" subtitle={`Последние ${history.length} дн.`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map(h => (
              <div key={h.date} style={{
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8, padding: "10px 12px",
              }}>
                <div style={{ fontSize: 11, color: "#FFD54F", fontWeight: 800 }}>{h.date}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
                  {h.deals.length} акций · сгенерировано {new Date(h.generatedAt).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {editing && (
        <DealEditorModal
          deal={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function blankTemplate(): DealTemplate {
  return {
    id: `custom_${Date.now().toString(36)}`,
    title: "Новая акция",
    items: [{ kind: "coins", amount: 100 }],
    priceCurrency: "coins",
    priceAmount: 50,
    weight: 5,
    category: "discount",
    iconColor: "#FFD54F",
  };
}

function describeDealItem(it: DealItem): string {
  switch (it.kind) {
    case "coins":            return `${it.amount} монет`;
    case "gems":             return `${it.amount} крист.`;
    case "powerPoints":      return `${it.amount} ОС`;
    case "chest":            return `${CHESTS[it.rarity].shortName} ×${it.count}`;
    case "pet":              return `Пит. «${PETS.find(p => p.id === it.petId)?.name ?? it.petId}»`;
    case "upgradeDiscount":  return `купон −${it.percent}% ×${it.uses}`;
  }
}

function DealEditorModal({
  deal, onClose, onSave,
}: {
  deal: DealTemplate;
  onClose: () => void;
  onSave: (t: DealTemplate) => void;
}) {
  const [draft, setDraft] = useState<DealTemplate>(deal);

  const updateItem = (i: number, patch: Partial<DealItem>) => {
    const items = [...draft.items];
    items[i] = { ...items[i], ...patch } as DealItem;
    setDraft({ ...draft, items });
  };
  const addItem = () => {
    setDraft({ ...draft, items: [...draft.items, { kind: "coins", amount: 100 }] });
  };
  const removeItem = (i: number) => {
    setDraft({ ...draft, items: draft.items.filter((_, idx) => idx !== i) });
  };
  const setItemKind = (i: number, kind: DealItem["kind"]) => {
    let next: DealItem;
    switch (kind) {
      case "coins":           next = { kind, amount: 100 }; break;
      case "gems":            next = { kind, amount: 10 }; break;
      case "powerPoints":     next = { kind, amount: 30 }; break;
      case "chest":           next = { kind, rarity: "common", count: 1 }; break;
      case "pet":             next = { kind, petId: PETS[0].id }; break;
      case "upgradeDiscount": next = { kind, percent: 10, uses: 1 }; break;
    }
    const items = [...draft.items];
    items[i] = next;
    setDraft({ ...draft, items });
  };

  return (
    <Modal onClose={onClose} title="Редактировать акцию">
      <Field label="Название">
        <input
          value={draft.title}
          onChange={e => setDraft({ ...draft, title: e.target.value })}
          style={inputStyle()}
        />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Цена">
          <input
            type="number"
            value={draft.priceAmount}
            onChange={e => setDraft({ ...draft, priceAmount: Math.max(0, +e.target.value) })}
            style={inputStyle()}
          />
        </Field>
        <Field label="Валюта">
          <select
            value={draft.priceCurrency}
            onChange={e => setDraft({ ...draft, priceCurrency: e.target.value as Currency })}
            style={inputStyle()}
          >
            <option value="coins">🪙 Монеты</option>
            <option value="gems">💎 Кристаллы</option>
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Базовая цена (зачёркнутая)">
          <input
            type="number"
            value={draft.baselineAmount ?? ""}
            placeholder="не показывать"
            onChange={e => setDraft({
              ...draft,
              baselineAmount: e.target.value === "" ? undefined : Math.max(0, +e.target.value),
            })}
            style={inputStyle()}
          />
        </Field>
        <Field label="Вес выпадения (1-100)">
          <input
            type="number" min={1} max={100}
            value={draft.weight}
            onChange={e => setDraft({ ...draft, weight: Math.max(1, Math.min(100, +e.target.value)) })}
            style={inputStyle()}
          />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Цвет акцента">
          <input
            type="color"
            value={draft.iconColor || "#FFD54F"}
            onChange={e => setDraft({ ...draft, iconColor: e.target.value })}
            style={{ ...inputStyle(), height: 36, padding: 2 }}
          />
        </Field>
        <Field label="Особая (×2 шанс)">
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: "white", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={!!draft.special}
              onChange={e => setDraft({ ...draft, special: e.target.checked })}
            /> Помечать как «★ HOT»
          </label>
        </Field>
      </div>

      <div style={{ marginTop: 14, fontSize: 11, color: "#FFD54F", fontWeight: 800, letterSpacing: 1.5 }}>
        ПРЕДМЕТЫ В АКЦИИ
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        {draft.items.map((it, i) => (
          <div key={i} style={{
            display: "flex", gap: 6, alignItems: "center",
            background: "rgba(0,0,0,0.4)", borderRadius: 8, padding: 8,
          }}>
            <select value={it.kind} onChange={e => setItemKind(i, e.target.value as DealItem["kind"])} style={inputStyle()}>
              <option value="coins">Монеты</option>
              <option value="gems">Кристаллы</option>
              <option value="powerPoints">Очки силы</option>
              <option value="chest">Сундук</option>
              <option value="pet">Питомец</option>
              <option value="upgradeDiscount">Купон апгрейда</option>
            </select>
            <ItemInputs item={it} onChange={patch => updateItem(i, patch)} />
            <button onClick={() => removeItem(i)} style={smallBtn("#FF7070")}>×</button>
          </div>
        ))}
      </div>
      <button onClick={addItem} style={{ ...smallBtn("#76FF03"), marginTop: 8 }}>
        + Добавить предмет
      </button>

      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button onClick={onClose} style={primaryBtn("#888")}>Отмена</button>
        <button onClick={() => onSave(draft)} style={primaryBtn("#FFD54F")}>Сохранить</button>
      </div>
    </Modal>
  );
}

function ItemInputs({ item, onChange }: { item: DealItem; onChange: (patch: Partial<DealItem>) => void }) {
  if (item.kind === "coins" || item.kind === "gems" || item.kind === "powerPoints") {
    return (
      <input
        type="number" value={item.amount}
        onChange={e => onChange({ amount: Math.max(0, +e.target.value) } as any)}
        style={{ ...inputStyle(), width: 110 }}
      />
    );
  }
  if (item.kind === "chest") {
    return (
      <>
        <select value={item.rarity} onChange={e => onChange({ rarity: e.target.value as ChestRarity } as any)} style={inputStyle()}>
          {CHEST_RARITY_ORDER.map(r => (
            <option key={r} value={r}>{CHESTS[r].shortName}</option>
          ))}
        </select>
        <input
          type="number" min={1} max={99} value={item.count}
          onChange={e => onChange({ count: Math.max(1, +e.target.value) } as any)}
          style={{ ...inputStyle(), width: 80 }}
        />
      </>
    );
  }
  if (item.kind === "pet") {
    return (
      <select value={item.petId} onChange={e => onChange({ petId: e.target.value } as any)} style={inputStyle()}>
        {PETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    );
  }
  if (item.kind === "upgradeDiscount") {
    return (
      <>
        <input type="number" min={1} max={100} value={item.percent}
          onChange={e => onChange({ percent: Math.max(1, Math.min(100, +e.target.value)) } as any)}
          style={{ ...inputStyle(), width: 80 }} placeholder="%" />
        <input type="number" min={1} max={20} value={item.uses}
          onChange={e => onChange({ uses: Math.max(1, +e.target.value) } as any)}
          style={{ ...inputStyle(), width: 70 }} placeholder="×" />
      </>
    );
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// NEWS EDITOR
// ─────────────────────────────────────────────────────────────────────────
function NewsEditor() {
  const [items, setItems] = useState<NewsItem[]>(() => getNews());
  const [cats, setCats] = useState<NewsCategory[]>(() => getNewsCategories());
  const [editing, setEditing] = useState<NewsItem | null>(null);
  const [showCats, setShowCats] = useState(false);
  const [importTxt, setImportTxt] = useState("");
  const [msg, setMsg] = useState("");

  const refresh = () => {
    setItems(getNews());
    setCats(getNewsCategories());
  };

  const handleExport = () => {
    const json = exportNewsJson();
    navigator.clipboard.writeText(json).catch(() => {});
    setMsg("JSON скопирован в буфер");
    setTimeout(() => setMsg(""), 2200);
  };

  const handleImport = () => {
    try {
      const r = importNewsJson(importTxt, "merge");
      setMsg(`Импортировано: ${r.items} новостей, ${r.categories} категорий`);
      setImportTxt("");
      refresh();
    } catch (e: any) {
      setMsg(`Ошибка: ${e.message ?? e}`);
    }
    setTimeout(() => setMsg(""), 3000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Section title="НОВОСТИ" subtitle={`${items.length} опубликовано`}>
        {msg && (
          <div style={{
            marginBottom: 10, padding: 10,
            background: "rgba(118,255,3,0.12)", border: "1px solid rgba(118,255,3,0.3)",
            borderRadius: 8, fontSize: 12, color: "#B2FF59", fontWeight: 700,
          }}>{msg}</div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <button onClick={() => setEditing(blankNews(cats[0]?.id))} style={primaryBtn("#76FF03")}>
            + Создать новость
          </button>
          <button onClick={() => setShowCats(true)} style={primaryBtn("#40C4FF")}>
            📂 Категории ({cats.length})
          </button>
          <button onClick={handleExport} style={primaryBtn("#FFD54F")}>⤓ Экспорт JSON</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((n, i) => {
            const c = cats.find(c => c.id === n.categoryId);
            return (
              <div key={n.id} style={{
                display: "flex", gap: 10, alignItems: "center",
                background: "rgba(0,0,0,0.35)", borderRadius: 10, padding: 10,
                border: `1px solid ${c?.color ?? "rgba(255,255,255,0.10)"}66`,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8,
                  background: `${c?.color ?? "#FFD54F"}22`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20,
                }}>{c?.icon ?? "📰"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "white", fontSize: 13, fontWeight: 800 }}>{n.title}</div>
                  <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
                    {c?.label} · {new Date(n.publishedAt).toLocaleDateString()}
                  </div>
                </div>
                <button onClick={() => { moveNews(n.id, -1); refresh(); }}
                  disabled={i === 0} style={smallBtn("#888")}>↑</button>
                <button onClick={() => { moveNews(n.id, +1); refresh(); }}
                  disabled={i === items.length - 1} style={smallBtn("#888")}>↓</button>
                <button onClick={() => setEditing(n)} style={smallBtn("#40C4FF")}>Изм.</button>
                <button onClick={() => {
                  if (confirm(`Удалить «${n.title}»?`)) { deleteNews(n.id); refresh(); }
                }} style={smallBtn("#FF7070")}>×</button>
              </div>
            );
          })}
          {items.length === 0 && (
            <div style={{ color: "rgba(255,255,255,0.5)", padding: 20, textAlign: "center", fontSize: 13 }}>
              Новостей пока нет
            </div>
          )}
        </div>
      </Section>

      <Section title="ИМПОРТ JSON" subtitle="Слить новости с другим устройством">
        <textarea
          value={importTxt}
          onChange={e => setImportTxt(e.target.value)}
          placeholder='{ "categories": [...], "items": [...] }'
          rows={5}
          style={{ ...inputStyle(), fontFamily: "monospace", fontSize: 11 }}
        />
        <button onClick={handleImport} style={{ ...primaryBtn("#76FF03"), marginTop: 8 }}>
          Импортировать
        </button>
      </Section>

      {editing && (
        <NewsEditorModal
          news={editing}
          cats={cats}
          onClose={() => setEditing(null)}
          onSave={(n) => {
            if (items.some(x => x.id === n.id)) {
              updateNews(n.id, n);
            } else {
              addNews(n);
            }
            setEditing(null);
            refresh();
          }}
        />
      )}
      {showCats && (
        <CategoryManager
          cats={cats}
          onClose={() => { setShowCats(false); refresh(); }}
        />
      )}
    </div>
  );
}

function blankNews(catId?: string): NewsItem {
  return {
    id: `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: "",
    body: "",
    categoryId: catId ?? "updates",
    publishedAt: Date.now(),
  };
}

function NewsEditorModal({
  news, cats, onClose, onSave,
}: {
  news: NewsItem;
  cats: NewsCategory[];
  onClose: () => void;
  onSave: (n: NewsItem) => void;
}) {
  const [draft, setDraft] = useState<NewsItem>(news);
  const [ytInput, setYtInput] = useState("");
  const [uploadErr, setUploadErr] = useState("");

  const onPickImage = async (file: File) => {
    if (file.size > NEWS_IMAGE_MAX_BYTES) {
      setUploadErr(`Картинка > ${(NEWS_IMAGE_MAX_BYTES / 1024 / 1024) | 0} МБ`);
      return;
    }
    const url = await fileToDataUrl(file);
    setDraft({ ...draft, imageDataUrl: url, videoDataUrl: undefined, youtubeId: undefined });
    setUploadErr("");
  };
  const onPickVideo = async (file: File) => {
    if (file.size > NEWS_VIDEO_MAX_BYTES) {
      setUploadErr(`Видео > ${(NEWS_VIDEO_MAX_BYTES / 1024 / 1024) | 0} МБ`);
      return;
    }
    const url = await fileToDataUrl(file);
    setDraft({ ...draft, videoDataUrl: url, imageDataUrl: undefined, youtubeId: undefined });
    setUploadErr("");
  };
  const onSetYouTube = () => {
    const id = extractYouTubeId(ytInput);
    if (!id) { setUploadErr("Не удалось распознать YouTube-ссылку"); return; }
    setDraft({ ...draft, youtubeId: id, imageDataUrl: undefined, videoDataUrl: undefined });
    setUploadErr("");
    setYtInput("");
  };
  const clearMedia = () => {
    setDraft({ ...draft, imageDataUrl: undefined, videoDataUrl: undefined, youtubeId: undefined });
  };

  return (
    <Modal onClose={onClose} title={news.title ? "Редактировать новость" : "Новая новость"}>
      <Field label="Заголовок">
        <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} style={inputStyle()} />
      </Field>
      <Field label="Категория">
        <select value={draft.categoryId} onChange={e => setDraft({ ...draft, categoryId: e.target.value })} style={inputStyle()}>
          {cats.map(c => (
            <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Текст">
        <textarea
          value={draft.body}
          onChange={e => setDraft({ ...draft, body: e.target.value })}
          rows={6}
          style={inputStyle()}
        />
      </Field>

      <div style={{ marginTop: 8, fontSize: 11, color: "#FFD54F", fontWeight: 800, letterSpacing: 1.5 }}>
        МЕДИА (опционально, одно за раз)
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <label style={primaryBtn("#40C4FF")}>
          🖼️ Картинка
          <input type="file" accept="image/png,image/jpeg,image/gif" hidden
            onChange={e => e.target.files?.[0] && onPickImage(e.target.files[0])} />
        </label>
        <label style={primaryBtn("#AB47BC")}>
          🎬 Видео (≤ 20 МБ)
          <input type="file" accept="video/mp4,video/webm" hidden
            onChange={e => e.target.files?.[0] && onPickVideo(e.target.files[0])} />
        </label>
        <button onClick={clearMedia} style={primaryBtn("#888")}>Убрать медиа</button>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input
          placeholder="Ссылка YouTube"
          value={ytInput}
          onChange={e => setYtInput(e.target.value)}
          style={inputStyle()}
        />
        <button onClick={onSetYouTube} style={primaryBtn("#FF1744")}>YT</button>
      </div>
      {uploadErr && (
        <div style={{ marginTop: 6, color: "#FF7070", fontSize: 12 }}>{uploadErr}</div>
      )}
      <div style={{ marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
        {draft.imageDataUrl ? "✓ Картинка прикреплена" :
         draft.videoDataUrl ? "✓ Видео прикреплено" :
         draft.youtubeId ? `✓ YouTube: ${draft.youtubeId}` : "Медиа не выбрано"}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button onClick={onClose} style={primaryBtn("#888")}>Отмена</button>
        <button
          onClick={() => onSave(draft)}
          disabled={!draft.title.trim()}
          style={{ ...primaryBtn("#76FF03"), opacity: draft.title.trim() ? 1 : 0.5 }}
        >Сохранить</button>
      </div>
    </Modal>
  );
}

function CategoryManager({
  cats, onClose,
}: {
  cats: NewsCategory[];
  onClose: () => void;
}) {
  const [list, setList] = useState<NewsCategory[]>(cats);
  const [draft, setDraft] = useState<NewsCategory>({ id: "", label: "", icon: "📰", color: "#FFD54F" });

  const save = () => {
    const c = { ...draft, id: draft.id.trim() || `cat_${Date.now().toString(36)}` };
    upsertNewsCategory(c);
    setList([...list.filter(x => x.id !== c.id), c]);
    setDraft({ id: "", label: "", icon: "📰", color: "#FFD54F" });
  };

  return (
    <Modal onClose={onClose} title="Категории новостей">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {list.map(c => (
          <div key={c.id} style={{
            display: "flex", gap: 8, alignItems: "center",
            background: "rgba(0,0,0,0.35)", borderRadius: 8, padding: 8,
            border: `1px solid ${c.color}55`,
          }}>
            <span style={{ fontSize: 18 }}>{c.icon}</span>
            <span style={{ flex: 1, color: c.color, fontWeight: 800 }}>{c.label}</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{c.id}</span>
            <button onClick={() => {
              if (confirm(`Удалить категорию «${c.label}»? Новости останутся.`)) {
                deleteNewsCategory(c.id);
                setList(list.filter(x => x.id !== c.id));
              }
            }} style={smallBtn("#FF7070")}>×</button>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 14, padding: 10,
        background: "rgba(118,255,3,0.06)",
        border: "1px solid rgba(118,255,3,0.2)",
        borderRadius: 10,
      }}>
        <div style={{ fontSize: 11, color: "#B2FF59", fontWeight: 800, marginBottom: 6 }}>
          + НОВАЯ КАТЕГОРИЯ
        </div>
        <input placeholder="ID (опционально)" value={draft.id} onChange={e => setDraft({ ...draft, id: e.target.value })} style={inputStyle()} />
        <input placeholder="Название" value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} style={{ ...inputStyle(), marginTop: 6 }} />
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <input placeholder="Иконка (эмодзи)" value={draft.icon} onChange={e => setDraft({ ...draft, icon: e.target.value })} style={{ ...inputStyle(), flex: 1 }} />
          <input type="color" value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })} style={{ ...inputStyle(), width: 60, padding: 2 }} />
        </div>
        <button onClick={save} disabled={!draft.label.trim()} style={{
          ...primaryBtn("#76FF03"), marginTop: 8,
          opacity: draft.label.trim() ? 1 : 0.5,
        }}>Сохранить</button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// GIFT BROADCASTER
// ─────────────────────────────────────────────────────────────────────────
function GiftBroadcaster() {
  const [items, setItems] = useState<GiftItem[]>([{ kind: "coins", amount: 100 }]);
  const [message, setMessage] = useState("");
  const [sentMsg, setSentMsg] = useState("");

  const updateItem = (i: number, next: GiftItem) => {
    const copy = [...items]; copy[i] = next; setItems(copy);
  };
  const addItem = () => {
    if (items.length >= MAX_GIFT_ITEMS) return;
    setItems([...items, { kind: "coins", amount: 100 }]);
  };
  const removeItem = (i: number) => {
    setItems(items.filter((_, idx) => idx !== i));
  };
  const setKind = (i: number, kind: GiftItem["kind"]) => {
    let next: GiftItem;
    switch (kind) {
      case "coins":       next = { kind, amount: 100 }; break;
      case "gems":        next = { kind, amount: 10 }; break;
      case "powerPoints": next = { kind, amount: 30 }; break;
      case "chest":       next = { kind, rarity: "common", count: 1 }; break;
      case "pet":         next = { kind, petId: PETS[0].id }; break;
      case "brawler":     next = { kind, brawlerId: BRAWLERS[0].id }; break;
    }
    updateItem(i, next);
  };

  const send = () => {
    const r = broadcastGift({ items, message });
    if (r.success) {
      setSentMsg(`✓ Отправлено ${r.recipients} игрокам`);
      setItems([{ kind: "coins", amount: 100 }]);
      setMessage("");
    } else {
      setSentMsg(`✗ ${r.error}`);
    }
    setTimeout(() => setSentMsg(""), 3500);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Section title="РАЗОСЛАТЬ ПОДАРОК ВСЕМ" subtitle="Каждому зарегистрированному игроку">
        <Field label={`Сообщение (${message.length}/${MAX_GIFT_MESSAGE})`}>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value.slice(0, MAX_GIFT_MESSAGE))}
            rows={3}
            placeholder="Спасибо, что вы с нами!"
            style={inputStyle()}
          />
        </Field>

        <div style={{ marginTop: 10, fontSize: 11, color: "#FFD54F", fontWeight: 800, letterSpacing: 1.5 }}>
          ПРЕДМЕТЫ ({items.length}/{MAX_GIFT_ITEMS})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {items.map((it, i) => (
            <div key={i} style={{
              display: "flex", gap: 6, alignItems: "center",
              background: "rgba(0,0,0,0.4)", borderRadius: 8, padding: 8,
            }}>
              <select value={it.kind} onChange={e => setKind(i, e.target.value as GiftItem["kind"])} style={inputStyle()}>
                <option value="coins">Монеты</option>
                <option value="gems">Кристаллы</option>
                <option value="powerPoints">Очки силы</option>
                <option value="chest">Сундук</option>
                <option value="pet">Питомец</option>
                <option value="brawler">Боец</option>
              </select>
              <GiftItemInputs item={it} onChange={next => updateItem(i, next)} />
              <button onClick={() => removeItem(i)} style={smallBtn("#FF7070")} disabled={items.length === 1}>×</button>
            </div>
          ))}
        </div>
        <button onClick={addItem} disabled={items.length >= MAX_GIFT_ITEMS}
          style={{ ...smallBtn("#76FF03"), marginTop: 8, opacity: items.length >= MAX_GIFT_ITEMS ? 0.5 : 1 }}>
          + Добавить ещё предмет
        </button>

        <div style={{
          marginTop: 14, padding: 12,
          background: "rgba(255,213,79,0.08)",
          border: "1px solid rgba(255,213,79,0.3)",
          borderRadius: 10,
        }}>
          <div style={{ fontSize: 10, color: "#FFD54F", fontWeight: 800, letterSpacing: 1.5, marginBottom: 6 }}>
            ПРЕДПРОСМОТР
          </div>
          <div style={{ fontSize: 12, color: "white" }}>
            🎁 {message || "(без сообщения)"}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
            {items.map(describeGiftItem).join(" + ")}
          </div>
        </div>

        <button
          onClick={send}
          disabled={items.length === 0}
          style={{
            marginTop: 14, width: "100%",
            background: "linear-gradient(135deg, #FFD54F, #FF7043)",
            border: "none", borderRadius: 12,
            color: "#1B1B1B", fontWeight: 900, fontSize: 14, letterSpacing: 2,
            padding: "12px 0", cursor: "pointer",
            boxShadow: "0 4px 14px rgba(255,213,79,0.5)",
          }}
        >🚀 РАЗОСЛАТЬ</button>
        {sentMsg && (
          <div style={{
            marginTop: 10, padding: 8, textAlign: "center",
            background: "rgba(0,0,0,0.4)", borderRadius: 8,
            fontSize: 12, fontWeight: 700,
            color: sentMsg.startsWith("✓") ? "#76FF03" : "#FF7070",
          }}>{sentMsg}</div>
        )}
      </Section>
    </div>
  );
}

function GiftItemInputs({ item, onChange }: { item: GiftItem; onChange: (next: GiftItem) => void }) {
  if (item.kind === "coins") {
    return <input type="number" min={1} max={MAX_AMOUNT_COINS} value={item.amount}
      onChange={e => onChange({ kind: "coins", amount: clampN(+e.target.value, 1, MAX_AMOUNT_COINS) })}
      style={{ ...inputStyle(), width: 110 }} />;
  }
  if (item.kind === "gems") {
    return <input type="number" min={1} max={MAX_AMOUNT_GEMS} value={item.amount}
      onChange={e => onChange({ kind: "gems", amount: clampN(+e.target.value, 1, MAX_AMOUNT_GEMS) })}
      style={{ ...inputStyle(), width: 110 }} />;
  }
  if (item.kind === "powerPoints") {
    return <input type="number" min={1} max={MAX_AMOUNT_PP} value={item.amount}
      onChange={e => onChange({ kind: "powerPoints", amount: clampN(+e.target.value, 1, MAX_AMOUNT_PP) })}
      style={{ ...inputStyle(), width: 110 }} />;
  }
  if (item.kind === "chest") {
    return (
      <>
        <select value={item.rarity}
          onChange={e => onChange({ kind: "chest", rarity: e.target.value as ChestRarity, count: item.count })}
          style={inputStyle()}>
          {CHEST_RARITY_ORDER.map(r => (
            <option key={r} value={r}>{CHESTS[r].shortName}</option>
          ))}
        </select>
        <input type="number" min={1} max={MAX_AMOUNT_CHEST} value={item.count}
          onChange={e => onChange({ kind: "chest", rarity: item.rarity, count: clampN(+e.target.value, 1, MAX_AMOUNT_CHEST) })}
          style={{ ...inputStyle(), width: 80 }} />
      </>
    );
  }
  if (item.kind === "pet") {
    return (
      <select value={item.petId} onChange={e => onChange({ kind: "pet", petId: e.target.value })} style={inputStyle()}>
        {PETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    );
  }
  if (item.kind === "brawler") {
    return (
      <select value={item.brawlerId} onChange={e => onChange({ kind: "brawler", brawlerId: e.target.value })} style={inputStyle()}>
        {BRAWLERS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    );
  }
  return null;
}

function clampN(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

// ─────────────────────────────────────────────────────────────────────────
// Shared style helpers
// ─────────────────────────────────────────────────────────────────────────
function frame(): React.CSSProperties {
  return {
    minHeight: "100%",
    background: "linear-gradient(135deg, #18181b 0%, #27272a 50%, #1f2937 100%)",
    color: "white", display: "flex", flexDirection: "column",
    fontFamily: "'Segoe UI', Arial, sans-serif",
  };
}
function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "14px 22px",
      borderBottom: "1px solid rgba(255,213,79,0.20)",
      background: "rgba(0,0,0,0.30)",
    }}>
      <button onClick={onBack} style={{
        background: "rgba(255,213,79,0.10)",
        border: "1px solid rgba(255,213,79,0.35)",
        borderRadius: 10, padding: "7px 16px",
        color: "#FFD54F", cursor: "pointer", fontSize: 13, fontWeight: 700,
      }}>← Назад</button>
      <h2 style={{
        flex: 1, textAlign: "center", margin: 0,
        fontSize: 20, fontWeight: 900, letterSpacing: 2,
        color: "#FFD54F",
        textShadow: "0 0 14px rgba(255,213,79,0.45)",
      }}>{title}</h2>
      <div style={{ width: 90 }} />
    </div>
  );
}
function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: "8px 22px",
    background: active ? "rgba(255,213,79,0.18)" : "rgba(255,255,255,0.04)",
    border: `1.5px solid ${active ? "#FFD54F" : "rgba(255,255,255,0.10)"}`,
    borderRadius: 10,
    color: active ? "#FFD54F" : "rgba(255,255,255,0.55)",
    fontWeight: 800, fontSize: 12, letterSpacing: 1.5,
    cursor: "pointer",
    boxShadow: active ? "0 0 12px rgba(255,213,79,0.35)" : "none",
  };
}
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "rgba(0,0,0,0.25)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14, padding: 14,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: "#FFD54F", letterSpacing: 2, fontWeight: 800 }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>
            {subtitle}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 8 }}>
      <label style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: 700, letterSpacing: 1.5, marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
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
function primaryBtn(color: string): React.CSSProperties {
  return {
    background: `linear-gradient(135deg, ${color}, ${color}cc)`,
    border: "none", borderRadius: 10,
    color: color === "#888" ? "white" : "#1B1B1B",
    padding: "8px 14px",
    fontSize: 12, fontWeight: 900, letterSpacing: 1,
    cursor: "pointer",
    boxShadow: `0 3px 10px ${color}44`,
    display: "inline-flex", alignItems: "center", gap: 6,
  };
}
function smallBtn(color: string): React.CSSProperties {
  return {
    background: `${color}26`,
    border: `1px solid ${color}66`,
    borderRadius: 6, padding: "4px 8px",
    color, fontSize: 11, fontWeight: 800,
    cursor: "pointer", whiteSpace: "nowrap",
  };
}
function miniCard(color: string | undefined): React.CSSProperties {
  const c = color || "#FFD54F";
  return {
    background: `linear-gradient(180deg, ${c}1A 0%, rgba(0,0,0,0.5) 100%)`,
    border: `1px solid ${c}55`,
    borderRadius: 10, padding: 8,
  };
}
function poolCard(color: string | undefined): React.CSSProperties {
  const c = color || "#FFD54F";
  return {
    background: `linear-gradient(180deg, ${c}14 0%, rgba(0,0,0,0.55) 100%)`,
    border: `1px solid ${c}44`,
    borderRadius: 12, padding: 12,
  };
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9999, padding: 16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto",
        background: "linear-gradient(180deg, #1a2a44 0%, #0a1428 100%)",
        border: "1.5px solid rgba(255,213,79,0.45)",
        borderRadius: 14, padding: 18,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 12, paddingBottom: 8,
          borderBottom: "1px solid rgba(255,255,255,0.10)",
        }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: "#FFD54F", letterSpacing: 1.2 }}>{title}</div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 8, padding: "4px 10px", color: "white", cursor: "pointer",
            fontWeight: 800,
          }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
