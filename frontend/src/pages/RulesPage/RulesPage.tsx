import "./RulesPage.css";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../services/api";

type Rule = {
  id: string;
  name: string;
  priority: number;
  isActive: boolean;
  conditionJson: {
    field: string;
    operator: string;
    value: string;
  };
  actionJson: {
    type: string;
    value: string;
  };
};

type RuleFormState = {
  name: string;
  priority: number;
  field: string;
  operator: string;
  conditionValue: string;
  actionType: string;
  actionValue: string;
  isActive: boolean;
};

const defaultForm: RuleFormState = {
  name: "",
  priority: 100,
  field: "merchant",
  operator: "equals",
  conditionValue: "",
  actionType: "set_category",
  actionValue: "",
  isActive: true
};

const fieldLabels: Record<string, string> = {
  merchant: "Merchant",
  note: "Note",
  type: "Type",
  amount: "Amount",
  category: "Category",
  category_name: "Category",
  category_id: "Category ID"
};

const operatorLabels: Record<string, string> = {
  equals: "equals",
  contains: "contains",
  gt: "is greater than",
  gte: "is greater than or equal to",
  lt: "is less than",
  lte: "is less than or equal to"
};

const actionLabels: Record<string, string> = {
  set_category: "Set category to",
  add_tag: "Add tag",
  trigger_alert: "Trigger alert"
};

