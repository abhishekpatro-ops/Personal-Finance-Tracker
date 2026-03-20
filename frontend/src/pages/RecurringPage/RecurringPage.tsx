import "./RecurringPage.css";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { api } from "../../services/api";

type RecurringItem = {
  id: string;
  title: string;
  type: "expense" | "income" | string;
  amount: number;
  categoryId?: string | null;
  accountId?: string | null;
  frequency: string;
  startDate: string;
  endDate?: string | null;
  nextRunDate: string;
  autoCreateTransaction: boolean;
  isPaused: boolean;
};

type Account = {
  id: string;
  name: string;
};

type Category = {
  id: string;
  name: string;
  type: string;
  isArchived: boolean;
};

type RecurringForm = {
  title: string;
  type: "expense" | "income";
  amount: number;
  accountId: string;
  categoryId: string;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  startDate: string;
  endDate: string;
  nextRunDate: string;
  autoCreateTransaction: boolean;
  isPaused: boolean;
};

type ToastState = {
  message: string;
  variant: "success" | "error";
};

const defaultFormValues: RecurringForm = {
  title: "",
  type: "expense",
  amount: 0,
  accountId: "",
  categoryId: "",
  frequency: "monthly",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
  nextRunDate: new Date().toISOString().slice(0, 10),
  autoCreateTransaction: true,
  isPaused: false
};

async function fetchRecurring() {
  const { data } = await api.get<RecurringItem[]>("/recurring");
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);
}

function toDateInput(value?: string | null) {
  if (!value) return "";
  return value.split("T")[0];
}

function toApiDate(value: string) {
  return value.trim() ? value : null;
}

function toLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function formatDate(value?: string | null) {
  const raw = toDateInput(value);
  if (!raw) return "Not set";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
}

