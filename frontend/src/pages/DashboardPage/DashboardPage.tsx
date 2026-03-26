import "./DashboardPage.css";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AddTransactionModal } from "../../components/AddTransactionModal";
import { api } from "../../services/api";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type DashboardSummary = {
  income: number;
  expense: number;
  net: number;
  recentTransactions: Transaction[];
  upcomingRecurringPayments: RecurringItem[];
};

type Transaction = {
  id: string;
  categoryId?: string | null;
  type: "income" | "expense" | string;
  amount: number;
  transactionDate: string;
  merchant?: string | null;
};

type RecurringItem = {
  id: string;
  title: string;
  amount: number;
  nextRunDate: string;
};

type Category = {
  id: string;
  name: string;
};

type Budget = {
  id: string;
  categoryId: string;
  amount: number;
};

type CategorySpendPoint = {
  categoryId?: string | null;
  total: number;
};

type IncomeExpensePoint = {
  year: number;
  month: number;
  type: "income" | "expense" | string;
  total: number;
};

type MonthlyForecast = {
  currentBalance: number;
  forecastedBalance: number;
  knownUpcomingExpenses: number;
  safeToSpend: number;
  riskWarnings: string[];
};

type DailyForecast = {
  points: Array<{
    date: string;
    projectedBalance: number;
  }>;
};

type HealthScoreResponse = {
  score: number;
};

const PIE_COLORS = ["#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#ec4899", "#14b8a6", "#3b82f6"];

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start, end };
}

function getTrendRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from, to };
}

function toDateParam(value: Date) {
  return value.toISOString().split("T")[0];
}

function monthLabel(year: number, month: number) {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleString("en-IN", { month: "short" });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value ?? 0);
}

function toDateDisplay(value: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-IN");
}

function tooltipCurrencyFormatter(value: number | string | ReadonlyArray<number | string> | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const numeric = Number(raw ?? 0);
  return formatCurrency(Number.isFinite(numeric) ? numeric : 0);
}

async function fetchSummary() {
  const { data } = await api.get<DashboardSummary>("/dashboard/summary");
  return data;
}

async function fetchCategories() {
  const { data } = await api.get<Category[]>("/categories");
  return data;
}

async function fetchTransactions() {
  const { data } = await api.get<Transaction[]>("/transactions");
  return data;
}

async function fetchBudgets(month: number, year: number) {
  const { data } = await api.get<Budget[]>(`/budgets?month=${month}&year=${year}`);
  return data;
}

async function fetchCategorySpend(from: string, to: string) {
  const { data } = await api.get<CategorySpendPoint[]>(`/reports/category-spend?from=${from}&to=${to}`);
  return data;
}

async function fetchIncomeExpenseTrend(from: string, to: string) {
  const { data } = await api.get<IncomeExpensePoint[]>(`/reports/income-vs-expense?from=${from}&to=${to}`);
  return data;
}

async function fetchMonthlyForecast() {
  const { data } = await api.get<MonthlyForecast>("/forecast/month");
  return data;
}

async function fetchDailyForecast() {
  const { data } = await api.get<DailyForecast>("/forecast/daily");
  return data;
}

