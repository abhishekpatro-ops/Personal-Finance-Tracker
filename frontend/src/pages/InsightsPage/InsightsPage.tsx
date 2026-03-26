import "./InsightsPage.css";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../services/api";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type HealthScoreResponse = {
  score: number;
  breakdown: {
    savingsRateScore: number;
    expenseStabilityScore: number;
    budgetAdherenceScore: number;
    cashBufferScore: number;
  };
  suggestions: string[];
};

type InsightFinding = {
  key: string;
  title: string;
  valueText: string;
  changePercent?: number | null;
  tone: "positive" | "negative" | "neutral" | string;
  description: string;
};

type InsightsResponse = {
  highlights: string[];
  findings: InsightFinding[];
};

type NetWorthResponse = {
  currentNetWorth: number;
  points: Array<{
    year: number;
    month: number;
    netWorth: number;
  }>;
};

type TrendPoint = {
  year: number;
  month: number;
  type: "income" | "expense" | string;
  total: number;
};

const HIDE_AMOUNTS_KEY = "insights_hide_amounts";
const AMOUNT_MASK = "******";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value ?? 0);
}

function monthLabel(year: number, month: number) {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleString("en-IN", { month: "short" });
}

function getTrendRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10)
  };
}

async function fetchHealthScore() {
  const { data } = await api.get<HealthScoreResponse>("/insights/health-score");
  return data;
}

async function fetchInsights() {
  const { data } = await api.get<InsightsResponse>("/insights");
  return data;
}

async function fetchNetWorth() {
  const { data } = await api.get<NetWorthResponse>("/reports/net-worth?months=6");
  return data;
}

async function fetchTrends() {
  const range = getTrendRange();
  const { data } = await api.get<TrendPoint[]>(`/reports/trends?from=${range.from}&to=${range.to}`);
  return data;
}

