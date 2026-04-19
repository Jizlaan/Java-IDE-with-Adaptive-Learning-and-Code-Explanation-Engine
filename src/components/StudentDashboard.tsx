"use client";
import { useEffect, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────
interface ErrorEntry {
  message: string;
  timestamp: string;
  count: number;
}

interface SmellEntry {
  name: string;
  count: number;
}

interface DashboardData {
  streakDays: boolean[];       // last 14 days — true = coded that day
  currentStreak: number;
  bestStreak: number;
  errorsFixed: number;
  smellsFound: number;
  errorHistory: ErrorEntry[];
  smellHistory: SmellEntry[];
  badges: string[];            // list of earned badge names
}

// ── Storage helpers ──────────────────────────────────────────────────────────
const STORAGE_KEY = "javaMentorDashboard";

function loadData(): DashboardData {
  if (typeof window === "undefined") {
    return {
      streakDays:    Array(14).fill(false),
      currentStreak: 0,
      bestStreak:    0,
      errorsFixed:   0,
      smellsFound:   0,
      errorHistory:  [],
      smellHistory:  [],
      badges:        [],
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    streakDays:    Array(14).fill(false),
    currentStreak: 0,
    bestStreak:    0,
    errorsFixed:   0,
    smellsFound:   0,
    errorHistory:  [],
    smellHistory:  [],
    badges:        [],
  };
}

function saveData(data: DashboardData) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}

// Call this whenever the student fixes an error (pass in error message + smells)
export function recordSession(errorMsg: string, smells: string[]) {
  if (typeof window === "undefined") return;

  const data = loadData();
  const today = new Date().toDateString();

  // Update streak
  const lastKey = "javaMentorLastDay";
  const lastDay = localStorage.getItem(lastKey) || "";
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (lastDay === today) {
    // same day — no change
  } else if (lastDay === yesterday) {
    data.currentStreak += 1;
  } else {
    data.currentStreak = 1;
  }
  localStorage.setItem(lastKey, today);

  // Shift streak days array (index 13 = today)
  if (lastDay !== today) {
    data.streakDays = [...data.streakDays.slice(1), true];
  }

  data.bestStreak  = Math.max(data.bestStreak, data.currentStreak);
  data.errorsFixed += 1;
  data.smellsFound += smells.length;

  // Add to error history (cap at 20)
  const existing = data.errorHistory.find(e => e.message === errorMsg);
  if (existing) {
    existing.count += 1;
    existing.timestamp = new Date().toLocaleString();
  } else {
    data.errorHistory.unshift({
      message:   errorMsg,
      timestamp: new Date().toLocaleString(),
      count:     1,
    });
    if (data.errorHistory.length > 20) data.errorHistory.pop();
  }

  // Update smell history
  smells.forEach(smell => {
    const ex = data.smellHistory.find(s => s.name === smell);
    if (ex) ex.count += 1;
    else data.smellHistory.push({ name: smell, count: 1 });
  });
  data.smellHistory.sort((a, b) => b.count - a.count);

  // Check badges
  const earned = new Set(data.badges);
  if (data.errorsFixed >= 1)  earned.add("First fix");
  if (data.currentStreak >= 3) earned.add("3-day streak");
  if (data.smellsFound >= 5)  earned.add("Smell hunter");
  if (data.currentStreak >= 7) earned.add("Week warrior");
  if (data.errorsFixed >= 25) earned.add("Bug slayer");
  if (data.currentStreak >= 30) earned.add("30-day legend");
  data.badges = Array.from(earned);

  saveData(data);
}

// ── Badge definitions ────────────────────────────────────────────────────────
const ALL_BADGES = [
  { name: "First fix",     desc: "Fixed your first error",    icon: "♟" },
  { name: "3-day streak",  desc: "Coded 3 days in a row",     icon: "♞" },
  { name: "Smell hunter",  desc: "Detected 5 code smells",    icon: "♝" },
  { name: "Week warrior",  desc: "7-day streak achieved",     icon: "♜" },
  { name: "Clean coder",   desc: "0 smells in a session",     icon: "♙" },
  { name: "Bug slayer",    desc: "Fixed 25 errors",           icon: "♛" },
  { name: "Refactor pro",  desc: "Fixed 5 smell patterns",    icon: "♖" },
  { name: "30-day legend", desc: "Reached a 30-day streak",   icon: "♚" },
];

const SMELL_COLORS: Record<string, string> = {
  "Long Method":   "#E24B4A",
  "God Class":     "#EF9F27",
  "Feature Envy":  "#378ADD",
  "Feature Envy (Zenodo)": "#7F77DD",
  "God Class (Zenodo)":    "#1D9E75",
};

const DAYS = ["M","T","W","T","F","S","S"];

// ── Dashboard Modal Component ────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
  studentName?: string;
}

type Tab = "streak" | "smells" | "errors" | "badges";

