import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  doc,
  onSnapshot,
  updateDoc,
  collection,
  addDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { db, firebaseEnabled } from "../lib/firebase.js";
import { useAuth } from "./AuthContext.jsx";

const ProfileContext = createContext(null);

export function ProfileProvider({ children }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [accessRequests, setAccessRequests] = useState([]);

  // The admin flag comes from a Firebase Auth CUSTOM CLAIM, not from any
  // Firestore field. Custom claims can only be set by server-side code that
  // holds a service account key (see scripts/setAdmin.mjs) — a signed-in
  // user can never grant themselves this by editing their own document.
  useEffect(() => {
    if (!firebaseEnabled || !user) {
      setIsAdmin(false);
      return;
    }
    user.getIdTokenResult().then((t) => setIsAdmin(t.claims.admin === true));
  }, [user]);

  useEffect(() => {
    if (!firebaseEnabled || !user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data());
        } else {
          // An authenticated user with no profile doc at all is an
          // orphaned/legacy account (e.g. created directly in the Firebase
          // console, or from before the approval system existed). Under
          // the current rules a profile can only ever be CREATED alongside
          // a matching approvedEmails entry, so we do not attempt to write
          // one here — that would just fail. Surface it as its own state
          // instead of pretending they're "pending".
          setProfile({ status: "no-profile", email: user.email });
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [user]);

  // Admin-only: live list of every registered user, for the Admin panel.
  useEffect(() => {
    if (!firebaseEnabled || !isAdmin) {
      setAllUsers([]);
      return;
    }
    const unsub = onSnapshot(
      collection(db, "users"),
      (snap) => setAllUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("Admin user list error:", err.message)
    );
    return unsub;
  }, [isAdmin]);

  // Admin-only: the money-received ledger.
  useEffect(() => {
    if (!firebaseEnabled || !isAdmin) {
      setPayments([]);
      return;
    }
    const q = query(collection(db, "payments"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => setPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("Payments list error:", err.message)
    );
    return unsub;
  }, [isAdmin]);

  // Admin-only: pending "requests to join" — submitted before any account
  // exists at all. Approving one here is what creates the approvedEmails
  // entry that then (and only then) lets that person finish creating their
  // own account.
  useEffect(() => {
    if (!firebaseEnabled || !isAdmin) {
      setAccessRequests([]);
      return;
    }
    const q = query(collection(db, "accessRequests"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => setAccessRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("Access requests list error:", err.message)
    );
    return unsub;
  }, [isAdmin]);

  const approveAccessRequest = useCallback(async (requestId, email) => {
    const normalizedEmail = email.trim().toLowerCase();
    await setDoc(doc(db, "approvedEmails", normalizedEmail), {
      approvedAt: serverTimestamp(),
    });
    await deleteDoc(doc(db, "accessRequests", requestId));
  }, []);

  const denyAccessRequest = useCallback(async (requestId) => {
    await deleteDoc(doc(db, "accessRequests", requestId));
  }, []);

  const setUserStatus = useCallback(async (uid, status) => {
    await updateDoc(doc(db, "users", uid), { status, updatedAt: serverTimestamp() });
  }, []);

  const approveUser = useCallback((uid) => setUserStatus(uid, "approved"), [setUserStatus]);
  const suspendUser = useCallback((uid) => setUserStatus(uid, "suspended"), [setUserStatus]);
  const terminateUser = useCallback((uid) => setUserStatus(uid, "terminated"), [setUserStatus]);
  const reactivateUser = useCallback((uid) => setUserStatus(uid, "approved"), [setUserStatus]);

  const setUserPlan = useCallback(async (uid, plan, planAmount, commissionRate, planCurrency) => {
    await updateDoc(doc(db, "users", uid), {
      plan,
      planAmount: planAmount ?? null,
      commissionRate: commissionRate ?? null,
      planCurrency: planCurrency || "USD",
      updatedAt: serverTimestamp(),
    });
  }, []);

  const recordPayment = useCallback(async (uid, email, amount, currency, note) => {
    await addDoc(collection(db, "payments"), {
      uid,
      email: email || "",
      amount: Number(amount) || 0,
      currency: currency || "USD",
      note: note || "",
      createdAt: serverTimestamp(),
    });
  }, []);

  const deletePayment = useCallback(async (paymentId) => {
    await deleteDoc(doc(db, "payments", paymentId));
  }, []);

  return (
    <ProfileContext.Provider
      value={{
        profile,
        isAdmin,
        loading,
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
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}