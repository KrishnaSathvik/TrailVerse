import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
  Hr,
  Img,
} from '@react-email/components';
import * as React from 'react';

const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const AdminNotificationEmail = ({
  userName = 'John Doe',
  userEmail = 'john@example.com',
  userId = '507f1f77bcf86cd799439011',
  registrationDate = 'Monday, January 15, 2025 at 2:30 PM PST',
  verificationStatus = '⏳ Pending Verification',
  statusBgColor = '#fef3c7',
  statusTextColor = '#92400e',
  totalUsers = '1,234',
  usersThisMonth = '45',
  adminDashboardUrl = 'https://nationalparksexplorerusa.com/admin/dashboard',
  userProfileUrl = 'https://nationalparksexplorerusa.com/admin/users/507f1f77bcf86cd799439011',
}) => {
  const previewText = `New user registration: ${userName}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: '#0B1D0F', fontFamily, WebkitFontSmoothing: 'antialiased', color: '#111827' }}>
        <Section style={{ backgroundColor: '#0B1D0F', padding: '40px 20px' }}>
          <Container style={{ maxWidth: '600px', backgroundColor: '#ffffff', margin: '0 auto' }}>
            <Section style={{ padding: '40px 50px' }}>

              {/* Logo */}
              <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                <Img
                  src="https://www.nationalparksexplorerusa.com/android-chrome-192x192.png"
                  width="48"
                  height="48"
                  alt="TrailVerse"
                  style={{ display: 'block', margin: '0 auto 12px' }}
                />
                <span style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.05em', color: '#111827' }}>
                  TrailVerse
                </span>
              </div>

              {/* Body */}
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Hey Admin 👋
              </Text>

              <Text style={{ margin: '0 0 24px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                A new user just registered on <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px' }}>TrailVerse</span>! Here are their details.
              </Text>

              {/* User Details */}
              <h3 style={{ margin: '32px 0 16px', fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                👤 User Information
              </h3>

              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px', fontSize: '15px' }}>
                <tr>
                  <td style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6', color: '#6b7280', fontWeight: 600, width: '120px' }}>Name</td>
                  <td style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6', color: '#111827', fontWeight: 700 }}>{userName}</td>
                </tr>
                <tr>
                  <td style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6', color: '#6b7280', fontWeight: 600 }}>Email</td>
                  <td style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6', color: '#06B569', fontWeight: 700 }}>
                    <Link href={`mailto:${userEmail}`} style={{ color: '#06B569', textDecoration: 'none' }}>{userEmail}</Link>
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6', color: '#6b7280', fontWeight: 600 }}>Registered</td>
                  <td style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6', color: '#111827' }}>{registrationDate}</td>
                </tr>
                <tr>
                  <td style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6', color: '#6b7280', fontWeight: 600 }}>User ID</td>
                  <td style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6', color: '#6b7280', fontFamily: 'monospace', fontSize: '13px' }}>{userId}</td>
                </tr>
                <tr>
                  <td style={{ padding: '10px 0', color: '#6b7280', fontWeight: 600 }}>Status</td>
                  <td style={{ padding: '10px 0' }}>
                    <span style={{ backgroundColor: statusBgColor, color: statusTextColor, padding: '4px 12px', borderRadius: '12px', fontSize: '13px', fontWeight: 600 }}>
                      {verificationStatus}
                    </span>
                  </td>
                </tr>
              </table>

              {/* Quick Stats */}
              <h3 style={{ margin: '32px 0 16px', fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                📊 Quick Stats
              </h3>
              <Text style={{ margin: '0 0 8px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                👥 <strong>Total Users:</strong> {totalUsers}
              </Text>
              <Text style={{ margin: '0 0 24px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                📅 <strong>This Month:</strong> {usersThisMonth}
              </Text>

              {/* What's Next */}
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                ℹ️ The user has been sent a verification email. Once verified, they'll receive a welcome email with <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px' }}>TrailVerse</span> features.
              </Text>

              {/* CTA */}
              <div style={{ textAlign: 'center', margin: '40px 0 16px' }}>
                <Button
                  href={adminDashboardUrl}
                  style={{ display: 'inline-block', padding: '12px 24px', backgroundColor: '#06B569', color: '#ffffff', textDecoration: 'none', fontWeight: 700, fontSize: '15px', borderRadius: '8px' }}
                >
                  View Dashboard
                </Button>
              </div>
              <div style={{ textAlign: 'center', margin: '0 0 32px' }}>
                <Link href={userProfileUrl} style={{ color: '#06B569', textDecoration: 'underline', fontSize: '13px' }}>
                  View user profile →
                </Link>
              </div>

              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Keep building,{'\n'}
                <strong>TrailVerse Notification System</strong>
              </Text>

              {/* Divider */}
              <Hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '40px 0 32px' }} />

              {/* Footer */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: '16px' }}>
                  <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.05em', color: '#111827' }}>
                    TrailVerse
                  </span>
                </div>
                <Text style={{ margin: '0 0 8px', fontSize: '11px', color: '#6b7280' }}>
                  This is an automated notification for administrators.
                </Text>
                <Text style={{ margin: 0, fontSize: '11px' }}>
                  <Link href="https://nationalparksexplorerusa.com" style={{ color: '#06B569', textDecoration: 'underline' }}>
                    nationalparksexplorerusa.com
                  </Link>
                </Text>
              </div>

            </Section>
          </Container>
        </Section>
      </Body>
    </Html>
  );
};

export default AdminNotificationEmail;
