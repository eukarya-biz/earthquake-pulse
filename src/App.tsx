import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, TrendingUp, Globe, Play, Pause, RotateCcw, X, Sun, Moon, Settings, Info, ArrowUpDown, Share2, Copy, Check, RefreshCw } from "lucide-react";
import type { Earthquake } from "./types/earthquake";
import { calculateStats } from "./utils/earthquakeHelpers";
import { getMagnitudeColor, MAG_CLASSES, getMagnitudeTextColor } from "./utils/magnitudeClassification";

export interface AppProps {
  allEarthquakes: Earthquake[];
  visibleEarthquakes: Earthquake[];
  onTimeChange: (time: Date, rangeStart: Date, rangeEnd: Date) => void;
  onEarthquakeClick: (earthquake: Earthquake) => void;
  onToggleVisualMode: (realistic: boolean) => void;
  showPlates: boolean;
  onTogglePlates: (show: boolean) => void;
  selectedEarthquake: Earthquake | null;
  onSelectEarthquake: (eq: Earthquake) => void;
  onDeselectEarthquake: () => void;
  onThemeChange: (dark: boolean) => void;
  dataMinTime: number;
  dataMaxTime: number;
  getCameraState: () => { lng: number; lat: number; height: number; heading: number; pitch: number; roll: number } | null;
  initialRealisticMode: boolean;
  dataLoading: boolean;
  onReloadData: (startTime?: number, endTime?: number) => Promise<void>;
  sharedMinTime?: number;
  sharedMaxTime?: number;
}

