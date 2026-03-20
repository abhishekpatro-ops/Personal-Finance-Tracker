import "./GoalsPage.css";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { api } from "../../services/api";

type Goal = {
  id: string;
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string | null;
  status: "active" | "completed" | string;
  linkedAccountId?: string | null;
  icon?: string | null;
  color?: string | null;
};

type Account = {
  id: string;
  name: string;
  currentBalance: number;
  type: string;
};

type GoalForm = {
  name: string;
  targetAmount: number;
  targetDate: string;
  linkedAccountId: string;
  icon: string;
  color: string;
};

type ToastState = {
  message: string;
  variant: "success" | "error";
};

const defaultFormValues: GoalForm = {
  name: "",
  targetAmount: 0,
  targetDate: "",
  linkedAccountId: "",
  icon: "",
  color: "#2563eb"
};

async function fetchGoals() {
  const { data } = await api.get<Goal[]>("/goals");
  return data;
}

async function fetchAccounts() {
  const { data } = await api.get<Account[]>("/accounts");
  return data;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);
}

function toApiDate(value: string): string | null {
  return value.trim() ? value : null;
}

function formatAccountType(value: string) {
  if (!value) return "Unknown";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function GoalsPage() {
  const queryClient = useQueryClient();
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("active");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionAmountByGoal, setActionAmountByGoal] = useState<Record<string, string>>({});
  const [actionAccountByGoal, setActionAccountByGoal] = useState<Record<string, string>>({});
  const [goalToDelete, setGoalToDelete] = useState<Goal | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const goalsQuery = useQuery({ queryKey: ["goals"], queryFn: fetchGoals });
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<GoalForm>({
    defaultValues: defaultFormValues
  });

  const accountById = useMemo(() => {
    const map = new Map<string, Account>();
    for (const account of accountsQuery.data ?? []) {
      map.set(account.id, account);
    }
    return map;
  }, [accountsQuery.data]);

  function showToast(message: string, variant: "success" | "error" = "success") {
    setToast({ message, variant });
    window.setTimeout(() => {
      setToast(null);
    }, 2600);
  }

  const createMutation = useMutation({
    mutationFn: async (values: GoalForm) => {
      await api.post("/goals", {
        name: values.name,
        targetAmount: Number(values.targetAmount),
        targetDate: toApiDate(values.targetDate),
        linkedAccountId: values.linkedAccountId || null,
        icon: values.icon.trim() || null,
        color: values.color || null
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["goals"] });
      reset(defaultFormValues);
      setActionError(null);
      showToast("Goal added successfully.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to create goal.";
      setActionError(message);
      showToast(typeof message === "string" ? message : "Failed to create goal.", "error");
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; values: GoalForm }) => {
      const existing = (goalsQuery.data ?? []).find((goal) => goal.id === payload.id);
      if (!existing) {
        throw new Error("Goal not found for update.");
      }

      await api.put(`/goals/${payload.id}`, {
        name: payload.values.name,
        targetAmount: Number(payload.values.targetAmount),
        currentAmount: Number(existing.currentAmount),
        targetDate: toApiDate(payload.values.targetDate),
        status: existing.status,
        linkedAccountId: payload.values.linkedAccountId || null,
        icon: payload.values.icon.trim() || null,
        color: payload.values.color || null
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["goals"] });
      setEditingGoalId(null);
      reset(defaultFormValues);
      setActionError(null);
      showToast("Goal updated successfully.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to update goal.";
      setActionError(message);
      showToast(typeof message === "string" ? message : "Failed to update goal.", "error");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/goals/${id}`);
    },
    onSuccess: async (_, deletedId) => {
      await queryClient.invalidateQueries({ queryKey: ["goals"] });
      if (editingGoalId === deletedId) {
        setEditingGoalId(null);
        reset(defaultFormValues);
      }
      setGoalToDelete(null);
      setActionError(null);
      showToast("Goal deleted successfully.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to delete goal.";
      setActionError(message);
      showToast(message, "error");
      setGoalToDelete(null);
    }
  });

  const contributeMutation = useMutation({
    mutationFn: async (payload: { id: string; amount: number; accountId: string | null }) => {
      await api.post(`/goals/${payload.id}/contribute`, {
        amount: payload.amount,
        accountId: payload.accountId
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["goals"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
      ]);
      setActionError(null);
      showToast("Amount contributed successfully.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to contribute to goal.";
      setActionError(message);
      showToast(typeof message === "string" ? message : "Failed to contribute to goal.", "error");
    }
  });

  const withdrawMutation = useMutation({
    mutationFn: async (payload: { id: string; amount: number; accountId: string | null }) => {
      await api.post(`/goals/${payload.id}/withdraw`, {
        amount: payload.amount,
        accountId: payload.accountId
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["goals"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
      ]);
      setActionError(null);
      showToast("Amount withdrawn successfully.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to withdraw from goal.";
      setActionError(message);
      showToast(typeof message === "string" ? message : "Failed to withdraw from goal.", "error");
    }
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/goals/${id}/complete`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["goals"] });
      showToast("Goal marked completed.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to mark goal completed.";
      showToast(typeof message === "string" ? message : "Failed to mark goal completed.", "error");
    }
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const isActionPending = contributeMutation.isPending || withdrawMutation.isPending || completeMutation.isPending;

  const filteredGoals = useMemo(() => {
    const goals = goalsQuery.data ?? [];
    const sorted = [...goals].sort((a, b) => {
      const ad = a.targetDate ?? "9999-12-31";
      const bd = b.targetDate ?? "9999-12-31";
      return ad.localeCompare(bd);
    });

    if (filter === "all") return sorted;
    return sorted.filter((goal) => goal.status === filter);
  }, [goalsQuery.data, filter]);

  function startEdit(goal: Goal) {
    setEditingGoalId(goal.id);
    setActionError(null);
    reset({
      name: goal.name,
      targetAmount: Number(goal.targetAmount),
      targetDate: goal.targetDate ?? "",
      linkedAccountId: goal.linkedAccountId ?? "",
      icon: goal.icon ?? "",
      color: goal.color ?? "#2563eb"
    });
  }

  function cancelEdit() {
    setEditingGoalId(null);
    setActionError(null);
    reset(defaultFormValues);
  }

  const onSubmit = handleSubmit((values) => {
    setActionError(null);
    if (editingGoalId) {
      updateMutation.mutate({ id: editingGoalId, values });
      return;
    }
    createMutation.mutate(values);
  });

  function handleGoalAction(id: string, action: "contribute" | "withdraw") {
    const goal = (goalsQuery.data ?? []).find((g) => g.id === id);
    if (!goal) return;

    const selectedActionAccount = actionAccountByGoal[id] || goal.linkedAccountId || "";

    if (!selectedActionAccount) {
      const message = "Select an account for this action or link one to goal.";
      setActionError(message);
      showToast(message, "error");
      return;
    }

    const rawAmount = actionAmountByGoal[id] ?? "";
    const amount = Number(rawAmount);

    if (!rawAmount || Number.isNaN(amount) || amount <= 0) {
      const message = "Enter a valid amount greater than 0 before applying an action.";
      setActionError(message);
      showToast(message, "error");
      return;
    }

    setActionError(null);
    if (action === "contribute") {
      contributeMutation.mutate({ id, amount, accountId: selectedActionAccount });
      return;
    }
    withdrawMutation.mutate({ id, amount, accountId: selectedActionAccount });
  }

  return (
    <section>
      <div className="section-head">
        <h2>Goals</h2>
      </div>

      <article className="card">
        <h3>{editingGoalId ? "Edit Goal" : "Add Goal"}</h3>
        <form className="inline-form" onSubmit={onSubmit}>
          <label>
            Goal Name
            <input
              type="text"
              {...register("name", {
                required: "Goal name is required"
              })}
            />
          </label>
          {errors.name ? <p className="error-text">{errors.name.message}</p> : null}

          <label>
            Target Amount
            <input
              type="number"
              min={0.01}
              step="0.01"
              {...register("targetAmount", {
                valueAsNumber: true,
                required: "Target amount is required",
                min: { value: 0.01, message: "Target amount must be greater than 0" }
              })}
            />
          </label>
          {errors.targetAmount ? <p className="error-text">{errors.targetAmount.message}</p> : null}

          <div className="goal-form-grid">
            <label>
              Linked Account (optional)
              <select {...register("linkedAccountId")}>
                <option value="">No linked account</option>
                {(accountsQuery.data ?? []).map((account) => (
                  <option value={account.id} key={account.id}>
                    {account.name} ({formatAccountType(account.type)})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Target Date (optional)
              <input type="date" {...register("targetDate")} />
            </label>

            <label>
              Color
              <input type="color" {...register("color")} />
            </label>

            <label>
              Icon
              <input type="text" maxLength={24} placeholder="eg: house" {...register("icon")} />
            </label>
          </div>

          {actionError ? <p className="error-text">{actionError}</p> : null}

          <div className="inline-form-actions">
            {editingGoalId ? <button type="button" className="ghost" onClick={cancelEdit}>Cancel</button> : null}
            <button className="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : editingGoalId ? "Update Goal" : "Add Goal"}
            </button>
          </div>
        </form>
      </article>

      <div className="goal-filter-row">
        <div className="goal-filter-tabs" role="tablist" aria-label="Goal filter">
          <button type="button" className={`goal-filter-btn ${filter === "active" ? "active" : ""}`} onClick={() => setFilter("active")}>Active</button>
          <button type="button" className={`goal-filter-btn ${filter === "completed" ? "active" : ""}`} onClick={() => setFilter("completed")}>Completed</button>
          <button type="button" className={`goal-filter-btn ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All</button>
        </div>
      </div>

      {goalsQuery.isLoading || accountsQuery.isLoading ? <p>Loading goals...</p> : null}

      {!goalsQuery.isLoading && filteredGoals.length === 0 ? (
        <article className="card">
          <p>No goals found for this filter.</p>
        </article>
      ) : null}

      <div className="goals-grid">
        {filteredGoals.map((goal) => {
          const target = Number(goal.targetAmount);
          const current = Number(goal.currentAmount);
          const progress = target > 0 ? (current / target) * 100 : 0;
          const remaining = Math.max(target - current, 0);
          const over = Math.max(current - target, 0);
          const isCompleted = goal.status === "completed" || current >= target;
          const linkedAccount = goal.linkedAccountId ? accountById.get(goal.linkedAccountId) : undefined;
          const displayIcon = goal.icon?.trim() ? goal.icon : "#";
          const displayColor = goal.color?.trim() ? goal.color : "#2563eb";

          return (
            <article className={`card goal-card ${isCompleted ? "goal-completed" : "goal-active"}`} key={goal.id}>
              <div className="goal-card-head">
                <div className="goal-title-wrap">
                  <span className="goal-icon" style={{ backgroundColor: displayColor }}>{displayIcon}</span>
                  <h3>{goal.name}</h3>
                </div>
                <span className={`goal-status-chip ${isCompleted ? "done" : "open"}`}>
                  {isCompleted ? "Completed" : "Active"}
                </span>
              </div>

              <p className="goal-target-line">
                {formatCurrency(current)} / {formatCurrency(target)}
              </p>

              <div className="goal-progress-track" aria-label="Goal progress">
                <div className={`goal-progress-bar ${isCompleted ? "done" : "open"}`} style={{ width: `${Math.min(progress, 100)}%` }} />
              </div>
              <p className="goal-progress-label">{progress.toFixed(1)}% achieved</p>

              <div className="goal-metrics">
                <p><span>id</span><strong>{goal.id}</strong></p>
                <p><span>userId</span><strong>{goal.userId}</strong></p>
                <p><span>Remaining</span><strong>{formatCurrency(remaining)}</strong></p>
                {over > 0 ? <p><span>Over target</span><strong className="goal-over">{formatCurrency(over)}</strong></p> : null}
                <p><span>Target Date</span><strong>{goal.targetDate ?? "Not set"}</strong></p>
                <p><span>Linked Account</span><strong>{linkedAccount?.name ?? "Not linked"}</strong></p>
                <p><span>Status</span><strong>{isCompleted ? "completed" : "active"}</strong></p>
              </div>

              <div className="goal-action-row">
                <div className="goal-action-inputs">
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    placeholder="Amount"
                    value={actionAmountByGoal[goal.id] ?? ""}
                    onChange={(e) => setActionAmountByGoal((prev) => ({ ...prev, [goal.id]: e.target.value }))}
                  />
                  <select
                    value={actionAccountByGoal[goal.id] ?? goal.linkedAccountId ?? ""}
                    onChange={(e) => setActionAccountByGoal((prev) => ({ ...prev, [goal.id]: e.target.value }))}
                  >
                    <option value="">Select account</option>
                    {(accountsQuery.data ?? []).map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>

                <div className="goal-action-buttons">
                  <button
                    type="button"
                    className="goal-action-btn goal-add"
                    onClick={() => handleGoalAction(goal.id, "contribute")}
                    disabled={isActionPending}
                  >
                    Contribute
                  </button>
                  <button
                    type="button"
                    className="goal-action-btn goal-withdraw"
                    onClick={() => handleGoalAction(goal.id, "withdraw")}
                    disabled={isActionPending}
                  >
                    Withdraw
                  </button>
                  {!isCompleted ? (
                    <button
                      type="button"
                      className="goal-action-btn goal-complete"
                      onClick={() => completeMutation.mutate(goal.id)}
                      disabled={isActionPending}
                    >
                      Mark Completed
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="goal-card-actions">
                <button type="button" className="goal-action-btn goal-edit" onClick={() => startEdit(goal)}>Edit</button>
                <button
                  type="button"
                  className="goal-action-btn goal-delete"
                  onClick={() => setGoalToDelete(goal)}
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {goalToDelete ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Delete goal confirmation">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Delete Goal</h3>
            </div>
            <p className="goal-confirm-text">
              Are you sure you want to delete <strong>{goalToDelete.name}</strong>? This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setGoalToDelete(null)} disabled={deleteMutation.isPending}>
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => deleteMutation.mutate(goalToDelete.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Goal"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className={`app-toast app-toast-${toast.variant}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      ) : null}
    </section>
  );
}

