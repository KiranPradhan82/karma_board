'use client';

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, LogIn } from "lucide-react";
import { SiteLogo } from "@/components/site-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useApiError } from "@/hooks/use-api-error";

export default function ClientLoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { showError, ErrorDetailDialog } = useApiError();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!email || !password) {
      toast.error("Please enter both email and password");
      setIsLoading(false);
      return;
    }

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        showError('Login failed', res.error || 'Invalid email or password');
        toast.error("Invalid email or password");
        return;
      }

      toast.success("Welcome!");
      router.push("/client/portal");
      router.refresh();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showError('Login failed', errMsg, 'URL: signIn(credentials)');
      toast.error(errMsg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3">
              <SiteLogo size={48} className="rounded-xl" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              KarmaBoard
            </CardTitle>
            <CardDescription>
              Client Portal — Sign in to view your projects
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="client-email">Email</Label>
                <Input
                  id="client-email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-password">Password</Label>
                <Input
                  id="client-password"
                  name="password"
                  type="password"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="mr-2 h-4 w-4" />
                )}
                Sign In to Client Portal
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          KarmaBoard — Project Management Made Simple
        </p>
      </div>

      {ErrorDetailDialog}
    </div>
  );
}
