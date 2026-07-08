import SwiftUI

// MARK: - Alert severity

enum TVAlertSeverity {
    case danger
    case warning
    case info

    var icon: String {
        switch self {
        case .danger: TVIcons.alertDanger
        case .warning: TVIcons.alertWarning
        case .info: TVIcons.alertInfo
        }
    }

    var color: Color {
        switch self {
        case .danger: TVColors.errorRed
        case .warning: TVColors.warning
        case .info: TVColors.accentBlue
        }
    }

    var label: String {
        switch self {
        case .danger: "Closure or danger"
        case .warning: "Warning"
        case .info: "Information"
        }
    }
}

struct TVAlertCard: View {
    @Environment(\.colorScheme) private var colorScheme

    let severity: TVAlertSeverity
    let title: String
    let message: String
    var updatedAt: String?

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        HStack(alignment: .top, spacing: TVSpacing.sm) {
            Image(systemName: severity.icon)
                .foregroundStyle(severity.color)
                .font(.title3)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: TVSpacing.xxs) {
                Text(title)
                    .font(TVTypography.headline)
                    .foregroundStyle(palette.textPrimary)
                Text(message)
                    .font(TVTypography.subheadline)
                    .foregroundStyle(palette.textSecondary)
                if let updatedAt {
                    Text("Updated \(updatedAt)")
                        .font(TVTypography.caption)
                        .foregroundStyle(palette.textTertiary)
                }
            }
        }
        .padding(TVSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(severity.color.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: TVRadius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: TVRadius.card, style: .continuous)
                .stroke(severity.color.opacity(0.25), lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(severity.label). \(title). \(message)")
    }
}

// MARK: - Weather card

struct TVWeatherCard: View {
    @Environment(\.colorScheme) private var colorScheme

    let condition: String
    let temperature: String
    let summary: String
    var updatedAt: String?
    var isOfflineSnapshot: Bool = false

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        HStack(spacing: TVSpacing.md) {
            Image(systemName: TVIcons.weatherSun)
                .font(.largeTitle)
                .foregroundStyle(TVColors.accentBlue)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: TVSpacing.xxs) {
                Text("\(temperature) · \(condition)")
                    .font(TVTypography.headline)
                    .foregroundStyle(palette.textPrimary)
                Text(summary)
                    .font(TVTypography.subheadline)
                    .foregroundStyle(palette.textSecondary)
                if let updatedAt {
                    let prefix = isOfflineSnapshot ? "Weather snapshot" : "Updated"
                    Text("\(prefix) \(updatedAt)")
                        .font(TVTypography.caption)
                        .foregroundStyle(palette.textTertiary)
                }
            }
            Spacer()
        }
        .padding(TVSpacing.md)
        .background(palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: TVRadius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: TVRadius.card, style: .continuous)
                .stroke(palette.border, lineWidth: 1)
        )
    }
}

// MARK: - Status row

struct TVStatusRow: View {
    @Environment(\.colorScheme) private var colorScheme

    let title: String
    let value: String
    var valueColor: Color?

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        HStack {
            Text(title)
                .font(TVTypography.subheadline)
                .foregroundStyle(palette.textSecondary)
            Spacer()
            Text(value)
                .font(TVTypography.subheadline)
                .fontWeight(.medium)
                .foregroundStyle(valueColor ?? palette.textPrimary)
        }
        .frame(minHeight: TVSpacing.minTouchTarget)
    }
}

// MARK: - Loading / empty / error

struct TVLoadingState: View {
    let message: String

    var body: some View {
        VStack(spacing: TVSpacing.md) {
            ProgressView()
            Text(message)
                .font(TVTypography.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(TVSpacing.lg)
    }
}

struct TVEmptyState: View {
    @Environment(\.colorScheme) private var colorScheme

    let title: String
    let message: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        VStack(spacing: TVSpacing.md) {
            Text(title)
                .font(TVTypography.title3)
                .foregroundStyle(palette.textPrimary)
            Text(message)
                .font(TVTypography.body)
                .foregroundStyle(palette.textSecondary)
                .multilineTextAlignment(.center)
            if let actionTitle, let action {
                TVPrimaryButton(title: actionTitle, action: action)
                    .padding(.top, TVSpacing.sm)
            }
        }
        .padding(TVSpacing.lg)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct TVErrorState: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: TVSpacing.md) {
            Image(systemName: TVIcons.alertDanger)
                .font(.largeTitle)
                .foregroundStyle(TVColors.errorRed)
            Text(message)
                .font(TVTypography.body)
                .multilineTextAlignment(.center)
            TVSecondaryButton(title: "Try Again", action: retry)
        }
        .padding(TVSpacing.lg)
    }
}

struct TVOfflineBanner: View {
    var body: some View {
        HStack(spacing: TVSpacing.sm) {
            Image(systemName: TVIcons.offline)
            Text("You're offline. Cached content may be outdated.")
                .font(TVTypography.caption)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, TVSpacing.md)
        .padding(.vertical, TVSpacing.sm)
        .frame(maxWidth: .infinity)
        .background(TVColors.accentOrange)
    }
}
