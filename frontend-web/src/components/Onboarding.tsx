import { useState } from 'react';
import { Modal } from './ui';
import { PASOS_ONBOARDING } from '../lib/manual';

// Introduccion de 3-4 pantallas la primera vez que se ingresa (Parte III, nivel 1 del mecanismo de aprendizaje)
export default function Onboarding() {
  const [visible, setVisible] = useState(() => localStorage.getItem('fs_onboarding') !== '1');
  const [i, setI] = useState(0);
  if (!visible) return null;
  const p = PASOS_ONBOARDING[i]; const ultimo = i === PASOS_ONBOARDING.length - 1;
  const cerrar = () => { localStorage.setItem('fs_onboarding', '1'); setVisible(false); };
  return (
    <Modal titulo="Primeros pasos" onClose={cerrar} pie={<>
      <button className="btn ghost" onClick={cerrar}>Omitir</button>
      {i > 0 && <button className="btn sec" onClick={() => setI(i - 1)}>Atrás</button>}
      <button className="btn" onClick={() => (ultimo ? cerrar() : setI(i + 1))}>{ultimo ? '¡Empezar!' : 'Siguiente'}</button></>}>
      <div className="onb"><div className="ico">{p.icono}</div><h2>{p.titulo}</h2><p className="muted">{p.texto}</p>
        <div className="puntos">{PASOS_ONBOARDING.map((_, k) => <i key={k} className={k === i ? 'act' : ''} />)}</div></div>
    </Modal>
  );
}
