import { createSignal, createEffect, createMemo, onCleanup, onMount, Show, For } from "solid-js";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

interface TagStatus {
  is_selected: boolean;
  is_urg: boolean;
  is_filled: boolean;
  is_occ: boolean;
}
interface MonitorInfoSnapshot {
  monitor_num: number;
  monitor_width: number;
  monitor_height: number;
  monitor_x: number;
  monitor_y: number;
  tag_status_vec: TagStatus[];
  client_name: string;
  ltsymbol: string;
}
interface SystemSnapshot {
  cpu_average: number;
  memory_used: number;
  memory_total: number;
  memory_usage_percent: number;
  battery_percent: number;
  is_charging: boolean;
}

const BUTTONS = ["🐖", "🐄", "🐂", "🐃", "🦥", "🦣", "🐏", "🦆", "🐢"];

const getButtonClass = (t: TagStatus): string => {
  if (t.is_filled) return "emoji-button state-filtered";
  if (t.is_selected) return "emoji-button state-selected";
  if (t.is_urg) return "emoji-button state-urgent";
  if (t.is_occ) return "emoji-button state-occupied";
  return "emoji-button state-default";
};
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0B";
  const U = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const s = parseFloat((bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1));
  return `${s}${U[i]}`;
};
const parseLtSymbol = (lts: string | undefined) => {
  if (!lts) return { symbol: "[]=", scale: undefined as number | undefined };
  const sym = lts.match(/^(\S+)/);
  const sc = lts.match(/s:\s*([0-9.]+)/i);
  return { symbol: sym ? sym[1] : "[]=", scale: sc ? parseFloat(sc[1]) : undefined };
};
const monitorIcon = (n: number) => (n === 0 ? "󰎡" : n === 1 ? "󰎤" : `M${n}`);
const sev = (p: number) =>
  p <= 30 ? "usage-good" : p <= 60 ? "usage-warn" : p <= 80 ? "usage-caution" : "usage-danger";

