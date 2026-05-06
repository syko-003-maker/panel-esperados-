'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

type Message = {
  id: string;
  authorTag: string;
  content: string;
  createdAt: string;
};

export default function TicketMessages({ ticketId }: { ticketId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchMessages() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/messages`);
      const data = await res.json();
      setMessages(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMessages();
    // 25s (7s avant) : ~3.5x moins de req. Les nouveaux messages remontent en
    // 25s max, suffisant pour un ticket non temps-réel.
    const interval = setInterval(fetchMessages, 25_000);
    return () => clearInterval(interval);
  }, [ticketId]);

  return (
    <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">🧵 Messages Discord</h3>
        <button
          onClick={fetchMessages}
          disabled={loading}
          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? 'Resync...' : 'Resync'}
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto space-y-2 border border-gray-300 rounded p-3 bg-white">
        {messages.length === 0 ? (
          <p className="text-gray-500 text-sm">Aucun message encore.</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="text-sm border-l-2 border-gray-300 pl-2 py-1">
              <span className="font-semibold text-gray-700">{msg.authorTag}</span>
              <span className="text-gray-500 text-xs ml-2">
                {format(new Date(msg.createdAt), 'd MMM yyyy HH:mm', { locale: fr })}
              </span>
              <p className="text-gray-800 mt-1">{msg.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
