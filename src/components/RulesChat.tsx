import { useState, useEffect, useRef, createContext, useContext } from 'react';
import type { FormEvent, ReactNode } from 'react';
import Markdown from 'react-markdown';
import { AiRulesIcon } from './Icons';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface RulesChatContext {
  isOpen: boolean;
  toggle: () => void;
}

const ChatContext = createContext<RulesChatContext>({ isOpen: false, toggle: () => {} });

export function RulesChatToggle() {
  const { isOpen, toggle } = useContext(ChatContext);
  return (
    <button className="rules-chat-toggle" onClick={toggle}>
      <AiRulesIcon size={16} />
      {isOpen ? 'Close AI Chat' : 'AI Rules Assistant'}
    </button>
  );
}

export function RulesChatPanel({ slug, gameName }: { slug: string; gameName: string }) {
  const { isOpen } = useContext(ChatContext);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi! Ask me anything about the rules for ' + gameName + '.' },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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

  if (!isOpen) return null;

  return (
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
  );
}

export default function RulesChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <ChatContext.Provider value={{ isOpen, toggle: () => setIsOpen((o) => !o) }}>
      {children}
    </ChatContext.Provider>
  );
}
