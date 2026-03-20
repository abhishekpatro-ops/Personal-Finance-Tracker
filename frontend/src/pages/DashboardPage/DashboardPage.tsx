import "./DashboardPage.css";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AddTransactionModal } from "../../components/AddTransactionModal";
import { api } from "../../services/api";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type ToastState = {
  message: string;
  variant: "success" | "error";
};

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
  isPaused: boolean;
};

type Category = {
  id: string;
  name: string;
  type: string;
};

type Budget = {
  id: string;
  categoryId: string;
  amount: number;
  alertThresholdPercent: number;
};

type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  status: string;
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

const PIE_COLORS = ["#2563eb", "#0ea5e9", "#14b8a6", "#22c55e", "#f59e0b", "#f97316", "#ef4444", "#8b5cf6"];

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

async function fetchGoals() {
  const { data } = await api.get<Goal[]>("/goals");
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

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);

  const { start, end } = getMonthRange();
  const { from, to } = getTrendRange();
  const month = start.getMonth() + 1;
  const year = start.getFullYear();

  const summaryQuery = useQuery({ queryKey: ["dashboard-summary"], queryFn: fetchSummary });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const goalsQuery = useQuery({ queryKey: ["goals"], queryFn: fetchGoals });
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

  function showToast(message: string, variant: "success" | "error" = "success") {
    setToast({ message, variant });
    window.setTimeout(() => setToast(null), 2600);
  }

  const contributeMutation = useMutation({
    mutationFn: async (payload: { goalId: string; amount: number }) => {
      await api.post(`/goals/${payload.goalId}/contribute`, { amount: payload.amount, accountId: null });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["goals"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] })
      ]);
      setIsGoalModalOpen(false);
      setSelectedGoalId("");
      setGoalAmount("");
      showToast("Goal contribution updated successfully.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Unable to update goal contribution.";
      showToast(typeof message === "string" ? message : "Unable to update goal contribution.", "error");
    }
  });

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

  const goalSummaryData = useMemo(() => {
    return (goalsQuery.data ?? []).map((goal) => {
      const target = Number(goal.targetAmount) || 0;
      const current = Number(goal.currentAmount) || 0;
      const percentage = target > 0 ? Math.min(100, (current / target) * 100) : 0;
      return {
        ...goal,
        target,
        current,
        percentage
      };
    });
  }, [goalsQuery.data]);

  const actionGoals = useMemo(
    () => goalSummaryData.filter((goal) => goal.status?.toLowerCase() !== "completed"),
    [goalSummaryData]
  );

  function submitGoalContribution() {
    const amount = Number(goalAmount);
    if (!selectedGoalId) {
      showToast("Select a goal first.", "error");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Contribution amount must be greater than 0.", "error");
      return;
    }

    contributeMutation.mutate({ goalId: selectedGoalId, amount });
  }

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
          <button type="button" className="dashboard-quick-btn" onClick={() => navigate("/recurring")}>Add Recurring Bill</button>
          <button type="button" className="dashboard-quick-btn" onClick={() => setIsGoalModalOpen(true)}>Update Goal Contribution</button>
        </div>
      </article>

      <div className="cards">
        <article className="card"><h3>Current Month Income</h3><p>{formatCurrency(Number(summaryQuery.data?.income ?? 0))}</p></article>
        <article className="card"><h3>Current Month Expense</h3><p>{formatCurrency(Number(summaryQuery.data?.expense ?? 0))}</p></article>
        <article className="card"><h3>Net Balance</h3><p>{formatCurrency(Number(summaryQuery.data?.net ?? 0))}</p></article>
      </div>

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

      <article className="card">
        <h3>Savings Goal Progress Summary</h3>
        {goalSummaryData.length === 0 ? <p className="hint-text">No goals found.</p> : (
          <div className="dashboard-goal-grid">
            {goalSummaryData.map((goal) => (
              <article key={goal.id} className="dashboard-goal-item">
                <p className="dashboard-goal-title">{goal.name}</p>
                <p className="dashboard-goal-meta">{formatCurrency(goal.current)} / {formatCurrency(goal.target)}</p>
                <div className="dashboard-progress-track">
                  <div className="dashboard-progress-bar" style={{ width: `${goal.percentage}%` }} />
                </div>
                <p className="dashboard-goal-status">{goal.percentage.toFixed(0)}% funded</p>
              </article>
            ))}
          </div>
        )}
      </article>

      <AddTransactionModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onToast={showToast} />

      {isGoalModalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Update goal contribution">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Update Goal Contribution</h3>
              <button type="button" className="ghost" onClick={() => setIsGoalModalOpen(false)}>Close</button>
            </div>

            <div className="modal-form">
              <label>
                Goal
                <select value={selectedGoalId} onChange={(event) => setSelectedGoalId(event.target.value)}>
                  <option value="">Select goal</option>
                  {actionGoals.map((goal) => (
                    <option key={goal.id} value={goal.id}>{goal.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Contribution Amount
                <input type="number" min={0.01} step="0.01" value={goalAmount} onChange={(event) => setGoalAmount(event.target.value)} />
              </label>

              <div className="modal-actions">
                <button type="button" className="ghost" onClick={() => setIsGoalModalOpen(false)}>Cancel</button>
                <button type="button" className="primary" onClick={submitGoalContribution} disabled={contributeMutation.isPending}>
                  {contributeMutation.isPending ? "Updating..." : "Update Contribution"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className={`app-toast app-toast-${toast.variant}`}>{toast.message}</div> : null}
    </section>
  );
}



