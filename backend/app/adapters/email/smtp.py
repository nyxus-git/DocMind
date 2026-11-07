import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional
from app.adapters.email.base import EmailProvider
from app.core.config import settings

logger = logging.getLogger("docmind.email.smtp")


def _render_email_template(title: str, preheader: str, body_html: str, action_url: Optional[str] = None, action_label: Optional[str] = None) -> str:
    action_button_html = ""
    if action_url and action_label:
        action_button_html = f"""
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0;">
            <tr>
                <td align="center">
                    <a href="{action_url}" target="_blank" style="background: linear-gradient(135deg, #06b6d4, #14b8a6); color: #020617; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 28px; border-radius: 8px; display: inline-block; letter-spacing: 0.3px; box-shadow: 0 4px 14px rgba(6, 182, 212, 0.25);">
                        {action_label}
                    </a>
                </td>
            </tr>
        </table>
        <p style="font-size: 11px; color: #64748b; margin-top: 14px; word-break: break-all;">
            Or copy and paste this link in your browser:<br>
            <a href="{action_url}" style="color: #06b6d4;">{action_url}</a>
        </p>
        """

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f1f5f9;">
    <div style="max-width: 560px; margin: 40px auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
        <!-- Header -->
        <div style="padding: 32px 36px; border-bottom: 1px solid #1e293b; background: linear-gradient(to right, #0f172a, #16243b);">
            <div style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">
                Doc<span style="color: #06b6d4;">Mind</span>
                <span style="font-size: 11px; font-weight: 600; color: #06b6d4; background: rgba(6, 182, 212, 0.12); padding: 3px 8px; border-radius: 9999px; border: 1px solid rgba(6, 182, 212, 0.3); margin-left: 8px; vertical-align: middle;">ENTERPRISE</span>
            </div>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">{preheader}</div>
        </div>

        <!-- Body -->
        <div style="padding: 36px; font-size: 14px; line-height: 1.6; color: #cbd5e1;">
            {body_html}
            {action_button_html}
        </div>

        <!-- Footer -->
        <div style="padding: 24px 36px; background-color: #020617; border-top: 1px solid #1e293b; font-size: 11px; color: #64748b; line-height: 1.5;">
            <p style="margin: 0 0 6px 0;">This email was sent by <b>DocMind Document Intelligence</b> in accordance with your organization's security policy.</p>
            <p style="margin: 0;">If you did not initiate this request, no action is needed or contact security@docmind.ai.</p>
        </div>
    </div>
</body>
</html>
"""


class SMTPEmailProvider(EmailProvider):
    def __init__(self):
        self.enabled = settings.EMAIL_ENABLED and bool(settings.SMTP_USERNAME and settings.SMTP_PASSWORD)
        self.host = settings.SMTP_HOST
        self.port = settings.SMTP_PORT
        self.username = settings.SMTP_USERNAME
        self.password = settings.SMTP_PASSWORD.replace(" ", "")
        self.from_email = settings.SMTP_FROM_EMAIL or self.username
        self.from_name = settings.SMTP_FROM_NAME or "DocMind Support"
        self.use_tls = settings.SMTP_USE_TLS
        self.use_ssl = settings.SMTP_USE_SSL

    def _send_sync(self, to_email: str, subject: str, html_content: str, text_content: Optional[str] = None) -> bool:
        if not self.enabled:
            logger.info(f"[MOCK EMAIL - DISABLED] To: {to_email} | Subject: {subject}\n{text_content or html_content}")
            return True

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{self.from_name} <{self.from_email}>"
        msg["To"] = to_email

        if text_content:
            msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        try:
            if self.use_ssl:
                server = smtplib.SMTP_SSL(self.host, self.port, timeout=20)
            else:
                server = smtplib.SMTP(self.host, self.port, timeout=20)
                if self.use_tls:
                    server.starttls()

            server.login(self.username, self.password)
            server.sendmail(self.from_email, [to_email], msg.as_string())
            server.quit()
            logger.info(f"Email sent successfully to {to_email} (Subject: {subject})")
            return True
        except Exception as e:
            logger.error(f"Failed to send email to {to_email} via SMTP: {e}")
            return False

    async def send_email(self, to_email: str, subject: str, html_content: str, text_content: Optional[str] = None) -> bool:
        return await asyncio.to_thread(self._send_sync, to_email, subject, html_content, text_content)

    async def send_verification_email(self, to_email: str, verification_link: str) -> bool:
        subject = "Verify your DocMind Account"
        preheader = "Account Activation & Security Verification"
        body = f"""
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 0; margin-bottom: 12px;">Confirm your email address</h2>
        <p>Welcome to <b>DocMind</b>, the enterprise document intelligence platform.</p>
        <p>Please click the button below to verify your email address and activate full document ingestion, research chat, and comparative analysis privileges.</p>
        """
        html = _render_email_template(
            title=subject,
            preheader=preheader,
            body_html=body,
            action_url=verification_link,
            action_label="Verify Email Address"
        )
        text = f"Welcome to DocMind!\nVerify your account by visiting:\n{verification_link}"
        return await self.send_email(to_email, subject, html, text)

    async def send_password_reset_email(self, to_email: str, reset_link: str) -> bool:
        subject = "Reset your DocMind Password"
        preheader = "Security Alert: Password Reset Requested"
        body = f"""
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 0; margin-bottom: 12px;">Password Reset Request</h2>
        <p>We received a request to reset the password for your DocMind account associated with <b>{to_email}</b>.</p>
        <p>For your security, this reset link is single-use and will expire in <b>60 minutes</b>.</p>
        """
        html = _render_email_template(
            title=subject,
            preheader=preheader,
            body_html=body,
            action_url=reset_link,
            action_label="Set New Password"
        )
        text = f"Reset your DocMind password by visiting (expires in 60 minutes):\n{reset_link}"
        return await self.send_email(to_email, subject, html, text)

    async def send_member_invite_email(self, to_email: str, inviter_email: str, workspace_name: str, invite_link: str) -> bool:
        subject = f"Invitation to join {workspace_name} on DocMind"
        preheader = "Team Collaboration & Workspace Access"
        body = f"""
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 0; margin-bottom: 12px;">You've been invited to collaborate</h2>
        <p><b>{inviter_email}</b> has invited you to join the <b>{workspace_name}</b> workspace on DocMind.</p>
        <p>Collaborate with your team to review contracts, query reference documents with exact page citations, and synthesize multi-document comparison matrices.</p>
        """
        html = _render_email_template(
            title=subject,
            preheader=preheader,
            body_html=body,
            action_url=invite_link,
            action_label="Join Workspace"
        )
        text = f"You have been invited by {inviter_email} to join {workspace_name} on DocMind.\nAccept your invitation at:\n{invite_link}"
        return await self.send_email(to_email, subject, html, text)


_email_provider: Optional[EmailProvider] = None


def get_email_provider() -> EmailProvider:
    global _email_provider
    if _email_provider is None:
        _email_provider = SMTPEmailProvider()
    return _email_provider

