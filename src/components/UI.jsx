import React from 'react';

export function Modal({ open, onClose, title, children, footer, size = '' }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="btn btn-icon btn-ghost btn-sm" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Badge({ variant, children }) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}

export function StockBadge({ qty, threshold }) {
  if (qty <= 0)         return <Badge variant="out">Épuisé</Badge>;
  if (qty <= threshold) return <Badge variant="low">Stock bas</Badge>;
  return <Badge variant="ok">OK</Badge>;
}

export function StatusBadge({ status }) {
  return <Badge variant={status === 'Livré' ? 'delivered' : 'sold'}>{status}</Badge>;
}

export function LoadingScreen({ text = 'Chargement...' }) {
  return (
    <div className="loading-screen">
      <div className="spinner" />
      <span>{text}</span>
    </div>
  );
}

export function EmptyState({ icon, text }) {
  return (
    <div className="empty-state">
      {icon}
      <p>{text}</p>
    </div>
  );
}

export function VarietyDot({ color }) {
  return <span className="v-dot" style={{ background: color }} />;
}

export function CostPreview({ children }) {
  return <div className="cost-preview">{children}</div>;
}

export function Alert({ variant, children }) {
  const icons = {
    warning: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    danger:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
    success: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
    info:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  };
  return (
    <div className={`alert alert-${variant}`}>
      {icons[variant]}
      <div>{children}</div>
    </div>
  );
}

export function ProgressBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="progress">
      <div className="progress-fill" style={{ width: `${pct}%`, background: color || '#27AE60' }} />
    </div>
  );
}

export function SectionHeader({ title, subtitle, actions }) {
  return (
    <div className="section-header">
      <div>
        <div className="section-title-main">{title}</div>
        {subtitle && <div className="section-sub">{subtitle}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, danger }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>Confirmer</button>
        </>
      }
    >
      <p style={{ fontSize: '14px', color: 'var(--text-2)' }}>{message}</p>
    </Modal>
  );
}
