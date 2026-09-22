import { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/App';
import { PanelLayout, TiendaLayout } from './components/Layouts';
import { Login, Registro } from './pages/tienda/Auth';
import Inicio from './pages/tienda/Inicio';
import Catalogo from './pages/tienda/Catalogo';
import Producto from './pages/tienda/Producto';
import Carrito from './pages/tienda/Carrito';
import Checkout from './pages/tienda/Checkout';
import Pago from './pages/tienda/Pago';
import MisReservas from './pages/tienda/MisReservas';
import MisPedidos from './pages/tienda/MisPedidos';
import Perfil from './pages/tienda/Perfil';
import Ayuda from './pages/tienda/Ayuda';
import Vestidor from './pages/tienda/Vestidor';
import Dashboard from './pages/panel/Dashboard';
import Reservas from './pages/panel/Reservas';
import POS from './pages/panel/POS';
import Ventas from './pages/panel/Ventas';
import Inventario from './pages/panel/Inventario';
import Productos from './pages/panel/Productos';
import { Catalogos, Organizacion } from './pages/panel/Maestros';
import Usuarios from './pages/panel/Usuarios';
import Propuestas from './pages/panel/Propuestas';
import Reportes from './pages/panel/Reportes';

function Protegida({ roles, children }: { roles?: string[]; children: ReactNode }) {
  const { usuario } = useAuth(); const loc = useLocation();
  if (!usuario) return <Navigate to="/login" replace state={{ desde: loc.pathname }} />;
  if (roles && !roles.includes(usuario.rol)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
const STAFF = ['admin', 'encargado', 'cajero'];
function Inicial() { const { usuario } = useAuth(); return <Navigate to={usuario?.rol === 'cajero' ? '/panel/pos' : usuario?.rol === 'proveedor' ? '/panel/propuestas' : '/panel'} replace />; }

export default function App() {
  return (
    <Routes>
      <Route element={<TiendaLayout />}>
        <Route index element={<Inicio />} /><Route path="catalogo" element={<Catalogo />} /><Route path="producto/:id" element={<Producto />} /><Route path="vestidor" element={<Vestidor />} /><Route path="ayuda" element={<Ayuda />} />
        <Route path="login" element={<Login />} /><Route path="registro" element={<Registro />} /><Route path="carrito" element={<Carrito />} />
        <Route path="checkout" element={<Protegida><Checkout /></Protegida>} /><Route path="pago/:ref" element={<Protegida><Pago /></Protegida>} />
        <Route path="mis-reservas" element={<Protegida><MisReservas /></Protegida>} /><Route path="mis-pedidos" element={<Protegida><MisPedidos /></Protegida>} /><Route path="perfil" element={<Protegida><Perfil /></Protegida>} />
      </Route>
      <Route path="panel" element={<Protegida roles={[...STAFF, 'proveedor']}><PanelLayout /></Protegida>}>
        <Route index element={<Protegida roles={['admin', 'encargado']}><Dashboard /></Protegida>} />
        <Route path="pos" element={<Protegida roles={STAFF}><POS /></Protegida>} /><Route path="reservas" element={<Protegida roles={STAFF}><Reservas /></Protegida>} />
        <Route path="ventas" element={<Protegida roles={STAFF}><Ventas /></Protegida>} /><Route path="inventario" element={<Protegida roles={STAFF}><Inventario /></Protegida>} />
        <Route path="productos" element={<Protegida roles={['admin']}><Productos /></Protegida>} /><Route path="catalogo" element={<Protegida roles={['admin']}><Catalogos /></Protegida>} />
        <Route path="organizacion" element={<Protegida roles={['admin']}><Organizacion /></Protegida>} /><Route path="usuarios" element={<Protegida roles={['admin']}><Usuarios /></Protegida>} />
        <Route path="propuestas" element={<Protegida roles={['admin', 'proveedor']}><Propuestas /></Protegida>} /><Route path="reportes" element={<Protegida roles={['admin', 'encargado']}><Reportes /></Protegida>} />
        <Route path="ayuda" element={<Ayuda />} />
        <Route path="*" element={<Inicial />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
