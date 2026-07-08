import SwiftUI

/// Motion tokens — respects Reduce Motion via `TVMotion.animated`.
enum TVMotion {
    static let quick: Animation = .easeOut(duration: 0.2)
    static let standard: Animation = .easeInOut(duration: 0.3)
    static let slow: Animation = .easeInOut(duration: 0.5)

    /// Apply animation only when Reduce Motion is off.
    static func animated<V: Equatable>(_ animation: Animation?, value: V) -> Animation? {
        UIAccessibility.isReduceMotionEnabled ? nil : animation
    }
}

extension View {
    func tvAnimation<V: Equatable>(_ animation: Animation?, value: V) -> some View {
        self.animation(TVMotion.animated(animation, value: value), value: value)
    }
}
