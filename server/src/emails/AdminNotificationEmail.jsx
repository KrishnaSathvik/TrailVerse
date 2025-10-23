import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Tailwind,
} from '@react-email/components';
import * as React from 'react';

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
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Head />
        <Body className="bg-gray-50 font-sans">
          <Container className="bg-white mx-auto my-0 max-w-[600px]">
            {/* Header */}
            <Section className="bg-green-600 py-12 px-8 text-center">
              <Img
                src="https://www.nationalparksexplorerusa.com/android-chrome-192x192.png"
                width="64"
                height="64"
                alt="TrailVerse"
                className="mx-auto mb-6 rounded-xl"
              />
              <Heading className="text-white text-3xl font-bold m-0 mb-3">
                New User Registration!
              </Heading>
              <Text className="text-green-100 text-lg m-0">
                TrailVerse is growing
              </Text>
            </Section>

            {/* Main Content */}
            <Section className="px-8 py-10">
              <div className="text-center mb-8">
                <Text className="text-gray-900 text-2xl font-bold m-0 mb-4">
                  Hey Admin!
                </Text>
                <Text className="text-gray-600 text-lg leading-relaxed m-0 max-w-2xl mx-auto">
                  A new user just registered on TrailVerse! Here are their details and some quick stats for you.
                </Text>
              </div>

              {/* User Details Card */}
              <Section className="border border-gray-200 rounded-xl overflow-hidden mb-10 shadow-sm">
                <div className="bg-green-50 px-8 py-6 border-b border-gray-200 text-center">
                  <Text className="text-gray-900 text-xl font-bold m-0">
                    User Information
                  </Text>
                </div>
                
                <div className="p-8">
                  <div className="space-y-6">
                    {/* Name */}
                    <div className="text-center py-4 border-b border-gray-100">
                      <Text className="text-gray-500 text-sm font-semibold uppercase tracking-wide m-0 mb-2">
                        Name
                      </Text>
                      <Text className="text-gray-900 text-xl font-bold m-0">
                        {userName}
                      </Text>
                    </div>

                    {/* Email */}
                    <div className="text-center py-4 border-b border-gray-100">
                      <Text className="text-gray-500 text-sm font-semibold uppercase tracking-wide m-0 mb-2">
                        Email
                      </Text>
                      <Link 
                        href={`mailto:${userEmail}`}
                        className="text-green-600 text-xl font-bold no-underline hover:underline"
                      >
                        {userEmail}
                      </Link>
                    </div>

                    {/* Registration Date */}
                    <div className="text-center py-4 border-b border-gray-100">
                      <Text className="text-gray-500 text-sm font-semibold uppercase tracking-wide m-0 mb-2">
                        Registered
                      </Text>
                      <Text className="text-gray-900 text-base m-0">
                        {registrationDate}
                      </Text>
                    </div>

                    {/* User ID */}
                    <div className="text-center py-4 border-b border-gray-100">
                      <Text className="text-gray-500 text-sm font-semibold uppercase tracking-wide m-0 mb-2">
                        User ID
                      </Text>
                      <Text className="text-gray-600 text-sm font-mono m-0">
                        {userId}
                      </Text>
                    </div>

                    {/* Email Status */}
                    <div className="text-center py-4">
                      <Text className="text-gray-500 text-sm font-semibold uppercase tracking-wide m-0 mb-3">
                        Status
                      </Text>
                      <span 
                        className="inline-block px-4 py-2 rounded-full text-sm font-semibold"
                        style={{ 
                          backgroundColor: statusBgColor, 
                          color: statusTextColor 
                        }}
                      >
                        {verificationStatus}
                      </span>
                    </div>
                  </div>
                </div>
              </Section>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-6 mb-10">
                <Section className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
                  <Text className="text-4xl m-0 mb-4">👥</Text>
                  <Text className="text-green-600 text-sm font-semibold uppercase tracking-wide m-0 mb-2">
                    Total Users
                  </Text>
                  <Text className="text-green-700 text-3xl font-bold m-0">
                    {totalUsers}
                  </Text>
                </Section>

                <Section className="bg-blue-50 border border-blue-200 rounded-xl p-8 text-center">
                  <Text className="text-4xl m-0 mb-4">📅</Text>
                  <Text className="text-blue-600 text-sm font-semibold uppercase tracking-wide m-0 mb-2">
                    This Month
                  </Text>
                  <Text className="text-blue-700 text-3xl font-bold m-0">
                    {usersThisMonth}
                  </Text>
                </Section>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-6 mb-10">
                <Button
                  className="bg-green-600 text-white rounded-xl px-8 py-4 text-lg font-bold no-underline inline-block shadow-lg"
                  href={adminDashboardUrl}
                >
                  📊 View Dashboard
                </Button>
                <Button
                  className="bg-blue-600 text-white rounded-xl px-8 py-4 text-lg font-bold no-underline inline-block shadow-lg"
                  href={userProfileUrl}
                >
                  👤 View User
                </Button>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border-l-4 border-blue-400 rounded-xl p-6 mb-10 text-center">
                <Text className="text-blue-600 text-2xl mb-3">ℹ️</Text>
                <Text className="text-blue-900 text-lg font-bold m-0 mb-2">
                  What's Next?
                </Text>
                <Text className="text-blue-800 text-base m-0">
                  The user has been sent a verification email. Once verified, they'll receive a welcome email with TrailVerse features.
                </Text>
              </div>

              {/* Growth Insights */}
              <div className="bg-gray-50 rounded-xl p-8 mb-10 border border-gray-200 text-center">
                <Text className="text-gray-800 text-xl font-bold m-0 mb-6">
                  Growth Insights
                </Text>
                <div className="grid grid-cols-3 gap-6">
                  <div>
                    <Text className="text-3xl m-0 mb-3">📈</Text>
                    <Text className="text-gray-600 text-base font-bold m-0">Growth Rate</Text>
                  </div>
                  <div>
                    <Text className="text-3xl m-0 mb-3">🎯</Text>
                    <Text className="text-gray-600 text-base font-bold m-0">Engagement</Text>
                  </div>
                  <div>
                    <Text className="text-3xl m-0 mb-3">🚀</Text>
                    <Text className="text-gray-600 text-base font-bold m-0">Momentum</Text>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <Text className="text-gray-600 text-base m-0">
                  Keep building,<br />
                  <strong className="text-gray-900 text-lg">TrailVerse Notification System</strong>
                </Text>
              </div>
            </Section>

            {/* Footer */}
            <Section className="bg-gray-100 px-8 py-8 border-t border-gray-200">
              <div className="text-center">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Img
                    src="https://www.nationalparksexplorerusa.com/android-chrome-192x192.png"
                    width="32"
                    height="32"
                    alt="TrailVerse"
                    className="rounded-lg"
                  />
                  <Text className="text-gray-800 text-lg font-bold m-0">
                    TrailVerse Admin
                  </Text>
                </div>
                <Text className="text-gray-500 text-sm m-0 mb-2">
                  This is an automated notification for administrators
                </Text>
                <Text className="text-gray-500 text-sm m-0 mb-2">
                  © 2025 TrailVerse. All rights reserved.
                </Text>
                <Text className="text-gray-500 text-sm m-0">
                  <Link href="https://nationalparksexplorerusa.com" className="text-green-600 underline">
                    www.nationalparksexplorerusa.com
                  </Link>
                </Text>
              </div>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default AdminNotificationEmail;
