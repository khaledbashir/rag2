"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Fragment } from "react";

export type BreadcrumbItem = {
    label: string;
    href?: string;
};

export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
    if (items.length === 0) return null;

    return (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
            {items.map((item, i) => (
                <Fragment key={i}>
                    {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/40" />}
                    {item.href ? (
                        <Link
                            href={item.href}
                            className="hover:text-foreground transition-colors truncate max-w-[200px]"
                        >
                            {item.label}
                        </Link>
                    ) : (
                        <span className="text-foreground font-medium truncate max-w-[200px]">
                            {item.label}
                        </span>
                    )}
                </Fragment>
            ))}
        </nav>
    );
}
