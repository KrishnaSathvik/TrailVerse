# 📧 Admin Notifications Setup

This guide explains how to set up email notifications for administrators when new users register on TrailVerse.

## 🎯 **What You'll Get**

Every time a new user creates an account, you'll receive an email notification containing:
- ✅ User's name and email address
- ✅ Registration date and time
- ✅ Email verification status
- ✅ Direct link to admin dashboard

## ⚙️ **Setup Instructions**

### 1. **Configure Admin Email**

Add the following to your `server/.env` file:

```bash
# Admin email for notifications (can be same as EMAIL_USER)
ADMIN_EMAIL=trailverseteam@gmail.com
```

### 2. **Email Service Configuration**

Ensure your email service is properly configured:

```bash
# Gmail SMTP Configuration
EMAIL_USER=trailverseteam@gmail.com
EMAIL_PASS=your-gmail-app-password
EMAIL_FROM_NAME=TrailVerse
```

### 3. **Test the Setup**

1. **Create a test user account** through your application
2. **Check your admin email** for the notification
3. **Verify the notification contains**:
   - User details
   - Registration timestamp
   - Verification status
   - Admin dashboard link

## 🔧 **How It Works**

### **Automatic Trigger**
- Admin notifications are sent **automatically** when users register
- The notification is sent **asynchronously** (won't block user registration)
- If email fails, user registration still succeeds

### **Email Content**
The notification email includes:
- **Professional TrailVerse branding**
- **User registration details table**
- **Visual verification status** (✅ verified / ❌ not verified)
- **Direct admin dashboard link**
- **Responsive design** for mobile/desktop

### **Error Handling**
- If `ADMIN_EMAIL` is not configured, notifications are skipped
- Email failures are logged but don't affect user registration
- Fallback to `EMAIL_USER` if `ADMIN_EMAIL` is not set

## 📋 **Configuration Options**

### **Environment Variables**

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ADMIN_EMAIL` | Admin notification recipient | `EMAIL_USER` | No |
| `EMAIL_USER` | Gmail account for sending | - | Yes |
| `EMAIL_PASS` | Gmail app password | - | Yes |
| `EMAIL_FROM_NAME` | Sender display name | `TrailVerse` | No |
| `CLIENT_URL` | Frontend URL for dashboard link | - | Yes |

### **Multiple Admin Recipients**

To send notifications to multiple admins, you can:
1. Use a distribution list email
2. Set up email forwarding rules
3. Use a shared inbox

## 🎨 **Email Template Features**

- **Professional Design**: TrailVerse branding and colors
- **Responsive Layout**: Works on desktop and mobile
- **Clear Information**: Easy-to-read user details table
- **Action Button**: Direct link to admin dashboard
- **Security Notice**: Clear indication it's an automated notification

## 🔍 **Troubleshooting**

### **Not Receiving Notifications**

1. **Check environment variables**:
   ```bash
   echo $ADMIN_EMAIL
   echo $EMAIL_USER
   ```

2. **Verify email service**:
   ```bash
   node server/test-email.js
   ```

3. **Check server logs** for email errors

4. **Verify Gmail app password** is correct

### **Email Format Issues**

- Ensure `CLIENT_URL` is set correctly
- Check that `EMAIL_FROM_NAME` is configured
- Verify admin dashboard route exists

## 🚀 **Next Steps**

1. ✅ **Configure** `ADMIN_EMAIL` in your `.env` file
2. ✅ **Test** by creating a new user account
3. ✅ **Verify** notification email format and content
4. ✅ **Set up** email filters/rules if needed

## 📞 **Support**

If you need help setting up admin notifications:
- Check the email service logs
- Verify Gmail app password configuration
- Test with the email testing script
- Review environment variable configuration

---

**Note**: Admin notifications are designed to be non-intrusive and won't affect user experience if email delivery fails.
