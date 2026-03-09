// Components
import { BaseFooter, BaseNavbar } from "@/app/components";
import AppShell from "@/app/components/layout/AppShell";
// ShadCn
import { Toaster } from "@/components/ui/toaster";
// Contexts
import Providers from "@/contexts/Providers";
import { auth } from "@/auth";
// Fonts
import {
    workSans,
    playfairDisplay,
} from "@/lib/fonts";
// SEO
import { JSONLD, ROOTKEYWORDS } from "@/lib/seo";
// Variables
import { BASE_URL, GOOGLE_SC_VERIFICATION } from "@/lib/variables";
import type { Metadata } from "next";
// Next Intl
import { NextIntlClientProvider } from "next-intl";

// Styles
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import "./globals.css";

// Import English messages directly
import enMessages from "@/i18n/locales/en.json";

export const metadata: Metadata = {
    title: "ANC Proposal Engine | Professional Sports Technology Proposals",
    description:
        "Create professional proposals for LED screens, sports technology, and digital signage projects with ANC Proposal Engine.",
    icons: [{ rel: "icon", url: "/anc-logo-blue.png" }],
    keywords: ROOTKEYWORDS,
    robots: {
        index: true,
        follow: true,
    },
    alternates: {
        canonical: BASE_URL,
    },
    authors: {
        name: "ANC Sports",
    },
    verification: {
        google: GOOGLE_SC_VERIFICATION,
    },
};

export const viewport = {
    width: "device-width",
    initialScale: 1,
};

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const locale = "en";
    const messages = enMessages;
    const session = await auth();
    const user = session?.user;
    const userbackUserData = user
        ? {
              id: String((user as any).id ?? user.email ?? user.name ?? "unknown"),
              info: {
                  ...(user.name ? { name: user.name } : {}),
                  ...(user.email ? { email: user.email } : {}),
              },
          }
        : null;

    return (
        <html lang={locale} suppressHydrationWarning>
            <head suppressHydrationWarning>
                <script
                    dangerouslySetInnerHTML={{ __html: `
                        window.addEventListener('error', function(e) {
                            if (e.message && (e.message.indexOf('ChunkLoadError') !== -1 || e.message.indexOf('Loading chunk') !== -1 || e.message.indexOf('Failed to fetch dynamically imported module') !== -1)) {
                                var key = 'anc_chunk_reload';
                                if (!sessionStorage.getItem(key)) {
                                    sessionStorage.setItem(key, '1');
                                    window.location.reload();
                                }
                            }
                        });
                    `}}
                />
                <script
                    type="application/ld+json"
                    id="json-ld"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }}
                />
            </head>
            <body
                className={`${workSans.className} ${playfairDisplay.variable} antialiased bg-background text-foreground`}
                suppressHydrationWarning
            >
                <NextIntlClientProvider locale={locale} messages={messages}>
                    <Providers>
                        <BaseNavbar />

                        <AppShell>{children}</AppShell>

                        <BaseFooter />

                        {/* Toast component */}
                        <Toaster />

                        {/* Umami Analytics */}
                        <script
                            defer
                            src="https://abc-umami.izcgmb.easypanel.host/script.js"
                            data-website-id="e275b293-afcd-468b-8748-cba2d667ab25"
                        ></script>

                        {/* Userback Widget */}
                        <script
                            dangerouslySetInnerHTML={{
                                __html: `
                                    window.Userback = window.Userback || {};
                                    Userback.access_token = ${JSON.stringify(process.env.NEXT_PUBLIC_USERBACK_ACCESS_TOKEN || "")};
                                    ${userbackUserData ? `Userback.user_data = ${JSON.stringify(userbackUserData)};` : ""}
                                    (function(d) {
                                        var s = d.createElement('script');s.async = true;s.src = 'https://static.userback.io/widget/v1.js';(d.head || d.body).appendChild(s);
                                    })(document);
                                `
                            }}
                        />
                    </Providers>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
