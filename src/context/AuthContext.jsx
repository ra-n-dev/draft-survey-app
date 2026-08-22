import { createContext, useContext, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, getDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db, firebaseEnabled } from "../lib/firebase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(firebaseEnabled);

  useEffect(() => {
    if (!firebaseEnabled) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Step 1 of 2: "Request access". This does NOT create a Firebase Auth
  // account, a password, or a users/{uid} profile — it only writes a
  // lightweight request that ONLY an admin can ever read (see
  // firestore.rules). Nothing resembling a real account exists yet.
  const requestAccess = async (name, email, contactNumber) => {
    if (!firebaseEnabled) throw new Error("Cloud sync is not configured on this build.");
    await addDoc(collection(db, "accessRequests"), {
      name: name || "",
      email: email.trim().toLowerCase(),
      contact: contactNumber || "",
      createdAt: serverTimestamp(),
    });
  };

  // Step 2 of 2: "Complete sign-up". Only succeeds if an admin has already
  // approved this exact email (an approvedEmails/{email} document exists —
  // enforced by firestore.rules, not just this check). Only at this point
  // does a real Firebase Auth account and profile get created, and it's
  // created already-approved, since the vetting already happened.
  const completeSignup = async (email, password, name, contactNumber) => {
    if (!firebaseEnabled) throw new Error("Cloud sync is not configured on this build.");
    const normalizedEmail = email.trim().toLowerCase();
    const approvedSnap = await getDoc(doc(db, "approvedEmails", normalizedEmail));
    if (!approvedSnap.exists()) {
      const err = new Error(
        "This email hasn't been approved yet. Please wait for the administrator to approve your request before completing sign-up."
      );
      err.code = "not-approved";
      throw err;
    }

    const cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    if (name) await updateProfile(cred.user, { displayName: name });

    await setDoc(doc(db, "users", cred.user.uid), {
      email: normalizedEmail,
      displayName: name || "",
      contactNumber: contactNumber || "",
      role: "user",
      status: "approved",
      plan: null,
      planAmount: null,
      planCurrency: "USD",
      commissionRate: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return cred.user;
  };

  const login = async (email, password) => {
    if (!firebaseEnabled) throw new Error("Cloud sync is not configured on this build.");
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  };

  const logout = async () => {
    if (!firebaseEnabled) return;
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{ user, authLoading, firebaseEnabled, requestAccess, completeSignup, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}