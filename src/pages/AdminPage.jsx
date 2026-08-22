import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useProfile } from "../context/ProfileContext.jsx";

const PLAN_OPTIONS = [
  { value: "", label: "No plan" },
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual" },
  { value: "commission", label: "Commission" },
];

const CURRENCY_OPTIONS = ["USD", "GHS", "EUR", "GBP", "NGN"];

const CURRENCY_SYMBOLS = {
  USD: "$",
  GHS: "GH₵",
  EUR: "€",
  GBP: "£",
  NGN: "₦",
};

const fmtMoney = (amount, currency) =>
  `${CURRENCY_SYMBOLS[currency] || currency + " "}${Number(amount || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;

export default function AdminPage() {
  const {
    allUsers,
    payments,
    accessRequests,
    approveAccessRequest,
    denyAccessRequest,
    approveUser,
    suspendUser,
    terminateUser,
    reactivateUser,
    setUserPlan,
    recordPayment,
    deletePayment,
  } = useProfile();
  const [edits, setEdits] = useState({}); // { [uid]: { plan, amount, rate, currency } }
  const [paymentForms, setPaymentForms] = useState({}); // { [uid]: { amount, currency, note } }

  const stats = useMemo(() => {
    const total = allUsers.length;
    const pending = allUsers.filter((u) => u.status === "pending").length;
    const approved = allUsers.filter((u) => u.status === "approved").length;
    const commissionUsers = allUsers.filter(
      (u) => u.status === "approved" && u.plan === "commission"
    ).length;

    // Group plan revenue BY CURRENCY — currencies are never summed together.
    const revenueByCurrency = {}; // { USD: { monthly, annual, mrr }, GHS: {...} }
    allUsers
      .filter((u) => u.status === "approved" && (u.plan === "monthly" || u.plan === "annual"))
      .forEach((u) => {
        const cur = u.planCurrency || "USD";
        if (!revenueByCurrency[cur]) revenueByCurrency[cur] = { monthly: 0, annual: 0 };
        if (u.plan === "monthly") revenueByCurrency[cur].monthly += Number(u.planAmount) || 0;
        if (u.plan === "annual") revenueByCurrency[cur].annual += Number(u.planAmount) || 0;
      });
    Object.values(revenueByCurrency).forEach((r) => {
      r.mrr = r.monthly + r.annual / 12;
    });

    // Money actually RECEIVED (from the payments ledger), grouped by currency.
    const receivedByCurrency = {};
    payments.forEach((p) => {
      const cur = p.currency || "USD";
      receivedByCurrency[cur] = (receivedByCurrency[cur] || 0) + (Number(p.amount) || 0);
    });

    return { total, pending, approved, commissionUsers, revenueByCurrency, receivedByCurrency };
  }, [allUsers, payments]);

  const getEdit = (uid, user) =>
    edits[uid] ?? {
      plan: user.plan || "",
      amount: user.planAmount ?? "",
      rate: user.commissionRate ?? "",
      currency: user.planCurrency || "USD",
    };

  const updateEdit = (uid, patch) =>
    setEdits((prev) => ({ ...prev, [uid]: { ...getEdit(uid, {}), ...prev[uid], ...patch } }));

  const savePlan = (uid) => {
    const e = getEdit(uid, {});
    setUserPlan(
      uid,
      e.plan || null,
      e.plan === "commission" ? null : e.amount === "" ? null : Number(e.amount),
      e.plan === "commission" ? (e.rate === "" ? null : Number(e.rate)) : null,
      e.currency || "USD"
    );
  };

  const getPaymentForm = (uid) =>
    paymentForms[uid] ?? { amount: "", currency: "USD", note: "" };
  const updatePaymentForm = (uid, patch) =>
    setPaymentForms((prev) => ({ ...prev, [uid]: { ...getPaymentForm(uid), ...patch } }));

  const submitPayment = (uid, email) => {
    const f = getPaymentForm(uid);
    if (!f.amount) return;
    recordPayment(uid, email, f.amount, f.currency, f.note);
    setPaymentForms((prev) => ({ ...prev, [uid]: { amount: "", currency: f.currency, note: "" } }));
  };

  const currencyKeys = Array.from(
    new Set([...Object.keys(stats.revenueByCurrency), ...Object.keys(stats.receivedByCurrency)])
  );

  // Lifetime total a user has paid, in their plan's currency — lets the
  // admin see at a glance whether logged payments actually match what the
  // plan says they owe. This is a running total across all logged payments,
  // not reset per billing period.
  const paidTotalFor = (uid, currency) =>
    payments
      .filter((p) => p.uid === uid && (p.currency || "USD") === currency)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  return (
    <div className="page">
      <header className="app-header">
        <div className="app-header-row">
          <div>
            <Link to="/" className="back-link">
              ← Dashboard
            </Link>
            <h1>Admin Panel</h1>
          </div>
        </div>
      </header>

      {accessRequests.length > 0 && (
        <>
          <h2 className="section-heading">
            Access requests <span className="badge">{accessRequests.length}</span>
          </h2>
          <p className="muted small" style={{ marginTop: "-0.5rem", marginBottom: "0.75rem" }}>
            Nobody here has a real account yet — approving one only creates an entry that lets
            them come back and finish creating their own password.
          </p>
          <div className="admin-table-wrap" style={{ marginBottom: "1.5rem" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Requested</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Contact</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accessRequests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : "—"}</td>
                    <td>{r.name || "—"}</td>
                    <td>{r.email}</td>
                    <td>{r.contact || "—"}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button className="btn btn-primary btn-sm" onClick={() => approveAccessRequest(r.id, r.email)}>
                          Approve
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => denyAccessRequest(r.id)}>
                          Deny
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="admin-stats">
        <div className="admin-stat-card">
          <div className="admin-stat-value">{stats.total}</div>
          <div className="admin-stat-label">Total users</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{stats.pending}</div>
          <div className="admin-stat-label">Awaiting approval</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{stats.approved}</div>
          <div className="admin-stat-label">Active users</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{stats.commissionUsers}</div>
          <div className="admin-stat-label">Commission-based users</div>
        </div>
      </div>

      {currencyKeys.length === 0 ? (
        <p className="muted small" style={{ marginBottom: "1.5rem" }}>
          No plans or payments recorded yet — figures will appear here per currency once you set a
          plan or log a payment below.
        </p>
      ) : (
        currencyKeys.map((cur) => {
          const rev = stats.revenueByCurrency[cur] || { monthly: 0, annual: 0, mrr: 0 };
          const received = stats.receivedByCurrency[cur] || 0;
          return (
            <div key={cur} style={{ marginBottom: "1.25rem" }}>
              <h3 style={{ margin: "0 0 0.5rem", color: "var(--navy-dark)" }}>{cur}</h3>
              <div className="admin-stats">
                <div className="admin-stat-card">
                  <div className="admin-stat-value">{fmtMoney(rev.monthly, cur)}</div>
                  <div className="admin-stat-label">Monthly plan revenue</div>
                </div>
                <div className="admin-stat-card">
                  <div className="admin-stat-value">{fmtMoney(rev.annual, cur)}</div>
                  <div className="admin-stat-label">Annual plan revenue</div>
                </div>
                <div className="admin-stat-card">
                  <div className="admin-stat-value">{fmtMoney(rev.mrr, cur)}</div>
                  <div className="admin-stat-label">Est. monthly recurring</div>
                </div>
                <div className="admin-stat-card">
                  <div className="admin-stat-value">{fmtMoney(received, cur)}</div>
                  <div className="admin-stat-label">Total received (payments log)</div>
                </div>
              </div>
            </div>
          );
        })
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Status</th>
              <th>Plan</th>
              <th>Amount / Rate</th>
              <th>Currency</th>
              <th>Actions</th>
              <th>Log a payment</th>
            </tr>
          </thead>
          <tbody>
            {allUsers.map((u) => {
              const e = getEdit(u.id, u);
              const pf = getPaymentForm(u.id);
              return (
                <tr key={u.id}>
                  <td>
                    <div>{u.email}</div>
                    <div className="muted small">{u.displayName || "—"}</div>
                    {u.contactNumber && <div className="muted small">{u.contactNumber}</div>}
                    {u.plan && u.plan !== "commission" && u.planAmount != null && (
                      <div className="muted small" style={{ marginTop: "0.3rem" }}>
                        {(() => {
                          const cur = u.planCurrency || "USD";
                          const paid = paidTotalFor(u.id, cur);
                          const owed = Number(u.planAmount) || 0;
                          const matches = paid >= owed && owed > 0;
                          return (
                            <span style={{ color: matches ? "var(--success)" : "var(--warning)" }}>
                              Paid {fmtMoney(paid, cur)} / owes {fmtMoney(owed, cur)}
                              {matches ? " ✓" : owed > 0 ? ` (short ${fmtMoney(owed - paid, cur)})` : ""}
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`status-tag ${u.status}`}>{u.status}</span>
                  </td>
                  <td>
                    <select value={e.plan} onChange={(ev) => updateEdit(u.id, { plan: ev.target.value })}>
                      {PLAN_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="plan-inputs">
                      {e.plan === "commission" ? (
                        <>
                          <input
                            type="number"
                            placeholder="Rate %"
                            value={e.rate}
                            onChange={(ev) => updateEdit(u.id, { rate: ev.target.value })}
                            style={{ width: "70px" }}
                          />
                          <span className="muted small">%</span>
                        </>
                      ) : (
                        <input
                          type="number"
                          placeholder="Amount"
                          value={e.amount}
                          onChange={(ev) => updateEdit(u.id, { amount: ev.target.value })}
                          style={{ width: "80px" }}
                          disabled={!e.plan}
                        />
                      )}
                    </div>
                  </td>
                  <td>
                    <select value={e.currency} onChange={(ev) => updateEdit(u.id, { currency: ev.target.value })}>
                      {CURRENCY_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <div>
                      <button className="btn btn-ghost btn-sm" style={{ marginTop: "0.3rem" }} onClick={() => savePlan(u.id)}>
                        Save plan
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      {u.status === "pending" && (
                        <button className="btn btn-primary btn-sm" onClick={() => approveUser(u.id)}>
                          Approve
                        </button>
                      )}
                      {u.status === "approved" && (
                        <button className="btn btn-ghost btn-sm" onClick={() => suspendUser(u.id)}>
                          Suspend
                        </button>
                      )}
                      {u.status === "suspended" && (
                        <button className="btn btn-primary btn-sm" onClick={() => reactivateUser(u.id)}>
                          Reactivate
                        </button>
                      )}
                      {u.status !== "terminated" && (
                        <button className="btn btn-danger btn-sm" onClick={() => terminateUser(u.id)}>
                          Terminate
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="plan-inputs">
                      <input
                        type="number"
                        placeholder="Amount"
                        value={pf.amount}
                        onChange={(ev) => updatePaymentForm(u.id, { amount: ev.target.value })}
                        style={{ width: "70px" }}
                      />
                      <select value={pf.currency} onChange={(ev) => updatePaymentForm(u.id, { currency: ev.target.value })}>
                        {CURRENCY_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <button className="btn btn-ghost btn-sm" onClick={() => submitPayment(u.id, u.email)}>
                        Log
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {allUsers.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center", padding: "1.5rem" }}>
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-heading">Payments log</h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>User</th>
              <th>Amount</th>
              <th>Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString() : "—"}</td>
                <td>{p.email}</td>
                <td>{fmtMoney(p.amount, p.currency)}</td>
                <td>{p.note || "—"}</td>
                <td>
                  <button className="btn-link danger" onClick={() => deletePayment(p.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: "center", padding: "1.5rem" }}>
                  No payments logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}