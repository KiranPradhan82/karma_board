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
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const user = session?.user as { name?: string; role?: string } | undefined;

  const stats = [
    {
      title: "Total Projects",
      value: "0",
      description: "Active projects in your workspace",
      icon: FolderKanban,
      color: "text-blue-600 bg-blue-100",
    },
    {
      title: "Active Members",
      value: "0",
      description: "Team members currently active",
      icon: Users,
      color: "text-emerald-600 bg-emerald-100",
    },
    {
      title: "Hours Today",
      value: "0h 0m",
      description: "Total hours tracked today",
      icon: Clock,
      color: "text-amber-600 bg-amber-100",
    },
    {
      title: "Active Sessions",
      value: "0",
      description: "Team members currently tracking time",
      icon: Activity,
      color: "text-rose-600 bg-rose-100",
    },
  ];

  if (status === "loading") {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Welcome back{user?.name ? `, ${user.name}` : ""}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Here&apos;s an overview of your workspace activity.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription className="text-sm font-medium">
                  {stat.title}
                </CardDescription>
                <div className={`rounded-md p-2 ${stat.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Placeholder for recent activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
          <CardDescription>
            Your team&apos;s latest actions and updates will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Activity className="h-10 w-10 text-muted-foreground/50 mb-3" />
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
