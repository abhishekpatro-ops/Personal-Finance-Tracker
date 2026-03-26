import "./SharedAccountsPage.css";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../services/api";

type Account = {
  id: string;
  name: string;
  accessRole?: "owner" | "editor" | "viewer" | string;
  isShared?: boolean;
};

type MembersResponse = {
  accountId: string;
  owner?: {
    userId: string;
    userEmail: string;
    userDisplayName: string;
    role: "owner";
  };
  members: Array<{
    userId: string;
    userEmail: string;
    userDisplayName: string;
    role: "editor" | "viewer" | string;
  }>;
};

async function fetchAccounts() {
  const { data } = await api.get<Account[]>("/accounts");
  return data;
}

async function fetchMembers(accountId: string) {
  const { data } = await api.get<MembersResponse>(`/accounts/${accountId}/members`);
  return data;
}

export function SharedAccountsPage() {
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });

  useEffect(() => {
    if (!selectedAccountId && (accountsQuery.data ?? []).length > 0) {
      setSelectedAccountId(accountsQuery.data![0].id);
    }
  }, [accountsQuery.data, selectedAccountId]);

  const selectedAccount = (accountsQuery.data ?? []).find((a) => a.id === selectedAccountId) ?? null;

  const membersQuery = useQuery({
    queryKey: ["account-members", selectedAccountId],
    queryFn: () => fetchMembers(selectedAccountId),
    enabled: !!selectedAccountId
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/accounts/${selectedAccountId}/invite`, { email: inviteEmail, role: inviteRole });
    },
    onSuccess: async () => {
      setActionMessage("Member invited/updated successfully.");
      setInviteEmail("");
      await membersQuery.refetch();
    },
    onError: (err: any) => {
      setActionMessage(err?.response?.data || "Invite failed.");
    }
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (payload: { userId: string; role: "editor" | "viewer" }) => {
      await api.put(`/accounts/${selectedAccountId}/members/${payload.userId}`, { role: payload.role });
    },
    onSuccess: async () => {
      setActionMessage("Member role updated.");
      await membersQuery.refetch();
    },
    onError: (err: any) => {
      setActionMessage(err?.response?.data || "Role update failed.");
    }
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/accounts/${selectedAccountId}/members/${userId}`);
    },
    onMutate: (userId: string) => {
      setRemovingUserId(userId);
    },
    onSuccess: async () => {
      setActionMessage("Member removed. Shared access revoked.");
      await membersQuery.refetch();
      await accountsQuery.refetch();
    },
    onError: (err: any) => {
      setActionMessage(err?.response?.data || "Failed to remove member.");
    },
    onSettled: () => {
      setRemovingUserId(null);
    }
  });

  const ownerAccounts = (accountsQuery.data ?? []).filter((a) => (a.accessRole ?? "owner") === "owner");

  return (
    <section className="shared-page">
      <div className="section-head">
        <h2>Shared Account Management</h2>
      </div>

      <article className="card">
        <h3>Shared With</h3>
        <p className="hint-text">Invite family members and manage access roles for each account.</p>

        <div className="shared-selector-row">
          <label>
            Account
            <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
              {(accountsQuery.data ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.accessRole ?? "owner"})
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedAccount && selectedAccount.accessRole === "owner" ? (
          <div className="shared-invite-grid">
            <label>
              Invite via Email
              <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="member@example.com" />
            </label>
            <label>
              Role
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer") }>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <button type="button" className="primary" onClick={() => inviteMutation.mutate()} disabled={!inviteEmail || inviteMutation.isPending}>
              {inviteMutation.isPending ? "Inviting..." : "Invite Member"}
            </button>
          </div>
        ) : (
          <p className="hint-text">You can view members on shared accounts. Only owner can invite or change roles.</p>
        )}

        {actionMessage ? <p className="hint-text">{actionMessage}</p> : null}
      </article>

      <article className="card">
        <h3>Members</h3>
        {!selectedAccountId ? <p className="hint-text">Select an account to view members.</p> : null}

        {membersQuery.data?.owner ? (
          <div className="shared-member-row shared-owner-row">
            <div>
              <strong>{membersQuery.data.owner.userDisplayName}</strong>
              <p>{membersQuery.data.owner.userEmail}</p>
            </div>
            <span className="shared-role-chip">Owner</span>
          </div>
        ) : null}

        <div className="shared-members-list">
          {(membersQuery.data?.members ?? []).map((member) => (
            <div key={member.userId} className="shared-member-row">
              <div>
                <strong>{member.userDisplayName}</strong>
                <p>{member.userEmail}</p>
              </div>
              {selectedAccount?.accessRole === "owner" ? (
                <div className="shared-member-actions">
                  <select
                    value={member.role}
                    onChange={(e) => updateRoleMutation.mutate({ userId: member.userId, role: e.target.value as "editor" | "viewer" })}
                    disabled={removeMemberMutation.isPending && removingUserId === member.userId}
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    type="button"
                    className="danger shared-remove-btn"
                    onClick={() => removeMemberMutation.mutate(member.userId)}
                    disabled={removeMemberMutation.isPending && removingUserId === member.userId}
                  >
                    {removeMemberMutation.isPending && removingUserId === member.userId ? "Removing..." : "Remove"}
                  </button>
                </div>
              ) : (
                <span className="shared-role-chip">{member.role}</span>
              )}
            </div>
          ))}
          {(membersQuery.data?.members ?? []).length === 0 ? <p className="hint-text">No invited members yet.</p> : null}
        </div>
      </article>

      <article className="card">
        <h3>Your Owner Accounts</h3>
        <div className="shared-owner-account-list">
          {ownerAccounts.map((account) => <span key={account.id} className="shared-role-chip">{account.name}</span>)}
          {ownerAccounts.length === 0 ? <p className="hint-text">You do not own any accounts yet.</p> : null}
        </div>
      </article>
    </section>
  );
}


