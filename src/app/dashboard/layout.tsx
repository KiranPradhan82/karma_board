"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Clock,
  Bot,
  Settings,
  LogOut,
  X,
  Menu,
  Hammer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { NAV_ITEMS, hasMinimumRole } from "@/lib/constants";
import type { NavItem } from "@/lib/constants";

const ICON_MAP: Record<string, NavItem["icon"]> = {
  Dashboard: LayoutDashboard,
  Team: Users,
  Projects: FolderKanban,
  "Time Tracker": Clock,
  "AI Assistant": Bot,
  Settings: Settings,
};

function NavContent({
  collapsed,
  onNavClick,
}: {
  collapsed: boolean;
  onNavClick?: () => void;
}) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const user = session?.user as { name?: string; role?: string } | undefined;
  const role = user?.role || "MEMBER";

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.minRole || hasMinimumRole(role, item.minRole)
  );

  return (
    <>
      {/* Header */}
      <div className="flex h-14 items-center border-b px-4 shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
            <Hammer className="h-4 w-4" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-lg tracking-tight">
              KarmaBoard
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-2 py-4">
        <nav className="flex flex-col gap-1">
          {visibleItems.map((item) => {
            const Icon = ICON_MAP[item.label] || LayoutDashboard;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavClick}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                } ${collapsed ? "justify-center" : ""}`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* User section */}
      <div className="border-t p-2 shrink-0">
        {!collapsed && user && (
          <Link
            href="/dashboard/profile"
            onClick={onNavClick}
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors"
          >
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {user.name
                  ?.split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2) || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {user.role}
              </Badge>
            </div>
          </Link>
        )}
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          onClick={() => signOut({ callbackUrl: "/login" })}
          className={`w-full text-muted-foreground hover:text-destructive ${
            collapsed ? "justify-center" : "mt-1"
          }`}
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="ml-2">Sign Out</span>}
        </Button>
      </div>
    </>
  );
}

function DesktopSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={`hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col border-r bg-card transition-all duration-300 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <NavContent collapsed={collapsed} />
      {/* Collapse toggle inside sidebar header */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-3.5 right-3 h-8 w-8"
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <Menu className="h-4 w-4" />
        ) : (
          <X className="h-4 w-4" />
        )}
      </Button>
    </aside>
  );
}

function MobileDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        onClick={onClose}
      />
      {/* Drawer */}
      <aside className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-card shadow-xl lg:hidden animate-in slide-in-from-left duration-200">
        <NavContent collapsed={false} onNavClick={onClose} />
      </aside>
    </>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <DesktopSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Mobile drawer */}
      <MobileDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Mobile top bar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 flex h-14 items-center border-b bg-card px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Link href="/dashboard" className="flex items-center gap-2 ml-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Hammer className="h-3.5 w-3.5" />
          </div>
          <span className="font-semibold text-base tracking-tight">
            KarmaBoard
          </span>
        </Link>
      </header>

      {/* Main content area */}
      <main
        className={`min-h-screen transition-all duration-300 pt-14 lg:pt-0 ${
          sidebarCollapsed ? "lg:ml-16" : "lg:ml-64"
        }`}
      >
        <div className="p-4 pb-6 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
