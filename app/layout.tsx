import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { isLang, langCookie, translate } from "./i18n/core";
import { LanguageProvider } from "./i18n";
import "./globals.css";

/** The page title and description, in the language chosen on the first visit (English until then). */
export async function generateMetadata(): Promise<Metadata> {
  const saved = (await cookies()).get(langCookie)?.value;
  const lang = isLang(saved) ? saved : "en";
  return { title: translate(lang, "room.title.default"), description: translate(lang, "page.description") };
}

export const viewport: Viewport = {
  themeColor: "#11141a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // The language is chosen on the first visit and remembered in a cookie, so the page can be rendered in it right away.
  const saved = (await cookies()).get(langCookie)?.value;
  const lang = isLang(saved) ? saved : undefined;
  return (
    <html lang={lang ?? "en"}>
      <body>
        <LanguageProvider initial={lang}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
