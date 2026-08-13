"use client";

import React, { useState } from 'react';
import { useApp } from "@/app/providers";
import SomniaLogo from "../ui/SomniaLogo";

interface NavbarProps {
  onNavigate?: (page: 'home' | 'game' | 'leaderboard') => void;
}

const Navbar: React.FC<NavbarProps> = ({ onNavigate }) => {
  const { connectWallet, signOut, isLoading, isAuthenticated, user, playerStats } = useApp();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleNavigation = (page: 'home' | 'game' | 'leaderboard') => {
    if (onNavigate) {
      onNavigate(page);
    }
    setIsMenuOpen(false);
  };

  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Left Side - Logo and Title */}
        <div className="navbar-brand">
          <SomniaLogo size="small" className="navbar-logo" animate={false} />
          <div className="navbar-title">
            <span className="navbar-title-main">Rocket Candle</span>
            <span className="navbar-subtitle">Somnia Blockchain</span>
          </div>
        </div>

        {/* Center - Navigation Links */}
        <div className="navbar-nav">
          <button
            onClick={() => handleNavigation('home')}
            className="nav-link"
          >
            🏠 Home
          </button>
          <button
            onClick={() => handleNavigation('game')}
            className="nav-link"
            disabled={!isAuthenticated}
          >
            🎮 Play
          </button>
          <button
            onClick={() => handleNavigation('leaderboard')}
            className="nav-link"
          >
            🏆 Leaderboard
          </button>
        </div>

        {/* Right Side - Wallet Connection */}
        <div className="navbar-wallet">
          {!isAuthenticated ? (
            <button
              onClick={connectWallet}
              disabled={isLoading}
              className="btn btn-primary"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <div className="loading-spinner-small"></div>
                  Connecting...
                </span>
              ) : (
                "🔗 Connect"
              )}
            </button>
          ) : (
            <div className="wallet-connected">
              <div className="wallet-info-dropdown">
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="wallet-button"
                >
                  <div className="wallet-avatar">
                    <div className="status-indicator"></div>
                  </div>
                  <div className="wallet-details">
                    <div className="wallet-name">{user?.displayName || 'Player'}</div>
                    <div className="wallet-address">{formatAddress(user?.address || '')}</div>
                  </div>
                  <div className="dropdown-arrow">
                    {isMenuOpen ? '▲' : '▼'}
                  </div>
                </button>

                {isMenuOpen && (
                  <div className="wallet-dropdown">
                    {playerStats && (
                      <div className="wallet-stats">
                        <div className="stat-row">
                          <span>Games:</span>
                          <span>{playerStats.totalGames}</span>
                        </div>
                        <div className="stat-row">
                          <span>Best Score:</span>
                          <span>{playerStats.bestScore.toLocaleString()}</span>
                        </div>
                        <div className="stat-row">
                          <span>WICK:</span>
                          <span>{playerStats.totalTokens.toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                    <div className="dropdown-divider"></div>
                    <button
                      onClick={() => {
                        signOut();
                        setIsMenuOpen(false);
                      }}
                      className="disconnect-button"
                    >
                      🔌 Disconnect
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="mobile-menu-toggle"
        >
          <div className="hamburger">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </button>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="mobile-menu">
          <div className="mobile-nav-links">
            <button
              onClick={() => handleNavigation('home')}
              className="mobile-nav-link"
            >
              🏠 Home
            </button>
            <button
              onClick={() => handleNavigation('game')}
              className="mobile-nav-link"
              disabled={!isAuthenticated}
            >
              🎮 Play
            </button>
            <button
              onClick={() => handleNavigation('leaderboard')}
              className="mobile-nav-link"
            >
              🏆 Leaderboard
            </button>
          </div>
          
          {isAuthenticated && (
            <div className="mobile-wallet-info">
              {playerStats && (
                <div className="mobile-stats">
                  <div className="mobile-stat">
                    <span>Games: {playerStats.totalGames}</span>
                  </div>
                  <div className="mobile-stat">
                    <span>Best: {playerStats.bestScore.toLocaleString()}</span>
                  </div>
                  <div className="mobile-stat">
                    <span>Tokens: {playerStats.totalTokens.toFixed(2)}</span>
                  </div>
                </div>
              )}
              <button
                onClick={() => {
                  signOut();
                  setIsMenuOpen(false);
                }}
                className="mobile-disconnect"
              >
                🔌 Disconnect Wallet
              </button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;