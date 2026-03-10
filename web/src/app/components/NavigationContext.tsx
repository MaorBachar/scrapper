"use client";

import {
  createContext,
  useCallback,
  useContext,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

type NavigationContextType = {
  push: (url: string) => void;
  isPending: boolean;
};

const NavigationContext = createContext<NavigationContextType | null>(null);

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within NavigationProvider");
  return ctx;
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const push = useCallback(
    (url: string) => {
      startTransition(() => {
        router.push(url);
      });
    },
    [router]
  );

  return (
    <NavigationContext.Provider value={{ push, isPending }}>
      {isPending && <div className="nav-progress-bar" />}
      {children}
    </NavigationContext.Provider>
  );
}
