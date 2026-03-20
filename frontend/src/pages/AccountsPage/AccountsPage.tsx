import "./AccountsPage.css";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { api } from "../../services/api";

type Account = {
  id: string;
  userId: string;
  name: string;
  type: "bank" | "credit_card" | "cash" | "savings" | string;
  openingBalance: number;
  currentBalance: number;
  institutionName?: string | null;
  isPrimary: boolean;
  lastUpdatedAt: string;
};

type AccountForm = {
  name: string;
  type: "bank" | "credit_card" | "cash" | "savings";
  openingBalance: number;
  currentBalance: number;
  institutionName: string;
  isPrimary: boolean;
};

type TransferForm = {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
};

type ToastState = {
  message: string;
  variant: "success" | "error";
};

const defaultFormValues: AccountForm = {
  name: "",
  type: "bank",
  openingBalance: 0,
  currentBalance: 0,
  institutionName: "",
  isPrimary: false
};

const defaultTransferValues: TransferForm = {
  sourceAccountId: "",
  destinationAccountId: "",
  amount: 0
};

async function fetchAccounts() {
  const { data } = await api.get<Account[]>("/accounts");
  return data;
}

function extractApiError(error: any, fallback: string): string {
  const data = error?.response?.data;
  if (typeof data === "string" && data.trim().length > 0) return data;
  if (typeof data?.message === "string" && data.message.trim().length > 0) return data.message;
  if (typeof data?.title === "string" && data.title.trim().length > 0) return data.title;
  return fallback;
}

