import React, { useState } from 'react';
import { Megaphone, Send, Clock, Users, CheckCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../../api/admin';
import { formatTimeAgo } from '../../utils/format';

interface SentAnnouncement {
  id: number;
  title: string;
  message: string;
  sent_at: string;
}

const MAX_CHARS = 500;

export default function Announcements() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sentList, setSentList] = useState<SentAnnouncement[]>([
    {
      id: 1,
      title: 'Canteen A Maintenance',
      message: 'Canteen A will be closed from 2 PM to 4 PM today for routine maintenance. Please use Canteen B or C.',
      sent_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 2,
      title: 'Stationery Festival – 20% Off',
      message: 'All printing services are 20% off this week. Use code PRINT20 at checkout.',
      sent_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    },
  ]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (!message.trim()) {
      toast.error('Please enter a message');
      return;
    }

    setSending(true);
    try {
      await adminApi.sendAnnouncement(title.trim(), message.trim());
      const newAnn: SentAnnouncement = {
        id: Date.now(),
        title: title.trim(),
        message: message.trim(),
        sent_at: new Date().toISOString(),
      };
      setSentList(prev => [newAnn, ...prev]);
      setTitle('');
      setMessage('');
      toast.success('📢 Announcement sent to all users');
    } catch { toast.error('Failed to send announcement'); }
    finally { setSending(false); }
  };

  const remaining = MAX_CHARS - message.length;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Compose */}
      <div className="tnt-card">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-[#E85D24]/20 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-[#E85D24]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#111827]">Broadcast Announcement</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <Users className="w-3.5 h-3.5 text-[#6B7280]" />
              <span className="text-xs text-[#6B7280]">
                Will be sent as push notification to ALL mobile app users
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="tnt-label">Announcement Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Canteen A Closed Tomorrow"
              className="tnt-input"
              maxLength={100}
              required
            />
          </div>

          <div>
            <label className="tnt-label">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value.slice(0, MAX_CHARS))}
              placeholder="Type your announcement message here..."
              rows={5}
              className="tnt-input resize-none"
              required
            />
            <div className="flex items-center justify-between mt-1.5">
              <div className="flex items-center gap-1.5">
                {remaining < 50 ? (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5 text-green-400/50" />
                )}
                <span className={`text-xs ${remaining < 50 ? 'text-amber-400' : 'text-[#6B7280]'}`}>
                  {remaining} characters remaining
                </span>
              </div>
              <div className="w-24 h-1 bg-[#E5E7EB] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    remaining < 50 ? 'bg-amber-400' : remaining < 150 ? 'bg-[#E85D24]' : 'bg-green-400'
                  }`}
                  style={{ width: `${((MAX_CHARS - remaining) / MAX_CHARS) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex gap-2 text-xs text-amber-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              This will immediately send a push notification to <strong>all users</strong> on the TNT mobile app.
              Use this for important campus-wide updates only.
            </span>
          </div>

          <button
            type="submit"
            disabled={sending || !title.trim() || !message.trim()}
            className="btn-primary"
          >
            {sending ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send to All Users
              </>
            )}
          </button>
        </form>
      </div>

      {/* Recent Announcements */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-[#6B7280]" />
          <h3 className="text-sm font-semibold text-[#111827]">Recently Sent</h3>
          <span className="badge bg-[#F3F5F9] text-[#6B7280] border-[#E5E7EB]">{sentList.length}</span>
        </div>

        <div className="space-y-3">
          {sentList.length === 0 ? (
            <div className="tnt-card text-center py-10 text-[#6B7280] text-sm">
              No announcements sent yet
            </div>
          ) : (
            sentList.map(ann => (
              <div key={ann.id} className="tnt-card transition-all">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#E85D24]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Megaphone className="w-4 h-4 text-[#E85D24]" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold text-[#111827]">{ann.title}</h4>
                      <span className="text-xs text-[#6B7280] shrink-0 font-mono">
                        {formatTimeAgo(ann.sent_at)}
                      </span>
                    </div>
                    <p className="text-xs text-[#4B5563] mt-1 leading-relaxed">{ann.message}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
