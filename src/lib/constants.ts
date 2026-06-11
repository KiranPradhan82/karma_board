import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Bot,
  Settings,
  Briefcase,
  Activity,
  type LucideIcon,
} from "lucide-react";

export const ROLES = {
  SUPERADMIN: "SUPERADMIN",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
} as const;

export const PROJECT_STATUSES = {
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  ON_HOLD: "ON_HOLD",
  ARCHIVED: "ARCHIVED",
} as const;

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  minRole?: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Team",
    href: "/dashboard/team",
    icon: Users,
    minRole: "ADMIN",
  },
  {
    label: "Clients",
    href: "/dashboard/clients",
    icon: Briefcase,
    minRole: "SUPERADMIN",
  },
  {
    label: "Projects",
    href: "/dashboard/projects",
    icon: FolderKanban,
  },
  {
    label: "Karma Space",
    href: "/dashboard/ai-assistant",
    icon: Bot,
  },
  {
    label: "User Activity",
    href: "/dashboard/activity",
    icon: Activity,
    minRole: "SUPERADMIN",
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
    minRole: "SUPERADMIN",
  },
];

export const ROLE_HIERARCHY: Record<string, number> = {
  SUPERADMIN: 3,
  ADMIN: 2,
  MEMBER: 1,
};

export function hasMinimumRole(userRole: string, minRole: string): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 0);
}
