import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api("/api/me");
      setUser(r.user);
      return r.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    await api("/api/login", { email, password });
    return refresh();
  }, [refresh]);

  const signup = useCallback(async (payload) => {
    await api("/api/signup", payload);
    return refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api("/api/logout", {});
    } catch {
      /* already out */
    }
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, ready, refresh, login, signup, logout, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
