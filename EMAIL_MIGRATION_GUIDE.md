# 📧 Email Service Migration Guide

## From SendGrid to Gmail SMTP

This guide covers the migration from SendGrid to Gmail SMTP using nodemailer for cost-effective email delivery.

## 🎯 Why Migrate?

- **Cost Savings**: Gmail SMTP is free for reasonable usage (up to 500 emails/day)
- **No API Limits**: No monthly quotas or per-email charges
- **Reliable Delivery**: Gmail's infrastructure ensures good deliverability
- **Simple Setup**: No complex API keys or webhook configurations

## 🔄 What Changed

### Dependencies
- ❌ Removed: `@sendgrid/mail`
- ✅ Added: `nodemailer`

### Environment Variables
- ❌ Removed: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME`
- ✅ Added: `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM_NAME`

### Code Changes
- Updated `server/src/services/emailService.js` to use nodemailer
- All email methods now use Gmail SMTP transport
- Maintained the same API interface for existing code

## 🚀 Setup Instructions

### 1. Install Dependencies

```bash
cd server
npm install nodemailer
npm uninstall @sendgrid/mail
```

### 2. Configure Gmail App Password

1. **Enable 2-Factor Authentication** on your Google account
2. **Generate App Password**:
   - Go to [Google Account Settings](https://myaccount.google.com/)
   - Security → 2-Step Verification → App passwords
   - Generate password for "Mail"
3. **Save the 16-character password** (you'll use this in EMAIL_PASS)

### 3. Update Environment Variables

Create/update your `server/.env` file:

```bash
# Email Service Configuration (Gmail SMTP)
EMAIL_USER=trailverseteam@gmail.com
EMAIL_PASS=your-16-character-app-password
EMAIL_FROM_NAME=TrailVerse
```

### 4. Test the Setup

Run the test script to verify everything works:

```bash
cd server
node test-email.js
```

## 📊 Cost Comparison

| Service | Free Tier | Paid Plans | Cost per 1000 emails |
|---------|-----------|------------|---------------------|
| **Gmail SMTP** | 500/day | N/A | **$0** |
| SendGrid | 100/day | $19.95/month | $0.60 |
| Mailgun | 5,000/month | $35/month | $0.80 |
| Postmark | 100/month | $15/month | $1.25 |

## 🔧 Configuration Options

### Gmail SMTP Settings
```javascript
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
```

### Alternative SMTP Providers

If you prefer other providers, you can easily switch:

```javascript
// For Outlook/Hotmail
const transporter = nodemailer.createTransporter({
  service: 'hotmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// For Custom SMTP
const transporter = nodemailer.createTransporter({
  host: 'smtp.yourdomain.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
```

## 🧪 Testing

### Manual Testing
```bash
cd server
node test-email.js
```

### Integration Testing
The email service maintains the same interface, so existing tests should work:

```javascript
// This still works the same way
await emailService.sendWelcomeEmail(user);
await emailService.sendPasswordReset(user, resetUrl);
await emailService.sendEmailVerification(user, verificationUrl);
```

## 🚨 Troubleshooting

### Common Issues

1. **"Invalid login" error**
   - Ensure you're using App Password, not regular password
   - Verify 2FA is enabled on Google account

2. **"Less secure app access" error**
   - App Passwords should bypass this requirement
   - If still getting this error, check Google account security settings

3. **Emails going to spam**
   - Add SPF/DKIM records to your domain (if using custom domain)
   - Use a professional "from" name
   - Avoid spam trigger words in subject/content

4. **Rate limiting**
   - Gmail allows ~500 emails/day for free accounts
   - For higher volumes, consider Gmail Workspace or other providers

### Debug Mode

Enable debug logging in nodemailer:

```javascript
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  debug: true, // Enable debug mode
  logger: true // Log to console
});
```

## 📈 Monitoring

### Email Delivery Tracking

While Gmail SMTP doesn't provide built-in analytics like SendGrid, you can:

1. **Monitor server logs** for email send confirmations
2. **Track user actions** (password resets, email verifications)
3. **Use Google Analytics** for email link clicks
4. **Implement custom tracking** with UTM parameters

### Example Logging

```javascript
try {
  await transporter.sendMail(mailOptions);
  console.log(`✅ Email sent to: ${user.email}`);
  // Log to database for analytics
} catch (error) {
  console.error(`❌ Email failed: ${user.email}`, error);
  // Log error for monitoring
}
```

## 🔄 Rollback Plan

If you need to rollback to SendGrid:

1. **Restore dependencies**:
   ```bash
   npm install @sendgrid/mail
   npm uninstall nodemailer
   ```

2. **Restore environment variables**:
   ```bash
   SENDGRID_API_KEY=your-sendgrid-key
   SENDGRID_FROM_EMAIL=your-email
   SENDGRID_FROM_NAME=TrailVerse
   ```

3. **Restore email service code** from git history

## ✅ Migration Checklist

- [ ] Install nodemailer dependency
- [ ] Remove @sendgrid/mail dependency
- [ ] Update environment variables
- [ ] Generate Gmail App Password
- [ ] Test email functionality
- [ ] Update documentation
- [ ] Monitor email delivery
- [ ] Update deployment configurations

## 🎉 Benefits Achieved

- **💰 Cost Reduction**: From $19.95/month to $0/month
- **🚀 Simplified Setup**: No API key management
- **📈 Better Reliability**: Gmail's infrastructure
- **🔧 Easier Maintenance**: Standard SMTP protocol
- **🌍 Global Reach**: Gmail's worldwide delivery network

---

**Need Help?** Check the troubleshooting section or run the test script for diagnostics.