function prettyType(type: string): string {
  if (type === "credit_card") return "Credit card";
  if (type === "cash") return "Cash wallet";
  if (type === "savings") return "Savings account";
  return "Bank account";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value ?? 0);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function AccountsPage() {
  const queryClient = useQueryClient();
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [activeDetailsAccount, setActiveDetailsAccount] = useState<Account | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [isTotalBalanceVisible, setIsTotalBalanceVisible] = useState(true);
  const [balanceVisibleById, setBalanceVisibleById] = useState<Record<string, boolean>>({});
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const query = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<AccountForm>({
    defaultValues: defaultFormValues
  });

  const {
    register: registerTransfer,
    handleSubmit: handleTransferSubmit,
    watch: watchTransfer,
    reset: resetTransfer,
    formState: { errors: transferErrors }
  } = useForm<TransferForm>({
    defaultValues: defaultTransferValues
  });

  function showToast(message: string, variant: "success" | "error" = "success") {
    setToast({ message, variant });
    window.setTimeout(() => setToast(null), 2600);
  }

  const selectedType = watch("type");
  const hasExistingPrimary = useMemo(() => (query.data ?? []).some((a) => a.isPrimary), [query.data]);
  const isEditingCurrentPrimary = !!editingAccount?.isPrimary;
  const isPrimaryAllowedByType = selectedType === "savings";
  const canSetPrimary = isPrimaryAllowedByType && (!hasExistingPrimary || isEditingCurrentPrimary);

  const sourceAccountId = watchTransfer("sourceAccountId");
  const destinationOptions = useMemo(
    () => (query.data ?? []).filter((account) => account.id !== sourceAccountId),
    [query.data, sourceAccountId]
  );

  const totalBalance = useMemo(
    () => (query.data ?? []).reduce((sum, account) => sum + Number(account.currentBalance), 0),
    [query.data]
  );

  useEffect(() => {
    if (!canSetPrimary) {
      setValue("isPrimary", false, { shouldDirty: true });
    }
  }, [canSetPrimary, setValue]);

  const createMutation = useMutation({
    mutationFn: async (values: AccountForm) => {
      await api.post("/accounts", {
        name: values.name,
        type: values.type,
        openingBalance: Number(values.openingBalance),
        institutionName: values.institutionName || null,
        isPrimary: values.type === "savings" && !hasExistingPrimary ? values.isPrimary : false
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      reset(defaultFormValues);
      setActionError(null);
      showToast("Account created successfully.", "success");
    },
    onError: (error: any) => {
      const message = extractApiError(error, "Failed to create account.");
      setActionError(message);
      showToast(message, "error");
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { account: Account; values: AccountForm }) => {
      await api.put(`/accounts/${payload.account.id}`, {
        name: payload.values.name,
        type: payload.values.type,
        currentBalance: Number(payload.values.currentBalance),
        institutionName: payload.values.institutionName || null,
        isPrimary: payload.values.type === "savings" && (payload.account.isPrimary || !hasExistingPrimary) ? payload.values.isPrimary : false
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setEditingAccount(null);
      reset(defaultFormValues);
      setActionError(null);
      showToast("Account updated successfully.", "success");
    },
    onError: (error: any) => {
      const message = extractApiError(error, "Failed to update account.");
      setActionError(message);
      showToast(message, "error");
    }
  });

  const transferMutation = useMutation({
    mutationFn: async (values: TransferForm) => {
      await api.post("/accounts/transfer", {
        sourceAccountId: values.sourceAccountId,
        destinationAccountId: values.destinationAccountId,
        amount: Number(values.amount)
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
      ]);
      setTransferError(null);
      resetTransfer(defaultTransferValues);
      showToast("Funds transferred successfully.", "success");
    },
    onError: (error: any) => {
      const message = extractApiError(error, "Failed to transfer funds.");
      setTransferError(message);
      showToast(message, "error");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/accounts/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      if (editingAccount) {
        setEditingAccount(null);
        reset(defaultFormValues);
      }
      if (activeDetailsAccount && accountToDelete && activeDetailsAccount.id === accountToDelete.id) {
        setActiveDetailsAccount(null);
      }
      setAccountToDelete(null);
      setActionError(null);
      showToast("Account deleted successfully.", "success");
    },
    onError: (error: any) => {
      const message = extractApiError(error, "Failed to delete account.");
      setActionError(message);
      setAccountToDelete(null);
      showToast(message, "error");
    }
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  function startEdit(account: Account) {
    setEditingAccount(account);
    setActionError(null);
    reset({
      name: account.name,
      type: (account.type as AccountForm["type"]) ?? "bank",
      openingBalance: account.openingBalance,
      currentBalance: account.currentBalance,
      institutionName: account.institutionName ?? "",
      isPrimary: account.type === "savings" ? account.isPrimary : false
    });
  }

  function cancelEdit() {
    setEditingAccount(null);
    setActionError(null);
    reset(defaultFormValues);
  }

  function toggleBalanceVisibility(id: string) {
    setBalanceVisibleById((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const onSubmit = handleSubmit((values) => {
    setActionError(null);

    if (editingAccount) {
      if (values.currentBalance < 0) {
        setActionError("Current balance cannot be negative.");
        return;
      }
      updateMutation.mutate({ account: editingAccount, values });
      return;
    }

    if (values.openingBalance < 0) {
      setActionError("Opening balance cannot be negative.");
      return;
    }

    createMutation.mutate(values);
  });

  const onTransferSubmit = handleTransferSubmit((values) => {
    setTransferError(null);

    if (values.amount <= 0) {
      setTransferError("Amount must be greater than 0.");
      return;
    }

    if (values.sourceAccountId === values.destinationAccountId) {
      setTransferError("Source and destination accounts must be different.");
      return;
    }

    transferMutation.mutate(values);
  });

  return (
    <section>
      <div className="section-head">
        <h2>Accounts</h2>
      </div>

      <article className="card account-summary-card">
        <p className="hint-text">View balance by account and manage account transfers.</p>
        <div className="account-total-row">
          <h3 className="account-total">
            <span>Total across accounts: {isTotalBalanceVisible ? formatCurrency(totalBalance) : "*****"}</span>
            <button
              type="button"
              className="ghost summary-visibility-btn"
              aria-label={isTotalBalanceVisible ? "Hide total amount" : "Show total amount"}
              title={isTotalBalanceVisible ? "Hide total amount" : "Show total amount"}
              onClick={() => setIsTotalBalanceVisible((visible) => !visible)}
            >
              {isTotalBalanceVisible ? "Hide Amount" : "Show Amount"}
            </button>
          </h3>
        </div>
      </article>

      <article className="card">
        <h3>{editingAccount ? "Edit Account" : "Create Account"}</h3>
        <form className="inline-form" onSubmit={onSubmit}>
          <label>
            Name
            <input type="text" {...register("name", { required: "Name is required" })} />
          </label>
          {errors.name && <p className="error-text">{errors.name.message}</p>}

          <div className="account-form-grid">
            <label>
              Type
              <select {...register("type", { required: true })}>
                <option value="bank">Bank account</option>
                <option value="credit_card">Credit card</option>
                <option value="cash">Cash wallet</option>
                <option value="savings">Savings account</option>
              </select>
            </label>

            <label>
              Institution Name
              <input type="text" placeholder="Optional" {...register("institutionName")} />
            </label>

            {editingAccount ? (
              <label>
                Current Balance
                <input type="number" step="0.01" {...register("currentBalance", { valueAsNumber: true, required: "Current balance is required" })} />
              </label>
            ) : (
              <label>
                Opening Balance
                <input type="number" step="0.01" {...register("openingBalance", { valueAsNumber: true, required: "Opening balance is required" })} />
              </label>
            )}
          </div>

          {editingAccount ? <p className="hint-text">Opening balance is fixed after creation. You can update current balance.</p> : null}

          <label className="checkbox-field checkbox-disabled-wrap">
            <input type="checkbox" {...register("isPrimary")} disabled={!canSetPrimary} />
            <span>Set as primary account</span>
            {!isPrimaryAllowedByType ? <small className="muted-note">Primary is only allowed for Savings account</small> : null}
            {isPrimaryAllowedByType && hasExistingPrimary && !isEditingCurrentPrimary ? <small className="muted-note">Primary account already exists</small> : null}
          </label>

          {actionError && <p className="error-text">{actionError}</p>}

          <div className="inline-form-actions">
            {editingAccount ? <button type="button" className="ghost" onClick={cancelEdit}>Cancel</button> : null}
            <button className="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : editingAccount ? "Update Account" : "Create Account"}
            </button>
          </div>
        </form>
      </article>

      <article className="card">
        <h3>Transfer Funds Between Accounts</h3>
        <form className="inline-form" onSubmit={onTransferSubmit}>
          <div className="account-form-grid">
            <label>
              Source Account
              <select {...registerTransfer("sourceAccountId", { required: "Source account is required" })}>
                <option value="">Select source</option>
                {(query.data ?? []).map((account) => (
                  <option key={account.id} value={account.id}>{account.name} ({formatCurrency(account.currentBalance)})</option>
                ))}
              </select>
            </label>

            <label>
              Destination Account
              <select {...registerTransfer("destinationAccountId", { required: "Destination account is required" })}>
                <option value="">Select destination</option>
                {destinationOptions.map((account) => (
                  <option key={account.id} value={account.id}>{account.name} ({formatCurrency(account.currentBalance)})</option>
                ))}
              </select>
            </label>

            <label>
              Amount
              <input type="number" step="0.01" {...registerTransfer("amount", { valueAsNumber: true, required: "Amount is required" })} />
            </label>
          </div>

          {transferErrors.sourceAccountId ? <p className="error-text">{transferErrors.sourceAccountId.message}</p> : null}
          {transferErrors.destinationAccountId ? <p className="error-text">{transferErrors.destinationAccountId.message}</p> : null}
          {transferErrors.amount ? <p className="error-text">{transferErrors.amount.message}</p> : null}
          {transferError ? <p className="error-text">{transferError}</p> : null}

          <div className="inline-form-actions">
            <button className="primary" type="submit" disabled={transferMutation.isPending || (query.data?.length ?? 0) < 2}>
              {transferMutation.isPending ? "Transferring..." : "Transfer Funds"}
            </button>
          </div>
        </form>
      </article>

      <div className="cards accounts-grid">
        {(query.data ?? []).map((account) => {
          const isBalanceVisible = !!balanceVisibleById[account.id];

          return (
            <article className={`card account-card ${account.isPrimary ? "account-card-primary" : ""}`} key={account.id}>
              <h3 className="account-title-row">
                <span>{account.name}</span>
                {account.isPrimary ? <span className="primary-badge">Primary</span> : null}
              </h3>
              <p className="account-type-line">Type: {prettyType(account.type)}</p>
              <p className="account-balance-row">Balance: {isBalanceVisible ? formatCurrency(account.currentBalance) : "*****"}
                <button
                  type="button"
                  className="ghost icon-only balance-eye"
                  aria-label={isBalanceVisible ? "Hide balance" : "Show balance"}
                  title={isBalanceVisible ? "Hide balance" : "Show balance"}
                  onClick={() => toggleBalanceVisibility(account.id)}
                >
                  {isBalanceVisible ? "Hide" : "Show"}
                </button>
              </p>

              <div className="account-card-actions">
                <button type="button" className="ghost" onClick={() => setActiveDetailsAccount(account)}>View Details</button>
                <button type="button" className="ghost" onClick={() => startEdit(account)}>Edit</button>
                <button type="button" className="danger" onClick={() => setAccountToDelete(account)} disabled={deleteMutation.isPending}>Delete</button>
              </div>
            </article>
          );
        })}
      </div>

      {activeDetailsAccount ? (
        <div className="account-drawer-overlay" role="dialog" aria-modal="true" aria-label="Account details">
          <aside className="account-drawer">
            <div className="account-drawer-head">
              <h3>{activeDetailsAccount.name} Details</h3>
              <button type="button" className="ghost" onClick={() => setActiveDetailsAccount(null)}>Close</button>
            </div>

            <div className="account-drawer-details">
              <p><span>id</span><strong>{activeDetailsAccount.id}</strong></p>
              <p><span>userId</span><strong>{activeDetailsAccount.userId}</strong></p>
              <p><span>name</span><strong>{activeDetailsAccount.name}</strong></p>
              <p><span>type</span><strong>{prettyType(activeDetailsAccount.type)}</strong></p>
              <p><span>openingBalance</span><strong>{formatCurrency(activeDetailsAccount.openingBalance)}</strong></p>
              <p><span>currentBalance</span><strong>{formatCurrency(activeDetailsAccount.currentBalance)}</strong></p>
              <p><span>institutionName</span><strong>{activeDetailsAccount.institutionName ?? "-"}</strong></p>
              <p><span>lastUpdatedAt</span><strong>{formatDate(activeDetailsAccount.lastUpdatedAt)}</strong></p>
            </div>
          </aside>
          <button type="button" className="account-drawer-backdrop" aria-label="Close details panel" onClick={() => setActiveDetailsAccount(null)} />
        </div>
      ) : null}

      {accountToDelete ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Delete account confirmation">
          <div className="modal-card">
            <div className="modal-header"><h3>Delete Account</h3></div>
            <p className="confirm-text">Delete account <strong>{accountToDelete.name}</strong>?</p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setAccountToDelete(null)} disabled={deleteMutation.isPending}>Cancel</button>
              <button type="button" className="danger" onClick={() => deleteMutation.mutate(accountToDelete.id)} disabled={deleteMutation.isPending}>
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



