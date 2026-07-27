import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      app: { title: "Earthquake Pulse", subtitle: "Real-time Global Seismic Activity" },
      header: { plates: "Plates", realistic: "Realistic", settings: "Settings", autoRotate: "Auto-Rotate" },
      sidebar: { statistics: "Statistics", visible: "Visible", total: "Past 7d", range: "Range", avgMag: "Avg Mag", magBreakdown: "Magnitude Breakdown", quakeList: "Earthquake List", noData: "No earthquakes to display" },
      timeline: { current: "Current", visualFrom: "Visual from", events: "events", hrPerSec: "hr/s", reset24h: "Reset to last 24h" },
      detail: { depth: "Depth", time: "Time", lat: "Lat", lng: "Lng", unknown: "Unknown location" },
      info: { title: "About", data: "Data", dataDesc: "Real-time earthquake data from USGS. Magnitudes {{min}}+, past 7 days.", nav: "Navigation", navDrag: "Drag to rotate · Scroll to zoom", navClick: "Click marker or label for details", navDismiss: "Click empty space to dismiss", tlTitle: "Timeline", tlStart: "Cyan handle — range start", tlEnd: "Red handle — current time", tlPan: "Drag middle to pan", tlPlay: "Press Play to animate", vmTitle: "Visual Modes", vmDesc: "Toggle Realistic / Plates in Settings ⚙", close: "Close" },
    },
  },
  ja: {
    translation: {
      app: { title: "Earthquake Pulse", subtitle: "リアルタイム世界地震活動" },
      header: { plates: "プレート", realistic: "リアル", settings: "設定", autoRotate: "自動回転" },
      sidebar: { statistics: "統計", visible: "表示中", total: "過去7日", range: "震度範囲", avgMag: "平均震度", magBreakdown: "震度分布", quakeList: "地震リスト", noData: "表示する地震がありません" },
      timeline: { current: "現在", visualFrom: "表示開始", events: "件", hrPerSec: "時間/秒", reset24h: "24時間前へ" },
      detail: { depth: "深さ", time: "時刻", lat: "緯度", lng: "経度", unknown: "不明な場所" },
      info: { title: "説明", data: "データ", dataDesc: "USGS地震データ。震度{{min}}以上、過去7日間。", nav: "操作", navDrag: "ドラッグで回転 · スクロールでズーム", navClick: "マーカーまたはラベルをクリックで詳細", navDismiss: "空白をクリックで閉じる", tlTitle: "タイムライン", tlStart: "水色 — 開始時間", tlEnd: "赤色 — 現在時刻", tlPan: "中央をドラッグで移動", tlPlay: "再生で時間を進める", vmTitle: "表示モード", vmDesc: "設定 ⚙ でリアル / プレート切替", close: "閉じる" },
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
