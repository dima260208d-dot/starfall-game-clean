import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ControlMode } from "../utils/localStorageAPI";
import { resolveEffectiveControlScheme } from "./controlScheme";
import { detectPlatformLayout } from "./platformDetect";
import type { PlatformLayout } from "./types";

interface PlatformLayoutContextValue {
  layout: PlatformLayout;
  controlScheme: ControlMode;
}

const PlatformLayoutContext = createContext<PlatformLayoutContextValue | null>(null);

export function PlatformLayoutProvider({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState<PlatformLayout>(() => detectPlatformLayout());

  useEffect(() => {
    const refresh = () => setLayout(detectPlatformLayout());
    refresh();
    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);
    return () => {
      window.removeEventListener("resize", refresh);
      window.removeEventListener("orientationchange", refresh);
    };
  }, []);

  const value = useMemo<PlatformLayoutContextValue>(() => ({
    layout,
    controlScheme: resolveEffectiveControlScheme(layout),
  }), [layout]);

  return (
    <PlatformLayoutContext.Provider value={value}>
      {children}
    </PlatformLayoutContext.Provider>
  );
}

function fallbackContextValue(): PlatformLayoutContextValue {
  const layout = detectPlatformLayout();
  return {
    layout,
    controlScheme: resolveEffectiveControlScheme(layout),
  };
}

export function usePlatformLayoutContext(): PlatformLayoutContextValue {
  const ctx = useContext(PlatformLayoutContext);
  if (ctx) return ctx;
  if (import.meta.env.DEV) {
    console.warn("usePlatformLayoutContext: outside PlatformLayoutProvider, using detectPlatformLayout()");
  }
  return fallbackContextValue();
}
