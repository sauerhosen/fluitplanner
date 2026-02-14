import nodemailer from "nodemailer";

type VerificationEmailParams = {
  to: string;
  code: string;
  magicLink: string;
};

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP environment variables not configured");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendVerificationEmail({
  to,
  code,
  magicLink,
}: VerificationEmailParams): Promise<void> {
  const from =
    process.env.SMTP_FROM || "Fluitplanner <noreply@fluitplanner.nl>";
  const formattedCode = `${code.slice(0, 3)} ${code.slice(3)}`;

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const transport = getTransport();
      await transport.sendMail({
        from,
        to,
        subject: "Your Fluitplanner verification code",
        text: `Your verification code is: ${code}\n\nOr click this link to verify: ${magicLink}\n\nThis code expires in 30 minutes.`,
        html: verificationEmailHtml({ formattedCode, magicLink }),
      });
      return;
    } catch (err) {
      if (attempt < maxRetries && isTransientError(err)) {
        console.warn(
          `[email] Transient error (attempt ${attempt + 1}/${maxRetries + 1}), retrying:`,
          err instanceof Error ? err.message : err,
        );
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("ebusy") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("enotfound") ||
    msg.includes("econnrefused")
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function verificationEmailHtml({
  formattedCode,
  magicLink,
}: {
  formattedCode: string;
  magicLink: string;
}): string {
  const safeLink = escapeHtml(magicLink);
  // Branded HTML email with green accent matching the app (hsl(158 64% 30%) ≈ #1B9A6C)
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="padding:24px 32px 16px;border-bottom:3px solid #1B9A6C;">
            <span style="font-size:20px;font-weight:700;color:#1a2e24;">Fluitplanner</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:15px;color:#4a5e53;">Your verification code is:</p>
            <p style="margin:0 0 24px;font-size:36px;font-weight:700;letter-spacing:6px;color:#1a2e24;font-family:'Courier New',monospace;">${formattedCode}</p>
            <p style="margin:0 0 16px;font-size:15px;color:#4a5e53;">Or click the button below:</p>
            <a href="${safeLink}" style="display:inline-block;padding:12px 28px;background-color:#1B9A6C;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Verify my email</a>
            <p style="margin:24px 0 0;font-size:13px;color:#6b7f73;">This code expires in 30 minutes.</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;background-color:#f5f9f7;border-top:1px solid #e2ece7;">
            <p style="margin:0;font-size:12px;color:#6b7f73;">Fluitplanner &middot; You received this because someone requested access to a poll with your email address.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}