function App() {
  const [monitor, setMonitor] = createSignal<MonitorInfoSnapshot | null>(null);
  const [system, setSystem] = createSignal<SystemSnapshot | null>(null);
  const [pressed, setPressed] = createSignal<number | null>(null);
  const [layoutOpen, setLayoutOpen] = createSignal(false);
  const [showSeconds, setShowSeconds] = createSignal(true);
  const [now, setNow] = createSignal(new Date());
  const [isTaking, setIsTaking] = createSignal(false);

  let unlistenMonitor: UnlistenFn | undefined;
  let unlistenSystem: UnlistenFn | undefined;

  onMount(async () => {
    console.log("Tauri Solid frontend has loaded.");
    unlistenMonitor = await listen<MonitorInfoSnapshot>("monitor-update", (e) =>
      setMonitor(e.payload),
    );
    unlistenSystem = await listen<SystemSnapshot>("system-update", (e) =>
      setSystem(e.payload),
    );
  });

  createEffect(() => {
    const interval = setInterval(() => setNow(new Date()), showSeconds() ? 1000 : 60000);
    onCleanup(() => clearInterval(interval));
  });

  onCleanup(() => {
    unlistenMonitor?.();
    unlistenSystem?.();
  });

  const pad = (n: number) => n.toString().padStart(2, "0");
  const formattedTime = createMemo(() => {
    const d = now();
    const ts = `${pad(d.getHours())}:${pad(d.getMinutes())}${
      showSeconds() ? `:${pad(d.getSeconds())}` : ""
    }`;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${ts}`;
  });
  const lt = createMemo(() => parseLtSymbol(monitor()?.ltsymbol));

  const handlePress = (i: number) => setPressed(i);
  const handleRelease = (i: number, monitorNum: number) => {
    setPressed(null);
    invoke("send_tag_command", {
      tagIndex: i,
      isView: true,
      monitorId: monitorNum,
    }).catch((e) => console.error(e));
  };
  const selectLayout = (idx: number, monitorNum: number) => {
    setLayoutOpen(false);
    invoke("send_layout_command", { layoutIndex: idx, monitorId: monitorNum }).catch((e) =>
      console.error(e),
    );
  };
  const takeScreenshot = async () => {
    if (isTaking()) return;
    setIsTaking(true);
    try {
      await invoke("take_screenshot");
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setIsTaking(false), 500);
    }
  };

  return (
    <Show when={monitor()} fallback={<div class="button-row">Loading...</div>}>
      {(m) => (
        <div class="button-row">
          <div class="buttons-container">
            <For each={BUTTONS}>
              {(emoji, i) => {
                const tag = () =>
                  m().tag_status_vec[i()] ?? {
                    is_selected: false,
                    is_urg: false,
                    is_filled: false,
                    is_occ: false,
                  };
                return (
                  <button
                    class={`${getButtonClass(tag())}${pressed() === i() ? " pressed" : ""}`}
                    onMouseDown={() => handlePress(i())}
                    onMouseUp={() => handleRelease(i(), m().monitor_num)}
                    onMouseLeave={() => setPressed(null)}
                  >
                    {emoji}
                  </button>
                );
              }}
            </For>

            <div class="layout-controls">
              <div
                class={`pill layout-toggle ${layoutOpen() ? "open" : "closed"}`}
                onClick={() => setLayoutOpen(!layoutOpen())}
                title="切换布局"
              >
                {lt().symbol}
              </div>
              <Show when={layoutOpen()}>
                <div class="layout-selector">
                  <div
                    class={`pill layout-option ${lt().symbol === "[]=" ? "current" : ""}`}
                    onClick={() => selectLayout(0, m().monitor_num)}
                  >
                    []=
                  </div>
                  <div
                    class={`pill layout-option ${lt().symbol === "><>" ? "current" : ""}`}
                    onClick={() => selectLayout(1, m().monitor_num)}
                  >
                    {"><>"}
                  </div>
                  <div
                    class={`pill layout-option ${lt().symbol === "[M]" ? "current" : ""}`}
                    onClick={() => selectLayout(2, m().monitor_num)}
                  >
                    [M]
                  </div>
                </div>
              </Show>
            </div>
          </div>

          <div class="spacer" />

          <div class="right-info-container">
            <div class="system-info-container">
              <Show
                when={system()}
                fallback={
                  <>
                    <div class="pill usage-pill usage-warn">CPU --%</div>
                    <div class="pill usage-pill usage-warn">MEM --%</div>
                    <div class="pill usage-pill usage-warn">🔋 --%</div>
                  </>
                }
              >
                {(s) => (
                  <>
                    <div class={`pill usage-pill ${sev(s().cpu_average)}`} title="CPU 平均使用率">
                      {`CPU ${s().cpu_average.toFixed(0)}%`}
                    </div>
                    <div
                      class={`pill usage-pill ${sev(s().memory_usage_percent)}`}
                      title={`内存使用: ${formatBytes(s().memory_used)} / ${formatBytes(s().memory_total)}`}
                    >
                      {`MEM ${s().memory_usage_percent.toFixed(0)}%`}
                    </div>
                    <div
                      class={`pill usage-pill ${
                        s().battery_percent > 50
                          ? "usage-good"
                          : s().battery_percent > 20
                            ? "usage-warn"
                            : "usage-danger"
                      }`}
                      title={
                        s().is_charging
                          ? `电池充电中: ${s().battery_percent.toFixed(1)}%`
                          : `电池电量: ${s().battery_percent.toFixed(1)}%`
                      }
                    >
                      {`${s().is_charging ? "🔌" : "🔋"} ${s().battery_percent.toFixed(0)}%`}
                    </div>
                  </>
                )}
              </Show>
            </div>

            <div
              class={`pill screenshot-pill ${isTaking() ? "taking" : ""}`}
              onClick={takeScreenshot}
              title="截图 (Flameshot)"
            >
              {isTaking() ? "⏳" : "📸"}
            </div>

            <div
              class="pill time-pill"
              onClick={() => setShowSeconds(!showSeconds())}
              title="点击切换秒显示"
            >
              {formattedTime()}
            </div>

            <div class="pill monitor-pill" title="显示器">
              {"🖥️ " + monitorIcon(m().monitor_num)}
            </div>

            <div class="pill scale-pill" title="Scale Factor">
              {lt().scale !== undefined ? `s: ${lt().scale!.toFixed(2)}` : "s: --"}
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}

export default App;
