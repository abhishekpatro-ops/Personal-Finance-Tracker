import "./BudgetsPage.css";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { api } from "../../services/api";

type Budget = {
  id: string;
  userId: string;
  categoryId: string;
  month: number;
  year: number;
  amount: number;
  alertThresholdPercent: number;
};

type Category = {
  id: string;
  name: string;
  type: string;
  isArchived: boolean;
};

type Transaction = {
  id: string;
  categoryId?: string | null;
  type: string;
  amount: number;
};

type BudgetForm = {
  categoryId: string;
  amount: number;
  alertThresholdPercent: number;
};

type ToastState = {
  message: string;
  variant: "success" | "error";
};

const defaultFormValues: BudgetForm = {
  categoryId: "",
  amount: 0,
  alertThresholdPercent: 80
};

function getMonthDateRange(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to, month, year };
}

async function fetchBudgets(month: number, year: number) {
  const { data } = await api.get<Budget[]>("/budgets", { params: { month, year } });
  return data;
}

async function fetchCategories() {
  const { data } = await api.get<Category[]>("/categories");
  return data;
}

async function fetchExpenseTransactions(from: string, to: string) {
  const { data } = await api.get<Transaction[]>("/transactions", { params: { from, to, type: "expense" } });
  return data;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);
}

export function BudgetsPage() {
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [budgetToDelete, setBudgetToDelete] = useState<Budget | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const { month, year, from, to } = useMemo(() => getMonthDateRange(selectedMonth), [selectedMonth]);

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<BudgetForm>({
    defaultValues: defaultFormValues
  });

  function showToast(message: string, variant: "success" | "error" = "success") {
    setToast({ message, variant });
    window.setTimeout(() => setToast(null), 2600);
  }

  const budgetsQuery = useQuery({
    queryKey: ["budgets", year, month],
    queryFn: () => fetchBudgets(month, year)
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories
  });

  const transactionsQuery = useQuery({
    queryKey: ["budget-transactions", year, month],
    queryFn: () => fetchExpenseTransactions(from, to)
  });

  const createMutation = useMutation({
    mutationFn: async (values: BudgetForm) => {
      await api.post("/budgets", {
        categoryId: values.categoryId,
        month,
        year,
        amount: Number(values.amount),
        alertThresholdPercent: Number(values.alertThresholdPercent)
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["budgets"] });
      setActionError(null);
      reset(defaultFormValues);
      showToast("Budget added successfully.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to create budget.";
      setActionError(message);
      showToast(typeof message === "string" ? message : "Something went wrong.", "error");
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; values: BudgetForm }) => {
      await api.put(`/budgets/${payload.id}`, {
        amount: Number(payload.values.amount),
        alertThresholdPercent: Number(payload.values.alertThresholdPercent)
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["budgets"] });
      setEditingBudgetId(null);
      setActionError(null);
      reset(defaultFormValues);
      showToast("Budget updated successfully.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to update budget.";
      setActionError(message);
      showToast(typeof message === "string" ? message : "Something went wrong.", "error");
    }
  });

  const duplicateLastMonthMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ created: number; skipped: number; message: string }>("/budgets/duplicate-last-month", null, {
        params: { month, year }
      });
      return data;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["budgets"] });
      showToast(`Copied ${data.created} budget(s). Skipped ${data.skipped}.`, "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to duplicate previous month budgets.";
      showToast(typeof message === "string" ? message : "Something went wrong.", "error");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/budgets/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["budgets"] });
      if (editingBudgetId) {
        setEditingBudgetId(null);
        reset(defaultFormValues);
      }
      setBudgetToDelete(null);
      setActionError(null);
      showToast("Budget deleted successfully.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to delete budget.";
      setBudgetToDelete(null);
      setActionError(message);
      showToast(typeof message === "string" ? message : "Something went wrong.", "error");
    }
  });

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const category of categoriesQuery.data ?? []) {
      map.set(category.id, category);
    }
    return map;
  }, [categoriesQuery.data]);

  const expenseCategories = useMemo(
    () => (categoriesQuery.data ?? []).filter((category) => category.type === "expense" && !category.isArchived),
    [categoriesQuery.data]
  );

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of transactionsQuery.data ?? []) {
      if (!tx.categoryId) continue;
      const total = map.get(tx.categoryId) ?? 0;
      map.set(tx.categoryId, total + Number(tx.amount));
    }
    return map;
  }, [transactionsQuery.data]);

  const budgets = useMemo(() => {
    return [...(budgetsQuery.data ?? [])].sort((a, b) => {
      const aName = categoryById.get(a.categoryId)?.name ?? "Unknown Category";
      const bName = categoryById.get(b.categoryId)?.name ?? "Unknown Category";
      return aName.localeCompare(bName);
    });
  }, [budgetsQuery.data, categoryById]);

  const selectedCategoryId = watch("categoryId");
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  function startEdit(budget: Budget) {
    setEditingBudgetId(budget.id);
    setActionError(null);
    reset({
      categoryId: budget.categoryId,
      amount: Number(budget.amount),
      alertThresholdPercent: Number(budget.alertThresholdPercent)
    });
  }

  function cancelEdit() {
    setEditingBudgetId(null);
    setActionError(null);
    reset(defaultFormValues);
  }

  const onSubmit = handleSubmit((values) => {
    setActionError(null);
    if (editingBudgetId) {
      updateMutation.mutate({ id: editingBudgetId, values });
      return;
    }
    createMutation.mutate(values);
  });

  function moveMonth(offset: number) {
    setSelectedMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return (
    <section>
      <div className="section-head">
        <h2>Budgets</h2>
        <div className="budget-month-switcher">
          <button type="button" className="ghost" onClick={() => moveMonth(-1)}>Prev</button>
          <p className="budget-month-label">
            {selectedMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
          </p>
          <button type="button" className="ghost" onClick={() => moveMonth(1)}>Next</button>
          <button
            type="button"
            className="primary budget-dup-btn"
            onClick={() => duplicateLastMonthMutation.mutate()}
            disabled={duplicateLastMonthMutation.isPending}
          >
            {duplicateLastMonthMutation.isPending ? "Copying..." : "Duplicate Last Month"}
          </button>
        </div>
      </div>

      <article className="card">
        <h3>{editingBudgetId ? "Edit Budget" : "Add Budget"}</h3>
        <form className="inline-form" onSubmit={onSubmit}>
          <label>
            Category
            <select {...register("categoryId", { required: "Category is required" })} disabled={Boolean(editingBudgetId)}>
              <option value="">Select an expense category</option>
              {expenseCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          {errors.categoryId ? <p className="error-text">{errors.categoryId.message}</p> : null}

          <label>
            Budget Amount
            <input
              type="number"
              step="0.01"
              min={0.01}
              {...register("amount", {
                valueAsNumber: true,
                required: "Amount is required",
                min: { value: 0.01, message: "Amount must be greater than 0" }
              })}
            />
          </label>
          {errors.amount ? <p className="error-text">{errors.amount.message}</p> : null}

          <label>
            Alert Threshold (%)
            <input
              type="number"
              min={1}
              max={120}
              {...register("alertThresholdPercent", {
                valueAsNumber: true,
                required: "Alert threshold is required",
                min: { value: 1, message: "Threshold must be at least 1%" },
                max: { value: 120, message: "Threshold cannot exceed 120%" }
              })}
            />
          </label>
          {errors.alertThresholdPercent ? <p className="error-text">{errors.alertThresholdPercent.message}</p> : null}

          {selectedCategoryId && !editingBudgetId ? (
            <p className="hint-text">
              Setting budget for <strong>{categoryById.get(selectedCategoryId)?.name ?? "Selected Category"}</strong> in{" "}
              {selectedMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}.
            </p>
          ) : null}

          {editingBudgetId ? <p className="hint-text">Category cannot be changed while editing.</p> : null}
          {actionError ? <p className="error-text">{actionError}</p> : null}

          <div className="inline-form-actions">
            {editingBudgetId ? <button type="button" className="ghost" onClick={cancelEdit}>Cancel</button> : null}
            <button className="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : editingBudgetId ? "Update Budget" : "Add Budget"}
            </button>
          </div>
        </form>
      </article>

      {budgetsQuery.isLoading || categoriesQuery.isLoading || transactionsQuery.isLoading ? <p>Loading budgets...</p> : null}

      {!budgetsQuery.isLoading && budgets.length === 0 ? (
        <article className="card">
          <p>No budgets set for this month.</p>
        </article>
      ) : null}

      <div className="budget-grid">
        {budgets.map((budget) => {
          const spent = spentByCategory.get(budget.categoryId) ?? 0;
          const limit = Number(budget.amount);
          const thresholdPercent = Number(budget.alertThresholdPercent);
          const thresholdAmount = (limit * thresholdPercent) / 100;
          const remaining = limit - spent;
          const usedPercent = limit > 0 ? (spent / limit) * 100 : 0;

          const hit80 = usedPercent >= 80;
          const hit100 = usedPercent >= 100;
          const hit120 = usedPercent >= 120;

          let status: "safe" | "warn" | "danger" = "safe";
          if (hit100) {
            status = "danger";
          } else if (spent >= thresholdAmount || hit80) {
            status = "warn";
          }

          return (
            <article className={`card budget-card budget-${status}`} key={budget.id}>
              <div className="budget-card-head">
                <h3>{categoryById.get(budget.categoryId)?.name ?? "Unknown Category"}</h3>
                <span className="budget-threshold">{thresholdPercent}% alert</span>
              </div>

              <div className="budget-metrics">
                <p><span>Budget</span><strong>{formatCurrency(limit)}</strong></p>
                <p><span>Spent</span><strong>{formatCurrency(spent)}</strong></p>
                <p>
                  <span>{remaining >= 0 ? "Remaining" : "Over by"}</span>
                  <strong className={remaining >= 0 ? "budget-ok" : "budget-over"}>{formatCurrency(Math.abs(remaining))}</strong>
                </p>
              </div>

              <div className="budget-progress-track" aria-label="Budget usage">
                <div
                  className={`budget-progress-bar budget-progress-${status}`}
                  style={{ width: `${Math.min(usedPercent, 100)}%` }}
                />
              </div>
              <p className="budget-usage-text">{usedPercent.toFixed(1)}% used</p>

              <div className="budget-alert-row">
                <span className={`budget-alert-chip ${hit80 ? "active" : ""}`}>80% {hit80 ? "Exceeded" : "Pending"}</span>
                <span className={`budget-alert-chip ${hit100 ? "active danger" : ""}`}>100% {hit100 ? "Exceeded" : "Pending"}</span>
                <span className={`budget-alert-chip ${hit120 ? "active danger" : ""}`}>120% {hit120 ? "Exceeded" : "Pending"}</span>
              </div>

              <div className="budget-card-actions">
                <button type="button" className="budget-action-btn budget-action-edit" onClick={() => startEdit(budget)}>Edit</button>
                <button
                  type="button"
                  className="budget-action-btn budget-action-delete"
                  onClick={() => setBudgetToDelete(budget)}
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {budgetToDelete ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Delete budget confirmation">
          <div className="modal-card">
            <div className="modal-header"><h3>Delete Budget</h3></div>
            <p className="confirm-text">Are you sure you want to delete this budget?</p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setBudgetToDelete(null)} disabled={deleteMutation.isPending}>Cancel</button>
              <button type="button" className="danger" onClick={() => deleteMutation.mutate(budgetToDelete.id)} disabled={deleteMutation.isPending}>
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
