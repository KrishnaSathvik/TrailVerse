import SwiftUI

// MARK: - Park card

struct TVParkCard: View {
    @Environment(\.colorScheme) private var colorScheme

    let title: String
    let subtitle: String
    let stateLabel: String
    let imageURL: URL?
    var rating: String?
    let onTap: () -> Void

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 0) {
                parkImage
                    .frame(height: 140)
                    .clipped()

                VStack(alignment: .leading, spacing: TVSpacing.xs) {
                    Text(title)
                        .font(TVTypography.headline)
                        .foregroundStyle(palette.textPrimary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    if !subtitle.isEmpty {
                        Text(subtitle)
                            .font(TVTypography.subheadline)
                            .foregroundStyle(palette.textSecondary)
                            .lineLimit(2)
                    }

                    HStack(spacing: TVSpacing.sm) {
                        Label(stateLabel, systemImage: TVIcons.location)
                            .font(TVTypography.caption)
                            .foregroundStyle(palette.textTertiary)
                        if let rating {
                            Text(rating)
                                .font(TVTypography.caption)
                                .foregroundStyle(palette.textTertiary)
                        }
                    }
                }
                .padding(TVSpacing.md)
            }
            .background(palette.surface)
            .clipShape(RoundedRectangle(cornerRadius: TVRadius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: TVRadius.card, style: .continuous)
                    .stroke(palette.border, lineWidth: 1)
            )
            .tvCardShadow()
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title), \(stateLabel)")
    }

    @ViewBuilder
    private var parkImage: some View {
        if let imageURL {
            AsyncImage(url: imageURL) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    parkPlaceholder
                }
            }
        } else {
            parkPlaceholder
        }
    }

    private var parkPlaceholder: some View {
        LinearGradient(
            colors: [TVColors.forestDark, TVColors.accentGreenDark],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

// MARK: - Trip card

struct TVTripCard: View {
    @Environment(\.colorScheme) private var colorScheme

    let title: String
    let dateRange: String
    let status: String
    let onTap: () -> Void

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        Button(action: onTap) {
            HStack {
                VStack(alignment: .leading, spacing: TVSpacing.xxs) {
                    Text(title)
                        .font(TVTypography.headline)
                        .foregroundStyle(palette.textPrimary)
                    Text(dateRange)
                        .font(TVTypography.subheadline)
                        .foregroundStyle(palette.textSecondary)
                    Text(status)
                        .font(TVTypography.caption)
                        .foregroundStyle(TVColors.accentGreen)
                }
                Spacer()
                Image(systemName: TVIcons.chevronRight)
                    .foregroundStyle(palette.textTertiary)
            }
            .padding(TVSpacing.md)
            .background(palette.surface)
            .clipShape(RoundedRectangle(cornerRadius: TVRadius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: TVRadius.card, style: .continuous)
                    .stroke(palette.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Trailie message bubble

struct TVTrailieMessageBubble: View {
    @Environment(\.colorScheme) private var colorScheme

    enum Role {
        case user
        case assistant
    }

    let role: Role
    let text: String

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        HStack {
            if role == .user { Spacer(minLength: 48) }
            Text(text)
                .font(TVTypography.body)
                .foregroundStyle(role == .user ? Color.white : palette.textPrimary)
                .padding(.horizontal, TVSpacing.md)
                .padding(.vertical, TVSpacing.sm)
                .background(bubbleBackground(palette: palette))
                .clipShape(RoundedRectangle(cornerRadius: TVRadius.card, style: .continuous))
            if role == .assistant { Spacer(minLength: 48) }
        }
    }

    private func bubbleBackground(palette: TVColorPalette) -> Color {
        switch role {
        case .user: TVColors.accentGreen
        case .assistant: palette.surface
        }
    }
}
