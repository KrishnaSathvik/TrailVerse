# Park weather configuration

Set `OPENWEATHER_API_KEY` and `NPS_API_KEY` on the backend only. The frontend does not require either provider credential.

WeatherWidget and weather prefetch use the canonical frontend `enhancedParkService.getParkWeather(parkCode)` wrapper through `weatherService`, calling `GET /api/parks/:parkCode/weather`. The server resolves the park coordinates, retrieves current conditions and the five-day forecast, and returns allowlisted display fields. The existing server weather cache lasts 30 minutes; the frontend wrapper also caches weather. Existing API rate limits apply.

Invalid park codes return 400, unknown parks return 404, and unavailable upstream weather returns a sanitized 503. The widget shows its loading and unavailable states; it does not present generated sample conditions as current observations.

For local development run the backend with its server environment configured, and point the existing frontend API configuration at that backend. Never add weather or NPS credentials to frontend public variables. Test provider errors with controlled fixtures, not live keys.

A weather credential previously embedded in public JavaScript must be rotated in a separately authorized provider/environment operation after the browser exposure is removed. Rebuilding alone cannot revoke old cached bundles or copied credentials. Do not include credential values in logs, screenshots, reports, or test artifacts.
