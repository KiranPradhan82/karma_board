import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth-utils";

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    const existingAdmin = await db.user.findUnique({
      where: { email: "admin@teamforge.com" },
    });

    if (existingAdmin) {
      console.log("✅ Superadmin already exists. Skipping seed.");
      return;
    }

    const hashedPassword = await hashPassword("Admin@123");

    const superadmin = await db.user.create({
      data: {
        name: "Super Admin",
        email: "admin@teamforge.com",
        password: hashedPassword,
        role: "SUPERADMIN",
      },
    });

    console.log("✅ Superadmin created:", {
      id: superadmin.id,
      email: superadmin.email,
      role: superadmin.role,
    });
    console.log("🔑 Login: admin@teamforge.com / Admin@123");
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }

  console.log("🌱 Seed completed.");
}

seed();
