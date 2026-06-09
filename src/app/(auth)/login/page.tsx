"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { errorToast } from "@/lib/error-toast";
import { Loader2, LogIn, Copy, Check } from "lucide-react";
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
import { loginSchema } from "@/lib/validations/user";
import type { LoginInput } from "@/lib/validations/user";

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [copiedDebug, setCopiedDebug] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setDebugInfo(null);

    const formData = new FormData(e.currentTarget);
    const data: LoginInput = {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    };

    const result = loginSchema.safeParse(data);

    if (!result.success) {
      toast.error(result.error.errors[0]?.message || "Invalid input");
      setIsLoading(false);
      return;
    }

    try {
      const res = await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (res?.error) {
        const errDetail = `signIn error: ${res.error}
URL: ${typeof window !== "undefined" ? window.location.href : "unknown"}
Email used: ${data.email}
NEXTAUTH_URL: ${process.env.NEXT_PUBLIC_NEXTAUTH_URL || "not set (client-side)"}`;
        setDebugInfo(errDetail);
        errorToast({ error: res.error, title: "Sign In Failed" });
        return;
      }

      toast.success("Welcome back!");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setDebugInfo(`Exception: ${errMsg}
Email used: ${data.email}
Stack: ${err instanceof Error ? err.stack : "N/A"}`);
      errorToast({ error: errMsg, title: "Sign In Failed" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold tracking-tight">
              KarmaBoard
            </CardTitle>
            <CardDescription>
              Sign in to your account to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
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
                Sign In
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Create one
              </Link>
            </div>
          </CardContent>
        </Card>

        {debugInfo && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-destructive">Login failed</p>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => {
                  navigator.clipboard.writeText(debugInfo);
                  setCopiedDebug(true);
                  setTimeout(() => setCopiedDebug(false), 2000);
                }}
              >
                {copiedDebug ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap break-all text-muted-foreground">
              {debugInfo}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
