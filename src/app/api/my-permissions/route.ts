import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getTursoClient } from "@/lib/api-auth";
import { getUserPermissions } from "@/lib/feature-permissions";

/**
 * GET /api/my-permissions
 * Returns the current user's feature permissions.
 * SUPERADMIN gets all features enabled. ADMINs get their granted permissions.
 * MEMBERs get an empty map.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    if (user.role === "SUPERADMIN") {
      // SUPERADMIN has everything — return a full map
      const { SUPERADMIN_FEATURES } = await import("@/lib/feature-permissions");
      const allEnabled: Record<string, boolean> = {};
      for (const f of SUPERADMIN_FEATURES) {
        allEnabled[f.key] = true;
      }
      return NextResponse.json({
        success: true,
        data: {
          role: user.role,
          permissions: allEnabled,
        },
      });
    }

    if (user.role === "ADMIN") {
      const permissions = await getUserPermissions(user.id);
      return NextResponse.json({
        success: true,
        data: {
          role: user.role,
          permissions,
        },
      });
    }

    // MEMBER
    return NextResponse.json({
      success: true,
      data: { role: user.role, permissions: {} },
    });
  } catch (error) {
    console.error("[GET /api/my-permissions] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}