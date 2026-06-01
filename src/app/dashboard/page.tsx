"use client";

import { useSession } from "next-auth/react";
import {
  FolderKanban,
  Users,
  Clock,
  Activity,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const user = session?.user as { name?: string; role?: string } | undefined;

  const stats = [
    {
      title: "Total Projects",
      value: "0",
      description: "Active projects",
      icon: FolderKanban,
      color: "text-blue-600 bg-blue-100",
    },
    {
      title: "Active Members",
      value: "0",
      description: "Team members",
      icon: Users,
      color: "text-emerald-600 bg-emerald-100",
    },
    {
      title: "Hours Today",
      value: "0h 0m",
      description: "Tracked today",
      icon: Clock,
      color: "text-amber-600 bg-amber-100",
    },
    {
      title: "Active Sessions",
      value: "0",
      description: "Tracking time",
      icon: Activity,
      color: "text-rose-600 bg-rose-100",
    },
  ];

  if (status === "loading") {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 sm:h-32 rounded-lg" />
          ))}
        </div>
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

      {/* Stats cards — 2x2 on mobile, 2 on tablet, 4 on desktop */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((stat) => {
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
            Your team&apos;s latest actions and updates will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center">
            <Activity className="h-8 w-8 text-muted-foreground/50 mb-2 sm:h-10 sm:w-10 sm:mb-3" />
            <p className="text-sm text-muted-foreground">
              No recent activity to display.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Start by creating a project or tracking some time.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
