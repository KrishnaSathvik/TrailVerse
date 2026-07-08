import XCTest
@testable import TrailVerse

final class AppRouterTests: XCTestCase {
    func testParkUniversalLink() {
        let url = URL(string: "https://www.nationalparksexplorerusa.com/parks/yellowstone-national-park")!
        let destination = AppRouter.destination(from: url)
        if case .park(let slug, _) = destination {
            XCTAssertEqual(slug, "yellowstone-national-park")
        } else {
            XCTFail("Expected park destination")
        }
    }

    func testPlanAIUniversalLink() {
        let url = URL(string: "https://www.nationalparksexplorerusa.com/plan-ai?park=yell&name=Yellowstone")!
        let destination = AppRouter.destination(from: url)
        if case .trailie(_, let park, let name) = destination {
            XCTAssertEqual(park, "yell")
            XCTAssertEqual(name, "Yellowstone")
        } else {
            XCTFail("Expected trailie destination")
        }
    }
}