function toTitle(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getConditionText(rule: Rule) {
  const field = fieldLabels[rule.conditionJson.field] ?? toTitle(rule.conditionJson.field);
  const op = operatorLabels[rule.conditionJson.operator] ?? rule.conditionJson.operator;
  return `${field} ${op} ${rule.conditionJson.value}`;
}

function getActionText(rule: Rule) {
  const action = actionLabels[rule.actionJson.type] ?? toTitle(rule.actionJson.type);
  return `${action} ${rule.actionJson.value}`;
}

async function fetchRules() {
  const { data } = await api.get<Rule[]>("/rules");
  return data;
}

function toUpdatePayload(rule: Rule, isActive: boolean = rule.isActive) {
  return {
    name: rule.name,
    priority: rule.priority,
    isActive,
    condition: {
      field: rule.conditionJson.field,
      operator: rule.conditionJson.operator,
      value: rule.conditionJson.value
    },
    action: {
      type: rule.actionJson.type,
      value: rule.actionJson.value
    }
  };
}

export function RulesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RuleFormState>(defaultForm);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({ queryKey: ["rules"], queryFn: fetchRules });

  const sortedRules = useMemo(
    () => [...(query.data ?? [])].sort((a, b) => a.priority - b.priority),
    [query.data]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        priority: Number(form.priority),
        isActive: form.isActive,
        condition: {
          field: form.field,
          operator: form.operator,
          value: form.conditionValue
        },
        action: {
          type: form.actionType,
          value: form.actionValue
        }
      };

      if (editingRuleId) {
        await api.put(`/rules/${editingRuleId}`, payload);
      } else {
        await api.post("/rules", payload);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rules"] });
      setEditingRuleId(null);
      setForm(defaultForm);
      setError(null);
    },
    onError: (err: any) => {
      setError(err?.response?.data || "Unable to save rule.");
    }
  });

  const toggleMutation = useMutation({
    mutationFn: async (payload: { rule: Rule; nextState: boolean }) => {
      await api.put(`/rules/${payload.rule.id}`, toUpdatePayload(payload.rule, payload.nextState));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rules"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/rules/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rules"] });
    }
  });

  function startEdit(rule: Rule) {
    setEditingRuleId(rule.id);
    setForm({
      name: rule.name,
      priority: rule.priority,
      field: rule.conditionJson.field,
      operator: rule.conditionJson.operator,
      conditionValue: rule.conditionJson.value,
      actionType: rule.actionJson.type,
      actionValue: rule.actionJson.value,
      isActive: rule.isActive
    });
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("Rule name is required.");
      return;
    }
    if (!form.conditionValue.trim()) {
      setError("Condition value is required.");
      return;
    }
    if (!form.actionValue.trim()) {
      setError("Action value is required.");
      return;
    }
    saveMutation.mutate();
  }

  return (
    <section className="rules-page">
      <div className="section-head">
        <h2>Rules Engine</h2>
      </div>

      <article className="card">
        <h3>{editingRuleId ? "Edit Rule" : "Create Rule"}</h3>

        <form className="inline-form" onSubmit={onSubmit}>
          <div className="rules-grid">
            <label className="rules-field rules-field-name">
              Rule Name
              <input type="text" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            </label>

            <label className="rules-field rules-field-priority">
              Priority
              <input type="number" min={1} max={1000} value={form.priority} onChange={(e) => setForm((prev) => ({ ...prev, priority: Number(e.target.value) }))} />
            </label>

            <label className="rules-field">
              Condition Field
              <select value={form.field} onChange={(e) => setForm((prev) => ({ ...prev, field: e.target.value }))}>
                <option value="merchant">Merchant</option>
                <option value="note">Note</option>
                <option value="type">Type</option>
                <option value="amount">Amount</option>
                <option value="category">Category</option>
              </select>
            </label>

            <label className="rules-field">
              Condition Operator
              <select value={form.operator} onChange={(e) => setForm((prev) => ({ ...prev, operator: e.target.value }))}>
                <option value="equals">Equals</option>
                <option value="contains">Contains</option>
                <option value="gt">Greater Than</option>
                <option value="gte">Greater or Equal</option>
                <option value="lt">Less Than</option>
                <option value="lte">Less or Equal</option>
              </select>
            </label>

            <label className="rules-field">
              Condition Value
              <input type="text" value={form.conditionValue} onChange={(e) => setForm((prev) => ({ ...prev, conditionValue: e.target.value }))} />
            </label>

            <label className="rules-field">
              Action Type
              <select value={form.actionType} onChange={(e) => setForm((prev) => ({ ...prev, actionType: e.target.value }))}>
                <option value="set_category">Set Category</option>
                <option value="add_tag">Add Tag</option>
                <option value="trigger_alert">Trigger Alert Message</option>
              </select>
            </label>

            <label className="rules-field rules-field-action-value">
              Action Value
              <input type="text" value={form.actionValue} onChange={(e) => setForm((prev) => ({ ...prev, actionValue: e.target.value }))} />
              <small className="hint-text">For Set Category, use category name (e.g. Transport) or category id.</small>
            </label>

            <div className="rules-control-row">
              <label className="checkbox-field rules-field-active">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
                <span>Rule is active</span>
              </label>

              <div className="rules-submit-wrap">
                {editingRuleId ? <button type="button" className="ghost" onClick={() => { setEditingRuleId(null); setForm(defaultForm); }}>Cancel</button> : null}
                <button className="primary" type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : editingRuleId ? "Update Rule" : "Create Rule"}</button>
              </div>
            </div>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
        </form>
      </article>

      <article className="card">
        <h3>Rules List</h3>

        {(sortedRules ?? []).length === 0 ? <p className="hint-text">No rules created yet.</p> : (
          <div className="rules-list">
            {sortedRules.map((rule) => (
              <article key={rule.id} className="rules-item">
                <div className="rules-item-head">
                  <div>
                    <h4>{rule.name}</h4>
                    <p className="hint-text">Priority {rule.priority}</p>
                    <label className="rules-toggle">
                      <input
                        type="checkbox"
                        checked={rule.isActive}
                        onChange={(e) => toggleMutation.mutate({ rule, nextState: e.target.checked })}
                        disabled={toggleMutation.isPending}
                      />
                      <span className={rule.isActive ? "rules-state enabled" : "rules-state disabled"}>
                        {rule.isActive ? "Enabled" : "Disabled"}
                      </span>
                    </label>
                  </div>
                  <div className="rules-actions">
                    <button type="button" className="ghost" onClick={() => startEdit(rule)}>Edit</button>
                    <button type="button" className="danger" onClick={() => deleteMutation.mutate(rule.id)} disabled={deleteMutation.isPending}>Delete</button>
                  </div>
                </div>

                <p className="rules-line">
                  <span className="rules-line-label">When:</span> {getConditionText(rule)}
                </p>
                <p className="rules-line">
                  <span className="rules-line-label">Then:</span> {getActionText(rule)}
                </p>
              </article>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
