import InfoPageHeader from '@/components/info/InfoPageHeader';
import LegalSections from '@/components/common/LegalSections';

const policySections = [
  {
    "id": "introduction",
    "title": "About this policy",
    "paragraphs": [
      "This policy explains how TrailVerse handles information when you browse parks, create an account, use Trailie, submit content, subscribe to emails, or use the TrailVerse ChatGPT app or Claude connector. TrailVerse is independent of the National Park Service.",
      "Questions or requests about your information can be sent to trailverseteam@gmail.com."
    ]
  },
  {
    "id": "collection",
    "title": "Information you provide",
    "paragraphs": [
      "Account registration requires your first name, last name, email address, and password. Passwords are stored as bcrypt hashes, not readable passwords. Your bio, avatar, phone number, location, and website are optional profile details.",
      "We store account-linked park favorites, saved blog posts, visited-park dates and notes, reviews and uploaded photos, comments, reactions, and saved trip conversations. Newsletter signups include an email address and subscription or confirmation information.",
      "Where Next stores a destination choice, optional travel window, and a browser session identifier. A destination can be free text rather than a park in our catalog. Event bookmarks are stored in your browser rather than synced to your account.",
      "Guest story submissions can include a name, rating, and review text. Approved stories are displayed publicly. Guest submissions are not necessarily linked to an account."
    ]
  },
  {
    "id": "ai",
    "title": "Trailie, voice, and connected apps",
    "paragraphs": [
      "To answer a request, TrailVerse sends relevant messages, trip preferences, conversation history, and supporting context to AI services. The current website planner uses OpenAI, and voice uses OpenAI Realtime. Anthropic may process requests through other configured AI features. Other configured AI and research services may process requests or supporting queries. Do not enter information that you do not want those services to process; text and audio are not guaranteed to be anonymized.",
      "Voice requires microphone access. Your audio is sent to OpenAI for realtime processing. Park context and, when you grant location permission, location context may also be used to answer nearby-place questions.",
      "ChatGPT and Claude send the parameters of the TrailVerse tools they call, including destination names, dates, preferences, and planning requests. Planning requests and relevant follow-up context reach our planner and AI providers. No TrailVerse account is needed, but this does not make the request anonymous in every sense.",
      "Connected-app planning maintains temporary follow-up context and backend planning-session records. Temporary connector context expires separately from backend records and operational logs. The host app also handles your conversation under its own policies."
    ]
  },
  {
    "id": "technical",
    "title": "Technical information and analytics",
    "paragraphs": [
      "Our application can record IP addresses, user agents, page URLs, referral information, browser and session identifiers, actions, request timing, and error or diagnostic details. Some events are associated with your account when signed in.",
      "We use application analytics, Google Analytics when configured, and Vercel analytics and performance services. Some analytics use browser identifiers or account context and can run when you browse. Browser privacy controls and blocking tools may affect collection.",
      "AI diagnostics can include request or response content and related metadata. Information you include in a message can therefore appear in operational records as well as your conversation."
    ]
  },
  {
    "id": "usage",
    "title": "How information is used",
    "paragraphs": [
      "We use information to operate accounts, provide trip planning and relevant results, save your activity, display community content, maintain sessions and usage limits, detect failures or abuse, and improve reliability.",
      "Email information supports verification, password resets, account notices, and subscriptions. Marketing messages include unsubscribe options. Application and image caches support performance; they do not guarantee offline access to account data."
    ]
  },
  {
    "id": "sharing",
    "title": "Who receives information",
    "paragraphs": [
      "Our service providers process information needed for hosting, databases, email delivery, analytics, AI, search, maps, and weather. Depending on the feature, these include Anthropic, OpenAI, Google, MapTiler, OpenWeather, Resend, and Vercel, along with configured hosting, database, and web-search providers.",
      "Park information is obtained from the National Park Service and other relevant sources. A park name, coordinates, or research query may be sent to a provider when that feature is used. Provider availability varies by configuration.",
      "Reviews, comments, and approved testimonials are public. If you create a public trip link, anyone with that link can view the shared trip and conversation. Removing a link or account cannot recall copies that other people have already saved.",
      "TrailVerse does not sell personal information. Information may also be disclosed when required by law or to protect rights and safety. Service providers and connected apps have their own privacy policies."
    ]
  },
  {
    "id": "security",
    "title": "Security",
    "paragraphs": [
      "Implemented controls include password hashing, signed authentication tokens, authenticated access checks, and validation for account deletion. Authentication information is held in browser storage and a cookie.",
      "Production services use HTTPS connections. Security controls differ across stored records, logs, and browser data; we do not guarantee complete security. Avoid sharing sensitive information in public content or planning requests."
    ]
  },
  {
    "id": "cookies",
    "title": "Cookies, browser storage, and offline data",
    "paragraphs": [
      "TrailVerse uses cookies, local storage, session storage, IndexedDB, and browser caches. These support sign-in, preferences, guest chat state, event bookmarks, destination picks, analytics identifiers, and cached assets or park data.",
      "Logging out clears sign-in information and some chat state; it does not clear every cookie, cache, bookmark, or third-party record. Use your browser’s site-data controls to remove local data. Clearing data can remove unsynced bookmarks and guest state.",
      "Installing TrailVerse does not download a complete offline guide. Live information, chat, account history, and many page loads require a connection. A downloaded itinerary PDF can be kept separately for offline use."
    ]
  },
  {
    "id": "retention",
    "title": "Retention and deletion",
    "paragraphs": [
      "Account-linked information is retained to provide the service until you remove it or delete your account, subject to operational and legal needs. Guest chat records are configured to expire after 48 hours of inactivity. Database expiry cleanup is asynchronous.",
      "Raw application analytics are configured for a seven-day expiry window. This is not a single retention period for every record: AI request logs, aggregate analytics, deletion-audit records, infrastructure logs, backups, and provider records can have different lifecycles. Contact us for information about a particular record or service.",
      "Account deletion removes linked trips, favorites, visits, reviews, comments, subscriptions, and controlled uploaded files. References such as likes are removed or anonymized. A limited deletion-audit record with hashed identifiers and operation outcomes is configured for a one-year expiry.",
      "Guest submissions and data not linked to your account may need a separate request. Local browser data, third-party records, and copies saved by other people are not all removed by deleting a TrailVerse account."
    ]
  },
  {
    "id": "rights",
    "title": "Your choices and requests",
    "paragraphs": [
      "You can update your profile and manage saved content in your account. To delete the account, open Profile settings → Privacy & Security → Delete Account, enter your password, and type DELETE.",
      "Unsubscribe from marketing emails through the links in those messages. Contact trailverseteam@gmail.com to request access, correction, deletion, or a portable copy of information, or to ask about a guest submission. We may need to verify your identity. Rights and any applicable exceptions depend on your location.",
      "The current site does not provide a universal cookie-consent switch or a self-service export of all personal information. Browser controls can be used to manage local storage and cookies."
    ]
  },
  {
    "id": "children",
    "title": "Children’s privacy",
    "paragraphs": [
      "TrailVerse is not intended for children under 13. We do not knowingly collect information from children under 13. Users between 13 and 18 should have parental consent. Contact us if you believe a child has provided information."
    ]
  },
  {
    "id": "changes",
    "title": "Updates and contact",
    "paragraphs": [
      "Changes to this policy will be posted here. For questions, privacy requests, or concerns, email trailverseteam@gmail.com."
    ]
  }
];

export default function PrivacyPageContent() {
  const sections = policySections.map(({ id, title, paragraphs }) => ({
    id, title, content: paragraphs.map(paragraph => <p key={paragraph} className="mb-4">{paragraph}</p>),
  }));
  return (
    <main className="info-page info-legal">
      <InfoPageHeader title="Privacy Policy" description="What we collect, how planning requests are processed, and the controls available to you." />
      <LegalSections sections={sections} />
      <section className="info-section">
        <h2 className="mb-4">Questions about your information?</h2>
        <a className="public-action public-action-secondary px-5" href="mailto:trailverseteam@gmail.com">Contact us</a>
      </section>
    </main>
  );
}
