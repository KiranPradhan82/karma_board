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
  const publicRoutes = ["/login", "/register", "/setup", "/client/login", "/api/auth/register", "/api/setup", "/change-password", "/client/change-password", "/api/auth/reset-first-password", "/api/clients/auth"];
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith("/api/auth/") || pathname === "/api/setup" || pathname.startsWith("/api/setup/")
  );

  // Client public routes
  const isClientPublicRoute = pathname === "/client/login" || pathname === "/client/change-password";

  // Allow public routes
  if (isPublicRoute) {
    // If user is logged in and tries to access login/register/setup, redirect appropriately
    if (token) {
      if (pathname === "/login" || pathname === "/register" || pathname === "/setup") {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      if (pathname === "/client/login") {
        if (token.accountType === "client") {
          return NextResponse.redirect(new URL("/client/portal", request.url));
        }
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
    return NextResponse.next();
  }

  // Protect all other routes (dashboard, client, and API)
  if (!token) {
    // API routes return 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }
    // Page routes redirect to login
    if (pathname.startsWith("/client/")) {
      return NextResponse.redirect(new URL("/client/login", request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const accountType = token.accountType as string | undefined;

  // Client-specific routing
  if (accountType === "client") {
    // Clients cannot access /dashboard/* routes
    if (pathname.startsWith("/dashboard/")) {
      return NextResponse.redirect(new URL("/client/portal", request.url));
    }
    if (pathname === "/dashboard") {
      return NextResponse.redirect(new URL("/client/portal", request.url));
    }

    // Force password change for clients
    if (
      token.mustChangePassword === true &&
      pathname !== "/client/change-password"
    ) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { success: false, error: "Password change required. Please set a new password first." },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL("/client/change-password", request.url));
    }

    // Allow client routes
    return NextResponse.next();
  }

  // Team user routing
  // Team users cannot access /client/* routes (except public ones)
  if (pathname.startsWith("/client/")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
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

  // Clients management - SUPERADMIN only
  if (
    pathname.startsWith("/dashboard/clients") &&
    token.role !== "SUPERADMIN"
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/client/:path*", "/api/:path*", "/setup", "/change-password"],
};
