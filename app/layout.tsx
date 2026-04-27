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

                        {/* PostHog Analytics (no-op until NEXT_PUBLIC_POSTHOG_KEY is set) */}
                        {process.env.NEXT_PUBLIC_POSTHOG_KEY ? (
                            <script
                                dangerouslySetInnerHTML={{
                                    __html: `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init(${JSON.stringify(process.env.NEXT_PUBLIC_POSTHOG_KEY)},{api_host:${JSON.stringify(process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com")},person_profiles:"identified_only",capture_pageview:true,capture_pageleave:true});`,
                                }}
                            />
                        ) : null}

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
