'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { ToastContainer, type ToastItem } from '@/components/ui/Toast';
import { getTranslations } from '@/lib/i18n';
import type { LanguageCode, ThemeMode } from '@/types/panel';

interface PanelContextValue {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: ReturnType<typeof getTranslations>;
  notify: (type: ToastItem['type'], message: string) => void;
}

const PanelContext = createContext<PanelContextValue | null>(null);

export function Providers({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('dark');
  const [language, setLanguageState] = useState<LanguageCode>('id');
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('racklite_theme') as ThemeMode | null;
    const savedLang = localStorage.getItem('racklite_lang') as LanguageCode | null;
    if (savedTheme === 'light' || savedTheme === 'dark') {
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    } else {
      document.documentElement.classList.add('dark');
    }
    queueMicrotask(() => {
      if (savedTheme === 'light' || savedTheme === 'dark') {
        setThemeState(savedTheme);
      }
      if (savedLang === 'id' || savedLang === 'en') {
        setLanguageState(savedLang);
      }
    });
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    localStorage.setItem('racklite_theme', mode);
    document.documentElement.classList.toggle('dark', mode === 'dark');
  }, []);

  const setLanguage = useCallback((lang: LanguageCode) => {
    setLanguageState(lang);
    localStorage.setItem('racklite_lang', lang);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback((type: ToastItem['type'], message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const t = getTranslations(language);

  return (
    <PanelContext.Provider
      value={{ theme, setTheme, language, setLanguage, t, notify }}
    >
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </PanelContext.Provider>
  );
}

export function usePanel() {
  const ctx = useContext(PanelContext);
  if (!ctx) {
    throw new Error('usePanel harus digunakan di dalam Providers.');
  }
  return ctx;
}
