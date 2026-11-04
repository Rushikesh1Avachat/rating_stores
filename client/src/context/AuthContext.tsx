import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { authService } from "../services";
import type { LoginInput, RegistrationInput } from "../services";
import { clearToken, getToken, saveToken, SESSION_EXPIRED_EVENT } from "../utils/api";
import type { User } from "../utils/types";

type AuthContextValue = {
  token: string | null;
  user: User | null;
  loading: boolean;
  authenticate: (credentials: LoginInput | RegistrationInput, mode: "login" | "signup") => Promise<User>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  useEffect(() => {
    function expireSession() {
      clearToken();
      setToken(null);
      setUser(null);
      setLoading(false);
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession);
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let active = true;
    authService.me()
      .then(({ user: current }) => {
        if (active) setUser(current);
      })
      .catch(() => {
        if (active) {
          clearToken();
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  async function authenticate(credentials: LoginInput | RegistrationInput, mode: "login" | "signup") {
    const result = await authService.authenticate(credentials, mode);
    saveToken(result.token);
    setUser(result.user);
    setToken(result.token);
    setLoading(false);
    return result.user;
  }

  function signOut() {
    clearToken();
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, authenticate, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
