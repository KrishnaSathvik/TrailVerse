import SwiftUI

struct AuthenticationView: View {
    @Environment(AuthSession.self) private var authSession
    @Environment(\.dismiss) private var dismiss

    @State private var isSignup = false
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var email = ""
    @State private var password = ""
    @State private var isSubmitting = false
    @State private var localError: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TVSpacing.lg) {
                if let prompt = authSession.authPromptMessage {
                    Text(prompt)
                        .font(TVTypography.subheadline)
                        .foregroundStyle(.secondary)
                }

                Text(isSignup ? "Create account" : "Sign in")
                    .font(TVTypography.largeTitle)

                Text("Use the same account as nationalparksexplorerusa.com")
                    .font(TVTypography.subheadline)
                    .foregroundStyle(.secondary)

                if isSignup {
                    TVTextField(title: "First name", text: $firstName)
                    TVTextField(title: "Last name", text: $lastName)
                }

                TVTextField(title: "Email", text: $email)
                TVTextField(title: "Password", text: $password, isSecure: true)

                if let localError {
                    Text(localError)
                        .font(TVTypography.caption)
                        .foregroundStyle(TVColors.errorRed)
                }

                TVPrimaryButton(title: isSubmitting ? "Please wait…" : (isSignup ? "Create Account" : "Sign In")) {
                    Task { await submit() }
                }
                .disabled(isSubmitting)

                Button(isSignup ? "Already have an account? Sign in" : "Create a free account") {
                    isSignup.toggle()
                    localError = nil
                }
                .buttonStyle(TVGhostButtonStyle())

                TVSecondaryButton(title: "Continue as Guest") {
                    authSession.continueAsGuest()
                    dismiss()
                }
            }
            .padding(TVSpacing.screenHorizontal)
            .padding(.vertical, TVSpacing.lg)
        }
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Close") { dismiss() }
            }
        }
    }

    private func submit() async {
        localError = nil
        isSubmitting = true
        defer { isSubmitting = false }

        do {
            if isSignup {
                guard !firstName.isEmpty, !lastName.isEmpty else {
                    localError = "Please enter your name."
                    return
                }
                try await authSession.signup(
                    firstName: firstName,
                    lastName: lastName,
                    email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                    password: password
                )
            } else {
                try await authSession.login(
                    email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                    password: password
                )
            }
            dismiss()
        } catch {
            localError = error.localizedDescription
        }
    }
}