export function InsightsPage() {
  const [hideAmounts, setHideAmounts] = useState<boolean>(() => {
    const saved = localStorage.getItem(HIDE_AMOUNTS_KEY);
    return saved === "true";
  });

  useEffect(() => {
    localStorage.setItem(HIDE_AMOUNTS_KEY, hideAmounts ? "true" : "false");
  }, [hideAmounts]);

  const healthQuery = useQuery({ queryKey: ["health-score"], queryFn: fetchHealthScore });
  const insightsQuery = useQuery({ queryKey: ["insights-highlights"], queryFn: fetchInsights });
  const netWorthQuery = useQuery({ queryKey: ["net-worth"], queryFn: fetchNetWorth });
  const trendQuery = useQuery({ queryKey: ["insight-trends"], queryFn: fetchTrends });

  const trendData = useMemo(() => {
    const map = new Map<string, { label: string; income: number; expense: number }>();
    for (const row of trendQuery.data ?? []) {
      const key = `${row.year}-${row.month}`;
      if (!map.has(key)) {
        map.set(key, { label: `${monthLabel(row.year, row.month)} ${String(row.year).slice(-2)}`, income: 0, expense: 0 });
      }
      const current = map.get(key)!;
      if (row.type === "income") current.income = Number(row.total);
      if (row.type === "expense") current.expense = Number(row.total);
    }
    return Array.from(map.values());
  }, [trendQuery.data]);

  const netWorthData = useMemo(
    () => (netWorthQuery.data?.points ?? []).map((point) => ({
      label: `${monthLabel(point.year, point.month)} ${String(point.year).slice(-2)}`,
      value: Number(point.netWorth)
    })),
    [netWorthQuery.data]
  );

  const breakdown = healthQuery.data?.breakdown;

  return (
    <section className="insights-page">
      <div className="section-head">
        <h2>Insights</h2>
      </div>

      <div className="cards insights-kpi-grid">
        <article className="card insights-score-card">
          <h3>Financial Health Score</h3>
          <p className="insights-score-value">{healthQuery.data?.score ?? "--"}<span>/100</span></p>
          <p className="hint-text">Weighted using savings rate, expense stability, budget adherence, and cash buffer.</p>
        </article>

        <article className="card insights-networth-card">
          <h3>Current Net Worth</h3>
          <div className="insights-balance-row">
            <p className="insights-networth-value">Balance: {hideAmounts ? AMOUNT_MASK : formatCurrency(Number(netWorthQuery.data?.currentNetWorth ?? 0))}</p>
            <button
              type="button"
              className="ghost insights-hide-toggle"
              onClick={() => setHideAmounts((prev) => !prev)}
              aria-pressed={hideAmounts}
            >
              {hideAmounts ? "Show" : "Hide"}
            </button>
          </div>
          <p className="hint-text">Combined balance across your accessible accounts.</p>
        </article>
      </div>

      <article className="card">
        <h3>Key Findings</h3>
        <div className="insights-findings-grid">
          {(insightsQuery.data?.findings ?? []).map((finding) => (
            <div key={finding.key} className="insights-finding-card">
              <p className="insights-finding-title">{finding.title}</p>
              <p className="insights-finding-value">{hideAmounts ? AMOUNT_MASK : finding.valueText}</p>
              <p className={`insights-finding-change insights-tone-${finding.tone}`}>
                {finding.changePercent == null ? "--" : `${finding.changePercent >= 0 ? "+" : ""}${finding.changePercent.toFixed(1)}%`}
              </p>
              <p className="insights-finding-desc">{finding.description}</p>
            </div>
          ))}
          {(insightsQuery.data?.findings ?? []).length === 0 ? <p className="hint-text">No findings available yet.</p> : null}
        </div>
      </article>

      <article className="card">
        <h3>Score Breakdown</h3>
        {breakdown ? (
          <div className="insights-breakdown-grid">
            <div><p>Savings Rate</p><strong>{breakdown.savingsRateScore.toFixed(1)}</strong></div>
            <div><p>Expense Stability</p><strong>{breakdown.expenseStabilityScore.toFixed(1)}</strong></div>
            <div><p>Budget Adherence</p><strong>{breakdown.budgetAdherenceScore.toFixed(1)}</strong></div>
            <div><p>Cash Buffer</p><strong>{breakdown.cashBufferScore.toFixed(1)}</strong></div>
          </div>
        ) : <p className="hint-text">Loading score breakdown...</p>}
      </article>

      <article className="card">
        <h3>Recommendations</h3>
        <ul className="insights-list">
          {(healthQuery.data?.suggestions ?? []).map((text, index) => <li key={`suggestion-${index}`}>{text}</li>)}
        </ul>
      </article>

      <article className="card">
        <h3>Highlights</h3>
        <ul className="insights-list">
          {(insightsQuery.data?.highlights ?? []).map((text, index) => <li key={`highlight-${index}`}>{text}</li>)}
        </ul>
      </article>

      <div className="insights-chart-grid">
        <article className="card">
          <h3>Income vs Expense Trend</h3>
          {trendData.length === 0 ? <p className="hint-text">No trend data available.</p> : (
            <div className="insights-chart-wrap">
              <ResponsiveContainer width="100%" height={270}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(value) => (hideAmounts ? "���" : String(value))} />
                  <Tooltip formatter={(value) => (hideAmounts ? AMOUNT_MASK : formatCurrency(Number(value)))} />
                  <Legend />
                  <Line dataKey="income" type="monotone" stroke="#16a34a" strokeWidth={2.5} />
                  <Line dataKey="expense" type="monotone" stroke="#dc2626" strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="card">
          <h3>Net Worth Tracking</h3>
          {netWorthData.length === 0 ? <p className="hint-text">No net worth data available.</p> : (
            <div className="insights-chart-wrap">
              <ResponsiveContainer width="100%" height={270}>
                <LineChart data={netWorthData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(value) => (hideAmounts ? "���" : String(value))} />
                  <Tooltip formatter={(value) => (hideAmounts ? AMOUNT_MASK : formatCurrency(Number(value)))} />
                  <Line dataKey="value" type="monotone" stroke="#2563eb" strokeWidth={2.8} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}



