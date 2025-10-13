import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUp } from '@components/icons';

const ScrollToTop = () => {
  const { pathname } = useLocation();
  const [isVisible, setIsVisible] = useState(false);

  // Don't show scroll-to-top button on chat pages
  const isChatPage = pathname.startsWith('/plan-ai') || pathname.includes('/chat');

  // Scroll to top when route changes (except for chat pages)
  useEffect(() => {
    // Don't auto-scroll on chat pages to preserve user's scroll position
    if (isChatPage) {
      return;
    }
    
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'smooth'
    });
  }, [pathname, isChatPage]);

  // Show/hide button based on scroll position (but not on chat pages)
  useEffect(() => {
    const toggleVisibility = () => {
      // Don't show on chat pages
      if (isChatPage) {
        setIsVisible(false);
        return;
      }
      
      // Show button when page is scrolled down 300px (reduced for better UX)
      if (window.pageYOffset > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility);

    return () => {
      window.removeEventListener('scroll', toggleVisibility);
    };
  }, [isChatPage]);

  // Scroll to top smoothly
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  // Don't render anything on chat pages
  if (isChatPage) {
    return null;
  }

  return (
    <>
      {isVisible && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 lg:bottom-10 lg:right-10 z-50 
                     w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16
                     rounded-full 
                     transition-all duration-300 ease-out
                     hover:scale-110 active:scale-95 
                     opacity-0 animate-fade-in
                     group
                     focus:outline-none focus:ring-4 focus:ring-opacity-50
                     backdrop-blur-md
                     border-2"
          style={{
            backgroundColor: 'var(--surface)',
            boxShadow: 'var(--shadow-xl), 0 0 0 1px var(--border)',
            borderColor: 'var(--border)',
            animation: 'fadeInUp 0.3s ease-out forwards'
          }}
          aria-label="Scroll to top of page"
          title="Scroll to top"
        >
          <ArrowUp 
            className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 transition-all duration-300 
                       group-hover:-translate-y-1 group-hover:scale-110
                       group-active:translate-y-0 group-active:scale-100" 
            style={{ 
              color: 'var(--accent-green)', 
              strokeWidth: 2.5,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))'
            }} 
          />
          
          {/* Subtle glow effect on hover */}
          <div 
            className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 
                       transition-opacity duration-300 pointer-events-none"
            style={{
              background: 'radial-gradient(circle, var(--accent-green-light) 0%, transparent 70%)',
              transform: 'scale(1.2)'
            }}
          />
        </button>
      )}
      
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.8);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        .animate-fade-in {
          animation: fadeInUp 0.3s ease-out forwards;
        }
      `}</style>
    </>
  );
};

export default ScrollToTop;
