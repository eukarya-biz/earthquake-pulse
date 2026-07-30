import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      app: { title: "Earthquake Pulse", subtitle: "Real-time Global Seismic Activity" },
      header: { plates: "Plates", realistic: "Realistic", settings: "Settings", autoRotate: "Auto-Rotate", dataRange: "Data range:", past7d: "Past 7d", past24h: "Past 24h", fixed: "Fixed from Sharing", refresh: "Refresh data" },
      sidebar: { statistics: "Statistics", visible: "Visible", total: "In Total", range: "Range", avgMag: "Avg Mag", magBreakdown: "Magnitude Breakdown", quakeList: "Earthquake List", noData: "No earthquakes to display", sortByTime: "Sort by time", sortByMag: "Sort by magnitude", sortTime: "Time", sortMag: "Mag" },
      timeline: { current: "Current", visualFrom: "Visual from", events: "events", hrPerSec: "hr/s", reset24h: "Reset to last 24h" },
      detail: { depth: "Depth", time: "Time", lat: "Lat", lng: "Lng", unknown: "Unknown location" },
      info: { title: "About", data: "Data", dataDesc: "Earthquake data from USGS. Select past 7 days, past 24 hours, or a fixed range from a shared view. Click the refresh button to reload.", nav: "Navigation", navDrag: "Drag to rotate · Scroll to zoom", navClick: "Click a marker or list item for earthquake details", navDismiss: "Click empty map space to dismiss the detail panel", tlTitle: "Timeline", tlStart: "Cyan handle — visualization range start", tlEnd: "Red handle — current time cursor", tlPan: "Drag the highlighted area to pan the range", tlPlay: "Press Play to animate time · 1×–10× speed · Reset ↺ restores defaults", sdTitle: "Sidebar", sdDesc: "Statistics summary, magnitude breakdown, and sortable earthquake list (by Time or Magnitude).", vmTitle: "Visual Modes", vmDesc: "Toggle Realistic photoreal rendering or Tectonic Plate boundaries in Settings ⚙", shTitle: "Share", shDesc: "Click the Share icon to copy a link encoding your current camera position, timeline range, and settings.", engine: "Engine", engineDesc: "Powered by Navara", close: "Close" },
      share: { title: "Share View", desc: "Copy the link below to share the current view with camera position, timeline range, and settings.", copy: "Copy", copied: "Copied" },
      loading: { text: "Loading data…" },
    },
  },
  ja: {
    translation: {
      app: { title: "Earthquake Pulse", subtitle: "リアルタイム世界地震活動" },
      header: { plates: "プレート", realistic: "リアル", settings: "設定", autoRotate: "自動回転", dataRange: "データ範囲:", past7d: "過去7日", past24h: "過去24時間", fixed: "共有範囲を固定", refresh: "データ更新" },
      sidebar: { statistics: "統計", visible: "表示中", total: "合計", range: "震度範囲", avgMag: "平均震度", magBreakdown: "震度分布", quakeList: "地震リスト", noData: "表示する地震がありません", sortByTime: "時間順", sortByMag: "震度順", sortTime: "時間", sortMag: "震度" },
      timeline: { current: "現在", visualFrom: "表示開始", events: "件", hrPerSec: "時間/秒", reset24h: "24時間前へ" },
      detail: { depth: "深さ", time: "時刻", lat: "緯度", lng: "経度", unknown: "不明な場所" },
      info: { title: "説明", data: "データ", dataDesc: "USGS地震データ。過去7日、過去24時間、または共有ビューの固定範囲を選択できます。更新ボタンで再読み込み。", nav: "操作", navDrag: "ドラッグで回転 · スクロールでズーム", navClick: "マーカーまたはリスト項目をクリックで地震詳細を表示", navDismiss: "マップの空白部分をクリックで詳細パネルを閉じる", tlTitle: "タイムライン", tlStart: "水色ハンドル — 表示範囲の開始", tlEnd: "赤色ハンドル — 現在時刻カーソル", tlPan: "ハイライト領域をドラッグして範囲を移動", tlPlay: "▶ 再生で時間を進める · 1×〜10× 速度 · ↺ リセットでデフォルトに戻す", sdTitle: "サイドバー", sdDesc: "統計サマリー、震度分布、並べ替え可能な地震リスト（時間順 / 震度順）。", vmTitle: "表示モード", vmDesc: "設定 ⚙ でリアル（フォトリアル）表示またはプレート境界線を切り替え", shTitle: "共有", shDesc: "共有アイコンをクリックして、カメラ位置・タイムライン範囲・設定を含むリンクをコピーできます。", engine: "エンジン", engineDesc: "Powered by Navara", close: "閉じる" },
      share: { title: "共有", desc: "以下のリンクをコピーして、カメラ位置・タイムライン範囲・設定を含む現在のビューを共有できます。", copy: "コピー", copied: "コピーしました" },
      loading: { text: "データ読み込み中…" },
    },
  },
};

const savedLang = typeof window !== "undefined" ? localStorage.getItem("lang") : null;

i18n.use(initReactI18next).init({
  resources,
  lng: savedLang || "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
