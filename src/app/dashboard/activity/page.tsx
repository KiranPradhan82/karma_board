"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Users,
  Wifi,
  WifiOff,
  Clock,
  RefreshCw,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card as MobileCard,
  CardContent as MobileCardContent,
} from "@/components/ui/card";

interface UserActivity {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  avatar: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  sessionLastSeen: string | null;
  isOnline: boolean;
}

function formatRelativeTime(ts: string | null): string {
  if (!ts) return "Never";
  try {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffSec < 60) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return "Unknown";
  }
}

const ROLE_COLORS: Record<string, string> = {
  SUPERADMIN: "bg-rose-100 text-rose-700 border-rose-200",
  ADMIN: "bg-amber-100 text-amber-700 border-amber-200",
  MEMBER: "bg-slate-100 text-slate-600 border-slate-200",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function UserActivityPage() {
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<UserActivity[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchActivity = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch("/api/members/activity");
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setUsers(json.data.users);
          setOnlineCount(json.data.onlineCount);
          setTotalUsers(json.data.totalUsers);
        }
      }
    } catch (error) {
      console.error("Failed to fetch user activity:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchActivity();
    }
  }, [status, fetchActivity]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (status !== "authenticated") return;
    const interval = setInterval(() => {
      fetchActivity(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [status, fetchActivity]);

  if (status === "loading" || loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-2">
          <Skeleton className="h-28 sm:h-32 rounded-lg" />
          <Skeleton className="h-28 sm:h-32 rounded-lg" />
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">
            User Activity
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Monitor who&apos;s online and track user sessions.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchActivity(true)}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-2">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 px-4 pt-4 sm:px-6 sm:pt-6">
            <p className="text-xs font-medium sm:text-sm text-muted-foreground">
              Currently Online
            </p>
            <div className="rounded-md p-1.5 sm:p-2 bg-emerald-100 text-emerald-600">
              <Wifi className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="text-2xl font-bold sm:text-3xl">{onlineCount}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5 sm:text-xs sm:mt-1">
              of {totalUsers} total users
            </p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 px-4 pt-4 sm:px-6 sm:pt-6">
            <p className="text-xs font-medium sm:text-sm text-muted-foreground">
              Total Users
            </p>
            <div className="rounded-md p-1.5 sm:p-2 bg-blue-100 text-blue-600">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="text-2xl font-bold sm:text-3xl">{totalUsers}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5 sm:text-xs sm:mt-1">
              Active team members
            </p>
          </CardContent>
        </Card>
      </div>

      {/* User List — Desktop Table */}
      <Card className="hidden md:block">
        <CardHeader className="px-4 pt-4 sm:px-6 sm:pt-6">
          <div className="text-base font-semibold sm:text-lg">All Users</div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 sm:pl-6">User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Last Login</TableHead>
                  <TableHead className="hidden xl:table-cell">Last Activity</TableHead>
                  <TableHead className="hidden xl:table-cell">Session Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow
                    key={user.id}
                    className={user.isOnline ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""}
                  >
                    <TableCell className="pl-4 sm:pl-6">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {getInitials(user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${
                              user.isOnline ? "bg-emerald-500" : "bg-gray-400"
                            }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{user.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${ROLE_COLORS[user.role] || ""}`}
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {user.isOnline ? (
                          <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <WifiOff className="h-3.5 w-3.5 text-gray-400" />
                        )}
                        <span className={`text-xs ${user.isOnline ? "text-emerald-600 font-medium" : "text-muted-foreground"}`}>
                          {user.isOnline ? "Online" : "Offline"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(user.lastLoginAt)}
                      </div>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <div className="text-xs text-muted-foreground">
                        {formatRelativeTime(user.lastActivityAt)}
                      </div>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <div className="text-xs text-muted-foreground">
                        {formatRelativeTime(user.sessionLastSeen)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No users found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* User List — Mobile Cards */}
      <div className="md:hidden space-y-3">
        {users.map((user) => (
          <MobileCard
            key={user.id}
            className={user.isOnline ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20" : ""}
          >
            <MobileCardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${
                        user.isOnline ? "bg-emerald-500" : "bg-gray-400"
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {user.isOnline ? (
                    <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 text-gray-400" />
                  )}
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${ROLE_COLORS[user.role] || ""}`}
                  >
                    {user.role}
                  </Badge>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>Login: {formatRelativeTime(user.lastLoginAt)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>Activity: {formatRelativeTime(user.lastActivityAt)}</span>
                </div>
              </div>
            </MobileCardContent>
          </MobileCard>
        ))}
        {users.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No users found.
          </div>
        )}
      </div>
    </div>
  );
}