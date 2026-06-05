'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Settings, Plus, Users } from 'lucide-react';
import type { EnrichedGuild } from '@/app/api/guilds/route';
import { BOT_INVITE } from '@/lib/discord';

interface ServerCardProps {
  guild: EnrichedGuild;
  index: number;
}

export default function ServerCard({ guild, index }: ServerCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      whileHover={{ y: -3 }}
      className="group relative"
    >
      {/* Hover glow */}
      <div className="absolute inset-0 rounded-2xl bg-[#5865f2]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl" />

      <div className="relative bg-[#1e1f22] border border-[#2b2d31] group-hover:border-[#35373c] rounded-2xl p-5 transition-all duration-300 group-hover:shadow-[0_0_30px_rgba(88,101,242,0.1)]">
        <div className="flex items-center gap-4">
          {/* Server icon */}
          <div className="relative shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={guild.iconUrl}
              alt={guild.name}
              className="w-14 h-14 rounded-2xl object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  const fallback = document.createElement('div');
                  fallback.className =
                    'w-14 h-14 rounded-2xl bg-[#5865f2] flex items-center justify-center text-white font-bold text-xl';
                  fallback.textContent = guild.name[0].toUpperCase();
                  parent.appendChild(fallback);
                }
              }}
            />
            {/* Bot status indicator */}
            <div
              className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#1e1f22] ${
                guild.botPresent ? 'bg-[#3ba55d]' : 'bg-[#6d6f78]'
              }`}
              title={guild.botPresent ? 'Bot is in this server' : 'Bot not in server'}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-[#f2f3f5] font-semibold truncate group-hover:text-white transition-colors">
              {guild.name}
            </h3>
            {guild.approximate_member_count != null && (
              <div className="flex items-center gap-1 mt-0.5">
                <Users className="w-3 h-3 text-[#6d6f78]" />
                <span className="text-xs text-[#6d6f78]">
                  {guild.approximate_member_count.toLocaleString()} members
                </span>
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-1.5">
              {guild.botPresent ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#3ba55d] bg-[#3ba55d]/15 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3ba55d]" />
                  Protected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#6d6f78] bg-[#35373c] px-2 py-0.5 rounded-full">
                  Bot not added
                </span>
              )}
              {guild.owner && (
                <span className="text-[10px] font-medium text-[#faa81a] bg-[#faa81a]/15 px-2 py-0.5 rounded-full">
                  Owner
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action button */}
        <div className="mt-4">
          {guild.botPresent ? (
            <Link
              href={`/dashboard/${guild.id}`}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm font-semibold rounded-xl transition-all duration-200 group-hover:shadow-blurple"
            >
              <Settings className="w-4 h-4" />
              Manage Server
            </Link>
          ) : (
            <a
              href={`${BOT_INVITE}&guild_id=${guild.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-[#2b2d31] hover:bg-[#35373c] text-[#b5bac1] hover:text-[#f2f3f5] text-sm font-semibold rounded-xl transition-all duration-200 border border-[#35373c]"
            >
              <Plus className="w-4 h-4" />
              Add Bot
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}
