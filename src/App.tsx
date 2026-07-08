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
interface AudioSnapshot {
  volume: number;
  is_muted: boolean;
  device_name: string;
  has_device: boolean;
}
interface BrightnessSnapshot {
  percent: number | null;
}

const TAG_ICONS = [
  "\u{F0A1E}",
  "\u{F0239}",
  "\u{F0A1B}",
  "\u{F0B79}",
  "\u{F024B}",
  "\u{F0388}",
  "\u{F0567}",
  "\u{F01F0}",
  "\u{F0297}",
];
const ICON_CPU = "\u{F4BC}";
const ICON_MEM = "\u{F035B}";
const ICON_BAT_FULL = "\u{F0079}";
const ICON_BAT_CHG = "\u{F0084}";
const ICON_VOL_HIGH = "\u{F057E}";
const ICON_VOL_MID = "\u{F0580}";
const ICON_VOL_LOW = "\u{F057F}";
const ICON_VOL_MUTE = "\u{F075F}";
const ICON_BRIGHT = "\u{F00DE}";
const ICON_SHOT = "\u{F0104}";
const ICON_TIME = "\u{F0954}";
const ICON_MON = "\u{F0379}";

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
const monitorIcon = (n: number) => (n === 0 ? "\u{F02DA}" : n === 1 ? "\u{F02DB}" : `M${n}`);
const sev = (p: number) =>
  p <= 30 ? "usage-good" : p <= 60 ? "usage-warn" : p <= 80 ? "usage-caution" : "usage-danger";
const volumeIconChar = (a: AudioSnapshot | null): string => {
  if (!a || !a.has_device) return ICON_VOL_MUTE;
  if (a.is_muted) return ICON_VOL_MUTE;
  if (a.volume <= 0) return ICON_VOL_MUTE;
  if (a.volume < 34) return ICON_VOL_LOW;
  if (a.volume < 67) return ICON_VOL_MID;
  return ICON_VOL_HIGH;
};

function App() {
  const [monitor, setMonitor] = createSignal<MonitorInfoSnapshot | null>(null);
  const [system, setSystem] = createSignal<SystemSnapshot | null>(null);
  const [audio, setAudio] = createSignal<AudioSnapshot | null>(null);
  const [brightness, setBrightness] = createSignal<BrightnessSnapshot | null>(null);
  const [pressed, setPressed] = createSignal<number | null>(null);
  const [layoutOpen, setLayoutOpen] = createSignal(false);
  const [showSeconds, setShowSeconds] = createSignal(true);
  const [now, setNow] = createSignal(new Date());
  const [isTaking, setIsTaking] = createSignal(false);

  let unlistenMonitor: UnlistenFn | undefined;
  let unlistenSystem: UnlistenFn | undefined;
  let unlistenAudio: UnlistenFn | undefined;
  let unlistenBrightness: UnlistenFn | undefined;

  onMount(async () => {
    console.log("Tauri Solid frontend has loaded.");
    unlistenMonitor = await listen<MonitorInfoSnapshot>("monitor-update", (e) =>
      setMonitor(e.payload),
    );
    unlistenSystem = await listen<SystemSnapshot>("system-update", (e) =>
      setSystem(e.payload),
    );
    unlistenAudio = await listen<AudioSnapshot>("audio-update", (e) =>
      setAudio(e.payload),
    );
    unlistenBrightness = await listen<BrightnessSnapshot>("brightness-update", (e) =>
      setBrightness(e.payload),
    );
  });

  createEffect(() => {
    const interval = setInterval(() => setNow(new Date()), showSeconds() ? 1000 : 60000);
    onCleanup(() => clearInterval(interval));
  });

  onCleanup(() => {
    unlistenMonitor?.();
    unlistenSystem?.();
    unlistenAudio?.();
    unlistenBrightness?.();
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
  const onToggleMute = () => {
    invoke("toggle_mute").catch((e) => console.error(e));
  };
  const onVolumeWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 5 : -5;
    invoke("adjust_volume", { delta }).catch((err) => console.error(err));
  };
  const onBrightnessClick = () => {
    invoke("adjust_brightness", { delta: 5 }).catch((e) => console.error(e));
  };
  const onBrightnessRight = (e: MouseEvent) => {
    e.preventDefault();
    invoke("adjust_brightness", { delta: -5 }).catch((err) => console.error(err));
  };
  const onBrightnessWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 5 : -5;
    invoke("adjust_brightness", { delta }).catch((err) => console.error(err));
  };

  return (
    <Show when={monitor()} fallback={<div class="button-row">Loading...</div>}>
      {(m) => (
        <div class="button-row">
          <div class="buttons-container">
            <For each={TAG_ICONS}>
              {(icon, i) => {
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
                    title={`Tag ${i() + 1}`}
                  >
                    <span class="nf-icon">{icon}</span>
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
                    <div class="pill usage-pill usage-warn">
                      <span class="nf-icon">{ICON_CPU}</span> --%
                    </div>
                    <div class="pill usage-pill usage-warn">
                      <span class="nf-icon">{ICON_MEM}</span> --%
                    </div>
                    <div class="pill usage-pill usage-warn">
                      <span class="nf-icon">{ICON_BAT_FULL}</span> --%
                    </div>
                  </>
                }
              >
                {(s) => (
                  <>
                    <div class={`pill usage-pill ${sev(s().cpu_average)}`} title="CPU 平均使用率">
                      <span class="nf-icon">{ICON_CPU}</span> {`${s().cpu_average.toFixed(0)}%`}
                    </div>
                    <div
                      class={`pill usage-pill ${sev(s().memory_usage_percent)}`}
                      title={`内存使用: ${formatBytes(s().memory_used)} / ${formatBytes(s().memory_total)}`}
                    >
                      <span class="nf-icon">{ICON_MEM}</span> {`${s().memory_usage_percent.toFixed(0)}%`}
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
                      <span class="nf-icon">{s().is_charging ? ICON_BAT_CHG : ICON_BAT_FULL}</span>
                      {` ${s().battery_percent.toFixed(0)}%`}
                    </div>
                  </>
                )}
              </Show>
            </div>

            <div
              class="pill brightness-pill"
              onClick={onBrightnessClick}
              onWheel={onBrightnessWheel}
              onContextMenu={onBrightnessRight}
              title="左键加亮 / 右键减暗 / 滚轮调节"
            >
              <span class="nf-icon">{ICON_BRIGHT}</span>{" "}
              {brightness()?.percent != null ? `${brightness()!.percent}%` : "--"}
            </div>

            <div
              class={`pill volume-pill ${
                !audio() || audio()!.is_muted || !audio()!.has_device ? "muted" : ""
              }`}
              onClick={onToggleMute}
              onWheel={onVolumeWheel}
              title="左键静音 / 滚轮调节"
            >
              <span class="nf-icon">{volumeIconChar(audio())}</span>{" "}
              {audio()?.has_device ? `${audio()!.volume}%` : "--"}
            </div>

            <div
              class={`pill screenshot-pill ${isTaking() ? "taking" : ""}`}
              onClick={takeScreenshot}
              title="截图 (Flameshot)"
            >
              <span class="nf-icon">{ICON_SHOT}</span>
            </div>

            <div
              class="pill time-pill"
              onClick={() => setShowSeconds(!showSeconds())}
              title="点击切换秒显示"
            >
              <span class="nf-icon">{ICON_TIME}</span> {formattedTime()}
            </div>

            <div class="pill monitor-pill" title="显示器">
              <span class="nf-icon">{ICON_MON}</span> {monitorIcon(m().monitor_num)}
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
