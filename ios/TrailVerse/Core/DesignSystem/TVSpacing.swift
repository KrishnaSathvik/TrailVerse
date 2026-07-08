import CoreGraphics

/// 8pt grid spacing — aligned with web Tailwind scale.
enum TVSpacing {
    static let xxs: CGFloat = 4
    static let xs: CGFloat = 8
    static let sm: CGFloat = 12
    static let md: CGFloat = 16
    static let lg: CGFloat = 24
    static let xl: CGFloat = 32
    static let xxl: CGFloat = 40

    /// Horizontal screen padding
    static let screenHorizontal: CGFloat = 16

    /// Minimum touch target (Apple HIG)
    static let minTouchTarget: CGFloat = 44

    /// Tab bar content inset
    static let tabBarBottom: CGFloat = 8
}
