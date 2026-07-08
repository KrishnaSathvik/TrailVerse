import SwiftUI

struct AuthenticationView: View {
    @State private var email = ""
    @State private var password = ""
    @State private var isSignup = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TVSpacing.lg) {
                Text(isSignup ? "Create account" : "Sign in")
                    .font(TVTypography.largeTitle)

                Text("Use the same account as nationalparksexplorerusa.com")
                    .font(TVTypography.subheadline)
                    .foregroundStyle(.secondary)

                TVTextField(title: "Email", text: $email)
                TVTextField(title: "Password", text: $password, isSecure: true)

                TVPrimaryButton(title: isSignup ? "Create Account" : "Sign In") {}

                Button(isSignup ? "Already have an account? Sign in" : "Create a free account") {
                    isSignup.toggle()
                }
                .buttonStyle(TVGhostButtonStyle())

                TVSecondaryButton(title: "Continue as Guest") {}
            }
            .padding(TVSpacing.screenHorizontal)
            .padding(.vertical, TVSpacing.lg)
        }
        .navigationTitle("Account")
    }
}
