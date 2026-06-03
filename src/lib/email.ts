import type { Resend as ResendType } from "resend";
import { decrypt } from "@/lib/encryption";
import { getTursoClient } from "@/lib/api-auth";

type EmailProvider = "resend" | "gmail-smtp";

interface EmailConfig {
  provider: EmailProvider;
  // Resend
  resendApiKey: string | null;
  resendFromEmail: string;
  // Gmail SMTP
  smtpUser: string | null; // your@gmail.com
  smtpPass: string | null; // app password
  // Shared
  fromName: string;
}

/**
 * Get email configuration — reads from Settings DB first, falls back to env vars.
 * Provider is determined by EMAIL_PROVIDER env var (or DB setting), defaults to "gmail-smtp".
 */
async function getEmailConfig(): Promise<EmailConfig> {
  const defaultProvider: EmailProvider =
    (process.env.EMAIL_PROVIDER as EmailProvider) || "gmail-smtp";

  try {
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;

    if (tursoUrl && tursoToken) {
      const client = getTursoClient();

      // Fetch all email-related settings from DB (now includes SMTP_USER)
      const result = await client.execute({
        sql: `SELECT key, value FROM "Settings" WHERE key IN (?, ?, ?, ?, ?, ?)`,
        args: [
          "EMAIL_PROVIDER",
          "RESEND_API_KEY",
          "RESEND_FROM_EMAIL",
          "EMAIL_FROM_NAME",
          "SMTP_USER",
          "SMTP_PASSWORD",
        ],
      });

      let provider = defaultProvider;
      let resendApiKey: string | null = null;
      let resendFromEmail = "";
      let fromName = process.env.EMAIL_FROM_NAME || "KarmaBoard";
      let smtpUser: string | null = null;
      let smtpPass: string | null = null;

      for (const row of result.rows) {
        const key = row.key as string;
        const rawValue = row.value as string;

        switch (key) {
          case "EMAIL_PROVIDER":
            if (rawValue === "resend" || rawValue === "gmail-smtp") {
              provider = rawValue;
            }
            break;
          case "RESEND_API_KEY":
            try {
              resendApiKey = decrypt(rawValue);
            } catch {
              resendApiKey = null;
            }
            break;
          case "RESEND_FROM_EMAIL":
            resendFromEmail = rawValue;
            break;
          case "EMAIL_FROM_NAME":
            fromName = rawValue || fromName;
            break;
          case "RESEND_FROM_NAME": // legacy key name compatibility
            fromName = rawValue || fromName;
            break;
          case "SMTP_USER":
            smtpUser = rawValue;
            break;
          case "SMTP_PASSWORD":
            try {
              smtpPass = decrypt(rawValue);
            } catch {
              smtpPass = null;
            }
            break;
        }
      }

      // Fall back to env vars if DB values are empty
      if (!resendApiKey && process.env.RESEND_API_KEY) {
        resendApiKey = process.env.RESEND_API_KEY;
      }
      if (!resendFromEmail && process.env.RESEND_FROM_EMAIL) {
        resendFromEmail = process.env.RESEND_FROM_EMAIL;
      }
      if (!smtpUser && process.env.SMTP_USER) {
        smtpUser = process.env.SMTP_USER;
      }
      if (!smtpPass && process.env.SMTP_PASSWORD) {
        smtpPass = process.env.SMTP_PASSWORD;
      }

      console.log(`[email] Config loaded from DB+env. Provider: ${provider}, SMTP user: ${smtpUser ? "SET" : "NOT SET"}, SMTP pass: ${smtpPass ? "SET" : "NOT SET"}`);

      return {
        provider,
        resendApiKey,
        resendFromEmail,
        smtpUser,
        smtpPass,
        fromName,
      };
    }
  } catch (error) {
    console.error("[email] Error reading settings from DB:", error);
  }

  // Final fallback to env vars only
  const smtpUser = process.env.SMTP_USER || null;
  const smtpPass = process.env.SMTP_PASSWORD || null;

  console.log(`[email] Config from env vars only. Provider: ${defaultProvider}, SMTP user: ${smtpUser ? "SET" : "NOT SET"}, SMTP pass: ${smtpPass ? "SET" : "NOT SET"}`);

  return {
    provider: defaultProvider,
    resendApiKey: process.env.RESEND_API_KEY || null,
    resendFromEmail: process.env.RESEND_FROM_EMAIL || "",
    smtpUser,
    smtpPass,
    fromName: process.env.EMAIL_FROM_NAME || "KarmaBoard",
  };
}

// ===== Resend Transport =====

async function getResendClient(apiKey: string): Promise<ResendType> {
  const { Resend } = await import("resend");
  return new Resend(apiKey);
}

