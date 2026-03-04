"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";

export function ClerkThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();

  return (
    <ClerkProvider
      allowedRedirectOrigins={["http://localhost:3000", "http://127.0.0.1:3000"]}
      appearance={
        resolvedTheme === "dark"
          ? {
              baseTheme: dark,
              variables: {
                fontFamily: "var(--font-sans)",
              },
            }
          : {
              variables: {
                fontFamily: "var(--font-sans)",
              },
            }
      }
    >
      {children}
    </ClerkProvider>
  );
}
