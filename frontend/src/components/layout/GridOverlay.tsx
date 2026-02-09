export function GridOverlay() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-cyber-dark via-cyber-navy to-cyber-dark" />

      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(to right, #00F5FF 1px, transparent 1px),
            linear-gradient(to bottom, #00F5FF 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-neon-cyan/5 rounded-full blur-3xl" />

      {/* Secondary glow */}
      <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-neon-magenta/5 rounded-full blur-3xl" />
    </div>
  );
}
