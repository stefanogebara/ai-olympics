export function GridOverlay() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      {/* Base vertical gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-cyber-dark via-cyber-navy to-cyber-dark" />

      {/* Perspective grid — radially masked so it fades toward the edges for depth */}
      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(0,245,255,0.6) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0,245,255,0.6) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 80%)',
        }}
      />

      {/* Ambient brand glows */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[900px] bg-neon-cyan/10 rounded-full blur-[130px]" />
      <div className="absolute top-1/3 -right-40 w-[560px] h-[560px] bg-neon-magenta/[0.07] rounded-full blur-[120px]" />
      <div className="absolute bottom-0 -left-40 w-[560px] h-[560px] bg-neon-blue/[0.06] rounded-full blur-[120px]" />

      {/* Top-down vignette to seat content and add contrast */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_100%_at_50%_-10%,transparent_40%,rgba(0,0,0,0.55)_100%)]" />
    </div>
  );
}
