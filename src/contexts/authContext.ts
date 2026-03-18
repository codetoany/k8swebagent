import { createContext } from "react";
import type { UserInfo } from "@/lib/types";

export interface AuthContextValue {
  isAuthenticated: boolean;
  authLoading: boolean;
  currentUser: UserInfo | null;
  setIsAuthenticated: (_value: boolean) => void;
  login: (_username: string, _password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  hasPermission: (_permission: string) => boolean;
  hasAnyPermission: (_permissions: string[]) => boolean;
}

export const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  authLoading: true,
  currentUser: null,
  setIsAuthenticated: (_value: boolean) => {},
  login: async (_username: string, _password: string) => false,
  logout: async () => {},
  hasPermission: (_permission: string) => false,
  hasAnyPermission: (_permissions: string[]) => false,
});
