import "./SettingsPage.css";
import { useState } from "react";

type ProfileSettings = {
  fullName: string;
  email: string;
  phone: string;
};

type AppPreferences = {
  currency: "INR" | "USD" | "EUR";
  dateFormat: "dd-mm-yyyy" | "mm-dd-yyyy" | "yyyy-mm-dd";
  defaultView: "dashboard" | "transactions" | "reports";
  weeklySummaryEmail: boolean;
  budgetAlerts: boolean;
  compactCards: boolean;
};

const initialProfile: ProfileSettings = {
  fullName: "Abhishek",
  email: "abhishek@example.com",
  phone: ""
};

const initialPreferences: AppPreferences = {
  currency: "INR",
  dateFormat: "dd-mm-yyyy",
  defaultView: "dashboard",
  weeklySummaryEmail: true,
  budgetAlerts: true,
  compactCards: false
};

export function SettingsPage() {
  const [profile, setProfile] = useState<ProfileSettings>(initialProfile);
  const [preferences, setPreferences] = useState<AppPreferences>(initialPreferences);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  function updateProfile<K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) {
    setProfile((prev) => ({ ...prev, [key]: value }));
  }

  function updatePreferences<K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  }

  function handleSaveAll() {
    setLastSaved(new Date().toLocaleString("en-IN"));
  }

  function handleReset() {
    setProfile(initialProfile);
    setPreferences(initialPreferences);
    setLastSaved(null);
  }

  return (
    <section className="settings-page">
      <div className="section-head">
        <h2>Settings</h2>
      </div>

      <div className="settings-grid">
        <article className="card settings-card">
          <div className="settings-card-head">
            <h3>Profile</h3>
            <p>Update your basic account details.</p>
          </div>

          <div className="settings-form-grid">
            <label>
              Full Name
              <input type="text" value={profile.fullName} onChange={(e) => updateProfile("fullName", e.target.value)} />
            </label>
            <label>
              Email
              <input type="email" value={profile.email} onChange={(e) => updateProfile("email", e.target.value)} />
            </label>
            <label>
              Phone
              <input type="tel" placeholder="+91 98765 43210" value={profile.phone} onChange={(e) => updateProfile("phone", e.target.value)} />
            </label>
          </div>
        </article>

        <article className="card settings-card">
          <div className="settings-card-head">
            <h3>Preferences</h3>
            <p>Choose how data is shown across the app.</p>
          </div>

          <div className="settings-form-grid">
            <label>
              Currency
              <select value={preferences.currency} onChange={(e) => updatePreferences("currency", e.target.value as AppPreferences["currency"])}>
                <option value="INR">INR (Rs)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </label>
            <label>
              Date Format
              <select value={preferences.dateFormat} onChange={(e) => updatePreferences("dateFormat", e.target.value as AppPreferences["dateFormat"])}>
                <option value="dd-mm-yyyy">dd-mm-yyyy</option>
                <option value="mm-dd-yyyy">mm-dd-yyyy</option>
                <option value="yyyy-mm-dd">yyyy-mm-dd</option>
              </select>
            </label>
            <label>
              Default Start Page
              <select value={preferences.defaultView} onChange={(e) => updatePreferences("defaultView", e.target.value as AppPreferences["defaultView"])}>
                <option value="dashboard">Dashboard</option>
                <option value="transactions">Transactions</option>
                <option value="reports">Reports</option>
              </select>
            </label>
          </div>

          <div className="settings-toggles">
            <label className="settings-toggle-row">
              <input type="checkbox" checked={preferences.weeklySummaryEmail} onChange={(e) => updatePreferences("weeklySummaryEmail", e.target.checked)} />
              <span>
                <strong>Weekly Summary Email</strong>
                <small>Get weekly spend highlights by email.</small>
              </span>
            </label>

            <label className="settings-toggle-row">
              <input type="checkbox" checked={preferences.budgetAlerts} onChange={(e) => updatePreferences("budgetAlerts", e.target.checked)} />
              <span>
                <strong>Budget Alerts</strong>
                <small>Warn when spending reaches budget limits.</small>
              </span>
            </label>

            <label className="settings-toggle-row">
              <input type="checkbox" checked={preferences.compactCards} onChange={(e) => updatePreferences("compactCards", e.target.checked)} />
              <span>
                <strong>Compact Cards</strong>
                <small>Reduce card spacing for denser layouts.</small>
              </span>
            </label>
          </div>
        </article>

        <article className="card settings-card">
          <div className="settings-card-head">
            <h3>Security</h3>
            <p>Manage password and sign-in controls.</p>
          </div>

          <div className="settings-form-grid">
            <label>
              Current Password
              <input type="password" placeholder="Enter current password" />
            </label>
            <label>
              New Password
              <input type="password" placeholder="Enter new password" />
            </label>
            <label>
              Confirm New Password
              <input type="password" placeholder="Re-enter new password" />
            </label>
          </div>

          <div className="settings-inline-actions">
            <button type="button" className="ghost">Enable 2FA (Soon)</button>
            <button type="button" className="primary">Update Password</button>
          </div>
        </article>

        <article className="card settings-card settings-danger-zone">
          <div className="settings-card-head">
            <h3>Danger Zone</h3>
            <p>Sensitive actions related to your account data.</p>
          </div>

          <div className="settings-inline-actions">
            <button type="button" className="ghost">Export My Data</button>
            <button type="button" className="danger">Delete Account</button>
          </div>
        </article>
      </div>

      <article className="card settings-footer-card">
        <div className="settings-footer-row">
          <p className="settings-save-note">
            {lastSaved ? `Last saved: ${lastSaved}` : "Changes are local UI only until backend save APIs are connected."}
          </p>
          <div className="settings-inline-actions">
            <button type="button" className="ghost" onClick={handleReset}>Reset</button>
            <button type="button" className="primary" onClick={handleSaveAll}>Save Changes</button>
          </div>
        </div>
      </article>
    </section>
  );
}

