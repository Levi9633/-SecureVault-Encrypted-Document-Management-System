import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os

EMAIL_USER = os.environ.get("EMAIL_USER", "pruthviai112233@gmail.com")
EMAIL_PASS = os.environ.get("EMAIL_PASS", "rjsx gzna tfur wvah")

def send_encryption_key_email(recipient_email: str, username: str, file_name: str, password: str):
    if not recipient_email or "@" not in recipient_email:
        print(f"[EMAIL SERVICE] Invalid recipient email: {recipient_email}")
        return

    subject = f"SecureVault: Encryption Key for '{file_name}'"
    
    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">SecureVault Security Alert</h2>
          
          <p>Hello <strong>{username}</strong>,</p>
          
          <p>You have successfully encrypted and uploaded the following file to your SecureVault:</p>
          
          <div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #3b82f6; margin: 20px 0;">
            <p style="margin: 0;"><strong>File Name:</strong> {file_name}</p>
            <p style="margin: 10px 0 0 0;"><strong>Encryption Password:</strong> <span style="font-family: monospace; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">{password}</span></p>
          </div>
          
          <p style="color: #b91c1c; font-weight: bold;">⚠️ IMPORTANT SECURITY WARNING</p>
          <ul style="color: #b91c1c; font-size: 0.95em;">
            <li>This password is the <strong>only way</strong> to decrypt your file.</li>
            <li>SecureVault uses Zero-Knowledge encryption. If you lose this password, your file cannot be recovered by anyone, including administrators.</li>
            <li>Do not share this email or password with anyone you do not trust.</li>
          </ul>
          
          <p>Please keep this email safe for your records, or store the password in a secure password manager.</p>
          
          <br>
          <p style="font-size: 0.85em; color: #64748b; border-top: 1px solid #e0e0e0; padding-top: 15px;">
            This is an automated message from SecureVault. Please do not reply to this email.
          </p>
        </div>
      </body>
    </html>
    """

    msg = MIMEMultipart()
    msg['From'] = f"SecureVault <{EMAIL_USER}>"
    msg['To'] = recipient_email
    msg['Subject'] = subject
    msg.attach(MIMEText(html_content, 'html'))

    try:
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(EMAIL_USER, EMAIL_PASS)
        server.send_message(msg)
        server.quit()
        print(f"[EMAIL SERVICE] Successfully sent key email to {recipient_email} for file {file_name}")
    except Exception as e:
        print(f"[EMAIL SERVICE] Failed to send email to {recipient_email}: {e}")
