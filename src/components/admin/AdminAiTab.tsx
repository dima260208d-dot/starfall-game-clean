import { useEffect, useMemo, useState } from "react";
import { buildAiDashboard, ensureDemoAiTelemetry, type LlmModelInfo } from "../../utils/devAnalytics/devAiTelemetry";
import { commitAdminAction } from "../../utils/adminScheduler";
import AdminScheduleControls, { useAdminScheduleState } from "./AdminScheduleControls";
import {
  subscribeTrainingProgress,
  forceTrainingBatch,
  startAiBattleTraining,
  stopAiBattleTraining,
  subscribeTrainingControlState,
  isAiTrainingRunning,
} from "../../ai/aiTrainingRuntime";
import { buildTrainingEffectivenessReport } from "../../ai/aiTrainingAnalysis";
import { AI_TRAINING_TARGET_CYCLES, TRAINING_BOSS_TARGET, TRAINING_GEMGRAB_TARGET, TRAINING_OTHER_MODES_TOTAL, type TrainingProgress } from "../../ai/aiTrainingStore";
import { TechPanel, MetricTile, CollapsibleList, BarChart, LineChart, DonutChart, DataTable } from "../../utils/devAnalytics/devCharts";

function ModelRow({ m }: { m: LlmModelInfo }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
      background: m.active ? "rgba(0,229,255,0.12)" : "rgba(0,0,0,0.25)",
      border: `1px solid ${m.active ? "#00E5FF" : "rgba(255,255,255,0.1)"}`,
      borderRadius: 8, marginBottom: 6,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: m.active ? "#00E5FF" : "rgba(255,255,255,0.25)", boxShadow: m.active ? "0 0 8px #00E5FF" : "none" }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: m.active ? "#00E5FF" : "white" }}>{m.label}</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{m.provider} · {m.id}</div>
      </div>
      {m.subscriptionLinked && <span style={{ fontSize: 9, color: "#CE93D8", fontWeight: 800 }}>SG</span>}
      {m.active && <span style={{ fontSize: 9, color: "#76FF03", fontWeight: 900 }}>ACTIVE</span>}
    </div>
  );
}

