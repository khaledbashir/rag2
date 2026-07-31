"use client";

import { ThemeToggle } from "@/app/components/ThemeToggle";

/**
 * Kept for the `@/app/components` barrel export. This used to be a second,
 * separate implementation of the theme switcher — it read `theme` instead of
 * `resolvedTheme` and had no mount guard, so it disagreed with the header
 * control about which theme was active. There is now one implementation.
 */
const ThemeSwitcher = () => <ThemeToggle variant="icon" />;

export default ThemeSwitcher;
