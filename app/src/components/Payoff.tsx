import { useEffect, useState } from 'react';

export function Payoff({ label, stats, reduced }: { label: string; stats: { value: number; label: string }[]; reduced: boolean }) {
  const [step, setStep] = useState(reduced ? 20 : 0);
  useEffect(() => {
    if (step >= 20) return;
    const t = setTimeout(() => setStep(s => s + 1), 40);
    return () => clearTimeout(t);
  }, [step]);

  return (
    <div className="payoff" data-focus-target="payoff">
      <div className="payoff-label">{label}</div>
      {stats.map(s => (
        <div className="stat" key={s.label}>
          <b>{Math.round((s.value * step) / 20)}</b>
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  );
}
