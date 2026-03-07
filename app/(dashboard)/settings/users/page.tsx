"use client";
// app/(dashboard)/settings/users/page.tsx
// FIX (BUG 4): Added a password field to the "Add User" form.
//   Previously the form only collected email / name / role and the API stored
//   '__GOOGLE_SSO__' as the password, making credential login impossible for
//   newly created admin users.
//
// The password field is optional in the UI (matching the API):
//   • Leave blank → account is Google-SSO-only (no credentials login).
//   • Fill in → account gets a bcrypt-hashed password and can log in via
//     the credentials form immediately.
//
// FIX (BUG 2): Role dropdown options now match the Prisma UserRole enum exactly.
//   Removed AGENT / SUPER_ADMIN, added AUDITOR.

import { useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AppRole = "VIEWER" | "AUDITOR" | "SUPERVISOR" | "ADMIN";

interface User {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  isActive: boolean;
  createdAt: string;
}

// FIX (BUG 2): Roles listed in ascending privilege order, matching DB enum.
const ROLES: AppRole[] = ["VIEWER", "AUDITOR", "SUPERVISOR", "ADMIN"];

const roleBadgeClasses: Record<AppRole, string> = {
  VIEWER:     "bg-gray-100 text-gray-700",
  AUDITOR:    "bg-blue-100 text-blue-700",
  SUPERVISOR: "bg-yellow-100 text-yellow-700",
  ADMIN:      "bg-red-100 text-red-700",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function UsersSettingsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Add-user form state
  const [form, setForm] = useState({
    email: "",
    name: "",
    role: "VIEWER" as AppRole,
    password: "",       // FIX (BUG 4): new field
    confirmPassword: "", // FIX (BUG 4): client-side confirmation only
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------
  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setUsers(data.users);
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsers(); }, []);

  // -------------------------------------------------------------------------
  // Add user
  // -------------------------------------------------------------------------
  function resetForm() {
    setForm({ email: "", name: "", role: "VIEWER", password: "", confirmPassword: "" });
    setFormError(null);
  }

  async function handleAddUser() {
    setFormError(null);

    // Basic client-side validation.
    if (!form.email || !form.name) {
      setFormError("Email and name are required.");
      return;
    }

    // FIX (BUG 4): Validate password fields if the user chose to set one.
    if (form.password || form.confirmPassword) {
      if (form.password.length < 8) {
        setFormError("Password must be at least 8 characters.");
        return;
      }
      if (form.password !== form.confirmPassword) {
        setFormError("Passwords do not match.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: Record<string, string> = {
        email: form.email,
        name: form.name,
        role: form.role,
      };

      // FIX (BUG 4): Only include password in the payload when one was entered.
      if (form.password) {
        payload.password = form.password;
      }

      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error ?? "Failed to create user.");
        return;
      }

      setShowAddModal(false);
      resetForm();
      setSubmitSuccess(`User ${data.user.email} created successfully.`);
      await fetchUsers();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Toggle active status
  // -------------------------------------------------------------------------
  async function toggleActive(user: User) {
    try {
      const res = await fetch(`/api/users?id=${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (!res.ok) throw new Error("Failed to update user");
      await fetchUsers();
    } catch (err: any) {
      setSubmitError(err.message);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage admin users and their access levels.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          + Add User
        </button>
      </div>

      {/* Flash messages */}
      {submitError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {submitError}
          <button className="ml-2 underline" onClick={() => setSubmitError(null)}>Dismiss</button>
        </div>
      )}
      {submitSuccess && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
          {submitSuccess}
          <button className="ml-2 underline" onClick={() => setSubmitSuccess(null)}>Dismiss</button>
        </div>
      )}

      {/* User table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading users…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["Name", "Email", "Role", "Status", "Created", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{user.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                  <td className="px-4 py-3">
                    {/* FIX (BUG 2): badge uses updated role list */}
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${roleBadgeClasses[user.role]}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${user.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(user)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {user.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="text-center py-10 text-gray-400">No users found.</div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Add User Modal                                                        */}
      {/* ------------------------------------------------------------------ */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Add New User</h2>

            {formError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-600 rounded text-sm">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Jane Smith"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="jane@example.com"
                />
              </div>

              {/* Role — FIX (BUG 2): options match DB enum */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as AppRole })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* ---------------------------------------------------------- */}
              {/* FIX (BUG 4): Password fields — new additions                */}
              {/* ---------------------------------------------------------- */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password{" "}
                  <span className="text-gray-400 font-normal">(optional — leave blank for Google SSO only)</span>
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                />
              </div>

              {form.password && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                  />
                </div>
              )}
              {/* ---------------------------------------------------------- */}
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6 justify-end">
              <button
                onClick={() => { setShowAddModal(false); resetForm(); }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                onClick={handleAddUser}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Creating…" : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
