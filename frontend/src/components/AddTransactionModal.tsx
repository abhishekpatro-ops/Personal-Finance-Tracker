import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { api } from "../services/api";

type AddTransactionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onToast?: (message: string, variant?: "success" | "error") => void;
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

type FormValues = {
  type: "expense" | "income" | "transfer";
  amount: number;
  date: string;
  accountId: string;
  destinationAccountId: string;
  categoryId: string;
  merchant: string;
  note: string;
  paymentMethod: string;
  recurringTransactionId: string;
  tagsCsv: string;
};

async function fetchAccounts() {
  const { data } = await api.get<Account[]>("/accounts");
  return data;
}

async function fetchCategories() {
  const { data } = await api.get<Category[]>("/categories");
  return data;
}

export function AddTransactionModal({ isOpen, onClose, onToast }: AddTransactionModalProps) {
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts, enabled: isOpen });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: fetchCategories, enabled: isOpen });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors }
  } = useForm<FormValues>({
    shouldUnregister: true,
    defaultValues: {
      type: "expense",
      amount: undefined,
      date: new Date().toISOString().split("T")[0],
      accountId: "",
      destinationAccountId: "",
      categoryId: "",
      merchant: "",
      note: "",
      paymentMethod: "",
      recurringTransactionId: "",
      tagsCsv: ""
    }
  });

  const txType = watch("type");
  const sourceAccountId = watch("accountId");
  const selectedCategoryId = watch("categoryId");

  const filteredCategories = useMemo(
    () => (categoriesQuery.data ?? []).filter((c) => c.type.toLowerCase() === txType && !c.isArchived),
    [categoriesQuery.data, txType]
  );

  const destinationAccounts = useMemo(
    () => (accountsQuery.data ?? []).filter((a) => a.id !== sourceAccountId),
    [accountsQuery.data, sourceAccountId]
  );

  useEffect(() => {
    if (!isOpen) return;

    const accounts = accountsQuery.data ?? [];
    if (!sourceAccountId && accounts.length > 0) {
      setValue("accountId", accounts[0].id);
    }
  }, [accountsQuery.data, isOpen, setValue, sourceAccountId]);

  useEffect(() => {
    if (!isOpen) return;

    if (txType === "transfer") {
      setValue("categoryId", "");
      return;
    }

    const categoryExists = filteredCategories.some((category) => category.id === selectedCategoryId);
    if (!selectedCategoryId || !categoryExists) {
      setValue("categoryId", filteredCategories[0]?.id ?? "");
    }
  }, [filteredCategories, isOpen, selectedCategoryId, setValue, txType]);

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const tags = values.tagsCsv
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      const payload = {
        accountId: values.accountId,
        destinationAccountId: values.type === "transfer" ? (values.destinationAccountId || null) : null,
        categoryId: values.type === "transfer" ? null : (values.categoryId || null),
        type: values.type,
        amount: Number(values.amount),
        date: values.date,
        merchant: values.merchant || null,
        note: values.note || null,
        paymentMethod: values.paymentMethod || null,
        recurringTransactionId: values.recurringTransactionId || null,
        tags
      };

      await api.post("/transactions", payload);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] })
      ]);
      reset();
      setSubmitError(null);
      onToast?.("Transaction added successfully.", "success");
      onClose();
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to save transaction.";
      setSubmitError(message);
      onToast?.(typeof message === "string" ? message : "Failed to save transaction.", "error");
    }
  });

  if (!isOpen) return null;

  const hasAccounts = (accountsQuery.data?.length ?? 0) > 0;
  const needsCategory = txType !== "transfer";
  const hasCategoriesForType = !needsCategory || filteredCategories.length > 0;

  const onSubmit = handleSubmit((values) => {
    setSubmitError(null);

    if (values.amount <= 0) {
      setSubmitError("Amount must be greater than 0.");
      return;
    }

    if (values.type === "transfer" && !values.destinationAccountId) {
      setSubmitError("Destination account is required for transfer.");
      return;
    }

    if (values.type === "transfer" && values.destinationAccountId === values.accountId) {
      setSubmitError("Source and destination account must be different.");
      return;
    }

    if (needsCategory && !values.categoryId) {
      setSubmitError("Category is required for income and expense.");
      return;
    }

    createMutation.mutate(values);
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Transaction</h3>
          <button type="button" className="ghost" onClick={onClose}>Close</button>
        </div>

        {!hasAccounts && !accountsQuery.isLoading ? (
          <p className="error-text">No accounts found. Add one from <Link to="/accounts" onClick={onClose}>Accounts</Link>.</p>
        ) : null}

        {hasAccounts && !hasCategoriesForType && !categoriesQuery.isLoading ? (
          <p className="error-text">No {txType} category found. Add one from <Link to="/categories" onClick={onClose}>Categories</Link>.</p>
        ) : null}

        <form className="modal-form" onSubmit={onSubmit}>
          <label>
            Type
            <select {...register("type", { required: true })}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </select>
          </label>

          <label>
            Amount
            <input type="number" step="0.01" min={0.01} {...register("amount", { required: "Amount is required", min: { value: 0.01, message: "Amount must be > 0" } })} />
          </label>
          {errors.amount && <p className="error-text">{errors.amount.message}</p>}

          <label>
            Date
            <input type="date" {...register("date", { required: "Date is required" })} />
          </label>
          {errors.date && <p className="error-text">{errors.date.message}</p>}

          <label>
            Account
            <select {...register("accountId", { required: "Account is required" })}>
              <option value="">Select account</option>
              {(accountsQuery.data ?? []).map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          {errors.accountId && <p className="error-text">{errors.accountId.message}</p>}

          {txType === "transfer" ? (
            <label>
              Destination Account
              <select {...register("destinationAccountId", { required: "Destination account is required for transfer" })}>
                <option value="">Select destination account</option>
                {destinationAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Category
              <select {...register("categoryId", { required: "Category is required" })}>
                <option value="">Select category</option>
                {filteredCategories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
          )}
          {errors.destinationAccountId && txType === "transfer" ? <p className="error-text">{errors.destinationAccountId.message}</p> : null}
          {errors.categoryId && txType !== "transfer" ? <p className="error-text">{errors.categoryId.message}</p> : null}

          <label>
            Merchant
            <input type="text" {...register("merchant")} />
          </label>

          <label>
            Note
            <input type="text" {...register("note")} />
          </label>

          <label>
            Payment Method
            <input type="text" {...register("paymentMethod")} placeholder="UPI, card, cash..." />
          </label>

          <label>
            Recurring Transaction Id (optional)
            <input type="text" {...register("recurringTransactionId")} />
          </label>

          <label>
            Tags (comma separated)
            <input type="text" {...register("tagsCsv")} placeholder="food,team,lunch" />
          </label>

          {submitError && <p className="error-text">{submitError}</p>}

          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
            <button className="primary" type="submit" disabled={!hasAccounts || !hasCategoriesForType || createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
