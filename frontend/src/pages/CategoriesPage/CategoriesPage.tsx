import "./CategoriesPage.css";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { api } from "../../services/api";

type Category = {
  id: string;
  name: string;
  type: "expense" | "income";
  color?: string | null;
  icon?: string | null;
  isArchived: boolean;
};

type CategoryForm = {
  name: string;
  type: "expense" | "income";
  color: string;
  icon: string;
};

type ToastState = {
  message: string;
  variant: "success" | "error";
};

const defaultFormValues: CategoryForm = {
  name: "",
  type: "expense",
  color: "#ef4444",
  icon: ""
};

async function fetchCategories() {
  const { data } = await api.get<Category[]>("/categories");
  return data;
}

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const query = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<CategoryForm>({
    defaultValues: defaultFormValues
  });

  const typeValue = watch("type");

  function showToast(message: string, variant: "success" | "error" = "success") {
    setToast({ message, variant });
    window.setTimeout(() => setToast(null), 2600);
  }

  function getFallbackColor(type: Category["type"]) {
    return type === "income" ? "#22c55e" : "#ef4444";
  }

  const createMutation = useMutation({
    mutationFn: async (values: CategoryForm) => {
      await api.post("/categories", {
        name: values.name,
        type: values.type,
        color: values.color || null,
        icon: values.icon.trim() || null
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      reset(defaultFormValues);
      setActionError(null);
      showToast("Category added successfully.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to create category.";
      setActionError(message);
      showToast(typeof message === "string" ? message : "Something went wrong.", "error");
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; values: CategoryForm; isArchived: boolean }) => {
      await api.put(`/categories/${payload.id}`, {
        name: payload.values.name,
        type: payload.values.type,
        color: payload.values.color || null,
        icon: payload.values.icon.trim() || null,
        isArchived: payload.isArchived
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      setEditingCategoryId(null);
      reset(defaultFormValues);
      setActionError(null);
      showToast("Category updated successfully.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to update category.";
      setActionError(message);
      showToast(typeof message === "string" ? message : "Something went wrong.", "error");
    }
  });

  const archiveMutation = useMutation({
    mutationFn: async (category: Category) => {
      await api.put(`/categories/${category.id}`, {
        name: category.name,
        type: category.type,
        color: category.color ?? null,
        icon: category.icon ?? null,
        isArchived: !category.isArchived
      });
    },
    onSuccess: async (_data, category) => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      showToast(category.isArchived ? "Category restored." : "Category archived.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to archive category.";
      showToast(typeof message === "string" ? message : "Something went wrong.", "error");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/categories/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      if (editingCategoryId) {
        setEditingCategoryId(null);
        reset(defaultFormValues);
      }
      setActionError(null);
      setCategoryToDelete(null);
      showToast("Category deleted successfully.", "success");
    },
    onError: (error: any) => {
      const message = error?.response?.data || "Failed to delete category.";
      setActionError(message);
      setCategoryToDelete(null);
      showToast(typeof message === "string" ? message : "Something went wrong.", "error");
    }
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const activeExpenseCategories = useMemo(
    () => (query.data ?? []).filter((category) => category.type === "expense" && !category.isArchived),
    [query.data]
  );

  const activeIncomeCategories = useMemo(
    () => (query.data ?? []).filter((category) => category.type === "income" && !category.isArchived),
    [query.data]
  );

  const archivedCategories = useMemo(
    () => (query.data ?? []).filter((category) => category.isArchived),
    [query.data]
  );

  function startEdit(category: Category) {
    setEditingCategoryId(category.id);
    setActionError(null);
    reset({
      name: category.name,
      type: category.type,
      color: category.color ?? getFallbackColor(category.type),
      icon: category.icon ?? ""
    });
  }

  function cancelEdit() {
    setEditingCategoryId(null);
    setActionError(null);
    reset(defaultFormValues);
  }

  const onSubmit = handleSubmit((values) => {
    setActionError(null);

    if (editingCategoryId) {
      const existing = (query.data ?? []).find((category) => category.id === editingCategoryId);
      updateMutation.mutate({ id: editingCategoryId, values, isArchived: existing?.isArchived ?? false });
      return;
    }

    createMutation.mutate(values);
  });

  function CategoryCard(category: Category) {
    const cardClass = category.type === "income" ? "category-card-income" : "category-card-expense";
    const chipColor = category.color || getFallbackColor(category.type);

    return (
      <article className={`card category-card ${cardClass} ${category.isArchived ? "category-card-archived" : ""}`} key={category.id}>
        <div className="category-card-head">
          <span className="category-icon" style={{ backgroundColor: chipColor }}>{category.icon || "#"}</span>
          <div>
            <h3 className="category-title">{category.name}</h3>
            <p className="category-subtitle">Type: {category.type}</p>
          </div>
        </div>

        <div className="category-card-actions">
          <button type="button" className="cat-action-btn cat-action-edit" onClick={() => startEdit(category)}>Edit</button>
          <button
            type="button"
            className="cat-action-btn"
            onClick={() => archiveMutation.mutate(category)}
            disabled={archiveMutation.isPending}
          >
            {category.isArchived ? "Unarchive" : "Archive"}
          </button>
          <button
            type="button"
            className="cat-action-btn cat-action-delete"
            onClick={() => setCategoryToDelete(category)}
            disabled={deleteMutation.isPending}
          >
            Delete
          </button>
        </div>
      </article>
    );
  }

  return (
    <section>
      <div className="section-head">
        <h2>Categories</h2>
      </div>

      <article className="card">
        <h3>{editingCategoryId ? "Edit Category" : "Add Custom Category"}</h3>
        <form className="inline-form" onSubmit={onSubmit}>
          <label>
            Name
            <input type="text" {...register("name", { required: "Name is required" })} />
          </label>
          {errors.name && <p className="error-text">{errors.name.message}</p>}

          <div className="category-form-row">
            <label>
              Type
              <select {...register("type", { required: true })}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </label>

            <label>
              Color
              <input type="color" {...register("color")} defaultValue={typeValue === "income" ? "#22c55e" : "#ef4444"} />
            </label>

            <label>
              Icon
              <input type="text" maxLength={24} placeholder="eg: food" {...register("icon")} />
            </label>
          </div>

          {actionError && <p className="error-text">{actionError}</p>}

          <div className="inline-form-actions">
            {editingCategoryId ? <button type="button" className="ghost" onClick={cancelEdit}>Cancel</button> : null}
            <button className="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : editingCategoryId ? "Update Category" : "Add Category"}
            </button>
          </div>
        </form>
      </article>

      <section className="category-group-wrap">
        <div className="category-group-title-row">
          <h3>Expense Categories</h3>
          <span className="category-count">{activeExpenseCategories.length}</span>
        </div>
        <div className="categories-grid">
          {activeExpenseCategories.map((category) => CategoryCard(category))}
        </div>
      </section>

      <section className="category-group-wrap">
        <div className="category-group-title-row">
          <h3>Income Categories</h3>
          <span className="category-count">{activeIncomeCategories.length}</span>
        </div>
        <div className="categories-grid">
          {activeIncomeCategories.map((category) => CategoryCard(category))}
        </div>
      </section>

      {archivedCategories.length > 0 ? (
        <section className="category-group-wrap">
          <div className="category-group-title-row">
            <h3>Archived Categories</h3>
            <span className="category-count">{archivedCategories.length}</span>
          </div>
          <div className="categories-grid">
            {archivedCategories.map((category) => CategoryCard(category))}
          </div>
        </section>
      ) : null}

      {categoryToDelete ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Delete category confirmation">
          <div className="modal-card">
            <div className="modal-header"><h3>Delete Category</h3></div>
            <p className="confirm-text">Delete category <strong>{categoryToDelete.name}</strong>?</p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setCategoryToDelete(null)} disabled={deleteMutation.isPending}>Cancel</button>
              <button type="button" className="danger" onClick={() => deleteMutation.mutate(categoryToDelete.id)} disabled={deleteMutation.isPending}>
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


