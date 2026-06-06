"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import {
  FolderKanban,
  Users,
  Clock,
  Activity,
  Plus,
  UserPlus,
  MessageSquare,
  FileText,
  ShieldCheck,
  Trash2,
  Pencil,
  Link2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ActivityItem {
  id: string;
  action: string;
  details: string | null;
  entity: string | null;
  entityId: string | null;
  timestamp: string;
  userName: string | null;
  userAvatar: string | null;
}

interface DashboardStats {
  totalProjects: number;
  activeMembers: number;
  hoursToday: { hours: number; minutes: number; formatted: string };
  activeSessions: number;
  recentActivity: ActivityItem[];
  projectStatusBreakdown: Record<string, number>;
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  CREATE_PROJECT: Plus,
  CREATE_MEMBER: UserPlus,
  UPDATE_PROJECT: Pencil,
  DELETE_PROJECT: Trash2,
  CREATE_CLIENT: UserPlus,
  LOGIN: ShieldCheck,
  LINK_CLIENT: Link2,
  UPDATE_MEMBER: Pencil,
  CREATE_PROTOCOL: FileText,
  GENERATE_DOC: FileText,
};

const ACTION_COLORS: Record<string, string> = {
  CREATE_PROJECT: "text-blue-600 bg-blue-100",
  CREATE_MEMBER: "text-emerald-600 bg-emerald-100",
  UPDATE_PROJECT: "text-amber-600 bg-amber-100",
  DELETE_PROJECT: "text-rose-600 bg-rose-100",
  CREATE_CLIENT: "text-violet-600 bg-violet-100",
  LOGIN: "text-slate-600 bg-slate-100",
  LINK_CLIENT: "text-indigo-600 bg-indigo-100",
  UPDATE_MEMBER: "text-orange-600 bg-orange-100",
  CREATE_PROTOCOL: "text-purple-600 bg-purple-100",
  GENERATE_DOC: "text-teal-600 bg-teal-100",
};

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const user = session?.user as { name?: string; role?: string } | undefined;

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/stats");
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setStats(json.data);
        }
      }
    } catch (error) {
      console.error("Failed to fetch dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchStats();
    }
  }, [status, fetchStats]);

  const cards = [
    {
      title: "Total Projects",
      value: stats ? String(stats.totalProjects) : "0",
      description: "Active projects",
      icon: FolderKanban,
      color: "text-blue-600 bg-blue-100",
    },
    {
      title: "Active Members",
      value: stats ? String(stats.activeMembers) : "0",
      description: "Team members",
      icon: Users,
      color: "text-emerald-600 bg-emerald-100",
    },
    {
      title: "Hours Today",
      value: stats ? stats.hoursToday.formatted : "0h 0m",
      description: "Tracked today",
      icon: Clock,
      color: "text-amber-600 bg-amber-100",
    },
    {
      title: "Active Sessions",
      value: stats ? String(stats.activeSessions) : "0",
      description: "Tracking time",
      icon: Activity,
      color: "text-rose-600 bg-rose-100",
    },
  ];

  if (status === "loading" || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 sm:h-32 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">
          Welcome back{user?.name ? `, ${user.name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Here&apos;s an overview of your workspace activity.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2 px-4 pt-4 sm:px-6 sm:pt-6">
                <CardDescription className="text-xs font-medium sm:text-sm">
                  {stat.title}
                </CardDescription>
                <div className={`rounded-md p-1.5 sm:p-2 ${stat.color}`}>
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
                <div className="text-xl font-bold sm:text-2xl">{stat.value}</div>
                <p className="text-[11px] text-muted-foreground mt-0.5 sm:text-xs sm:mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="px-4 pt-4 sm:px-6 sm:pt-6">
          <div className="text-base font-semibold sm:text-lg">Recent Activity</div>
          <CardDescription className="text-xs sm:text-sm">
            Your team&apos;s latest actions and updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
          {stats && stats.recentActivity.length > 0 ? (
            <div className="space-y-3">
              {stats.recentActivity.map((item) => {
                const IconComp = ACTION_ICONS[item.action] || MessageSquare;
                const colorClass = ACTION_COLORS[item.action] || "text-slate-600 bg-slate-100";

                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3"
                  >
                    <div className={`mt-0.5 rounded-md p-1.5 flex-shrink-0 ${colorClass}`}>
                      <IconComp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-snug">
                        <span className="font-medium">{item.userName || "System"}</span>
                        {" "}
                        <span className="text-muted-foreground">
                          {item.details || item.action.replace(/_/g, " ").toLowerCase()}
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                        {formatTimestamp(item.timestamp)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center">
              <Activity className="h-8 w-8 text-muted-foreground/50 mb-2 sm:h-10 sm:w-10 sm:mb-3" />
              <p className="text-sm text-muted-foreground">
                No recent activity to display.
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Start by creating a project or tracking some time.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