export default function AdminAiTab() {
  const [ready, setReady] = useState(false);
  const [training, setTraining] = useState<TrainingProgress | null>(null);
  const [trainingRunning, setTrainingRunning] = useState(isAiTrainingRunning);
  const { schedule, setSchedule, resetSchedule } = useAdminScheduleState();
  useEffect(() => { ensureDemoAiTelemetry(); setReady(true); }, []);
  useEffect(() => subscribeTrainingProgress(setTraining), []);
  useEffect(() => subscribeTrainingControlState(setTrainingRunning), []);
  const data = useMemo(() => (ready ? buildAiDashboard() : null), [ready]);
  const report = useMemo(() => (training ? buildTrainingEffectivenessReport() : null), [training]);
  if (!data) return <div style={{ color: "rgba(255,255,255,0.5)", padding: 24 }}>Загрузка телеметрии…</div>;

  const trainPct = training
    ? Math.min(100, (training.totalCycles / Math.max(1, training.targetCycles)) * 100)
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <TechPanel title="Циклическое обучение ботов" subtitle="Управление headless-симами · старт/стоп из админки" accent="#76FF03">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 12 }}>
          <MetricTile
            label="Статус"
            value={trainingRunning ? "Запись" : "Стоп"}
            accent={trainingRunning ? "#76FF03" : "#FF5252"}
          />
          <MetricTile
            label="Циклов"
            value={training ? training.totalCycles.toLocaleString("ru-RU") : "0"}
            sub={`из ${AI_TRAINING_TARGET_CYCLES.toLocaleString("ru-RU")}`}
            accent="#76FF03"
          />
          <MetricTile label="Треки" value={training ? `${training.completedTracks}/${training.totalTracks}` : "0/22"} accent="#CE93D8" />
          <MetricTile label="Прогресс" value={`${trainPct.toFixed(2)}%`} accent="#00E5FF" />
          <MetricTile label="Скорость" value={training?.cyclesPerSec ?? 0} sub="циклов/с" accent="#FFD54F" />
          <MetricTile label="Влияние на ботов" value={report ? `${report.botInfluencePct}%` : "0%"} accent="#CE93D8" />
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
          Gem Grab {TRAINING_GEMGRAB_TARGET.toLocaleString("ru-RU")} · режимы {TRAINING_OTHER_MODES_TOTAL.toLocaleString("ru-RU")} · каждый босс {TRAINING_BOSS_TARGET.toLocaleString("ru-RU")}
        </div>
        <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.1)", overflow: "hidden", marginBottom: 12 }}>
          <div style={{ width: `${trainPct}%`, height: "100%", background: "linear-gradient(90deg, #76FF03, #00E5FF)" }} />
        </div>
        <AdminScheduleControls schedule={schedule} onChange={setSchedule} compact />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            disabled={trainingRunning || training?.complete}
            onClick={() => {
              const r = commitAdminAction({
                domain: "ai_training",
                label: "Запуск обучения ботов",
                schedule,
                payload: { action: "start" },
              });
              if (r.immediate) startAiBattleTraining();
              resetSchedule();
            }}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid rgba(118,255,3,0.5)",
              background: trainingRunning ? "rgba(118,255,3,0.08)" : "rgba(118,255,3,0.2)",
              color: "#76FF03",
              fontWeight: 800,
              fontSize: 12,
              cursor: trainingRunning || training?.complete ? "not-allowed" : "pointer",
              opacity: trainingRunning || training?.complete ? 0.55 : 1,
            }}
          >
            Запустить циклы
          </button>
          <button
            type="button"
            disabled={!trainingRunning}
            onClick={() => {
              const r = commitAdminAction({
                domain: "ai_training",
                label: "Остановка обучения ботов",
                schedule,
                payload: { action: "stop" },
              });
              if (r.immediate) stopAiBattleTraining();
              resetSchedule();
            }}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid rgba(255,82,82,0.5)",
              background: "rgba(255,82,82,0.15)",
              color: "#FF5252",
              fontWeight: 800,
              fontSize: 12,
              cursor: !trainingRunning ? "not-allowed" : "pointer",
              opacity: !trainingRunning ? 0.55 : 1,
            }}
          >
            Остановить и сохранить
          </button>
          <button
            type="button"
            onClick={() => {
              const r = commitAdminAction({
                domain: "ai_training",
                label: "Форс +100 циклов обучения",
                schedule,
                payload: { action: "force100" },
              });
              if (r.immediate) forceTrainingBatch();
              resetSchedule();
            }}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid rgba(0,229,255,0.45)",
              background: "rgba(0,229,255,0.12)",
              color: "#00E5FF",
              fontWeight: 800,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            +100 циклов (разово)
          </button>
        </div>
        {report && (
          <CollapsibleList title="Анализ эффективности (текущие цифры)" count={report.bullets.length} defaultOpen>
            <div style={{ fontSize: 12, color: "#76FF03", fontWeight: 800, marginBottom: 8 }}>{report.verdict}</div>
            <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 11, color: "rgba(255,255,255,0.72)", lineHeight: 1.55 }}>
              {report.bullets.map(b => <li key={b}>{b}</li>)}
            </ul>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 6, marginBottom: 10, fontSize: 10 }}>
              {(["engageBias", "objectiveBias", "retreatBias", "flankBias", "superBias"] as const).map(k => (
                <div key={k} style={{ background: "rgba(0,0,0,0.25)", borderRadius: 6, padding: "6px 8px" }}>
                  <div style={{ color: "rgba(255,255,255,0.45)" }}>{k}</div>
                  <div style={{ color: "#00E5FF", fontWeight: 800 }}>{report.combinedTuning[k].toFixed(3)}</div>
                </div>
              ))}
            </div>
            {report.topTactics.length > 0 && (
              <DataTable
                columns={[
                  { key: "tactic", label: "Тактика" },
                  { key: "wr", label: "Win%" },
                  { key: "n", label: "N" },
                ]}
                rows={report.topTactics.map(t => ({
                  tactic: t.tactic,
                  wr: `${(t.wr * 100).toFixed(0)}%`,
                  n: `${t.wins + t.losses}`,
                }))}
              />
            )}
          </CollapsibleList>
        )}
        {training && training.tracks.length > 0 && (
          <CollapsibleList title="Прогресс по трекам" count={training.tracks.length} defaultOpen={false}>
            <DataTable
              columns={[
                { key: "label", label: "Трек" },
                { key: "cycles", label: "Циклы" },
                { key: "pct", label: "%" },
              ]}
              rows={training.tracks.map(tr => ({
                label: tr.label,
                cycles: `${tr.cycles.toLocaleString("ru-RU")} / ${tr.target.toLocaleString("ru-RU")}`,
                pct: `${tr.pct.toFixed(1)}%${tr.complete ? " ✓" : ""}`,
              }))}
            />
          </CollapsibleList>
        )}
        <div style={{ marginTop: 8, fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
          Игра работает параллельно. «Остановить и сохранить» сбрасывает циклы в localStorage и фиксирует тюнинг в `getCombatAiTuning()`.
        </div>
      </TechPanel>
      <TechPanel title="Нейросеть / подписка" subtitle="Модели OpenRouter & OpenAI" accent="#CE93D8">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 12 }}>
          <MetricTile label="LLM" value={data.llmEnabled ? "ON" : "OFF"} accent={data.llmEnabled ? "#76FF03" : "#FF5252"} />
          <MetricTile label="Star Guardian" value={data.starGuardian ? "Да" : "Нет"} accent="#CE93D8" />
          <MetricTile label="Модель" value={data.llmModel.split("/").pop() ?? data.llmModel} sub={data.llmProvider} accent="#00E5FF" />
          <MetricTile label="Диалог" value={data.chatHistoryLen} sub="сообщений в памяти" accent="#FFD54F" />
        </div>
        <CollapsibleList title="Каталог моделей по подписке" count={data.models.length} defaultOpen={data.models.length <= 8}>
          {data.models.map(m => <ModelRow key={`${m.provider}-${m.id}`} m={m} />)}
        </CollapsibleList>
      </TechPanel>

      <TechPanel title="Астрал — стратегии и ошибки" subtitle="Автопилот + обучение" accent="#00E5FF">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: "#00E5FF", fontWeight: 800, marginBottom: 6 }}>РЕЖИМЫ АВТОПИЛОТА</div>
            <BarChart data={data.autoplayModeCounts.length ? data.autoplayModeCounts : [{ label: "explore", value: 1 }]} accent="#00E5FF" />
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#FF5252", fontWeight: 800, marginBottom: 6 }}>ПРИЧИНЫ ПОРАЖЕНИЙ (обучение)</div>
            <DonutChart segments={data.deathTagBreakdown.length ? data.deathTagBreakdown : [{ label: "—", value: 1, color: "#888" }]} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, color: "#76FF03", fontWeight: 800, marginBottom: 6 }}>ДИНАМИКА ПОБЕД (последние бои)</div>
          <LineChart points={data.strategyTimeline.length ? data.strategyTimeline : [0, 1, 0, 1]} accent="#76FF03" />
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, color: "#FFD54F", fontWeight: 800, marginBottom: 6 }}>ИСПРАВЛЕНИЯ АСТРАЛА</div>
          <DataTable
            columns={[{ key: "ts", label: "Время" }, { key: "detail", label: "Действие" }]}
            rows={(data.fixEvents.length ? data.fixEvents : [{ detail: "Нет записей — сыграйте матч с автопилотом", ts: "—" }]).map(e => ({
              ts: "ts" in e && typeof e.ts === "number" ? new Date(e.ts).toLocaleString("ru-RU") : String((e as { ts?: string }).ts ?? "—"),
              detail: "detail" in e ? String(e.detail).slice(0, 80) : String(e),
            }))}
          />
        </div>
      </TechPanel>

      <TechPanel title="Боты — тактики и коррекции" subtitle="Персональности и поведение" accent="#76FF03">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, marginBottom: 12 }}>
          <MetricTile label="События ботов" value={data.botEvents.length} accent="#76FF03" />
          <MetricTile label="Бои в памяти" value={data.combatRecords.length} accent="#00E5FF" />
          <MetricTile label="Режимов" value={data.modeBreakdown.length} accent="#FFD54F" />
        </div>
        <BarChart data={data.botPersonalityUsage.length ? data.botPersonalityUsage : [{ label: "striker", value: 1 }]} accent="#76FF03" height={100} />
        <CollapsibleList title="Журнал мыслей и тактик ботов" count={data.botEvents.length} defaultOpen>
          <DataTable
            columns={[
              { key: "ts", label: "Время" },
              { key: "mode", label: "Режим" },
              { key: "tactic", label: "Тактика" },
              { key: "detail", label: "Мысль / событие" },
            ]}
            rows={data.botEvents.slice(0, 60).map(e => ({
              ts: new Date(e.ts).toLocaleString("ru-RU"),
              mode: e.mode ?? "—",
              tactic: String(e.meta?.tactic ?? "—"),
              detail: e.detail.slice(0, 90),
            }))}
          />
        </CollapsibleList>
        <div style={{ marginTop: 10, fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
          Мысли ботов пишутся в реальном времени — тактика выбирается внутренним ИИ по режиму и ситуации на карте.
        </div>
      </TechPanel>
    </div>
  );
}
