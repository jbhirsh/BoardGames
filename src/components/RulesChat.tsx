import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import Markdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface RulesChatProps {
  slug: string;
  gameName: string;
}

export default function RulesChat({ slug, gameName }: RulesChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi! Ask me anything about the rules for ' + gameName + '.' },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const userMsg = input.trim();
    if (!userMsg) return;

    const userMessage: Message = { role: 'user', content: userMsg };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Build history for API: exclude the initial greeting, map roles, take last 6
    const history = messages
      .slice(1)
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        content: msg.content,
      }))
      .slice(-6);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, message: userMsg, history }),
      });

      if (!response.ok) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' },
        ]);
        setIsLoading(false);
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // Add empty assistant message to stream into
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = { ...last, content: last.content + text };
          return updated;
        });
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' },
      ]);
    }

    setIsLoading(false);
  }

  return (
    <div className="rules-chat">
      <button className="rules-chat-toggle" onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? 'Close Chat' : '\uD83D\uDCAC Ask about these rules'}
      </button>
      {isOpen && (
        <div className="rules-chat-panel">
          <div className="rules-chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`rules-chat-msg rules-chat-msg-${msg.role}`}>
                <div className="rules-chat-bubble">
                  {msg.role === 'assistant' ? <Markdown>{msg.content}</Markdown> : msg.content}
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="rules-chat-msg rules-chat-msg-assistant">
                <div className="rules-chat-bubble rules-chat-thinking">Thinking...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <form className="rules-chat-input" onSubmit={handleSend}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a rules question..."
              disabled={isLoading}
            />
            <button type="submit" disabled={!input.trim() || isLoading}>
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
