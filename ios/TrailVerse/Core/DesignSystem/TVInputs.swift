import SwiftUI

struct TVSearchField: View {
    @Environment(\.colorScheme) private var colorScheme
    @Binding var text: String
    var placeholder: String = "Search parks and places"

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        HStack(spacing: TVSpacing.sm) {
            Image(systemName: TVIcons.search)
                .foregroundStyle(palette.textTertiary)
            TextField(placeholder, text: $text)
                .font(TVTypography.body)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
        }
        .padding(.horizontal, TVSpacing.md)
        .frame(minHeight: TVSpacing.minTouchTarget)
        .background(palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: TVRadius.button, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: TVRadius.button, style: .continuous)
                .stroke(palette.border, lineWidth: 1)
        )
    }
}

struct TVTextField: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    @Binding var text: String
    var isSecure: Bool = false

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        VStack(alignment: .leading, spacing: TVSpacing.xxs) {
            Text(title)
                .font(TVTypography.subheadline)
                .foregroundStyle(palette.textSecondary)
            Group {
                if isSecure {
                    SecureField(title, text: $text)
                } else {
                    TextField(title, text: $text)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            .font(TVTypography.body)
            .padding(.horizontal, TVSpacing.md)
            .frame(minHeight: TVSpacing.minTouchTarget)
            .background(palette.surface)
            .clipShape(RoundedRectangle(cornerRadius: TVRadius.button, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: TVRadius.button, style: .continuous)
                    .stroke(palette.border, lineWidth: 1)
            )
        }
    }
}
