import SwiftUI

/// TrailVerse typography — SF Pro system fonts; display headings use rounded design where noted.
enum TVTypography {
    static let largeTitle = Font.system(.largeTitle, design: .rounded).weight(.bold)
    static let title = Font.system(.title, design: .rounded).weight(.semibold)
    static let title2 = Font.system(.title2, design: .rounded).weight(.semibold)
    static let title3 = Font.system(.title3, design: .default).weight(.semibold)
    static let headline = Font.system(.headline, design: .default).weight(.semibold)
    static let body = Font.system(.body, design: .default)
    static let callout = Font.system(.callout, design: .default)
    static let subheadline = Font.system(.subheadline, design: .default)
    static let footnote = Font.system(.footnote, design: .default)
    static let caption = Font.system(.caption, design: .default)
    static let caption2 = Font.system(.caption2, design: .default)

    /// Park hero titles
    static let parkTitle = Font.system(.title2, design: .rounded).weight(.bold)

    /// Trailie assistant label
    static let trailieLabel = Font.system(.subheadline, design: .rounded).weight(.semibold)

    /// Button label — minimum readable size
    static let button = Font.system(.body, design: .default).weight(.semibold)
}

struct TVTextStyle: ViewModifier {
    let font: Font
    let color: Color

    func body(content: Content) -> some View {
        content.font(font).foregroundStyle(color)
    }
}

extension View {
    func tvText(_ font: Font, color: Color) -> some View {
        modifier(TVTextStyle(font: font, color: color))
    }
}
