import SwiftUI

struct CompareView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.colorScheme) private var colorScheme
    @State private var viewModel = CompareViewModel()
    @State private var showPicker = false

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        ScrollView {
            VStack(alignment: .leading, spacing: TVSpacing.lg) {
                selectionSection

                if viewModel.selectedParks.count >= 2 {
                    if viewModel.isLoadingComparison {
                        TVLoadingState(message: "Loading comparison…")
                            .frame(minHeight: 200)
                    } else if let error = viewModel.errorMessage {
                        TVErrorState(message: error) {
                            Task { await viewModel.loadComparison() }
                        }
                        .frame(minHeight: 200)
                    } else if let comparison = viewModel.comparison {
                        comparisonContent(comparison, palette: palette)
                    }
                } else {
                    TVEmptyState(
                        title: "Compare parks",
                        message: "Select at least 2 parks to see weather, crowds, and best months side by side.",
                        actionTitle: viewModel.selectedParks.isEmpty ? "Add a park" : "Add another park",
                        action: { showPicker = true }
                    )
                    .frame(minHeight: 220)
                }
            }
            .padding(.horizontal, TVSpacing.screenHorizontal)
            .padding(.vertical, TVSpacing.md)
        }
        .background(palette.backgroundPrimary)
        .navigationTitle("Compare")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Add") { showPicker = true }
                    .disabled(viewModel.selectedParks.count >= 4)
            }
        }
        .sheet(isPresented: $showPicker) {
            CompareParkPicker(
                parks: viewModel.availableParks,
                selectedCodes: Set(viewModel.selectedParks.map(\.parkCode)),
                onSelect: { park in
                    viewModel.addPark(park)
                    showPicker = false
                }
            )
        }
        .task {
            await viewModel.bootstrap(prefillCodes: appState.comparePrefillCodes)
            appState.comparePrefillCodes = []
        }
        .onChange(of: viewModel.selectedParkCodes) { _, _ in
            Task { await viewModel.loadComparison() }
        }
    }

    private var selectionSection: some View {
        VStack(alignment: .leading, spacing: TVSpacing.sm) {
            Text("Selected parks")
                .font(TVTypography.headline)

            if viewModel.selectedParks.isEmpty {
                Text("Add 2–4 national parks to compare.")
                    .font(TVTypography.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                FlowLayout(spacing: TVSpacing.sm) {
                    ForEach(viewModel.selectedParks) { park in
                        CompareParkChip(
                            title: park.fullName,
                            onRemove: { viewModel.removePark(park.parkCode) }
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func comparisonContent(_ comparison: ParkComparisonResult, palette: TVColorPalette) -> some View {
        VStack(alignment: .leading, spacing: TVSpacing.lg) {
            if let activities = comparison.commonActivities?.commonToAll, !activities.isEmpty {
                VStack(alignment: .leading, spacing: TVSpacing.xs) {
                    Text("In common")
                        .font(TVTypography.headline)
                    Text(activities.joined(separator: " · "))
                        .font(TVTypography.subheadline)
                        .foregroundStyle(palette.textSecondary)
                }
                .padding(TVSpacing.md)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(palette.surface)
                .clipShape(RoundedRectangle(cornerRadius: TVRadius.card, style: .continuous))
            }

            Text("Side by side")
                .font(TVTypography.headline)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: TVSpacing.md) {
                    ForEach(comparison.parks) { park in
                        CompareParkColumn(park: park)
                    }
                }
            }

            TVPrimaryButton(title: "Plan with Trailie") {
                if let first = comparison.parks.first {
                    appState.openTrailie(
                        parkCode: first.parkCode,
                        parkName: first.fullName
                    )
                }
            }
        }
    }
}

@Observable
@MainActor
final class CompareViewModel {
    var selectedParks: [ParkListItem] = []
    var availableParks: [ParkListItem] = []
    var comparison: ParkComparisonResult?
    var isLoadingComparison = false
    var errorMessage: String?

    private let parksService = ParksService()
    private let compareService = CompareService()

    var selectedParkCodes: [String] {
        selectedParks.map(\.parkCode)
    }

    func bootstrap(prefillCodes: [String]) async {
        do {
            availableParks = try await parksService.nationalParks()
            if !prefillCodes.isEmpty {
                let codes = Set(prefillCodes.map { $0.lowercased() })
                selectedParks = availableParks.filter { codes.contains($0.parkCode) }
            }
            if selectedParks.count >= 2 {
                await loadComparison()
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func addPark(_ park: ParkListItem) {
        guard selectedParks.count < 4,
              !selectedParks.contains(where: { $0.parkCode == park.parkCode }) else { return }
        selectedParks.append(park)
    }

    func removePark(_ parkCode: String) {
        selectedParks.removeAll { $0.parkCode == parkCode.lowercased() }
        if selectedParks.count < 2 {
            comparison = nil
            errorMessage = nil
        }
    }

    func loadComparison() async {
        guard selectedParks.count >= 2 else {
            comparison = nil
            return
        }

        isLoadingComparison = true
        errorMessage = nil
        do {
            comparison = try await compareService.compare(parkCodes: selectedParkCodes)
        } catch {
            errorMessage = error.localizedDescription
            comparison = nil
        }
        isLoadingComparison = false
    }
}

private struct CompareParkColumn: View {
    @Environment(\.colorScheme) private var colorScheme
    let park: ComparedParkDTO

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        VStack(alignment: .leading, spacing: TVSpacing.md) {
            Text(park.fullName)
                .font(TVTypography.headline)
                .foregroundStyle(palette.textPrimary)
                .lineLimit(3)
                .frame(width: 180, alignment: .leading)

            CompareMetricRow(label: "Weather", value: "\(park.displayTemperature)\n\(park.displayCondition)")
            CompareMetricRow(label: "Crowds", value: park.displayCrowd)
            CompareMetricRow(label: "Best months", value: park.displayBestMonths)
            CompareMetricRow(label: "Rating", value: park.displayRating)
            CompareMetricRow(label: "States", value: park.states)
        }
        .padding(TVSpacing.md)
        .frame(width: 200)
        .background(palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: TVRadius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: TVRadius.card, style: .continuous)
                .stroke(palette.border, lineWidth: 1)
        )
    }
}

private struct CompareMetricRow: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: TVSpacing.xxs) {
            Text(label.uppercased())
                .font(TVTypography.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(TVTypography.subheadline)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct CompareParkChip: View {
    let title: String
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: TVSpacing.xs) {
            Text(title)
                .font(TVTypography.caption)
                .lineLimit(1)
            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.caption)
            }
        }
        .padding(.horizontal, TVSpacing.sm)
        .padding(.vertical, TVSpacing.xs)
        .background(TVColors.accentGreen.opacity(0.12))
        .clipShape(Capsule())
    }
}

private struct CompareParkPicker: View {
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    let parks: [ParkListItem]
    let selectedCodes: Set<String>
    let onSelect: (ParkListItem) -> Void

    private var filtered: [ParkListItem] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else {
            return parks.filter { !selectedCodes.contains($0.parkCode) }
        }
        return parks.filter { park in
            !selectedCodes.contains(park.parkCode) &&
            (park.fullName.lowercased().contains(query)
             || park.states.lowercased().contains(query)
             || park.parkCode.contains(query))
        }
    }

    var body: some View {
        NavigationStack {
            List(filtered) { park in
                Button {
                    onSelect(park)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(park.fullName)
                            .font(TVTypography.body)
                            .foregroundStyle(.primary)
                        Text(park.states)
                            .font(TVTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .searchable(text: $searchText, prompt: "Search parks")
            .navigationTitle("Add park")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

/// Simple horizontal flow for chips.
private struct FlowLayout: Layout {
    var spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, frame) in result.frames.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
                proposal: ProposedViewSize(frame.size)
            )
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, frames: [CGRect]) {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var frames: [CGRect] = []

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            frames.append(CGRect(origin: CGPoint(x: x, y: y), size: size))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }

        return (CGSize(width: maxWidth, height: y + rowHeight), frames)
    }
}
