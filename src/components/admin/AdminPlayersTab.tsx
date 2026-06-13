import { useMemo, useState } from "react";
import { findProfileStorageKey } from "../../utils/localStorageAPI";
import { formatPlayerIdDisplay } from "../../utils/playerId";
import { searchPlayerKeys, playerSearchLabel, getPlayerAdminSummary, blockPlayer, unblockPlayer } from "../../utils/playerAdmin";
import { commitAdminAction } from "../../utils/adminScheduler";
import { sendGiftToPlayer } from "../../utils/gifts";
import { DEVELOPER_TITLE_ID, hasExclusiveTitle } from "../../data/exclusiveTitles";
import AdminScheduleControls, { useAdminScheduleState } from "./AdminScheduleControls";
import { buildGlobalPlayerAnalytics, buildPlayerDetailAnalytics, formatPlayerId } from "../../utils/devAnalytics/devPlayerAnalytics";
import { TechPanel, MetricTile, BarChart, LineChart, DonutChart, CollapsibleList, DataTable } from "../../utils/devAnalytics/devCharts";

export default function AdminPlayersTab() {
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const { schedule, setSchedule, resetSchedule } = useAdminScheduleState();
  const global = useMemo(() => buildGlobalPlayerAnalytics(), [selectedKey, status]);
  const summary = selectedKey ? getPlayerAdminSummary(selectedKey) : null;
  const detail = summary ? buildPlayerDetailAnalytics(summary) : null;
  const suggestions = useMemo(() => searchPlayerKeys(query, 30), [query]);

  const pick = (key: string) => { setSelectedKey(key); setStatus(""); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <TechPanel title="Поиск по ID / нику" subtitle="Введите ID без #" accent="#40C4FF">
        <div style={{ display: "flex", gap: 8 }}>
          <input className="ui-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="ID или никнейм" style={{ flex: 1 }} />
          <button type="button" onClick={() => {
            const k = findProfileStorageKey(query);
            if (k) pick(k); else setStatus("Не найден");
          }} style={btn("#40C4FF")}>Найти</button>
        </div>
        {suggestions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {suggestions.map(k => (
              <button key={k} type="button" onClick={() => pick(k)} style={btn(selectedKey === k ? "#40C4FF" : "#90A4AE")}>{playerSearchLabel(k)}</button>
            ))}
          </div>
        )}
        {status && <div style={{ marginTop: 8, fontSize: 12, color: "#FF7070" }}>{status}</div>}
      </TechPanel>

      <TechPanel title="Глобальная аналитика" subtitle={`Всего аккаунтов: ${global.totalPlayers}`} accent="#00E5FF">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8, marginBottom: 12 }}>
          <MetricTile label="Игроков" value={global.totalPlayers} accent="#00E5FF" />
          <MetricTile label="Активных" value={global.activePlayers} accent="#76FF03" />
          <MetricTile label="Блок" value={global.blockedPlayers} accent="#FF5252" />
          <MetricTile label="Бои" value={global.totalGames} accent="#FFD54F" />
          <MetricTile label="Win%" value={`${global.avgWinRate}%`} accent="#CE93D8" />
          <MetricTile label="Трофеи Σ" value={global.totalTrophies.toLocaleString("ru-RU")} accent="#FF7043" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
          <BarChart data={global.modeActivity.slice(0, 8)} accent="#00E5FF" />
          <DonutChart segments={global.trophyBuckets.map((b,i)=>({...b,color:["#90A4AE","#40C4FF","#CE93D8","#FFD54F"][i]}))} />
        </div>
        <div style={{ marginTop: 10, fontSize: 10, color: "#00E5FF", fontWeight: 800 }}>Активность 7 дней</div>
        <LineChart points={global.activityLast7} accent="#00E5FF" />
        <CollapsibleList title="Список аккаунтов" count={global.topPlayers.length} defaultOpen>
          <DataTable columns={[
            { key: "user", label: "Игрок" },
            { key: "id", label: "ID" },
            { key: "tr", label: "🏆" },
            { key: "games", label: "Бои" },
          ]} rows={global.topPlayers.map(e => ({
            user: <button type="button" onClick={() => pick(e.storageKey)} style={{ ...btn(e.isCurrent ? "#FFD54F" : "#888"), padding: "4px 8px" }}>{e.summary.username}{e.isCurrent ? " ★" : ""}</button>,
            id: formatPlayerIdDisplay(e.summary.playerId) || "—",
            tr: e.summary.trophies,
            games: e.summary.totalGamesPlayed,
          }))} />
        </CollapsibleList>
        {global.currentUserEntry && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 8, border: "1px solid #FFD54F55", background: "rgba(255,213,79,0.08)" }}>
            <div style={{ fontSize: 10, color: "#FFD54F", fontWeight: 900 }}>ВАШ АККАУНТ (пример)</div>
            <div style={{ fontSize: 12 }}>{global.currentUserEntry.summary.username} · {formatPlayerId(global.currentUserEntry.summary)} · {global.currentUserEntry.summary.trophies}🏆</div>
            <button type="button" onClick={() => pick(global.currentUserEntry!.storageKey)} style={{ ...btn("#FFD54F"), marginTop: 6 }}>Открыть полный отчёт</button>
          </div>
        )}
      </TechPanel>

      {detail && summary && (
        <TechPanel title={`Отчёт: ${summary.username}`} subtitle={formatPlayerId(summary)} accent="#CE93D8">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8, marginBottom: 12 }}>
            <MetricTile label="Win%" value={`${detail.winRate}%`} accent="#76FF03" />
            <MetricTile label="Engagement" value={detail.engagementScore} accent="#CE93D8" />
            <MetricTile label="Δ трофеев" value={detail.avgTrophyDelta} accent="#FFD54F" />
            <MetricTile label="Монеты" value={summary.coins} accent="#FFD54F" />
            <MetricTile label="Крист." value={summary.gems} accent="#40C4FF" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <BarChart data={detail.modeGames} accent="#40C4FF" />
            <LineChart points={detail.trophyHistory.length ? detail.trophyHistory : [0]} accent="#FFD54F" />
          </div>
          <CollapsibleList title="История боёв" count={detail.battleTimeline.length}>
            <DataTable columns={[{ key: "t", label: "Время" }, { key: "r", label: "Результат" }]}
              rows={detail.battleTimeline.map(b => ({
                t: new Date(b.ts).toLocaleString("ru-RU"),
                r: <span style={{ color: b.won ? "#76FF03" : "#FF5252", fontWeight: 800 }}>{b.label}</span>,
              }))} />
          </CollapsibleList>
          <AdminScheduleControls schedule={schedule} onChange={setSchedule} compact />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={hasExclusiveTitle(summary.masteryTitlesUnlocked, DEVELOPER_TITLE_ID)}
              onClick={() => {
                if (!selectedKey) return;
                const r = sendGiftToPlayer({
                  storageKey: selectedKey,
                  message: "Эксклюзивный титул от разработчиков",
                  items: [{ kind: "exclusiveTitle", titleId: DEVELOPER_TITLE_ID }],
                });
                setStatus(r.success ? "Титул «РАЗРАБОТЧИК» отправлен в подарки игрока" : (r.error ?? "Ошибка"));
              }}
              style={{
                ...btn("#00E5FF"),
                opacity: hasExclusiveTitle(summary.masteryTitlesUnlocked, DEVELOPER_TITLE_ID) ? 0.45 : 1,
              }}
            >
              🏷 Титул РАЗРАБОТЧИК
            </button>
            {summary.blocked ? (
              <button type="button" onClick={() => {
                const r = commitAdminAction({
                  domain: "player_block",
                  label: `Разблокировка: ${summary.username}`,
                  schedule,
                  payload: { storageKey: selectedKey!, blocked: false },
                });
                if (r.immediate) unblockPlayer(selectedKey!);
                setStatus(r.message);
                resetSchedule();
              }} style={btn("#76FF03")}>Разблокировать</button>
            ) : (
              <button type="button" onClick={() => {
                const r = commitAdminAction({
                  domain: "player_block",
                  label: `Блокировка: ${summary.username}`,
                  schedule,
                  payload: { storageKey: selectedKey!, blocked: true },
                });
                if (r.immediate) blockPlayer(selectedKey!);
                setStatus(r.message);
                resetSchedule();
              }} style={btn("#FFB74D")}>Заблокировать</button>
            )}
          </div>
        </TechPanel>
      )}
    </div>
  );
}

function btn(color: string) {
  return { padding: "6px 12px", border: `1px solid ${color}88`, borderRadius: 8, background: `${color}18`, color, fontWeight: 800, fontSize: 11, cursor: "pointer" } as const;
}
