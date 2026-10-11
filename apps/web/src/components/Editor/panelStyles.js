// Shared look for the editor's side panels, matching AssetLibraryPanel on
// the left (white card, blue active tab, slate text). Every panel in the
// right-hand SidePanel imports from here, so they can't drift apart.

export const BLUE = '#2563EB';
export const RED = '#EF4444';
export const TEXT = '#334155';
export const MUTED = '#64748B';
export const BORDER = '#CBD5E1';
export const SURFACE = '#F8FAFC';

export const sectionStyle = {
  padding: '12px 0',
  borderTop: '1px solid #E2E8F0'
};

export const firstSectionStyle = { ...sectionStyle, paddingTop: 0, borderTop: 'none' };

export const sectionLabelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 700,
  color: TEXT,
  margin: '0 0 8px'
};

export const hintStyle = { fontSize: '12px', color: MUTED, margin: '6px 0 0', lineHeight: 1.5 };

export const rowStyle = { display: 'flex', gap: '6px', alignItems: 'center' };

export const chipStyle = {
  flex: 1,
  minHeight: '34px',
  padding: '6px 8px',
  fontSize: '13px',
  fontWeight: 600,
  borderRadius: '8px',
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT,
  cursor: 'pointer',
  whiteSpace: 'nowrap'
};

export const chipActiveStyle = { ...chipStyle, background: BLUE, color: '#FFF', border: `1px solid ${BLUE}` };

export const dangerButtonStyle = {
  ...chipStyle,
  width: '100%',
  minHeight: '40px',
  border: 'none',
  background: RED,
  color: '#FFF'
};

export const checkboxLabelStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '13px',
  color: TEXT,
  marginTop: '8px',
  cursor: 'pointer'
};

export const numberInputStyle = {
  width: '52px',
  padding: '6px 4px',
  fontSize: '13px',
  borderRadius: '6px',
  border: `1px solid ${BORDER}`,
  textAlign: 'center',
  color: TEXT
};