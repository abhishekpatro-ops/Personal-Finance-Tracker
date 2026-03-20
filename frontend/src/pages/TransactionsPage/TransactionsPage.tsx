import "./TransactionsPage.css";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EditTransactionModal } from "../../components/EditTransactionModal";
import { api } from "../../services/api";

type Transaction = {
  id: string;
  userId: string;
  accountId: string;
  destinationAccountId?: string | null;
  categoryId?: string | null;
  type: "expense" | "income" | "transfer";
  amount: number;
  transactionDate: string;
  note?: string | null;
  merchant?: string | null;
  paymentMethod?: string | null;
  recurringTransactionId?: string | null;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
};

type Account = {
  id: string;
  name: string;
};

type Category = {
  id: string;
  name: string;
  type: string;
};

type ToastState = {
  message: string;
  variant: "success" | "error";
};

type FilterState = {
  from: string;
  to: string;
  type: "" | "income" | "expense" | "transfer";
  accountId: string;
  categoryId: string;
  minAmount: string;
  maxAmount: string;
  search: string;
};

const defaultFilters: FilterState = {
  from: "",
  to: "",
  type: "",
  accountId: "",
  categoryId: "",
  minAmount: "",
  maxAmount: "",
  search: ""
};

function toDateDisplay(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-IN");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value ?? 0);
}

async function fetchTransactions(filters: FilterState) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.type) params.set("type", filters.type);
  if (filters.accountId) params.set("accountId", filters.accountId);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  if (filters.minAmount) params.set("minAmount", filters.minAmount);
  if (filters.maxAmount) params.set("maxAmount", filters.maxAmount);
  if (filters.search) params.set("search", filters.search);

  const query = params.toString();
  const { data } = await api.get<Transaction[]>(query ? `/transactions?${query}` : "/transactions");
  return data;
}

async function fetchAccounts() {
  const { data } = await api.get<Account[]>("/accounts");
  return data;
}

async function fetchCategories() {
  const { data } = await api.get<Category[]>("/categories");
  return data;
}

