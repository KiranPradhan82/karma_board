'use client';

import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  LogOut,
  User,
  Briefcase,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Hammer,
  Settings,
  Bell,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiError } from "@/hooks/use-api-error";
import Link from "next/link";

interface ClientProject {
  id: string;
  name: string;
  status: string;
  priority: string;
  deadline: string | null;
  color: string | null;
  description: string | null;
}

interface Activity {
  id: string;
  action: string;
  details: string | null;
  timestamp: string;
  userName: string | null;
}

interface Notification {
  id: string;
  type: string;
  message: string | null;
  projectName: string | null;
  sentByName: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; className: string; color: string }> = {
  ACTIVE: { label: "Active", className: "bg-emerald-100 text-emerald-700", color: "bg-emerald-500" },
  COMPLETED: { label: "Completed", className: "bg-blue-100 text-blue-700", color: "bg-blue-500" },
  ON_HOLD: { label: "On Hold", className: "bg-yellow-100 text-yellow-700", color: "bg-yellow-500" },
  ARCHIVED: { label: "Archived", className: "bg-gray-100 text-gray-600", color: "bg-gray-500" },
};

function getStatusProgress(status: string) {
  switch (status) {
    case "COMPLETED": return 100;
    case "ACTIVE": return 65;
    case "ON_HOLD": return 30;
    default: return 0;
  }
}

function getDaysRemaining(deadline: string | null, status: string) {
  if (!deadline || status === "COMPLETED") return null;
  const diff = new Date(deadline).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function ClientPortalPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const { showError, ErrorDetailDialog } = useApiError();
  const [clientData, setClientData] = useState<{ name: string; email: string; company: string | null } | null>(null);
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClientData = useCallback(async () => {
    try {
      const res = await fetch("/api/clients/me");
      const data = await res.json();
      if (data.success) {
        setClientData(data.data);
      } else {
        showError('Failed to load client data', data.error || 'Unknown error');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showError('Failed to load client data', errMsg, 'URL: /api/clients/me');
    }
  }, []);

  const fetchActivities = useCallback(async () => {
    try {
      const res = await fetch("/api/clients/me/activities");
      const data = await res.json();
      if (data.success) {
        setActivities(data.data.activities || []);
        setNotifications(data.data.notifications || []);
      } else {
        showError('Failed to load activities', data.error || 'Unknown error');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showError('Failed to load activities', errMsg, 'URL: /api/clients/me/activities');
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      // We get projects from the client profile's linked projects
      const res = await fetch("/api/clients/me");
      const data = await res.json();
      if (data.success) {
        setClientData(data.data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (authStatus === "authenticated") {
      setLoading(true);
      Promise.all([fetchClientData(), fetchActivities()]).finally(() => setLoading(false));
    }
  }, [authStatus, fetchClientData, fetchActivities]);

  if (authStatus === "loading" || loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="p-6 max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 h-14">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Hammer className="h-4 w-4" />
            </div>
            <span className="font-semibold text-lg tracking-tight hidden sm:inline">KarmaBoard</span>
            <Badge variant="secondary" className="ml-2 text-[10px]">Client Portal</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/client/profile">
                <Settings className="h-4 w-4 mr-1" />
                Profile
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/client/login" })}>
              <LogOut className="h-4 w-4 mr-1" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 p-4 sm:p-6 max-w-6xl mx-auto space-y-6 w-full">
        {/* Welcome */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome, {clientData?.name || "Client"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {clientData?.company ? `${clientData.company} — ` : ""}
              {clientData?.email || ""}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/client/profile">
              <User className="h-4 w-4 mr-1" />
              Edit Profile
            </Link>
          </Button>
        </div>

        {/* Notifications */}
        {notifications.length > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Recent Notifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {notifications.slice(0, 5).map((n) => (
                  <div key={n.id} className="flex items-start justify-between text-sm border-b pb-2 last:border-0">
                    <div>
                      <p className="font-medium">
                        {n.type === "STARTED" && "🚀 "}
                        {n.type === "UPDATE" && "📋 "}
                        {n.type === "COMPLETED" && "✅ "}
                        {n.projectName || "Project"} — {n.type}
                      </p>
                      {n.message && <p className="text-muted-foreground text-xs mt-0.5">{n.message}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-4">
                      {new Date(n.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Projects Grid */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Your Projects
          </h2>
          {projects.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Briefcase className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No projects linked to your account yet.</p>
              </CardContent>
            </Card>
          )}
          {projects.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => {
                const status = statusConfig[project.status] || statusConfig.ACTIVE;
                const progress = getStatusProgress(project.status);
                const daysRemaining = getDaysRemaining(project.deadline, project.status);

                return (
                  <Card key={project.id} className="hover:shadow-md transition-shadow" style={{ borderLeftColor: project.color || "#6366f1", borderLeftWidth: "4px" }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{project.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {project.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{project.description}</p>
                      )}

                      <div className="flex items-center gap-2">
                        <Badge className={status.className}>{status.label}</Badge>
                      </div>

                      {/* Progress */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Progress</span>
                          <span>{progress}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>

                      {/* Deadline */}
                      {project.deadline && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>Deadline: {new Date(project.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                          {daysRemaining !== null && (
                            <Badge variant={daysRemaining < 0 ? "destructive" : daysRemaining <= 7 ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0 ml-auto">
                              {daysRemaining < 0 ? `${Math.abs(daysRemaining)}d overdue` : `${daysRemaining}d left`}
                            </Badge>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Activity Log */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Activity Log
          </h2>
          <Card>
            <CardContent className="p-0">
              {activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                </div>
              ) : (
                <div className="divide-y max-h-96 overflow-y-auto">
                  {activities.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="mt-1">
                        {activity.action.includes("STARTED") ? (
                          <AlertCircle className="h-4 w-4 text-blue-500" />
                        ) : activity.action.includes("COMPLETED") ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Clock className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{activity.details || activity.action}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {activity.userName && `by ${activity.userName} · `}
                          {new Date(activity.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        KarmaBoard — Project Management Made Simple
      </footer>

      {ErrorDetailDialog}
    </div>
  );
}