export default function StudentDashboard({ open, onClose, studentName = "Student" }: Props) {
  const [data, setData] = useState<DashboardData>(loadData());
  const [tab, setTab]   = useState<Tab>("streak");

  useEffect(() => {
    if (open) setData(loadData());
  }, [open]);

  if (!open) return null;

  const initials = studentName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const maxSmell = Math.max(...data.smellHistory.map(s => s.count), 1);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: "16px",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#161616", border: "0.5px solid #333333",
        borderRadius: "12px", width: "100%", maxWidth: "600px",
        maxHeight: "90vh", overflowY: "auto", fontFamily: "sans-serif",
        color: "#E0E0E0", boxShadow: "0 10px 30px rgba(0,0,0,0.5)"
      }}>

        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "0.5px solid #333333",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "#1A1A1A", display: "flex", alignItems: "center", border: "0.5px solid #333333",
              justifyContent: "center", fontWeight: 500, fontSize: 13, color: "#4DAAFB",
            }}>{initials}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "#E0E0E0" }}>Student dashboard</div>
              <div style={{ fontSize: 12, color: "#A0A0A0", marginTop: 2 }}>{studentName} — Java IDE adaptive learning</div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 18,
            cursor: "pointer", color: "#A0A0A0", lineHeight: 1,
          }}>✕</button>
        </div>

        <div style={{ padding: "16px 20px" }}>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Current streak", value: data.currentStreak, sub: "days coding", color: "#85a663" },
              { label: "Errors fixed",   value: data.errorsFixed,   sub: "this month", color: "#E0E0E0" },
              { label: "Smells found",   value: data.smellsFound,   sub: "by ML model", color: "#E0E0E0" },
              { label: "Badges earned",  value: data.badges.length, sub: `of ${ALL_BADGES.length} total`, color: "#cca65a" },
            ].map(s => (
              <div key={s.label} style={{
                background: "#222222", border: "0.5px solid #333333", borderRadius: 8, padding: "10px 12px",
              }}>
                <div style={{ fontSize: 11, color: "#A0A0A0", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 500, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "#888888", marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
            {(["streak","smells","errors","badges"] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                fontSize: 12, padding: "5px 12px", borderRadius: 8, cursor: "pointer",
                border: "0.5px solid",
                borderColor: tab === t ? "#555555" : "transparent",
                background: tab === t ? "#2A2A2A" : "none",
                fontWeight: tab === t ? 500 : 400,
                color: tab === t ? "#E0E0E0" : "#A0A0A0",
              }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
            ))}
          </div>

          {/* Tab: Streak */}
          {tab === "streak" && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: "#888888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Last 14 days</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 }}>
                {data.streakDays.map((active, i) => (
                  <div key={i} style={{
                    width: 30, height: 30, borderRadius: 6, display: "flex",
                    alignItems: "center", justifyContent: "center",
                    fontSize: 10, flexDirection: "column", gap: 1,
                    background: i === 13 ? "#599e5e" : active ? "#2D4A22" : "transparent",
                    border: `0.5px solid ${i === 13 ? "#599e5e" : active ? "#3B6D11" : "#333333"}`,
                    color: i === 13 ? "#fff" : active ? "#AEE57F" : "#555555",
                  }}>
                    <span style={{ fontSize: 8, fontWeight: 500 }}>{DAYS[i % 7]}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "#A0A0A0", marginBottom: 16 }}>
                {data.currentStreak > 0
                  ? <>You have a <span style={{ color: "#85a663", fontWeight: 500 }}>{data.currentStreak}-day streak</span>. Keep coding to keep it going!</>
                  : "Start coding today to begin your streak!"}
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: "#888888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Best streak</div>
              <div style={{ fontSize: 13, color: "#E0E0E0", fontWeight: 500, marginBottom: 2 }}>{data.bestStreak} days</div>
            </div>
          )}

          {/* Tab: Smells */}
          {tab === "smells" && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: "#888888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Most detected smells</div>
              {data.smellHistory.length === 0 && (
                <div style={{ fontSize: 12, color: "#888888" }}>No smells detected yet. Run some code to get started.</div>
              )}
              {data.smellHistory.slice(0, 6).map(s => (
                <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 12, width: 150, color: "#E0E0E0", flexShrink: 0 }}>{s.name}</div>
                  <div style={{ flex: 1, background: "#2A2A2A", borderRadius: 99, height: 6, overflow: "hidden" }}>
                    <div style={{ width: `${Math.round(s.count / maxSmell * 100)}%`, height: "100%", borderRadius: 99, background: SMELL_COLORS[s.name] ?? "#378ADD" }} />
                  </div>
                  <div style={{ fontSize: 11, color: "#A0A0A0", width: 28, textAlign: "right" }}>{s.count}x</div>
                </div>
              ))}
            </div>
          )}

          {/* Tab: Errors */}
          {tab === "errors" && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: "#888888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Recent errors</div>
              {data.errorHistory.length === 0 && (
                <div style={{ fontSize: 12, color: "#888888" }}>No errors recorded yet.</div>
              )}
              {data.errorHistory.slice(0, 8).map((e, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "8px 0", borderBottom: "0.5px solid #333333",
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#E24B4A", flexShrink: 0, marginTop: 3 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "#E0E0E0", fontFamily: "monospace" }}>{e.message}</div>
                    <div style={{ fontSize: 10, color: "#888888", marginTop: 2 }}>{e.timestamp}</div>
                  </div>
                  <div style={{
                    fontSize: 10, background: "#222222", border: "0.5px solid #333333", borderRadius: 99,
                    padding: "1px 7px", color: "#A0A0A0", whiteSpace: "nowrap",
                  }}>{e.count}x</div>
                </div>
              ))}
            </div>
          )}

          {/* Tab: Badges */}
          {tab === "badges" && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: "#888888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Your badges</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
                {ALL_BADGES.map(b => {
                  const earned = data.badges.includes(b.name);
                  return (
                    <div key={b.name} style={{
                      border: "0.5px solid #333333", background: earned ? "#222222" : "transparent", borderRadius: 8, padding: "10px 8px",
                      textAlign: "center", opacity: earned ? 1 : 0.4,
                      filter: earned ? "none" : "grayscale(1)",
                    }}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>{b.icon}</div>
                      <div style={{ fontSize: 10, color: "#E0E0E0", fontWeight: 500 }}>{b.name}</div>
                      <div style={{ fontSize: 9, color: "#888888", marginTop: 2 }}>{b.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
