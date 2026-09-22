import { useState } from 'react';
import { MANUAL } from '../../lib/manual';
import { Tabs } from '../../components/ui';
import { useAuth } from '../../context/App';

// Manual de usuario por rol (Parte III): mecanismo para que el usuario aprenda a utilizar la plataforma
export default function Ayuda() {
  const { usuario } = useAuth();
  const inicial = usuario && MANUAL.some((m) => m.id === usuario.rol) ? usuario.rol : 'cliente';
  const [id, setId] = useState<string>(inicial);
  const sec = MANUAL.find((m) => m.id === id)!;
  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 900 }}>
      <h1>Ayuda y manual de usuario</h1>
      <p className="muted">Aprende a usar FashionStore paso a paso. También puedes preguntarle al <b>asistente virtual</b> (botón inferior derecho) cómo hacer cualquier tarea.</p>
      <Tabs tabs={MANUAL.map((m) => ({ id: m.id, titulo: m.titulo.split(' (')[0] }))} actual={id} onChange={setId} />
      <h2>{sec.titulo}</h2><p className="muted">{sec.intro}</p>
      {sec.tareas.map((t, i) => <div className="card" key={t.titulo}><h3>{i + 1}. {t.titulo}</h3><ol style={{ margin: 0, paddingLeft: 22, lineHeight: 1.7 }}>{t.pasos.map((p) => <li key={p}>{p}</li>)}</ol></div>)}
      <div className="card"><h3>Conceptos básicos</h3><ul style={{ lineHeight: 1.8, margin: 0 }}>
        <li><b>Reserva:</b> solicitud de un cliente para probarse una o varias prendas en una sucursal.</li>
        <li><b>Estados de reserva:</b> PENDIENTE, EN_ATENCION, COMPLETADA o CANCELADA.</li>
        <li><b>Vestidor virtual:</b> función de la app móvil que usa la cámara y realidad aumentada para previsualizar una prenda.</li>
        <li><b>Venta presencial:</b> compra registrada por un cajero en el punto de caja de una sucursal.</li>
        <li><b>Venta digital:</b> compra hecha por el cliente desde la web o la app y pagada con pasarela electrónica.</li></ul>
        <button className="btn sec sm mt" onClick={() => { localStorage.removeItem('fs_onboarding'); window.location.reload(); }}>Ver la introducción de nuevo</button></div>
    </div>
  );
}
