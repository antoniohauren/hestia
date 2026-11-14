import { paymentMethodLabels, paymentMethods, type PaymentMethod } from '@hestia/types';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export const ErrorText = ({ error }: { error: unknown }) =>
  error ? <p className="error">{error instanceof Error ? error.message : String(error)}</p> : null;

/** Asks for a free-text reason (remove item, cancel order). */
export function ReasonDialog({
  title,
  confirmLabel,
  onConfirm,
  onClose,
  pending,
  error,
  optional,
}: {
  title: string;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  pending?: boolean;
  error?: unknown;
  optional?: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (optional || reason.trim()) onConfirm(reason.trim());
        }}
      >
        <label className="field">
          {optional ? 'Motivo (opcional)' : 'Motivo'}
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </label>
        <ErrorText error={error} />
        <div className="row end">
          <button type="button" onClick={onClose}>
            Voltar
          </button>
          <button className="danger" disabled={(!optional && !reason.trim()) || pending}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function MethodPicker({ value, onChange }: { value: PaymentMethod | null; onChange: (m: PaymentMethod) => void }) {
  return (
    <div className="methods" role="radiogroup" aria-label="Forma de pagamento">
      {paymentMethods.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          className={value === m ? 'chip active' : 'chip'}
          onClick={() => onChange(m)}
        >
          {paymentMethodLabels[m]}
        </button>
      ))}
    </div>
  );
}

/** Text input for an amount in reais. */
export function MoneyInput({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label className="field">
      {label}
      <span className="money">
        <span>R$</span>
        <input
          ref={ref}
          autoFocus={autoFocus}
          inputMode="decimal"
          placeholder="0,00"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => ref.current?.select()}
        />
      </span>
    </label>
  );
}
