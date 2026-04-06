import React from 'react';
import { X, AlertTriangle, FlaskConical, Calendar, CheckCircle } from 'lucide-react';
import { useNotifications } from '../../hooks/queries/useNotifications';
import type { Notification } from '../../store/mockData';

const iconMap = {
  critical: <AlertTriangle size={16} className="text-error" />,
  lab: <FlaskConical size={16} className="text-tertiary" />,
  appointment: <Calendar size={16} className="text-primary" />,
  info: <CheckCircle size={16} className="text-emerald-600" />,
};

const bgMap = {
  critical: 'bg-error/10',
  lab: 'bg-tertiary/10',
  appointment: 'bg-primary/10',
  info: 'bg-emerald-100',
};

interface NotificationDrawerProps {
  onClose: () => void;
}

export const NotificationDrawer = ({ onClose }: NotificationDrawerProps) => {
  const { notifications, unreadCount: unread, updateNotifications, isLoading } = useNotifications();

  const markAllRead = () => {
    const marked = notifications.map((n: Notification) => ({...n, read: true}));
    updateNotifications(marked);
  };

  const markRead = (id: string) => {
    const marked = notifications.map((n: Notification) => n.id === id ? {...n, read: true} : n);
    updateNotifications(marked);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-sm bg-white z-40 shadow-2xl flex flex-col animate-slide-in-right">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-extrabold text-on-surface">Notifications</h2>
            {unread > 0 && (
              <p className="text-xs text-on-surface-variant">{unread} unread</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-on-surface-variant"
          >
            <X size={18} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {isLoading ? (
            <div className="p-10 flex justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-10 text-center text-xs text-on-surface-variant italic">No notifications</div>
          ) : (
            notifications.map((n: Notification) => (
              <div
                key={n.id}
                onClick={() => markRead(n.id)}
                className={`flex gap-3 px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer ${!n.read ? 'bg-blue-50/30' : ''}`}
              >
                <div className={`w-8 h-8 rounded-xl ${bgMap[n.type as keyof typeof bgMap]} flex items-center justify-center shrink-0 mt-0.5`}>
                  {iconMap[n.type as keyof typeof iconMap]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-bold text-on-surface ${!n.read ? 'text-on-surface' : 'text-on-surface/80'}`}>
                      {n.title}
                    </p>
                    {!n.read && (
                      <span className="w-2 h-2 bg-primary rounded-full shrink-0 mt-1.5" />
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">{n.body}</p>
                  <p className="text-[10px] text-on-surface-variant/60 font-semibold mt-1.5">{n.time}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100">
          <button onClick={markAllRead} className="w-full text-center text-xs font-bold text-primary hover:underline">
            Mark all as read
          </button>
        </div>
      </div>
    </>
  );
};
