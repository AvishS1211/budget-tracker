import { useState, useEffect, useCallback } from "react";

const CATEGORIES = [
  { name: "Food & Dining", icon: "🍽️", color: "#E8A87C" },
  { name: "Transport", icon: "🚗", color: "#85C1E9" },
  { name: "Shopping", icon: "🛍️", color: "#C39BD3" },
  { name: "Entertainment", icon: "🎬", color: "#82E0AA" },
  { name: "Health", icon: "💊", color: "#F1948A" },
  { name: "Housing", icon: "🏠", color: "#F7DC6F" },
  { name: "Education", icon: "📚", color: "#A9CCE3" },
  { name: "Other", icon: "📦", color: "#BFC9CA" },
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function ProgressBar({ value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const danger = pct > 90;
  return (
    <div style={{ background: "#1a1a2e", borderRadius: 99, height: 6, overflow: "hidden" }}>
      <div style={{
        width: `${pct}%`,
        height: "100%",
        background: danger ? "#FF6B6B" : color,
        borderRadius: 99,
        transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)",
        boxShadow: `0 0 8px ${danger ? "#FF6B6B" : color}88`
      }} />
    </div>
  );
}

export default function BudgetTracker() {
  const [expenses, setExpenses] = useState([]);
  const [budget, setBudget] = useState(30000);
  const [view, setView] = useState("dashboard"); // dashboard | add | ai | history
  const [form, setForm] = useState({ amount: "", category: "Food & Dining", note: "", date: new Date().toISOString().split("T")[0] });
  const [aiMessage, setAiMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [toast, setToast] = useState(null);
  const [editBudget, setEditBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(budget);
  const [storageReady, setStorageReady] = useState(false);

  // Load from storage (if available – e.g. in Cursor; no-op in normal browser)
  useEffect(() => {
    async function load() {
      try {
        if (!window.storage || typeof window.storage.get !== "function") {
          setStorageReady(true);
          return;
        }
        const r1 = await window.storage.get("budget-expenses");
        const r2 = await window.storage.get("budget-limit");
        if (r1) setExpenses(JSON.parse(r1.value));
        if (r2) setBudget(Number(r2.value));
      } catch {
        // Ignore storage errors and continue with in-memory state
      }
      setStorageReady(true);
    }
    load();
  }, []);

  // Save to storage (if available)
  useEffect(() => {
    if (!storageReady || !window.storage || typeof window.storage.set !== "function") return;
    window.storage.set("budget-expenses", JSON.stringify(expenses)).catch(() => {});
  }, [expenses, storageReady]);

  useEffect(() => {
    if (!storageReady || !window.storage || typeof window.storage.set !== "function") return;
    window.storage.set("budget-limit", String(budget)).catch(() => {});
  }, [budget, storageReady]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  const remaining = budget - totalSpent;
  const pct = budget > 0 ? Math.min((totalSpent / budget) * 100, 100) : 0;

  // Category breakdown
  const byCategory = CATEGORIES.map(cat => ({
    ...cat,
    total: expenses.filter(e => e.category === cat.name).reduce((s, e) => s + e.amount, 0)
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  // Recent (last 7 days)
  const recent = [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

  // Monthly trend
  const now = new Date();
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const label = MONTHS[d.getMonth()];
    const total = expenses.filter(e => {
      const ed = new Date(e.date);
      return ed.getMonth() === d.getMonth() && ed.getFullYear() === d.getFullYear();
    }).reduce((s, e) => s + e.amount, 0);
    return { label, total };
  });

  const maxMonth = Math.max(...monthlyData.map(m => m.total), 1);

  const addExpense = () => {
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      showToast("Please enter a valid amount", "error"); return;
    }
    const entry = { id: Date.now(), amount: Number(form.amount), category: form.category, note: form.note, date: form.date };
    setExpenses(prev => [...prev, entry]);
    setForm({ amount: "", category: "Food & Dining", note: "", date: new Date().toISOString().split("T")[0] });
    showToast("Expense added!");
    setView("dashboard");
  };

  const deleteExpense = (id) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
    showToast("Deleted", "info");
  };

  const askAI = async () => {
    if (!aiQuestion.trim()) return;
    setAiLoading(true);
    setAiMessage("");
    const summary = `Budget: ₹${budget}. Spent: ₹${totalSpent}. Remaining: ₹${remaining}.\nExpenses by category: ${byCategory.map(c => `${c.name}: ₹${c.total}`).join(", ")}.\nMonthly trend: ${monthlyData.map(m => `${m.label}: ₹${m.total}`).join(", ")}.\nTotal transactions: ${expenses.length}.`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `You are a friendly personal finance advisor. The user has shared their expense data. Give concise, actionable, warm advice. Use ₹ for currency. Keep responses under 200 words. Use bullet points when listing tips. Data: ${summary}`,
          messages: [{ role: "user", content: aiQuestion }]
        })
      });
      const data = await res.json();
      setAiMessage(data.content?.[0]?.text || "Sorry, I couldn't get a response.");
    } catch {
      setAiMessage("Network error. Please try again.");
    }
    setAiLoading(false);
  };

  const QUICK_QUESTIONS = [
    "Am I overspending?",
    "Where can I cut costs?",
    "How's my savings trend?",
    "Give me a budget plan"
  ];

  const dangerZone = pct >= 90;

  return (
    <div style={{ minHeight: "100vh", background: "#0D0D1A", fontFamily: "'DM Sans', sans-serif", color: "#E8E8F0", position: "relative", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Playfair+Display:wght@700&display=swap" rel="stylesheet" />

      {/* Background orbs */}
      <div style={{ position: "fixed", top: -100, right: -100, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, #2D1B6930 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: -150, left: -100, width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, #1B3A6940 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 999, background: toast.type === "error" ? "#FF6B6B22" : toast.type === "info" ? "#85C1E922" : "#82E0AA22", border: `1px solid ${toast.type === "error" ? "#FF6B6B" : toast.type === "info" ? "#85C1E9" : "#82E0AA"}44`, borderRadius: 12, padding: "12px 20px", color: toast.type === "error" ? "#FF6B6B" : toast.type === "info" ? "#85C1E9" : "#82E0AA", fontSize: 14, fontWeight: 500, backdropFilter: "blur(12px)", animation: "slideIn 0.3s ease" }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes slideIn { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 99px; }
        input, select, textarea { outline: none; }
        button { cursor: pointer; border: none; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "28px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 480, margin: "0 auto" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "#666", textTransform: "uppercase", marginBottom: 4 }}>Personal Finance</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700, color: "#fff" }}>Budget Tracker</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {editBudget ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input value={budgetInput} onChange={e => setBudgetInput(e.target.value)} style={{ width: 90, background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, padding: "6px 10px", color: "#fff", fontSize: 13 }} type="number" />
              <button onClick={() => { setBudget(Number(budgetInput)); setEditBudget(false); showToast("Budget updated!"); }} style={{ background: "#82E0AA22", border: "1px solid #82E0AA44", color: "#82E0AA", borderRadius: 8, padding: "6px 12px", fontSize: 12 }}>Save</button>
            </div>
          ) : (
            <button onClick={() => { setEditBudget(true); setBudgetInput(budget); }} style={{ background: "#ffffff0a", border: "1px solid #ffffff15", borderRadius: 10, padding: "8px 14px", color: "#aaa", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              ✏️ Budget
            </button>
          )}
        </div>
      </div>

      {/* Hero Card */}
      <div style={{ maxWidth: 480, margin: "20px auto 0", padding: "0 24px", animation: "fadeUp 0.5s ease" }}>
        <div style={{ background: dangerZone ? "linear-gradient(135deg, #2A0A0A, #1a0505)" : "linear-gradient(135deg, #141428, #1e1e3a)", borderRadius: 24, padding: "28px 28px 24px", border: `1px solid ${dangerZone ? "#FF6B6B33" : "#ffffff0f"}`, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: dangerZone ? "radial-gradient(circle, #FF6B6B15, transparent 70%)" : "radial-gradient(circle, #7B68EE15, transparent 70%)" }} />
          
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: "#666", letterSpacing: 1 }}>TOTAL SPENT</div>
            <div style={{ fontSize: 12, color: dangerZone ? "#FF6B6B" : "#666" }}>{pct.toFixed(0)}% of budget</div>
          </div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 38, fontWeight: 700, color: dangerZone ? "#FF6B6B" : "#fff", marginBottom: 4, letterSpacing: -1 }}>
            {formatCurrency(totalSpent)}
          </div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 20 }}>Budget: {formatCurrency(budget)} · Remaining: <span style={{ color: remaining < 0 ? "#FF6B6B" : "#82E0AA", fontWeight: 500 }}>{formatCurrency(remaining)}</span></div>

          <ProgressBar value={totalSpent} max={budget} color={dangerZone ? "#FF6B6B" : "#7B68EE"} />

          {dangerZone && <div style={{ marginTop: 14, fontSize: 12, color: "#FF6B6B", background: "#FF6B6B11", borderRadius: 8, padding: "8px 12px" }}>⚠️ You've used {pct.toFixed(0)}% of your budget. Consider cutting back!</div>}
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{ maxWidth: 480, margin: "16px auto 0", padding: "0 24px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {[
          { label: "Transactions", value: expenses.length, icon: "📋" },
          { label: "Avg/Day", value: formatCurrency(expenses.length ? totalSpent / Math.max(1, [...new Set(expenses.map(e => e.date))].length) : 0), icon: "📊" },
          { label: "Top Category", value: byCategory[0]?.name?.split(" ")[0] || "—", icon: byCategory[0]?.icon || "🔍" }
        ].map((s, i) => (
          <div key={i} style={{ background: "#13131f", borderRadius: 16, padding: "14px 12px", border: "1px solid #ffffff08", textAlign: "center", animation: `fadeUp ${0.4 + i * 0.1}s ease` }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#ddd", marginBottom: 2 }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Nav */}
      <div style={{ maxWidth: 480, margin: "20px auto 0", padding: "0 24px" }}>
        <div style={{ background: "#13131f", borderRadius: 16, padding: 4, display: "flex", border: "1px solid #ffffff08" }}>
          {[
            { id: "dashboard", label: "Overview", icon: "📊" },
            { id: "add", label: "Add", icon: "➕" },
            { id: "history", label: "History", icon: "📋" },
            { id: "ai", label: "AI", icon: "✨" }
          ].map(tab => (
            <button key={tab.id} onClick={() => setView(tab.id)} style={{ flex: 1, padding: "10px 4px", borderRadius: 12, background: view === tab.id ? "#7B68EE22" : "transparent", color: view === tab.id ? "#B8A9FF" : "#555", fontSize: 11, fontWeight: view === tab.id ? 600 : 400, transition: "all 0.2s", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: 16 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 480, margin: "16px auto 24px", padding: "0 24px" }}>

        {/* Dashboard */}
        {view === "dashboard" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            {/* Category Breakdown */}
            {byCategory.length > 0 ? (
              <div style={{ background: "#13131f", borderRadius: 20, padding: 20, border: "1px solid #ffffff08", marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>Category Breakdown</div>
                {byCategory.map((cat, i) => (
                  <div key={cat.name} style={{ marginBottom: 14, animation: `fadeUp ${0.3 + i * 0.08}s ease` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ fontSize: 13, color: "#ccc", display: "flex", alignItems: "center", gap: 8 }}>
                        <span>{cat.icon}</span> {cat.name}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: cat.color }}>{formatCurrency(cat.total)}</div>
                    </div>
                    <ProgressBar value={cat.total} max={totalSpent} color={cat.color} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: "#13131f", borderRadius: 20, padding: 32, border: "1px solid #ffffff08", textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>💸</div>
                <div style={{ color: "#555", fontSize: 14 }}>No expenses yet.<br />Tap <strong style={{ color: "#B8A9FF" }}>Add</strong> to get started!</div>
              </div>
            )}

            {/* Monthly Trend */}
            <div style={{ background: "#13131f", borderRadius: 20, padding: 20, border: "1px solid #ffffff08" }}>
              <div style={{ fontSize: 12, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>6-Month Trend</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80 }}>
                {monthlyData.map((m, i) => {
                  const h = maxMonth > 0 ? (m.total / maxMonth) * 70 : 0;
                  const isCurrent = i === 5;
                  return (
                    <div key={m.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <div style={{ width: "100%", height: `${h}px`, minHeight: 4, background: isCurrent ? "#7B68EE" : "#7B68EE44", borderRadius: "6px 6px 0 0", boxShadow: isCurrent ? "0 0 12px #7B68EE66" : "none", transition: "height 0.6s ease" }} />
                      <div style={{ fontSize: 9, color: isCurrent ? "#B8A9FF" : "#444", fontWeight: isCurrent ? 600 : 400 }}>{m.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Add Expense */}
        {view === "add" && (
          <div style={{ background: "#13131f", borderRadius: 20, padding: 24, border: "1px solid #ffffff08", animation: "fadeUp 0.4s ease" }}>
            <div style={{ fontSize: 12, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 20 }}>New Expense</div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 8, letterSpacing: 1 }}>AMOUNT (₹)</div>
              <input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" type="number" style={{ width: "100%", background: "#0d0d1a", border: "1px solid #2a2a40", borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 28, fontFamily: "'Playfair Display', serif", fontWeight: 700, letterSpacing: -1 }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 8, letterSpacing: 1 }}>CATEGORY</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {CATEGORIES.map(cat => (
                  <button key={cat.name} onClick={() => setForm(f => ({ ...f, category: cat.name }))} style={{ padding: "10px 12px", borderRadius: 12, background: form.category === cat.name ? `${cat.color}22` : "#0d0d1a", border: `1px solid ${form.category === cat.name ? cat.color + "66" : "#2a2a40"}`, color: form.category === cat.name ? cat.color : "#666", fontSize: 12, display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s" }}>
                    <span>{cat.icon}</span> {cat.name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 8, letterSpacing: 1 }}>NOTE (OPTIONAL)</div>
              <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="What did you spend on?" style={{ width: "100%", background: "#0d0d1a", border: "1px solid #2a2a40", borderRadius: 12, padding: "12px 16px", color: "#fff", fontSize: 14 }} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 8, letterSpacing: 1 }}>DATE</div>
              <input value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} type="date" style={{ width: "100%", background: "#0d0d1a", border: "1px solid #2a2a40", borderRadius: 12, padding: "12px 16px", color: "#fff", fontSize: 14 }} />
            </div>

            <button onClick={addExpense} style={{ width: "100%", padding: "16px", borderRadius: 16, background: "linear-gradient(135deg, #7B68EE, #5A4FCF)", color: "#fff", fontSize: 15, fontWeight: 600, letterSpacing: 0.5, boxShadow: "0 8px 24px #7B68EE44", transition: "transform 0.2s, box-shadow 0.2s" }}
              onMouseEnter={e => { e.target.style.transform = "translateY(-2px)"; e.target.style.boxShadow = "0 12px 32px #7B68EE55"; }}
              onMouseLeave={e => { e.target.style.transform = ""; e.target.style.boxShadow = "0 8px 24px #7B68EE44"; }}>
              Add Expense
            </button>
          </div>
        )}

        {/* History */}
        {view === "history" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            {recent.length === 0 ? (
              <div style={{ background: "#13131f", borderRadius: 20, padding: 40, border: "1px solid #ffffff08", textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <div style={{ color: "#555", fontSize: 14 }}>No transactions yet</div>
              </div>
            ) : (
              <div style={{ background: "#13131f", borderRadius: 20, padding: 20, border: "1px solid #ffffff08" }}>
                <div style={{ fontSize: 12, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>Recent Transactions</div>
                {recent.map((exp, i) => {
                  const cat = CATEGORIES.find(c => c.name === exp.category) || CATEGORIES[7];
                  return (
                    <div key={exp.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < recent.length - 1 ? "1px solid #ffffff08" : "none", animation: `fadeUp ${0.3 + i * 0.05}s ease` }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: `${cat.color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{cat.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: "#ddd", fontWeight: 500 }}>{exp.note || exp.category}</div>
                        <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{exp.category} · {formatDate(exp.date)}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: cat.color }}>–{formatCurrency(exp.amount)}</div>
                        <button onClick={() => deleteExpense(exp.id)} style={{ background: "#FF6B6B15", border: "1px solid #FF6B6B22", borderRadius: 8, color: "#FF6B6B", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* AI Advisor */}
        {view === "ai" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ background: "linear-gradient(135deg, #141428, #1e1a3a)", borderRadius: 20, padding: 20, border: "1px solid #7B68EE22", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 20 }}>✨</span>
                <div style={{ fontSize: 12, color: "#B8A9FF", letterSpacing: 2, textTransform: "uppercase" }}>AI Finance Advisor</div>
              </div>
              <div style={{ fontSize: 13, color: "#666" }}>Powered by Claude · Ask anything about your spending</div>
            </div>

            {/* Quick Questions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {QUICK_QUESTIONS.map(q => (
                <button key={q} onClick={() => setAiQuestion(q)} style={{ background: "#13131f", border: `1px solid ${aiQuestion === q ? "#7B68EE44" : "#ffffff08"}`, borderRadius: 12, padding: "12px 14px", color: aiQuestion === q ? "#B8A9FF" : "#666", fontSize: 12, textAlign: "left", transition: "all 0.2s" }}>
                  {q}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <input value={aiQuestion} onChange={e => setAiQuestion(e.target.value)} onKeyDown={e => e.key === "Enter" && askAI()} placeholder="Ask about your finances..." style={{ flex: 1, background: "#13131f", border: "1px solid #2a2a40", borderRadius: 12, padding: "12px 16px", color: "#fff", fontSize: 13 }} />
              <button onClick={askAI} disabled={aiLoading} style={{ background: aiLoading ? "#333" : "linear-gradient(135deg, #7B68EE, #5A4FCF)", border: "none", borderRadius: 12, padding: "12px 18px", color: "#fff", fontSize: 18, boxShadow: aiLoading ? "none" : "0 4px 16px #7B68EE44", transition: "all 0.2s" }}>
                {aiLoading ? "⏳" : "→"}
              </button>
            </div>

            {aiLoading && (
              <div style={{ background: "#13131f", borderRadius: 16, padding: 20, border: "1px solid #7B68EE22", textAlign: "center" }}>
                <div style={{ color: "#7B68EE", fontSize: 13 }}>Analyzing your finances...</div>
              </div>
            )}

            {aiMessage && !aiLoading && (
              <div style={{ background: "#13131f", borderRadius: 16, padding: 20, border: "1px solid #7B68EE22", animation: "fadeUp 0.4s ease" }}>
                <div style={{ fontSize: 11, color: "#7B68EE", letterSpacing: 2, marginBottom: 12 }}>✨ AI INSIGHT</div>
                <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{aiMessage}</div>
              </div>
            )}

            {!aiMessage && !aiLoading && expenses.length === 0 && (
              <div style={{ background: "#13131f", borderRadius: 16, padding: 20, border: "1px solid #ffffff08", textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
                <div style={{ color: "#555", fontSize: 13 }}>Add some expenses first, then ask me anything about your spending habits!</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
