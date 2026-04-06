import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import Button from '@/components/common/Button';
import FAQAccordionClient from './FAQAccordionClient';

export const metadata = {
  title: 'FAQ — National Park Trip Planning & TrailVerse Features',
  description: 'Answers to common questions about TrailVerse — AI trip planning, 470+ park coverage, real-time weather, community features, and getting started.',
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/faq',
  },
  openGraph: {
    title: 'FAQ — TrailVerse National Parks',
    description: 'Answers to common questions about TrailVerse — AI trip planning, 470+ park coverage, real-time weather, community features, and getting started.',
    url: 'https://www.nationalparksexplorerusa.com/faq',
    siteName: 'TrailVerse',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'FAQ — TrailVerse National Parks',
    description: 'Answers to common questions about TrailVerse — AI trip planning, 470+ park coverage, real-time weather, community features, and getting started.',
  },
};

const faqStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is TrailVerse?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "TrailVerse is your comprehensive guide to exploring America's 470+ parks and sites. We combine real-time weather data, interactive maps, community reviews, and smart trip planning to help you discover and plan the perfect park adventure."
      }
    },
    {
      '@type': 'Question',
      name: 'How do I get started?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Getting started is easy! Create a free account by clicking 'Sign Up', enter your email and create a password. Once logged in, you can explore parks, save favorites, use AI trip planning, view real-time weather, check NPS events, and read travel guides. No credit card required!"
      }
    },
    {
      '@type': 'Question',
      name: 'What makes TrailVerse different?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'TrailVerse uniquely combines smart trip planning (Claude + ChatGPT), real-time weather, live NPS events, interactive maps, community reviews with photos, and expert travel guides all in one platform. We help you discover, compare, and plan visits across all 470+ parks and sites with personalized recommendations.'
      }
    },
    {
      '@type': 'Question',
      name: 'How does AI trip planning work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Our AI analyzes your preferences, travel dates, interests, and available time to create personalized itineraries. It considers weather, seasonal attractions, trail difficulty, and optimal routes. Simply provide your preferences, and let our AI craft a detailed plan for you.'
      }
    },
    {
      '@type': 'Question',
      name: 'Which AI providers do you offer?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "We offer two AI providers: OpenAI's GPT-4 (ChatGPT) and Anthropic's Claude. Both provide excellent recommendations. GPT-4 offers detailed itineraries, while Claude provides conversational responses. You can switch between providers mid-conversation, and your trip history is saved regardless of which AI you use."
      }
    },
    {
      '@type': 'Question',
      name: 'How does trip history and archiving work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "All your AI conversations are automatically saved to your Trip History. Active trips appear in the 'Active' tab for easy continuation. Archive completed trips to the 'Archived' tab where you can restore them anytime with full context and conversation history preserved."
      }
    },
    {
      '@type': 'Question',
      name: 'Are my AI conversations private?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes! Your AI conversations are private and stored securely. We send anonymized queries to OpenAI and Anthropic (without personal identifiers). You can delete any conversation from your trip history at any time.'
      }
    },
    {
      '@type': 'Question',
      name: 'What parks are included?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'TrailVerse includes all 470+ units of the National Park System, including National Parks, Monuments, Historic Sites, Battlefields, Seashores, Lakeshores, Recreation Areas, and Preserves. From Yellowstone and Yosemite to hidden gems and historic sites, we cover them all.'
      }
    },
    {
      '@type': 'Question',
      name: 'How do Google Maps features work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'All devices get interactive maps with park markers and search. On desktop, you also get Google Places to find nearby restaurants, lodging, and gas stations, plus route planning with turn-by-turn directions. Mobile users enjoy smooth map browsing with park details.'
      }
    },
    {
      '@type': 'Question',
      name: 'How accurate is the weather information?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'We provide real-time weather data from OpenWeather API with 5-day forecasts, updated regularly throughout the day. Weather in National Parks can change rapidly, so we recommend checking official NPS sources before your trip for critical updates.'
      }
    },
    {
      '@type': 'Question',
      name: 'What are park events and how do I save them?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Our Events page displays live ranger programs, guided tours, educational activities, and special events from the National Park Service. Filter by date, park, or activity type, and click the bookmark icon to save events to your profile for easy access.'
      }
    },
    {
      '@type': 'Question',
      name: 'How do favorites and collections work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Click the heart icon on parks, blogs, or events to save them to your Favorites. Access all saved items from your profile dashboard, organized by type. Use your collections for trip planning and tracking your journey across America's parks."
      }
    },
    {
      '@type': 'Question',
      name: 'How do I track visited parks?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Go to your Profile page and select 'Visited Parks' tab. Click 'Mark Park as Visited' to add a park, select the visit date, and add optional memories. This builds your personal National Park passport and tracks your adventure journey."
      }
    },
    {
      '@type': 'Question',
      name: 'How do I customize my avatar?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'TrailVerse offers 1000+ unique auto-generated avatar combinations! Go to your profile settings and click your avatar to open the Avatar Selector. Browse styles, use the random generator, or upload your own photo. Your avatar displays with all your reviews and comments.'
      }
    },
    {
      '@type': 'Question',
      name: 'How do I write reviews with photos?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Visit any park's detail page and click 'Write Review'. Upload up to 5 photos per review (JPEG, PNG, GIF, or WebP, max 10MB each). We automatically optimize images for faster loading. Your reviews help other travelers plan better trips!"
      }
    },
    {
      '@type': 'Question',
      name: 'How do blog comments work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Our blog posts feature nested replies, likes, and threaded discussions. Comment on articles, reply to other users, like helpful comments, and edit or delete your own comments anytime. Join the community discussion around National Park topics!'
      }
    },
    {
      '@type': 'Question',
      name: 'Can I use TrailVerse offline?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes! TrailVerse securely saves park information, saved trips, and your favorites so you can access them without cell service or internet. Features requiring live data (like map routing, live weather, or AI conversations) still require a connection. Tip: You can install our app to your home screen for the best offline experience.'
      }
    },
    {
      '@type': 'Question',
      name: 'Is my data safe and private?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Absolutely. We never sell your personal information. Your account data, favorites, and preferences are securely stored and used only to enhance your TrailVerse experience. All data is encrypted in transit and at rest. Read our Privacy Policy for complete details.'
      }
    },
    {
      '@type': 'Question',
      name: 'How do I delete my account?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Go to your Profile > Settings > Privacy & Security section and click 'Delete Account'. Confirm your password and follow the prompts. All your data will be permanently deleted in accordance with our Privacy Policy."
      }
    },
    {
      '@type': 'Question',
      name: 'Can I contact support?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes! We love hearing from our community. For feature suggestions, bug reports, or questions, contact us at trailverseteam@gmail.com. We typically respond within 24-48 hours.'
      }
    }
  ]
};

export default function FAQPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />

        <main className="pt-3 sm:pt-16">
          <section className="py-8 sm:py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6" style={{ color: 'var(--text-primary)' }}>
                Frequently Asked Questions
              </h1>
              <p className="text-lg sm:text-xl mb-8 max-w-3xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                Find answers to common questions about TrailVerse and start planning your perfect park adventure.
              </p>
              <div
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ring-1 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                <span>Still have questions? Email us</span>
              </div>
            </div>
          </section>

          <FAQAccordionClient />

          <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <div className="max-w-4xl mx-auto">
              <div
                className="rounded-3xl p-8 sm:p-12 text-center backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
                  Still have questions?
                </h2>
                <p className="text-base mb-6 max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                  Can&apos;t find the answer you&apos;re looking for? Our support team is here to help.
                </p>
                <Button href="mailto:trailverseteam@gmail.com" variant="secondary" size="md">
                  Contact Support
                </Button>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}
