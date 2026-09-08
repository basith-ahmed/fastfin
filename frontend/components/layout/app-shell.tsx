"use client";

import { AlertTriangle, FileText, LayoutDashboard, Menu, Network, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
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
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-blue-50 text-blue-800"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
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
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200/80 bg-white/95 shadow-[8px_0_32px_rgba(15,23,42,0.025)] backdrop-blur-xl lg:flex">
        <Link href="/" className="flex h-[76px] items-center gap-3 border-b border-slate-100 px-6" aria-label="FastFin home">
          <span className="grid size-9 place-items-center rounded-xl bg-blue-700 text-white shadow-sm shadow-blue-900/15"><ShieldCheck className="size-[18px]" /></span>
          <p className="text-[17px] font-bold tracking-[-0.035em] text-slate-950">FastFin</p>
        </Link>
        <div className="py-5"><NavLinks pathname={pathname} /></div>
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl lg:hidden">
        <Link href="/" className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-lg bg-blue-700 text-white"><ShieldCheck className="size-4" /></span><span className="font-bold tracking-tight">FastFin</span></Link>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu /></Button>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-slate-950/20 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-72 border-r border-slate-200 bg-white py-4 shadow-xl">
            <div className="mb-5 flex items-center justify-between px-6 text-slate-950">
              <span className="font-semibold">FastFin</span>
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setMobileOpen(false)}
              >
                <X />
              </Button>
            </div>
            <NavLinks pathname={pathname} close={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <main className="min-h-screen lg:pl-64">
        <div className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-6 sm:py-10 lg:px-10 lg:py-12">
          {children}
        </div>
      </main>
    </div>
  );
}
