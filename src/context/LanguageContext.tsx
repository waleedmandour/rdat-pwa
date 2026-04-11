"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { translations, Locale } from "@/i18n/translations";

type DeepKeyOf<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends string
          ? K
          : T[K] extends object
            ? `${K}.${DeepKeyOf<T[K]>}`
            : never
        : never;
    }[keyof T]
  : never;

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  isRTL: boolean;
  t: (key: DeepKeyOf<typeof translations.en>) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");

  const toggleLocale = useCallback(() => {
    setLocale((prev) => (prev === "en" ? "ar" : "en"));
  }, []);

  const isRTL = locale === "ar";

  const t = useCallback(
    (key: DeepKeyOf<typeof translations.en>): string => {
      const keys = key.split(".");
      let value: unknown = translations[locale];
      for (const k of keys) {
        if (value && typeof value === "object" && k in value) {
          value = (value as Record<string, unknown>)[k];
        } else {
          // Fallback to English
          value = translations.en;
          for (const fk of keys) {
            if (value && typeof value === "object" && fk in value) {
              value = (value as Record<string, unknown>)[fk];
            } else {
              return key;
            }
          }
          break;
        }
      }
      return typeof value === "string" ? value : key;
    },
    [locale]
  );

  const contextValue = useMemo(
    () => ({ locale, setLocale, toggleLocale, isRTL, t }),
    [locale, toggleLocale, isRTL, t]
  );

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