async function fetchHealthScore() {
  const { data } = await api.get<HealthScoreResponse>("/insights/health-score");
  return data;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [isAddOpen, setIsAddOpen] = useState(false);

  const { start, end } = getMonthRange();
  const { from, to } = getTrendRange();
  const month = start.getMonth() + 1;
  const year = start.getFullYear();

  const summaryQuery = useQuery({ queryKey: ["dashboard-summary"], queryFn: fetchSummary });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const transactionsQuery = useQuery({ queryKey: ["transactions"], queryFn: fetchTransactions });
  const budgetsQuery = useQuery({ queryKey: ["budgets", month, year], queryFn: () => fetchBudgets(month, year) });
  const categorySpendQuery = useQuery({
    queryKey: ["reports", "category-spend", toDateParam(start), toDateParam(end)],
    queryFn: () => fetchCategorySpend(toDateParam(start), toDateParam(end))
  });
  const trendQuery = useQuery({
    queryKey: ["reports", "income-vs-expense", toDateParam(from), toDateParam(to)],
    queryFn: () => fetchIncomeExpenseTrend(toDateParam(from), toDateParam(to))
  });
  const monthlyForecastQuery = useQuery({ queryKey: ["forecast", "month"], queryFn: fetchMonthlyForecast });
  const dailyForecastQuery = useQuery({ queryKey: ["forecast", "daily"], queryFn: fetchDailyForecast });
  const healthScoreQuery = useQuery({ queryKey: ["health-score"], queryFn: fetchHealthScore });

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categoriesQuery.data ?? []) {
      map.set(category.id, category.name);
    }
    return map;
  }, [categoriesQuery.data]);

  const monthlyExpenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of transactionsQuery.data ?? []) {
      const txDate = new Date(tx.transactionDate);
      if (tx.type !== "expense") continue;
      if (txDate.getMonth() !== start.getMonth() || txDate.getFullYear() !== start.getFullYear()) continue;
      if (!tx.categoryId) continue;
      map.set(tx.categoryId, (map.get(tx.categoryId) ?? 0) + Number(tx.amount));
    }
    return map;
  }, [transactionsQuery.data, start]);

  const budgetProgress = useMemo(() => {
    return (budgetsQuery.data ?? []).map((budget) => {
      const spent = monthlyExpenseByCategory.get(budget.categoryId) ?? 0;
      const percentage = budget.amount > 0 ? Math.min(100, (spent / Number(budget.amount)) * 100) : 0;
      return {
        id: budget.id,
        categoryName: categoryNameById.get(budget.categoryId) ?? "Unknown Category",
        limit: Number(budget.amount),
        spent,
        remaining: Number(budget.amount) - spent,
        percentage
      };
    });
  }, [budgetsQuery.data, monthlyExpenseByCategory, categoryNameById]);

  const categorySpendChartData = useMemo(() => {
    return (categorySpendQuery.data ?? []).map((item) => ({
      name: item.categoryId ? (categoryNameById.get(item.categoryId) ?? "Uncategorized") : "Uncategorized",
      value: Number(item.total)
    }));
  }, [categorySpendQuery.data, categoryNameById]);

  const trendChartData = useMemo(() => {
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

  return (
    <section className="dashboard-page">
      <h2>Dashboard</h2>

      <article className="card dashboard-actions-card">
        <div className="dashboard-actions-head">
          <h3>Quick Actions</h3>
          <p>Complete your main finance tasks without switching context.</p>
        </div>
        <div className="dashboard-actions-grid">
          <button type="button" className="dashboard-quick-btn dashboard-quick-primary" onClick={() => setIsAddOpen(true)}>Add Transaction</button>
          <button type="button" className="dashboard-quick-btn" onClick={() => navigate("/transactions")}>View All Transactions</button>
          <button type="button" className="dashboard-quick-btn" onClick={() => navigate("/budgets")}>Create Budget</button>
          <button type="button" className="dashboard-quick-btn" onClick={() => navigate("/rules")}>Manage Rules</button>
          <button type="button" className="dashboard-quick-btn" onClick={() => navigate("/insights")}>Open Insights</button>
        </div>
      </article>

      <div className="cards">
        <article className="card"><h3>Current Month Income</h3><p className="dashboard-kpi-value dashboard-kpi-income">{formatCurrency(Number(summaryQuery.data?.income ?? 0))}</p></article>
        <article className="card"><h3>Current Month Expense</h3><p className="dashboard-kpi-value dashboard-kpi-expense">{formatCurrency(Number(summaryQuery.data?.expense ?? 0))}</p></article>
        <article className="card"><h3>Net Balance</h3><p className={`dashboard-kpi-value ${Number(summaryQuery.data?.net ?? 0) >= 0 ? "dashboard-kpi-income" : "dashboard-kpi-expense"}`}>{formatCurrency(Number(summaryQuery.data?.net ?? 0))}</p></article>
        <article className="card"><h3>Financial Health Score</h3><p className="dashboard-kpi-value">{healthScoreQuery.data?.score ?? "--"}/100</p></article>
      </div>

      <article className="card">
        <h3>Cash Flow Forecast</h3>
        {dailyForecastQuery.data?.points?.length ? (
          <div className="dashboard-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={dailyForecastQuery.data.points}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={tooltipCurrencyFormatter} />
                <Line dataKey="projectedBalance" type="monotone" stroke="#2563eb" strokeWidth={2.6} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <p className="hint-text">Safe to spend: {formatCurrency(Number(monthlyForecastQuery.data?.safeToSpend ?? 0))}</p>
            {monthlyForecastQuery.data?.riskWarnings?.length ? <p className="error-text">{monthlyForecastQuery.data.riskWarnings.join(" ")}</p> : null}
          </div>
        ) : <p className="hint-text">No forecast data available yet.</p>}
      </article>

      <article className="card">
        <h3>Budget Progress</h3>
        {budgetProgress.length === 0 ? <p className="hint-text">No budget configured for this month yet.</p> : (
          <div className="dashboard-budget-grid">
            {budgetProgress.map((item) => (
              <article key={item.id} className="dashboard-budget-card">
                <p className="dashboard-budget-title">{item.categoryName}</p>
                <p className="dashboard-budget-meta">{formatCurrency(item.spent)} of {formatCurrency(item.limit)}</p>
                <div className="dashboard-progress-track">
                  <div className="dashboard-progress-bar" style={{ width: `${item.percentage}%` }} />
                </div>
                <p className={`dashboard-budget-remaining ${item.remaining < 0 ? "over" : "ok"}`}>
                  {item.remaining < 0 ? `${formatCurrency(Math.abs(item.remaining))} over` : `${formatCurrency(item.remaining)} left`}
                </p>
              </article>
            ))}
          </div>
        )}
      </article>

      <div className="dashboard-chart-grid">
        <article className="card dashboard-chart-card">
          <h3>Spending by Category (This Month)</h3>
          {categorySpendChartData.length === 0 ? <p className="hint-text">No expense data available for this month.</p> : (
            <div className="dashboard-chart-wrap">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={categorySpendChartData} dataKey="value" nameKey="name" outerRadius={95} innerRadius={40}>
                    {categorySpendChartData.map((entry, index) => (
                      <Cell key={`${entry.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={tooltipCurrencyFormatter} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="card dashboard-chart-card">
          <h3>Income vs Expense Trend (Last 6 Months)</h3>
          {trendChartData.length === 0 ? <p className="hint-text">No trend data available yet.</p> : (
            <div className="dashboard-chart-wrap">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={trendChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip formatter={tooltipCurrencyFormatter} />
                  <Legend />
                  <Bar dataKey="income" fill="#16a34a" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expense" fill="#dc2626" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>
      </div>

      <div className="dashboard-bottom-grid">
        <article className="card">
          <div className="dashboard-recent-head">
            <h3>Recent Transactions</h3>
            <button type="button" className="dashboard-link-btn" onClick={() => navigate("/transactions")}>View all</button>
          </div>
          {(summaryQuery.data?.recentTransactions ?? []).length === 0 ? <p className="hint-text">No recent transactions.</p> : (
            <ul className="dashboard-list">
              {(summaryQuery.data?.recentTransactions ?? []).map((tx) => (
                <li key={tx.id}>
                  <span>{toDateDisplay(tx.transactionDate)} - {tx.merchant ?? "No merchant"}</span>
                  <strong className={tx.type === "expense" ? "expense" : "income"}>{formatCurrency(Number(tx.amount))}</strong>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="card">
          <h3>Upcoming Recurring Payments</h3>
          {(summaryQuery.data?.upcomingRecurringPayments ?? []).length === 0 ? <p className="hint-text">No upcoming recurring payments.</p> : (
            <ul className="dashboard-list">
              {(summaryQuery.data?.upcomingRecurringPayments ?? []).map((item) => (
                <li key={item.id}>
                  <span>{item.title} - {toDateDisplay(item.nextRunDate)}</span>
                  <strong>{formatCurrency(Number(item.amount))}</strong>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <AddTransactionModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onToast={() => {}} />
    </section>
  );
}

