"use client";

import React, { useState, useEffect, useCallback } from 'react';
import "./notifications.css";

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

const NotificationSystem: React.FC<NotificationSystemProps> = ({
  notifications,
  onRemove,
}) => {
  const [visibleNotifications, setVisibleNotifications] = useState<string[]>([]);
  const [removingNotifications, setRemovingNotifications] = useState<string[]>([]);

  const removeNotification = useCallback((id: string) => {
    setRemovingNotifications(prev => [...prev, id]);

    setTimeout(() => {
      onRemove(id);
      setRemovingNotifications(prev => prev.filter(notifId => notifId !== id));
      setVisibleNotifications(prev => prev.filter(notifId => notifId !== id));
    }, 300);
  }, [onRemove]);

  useEffect(() => {
    const newNotifications = notifications.filter(
      notif => !visibleNotifications.includes(notif.id)
    );

    newNotifications.forEach(notif => {
      setVisibleNotifications(prev => [...prev, notif.id]);

      if (notif.duration && notif.duration > 0) {
        setTimeout(() => {
          removeNotification(notif.id);
        }, notif.duration);
      }
    });
  }, [notifications, visibleNotifications, removeNotification]);

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

  const notifyScoreSubmitted = useCallback((score: number, tokens: number) => {
    return notifySuccess(
      'Score Submitted!',
      `Score: ${score.toLocaleString()} | Earned: ${tokens.toFixed(2)} WICK`,
      6000
    );
  }, [notifySuccess]);

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
    notifyGameError,
  };
};

export default NotificationSystem;
