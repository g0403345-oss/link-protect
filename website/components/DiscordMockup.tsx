'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Trash2 } from 'lucide-react';

interface Message {
  id: number;
  type: 'user' | 'bot' | 'system';
  author?: string;
  avatar?: string;
  content?: string;
  embed?: {
    color: string;
    title: string;
    description: string;
    icon: string;
  };
  deleted?: boolean;
}

const ANIMATION_STEPS = [
  { delay: 600, action: 'show_user_msg' },
  { delay: 1800, action: 'show_typing' },
  { delay: 2600, action: 'delete_user_msg' },
  { delay: 3000, action: 'show_bot_response' },
  { delay: 7500, action: 'reset' },
];

export default function DiscordMockup() {
  const [phase, setPhase] = useState<
    'idle' | 'user_msg' | 'typing' | 'deleted' | 'bot_response'
  >('idle');

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    function runCycle() {
      timers.forEach(clearTimeout);
      timers.length = 0;

      setPhase('idle');

      timers.push(setTimeout(() => setPhase('user_msg'), ANIMATION_STEPS[0].delay));
      timers.push(setTimeout(() => setPhase('typing'), ANIMATION_STEPS[1].delay));
      timers.push(setTimeout(() => setPhase('deleted'), ANIMATION_STEPS[2].delay));
      timers.push(setTimeout(() => setPhase('bot_response'), ANIMATION_STEPS[3].delay));
      timers.push(setTimeout(runCycle, ANIMATION_STEPS[4].delay));
    }

    runCycle();
    return () => timers.forEach(clearTimeout);
  }, []);

  const showUserMsg = phase === 'user_msg' || phase === 'typing' || phase === 'deleted' || phase === 'bot_response';
  const showTyping = phase === 'typing';
  const isDeleted = phase === 'deleted' || phase === 'bot_response';
  const showBotResponse = phase === 'bot_response';

  return (
    <div className="relative w-full max-w-sm mx-auto">
      {/* Outer glow */}
      <div className="absolute inset-0 bg-[#5865f2]/20 rounded-2xl blur-2xl scale-110" />

      {/* Discord window chrome */}
      <div className="relative bg-[#1e1f22] rounded-2xl overflow-hidden shadow-2xl border border-[#2b2d31]">
        {/* Title bar */}
        <div className="bg-[#111214] px-4 py-2.5 flex items-center gap-2 border-b border-[#2b2d31]">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ed4245]" />
            <div className="w-3 h-3 rounded-full bg-[#faa81a]" />
            <div className="w-3 h-3 rounded-full bg-[#3ba55d]" />
          </div>
          <div className="flex-1 text-center">
            <span className="text-xs text-[#6d6f78] font-medium"># general</span>
          </div>
        </div>

        {/* Server/channel sidebar snippet */}
        <div className="flex">
          {/* Channel list */}
          <div className="w-36 bg-[#2b2d31] py-3 shrink-0">
            <div className="px-3 mb-2">
              <span className="text-[10px] font-bold text-[#6d6f78] uppercase tracking-wider">Text Channels</span>
            </div>
            {['general', 'links', 'bot-commands'].map((ch, i) => (
              <div
                key={ch}
                className={`flex items-center gap-1.5 px-3 py-1 mx-1 rounded text-xs cursor-pointer ${
                  i === 0
                    ? 'bg-[#35373c] text-[#f2f3f5]'
                    : 'text-[#6d6f78] hover:text-[#b5bac1]'
                }`}
              >
                <span className="text-[#6d6f78]">#</span>
                {ch}
              </div>
            ))}
          </div>

          {/* Chat area */}
          <div className="flex-1 min-h-[280px] p-3 flex flex-col justify-end gap-1 overflow-hidden">
            {/* Existing messages (static) */}
            <StaticMessage
              author="Alex"
              avatarColor="#3ba55d"
              content="Anyone know a good tutorial for React hooks?"
              time="Today at 3:41 PM"
            />
            <StaticMessage
              author="Morgan"
              avatarColor="#faa81a"
              content="Check out the official docs, they're great!"
              time="Today at 3:42 PM"
            />

            {/* Animated user message */}
            <AnimatePresence>
              {showUserMsg && (
                <motion.div
                  key="user-msg"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex items-start gap-2 group relative ${isDeleted ? 'opacity-40' : ''}`}
                >
                  <div className="w-7 h-7 rounded-full bg-[#ed4245] shrink-0 flex items-center justify-center text-[10px] font-bold text-white mt-0.5">
                    J
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 mb-0.5">
                      <span className="text-xs font-semibold text-[#f2f3f5]">Jordan</span>
                      <span className="text-[10px] text-[#6d6f78]">Today at 3:43 PM</span>
                    </div>
                    <p className="text-xs text-[#b5bac1] break-all">
                      https://youtube.com/watch?v=dQw4w9WgXcQ
                    </p>
                    {isDeleted && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Trash2 className="w-2.5 h-2.5 text-[#ed4245]" />
                        <span className="text-[10px] text-[#ed4245]">Message deleted</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Typing indicator */}
            <AnimatePresence>
              {showTyping && (
                <motion.div
                  key="typing"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-2 pl-9"
                >
                  <div className="flex gap-1 items-center bg-[#2b2d31] px-3 py-1.5 rounded-xl">
                    <TypingDot delay={0} />
                    <TypingDot delay={0.2} />
                    <TypingDot delay={0.4} />
                    <span className="text-[10px] text-[#6d6f78] ml-1">LinkProtect is typing...</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bot response */}
            <AnimatePresence>
              {showBotResponse && (
                <motion.div
                  key="bot-response"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                  className="flex items-start gap-2"
                >
                  <div className="w-7 h-7 rounded-full bg-[#5865f2] shrink-0 flex items-center justify-center mt-0.5 shadow-blurple">
                    <Shield className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 mb-0.5">
                      <span className="text-xs font-semibold text-[#f2f3f5]">LinkProtect</span>
                      <span className="text-[10px] text-[#5865f2] font-medium bg-[#5865f2]/20 px-1 rounded">BOT</span>
                      <span className="text-[10px] text-[#6d6f78]">Today at 3:43 PM</span>
                    </div>
                    {/* Embed */}
                    <div className="border-l-2 border-[#ed4245] bg-[#2b2d31] rounded-r-lg p-2.5 mt-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="w-3 h-3 rounded-full bg-[#ed4245] flex items-center justify-center">
                          <Shield className="w-1.5 h-1.5 text-white" />
                        </div>
                        <span className="text-[10px] font-bold text-[#ed4245]">Link Blocked</span>
                      </div>
                      <p className="text-[10px] text-[#b5bac1]">
                        YouTube links are not allowed in this server.
                      </p>
                      <p className="text-[10px] text-[#6d6f78] mt-1">
                        Warning <span className="text-[#faa81a] font-bold">1</span>/3 — next: kick
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Input bar */}
        <div className="bg-[#1e1f22] px-3 pb-3">
          <div className="bg-[#35373c] rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="text-[11px] text-[#6d6f78] flex-1">Message #general</span>
            <div className="flex gap-2">
              {['😀', '🎁', '📎'].map((emoji) => (
                <span key={emoji} className="text-[#6d6f78] text-xs">{emoji}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StaticMessage({
  author,
  avatarColor,
  content,
  time,
}: {
  author: string;
  avatarColor: string;
  content: string;
  time: string;
}) {
  return (
    <div className="flex items-start gap-2 group">
      <div
        className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white mt-0.5"
        style={{ backgroundColor: avatarColor }}
      >
        {author[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 mb-0.5">
          <span className="text-xs font-semibold text-[#f2f3f5]">{author}</span>
          <span className="text-[10px] text-[#6d6f78]">{time}</span>
        </div>
        <p className="text-xs text-[#b5bac1] break-words">{content}</p>
      </div>
    </div>
  );
}

function TypingDot({ delay }: { delay: number }) {
  return (
    <motion.div
      className="w-1.5 h-1.5 rounded-full bg-[#6d6f78]"
      animate={{ y: [0, -3, 0] }}
      transition={{
        duration: 0.6,
        repeat: Infinity,
        delay,
        ease: 'easeInOut',
      }}
    />
  );
}
