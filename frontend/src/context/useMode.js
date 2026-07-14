import { useContext } from 'react';
import { ModeContext } from './mode-context.js';

export function useMode() {
  const context = useContext(ModeContext);
  if (!context) {
    throw new Error('useMode must be used within ModeProvider');
  }
  return context;
}
