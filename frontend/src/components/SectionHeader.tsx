interface SectionHeaderProps {
  number: string;
  scene: string;
  title: React.ReactNode;
  description: string;
}

export function SectionHeader({
  number,
  scene,
  title,
  description,
}: SectionHeaderProps) {
  return (
    <div className="grid gap-14" style={{ gridTemplateColumns: "280px 1fr" }}>
      {/* Left column — big italic number */}
      <div
        className="font-serif italic text-terra leading-[0.8] tracking-tight"
        style={{ fontSize: "80px" }}
      >
        {number}
      </div>

      {/* Right column — scene + title + description */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-terra mb-2.5">
          {scene}
        </p>
        <h1
          className="font-serif text-ink leading-[1.05] tracking-tight mb-3.5"
          style={{ fontSize: "44px" }}
        >
          {title}
        </h1>
        <p className="text-ink-soft text-base max-w-[580px]">{description}</p>
      </div>
    </div>
  );
}
