"use client";

import { useRouter } from "next/navigation";
import HeroSection from "@/components/landing/HeroSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import HowToPlaySection from "@/components/landing/HowToPlaySection";
import Navbar from "@/components/layout/Navbar";
import "./landing.css";

export default function LandingPage() {
  const router = useRouter();

  // Navigation handlers
  const handleDashboard = () => {
    router.push("/dashboard");
  };

  const handleStartGame = () => {
    router.push("/game");
  };

  const handleNavigation = (page: 'home' | 'game' | 'leaderboard') => {
    switch (page) {
      case 'home':
        router.push('/');
        break;
      case 'game':
        router.push('/game');
        break;
      case 'leaderboard':
        router.push('/scores');
        break;
    }
  };

  return (
    <>
      {/* Navigation Bar */}
      <Navbar onNavigate={handleNavigation} />

      <div className="lp-page">
        {/* Hero, feature strip and how-to-play, framed as one console */}
        <div className="lp-console">
          <HeroSection
            onDashboard={handleDashboard}
            onStartGame={handleStartGame}
          />
          <FeaturesSection />
          <HowToPlaySection />
        </div>

        {/* Footer with Credits */}
        <footer className="lp-footer rc-mono">
          <p>
            Sound Effect by{" "}
            <a
              href="https://pixabay.com/users/freesound_community-46691455/?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=38511"
              target="_blank"
              rel="noopener noreferrer"
            >
              freesound_community
            </a>{" "}
            from{" "}
            <a
              href="https://pixabay.com/sound-effects//?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=38511"
              target="_blank"
              rel="noopener noreferrer"
            >
              Pixabay
            </a>
          </p>
        </footer>
      </div>
    </>
  );
}
