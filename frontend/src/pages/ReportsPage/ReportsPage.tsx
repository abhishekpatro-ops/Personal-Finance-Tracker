import "./ReportsPage.css";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../services/api";

type Category = {
  id: string;
  name: string;
  type: "income" | "expense" | string;
};

type Account = {
  id: string;
  name: string;
  currentBalance?: number;
};

type TransactionItem = {
  id: string;
  accountId: string;
  categoryId?: string | null;
  transactionDate: string;
  type: "income" | "expense";
  amount: number;
};

type ReportsData = {
  categories: Category[];
  accounts: Account[];
  transactions: TransactionItem[];
};

type ToastState = {
  message: string;
  variant: "success" | "error";
};

type TransactionTypeFilter = "all" | "income" | "expense";

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getDefaultDateRange() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  return {
    from: toIsoDate(start),
    to: toIsoDate(today)
  };
}

async function fetchReports(from: string, to: string): Promise<ReportsData> {
  const [categories, accounts, transactions] = await Promise.all([
    api.get<Category[]>("/categories"),
    api.get<Account[]>("/accounts"),
    api.get<TransactionItem[]>("/transactions", { params: { from, to } })
  ]);

  return {
    categories: categories.data,
    accounts: accounts.data,
    transactions: transactions.data
  };
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);
}

