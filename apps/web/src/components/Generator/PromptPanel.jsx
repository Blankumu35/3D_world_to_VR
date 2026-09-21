import React, { useState } from 'react';

export function PromptPanel({ onGenerate, isGenerating }) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;
    onGenerate(prompt);
    setPrompt('');
  };

  return (
    <div style={panelStyle}>
      <h3>✨ Make a 3D Object</h3>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. A red treasure chest"
          disabled={isGenerating}
          style={inputStyle}
        />
        <button type="submit" disabled={isGenerating} style={buttonStyle}>
          {isGenerating ? 'Building...' : 'Create!'}
        </button>
      </form>
    </div>
  );
}

const panelStyle = {
  position: 'absolute',
  bottom: '20px',
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(255, 255, 255, 0.95)',
  padding: '16px 24px',
  borderRadius: '16px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

const inputStyle = {
  padding: '10px 14px',
  fontSize: '16px',
  borderRadius: '8px',
  border: '2px solid #ccc',
  marginRight: '8px',
  width: '260px',
};

const buttonStyle = {
  padding: '10px 20px',
  fontSize: '16px',
  fontWeight: 'bold',
  borderRadius: '8px',
  backgroundColor: '#4F46E5',
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
};