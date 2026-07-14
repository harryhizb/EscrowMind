import { useEffect, useMemo, useState } from 'react';
import { ModeContext } from './mode-context.js';

const MODE_STORAGE_KEY = 'escrowmind-ui-mode';
const VALID_MODES = new Set(['client', 'freelancer']);

export function ModeProvider({ children }) {
  const [mode, setModeState] = useState(() => {
    if (typeof window === 'undefined') return 'freelancer';
    const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
    return VALID_MODES.has(stored) ? stored : 'freelancer';
  });

  useEffect(() => {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  const value = useMemo(() => ({
    mode,
    isClientMode: mode === 'client',
    isFreelancerMode: mode === 'freelancer',
    setMode: (nextMode) => {
      if (VALID_MODES.has(nextMode)) setModeState(nextMode);
    },
    toggleMode: () => {
      setModeState((current) => (current === 'client' ? 'freelancer' : 'client'));
    },
  }), [mode]);

  return (
    <ModeContext.Provider value={value}>
      {children}
    </ModeContext.Provider>
  );
}