function formatDate(value: string): string {
  const raw = value.includes("T") ? value.split("T")[0] : value;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export function ReportsPage() {
  const defaultRange = getDefaultDateRange();

  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [selectedType, setSelectedType] = useState<TransactionTypeFilter>("all");
  const [isDownloadingCsv, setIsDownloadingCsv] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const query = useQuery({
    queryKey: ["reports", fromDate, toDate],
    queryFn: () => fetchReports(fromDate, toDate)
  });

  function showToast(message: string, variant: "success" | "error" = "success") {
    setToast({ message, variant });
    window.setTimeout(() => setToast(null), 2600);
  }

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const category of query.data?.categories ?? []) {
      map.set(category.id, category);
    }
    return map;
  }, [query.data?.categories]);

  const accountById = useMemo(() => {
    const map = new Map<string, Account>();
    for (const account of query.data?.accounts ?? []) {
      map.set(account.id, account);
    }
    return map;
  }, [query.data?.accounts]);

  const filteredTransactions = useMemo(() => {
    return (query.data?.transactions ?? [])
      .filter((tx) => (selectedAccountId === "all" ? true : tx.accountId === selectedAccountId))
      .filter((tx) => (selectedCategoryId === "all" ? true : tx.categoryId === selectedCategoryId))
      .filter((tx) => (selectedType === "all" ? true : tx.type === selectedType))
      .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  }, [query.data?.transactions, selectedAccountId, selectedCategoryId, selectedType]);

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const tx of filteredTransactions) {
      if (tx.type === "income") {
        income += Number(tx.amount);
      } else {
        expense += Number(tx.amount);
      }
    }

    const savings = income - expense;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;

    return { income, expense, savings, savingsRate };
  }, [filteredTransactions]);

  const monthlySpending = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of filteredTransactions) {
      if (tx.type !== "expense") continue;
      const key = monthKey(tx.transactionDate);
      map.set(key, (map.get(key) ?? 0) + Number(tx.amount));
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, total]) => ({ key, label: monthLabel(key), total }));
  }, [filteredTransactions]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();

    for (const tx of filteredTransactions) {
      if (!tx.categoryId) continue;
      map.set(tx.categoryId, (map.get(tx.categoryId) ?? 0) + Number(tx.amount));
    }

    const rows = Array.from(map.entries())
      .map(([categoryId, total]) => ({
        categoryId,
        name: categoryById.get(categoryId)?.name ?? "Unknown Category",
        total
      }))
      .sort((a, b) => b.total - a.total);

    const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);

    return rows.map((row) => ({
      ...row,
      percent: grandTotal > 0 ? (row.total / grandTotal) * 100 : 0
    }));
  }, [filteredTransactions, categoryById]);

  const incomeExpenseTrend = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();

    for (const tx of filteredTransactions) {
      const key = monthKey(tx.transactionDate);
      const slot = map.get(key) ?? { income: 0, expense: 0 };

      if (tx.type === "income") {
        slot.income += Number(tx.amount);
      } else {
        slot.expense += Number(tx.amount);
      }

      map.set(key, slot);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => ({
        key,
        label: monthLabel(key),
        income: values.income,
        expense: values.expense,
        net: values.income - values.expense
      }));
  }, [filteredTransactions]);

  const accountBalanceTrend = useMemo(() => {
    const flowMap = new Map<string, { inflow: number; outflow: number }>();

    for (const tx of filteredTransactions) {
      const accountId = tx.accountId;
      const slot = flowMap.get(accountId) ?? { inflow: 0, outflow: 0 };

      if (tx.type === "income") {
        slot.inflow += Number(tx.amount);
      } else {
        slot.outflow += Number(tx.amount);
      }

      flowMap.set(accountId, slot);
    }

    return (query.data?.accounts ?? [])
      .map((account) => {
        const flows = flowMap.get(account.id) ?? { inflow: 0, outflow: 0 };
        return {
          accountId: account.id,
          accountName: account.name,
          currentBalance: Number(account.currentBalance ?? 0),
          inflow: flows.inflow,
          outflow: flows.outflow,
          netChange: flows.inflow - flows.outflow
        };
      })
      .filter((row) => selectedAccountId === "all" || row.accountId === selectedAccountId)
      .sort((a, b) => b.currentBalance - a.currentBalance);
  }, [filteredTransactions, query.data?.accounts, selectedAccountId]);

  const savingsProgress = useMemo(() => {
    let cumulative = 0;

    return incomeExpenseTrend.map((row) => {
      const monthlySavings = row.income - row.expense;
      cumulative += monthlySavings;
      const monthlyRate = row.income > 0 ? (monthlySavings / row.income) * 100 : 0;

      return {
        ...row,
        monthlySavings,
        cumulativeSavings: cumulative,
        monthlyRate
      };
    });
  }, [incomeExpenseTrend]);

  function resetFilters() {
    const range = getDefaultDateRange();
    setFromDate(range.from);
    setToDate(range.to);
    setSelectedAccountId("all");
    setSelectedCategoryId("all");
    setSelectedType("all");
  }

  async function downloadCsv() {
    try {
      setIsDownloadingCsv(true);
      if (filteredTransactions.length === 0) {
        showToast("No data found for selected filters.", "error");
        return;
      }

      const rows = filteredTransactions.map((tx) => {
        const categoryName = tx.categoryId ? (categoryById.get(tx.categoryId)?.name ?? "Unknown Category") : "Uncategorized";
        const accountName = accountById.get(tx.accountId)?.name ?? "Unknown Account";

        return [
          formatDate(tx.transactionDate),
          tx.type,
          categoryName,
          accountName,
          Number(tx.amount).toFixed(2)
        ];
      });

      const csv = [
        ["Date", "Type", "Category", "Account", "Amount"],
        ...rows
      ]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `reports-${fromDate}-to-${toDate}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("CSV exported successfully.", "success");
    } catch {
      showToast("Failed to export CSV.", "error");
    } finally {
      setIsDownloadingCsv(false);
    }
  }

  async function downloadPdfV11() {
    try {
      setIsDownloadingPdf(true);
      const response = await api.get("/reports/transactions-pdf", {
        params: {
          from: fromDate,
          to: toDate,
          accountId: selectedAccountId === "all" ? undefined : selectedAccountId,
          categoryId: selectedCategoryId === "all" ? undefined : selectedCategoryId,
          type: selectedType === "all" ? undefined : selectedType,
          version: "1.1"
        },
        responseType: "blob"
      });

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `reports-v1.1-${fromDate}-to-${toDate}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("PDF V1.1 exported successfully.", "success");
    } catch {
      showToast("Failed to export PDF. Please verify report API support for filtered export.", "error");
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  const maxCategoryTotal = categoryBreakdown[0]?.total ?? 1;

  return (
    <section>
      <div className="report-page-head">
        <h2>Reports</h2>
        <div className="report-export-actions">
          <button type="button" className="ghost" onClick={downloadCsv} disabled={isDownloadingCsv || query.isLoading}>
            {isDownloadingCsv ? "Exporting CSV..." : "Export CSV"}
          </button>
          <button type="button" className="primary" onClick={downloadPdfV11} disabled={isDownloadingPdf || query.isLoading}>
            {isDownloadingPdf ? "Exporting PDF..." : "Export PDF (V1.1)"}
          </button>
        </div>
      </div>

      <article className="card report-filter-card">
        <div className="report-filter-head">
          <h3>Filters</h3>
          <button type="button" className="ghost" onClick={resetFilters}>Reset</button>
        </div>

        <div className="report-filter-grid">
          <label>
            Date From
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} max={toDate} />
          </label>

          <label>
            Date To
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} min={fromDate} />
          </label>

          <label>
            Account
            <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
              <option value="all">All Accounts</option>
              {(query.data?.accounts ?? []).map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>

          <label>
            Category
            <select value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)}>
              <option value="all">All Categories</option>
              {(query.data?.categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>

          <label>
            Transaction Type
            <select value={selectedType} onChange={(e) => setSelectedType(e.target.value as TransactionTypeFilter)}>
              <option value="all">All</option>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
        </div>
      </article>

      <div className="report-kpi-grid">
        <article className="card report-kpi">
          <p>Total Income</p>
          <h3 className="report-positive">{formatAmount(summary.income)}</h3>
        </article>
        <article className="card report-kpi">
          <p>Total Expense</p>
          <h3 className="report-negative">{formatAmount(summary.expense)}</h3>
        </article>
        <article className="card report-kpi">
          <p>Net Savings</p>
          <h3 className={summary.savings >= 0 ? "report-positive" : "report-negative"}>{formatAmount(summary.savings)}</h3>
        </article>
        <article className="card report-kpi">
          <p>Savings Rate</p>
          <h3>{summary.savingsRate.toFixed(1)}%</h3>
        </article>
      </div>

      {query.isLoading ? <p>Loading reports...</p> : null}

      {!query.isLoading && (
        <div className="report-sections-grid">
          <article className="card report-block">
            <h3>Monthly Spending Report</h3>
            {monthlySpending.length === 0 ? <p className="hint-text">No spending data for selected filters.</p> : null}
            <div className="report-list">
              {monthlySpending.map((row) => (
                <div className="report-row" key={row.key}>
                  <p className="report-value">{row.label}</p>
                  <p className="report-amount report-negative">{formatAmount(row.total)}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="card report-block">
            <h3>Category Breakdown</h3>
            {categoryBreakdown.length === 0 ? <p className="hint-text">No category data for selected filters.</p> : null}
            <div className="report-list">
              {categoryBreakdown.map((row) => (
                <div className="report-breakdown-row" key={row.categoryId}>
                  <div className="report-breakdown-top">
                    <p className="report-value">{row.name}</p>
                    <p className="report-amount">{formatAmount(row.total)}</p>
                  </div>
                  <div className="report-breakdown-track">
                    <div className="report-breakdown-bar" style={{ width: `${(row.total / maxCategoryTotal) * 100}%` }} />
                  </div>
                  <p className="report-label">{row.percent.toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </article>

          <article className="card report-block">
            <h3>Income vs Expense Trend</h3>
            {incomeExpenseTrend.length === 0 ? <p className="hint-text">No trend data for selected filters.</p> : null}
            <div className="report-list">
              {incomeExpenseTrend.map((row) => (
                <div className="report-row report-row-stack" key={row.key}>
                  <p className="report-value">{row.label}</p>
                  <div className="report-trend-values">
                    <span className="report-positive">In {formatAmount(row.income)}</span>
                    <span className="report-negative">Out {formatAmount(row.expense)}</span>
                    <span className={row.net >= 0 ? "report-positive" : "report-negative"}>Net {formatAmount(row.net)}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="card report-block">
            <h3>Account Balance Trend</h3>
            {accountBalanceTrend.length === 0 ? <p className="hint-text">No account trend data for selected filters.</p> : null}
            <div className="report-list">
              {accountBalanceTrend.map((row) => (
                <div className="report-row report-row-stack" key={row.accountId}>
                  <p className="report-value">{row.accountName}</p>
                  <p className="report-subvalue">Current Balance: {formatAmount(row.currentBalance)}</p>
                  <div className="report-trend-values">
                    <span className="report-positive">In {formatAmount(row.inflow)}</span>
                    <span className="report-negative">Out {formatAmount(row.outflow)}</span>
                    <span className={row.netChange >= 0 ? "report-positive" : "report-negative"}>Change {formatAmount(row.netChange)}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="card report-block">
            <h3>Savings Progress</h3>
            {savingsProgress.length === 0 ? <p className="hint-text">No savings data for selected filters.</p> : null}
            <div className="report-list">
              {savingsProgress.map((row) => (
                <div className="report-row report-row-stack" key={`savings-${row.key}`}>
                  <p className="report-value">{row.label}</p>
                  <div className="report-trend-values">
                    <span className={row.monthlySavings >= 0 ? "report-positive" : "report-negative"}>
                      Monthly {formatAmount(row.monthlySavings)}
                    </span>
                    <span className={row.cumulativeSavings >= 0 ? "report-positive" : "report-negative"}>
                      Cumulative {formatAmount(row.cumulativeSavings)}
                    </span>
                    <span>{row.monthlyRate.toFixed(1)}% rate</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      )}

      <article className="card report-block report-transactions-block">
        <h3>Transaction Details</h3>
        {!query.isLoading && filteredTransactions.length === 0 ? <p className="hint-text">No transactions found for selected filters.</p> : null}

        <div className="report-list">
          {filteredTransactions.slice(0, 50).map((item) => {
            const category = item.categoryId ? categoryById.get(item.categoryId) : undefined;
            const account = accountById.get(item.accountId);

            return (
              <div className="report-row" key={item.id}>
                <div>
                  <p className="report-label">{formatDate(item.transactionDate)}</p>
                  <p className="report-value">{category?.name ?? "Unknown Category"}</p>
                  <p className="report-subvalue">Account: {account?.name ?? "Unknown Account"}</p>
                </div>
                <p className={`report-amount ${item.type === "income" ? "report-positive" : "report-negative"}`}>
                  {formatAmount(item.amount)}
                </p>
              </div>
            );
          })}
        </div>
      </article>

      {toast ? <div className={`app-toast app-toast-${toast.variant}`}>{toast.message}</div> : null}
    </section>
  );
}
