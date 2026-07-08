import SwiftUI

enum TVShadows {
    static func card(for scheme: ColorScheme) -> (color: Color, radius: CGFloat, y: CGFloat) {
        switch scheme {
        case .dark:
            return (Color.black.opacity(0.5), 8, 4)
        default:
            return (Color.black.opacity(0.06), 6, 2)
        }
    }

    static func elevated(for scheme: ColorScheme) -> (color: Color, radius: CGFloat, y: CGFloat) {
        switch scheme {
        case .dark:
            return (Color.black.opacity(0.5), 12, 6)
        default:
            return (Color.black.opacity(0.08), 10, 4)
        }
    }
}

struct TVCardShadow: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        let shadow = TVShadows.card(for: colorScheme)
        content.shadow(color: shadow.color, radius: shadow.radius, x: 0, y: shadow.y)
    }
}

extension View {
    func tvCardShadow() -> some View {
        modifier(TVCardShadow())
    }
}
