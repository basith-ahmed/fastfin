"use client";

import { AlertTriangle, FileText, Home, Menu, Network, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Overview", icon: Home },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/knowledge", label: "Knowledge", icon: Network },
  { href: "/issues", label: "Issues", icon: AlertTriangle },
];

function NavLinks({ pathname, close }: { pathname: string; close?: () => void }) {
  return (
    <nav className="space-y-1 px-3">
      {navigation.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={close}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:bg-slate-900 hover:text-slate-100",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-slate-800 bg-slate-950 lg:flex">
        <Link href="/" className="flex h-16 items-center gap-3 border-b border-slate-800 px-6">
          <span className="grid size-8 place-items-center rounded-lg bg-white text-sm font-bold text-slate-950">
            F
          </span>
          <div>
            <p className="font-semibold tracking-tight text-white">FastFin</p>
            <p className="text-[11px] text-slate-500">Fact knowledge layer</p>
          </div>
        </Link>
        <div className="py-5">
          <NavLinks pathname={pathname} />
        </div>
        <div className="mt-auto border-t border-slate-800 p-5 text-xs leading-5 text-slate-500">
          Every accepted fact links back to verified PDF evidence.
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white px-4 lg:hidden">
        <Link href="/" className="font-semibold tracking-tight">
          FastFin
        </Link>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu />
        </Button>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-72 bg-slate-950 py-4 shadow-xl">
            <div className="mb-5 flex items-center justify-between px-6 text-white">
              <span className="font-semibold">FastFin</span>
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-300 hover:bg-slate-800 hover:text-white"
                onClick={() => setMobileOpen(false)}
              >
                <X />
              </Button>
            </div>
            <NavLinks pathname={pathname} close={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <main className="min-h-screen lg:pl-60">
        <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 xl:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}
