import { useState, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { Send, AlertCircle, RefreshCw } from 'lucide-react';
import AddressDisplay from './AddressDisplay.jsx';
import Notice from './Notice.jsx';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

function formatRelativeTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function JobChat({ jobId, clientAddress, assignedFreelancer, isClientMode, bidders = [] }) {
  const { address } = useAccount();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [selectedBidder, setSelectedBidder] = useState('');
  const messagesEndRef = useRef(null);

  // Determine other address based on job state and selected bidder
  const hasAccepted = assignedFreelancer && assignedFreelancer !== '0x0000000000000000000000000000000000000000';
  const otherParty = isClientMode
    ? (hasAccepted ? assignedFreelancer : selectedBidder)
    : clientAddress;

  // Active bidders list (excluding withdrawn ones)
  const activeBidders = bidders.filter(b => !b.withdrawn);

  // Set initial selected bidder if client-mode and open job
  useEffect(() => {
    if (isClientMode && !hasAccepted && activeBidders.length > 0 && !selectedBidder) {
      setSelectedBidder(activeBidders[0].freelancer);
    }
  }, [isClientMode, hasAccepted, activeBidders, selectedBidder]);

  const fetchMessages = async (silent = false) => {
    if (!address || !otherParty) {
      setLoading(false);
      return;
    }

    try {
      if (!silent) setLoading(true);
      const url = `${BACKEND_URL}/jobs/${jobId}/messages?viewerAddress=${address}&otherAddress=${otherParty}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      setMessages(data);
      
      // Update last viewed timestamp in local storage
      const storageKey = `escrowmind_last_viewed_${jobId}_${address.toLowerCase()}`;
      localStorage.setItem(storageKey, Date.now().toString());
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoading(false);
    }
  };

  // Poll for new messages every 6 seconds
  useEffect(() => {
    fetchMessages();
    const interval = setInterval(() => {
      fetchMessages(true);
    }, 6000);
    return () => clearInterval(interval);
  }, [jobId, address, otherParty]);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || sending || !otherParty) return;

    const messageContent = input;
    setSending(true);
    setSendError(null);
    setInput('');

    try {
      const url = `${BACKEND_URL}/jobs/${jobId}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderAddress: address,
          recipientAddress: otherParty,
          content: messageContent
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        let parsedErr;
        try { parsedErr = JSON.parse(errText).error; } catch { parsedErr = errText; }
        throw new Error(parsedErr || 'Failed to send message');
      }

      await fetchMessages(true);
    } catch (err) {
      console.error('Failed to send message:', err);
      setSendError({ content: messageContent, error: err.message });
    } finally {
      setSending(false);
    }
  };

  const handleRetry = () => {
    if (!sendError) return;
    setInput(sendError.content);
    setSendError(null);
  };

  if (!address) {
    return (
      <Notice variant="info" label="Wallet connection required">
        Please connect your wallet to access messaging.
      </Notice>
    );
  }

  // Render client picker if job is Open and has multiple bidders
  const showBidderPicker = isClientMode && !hasAccepted;

  return (
    <div className="card w-full flex flex-col" style={{ minHeight: '400px', maxHeight: '600px', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header Info */}
      <div className="flex justify-between items-center pb-4 mb-4" style={{ borderBottom: '1px solid var(--border-muted)' }}>
        <div className="flex flex-col gap-1 w-full">
          <span className="text-secondary text-xs uppercase font-semibold tracking-wider">Conversation</span>
          {showBidderPicker ? (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-sm font-500">Chatting with bidder:</span>
              {activeBidders.length > 0 ? (
                <select
                  value={selectedBidder}
                  onChange={(e) => {
                    setSelectedBidder(e.target.value);
                    setMessages([]);
                  }}
                  className="form-input text-sm py-1 px-3"
                  style={{ width: 'auto', minWidth: '180px' }}
                >
                  {activeBidders.map(b => (
                    <option key={b.freelancer} value={b.freelancer}>
                      {b.freelancer.slice(0, 6)}...{b.freelancer.slice(-4)} ({Number(b.amount) / 1e18} AVAX)
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-muted text-sm italic">No bidders yet</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              {otherParty ? (
                <AddressDisplay address={otherParty} label={isClientMode ? 'Freelancer:' : 'Client:'} />
              ) : (
                <span className="text-muted text-sm italic">No active conversation</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Messages Display Window */}
      <div 
        className="flex-grow overflow-y-auto mb-4 pr-1" 
        style={{ flex: 1, minHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}
      >
        {loading ? (
          <div className="flex justify-center items-center h-full my-auto text-teal py-12">
            <RefreshCw size={24} className="animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full my-auto text-center py-12">
            <span className="text-muted text-sm">No messages yet — start the conversation</span>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderAddress.toLowerCase() === address.toLowerCase();
            return (
              <div 
                key={msg.id} 
                className={`flex flex-col max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
                style={{ alignSelf: isMe ? 'flex-end' : 'flex-start' }}
              >
                {/* Shortened Sender Address */}
                <span className="text-[10px] text-muted mb-1 font-mono">
                  {isMe ? 'You' : `${msg.senderAddress.slice(0, 6)}...${msg.senderAddress.slice(-4)}`}
                </span>

                {/* Content Bubble */}
                <div 
                  className="rounded-lg p-3 text-sm"
                  style={{
                    background: isMe ? 'var(--accent-primary-soft)' : 'var(--bg-subtle)',
                    border: isMe ? '1px solid var(--border-accent)' : '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                    wordBreak: 'break-word',
                    borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px'
                  }}
                >
                  {msg.content}
                </div>

                {/* Relative timestamp */}
                <span className="text-[9px] text-muted mt-1">
                  {formatRelativeTime(msg.createdAt)}
                </span>
              </div>
            );
          })
        )}

        {sending && (
          <div className="flex flex-col max-w-[80%] self-end items-end" style={{ alignSelf: 'flex-end' }}>
            <span className="text-[10px] text-muted mb-1 font-mono">You</span>
            <div 
              className="rounded-lg p-3 text-sm italic text-muted"
              style={{
                background: 'var(--accent-primary-soft)',
                border: '1px solid var(--border-accent)',
                opacity: 0.7,
                borderRadius: '12px 12px 2px 12px'
              }}
            >
              Sending...
            </div>
          </div>
        )}

        {sendError && (
          <div className="w-full flex justify-end">
            <div className="flex items-center gap-2 bg-red-dim border-red p-2 rounded-md text-xs text-red max-w-[85%]" style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171' }}>
              <AlertCircle size={14} className="shrink-0" />
              <span>Failed to send: {sendError.error}</span>
              <button 
                type="button" 
                onClick={handleRetry}
                className="underline hover:text-white ml-1 font-semibold"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input controls */}
      {otherParty ? (
        <form onSubmit={handleSend} className="flex gap-2 items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            maxLength={2000}
            className="form-input flex-grow"
            style={{ flex: 1 }}
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="btn btn-primary"
            style={{ padding: '8px 16px', borderRadius: 'var(--r-md)', minHeight: '38px' }}
            aria-label="Send message"
          >
            <Send size={15} />
          </button>
        </form>
      ) : (
        <Notice variant="info" label="Messaging disabled">
          {!isClientMode && activeBidders.length === 0 ? (
            <span>Submit a proposal to open messaging with the client.</span>
          ) : (
            <span>Messaging opens once a bid is accepted or active conversation is selected.</span>
          )}
        </Notice>
      )}
    </div>
  );
}
