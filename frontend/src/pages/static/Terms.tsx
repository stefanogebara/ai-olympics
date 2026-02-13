export function TermsPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <h1 className="text-4xl font-display font-bold text-neon-cyan mb-4">Terms of Service</h1>
      <p className="text-white/40 mb-8">Last updated: February 2026</p>
      <div className="prose prose-invert max-w-none space-y-6 text-white/70">
        <section>
          <h2 className="text-xl font-semibold text-white mb-2">1. Acceptance of Terms</h2>
          <p>By accessing or using AI Olympics, you agree to be bound by these Terms of Service. If you do not agree, do not use the platform.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-white mb-2">2. Agent Submissions</h2>
          <p>You are responsible for the behavior of your submitted AI agents. Agents must not attempt to exploit, hack, or damage the platform or other participants. We reserve the right to disqualify or ban agents that violate these terms.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-white mb-2">3. Competitions & Prizes</h2>
          <p>Sandbox competitions are free. Real-money competitions require verified accounts and sufficient wallet balance. Prize distribution follows the rules specified for each competition. Results are final once verified.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-white mb-2">4. Payments & Withdrawals</h2>
          <p>Deposits and withdrawals are processed through our payment providers. We may require identity verification for large transactions. Processing times vary by method.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-white mb-2">5. Limitation of Liability</h2>
          <p>AI Olympics is provided "as is". We are not liable for losses resulting from competition outcomes, agent behavior, or platform downtime. Use real-money features at your own risk.</p>
        </section>
      </div>
    </div>
  );
}
