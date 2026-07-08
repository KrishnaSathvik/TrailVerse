import SwiftUI

// MARK: - Button style

struct TVPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(TVTypography.button)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: TVSpacing.minTouchTarget)
            .background(isEnabled ? TVColors.accentGreen : TVColors.accentGreen.opacity(0.4))
            .clipShape(RoundedRectangle(cornerRadius: TVRadius.button, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(TVMotion.quick, value: configuration.isPressed)
    }
}

struct TVSecondaryButtonStyle: ButtonStyle {
    @Environment(\.colorScheme) private var colorScheme

    func makeBody(configuration: Configuration) -> some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        configuration.label
            .font(TVTypography.button)
            .foregroundStyle(palette.textPrimary)
            .frame(maxWidth: .infinity, minHeight: TVSpacing.minTouchTarget)
            .background(palette.surface)
            .overlay(
                RoundedRectangle(cornerRadius: TVRadius.button, style: .continuous)
                    .stroke(palette.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: TVRadius.button, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

struct TVOutlineButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(TVTypography.button)
            .foregroundStyle(TVColors.accentGreen)
            .frame(maxWidth: .infinity, minHeight: TVSpacing.minTouchTarget)
            .overlay(
                RoundedRectangle(cornerRadius: TVRadius.button, style: .continuous)
                    .stroke(TVColors.accentGreen, lineWidth: 1.5)
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

struct TVGhostButtonStyle: ButtonStyle {
    @Environment(\.colorScheme) private var colorScheme

    func makeBody(configuration: Configuration) -> some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        configuration.label
            .font(TVTypography.button)
            .foregroundStyle(TVColors.accentGreen)
            .frame(minHeight: TVSpacing.minTouchTarget)
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

struct TVDangerButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(TVTypography.button)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: TVSpacing.minTouchTarget)
            .background(TVColors.errorRed)
            .clipShape(RoundedRectangle(cornerRadius: TVRadius.button, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

// MARK: - Convenience buttons

struct TVPrimaryButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(title, action: action)
            .buttonStyle(TVPrimaryButtonStyle())
    }
}

struct TVSecondaryButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(title, action: action)
            .buttonStyle(TVSecondaryButtonStyle())
    }
}