export function RecurringPage() {
  const queryClient = useQueryClient();
  const [editingItem, setEditingItem] = useState<RecurringItem | null>(null);
  const [recurringToDelete, setRecurringToDelete] = useState<RecurringItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const recurringQuery = useQuery({ queryKey: ["recurring"], queryFn: fetchRecurring });
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<RecurringForm>({
    defaultValues: defaultFormValues
  });

  const selectedType = watch("type");

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

  const filteredCategories = useMemo(() => {
    return (categoriesQuery.data ?? []).filter((c) => c.type === selectedType && !c.isArchived);
  }, [categoriesQuery.data, selectedType]);

  const recurringItems = recurringQuery.data ?? [];
  const activeCount = recurringItems.filter((item) => !item.isPaused).length;
  const pausedCount = recurringItems.filter((item) => item.isPaused).length;

  function showToast(message: string, variant: "success" | "error" = "success") {
    setToast({ message, variant });
    window.setTimeout(() => setToast(null), 2600);
  }

  const createMutation = useMutation({
    mutationFn: async (values: RecurringForm) => {
      await api.post("/recurring", {
        title: values.title,
        type: values.type,
        amount: Number(values.amount),
        categoryId: values.categoryId || null,
        accountId: values.accountId || null,
        frequency: values.frequency,
        startDate: values.startDate,
        endDate: toApiDate(values.endDate),
        autoCreateTransaction: values.autoCreateTransaction
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recurring"] });
      reset(defaultFormValues);
      setActionError(null);
      showToast("Recurring transaction added successfully.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to create recurring transaction.";
      setActionError(message);
      showToast(typeof message === "string" ? message : "Failed to create recurring transaction.", "error");
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; values: RecurringForm }) => {
      await api.put(`/recurring/${payload.id}`, {
        title: payload.values.title,
        amount: Number(payload.values.amount),
        categoryId: payload.values.categoryId || null,
        accountId: payload.values.accountId || null,
        frequency: payload.values.frequency,
        startDate: payload.values.startDate,
        endDate: toApiDate(payload.values.endDate),
        nextRunDate: payload.values.nextRunDate,
        autoCreateTransaction: payload.values.autoCreateTransaction,
        isPaused: payload.values.isPaused
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recurring"] });
      setEditingItem(null);
      reset(defaultFormValues);
      setActionError(null);
      showToast("Recurring transaction updated successfully.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to update recurring transaction.";
      setActionError(message);
      showToast(typeof message === "string" ? message : "Failed to update recurring transaction.", "error");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/recurring/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recurring"] });
      if (editingItem) {
        setEditingItem(null);
        reset(defaultFormValues);
      }
      setRecurringToDelete(null);
      setActionError(null);
      showToast("Recurring transaction deleted successfully.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to delete recurring transaction.";
      setRecurringToDelete(null);
      setActionError(message);
      showToast(typeof message === "string" ? message : "Failed to delete recurring transaction.", "error");
    }
  });

  const togglePauseMutation = useMutation({
    mutationFn: async (item: RecurringItem) => {
      await api.put(`/recurring/${item.id}`, {
        title: item.title,
        amount: Number(item.amount),
        categoryId: item.categoryId ?? null,
        accountId: item.accountId ?? null,
        frequency: item.frequency,
        startDate: toDateInput(item.startDate),
        endDate: toApiDate(toDateInput(item.endDate)),
        nextRunDate: toDateInput(item.nextRunDate),
        autoCreateTransaction: item.autoCreateTransaction,
        isPaused: !item.isPaused
      });
    },
    onSuccess: async (_, item) => {
      await queryClient.invalidateQueries({ queryKey: ["recurring"] });
      showToast(item.isPaused ? "Recurring transaction resumed." : "Recurring transaction paused.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to update status.";
      showToast(typeof message === "string" ? message : "Failed to update status.", "error");
    }
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  function startEdit(item: RecurringItem) {
    setEditingItem(item);
    setActionError(null);
    reset({
      title: item.title,
      type: item.type === "income" ? "income" : "expense",
      amount: Number(item.amount),
      accountId: item.accountId ?? "",
      categoryId: item.categoryId ?? "",
      frequency: (item.frequency as RecurringForm["frequency"]) ?? "monthly",
      startDate: toDateInput(item.startDate),
      endDate: toDateInput(item.endDate),
      nextRunDate: toDateInput(item.nextRunDate),
      autoCreateTransaction: item.autoCreateTransaction,
      isPaused: item.isPaused
    });
  }

  function cancelEdit() {
    setEditingItem(null);
    setActionError(null);
    reset(defaultFormValues);
  }

  const onSubmit = handleSubmit((values) => {
    setActionError(null);

    if (values.amount <= 0) {
      const message = "Amount must be greater than 0.";
      setActionError(message);
      showToast(message, "error");
      return;
    }

    if (values.endDate && values.endDate < values.startDate) {
      const message = "End date cannot be before start date.";
      setActionError(message);
      showToast(message, "error");
      return;
    }

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, values });
      return;
    }

    createMutation.mutate(values);
  });

  return (
    <section>
      <div className="section-head recurring-head">
        <h2>Recurring Transactions</h2>
        <div className="recurring-summary-row">
          <span className="recurring-summary-chip recurring-summary-chip-total">Total {recurringItems.length}</span>
          <span className="recurring-summary-chip recurring-summary-chip-active">Active {activeCount}</span>
          <span className="recurring-summary-chip recurring-summary-chip-paused">Paused {pausedCount}</span>
        </div>
      </div>

      <article className="card recurring-form-card">
        <h3>{editingItem ? "Edit Recurring Transaction" : "Add Recurring Transaction"}</h3>
        <form className="inline-form recurring-form" onSubmit={onSubmit}>
          <div className="recurring-form-grid">
            <div className="recurring-field recurring-field-wide">
              <label>
                Title
                <input type="text" {...register("title", { required: "Title is required" })} />
              </label>
              {errors.title ? <p className="error-text">{errors.title.message}</p> : null}
            </div>

            <div className="recurring-field">
              <label>
                Type
                <select {...register("type", { required: true })} disabled={Boolean(editingItem)}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </label>
            </div>

            <div className="recurring-field">
              <label>
                Amount
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
            </div>

            <div className="recurring-field">
              <label>
                Account
                <select {...register("accountId", { required: "Account is required" })}>
                  <option value="">Select account</option>
                  {(accountsQuery.data ?? []).map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>
              {errors.accountId ? <p className="error-text">{errors.accountId.message}</p> : null}
            </div>

            <div className="recurring-field">
              <label>
                Category
                <select {...register("categoryId", { required: "Category is required" })}>
                  <option value="">Select category</option>
                  {filteredCategories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              {errors.categoryId ? <p className="error-text">{errors.categoryId.message}</p> : null}
            </div>

            <div className="recurring-field">
              <label>
                Frequency
                <select {...register("frequency", { required: true })}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
            </div>

            <div className="recurring-field">
              <label>
                Start Date
                <input type="date" {...register("startDate", { required: "Start date is required" })} />
              </label>
              {errors.startDate ? <p className="error-text">{errors.startDate.message}</p> : null}
            </div>

            <div className="recurring-field">
              <label>
                End Date (optional)
                <input type="date" {...register("endDate")} />
              </label>
            </div>

            {editingItem ? (
              <div className="recurring-field">
                <label>
                  Next Run Date
                  <input type="date" {...register("nextRunDate", { required: "Next run date is required in edit mode" })} />
                </label>
              </div>
            ) : null}
          </div>

          {editingItem ? <p className="hint-text">Type cannot be changed while editing.</p> : null}
          {accountsQuery.isLoading || categoriesQuery.isLoading ? <p className="hint-text">Loading accounts and categories...</p> : null}

          <div className="recurring-switch-row">
            <label className="recurring-check-row">
              <input type="checkbox" {...register("autoCreateTransaction")} />
              <span>Auto create transaction</span>
            </label>

            {editingItem ? (
              <label className="recurring-check-row">
                <input type="checkbox" {...register("isPaused")} />
                <span>Pause this recurring transaction</span>
              </label>
            ) : null}
          </div>

          {actionError ? <p className="error-text">{actionError}</p> : null}

          <div className="inline-form-actions">
            {editingItem ? <button type="button" className="ghost" onClick={cancelEdit}>Cancel</button> : null}
            <button className="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : editingItem ? "Update Recurring" : "Add Recurring"}
            </button>
          </div>
        </form>
      </article>

      {recurringQuery.isLoading ? <p>Loading recurring transactions...</p> : null}

      {!recurringQuery.isLoading && recurringItems.length === 0 ? (
        <article className="card">
          <p>No recurring transactions found.</p>
        </article>
      ) : null}

      <div className="recurring-grid">
        {recurringItems.map((item) => (
          <article className={`card recurring-card ${item.isPaused ? "recurring-paused" : "recurring-active"}`} key={item.id}>
            <div className="recurring-card-head">
              <div className="recurring-card-title-wrap">
                <h3>{item.title}</h3>
                <span className={`recurring-type recurring-type-${item.type === "income" ? "income" : "expense"}`}>
                  {toLabel(item.type)}
                </span>
              </div>
              <div className="recurring-card-status-wrap">
                <span className={`recurring-status ${item.isPaused ? "paused" : "active"}`}>
                  {item.isPaused ? "Paused" : "Active"}
                </span>
              </div>
            </div>

            <div className="recurring-metrics">
              <p><span>Amount</span><strong>{formatCurrency(Number(item.amount))}</strong></p>
              <p><span>Account</span><strong>{item.accountId ? (accountById.get(item.accountId) ?? "Unknown Account") : "Not set"}</strong></p>
              <p><span>Category</span><strong>{item.categoryId ? (categoryById.get(item.categoryId) ?? "Unknown Category") : "Not set"}</strong></p>
              <p><span>Frequency</span><strong>{toLabel(item.frequency)}</strong></p>
              <p><span>Start</span><strong>{formatDate(item.startDate)}</strong></p>
              <p><span>Next Run</span><strong>{formatDate(item.nextRunDate)}</strong></p>
              <p><span>End</span><strong>{formatDate(item.endDate)}</strong></p>
            </div>

            <p className="recurring-hint">Auto create: {item.autoCreateTransaction ? "Enabled" : "Disabled"}</p>

            <div className="recurring-actions">
              <button type="button" className="recurring-action-btn recurring-edit" onClick={() => startEdit(item)}>Edit</button>
              <button type="button" className="recurring-action-btn recurring-toggle" onClick={() => togglePauseMutation.mutate(item)} disabled={togglePauseMutation.isPending}>
                {item.isPaused ? "Resume" : "Pause"}
              </button>
              <button type="button" className="recurring-action-btn recurring-delete" onClick={() => setRecurringToDelete(item)} disabled={deleteMutation.isPending}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>

      {recurringToDelete ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Delete recurring transaction confirmation">
          <div className="modal-card">
            <div className="modal-header"><h3>Delete Recurring Transaction</h3></div>
            <p className="confirm-text">Delete recurring transaction <strong>{recurringToDelete.title}</strong>?</p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setRecurringToDelete(null)} disabled={deleteMutation.isPending}>Cancel</button>
              <button type="button" className="danger" onClick={() => deleteMutation.mutate(recurringToDelete.id)} disabled={deleteMutation.isPending}>
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
