import { ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Boxes, CalendarCheck, ChevronDown, ClipboardList, HelpCircle, LayoutDashboard, LogOut, Package, Receipt, Search, ShoppingBag, ShoppingCart, Sparkles, Store, Tags, Truck, User, Users, Warehouse, Percent, Inbox } from 'lucide-react';
import { useAuth, useCarrito, useDatos } from '../context/App';
import { ROL } from '../lib/format';
import Asistente from './Asistente';
import Campana from './Campana';
import Onboarding from './Onboarding';

export function TiendaLayout() {
  const { usuario, logout, esStaff } = useAuth();
  const { cantidad } = useCarrito();
  const { sucursales, sucursalId, setSucursalId } = useDatos();
  const nav = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  useEffect(() => { setMenu(false); window.scrollTo(0, 0); }, [loc.pathname]);
  return (
    <>
      <header className="tienda-head">
        <div className="contenedor fila">
          <Link to="/" className="logo"><span aria-hidden>👗</span><span>FashionStore<small>MODA · AR · IA</small></span></Link>
          <nav className="nav" aria-label="Principal">
            <NavLink to="/" end>Inicio</NavLink><NavLink to="/catalogo">Catálogo</NavLink><NavLink to="/vestidor">Vestidor virtual</NavLink><NavLink to="/ayuda">Ayuda</NavLink>
          </nav>
          <form className="buscador" onSubmit={(e) => { e.preventDefault(); nav(`/catalogo?q=${encodeURIComponent(q)}`); }} role="search">
            <Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar vestidos, blusas, zapatos…" aria-label="Buscar" />
          </form>
          <div className="grow" />
          <select value={sucursalId ?? ''} onChange={(e) => setSucursalId(e.target.value ? Number(e.target.value) : null)} style={{ width: 'auto', maxWidth: 190, borderRadius: 999, padding: '7px 12px' }} aria-label="Sucursal" title="Elige tu sucursal para ver la disponibilidad">
            <option value="">Todas las sucursales</option>{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          {usuario && <Campana />}
          <Link to="/carrito" className="icon-btn" aria-label={`Carrito (${cantidad})`}><ShoppingCart size={21} />{cantidad > 0 && <span className="contador">{cantidad}</span>}</Link>
          {usuario ? (
            <div style={{ position: 'relative' }}>
              <button className="btn sec sm" onClick={() => setMenu(!menu)}><User size={16} />{usuario.nombre.split(' ')[0]}<ChevronDown size={14} /></button>
              {menu && <div className="menu-pop">
                <div style={{ padding: '10px 16px' }} className="small muted">{usuario.email}<br /><b>{ROL[usuario.rol]}</b></div>
                {usuario.rol === 'cliente' && <><Link to="/mis-reservas"><CalendarCheck size={16} />Mis reservas</Link><Link to="/mis-pedidos"><Receipt size={16} />Mis pedidos</Link></>}
                {(esStaff || usuario.rol === 'proveedor') && <Link to="/panel"><LayoutDashboard size={16} />Ir al panel</Link>}
                <Link to="/perfil"><User size={16} />Mi perfil</Link>
                <button onClick={() => { logout(); nav('/'); }}><LogOut size={16} />Cerrar sesión</button></div>}
            </div>
          ) : (<><Link to="/login" className="btn sec sm">Ingresar</Link><Link to="/registro" className="btn sm hide-sm">Crear cuenta</Link></>)}
        </div>
      </header>
      <main className="contenedor" style={{ paddingTop: 24 }}><Outlet /></main>
      <footer className="pie"><div className="contenedor row between" style={{ alignItems: 'flex-start', gap: 30 }}>
        <div><h4>FashionStore</h4><div className="small" style={{ opacity: .8, maxWidth: 320 }}>Plataforma inteligente de comercio electrónico con vestidores virtuales de realidad aumentada. Reserva, pruébate y compra.</div></div>
        <div><h4>Sucursales</h4>{sucursales.map((s) => <div key={s.id} className="small" style={{ opacity: .85 }}>{s.nombre} · {s.ciudad}</div>)}</div>
        <div><h4>Ayuda</h4><div className="small"><Link to="/ayuda">Manual de usuario</Link><br /><Link to="/catalogo">Catálogo</Link></div></div>
      </div><div className="contenedor small" style={{ opacity: .6, marginTop: 24 }}>© {new Date().getFullYear()} FashionStore · TechNet Solutions S.R.L. · Santa Cruz de la Sierra, Bolivia</div></footer>
      <Asistente /><Onboarding />
    </>
  );
}

interface Item { to: string; icono: ReactNode; texto: string; roles: string[]; end?: boolean }
const ITEMS: Item[] = [
  { to: '/panel', icono: <LayoutDashboard size={18} />, texto: 'Dashboard', roles: ['admin', 'encargado'], end: true },
  { to: '/panel/pos', icono: <ShoppingBag size={18} />, texto: 'Punto de venta', roles: ['admin', 'encargado', 'cajero'] },
  { to: '/panel/reservas', icono: <CalendarCheck size={18} />, texto: 'Reservas', roles: ['admin', 'encargado', 'cajero'] },
  { to: '/panel/ventas', icono: <Receipt size={18} />, texto: 'Ventas', roles: ['admin', 'encargado', 'cajero'] },
  { to: '/panel/inventario', icono: <Boxes size={18} />, texto: 'Inventario', roles: ['admin', 'encargado', 'cajero'] },
  { to: '/panel/productos', icono: <Package size={18} />, texto: 'Productos', roles: ['admin'] },
  { to: '/panel/catalogo', icono: <Tags size={18} />, texto: 'Catálogo y promociones', roles: ['admin'] },
  { to: '/panel/organizacion', icono: <Warehouse size={18} />, texto: 'Sucursales y proveedores', roles: ['admin'] },
  { to: '/panel/usuarios', icono: <Users size={18} />, texto: 'Usuarios', roles: ['admin'] },
  { to: '/panel/propuestas', icono: <Inbox size={18} />, texto: 'Propuestas', roles: ['admin', 'proveedor'] },
  { to: '/panel/reportes', icono: <Sparkles size={18} />, texto: 'Reportes con IA', roles: ['admin', 'encargado'] },
];

export function PanelLayout() {
  const { usuario, logout } = useAuth();
  const nav = useNavigate();
  if (!usuario) return null;
  return (
    <div className="panel">
      <aside className="lateral">
        <Link to="/panel" className="logo"><span>👗</span><span>FashionStore<small>PANEL</small></span></Link>
        {ITEMS.filter((i) => i.roles.includes(usuario.rol)).map((i) => <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `item ${isActive ? 'act' : ''}`}>{i.icono}{i.texto}</NavLink>)}
        <div className="sep">Más</div>
        <NavLink to="/panel/ayuda" className={({ isActive }) => `item ${isActive ? 'act' : ''}`}><HelpCircle size={18} />Manual de usuario</NavLink>
        <Link to="/" className="item"><Store size={18} />Ir a la tienda</Link>
      </aside>
      <div className="panel-main">
        <div className="panel-top no-print">
          <div><b>{usuario.nombre}</b> <span className="badge marca">{ROL[usuario.rol]}</span>{usuario.sucursal && <span className="small muted"> · {usuario.sucursal.nombre}</span>}</div>
          <div className="row"><Campana /><button className="btn sec sm" onClick={() => { logout(); nav('/login'); }}><LogOut size={15} />Salir</button></div>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
