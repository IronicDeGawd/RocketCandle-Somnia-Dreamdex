"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useApp } from "@/app/providers";
import SomniaLogo from "../ui/SomniaLogo";
import "./navbar.css";

interface NavbarProps {
  onNavigate?: (page: 'home' | 'game' | 'leaderboard') => void;
}

const Navbar: React.FC<NavbarProps> = ({ onNavigate }) => {
  const { connectWallet, signOut, isLoading, isAuthenticated, user, playerStats } = useApp();

  // The wallet dropdown and the mobile hamburger menu used to share one
  // boolean, so opening either one closed the other - a phone user could
  // never see both the nav links and their wallet stats at once. Two
  // independent switches let them open on their own.
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const dropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const dropdownPanelRef = useRef<HTMLDivElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);

  const handleNavigation = (page: 'home' | 'game' | 'leaderboard') => {
    if (onNavigate) {
      onNavigate(page);
    }
    setIsMobileMenuOpen(false);
  };

  /**
   * Both PLAY and LEADERBOARD need a wallet. Rather than being switched off -
   * a switched-off button cannot be clicked, so it can never say why it is
   * switched off - they stay clickable and dimmed. Clicking one without a
   * wallet opens the connect prompt, which is the thing the player needed to
   * do anyway.
   */
  const walletGated = (page: 'game' | 'leaderboard') => () => {
    if (!isAuthenticated) {
      setIsMobileMenuOpen(false);
      connectWallet();
      return;
    }
    handleNavigation(page);
  };

  const gatedTitle = (what: string) =>
    isAuthenticated ? undefined : `Connect a wallet to ${what}`;

  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Opening either panel moves focus into it; Escape closes it and hands
  // focus back to the button that opened it, so a keyboard user is never
  // dropped onto the page behind an invisible panel.
  useEffect(() => {
    if (!isDropdownOpen) return;
    const panel = dropdownPanelRef.current;
    const focusable = panel?.querySelector<HTMLElement>('button, a');
    focusable?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
        dropdownTriggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDropdownOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const panel = mobilePanelRef.current;
    const focusable = panel?.querySelector<HTMLElement>('button, a');
    focusable?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
        mobileTriggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  return (
    <nav className="nb-bar">
      <div className="nb-inner">
        <div className="nb-brand">
          <SomniaLogo size="small" animate={false} />
          <div className="nb-brand-text">
            <span className="nb-brand-title rc-pixel">ROCKET CANDLE</span>
            <span className="nb-brand-sub rc-mono">SOMNIA BLOCKCHAIN</span>
          </div>
        </div>

        <div className="nb-links">
          <button onClick={() => handleNavigation('home')} className="nb-link rc-pixel">
            HOME
          </button>
          <button
            onClick={walletGated('game')}
            className={`nb-link rc-pixel${isAuthenticated ? '' : ' nb-link--locked'}`}
            title={gatedTitle('play')}
          >
            PLAY
          </button>
          <button
            onClick={walletGated('leaderboard')}
            className={`nb-link rc-pixel${isAuthenticated ? '' : ' nb-link--locked'}`}
            title={gatedTitle('see the leaderboard')}
          >
            LEADERBOARD
          </button>
        </div>

        <div className="nb-actions">
          {!isAuthenticated ? (
            <button
              onClick={connectWallet}
              disabled={isLoading}
              className="rc-btn rc-btn--primary nb-connect-btn"
            >
              {isLoading ? 'CONNECTING…' : 'CONNECT'}
            </button>
          ) : (
            <div className="nb-wallet">
              <button
                ref={dropdownTriggerRef}
                onClick={() => setIsDropdownOpen((open) => !open)}
                className="rc-btn nb-wallet-trigger"
                aria-haspopup="true"
                aria-expanded={isDropdownOpen}
                aria-controls="nb-wallet-dropdown"
              >
                <span className="nb-status-dot" aria-hidden="true" />
                <span className="nb-wallet-info">
                  <span className="nb-wallet-name">{user?.displayName || 'Player'}</span>
                  <span className="nb-wallet-address rc-mono">
                    {formatAddress(user?.address || '')}
                  </span>
                </span>
                <span className="nb-caret" aria-hidden="true">
                  {isDropdownOpen ? '▲' : '▼'}
                </span>
              </button>

              {isDropdownOpen && (
                <div
                  id="nb-wallet-dropdown"
                  ref={dropdownPanelRef}
                  className="rc-panel nb-dropdown"
                  role="menu"
                >
                  {playerStats && (
                    <div className="nb-dropdown-stats rc-well">
                      <div className="nb-stat-row rc-mono">
                        <span>GAMES</span>
                        <span>{playerStats.totalGames}</span>
                      </div>
                      <div className="nb-stat-row rc-mono">
                        <span>BEST SCORE</span>
                        <span>{playerStats.bestScore.toLocaleString()}</span>
                      </div>
                      <div className="nb-stat-row rc-mono">
                        <span>WICK</span>
                        <span>{playerStats.totalTokens.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      signOut();
                      setIsDropdownOpen(false);
                    }}
                    className="rc-btn rc-btn--danger nb-disconnect-btn"
                  >
                    DISCONNECT
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            ref={mobileTriggerRef}
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            className="nb-burger rc-btn"
            aria-haspopup="true"
            aria-expanded={isMobileMenuOpen}
            aria-controls="nb-mobile-menu"
            aria-label="Menu"
          >
            <span className="nb-burger-bars" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div id="nb-mobile-menu" ref={mobilePanelRef} className="rc-panel nb-mobile">
          <button onClick={() => handleNavigation('home')} className="nb-mobile-link rc-pixel">
            HOME
          </button>
          <button
            onClick={walletGated('game')}
            className={`nb-mobile-link rc-pixel${isAuthenticated ? '' : ' nb-mobile-link--locked'}`}
            title={gatedTitle('play')}
          >
            PLAY
          </button>
          <button
            onClick={walletGated('leaderboard')}
            className={`nb-mobile-link rc-pixel${isAuthenticated ? '' : ' nb-mobile-link--locked'}`}
            title={gatedTitle('see the leaderboard')}
          >
            LEADERBOARD
          </button>

          {isAuthenticated && (
            <>
              {playerStats && (
                <div className="nb-dropdown-stats rc-well nb-mobile-stats">
                  <div className="nb-stat-row rc-mono">
                    <span>GAMES</span>
                    <span>{playerStats.totalGames}</span>
                  </div>
                  <div className="nb-stat-row rc-mono">
                    <span>BEST SCORE</span>
                    <span>{playerStats.bestScore.toLocaleString()}</span>
                  </div>
                  <div className="nb-stat-row rc-mono">
                    <span>WICK</span>
                    <span>{playerStats.totalTokens.toFixed(2)}</span>
                  </div>
                </div>
              )}
              <button
                onClick={() => {
                  signOut();
                  setIsMobileMenuOpen(false);
                }}
                className="rc-btn rc-btn--danger nb-disconnect-btn"
              >
                DISCONNECT
              </button>
            </>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
