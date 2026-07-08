import SwiftUI

/// Semantic TrailVerse colors — mirrors `next-frontend/src/styles/themes.css`.
enum TVColors {
    // MARK: - Brand
    static let accentGreen = Color(hex: 0x059669)
    static let accentGreenDark = Color(hex: 0x047857)
    static let accentBlue = Color(hex: 0x0369A1)
    static let accentOrange = Color(hex: 0xEA580C)
    static let forestDark = Color(hex: 0x064E3B)
    static let errorRed = Color(hex: 0xDC2626)
    static let warning = Color(hex: 0xD97706)

    // MARK: - Light backgrounds
    enum Light {
        static let backgroundPrimary = Color(hex: 0xFEFCF9)
        static let backgroundSecondary = Color(hex: 0xF9F7F4)
        static let backgroundTertiary = Color(hex: 0xF4F1EC)
        static let textPrimary = Color(hex: 0x2D2B28)
        static let textSecondary = Color(hex: 0x2D2B28).opacity(0.85)
        static let textTertiary = Color(hex: 0x2D2B28).opacity(0.65)
        static let surface = Color.white.opacity(0.8)
        static let border = Color.black.opacity(0.08)
        static let skeleton = Color(hex: 0xDDD8D0)
    }

    // MARK: - Dark backgrounds
    enum Dark {
        static let backgroundPrimary = Color(hex: 0x0A0E0F)
        static let backgroundSecondary = Color(hex: 0x131719)
        static let backgroundTertiary = Color(hex: 0x1A1F21)
        static let textPrimary = Color.white
        static let textSecondary = Color.white.opacity(0.85)
        static let textTertiary = Color.white.opacity(0.60)
        static let surface = Color.white.opacity(0.05)
        static let border = Color.white.opacity(0.10)
        static let skeleton = Color.white.opacity(0.12)
    }
}

// MARK: - Environment-aware semantic colors

struct TVColorPalette {
    let backgroundPrimary: Color
    let backgroundSecondary: Color
    let textPrimary: Color
    let textSecondary: Color
    let textTertiary: Color
    let surface: Color
    let border: Color
    let skeleton: Color

    static func palette(for scheme: ColorScheme) -> TVColorPalette {
        switch scheme {
        case .dark:
            return TVColorPalette(
                backgroundPrimary: TVColors.Dark.backgroundPrimary,
                backgroundSecondary: TVColors.Dark.backgroundSecondary,
                textPrimary: TVColors.Dark.textPrimary,
                textSecondary: TVColors.Dark.textSecondary,
                textTertiary: TVColors.Dark.textTertiary,
                surface: TVColors.Dark.surface,
                border: TVColors.Dark.border,
                skeleton: TVColors.Dark.skeleton
            )
        default:
            return TVColorPalette(
                backgroundPrimary: TVColors.Light.backgroundPrimary,
                backgroundSecondary: TVColors.Light.backgroundSecondary,
                textPrimary: TVColors.Light.textPrimary,
                textSecondary: TVColors.Light.textSecondary,
                textTertiary: TVColors.Light.textTertiary,
                surface: TVColors.Light.surface,
                border: TVColors.Light.border,
                skeleton: TVColors.Light.skeleton
            )
        }
    }
}

private extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}