function TopToolbar({
  realisticMode, onToggleVisualMode, showPlates, onTogglePlates, darkMode, onToggleDark,
  dataMinTime, dataMaxTime, onGetShareURL, dataLoading, onReloadData,
  sharedMinTime, sharedMaxTime,
}: {
  realisticMode: boolean;
  onToggleVisualMode: (v: boolean) => void;
  showPlates: boolean;
  onTogglePlates: (v: boolean) => void;
  darkMode: boolean;
  onToggleDark: () => void;
  dataMinTime: number;
  dataMaxTime: number;
  onGetShareURL: () => string;
  dataLoading: boolean;
  onReloadData: (startTime?: number, endTime?: number) => Promise<void>;
  sharedMinTime?: number;
  sharedMaxTime?: number;
}) {
  const { t, i18n } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasSharedRange = sharedMinTime !== undefined && sharedMaxTime !== undefined;

  const getRangeMode = () => {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    if (hasSharedRange && !params.has("range")) return "fixed";
    return params.get("range") || "7d";
  };

  const [rangeMode, setRangeMode] = useState(getRangeMode);

  const handleRangeChange = useCallback((value: string) => {
    if (value === rangeMode) return;
    setRangeMode(value);
    const now = Date.now();
    if (value === "7d") {
      onReloadData();
    } else if (value === "24h") {
      onReloadData(now - 86400000, now);
    } else if (value === "fixed") {
      onReloadData(sharedMinTime, sharedMaxTime);
    }
  }, [rangeMode, onReloadData, sharedMinTime, sharedMaxTime]);

  const shareURL = useMemo(() => {
    if (!shareOpen) return "";
    return onGetShareURL();
  }, [shareOpen]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareURL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [shareURL]);

  return (
    <>
    <header className="h-[72px] border-b bg-background flex items-center px-6 gap-6 shrink-0 pointer-events-auto text-foreground/70">
      <div className="flex items-center gap-3 shrink-0">
        <Activity className="w-5 h-5 text-cyan-400" />
        <div className="flex flex-col leading-tight">
          <span className="text-base font-bold tracking-wide animate-[titlePulse_6s_ease-in-out_infinite] bg-gradient-to-r from-cyan-600 via-blue-600 to-cyan-600 dark:from-cyan-400 dark:via-blue-400 dark:to-cyan-400 bg-[length:200%_auto] bg-clip-text text-transparent">
            {t("app.title")}
          </span>
          <span className="text-[10px] text-muted-foreground">{t("app.subtitle")}</span>
        </div>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        <div className="text-[10px] text-muted-foreground font-mono">
          <span className="text-muted-foreground/50">{t("header.dataRange")} </span>
          {new Date(dataMinTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          {" – "}
          {new Date(dataMaxTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", year: "numeric" })}
        </div>
        <Select value={rangeMode} onValueChange={handleRangeChange} disabled={dataLoading}>
          <SelectTrigger className="h-5 gap-0 px-1 text-[10px] border-0 bg-muted/60 font-mono text-foreground/60 focus:ring-0 [&>svg]:hidden min-w-0 w-auto data-[disabled]:opacity-50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="7d">{t("header.past7d")}</SelectItem>
              <SelectItem value="24h">{t("header.past24h")}</SelectItem>
              {(hasSharedRange || rangeMode === "fixed") && <SelectItem value="fixed">{t("header.fixed")}</SelectItem>}
            </SelectGroup>
          </SelectContent>
        </Select>
        <button
          onClick={() => {
            if (rangeMode === "24h") {
              const now = Date.now();
              onReloadData(now - 86400000, now);
            } else if (rangeMode === "fixed") {
              onReloadData(dataMinTime, dataMaxTime);
            } else {
              onReloadData();
            }
          }}
          className="p-1 transition-colors text-foreground/30 hover:text-foreground/60"
          title={t("header.refresh")}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="w-px h-6 bg-border shrink-0" />
      <div className="flex items-center gap-4">
        <button
          onClick={() => { const lang = i18n.language === "en" ? "ja" : "en"; i18n.changeLanguage(lang); localStorage.setItem("lang", lang); }}
          className="text-[10px] font-semibold text-foreground/40 hover:text-foreground/70 transition-colors px-1"
        >
          {i18n.language === "en" ? "EN" : "JA"}
        </button>
        <button onClick={onToggleDark} className="p-1 transition-colors text-foreground/40 hover:text-foreground/70">
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <div className="relative">
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={`text-foreground/40 hover:text-foreground/70 transition-colors p-1 ${settingsOpen ? "text-foreground/70" : ""}`}
          >
            <Settings className="w-4 h-4" />
          </button>
          {settingsOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setSettingsOpen(false)} />
              <div className="absolute right-0 z-30 p-4 mt-2 space-y-4 border rounded-lg shadow-xl top-full w-52 bg-background">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-foreground/70">{t("header.plates")}</span>
                  <Switch checked={showPlates} onCheckedChange={onTogglePlates} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-foreground/70">{t("header.realistic")}</span>
                  <Switch checked={realisticMode} onCheckedChange={onToggleVisualMode} />
                </div>
              </div>
            </>
          )}
        </div>
        <button onClick={() => setInfoOpen(true)} className="p-1 transition-colors text-foreground/40 hover:text-foreground/70">
          <Info className="w-4 h-4" />
        </button>
        <button onClick={() => setShareOpen(true)} className="p-1 transition-colors text-foreground/40 hover:text-foreground/70">
          <Share2 className="w-4 h-4" />
        </button>
      </div>
    </header>
    {infoOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto">
        <div className="absolute inset-0 bg-black/60" onClick={() => setInfoOpen(false)} />
        <div className="relative w-full max-w-md p-6 m-4 border shadow-2xl bg-background rounded-xl">
          <button onClick={() => setInfoOpen(false)} className="absolute top-4 right-4 text-foreground/40 hover:text-foreground/70">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-foreground">Earthquake Pulse</h2>
          </div>
          <div className="space-y-4 text-sm leading-relaxed text-foreground/70">
            <div>
              <h3 className="mb-1 text-xs font-semibold tracking-wider uppercase text-foreground/50">{t("info.data")}</h3>
              <p>{t("info.dataDesc", { min: "0" })}</p>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold tracking-wider uppercase text-foreground/50">{t("info.nav")}</h3>
              <ul className="space-y-1 text-xs list-disc list-inside">
                <li>{t("info.navDrag")}</li>
                <li>{t("info.navClick")}</li>
                <li>{t("info.navDismiss")}</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold tracking-wider uppercase text-foreground/50">{t("info.tlTitle")}</h3>
              <ul className="space-y-1 text-xs list-disc list-inside">
                <li>{t("info.tlStart")}</li>
                <li>{t("info.tlEnd")}</li>
                <li>{t("info.tlPan")}</li>
                <li>{t("info.tlPlay")}</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold tracking-wider uppercase text-foreground/50">{t("info.vmTitle")}</h3>
              <p className="text-xs">{t("info.vmDesc")}</p>
            </div>
          </div>
        </div>
      </div>
    )}
    {shareOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto">
        <div className="absolute inset-0 bg-black/60" onClick={() => { setShareOpen(false); setCopied(false); }} />
        <div className="relative w-full max-w-lg p-6 m-4 border shadow-2xl bg-background rounded-xl">
          <button onClick={() => { setShareOpen(false); setCopied(false); }} className="absolute top-4 right-4 text-foreground/40 hover:text-foreground/70">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 mb-4">
            <Share2 className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-foreground">{t("share.title")}</h2>
          </div>
          <div className="space-y-4">
            <p className="text-xs text-foreground/50">{t("share.desc")}</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={shareURL}
                className="flex-1 h-9 px-3 text-xs font-mono border rounded-lg bg-muted/60 text-foreground/70 outline-none"
                onFocus={(e) => e.target.select()}
              />
              <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={handleCopy}>
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? t("share.copied") : t("share.copy")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function RightSidebar({
  visibleEarthquakes, allEarthquakes, onEarthquakeClick, selectedEq,
}: {
  visibleEarthquakes: Earthquake[];
  allEarthquakes: Earthquake[];
  onEarthquakeClick: (eq: Earthquake) => void;
  selectedEq: Earthquake | null;
}) {
  const [sortMode, setSortMode] = useState<"time" | "magnitude">("time");

  const stats = useMemo(() => {
    if (!visibleEarthquakes?.length) return { total: 0, minMagnitude: 0, maxMagnitude: 0, averageMagnitude: 0, minDepth: 0, maxDepth: 0 };
    return calculateStats(visibleEarthquakes);
  }, [visibleEarthquakes]);

  const { t } = useTranslation();

  const topEarthquakes = useMemo(() => {
    const sorted = [...(visibleEarthquakes || [])];
    if (sortMode === "time") {
      sorted.sort((a, b) => b.time.getTime() - a.time.getTime());
    } else {
      sorted.sort((a, b) => b.magnitude - a.magnitude);
    }
    return sorted;
  }, [visibleEarthquakes, sortMode]);

  const magCounts = useMemo(() => {
    const counts = MAG_CLASSES.map((c) => ({
      ...c,
      count: visibleEarthquakes.filter((eq) => eq.magnitude >= c.min && eq.magnitude < c.max).length,
    }));
    counts[counts.length - 1].count = visibleEarthquakes.filter((eq) => eq.magnitude >= MAG_CLASSES[MAG_CLASSES.length - 1].min).length;
    return counts;
  }, [visibleEarthquakes]);

  return (
    <aside className="w-[380px] border-l border-border bg-background flex flex-col shrink-0 pointer-events-auto overflow-hidden">
      <div className="p-5 space-y-4 shrink-0">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground/80">{t("sidebar.statistics")}</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/60">
            <div className="text-[10px] text-foreground/40 uppercase tracking-widest font-semibold">{t("sidebar.visible")}</div>
            <div className="text-2xl font-bold mt-0.5 text-foreground/90 tabular-nums">{visibleEarthquakes?.length || 0}</div>
          </div>
          <div className="bg-muted/60 rounded-lg p-3">
            <div className="text-[10px] text-foreground/40 uppercase tracking-widest font-semibold">{t("sidebar.total")}</div>
            <div className="text-2xl font-bold mt-0.5 text-foreground/90 tabular-nums">{allEarthquakes?.length || 0}</div>
          </div>
          <div className="bg-muted/60 rounded-lg p-3">
            <div className="text-[10px] text-foreground/40 uppercase tracking-widest font-semibold">{t("sidebar.range")}</div>
            <div className="text-lg font-bold mt-0.5 font-mono text-foreground/90 tabular-nums">{stats.minMagnitude.toFixed(1)} – {stats.maxMagnitude.toFixed(1)}</div>
          </div>
          <div className="bg-muted/60 rounded-lg p-3">
            <div className="text-[10px] text-foreground/40 uppercase tracking-widest font-semibold">{t("sidebar.avgMag")}</div>
            <div className="text-lg font-bold mt-0.5 text-foreground/90 tabular-nums">M{stats.averageMagnitude.toFixed(2)}</div>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-foreground/80">{t("sidebar.magBreakdown")}</h3>
          </div>
          {magCounts.map((c) => (
            <div key={c.name} className="flex items-center gap-0.5 h-8">
              <div className="w-[90px] shrink-0 leading-tight">
                <div className="text-[11px] text-foreground/70 font-medium">{c.name}</div>
                <div className="text-[10px] text-muted-foreground/70">{c.range}</div>
              </div>
              <span className="w-8 mr-1 font-mono text-xs text-right text-foreground/50">{c.count}</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full transition-all duration-300 rounded-full" style={{ width: `${(c.count / (visibleEarthquakes?.length || 1)) * 100}%`, background: c.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground/80">{t("sidebar.quakeList")} <span className="font-normal text-foreground/40">({topEarthquakes.length})</span></h3>
          <button
            onClick={() => setSortMode(sortMode === "time" ? "magnitude" : "time")}
            className="ml-auto flex items-center gap-1 text-[10px] text-foreground/40 hover:text-foreground/60 transition-colors"
            title={sortMode === "time" ? t("sidebar.sortByMag") : t("sidebar.sortByTime")}
          >
            {sortMode === "time" ? t("sidebar.sortTime") : t("sidebar.sortMag")}
            <ArrowUpDown className="w-3 h-3" />
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1.5">
          {topEarthquakes.length > 0 ? topEarthquakes.map((eq) => (
            <div
              key={eq.id}
              onClick={() => onEarthquakeClick?.(eq)}
              className={`flex items-start gap-2 p-2.5 rounded-lg cursor-pointer transition-colors ${selectedEq?.id === eq.id ? "bg-cyan-400/10 border border-cyan-400/30" : "bg-muted/40 hover:bg-muted/80"}`}
            >
              <span className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0" style={{ background: getMagnitudeColor(eq.magnitude), color: getMagnitudeTextColor(eq.magnitude) }}>
                M{eq.magnitude.toFixed(1)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs truncate text-foreground/80">{eq.place || "Unknown"}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                  {eq.time.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {" · "}{(eq.depth / 1000).toFixed(1)}km
                </div>
              </div>
            </div>
          )) : (
            <div className="py-6 text-xs text-center text-muted-foreground">{t("sidebar.noData")}</div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function BottomTimeline({
  allEarthquakes, onTimeChange,
}: {
  allEarthquakes: Earthquake[];
  onTimeChange: (time: Date, rangeStart: Date, rangeEnd: Date) => void;
}) {
  const { t } = useTranslation();
  const sortedQuakes = useMemo(() =>
    [...allEarthquakes].sort((a, b) => a.time.getTime() - b.time.getTime()),
  [allEarthquakes]);

  const minTime = useMemo(() => sortedQuakes[0]?.time.getTime() || 0, [sortedQuakes]);
  const maxTime = useMemo(() => sortedQuakes[sortedQuakes.length - 1]?.time.getTime() || 0, [sortedQuakes]);
  const totalMs = maxTime - minTime || 1;
  const MIN_GAP = 3600000;
  const HOURS_1 = 3600000;
  const HOURS_24 = 86400000;

  const defaultWindow = useMemo(() => totalMs <= HOURS_24 * 2 ? HOURS_1 : HOURS_24, [totalMs, HOURS_24]);

  const defaultStart = useMemo(() => Math.max(minTime, maxTime - defaultWindow), [minTime, maxTime, defaultWindow]);

  const [rangeStart, setRangeStart] = useState(defaultStart);
  const [rangeEnd, setRangeEnd] = useState(maxTime);
  const rangeRef = useRef({ start: rangeStart, end: rangeEnd });
  rangeRef.current = { start: rangeStart, end: rangeEnd };

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [dragging, setDragging] = useState<"start" | "end" | "pan" | null>(null);
  const panStartRef = useRef({ x: 0, start: 0, end: 0 });
  const onTimeChangeRef = useRef(onTimeChange);
  onTimeChangeRef.current = onTimeChange;
  const trackRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const lastRef = useRef(Date.now());

  // Notify main.tsx — uses refs to avoid stale deps
  const notify = useCallback((t: number) => {
    onTimeChange(new Date(t), new Date(rangeRef.current.start), new Date(rangeRef.current.end));
  }, [onTimeChange]);

  // Ensure range respects min gap
  const clampStart = useCallback((v: number) => Math.min(rangeEnd - MIN_GAP, Math.max(minTime, v)), [rangeEnd, minTime]);
  const clampEnd = useCallback((v: number) => Math.max(rangeStart + MIN_GAP, Math.min(maxTime, v)), [rangeStart, maxTime]);

  // Playback loop — advances rangeEnd (the current time cursor)
  useEffect(() => {
    if (!isPlaying) { if (animRef.current) cancelAnimationFrame(animRef.current); return; }
    const animate = () => {
      const now = Date.now();
      const delta = (now - lastRef.current) * playbackSpeed * 3600;
      lastRef.current = now;
      const gap = rangeRef.current.end - rangeRef.current.start;
      let newEnd = rangeRef.current.end + delta;
      if (newEnd > maxTime) { newEnd = maxTime; setIsPlaying(false); }
      const newStart = newEnd - gap;
      setRangeStart(newStart);
      setRangeEnd(newEnd);
      notify(newEnd);
      animRef.current = requestAnimationFrame(animate);
    };
    lastRef.current = Date.now();
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isPlaying, playbackSpeed, maxTime, notify]);

  // Reset range when data changes
  useEffect(() => {
    setRangeStart(defaultStart);
    setRangeEnd(maxTime);
    onTimeChange(new Date(maxTime), new Date(defaultStart), new Date(maxTime));
  }, [minTime, maxTime, defaultStart]);

  // Mouse handlers for dragging range handles
  const handleMouseDown = (which: "start" | "end" | "pan", e: React.MouseEvent) => {
    if (which === "pan") {
      panStartRef.current = { x: e.clientX, start: rangeStart, end: rangeEnd };
    }
    setIsPlaying(false);
    setDragging(which);
  };
  useEffect(() => {
    if (!dragging || !trackRef.current) return;
    const onMove = (e: MouseEvent) => {
      const rect = trackRef.current!.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const t = minTime + frac * totalMs;

      if (dragging === "pan") {
        const dx = (e.clientX - panStartRef.current.x) / rect.width * totalMs;
        const gap = panStartRef.current.end - panStartRef.current.start;
        let newStart = panStartRef.current.start + dx;
        let newEnd = panStartRef.current.end + dx;
        if (newStart < minTime) { newStart = minTime; newEnd = minTime + gap; }
        if (newEnd > maxTime) { newEnd = maxTime; newStart = maxTime - gap; }
        setRangeStart(newStart);
        setRangeEnd(newEnd);
        onTimeChangeRef.current(new Date(newEnd), new Date(newStart), new Date(newEnd));
        return;
      }

      if (dragging === "start") setRangeStart(clampStart(t));
      else if (dragging === "end") setRangeEnd(clampEnd(t));
      // Sync visualization with new range
      const start = dragging === "start" ? clampStart(t) : rangeRef.current.start;
      const end = dragging === "end" ? clampEnd(t) : rangeRef.current.end;
      onTimeChangeRef.current(new Date(end), new Date(start), new Date(end));
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, minTime, totalMs, clampStart, clampEnd]);

  const startPct = totalMs ? ((rangeStart - minTime) / totalMs) * 100 : 0;
  const endPct = totalMs ? ((rangeEnd - minTime) / totalMs) * 100 : 100;
  const visibleCount = sortedQuakes.filter(eq => eq.time.getTime() >= rangeStart && eq.time.getTime() <= rangeEnd).length;
  const speeds = [1, 2, 5, 10];

  // Hourly grid line positions
  const hourLines = useMemo(() => {
    const lines: { x: number }[] = [];
    const hourMs = 3600000;
    if (totalMs > hourMs * 500) return lines;
    let t = Math.ceil(minTime / hourMs) * hourMs;
    while (t <= maxTime) {
      lines.push({ x: ((t - minTime) / totalMs) * 100 });
      t += hourMs;
    }
    return lines;
  }, [minTime, maxTime, totalMs]);

  // Date change markers (local-time midnight boundaries)
  const dateMarkers = useMemo(() => {
    const markers: { x: number; label: string }[] = [];
    const dayMs = 86400000;
    const startDate = new Date(minTime);
    startDate.setHours(0, 0, 0, 0);
    let t = startDate.getTime();
    if (t < minTime) t += dayMs;
    while (t <= maxTime) {
      markers.push({
        x: ((t - minTime) / totalMs) * 100,
        label: new Date(t).toLocaleString("en-US", { month: "short", day: "numeric" }),
      });
      t += dayMs;
    }
    return markers;
  }, [minTime, maxTime, totalMs]);

  const fmt = (t: number) =>
    new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <footer className="h-[160px] border-t border-border bg-background flex flex-col shrink-0 pointer-events-auto">
      {/* Top row: controls */}
      <div className="flex items-center justify-between px-6 py-1.5 border-b border-border text-foreground/70">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          {speeds.map(s => (
            <button key={s} onClick={() => setPlaybackSpeed(s)}
              className={`text-xs px-2 py-1 rounded transition-colors ${playbackSpeed === s ? "bg-cyan-400/20 text-cyan-400" : "text-foreground/40 hover:text-foreground/70"}`}>
              {s}x
            </button>
          ))}
          <span className="text-[10px] text-muted-foreground ml-1">{playbackSpeed} {t("timeline.hrPerSec")}</span>
          <Button variant="ghost" size="icon" className="w-8 h-8 ml-2"
            onClick={() => {
              setRangeStart(defaultStart);
              setRangeEnd(maxTime);
              setIsPlaying(false);
              onTimeChangeRef.current(new Date(maxTime), new Date(defaultStart), new Date(maxTime));
            }}
            title="Reset to last 24h">
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-[10px] px-1.5 py-0.5 bg-cyan-400/15 text-cyan-400 rounded font-medium mr-0.5">{t("timeline.visualFrom")}</span>
          <span className="font-mono text-cyan-400">{fmt(rangeStart)}</span>
          <span className="text-muted-foreground">–</span>
          <span className="font-mono text-red-400">{fmt(rangeEnd)}</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-red-500/15 text-red-400 rounded font-medium ml-0.5">{t("timeline.current")}</span>
          <span className="text-muted-foreground">|</span>
          <span>{visibleCount}/{sortedQuakes.length} {t("timeline.events")}</span>
        </div>
      </div>

      {/* Bottom: range timeline track */}
      <div className="flex-1 px-6 pb-3 bg-muted/40">
        <div className="relative h-full select-none" ref={trackRef}>
          {/* Magnitude grid lines */}
          {[2, 4, 6, 8].map((m) => (
            <div
              key={`h-${m}`}
              className="absolute inset-x-0 h-px pointer-events-none bg-muted/60"
              style={{ top: `${(1 - m / 10) * 100}%` }}
            />
          ))}
          {/* Hourly vertical grid lines */}
          {hourLines.map((l, i) => (
            <div
              key={`v-${i}`}
              className="absolute inset-y-0 w-px pointer-events-none bg-muted/60"
              style={{ left: `${l.x}%` }}
            />
          ))}
          {/* Earthquake event dots */}
          {sortedQuakes.map((eq) => {
            const x = ((eq.time.getTime() - minTime) / totalMs) * 100;
            const y = (1 - Math.min(eq.magnitude, 10) / 10) * 100;
            const size = Math.max(3, eq.magnitude * 0.8 + 2);
            return (
              <div
                key={eq.id}
                className="absolute rounded-full pointer-events-none"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: `${size}px`,
                  height: `${size}px`,
                  transform: "translate(-50%, -50%)",
                  background: getMagnitudeColor(eq.magnitude),
                  opacity: 0.7,
                }}
              />
            );
          })}
          {/* Active range background (pan target) */}
          <div
            className="absolute inset-y-0 bg-cyan-400/[0.12] cursor-grab active:cursor-grabbing"
            style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
            onMouseDown={(e) => handleMouseDown("pan", e)}
          />
          {/* Handle: range start */}
          <div
            className="absolute inset-y-0 w-1.5 bg-cyan-400 cursor-ew-resize -translate-x-1/2 hover:bg-cyan-300 transition-colors"
            style={{ left: `${startPct}%` }}
            onMouseDown={(e) => handleMouseDown("start", e)}
          />
          {/* Handle: range end (current time cursor) */}
          <div
            className="absolute inset-y-0 w-1.5 bg-red-500 cursor-ew-resize -translate-x-1/2 hover:bg-red-400 transition-colors"
            style={{ left: `${endPct}%` }}
            onMouseDown={(e) => handleMouseDown("end", e)}
          />
        </div>
        {/* Date labels */}
        <div className="relative h-4 px-6">
          {dateMarkers.map((m, i) => (
            <div
              key={`d-${i}`}
              className="absolute text-[9px] text-muted-foreground/50 whitespace-nowrap -translate-x-1/2"
              style={{ left: `${m.x}%` }}
            >
              {m.label}
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}

function EarthquakeDetail({
  eq, onClose,
}: {
  eq: Earthquake;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="p-4 border rounded-lg shadow-xl pointer-events-auto bg-background border-border w-72">
      <div className="flex items-start justify-between mb-3">
        <span className="px-2 py-1 font-mono text-xs rounded" style={{ background: getMagnitudeColor(eq.magnitude), color: getMagnitudeTextColor(eq.magnitude) }}>
          M{eq.magnitude.toFixed(1)}
        </span>
        <button onClick={onClose} className="text-foreground/40 hover:text-foreground/70">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-2 text-sm">
        <div className="font-medium text-foreground/80">{eq.place || t("detail.unknown")}</div>
        <div className="grid grid-cols-2 gap-2 text-xs text-foreground/50">
          <div>{t("detail.depth")}</div>
          <div className="text-right text-foreground/70">{(eq.depth / 1000).toFixed(1)} km</div>
          <div>{t("detail.time")}</div>
          <div className="text-right text-foreground/70">
            {eq.time.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <div>{t("detail.lat")}</div>
          <div className="text-right text-foreground/70">{eq.latitude.toFixed(2)}°</div>
          <div>{t("detail.lng")}</div>
          <div className="text-right text-foreground/70">{eq.longitude.toFixed(2)}°</div>
        </div>
      </div>
    </div>
  );
}

export function App({
  allEarthquakes, visibleEarthquakes, onTimeChange, onEarthquakeClick, onToggleVisualMode, showPlates, onTogglePlates, selectedEarthquake, onSelectEarthquake, onDeselectEarthquake, onThemeChange,
  dataMinTime, dataMaxTime, getCameraState, initialRealisticMode, dataLoading, onReloadData, sharedMinTime, sharedMaxTime,
}: AppProps) {
  const { t } = useTranslation();
  const [realisticMode, setRealisticMode] = useState(initialRealisticMode);
  const [darkMode, setDarkMode] = useState(true);

  const rangeRef = useRef({ start: 0, end: 0 });

  const handleTimeChange = useCallback((currentTime: Date, rangeStart: Date, rangeEnd: Date) => {
    rangeRef.current = { start: rangeStart.getTime(), end: rangeEnd.getTime() };
    onTimeChange(currentTime, rangeStart, rangeEnd);
  }, [onTimeChange]);

  const onGetShareURL = useCallback(() => {
    const cam = getCameraState();
    const params = new URLSearchParams();
    if (cam) {
      params.set("lng", cam.lng.toFixed(6));
      params.set("lat", cam.lat.toFixed(6));
      params.set("h", Math.round(cam.height).toString());
      params.set("hd", cam.heading.toFixed(2));
      params.set("p", cam.pitch.toFixed(2));
      params.set("r", cam.roll.toFixed(2));
    }
    params.set("rs", Math.round(rangeRef.current.start).toString());
    params.set("re", Math.round(rangeRef.current.end).toString());
    params.set("pl", showPlates ? "1" : "0");
    params.set("rl", realisticMode ? "1" : "0");
    if (selectedEarthquake) params.set("eq", selectedEarthquake.id);
    params.set("dmin", Math.round(dataMinTime).toString());
    params.set("dmax", Math.round(dataMaxTime).toString());
    const { origin, pathname } = window.location;
    return `${origin}${pathname}#${params.toString()}`;
  }, [getCameraState, showPlates, realisticMode, selectedEarthquake, dataMinTime, dataMaxTime]);

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    onThemeChange(next);
  };

  useEffect(() => { onToggleVisualMode(realisticMode); }, [realisticMode, onToggleVisualMode]);

  return (
    <div className="fixed inset-0 z-10 flex flex-col pointer-events-none">
      <TopToolbar
        realisticMode={realisticMode}
        onToggleVisualMode={setRealisticMode}
        showPlates={showPlates}
        onTogglePlates={onTogglePlates}
        darkMode={darkMode}
        onToggleDark={toggleDark}
        dataMinTime={dataMinTime}
        dataMaxTime={dataMaxTime}
        onGetShareURL={onGetShareURL}
        dataLoading={dataLoading}
        onReloadData={onReloadData}
        sharedMinTime={sharedMinTime}
        sharedMaxTime={sharedMaxTime}
      />
      {dataLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-auto">
          <div className="absolute inset-0 backdrop-blur-sm bg-background/40" />
          <div className="relative flex items-center gap-3 px-6 py-4 border rounded-xl shadow-2xl bg-background">
            <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
            <span className="text-sm font-medium text-foreground/70">{t("loading.text")}</span>
          </div>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          {selectedEarthquake && (
            <div className="absolute top-4 left-4">
              <EarthquakeDetail eq={selectedEarthquake} onClose={onDeselectEarthquake} />
            </div>
          )}
        </div>
        <RightSidebar
          visibleEarthquakes={visibleEarthquakes}
          allEarthquakes={allEarthquakes}
          selectedEq={selectedEarthquake}
          onEarthquakeClick={(eq) => { onSelectEarthquake(eq); onEarthquakeClick(eq); }}
        />
      </div>
      <BottomTimeline
        allEarthquakes={allEarthquakes}
        onTimeChange={handleTimeChange}
      />
    </div>
  );
}
