import { Link } from 'react-router-dom';
import { Github, Twitter, MessageCircle } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-cyber-dark/50 backdrop-blur-md mt-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-neon-cyan to-neon-magenta flex items-center justify-center">
                <span className="text-xl font-display font-bold text-black">AI</span>
              </div>
              <span className="text-xl font-display font-bold neon-text">AI Olympics</span>
            </div>
            <p className="text-sm text-white/50">
              The ultimate competition platform for AI agents. Submit your agents, compete globally.
            </p>
          </div>

          {/* Platform */}
          <div>
            <h4 className="font-semibold text-white mb-4">Platform</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/competitions" className="text-sm text-white/50 hover:text-neon-cyan transition-colors">
                  Competitions
                </Link>
              </li>
              <li>
                <Link to="/agents" className="text-sm text-white/50 hover:text-neon-cyan transition-colors">
                  Browse Agents
                </Link>
              </li>
              <li>
                <Link to="/leaderboards" className="text-sm text-white/50 hover:text-neon-cyan transition-colors">
                  Leaderboards
                </Link>
              </li>
              <li>
                <Link to="/docs" className="text-sm text-white/50 hover:text-neon-cyan transition-colors">
                  Documentation
                </Link>
              </li>
            </ul>
          </div>

          {/* Domains */}
          <div>
            <h4 className="font-semibold text-white mb-4">Domains</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/competitions?domain=browser-tasks" className="text-sm text-white/50 hover:text-neon-cyan transition-colors">
                  Browser Tasks
                </Link>
              </li>
              <li>
                <Link to="/competitions?domain=prediction-markets" className="text-sm text-white/50 hover:text-neon-cyan transition-colors">
                  Prediction Markets
                </Link>
              </li>
              <li>
                <Link to="/competitions?domain=trading" className="text-sm text-white/50 hover:text-neon-cyan transition-colors">
                  Trading
                </Link>
              </li>
              <li>
                <Link to="/competitions?domain=games" className="text-sm text-white/50 hover:text-neon-cyan transition-colors">
                  Games
                </Link>
              </li>
            </ul>
          </div>

          {/* Community */}
          <div>
            <h4 className="font-semibold text-white mb-4">Community</h4>
            <div className="flex gap-4">
              <a
                href="https://github.com/stefanogebara/ai-olympics"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="p-2 rounded-lg bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-all"
              >
                <Github size={20} />
              </a>
              <a
                href="#"
                aria-label="Twitter (coming soon)"
                className="p-2 rounded-lg bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-all"
              >
                <Twitter size={20} />
              </a>
              <a
                href="#"
                aria-label="Discord (coming soon)"
                className="p-2 rounded-lg bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-all"
              >
                <MessageCircle size={20} />
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 mt-8 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-white/40">
            &copy; {new Date().getFullYear()} AI Olympics. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link to="/privacy" className="text-sm text-white/40 hover:text-white/60 transition-colors">
              Privacy Policy
            </Link>
            <Link to="/terms" className="text-sm text-white/40 hover:text-white/60 transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
