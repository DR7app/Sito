import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

// Function to parse markdown links and convert to React elements
const parseMessageContent = (content: string, onLinkClick?: () => void) => {
  const parts: (string | JSX.Element)[] = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;
  let hasLinks = false;

  while ((match = linkRegex.exec(content)) !== null) {
    hasLinks = true;
    // Add text before the link
    if (match.index > lastIndex) {
      const text = content.substring(lastIndex, match.index);
      parts.push(<React.Fragment key={`text-${lastIndex}`}>{text}</React.Fragment>);
    }

    const linkText = match[1];
    const linkUrl = match[2];
    const isInternal = linkUrl.startsWith('/') || linkUrl.includes('dr7.app');

    // Create link element
    if (isInternal) {
      const path = linkUrl
        .replace('https://dr7.app', '').replace('http://dr7.app', '');
      parts.push(
        <Link
          key={`link-${match.index}`}
          to={path}
          onClick={onLinkClick}
          className="text-blue-400 hover:text-blue-300 underline font-semibold inline-block"
        >
          {linkText}
        </Link>
      );
    } else {
      parts.push(
        <a
          key={`link-${match.index}`}
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline font-semibold inline-block"
        >
          {linkText}
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    const text = content.substring(lastIndex);
    parts.push(<React.Fragment key={`text-${lastIndex}`}>{text}</React.Fragment>);
  }

  // If no links were found, return the original content
  return hasLinks ? <>{parts}</> : content;
};

interface DR7AIChatProps {
  isOpen: boolean;
  onClose: () => void;
}

const DR7AIChat: React.FC<DR7AIChatProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // Welcome message
      const welcomeMessage: Message = {
        id: '1',
        content: t({ it: "Benvenuto in DR7.\nCome posso assisterLa?\n\n⚠️ _Questo assistente è un'intelligenza artificiale. I prezzi e le informazioni fornite sono puramente indicativi e non vincolanti. Solo il prezzo mostrato nella pagina di prenotazione fa fede._", en: "Welcome to DR7.\nHow may I assist you?\n\n⚠️ _This assistant is an artificial intelligence. Prices and information provided are indicative only and not binding. Only the price shown on the booking page is authoritative._" }),
        isUser: false,
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Build conversation history for context
      const conversationHistory = messages.map(msg => ({
        role: msg.isUser ? "user" as const : "assistant" as const,
        content: msg.content
      }));

      const response = await fetch('/.netlify/functions/dr7-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          conversationHistory
        })
      });

      if (!response.ok) throw new Error(t('AI_response_failed'));

      const data = await response.json();

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: data.response,
        isUser: false,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: t({ it: "Mi dispiace, si è verificato un errore. Riprova tra poco.", en: "Sorry, something went wrong. Please try again shortly." }),
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickQuestions = [
    t({ it: "Quali auto esotiche avete?", en: "Which exotic cars do you have?" }),
    t({ it: "Info sui jet privati", en: "Private jet information" }),
    t({ it: "Cos'è DR7 Token?", en: "What is DR7 Token?" }),
    t({ it: "Prezzi membership", en: "Membership pricing" })
  ];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-black border border-gray-800 w-full md:w-[500px] h-[600px] md:h-[700px] md:rounded-2xl flex flex-col shadow-2xl"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-white to-gray-300 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-black bg-black flex items-center justify-center">
                <img
                  src="/DR7logo.png"
                  alt="DR7"
                  className="w-8 h-8 object-contain"
                />
              </div>
              <div>
                <h3 className="text-black font-bold text-lg">DR7 AI Assistant</h3>
                <p className="text-black/70 text-xs">{t({ it: "Sempre al tuo servizio", en: "Always at your service" })}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-black hover:text-gray-700 transition-colors p-2 hover:bg-black/10"
            >
              
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-black">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                    message.isUser
                      ? 'bg-white text-black'
                      : 'bg-gray-900 text-white border border-gray-800'
                  }`}
                >
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    {parseMessageContent(message.content, onClose)}
                  </div>
                  <p className={`text-xs mt-1 ${message.isUser ? 'text-black/60' : 'text-gray-500'}`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </motion.div>
            ))}

            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div className="bg-gray-900 border border-gray-800 px-4 py-3 rounded-2xl">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Questions */}
          {messages.length <= 1 && (
            <div className="px-6 py-3 border-t border-gray-800">
              <div className="flex flex-wrap gap-2">
                {quickQuestions.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => setInput(question)}
                    className="text-xs bg-gray-900 text-white px-3 py-2 border border-gray-800 hover:bg-gray-800 transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="px-6 py-4 border-t border-gray-800">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={t({ it: "Scrivi un messaggio...", en: "Type a message..." })}
                className="flex-1 bg-gray-900 border border-gray-800 text-white px-4 py-3 rounded-full focus:outline-none focus:border-white transition-colors placeholder-gray-500"
                disabled={isLoading}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="bg-white text-black p-3 hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// Floating Chat Button Component
export const DR7AIFloatingButton: React.FC<{ avatarUrl?: string }> = ({ avatarUrl }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      // Calculate distance from bottom - visible until last 150px before footer
      const distanceFromBottom = documentHeight - (currentScrollY + windowHeight);

      // Hide when very close to footer (within 150px of absolute bottom)
      if (distanceFromBottom < 150) {
        setIsVisible(false);
      }
      // Show button when at top of page
      else if (currentScrollY < 100) {
        setIsVisible(true);
      }
      // Show button when scrolling up (except near footer)
      else if (currentScrollY < lastScrollY) {
        setIsVisible(true);
      }
      // Hide button when scrolling down (but not if near footer already)
      else if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  return (
    <>
      <motion.button
        initial={{ scale: 0 }}
        animate={{
          scale: isVisible ? 1 : 0,
          opacity: isVisible ? 1 : 0
        }}
        whileHover={{ scale: isVisible ? 1.1 : 0 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 shadow-2xl hover:shadow-white/20 transition-all border-2 border-white overflow-hidden"
        title={t({ it: "Chatta con DR7 AI", en: "Chat with DR7 AI" })}
        style={{ pointerEvents: isVisible ? 'auto' : 'none' }}
      >
        <img
          src={avatarUrl || '/Valerio.jpg'}
          alt={t({ it: "Chatta con Valerio", en: "Chat with Valerio" })}
          className="w-full h-full object-cover object-top"
        />
      </motion.button>

      <DR7AIChat isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};

export default DR7AIChat;
