import { Controller, Get, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule, Db } from './common/db';
import { AuthModule } from './auth/auth.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { MaestrosModule } from './maestros/maestros.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { InventarioModule } from './inventario/inventario.module';
import { ReservasModule } from './reservas/reservas.module';
import { PagosModule, PagosService } from './pagos/pagos.module';
import { VentasModule } from './ventas/ventas.module';
import { PosModule } from './pos/pos.module';
import { ReportesModule } from './reportes/reportes.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { PropuestasModule } from './proveedores/propuestas.module';
import { IaModule } from './ia/ia.module';
import { envNum } from './common/util';

@Controller()
class SistemaController {
  constructor(private db: Db, private pagos: PagosService) {}

  @Get('health')
  async health() {
    const r = await this.db.one("SELECT current_setting('server_encoding') AS codificacion, (SELECT valor FROM meta WHERE clave='schema_version') AS esquema");
    return { ok: true, servicio: 'fashionstore-api', baseDeDatos: r };
  }

  // Configuracion publica que necesitan la web y la app para adaptar la interfaz
  @Get('config')
  config() {
    return {
      marca: 'FashionStore', pagos: this.pagos.config(),
      reservas: { maxDias: envNum('RESERVA_MAX_DIAS', 7), graciaHoras: envNum('RESERVA_GRACIA_HORAS', 2) },
    };
  }
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/fashionstore',
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
      synchronize: false,               // el esquema lo gestiona database/schema.sql
      extra: { max: 15, options: '-c client_encoding=UTF8' },
    }),
    CommonModule, AuthModule, UsuariosModule, MaestrosModule, CatalogoModule, InventarioModule, ReservasModule,
    PagosModule, VentasModule, PosModule, ReportesModule, NotificacionesModule, PropuestasModule, IaModule,
  ],
  controllers: [SistemaController],
})
export class AppModule {}