export function TransactionsPage() {
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);

  const query = useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => fetchTransactions(filters)
  });

  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  const accountById = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accountsQuery.data ?? []) {
      map.set(account.id, account.name);
    }
    return map;
  }, [accountsQuery.data]);

  const categoryById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categoriesQuery.data ?? []) {
      map.set(category.id, category.name);
    }
    return map;
  }, [categoriesQuery.data]);

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
    setExpandedIds([]);
  }, [filters]);

  const totalCount = query.data?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageRows = useMemo(() => {
    const all = query.data ?? [];
    const start = (safePage - 1) * pageSize;
    return all.slice(start, start + pageSize);
  }, [query.data, safePage, pageSize]);

  function showToast(message: string, variant: "success" | "error" = "success") {
    setToast({ message, variant });
    window.setTimeout(() => setToast(null), 2600);
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/transactions/${id}`);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] })
      ]);
      setTxToDelete(null);
      setSelectedIds((prev) => prev.filter((id) => id !== txToDelete?.id));
      showToast("Transaction deleted successfully.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to delete transaction.";
      setTxToDelete(null);
      showToast(typeof message === "string" ? message : "Something went wrong.", "error");
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => api.delete(`/transactions/${id}`)));
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] })
      ]);
      setSelectedIds([]);
      showToast("Selected transactions deleted.", "success");
    },
    onError: () => {
      showToast("Failed to bulk delete transactions.", "error");
    }
  });

  const bulkCategorizeMutation = useMutation({
    mutationFn: async (payload: { ids: string[]; categoryId: string }) => {
      const byId = new Map((query.data ?? []).map((tx) => [tx.id, tx]));
      const idsToUpdate = payload.ids.filter((id) => {
        const tx = byId.get(id);
        return tx && tx.type !== "transfer";
      });

      await Promise.all(
        idsToUpdate.map((id) => {
          const tx = byId.get(id)!;
          return api.put(`/transactions/${tx.id}`, {
            accountId: tx.accountId,
            destinationAccountId: tx.destinationAccountId ?? null,
            categoryId: payload.categoryId,
            type: tx.type,
            amount: tx.amount,
            date: tx.transactionDate.split("T")[0],
            merchant: tx.merchant ?? null,
            note: tx.note ?? null,
            paymentMethod: tx.paymentMethod ?? null,
            recurringTransactionId: tx.recurringTransactionId ?? null,
            tags: tx.tags ?? []
          });
        })
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
      ]);
      setSelectedIds([]);
      setBulkCategoryId("");
      showToast("Selected transactions categorized.", "success");
    },
    onError: () => {
      showToast("Failed to bulk categorize transactions.", "error");
    }
  });

  function toggleRowSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAllOnPage() {
    const ids = pageRows.map((tx) => tx.id);
    const allSelected = ids.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      return;
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  }

  const allSelectedOnPage = pageRows.length > 0 && pageRows.every((tx) => selectedIds.includes(tx.id));

  return (
    <section className="transactions-page">
      <div className="section-head">
        <h2>Transactions</h2>
      </div>

      <article className="card tx-filter-card">
        <div className="tx-filter-grid">
          <label>
            Search (merchant/note)
            <input type="text" value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} placeholder="Search..." />
          </label>

          <label>
            Type
            <select value={filters.type} onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value as FilterState["type"] }))}>
              <option value="">All</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="transfer">Transfer</option>
            </select>
          </label>

          <label>
            Account
            <select value={filters.accountId} onChange={(e) => setFilters((prev) => ({ ...prev, accountId: e.target.value }))}>
              <option value="">All accounts</option>
              {(accountsQuery.data ?? []).map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>

          <label>
            Category
            <select value={filters.categoryId} onChange={(e) => setFilters((prev) => ({ ...prev, categoryId: e.target.value }))}>
              <option value="">All categories</option>
              {(categoriesQuery.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>

          <label>
            From Date
            <input type="date" value={filters.from} onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))} />
          </label>

          <label>
            To Date
            <input type="date" value={filters.to} onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))} />
          </label>

          <label>
            Min Amount
            <input type="number" min={0} step="0.01" value={filters.minAmount} onChange={(e) => setFilters((prev) => ({ ...prev, minAmount: e.target.value }))} />
          </label>

          <label>
            Max Amount
            <input type="number" min={0} step="0.01" value={filters.maxAmount} onChange={(e) => setFilters((prev) => ({ ...prev, maxAmount: e.target.value }))} />
          </label>
        </div>

        <div className="tx-filter-actions">
          <button type="button" className="ghost" onClick={() => setFilters(defaultFilters)}>Reset Filters</button>
          <p className="hint-text">{totalCount} transactions found</p>
        </div>
      </article>

      <article className="card tx-bulk-card">
        <div className="tx-bulk-left">
          <p className="tx-bulk-text">Selected: <strong>{selectedIds.length}</strong></p>
          <select value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)}>
            <option value="">Bulk categorize</option>
            {(categoriesQuery.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          <button
            type="button"
            className="tx-action-btn"
            disabled={!bulkCategoryId || selectedIds.length === 0 || bulkCategorizeMutation.isPending}
            onClick={() => bulkCategorizeMutation.mutate({ ids: selectedIds, categoryId: bulkCategoryId })}
          >
            {bulkCategorizeMutation.isPending ? "Applying..." : "Apply Category"}
          </button>
        </div>

        <button
          type="button"
          className="tx-action-btn tx-action-delete"
          disabled={selectedIds.length === 0 || bulkDeleteMutation.isPending}
          onClick={() => bulkDeleteMutation.mutate(selectedIds)}
        >
          {bulkDeleteMutation.isPending ? "Deleting..." : "Bulk Delete"}
        </button>
      </article>

      <article className="card">
        <table className="tx-table">
          <thead>
            <tr>
              <th>
                <input type="checkbox" checked={allSelectedOnPage} onChange={toggleSelectAllOnPage} />
              </th>
              <th>Date</th>
              <th>Merchant</th>
              <th>Account</th>
              <th>To Account</th>
              <th>Category</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((tx) => {
              const isExpanded = expandedIds.includes(tx.id);
              const rowClass = tx.type === "income" ? "tx-row-income" : tx.type === "expense" ? "tx-row-expense" : "tx-row-transfer";

              return (
                <Fragment key={tx.id}>
                  <tr className={rowClass}>
                    <td>
                      <input type="checkbox" checked={selectedIds.includes(tx.id)} onChange={() => toggleRowSelected(tx.id)} />
                    </td>
                    <td>{toDateDisplay(tx.transactionDate)}</td>
                    <td>{tx.merchant ?? "-"}</td>
                    <td>{accountById.get(tx.accountId) ?? "Unknown Account"}</td>
                    <td>{tx.destinationAccountId ? (accountById.get(tx.destinationAccountId) ?? "Unknown Account") : "-"}</td>
                    <td>{tx.categoryId ? (categoryById.get(tx.categoryId) ?? "Unknown Category") : "-"}</td>
                    <td className={tx.type === "income" ? "tx-value-income" : tx.type === "expense" ? "tx-value-expense" : "tx-value-transfer"}>{tx.type}</td>
                    <td className={tx.type === "income" ? "tx-value-income" : tx.type === "expense" ? "tx-value-expense" : "tx-value-transfer"}>{formatCurrency(tx.amount)}</td>
                    <td>{tx.paymentMethod ?? "-"}</td>
                    <td>
                      <div className="tx-actions">
                        <button type="button" className="tx-action-btn" onClick={() => toggleExpand(tx.id)}>{isExpanded ? "Hide" : "Details"}</button>
                        <button type="button" className="tx-action-btn" onClick={() => setEditingTx(tx)}>Edit</button>
                        <button type="button" className="tx-action-btn tx-action-delete" onClick={() => setTxToDelete(tx)} disabled={deleteMutation.isPending}>Delete</button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="tx-detail-row">
                      <td colSpan={10}>
                        <div className="tx-detail-grid">
                          <p><span>id</span><strong>{tx.id}</strong></p>
                          <p><span>userId</span><strong>{tx.userId}</strong></p>
                          <p><span>accountId</span><strong>{tx.accountId}</strong></p>
                          <p><span>destinationAccountId</span><strong>{tx.destinationAccountId ?? "-"}</strong></p>
                          <p><span>type</span><strong>{tx.type}</strong></p>
                          <p><span>amount</span><strong>{tx.amount}</strong></p>
                          <p><span>date</span><strong>{toDateDisplay(tx.transactionDate)}</strong></p>
                          <p><span>categoryId</span><strong>{tx.categoryId ?? "-"}</strong></p>
                          <p><span>merchant</span><strong>{tx.merchant ?? "-"}</strong></p>
                          <p><span>note</span><strong>{tx.note ?? "-"}</strong></p>
                          <p><span>paymentMethod</span><strong>{tx.paymentMethod ?? "-"}</strong></p>
                          <p><span>recurringTransactionId</span><strong>{tx.recurringTransactionId ?? "-"}</strong></p>
                          <p><span>tags</span><strong>{(tx.tags ?? []).length ? tx.tags?.join(", ") : "-"}</strong></p>
                          <p><span>createdAt</span><strong>{toDateDisplay(tx.createdAt)}</strong></p>
                          <p><span>updatedAt</span><strong>{toDateDisplay(tx.updatedAt)}</strong></p>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}

            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={10}><p className="hint-text">No transactions match your filters.</p></td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="tx-pagination">
          <div className="tx-pagination-left">
            <label>
              Rows per page
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </label>
          </div>
          <div className="tx-pagination-right">
            <button type="button" className="ghost" disabled={safePage <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Prev</button>
            <span>Page {safePage} of {totalPages}</span>
            <button type="button" className="ghost" disabled={safePage >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>Next</button>
          </div>
        </div>
      </article>

      <EditTransactionModal
        transaction={editingTx}
        isOpen={Boolean(editingTx)}
        onClose={() => setEditingTx(null)}
      />

      {txToDelete ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Delete transaction confirmation">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Delete Transaction</h3>
            </div>
            <p className="confirm-text">Are you sure you want to delete this transaction?</p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setTxToDelete(null)} disabled={deleteMutation.isPending}>Cancel</button>
              <button type="button" className="danger" onClick={() => deleteMutation.mutate(txToDelete.id)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className={`app-toast app-toast-${toast.variant}`}>{toast.message}</div> : null}
    </section>
  );
}



