"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import "./notifications.css";
import { computeRemainingMs } from "@/lib/toastTimer";

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number; // in milliseconds, 0 for persistent
}

interface NotificationSystemProps {
  notifications: Notification[];
  onRemove: (id: string) => void;
}

// A single run can fire up to eight of these back to back (submit, sign,
// confirm, settle...). Stacking all eight on screen would bury the game
// frame, so only the most recent three are ever drawn; everything older is
// folded into a one-line "+N more" counter until it clears.
const MAX_VISIBLE_TOASTS = 3;

// A toast's auto-dismiss countdown, so it can be paused and resumed instead
// of just cancelled or left running.
interface ToastTimer {
  remainingMs: number;
  startedAt: number;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

// Whether a toast is currently being held open by the mouse, the keyboard,
// or both - the countdown only resumes once neither is holding it.
interface ToastInteraction {
  hover: boolean;
  focused: boolean;
}

const NotificationSystem: React.FC<NotificationSystemProps> = ({
  notifications,
  onRemove,
}) => {
  const [visibleNotifications, setVisibleNotifications] = useState<string[]>([]);
  const [removingNotifications, setRemovingNotifications] = useState<string[]>([]);

  const timersRef = useRef<Map<string, ToastTimer>>(new Map());
  const interactionRef = useRef<Map<string, ToastInteraction>>(new Map());
  // The 300ms exit-animation delay between a toast being told to leave and
  // it actually being torn out of the DOM. Tracked the same way as the
  // auto-dismiss countdown so unmount cleanup can cancel it too - otherwise
  // a toast mid fade-out when the whole stack unmounts (e.g. a route change)
  // leaves an orphaned timeout that fires setters on a gone component.
  const fadeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearToastTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer?.timeoutId != null) {
      clearTimeout(timer.timeoutId);
    }
    timersRef.current.delete(id);
    interactionRef.current.delete(id);
  }, []);

  const removeNotification = useCallback((id: string) => {
    clearToastTimer(id);

    const existingFade = fadeTimersRef.current.get(id);
    if (existingFade != null) clearTimeout(existingFade);

    setRemovingNotifications(prev => [...prev, id]);

    const fadeTimeoutId = setTimeout(() => {
      fadeTimersRef.current.delete(id);
      onRemove(id);
      setRemovingNotifications(prev => prev.filter(notifId => notifId !== id));
      setVisibleNotifications(prev => prev.filter(notifId => notifId !== id));
    }, 300);
    fadeTimersRef.current.set(id, fadeTimeoutId);
  }, [onRemove, clearToastTimer]);

  // Arms (or re-arms) a toast's auto-dismiss countdown from a full duration.
  const scheduleToastTimer = useCallback((id: string, durationMs: number) => {
    clearToastTimer(id);
    const timeoutId = setTimeout(() => {
      removeNotification(id);
    }, durationMs);
    timersRef.current.set(id, {
      remainingMs: durationMs,
      startedAt: Date.now(),
      timeoutId,
    });
  }, [clearToastTimer, removeNotification]);

  // Freezes the countdown where it stands, so the read-so-far time isn't lost.
  const pauseToastTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (!timer || timer.timeoutId == null) return;
    clearTimeout(timer.timeoutId);
    timer.remainingMs = computeRemainingMs(timer.remainingMs, timer.startedAt, Date.now());
    timer.timeoutId = null;
  }, []);

  // Picks the countdown back up from wherever it was frozen. A toast that
  // was already fully elapsed at the moment it got paused (the hover/focus
  // landed right as it was about to vanish) must dismiss immediately rather
  // than sit there with no timer ever re-armed for it - otherwise it stays
  // open forever, only closable by hand.
  const resumeToastTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (!timer || timer.timeoutId != null) return;
    if (timer.remainingMs <= 0) {
      removeNotification(id);
      return;
    }
    timer.startedAt = Date.now();
    timer.timeoutId = setTimeout(() => {
      removeNotification(id);
    }, timer.remainingMs);
  }, [removeNotification]);

  // A toast should stay held open as long as EITHER the mouse or the
  // keyboard is on it - not just whichever let go most recently.
  const holdToastTimer = useCallback((id: string, kind: keyof ToastInteraction, held: boolean) => {
    let interaction = interactionRef.current.get(id);
    if (!interaction) {
      interaction = { hover: false, focused: false };
      interactionRef.current.set(id, interaction);
    }
    interaction[kind] = held;

    if (interaction.hover || interaction.focused) {
      pauseToastTimer(id);
    } else {
      resumeToastTimer(id);
    }
  }, [pauseToastTimer, resumeToastTimer]);

  // Never leave a countdown ticking (or a resolved one still registered)
  // after the toast stack itself goes away.
  useEffect(() => {
    const timers = timersRef.current;
    const interactions = interactionRef.current;
    const fadeTimers = fadeTimersRef.current;
    return () => {
      timers.forEach(timer => {
        if (timer.timeoutId != null) clearTimeout(timer.timeoutId);
      });
      fadeTimers.forEach(fadeTimeoutId => clearTimeout(fadeTimeoutId));
      timers.clear();
      interactions.clear();
      fadeTimers.clear();
    };
  }, []);

  useEffect(() => {
    const newNotifications = notifications.filter(
      notif => !visibleNotifications.includes(notif.id)
    );

    newNotifications.forEach(notif => {
      setVisibleNotifications(prev => [...prev, notif.id]);

      if (notif.duration && notif.duration > 0) {
        scheduleToastTimer(notif.id, notif.duration);
      }
    });
  }, [notifications, visibleNotifications, scheduleToastTimer]);

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '!';
      case 'info':
        return 'i';
      default:
        return 'i';
    }
  };

  const getNotificationClass = (type: Notification['type']) => {
    const baseClass = 'rc-toast';
    switch (type) {
      case 'success':
        return `${baseClass} rc-toast--success`;
      case 'error':
        return `${baseClass} rc-toast--error`;
      case 'warning':
        return `${baseClass} rc-toast--warning`;
      case 'info':
        return `${baseClass} rc-toast--info`;
      default:
        return `${baseClass} rc-toast--info`;
    }
  };

  if (notifications.length === 0) {
    return null;
  }

  const shown = notifications.slice(0, MAX_VISIBLE_TOASTS);
  const overflowCount = notifications.length - shown.length;

  return (
    <div className="rc-toast-stack" role="status" aria-live="polite">
      {shown.map((notification) => (
        <div
          key={notification.id}
          role={notification.type === 'error' ? 'alert' : 'status'}
          className={`
            ${getNotificationClass(notification.type)}
            ${visibleNotifications.includes(notification.id) ? 'rc-toast--visible' : ''}
            ${removingNotifications.includes(notification.id) ? 'rc-toast--removing' : ''}
          `}
          onMouseEnter={() => holdToastTimer(notification.id, 'hover', true)}
          onMouseLeave={() => holdToastTimer(notification.id, 'hover', false)}
          onFocus={() => holdToastTimer(notification.id, 'focused', true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              holdToastTimer(notification.id, 'focused', false);
            }
          }}
        >
          <div className="rc-toast-icon rc-pixel" aria-hidden="true">
            {getNotificationIcon(notification.type)}
          </div>
          <div className="rc-toast-body">
            <div className="rc-toast-title rc-pixel">{notification.title}</div>
            <div className="rc-toast-text">{notification.message}</div>
          </div>
          <button
            onClick={() => removeNotification(notification.id)}
            className="rc-toast-close"
            aria-label="Close notification"
          >
            ✕
          </button>
        </div>
      ))}

      {overflowCount > 0 && (
        <div className="rc-toast-overflow rc-mono">+{overflowCount} MORE</div>
      )}
    </div>
  );
};