async function sendViaResend(
  config: EmailConfig,
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  if (!config.resendApiKey) {
    return { success: false, error: "Resend API key not configured" };
  }
  if (!config.resendFromEmail) {
    return { success: false, error: "Resend from email not configured" };
  }

  const resend = await getResendClient(config.resendApiKey);

  const { data, error } = await resend.emails.send({
    from: `${config.fromName} <${config.resendFromEmail}>`,
    to: [to],
    subject,
    html,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  console.log(`[email] Resend email sent to ${to}, emailId: ${data?.id}`);
  return { success: true };
}

// ===== Gmail SMTP Transport =====

async function sendViaGmailSmtp(
  config: EmailConfig,
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  if (!config.smtpUser || !config.smtpPass) {
    return {
      success: false,
      error: `Gmail SMTP not configured (SMTP_USER: ${config.smtpUser ? "SET" : "NOT SET"}, SMTP_PASSWORD: ${config.smtpPass ? "SET" : "NOT SET"})`,
    };
  }

  const nodemailer = await import("nodemailer");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.smtpUser}>`,
      to,
      subject,
      html,
    });

    console.log(`[email] Gmail SMTP email sent to ${to}, messageId: ${info.messageId}`);
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[email] Gmail SMTP error:", msg);
    return { success: false, error: msg };
  }
}

// ===== Public API =====

/**
 * Send a welcome email with temporary password to a new team member.
 * Uses whichever provider is configured (Gmail SMTP or Resend).
 */
export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
  temporaryPassword: string;
  loginUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const { to, name, temporaryPassword, loginUrl } = params;

  const config = await getEmailConfig();

  console.log(`[email] Sending welcome email to ${to} via ${config.provider}`);

  const subject = `Welcome to KarmaBoard, ${name}! — Your Account is Ready`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
      <!-- Header -->
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 12px; background: #6366f1; margin-bottom: 16px;">
          <span style="color: #ffffff; font-size: 24px; font-weight: 700;">K</span>
        </div>
        <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #111827;">Welcome to KarmaBoard!</h1>
      </div>

      <!-- Greeting -->
      <p style="font-size: 16px; color: #374151; line-height: 1.6; margin-bottom: 24px;">
        Hi <strong>${name}</strong>,
      </p>

      <p style="font-size: 16px; color: #374151; line-height: 1.6; margin-bottom: 24px;">
        Your account has been created and you're now part of the team! You can log in to KarmaBoard to start managing projects and collaborating with your team.
      </p>

      <!-- Credentials Card -->
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <p style="font-size: 14px; font-weight: 600; color: #111827; margin: 0 0 16px 0;">Your Login Credentials</p>

        <div style="margin-bottom: 16px;">
          <p style="font-size: 12px; color: #6b7280; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.05em;">Email</p>
          <p style="font-size: 15px; color: #111827; margin: 0; font-family: monospace; background: #ffffff; padding: 8px 12px; border-radius: 6px; border: 1px solid #e5e7eb;">${to}</p>
        </div>

        <div>
          <p style="font-size: 12px; color: #6b7280; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.05em;">Temporary Password</p>
          <p style="font-size: 15px; color: #111827; margin: 0; font-family: monospace; background: #ffffff; padding: 8px 12px; border-radius: 6px; border: 1px solid #e5e7eb; letter-spacing: 0.5px;">${temporaryPassword}</p>
        </div>
      </div>

      <!-- Security Notice -->
      <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <p style="font-size: 14px; color: #92400e; margin: 0; line-height: 1.5;">
          <strong>Important:</strong> You will be asked to set your own password the first time you log in. This temporary password will expire after you change it.
        </p>
      </div>

      <!-- CTA Button -->
      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${loginUrl}" target="_blank" style="display: inline-block; background: #6366f1; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 8px;">
          Log In to KarmaBoard
        </a>
      </div>

      <!-- Footer -->
      <div style="border-top: 1px solid #e5e7eb; padding-top: 24px; text-align: center;">
        <p style="font-size: 13px; color: #9ca3af; margin: 0 0 4px 0;">
          If you did not expect this email, please contact your administrator.
        </p>
        <p style="font-size: 13px; color: #9ca3af; margin: 0;">
          KarmaBoard — Project Management Made Simple
        </p>
      </div>
    </div>
  `;

  // Send via configured provider
  if (config.provider === "resend") {
    return sendViaResend(config, to, subject, html);
  }

  // Default: Gmail SMTP
  const result = await sendViaGmailSmtp(config, to, subject, html);

  if (!result.success) {
    console.warn(`[email] Gmail SMTP failed: ${result.error}`);
    console.warn(`[email] Would have sent to: ${to}`);
    console.warn(`[email] Temporary password: ${temporaryPassword}`);
  }

  return result;
}

/**
 * Send a welcome email to a new client with their temporary password.
 */
export async function sendClientWelcomeEmail(params: {
  to: string;
  name: string;
  temporaryPassword: string;
  loginUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const { to, name, temporaryPassword, loginUrl } = params;

  const config = await getEmailConfig();

  console.log(`[email] Sending client welcome email to ${to} via ${config.provider}`);

  const subject = `Welcome to KarmaBoard — Your Client Portal is Ready`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 12px; background: #059669; margin-bottom: 16px;">
          <span style="color: #ffffff; font-size: 24px; font-weight: 700;">K</span>
        </div>
        <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #111827;">Welcome to KarmaBoard!</h1>
        <p style="margin: 8px 0 0; font-size: 14px; color: #6b7280;">Client Portal</p>
      </div>

      <p style="font-size: 16px; color: #374151; line-height: 1.6; margin-bottom: 24px;">
        Hi <strong>${name}</strong>,
      </p>

      <p style="font-size: 16px; color: #374151; line-height: 1.6; margin-bottom: 24px;">
        Your client portal account has been created. You can now log in to track your project progress, view updates, and communicate with our team.
      </p>

      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <p style="font-size: 14px; font-weight: 600; color: #111827; margin: 0 0 16px 0;">Your Login Credentials</p>
        <div style="margin-bottom: 16px;">
          <p style="font-size: 12px; color: #6b7280; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.05em;">Email</p>
          <p style="font-size: 15px; color: #111827; margin: 0; font-family: monospace; background: #ffffff; padding: 8px 12px; border-radius: 6px; border: 1px solid #e5e7eb;">${to}</p>
        </div>
        <div>
          <p style="font-size: 12px; color: #6b7280; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.05em;">Temporary Password</p>
          <p style="font-size: 15px; color: #111827; margin: 0; font-family: monospace; background: #ffffff; padding: 8px 12px; border-radius: 6px; border: 1px solid #e5e7eb; letter-spacing: 0.5px;">${temporaryPassword}</p>
        </div>
      </div>

      <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <p style="font-size: 14px; color: #92400e; margin: 0; line-height: 1.5;">
          <strong>Important:</strong> You will be asked to set your own password the first time you log in.
        </p>
      </div>

      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${loginUrl}" target="_blank" style="display: inline-block; background: #059669; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 8px;">
          Access Client Portal
        </a>
      </div>

      <div style="border-top: 1px solid #e5e7eb; padding-top: 24px; text-align: center;">
        <p style="font-size: 13px; color: #9ca3af; margin: 0;">
          KarmaBoard — Project Management Made Simple
        </p>
      </div>
    </div>
  `;

  if (config.provider === "resend") {
    return sendViaResend(config, to, subject, html);
  }

  const result = await sendViaGmailSmtp(config, to, subject, html);

  if (!result.success) {
    console.warn(`[email] Gmail SMTP failed: ${result.error}`);
  }

  return result;
}

/**
 * Send a project notification email to a client.
 */
export async function sendClientNotificationEmail(params: {
  to: string;
  clientName: string;
  projectName: string;
  type: "STARTED" | "UPDATE" | "COMPLETED";
  message?: string;
  loginUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const { to, clientName, projectName, type, message, loginUrl } = params;

  const config = await getEmailConfig();

  console.log(`[email] Sending client notification email to ${to} via ${config.provider}`);

  const typeLabels: Record<string, { title: string; color: string; description: string }> = {
    STARTED: { title: "Project Started", color: "#059669", description: "Your project has officially begun and our team is now working on it." },
    UPDATE: { title: "Project Update", color: "#2563eb", description: "There is an important update about your project." },
    COMPLETED: { title: "Project Completed", color: "#9333ea", description: "Your project has been completed successfully!" },
  };

  const typeInfo = typeLabels[type] || typeLabels.UPDATE;

  const subject = `${typeInfo.title}: ${projectName}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 12px; background: ${typeInfo.color}; margin-bottom: 16px;">
          <span style="color: #ffffff; font-size: 24px; font-weight: 700;">K</span>
        </div>
        <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #111827;">${typeInfo.title}</h1>
      </div>

      <p style="font-size: 16px; color: #374151; line-height: 1.6; margin-bottom: 24px;">
        Hi <strong>${clientName}</strong>,
      </p>

      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="font-size: 12px; color: #6b7280; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.05em;">Project</p>
        <p style="font-size: 18px; font-weight: 600; color: #111827; margin: 0 0 8px 0;">${projectName}</p>
        <p style="font-size: 14px; color: #374151; margin: 0; line-height: 1.5;">${typeInfo.description}</p>
      </div>

      ${message ? `
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="font-size: 12px; color: #6b7280; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.05em;">Message from our team</p>
        <p style="font-size: 15px; color: #111827; margin: 0; line-height: 1.6;">${message}</p>
      </div>
      ` : ''}

      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${loginUrl}" target="_blank" style="display: inline-block; background: ${typeInfo.color}; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 8px;">
          View in Client Portal
        </a>
      </div>

      <div style="border-top: 1px solid #e5e7eb; padding-top: 24px; text-align: center;">
        <p style="font-size: 13px; color: #9ca3af; margin: 0;">
          KarmaBoard — Project Management Made Simple
        </p>
      </div>
    </div>
  `;

  if (config.provider === "resend") {
    return sendViaResend(config, to, subject, html);
  }

  const result = await sendViaGmailSmtp(config, to, subject, html);

  if (!result.success) {
    console.warn(`[email] Gmail SMTP failed: ${result.error}`);
  }

  return result;
}
