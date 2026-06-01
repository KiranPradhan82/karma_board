import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const { pathname } = request.nextUrl;

  // Public routes that don't need auth
  const publicRoutes = ["/login", "/register", "/setup", "/api/auth/register", "/api/setup", "/change-password", "/api/auth/reset-first-password"];
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith("/api/auth/") || pathname === "/api/setup"
  );

  // Allow public routes
  if (isPublicRoute) {
    // If user is logged in and tries to access login/register/setup, redirect to dashboard
    // (unless they need to change password — let them through to change-password)
    if (token && (pathname === "/login" || pathname === "/register" || pathname === "/setup")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // Protect all other routes (dashboard and API)
  if (!token) {
    // API routes return 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }
    // Page routes redirect to login
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Force password change: redirect users who must change password
  if (
    token.mustChangePassword === true &&
    pathname !== "/change-password" &&
    !pathname.startsWith("/api/auth/reset-first-password")
  ) {
    // API routes return 403 with helpful message
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Password change required. Please set a new password first." },
        { status: 403 }
      );
    }
    // Page routes redirect to change-password
    return NextResponse.redirect(new URL("/change-password", request.url));
  }

  // Superadmin-only routes
  if (pathname === "/dashboard/settings" && token.role !== "SUPERADMIN") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Admin+ routes
  if (
    pathname.startsWith("/dashboard/team") &&
    token.role !== "SUPERADMIN" &&
    token.role !== "ADMIN"
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*", "/setup", "/change-password"],
};