// Hook for managing notifications
export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((notification: Omit<Notification, 'id'>) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newNotification: Notification = {
      ...notification,
      id,
      duration: notification.duration ?? 5000, // 5 seconds default
    };

    setNotifications(prev => [...prev, newNotification]);
    return id;
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Helper methods for different notification types
  const notifySuccess = useCallback((title: string, message: string, duration?: number) => {
    return addNotification({ type: 'success', title, message, duration });
  }, [addNotification]);

  const notifyError = useCallback((title: string, message: string, duration?: number) => {
    return addNotification({ type: 'error', title, message, duration });
  }, [addNotification]);

  const notifyWarning = useCallback((title: string, message: string, duration?: number) => {
    return addNotification({ type: 'warning', title, message, duration });
  }, [addNotification]);

  const notifyInfo = useCallback((title: string, message: string, duration?: number) => {
    return addNotification({ type: 'info', title, message, duration });
  }, [addNotification]);

  // Blockchain-specific notifications
  const notifyWalletConnected = useCallback((address: string) => {
    return notifySuccess(
      'Wallet Connected',
      `Connected to ${address.slice(0, 6)}...${address.slice(-4)}`,
      4000
    );
  }, [notifySuccess]);

  const notifyWalletDisconnected = useCallback(() => {
    return notifyInfo('Wallet Disconnected', 'Your wallet has been disconnected', 3000);
  }, [notifyInfo]);

  const notifyNetworkError = useCallback(() => {
    return notifyError(
      'Network Error',
      'Please switch to Somnia Network to play the game',
      8000
    );
  }, [notifyError]);

  const notifyTransactionSubmitted = useCallback((txHash: string) => {
    return notifyInfo(
      'Transaction Submitted',
      `Transaction: ${txHash.slice(0, 8)}...${txHash.slice(-6)}`,
      6000
    );
  }, [notifyInfo]);

  const notifyTransactionConfirmed = useCallback((txHash: string) => {
    return notifySuccess(
      'Transaction Confirmed',
      `Transaction: ${txHash.slice(0, 8)}...${txHash.slice(-6)}`,
      5000
    );
  }, [notifySuccess]);

  // tokens is null when the confirmed transaction's receipt could not be
  // read for a minted amount - the run itself still succeeded on-chain, so
  // this must never be confused with a genuine zero reward.
  const notifyScoreSubmitted = useCallback((score: number, tokens: number | null) => {
    return notifySuccess(
      'Score Submitted!',
      tokens === null
        ? `Score: ${score.toLocaleString()} | Transaction confirmed, but the earned amount could not be read`
        : `Score: ${score.toLocaleString()} | Earned: ${tokens.toFixed(2)} WICK`,
      6000
    );
  }, [notifySuccess]);

  // Shown before the transaction settles, from the client's own copy of the
  // reward formula - explicitly labelled as unconfirmed so it never reads as
  // the same fact notifyScoreSubmitted reports once the chain has minted.
  const notifyScoreProjected = useCallback((score: number, tokens: number) => {
    return notifyInfo(
      'Submitting Run',
      `Score: ${score.toLocaleString()} | Est. Reward: ${tokens.toFixed(2)} WICK (unconfirmed)`,
      6000
    );
  }, [notifyInfo]);

  const notifyGameError = useCallback((error: string) => {
    return notifyError('Game Error', error, 6000);
  }, [notifyError]);

  return {
    notifications,
    addNotification,
    removeNotification,
    clearAllNotifications,
    notifySuccess,
    notifyError,
    notifyWarning,
    notifyInfo,
    notifyWalletConnected,
    notifyWalletDisconnected,
    notifyNetworkError,
    notifyTransactionSubmitted,
    notifyTransactionConfirmed,
    notifyScoreSubmitted,
    notifyScoreProjected,
    notifyGameError,
  };
};

export default NotificationSystem;
