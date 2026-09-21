/* vistas/ajustes.js — usuarios, configuración de la casa, perfil y registro. */

import {h, poner, txt, num, eur, miles, pct, fechaCorta, capital, hoyISO, iniciales} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, etiquetaEstado, marca, ventana, ventanaFormulario,
        aviso, avisoError, confirmar, cargando, formulario} from '../ui.js';

/* ================= usuarios ================= */
export async function vistaUsuarios({ir, refrescar}) {
  const caja = h('div');
  const contenedor = h('div', cargando());

  async function cargar() {
    poner(contenedor, cargando());
    const d = await api.pedir('usuarios');
    const usuarios = d.usuarios;

    const t = tabla([
      {clave: 'nombre', et: 'Persona', pinta: u => h('div', {estilo: {display: 'flex', gap: '10px',
        alignItems: 'center'}},
        h('span', {estilo: {width: '30px', height: '30px', borderRadius: '50%', background: 'var(--lima)',
          color: 'var(--carbon)', display: 'grid', placeItems: 'center', fontWeight: '700',
          fontSize: '12px', flex: 'none'}}, iniciales(u.nombre)),
        h('div', h('b', u.nombre), h('div.nota', u.usuario)))},
      {clave: 'rol', et: 'Rol', pinta: u => marca(u.rol === 'superadmin' ? 'Superadmin' : capital(u.rol),
        u.rol === 'superadmin' ? 'mal' : (u.rol === 'admin' ? 'info' : ''))},
      {clave: 'email', et: 'Correo'},
      {clave: 'telefono', et: 'Teléfono'},
      {clave: 'salario_bruto', et: 'Sueldo', num: true, pinta: u => eur(u.salario_bruto)},
      {clave: 'objetivo_mes', et: 'Objetivo', num: true, pinta: u => miles(u.objetivo_mes)},
      {clave: 'activo', et: 'Estado', pinta: u => etiquetaEstado(u.activo === 'si' ? 'ganado' : 'perdido',
        u.activo === 'si' ? 'Activo' : 'Desactivado')},
      {clave: 'ultimo_acceso', et: 'Último acceso', pinta: u => txt(u.ultimo_acceso)
        ? fechaCorta(txt(u.ultimo_acceso).slice(0, 10)) : 'nunca'},
      {clave: 'acciones', et: '', noOrden: true, pinta: u => h('.acciones',
        h('button.btn.mini', {onclick: () => editor(u)}, 'Editar'),
        h('button.btn.mini.peligro', {onclick: () => resetear(u)}, 'Nueva clave'))}
    ], usuarios, {vacio: 'No hay usuarios.'});

    poner(contenedor,
      kpis(
        kpi('Usuarios', miles(usuarios.length), miles(usuarios.filter(u => u.activo === 'si').length) + ' activos'),
        kpi('Comerciales', miles(usuarios.filter(u => u.rol === 'comercial').length)),
        kpi('Captadores', miles(usuarios.filter(u => u.rol === 'captador').length)),
        kpi('Coste de personal', eur(usuarios.filter(u => u.activo === 'si')
          .reduce((a, u) => a + num(u.salario_bruto) + num(u.dietas_mes), 0)), 'bruto al mes')
      ),
      tarjeta('Usuarios del CRM', t, {sinRelleno: true,
        acciones: [h('button.btn.mini.primario', {onclick: () => editor(null)}, '+ Nuevo usuario')]}));
  }

  function campos() {
    return [
      {separador: 'Identidad'},
      {id: 'nombre', et: 'Nombre', requerido: true},
      {id: 'usuario', et: 'Usuario para entrar', requerido: true, ayuda: 'Sin espacios ni acentos'},
      {id: 'rol', et: 'Rol', tipo: 'select', vacio: false, requerido: true,
       opciones: [['superadmin', 'Superadmin'], ['admin', 'Administrador'],
                  ['comercial', 'Comercial'], ['captador', 'Captador']]},
      {id: 'email', et: 'Correo', tipo: 'email'},
      {id: 'telefono', et: 'Teléfono', tipo: 'tel'},
      {id: 'activo', et: 'Activo', tipo: 'check'},
      {id: 'fecha_alta', et: 'Fecha de alta', tipo: 'fecha'},

      {separador: 'Nómina'},
      {id: 'salario_bruto', et: 'Sueldo bruto (€/mes)', tipo: 'euro'},
      {id: 'dietas_mes', et: 'Dietas (€/mes)', tipo: 'euro'},
      {id: 'irpf_pct', et: 'IRPF (%)', tipo: 'numero', paso: '0.01'},
      {id: 'ss_pct', et: 'Seguridad Social (%)', tipo: 'numero', paso: '0.01'},
      {id: 'jornada_horas', et: 'Horas de jornada', tipo: 'numero', paso: '0.5'},

      {separador: 'Comisiones y objetivos'},
      {id: 'comision_fv', et: 'Comisión fotovoltaica (€)', tipo: 'euro'},
      {id: 'comision_aero', et: 'Comisión aerotermia (€)', tipo: 'euro'},
      {id: 'comision_fv_ajustada', et: 'Comisión FV con precio ajustado (€)', tipo: 'euro'},
      {id: 'comision_aero_ajustada', et: 'Comisión aero con precio ajustado (€)', tipo: 'euro'},
      {id: 'objetivo_mes', et: 'Objetivo mensual', tipo: 'numero',
       ayuda: 'Ventas sencillas para comerciales, fichas para captadores'},
      {id: 'notas', et: 'Notas', tipo: 'area', ancho: 3}
    ];
  }

  function editor(u) {
    ventanaFormulario({
      titulo: u ? 'Editar ' + u.nombre : 'Nuevo usuario',
      ancha: true,
      campos: campos(),
      valores: u || {rol: 'comercial', activo: 'si', fecha_alta: hoyISO(), irpf_pct: 15, ss_pct: 6.35,
        jornada_horas: 7.5, dietas_mes: 150, comision_fv: 400, comision_aero: 400,
        comision_fv_ajustada: 200, comision_aero_ajustada: 200, objetivo_mes: 6},
      alGuardar: async d => {
        if (u) d.id = u.id;
        const r = await api.guardarUsuario(d);
        if (r.clave) mostrarClave(r.usuario.nombre, r.usuario.usuario, r.clave);
        else aviso('Usuario guardado.');
        await cargar();
        await refrescar();
      }
    });
  }

  async function resetear(u) {
    if (!await confirmar('Se generará una clave nueva para ' + u.nombre +
      ' y la actual dejará de funcionar.', {botón: 'Generar clave nueva'})) return;
    try {
      const r = await api.pedir('resetClave', {id: u.id});
      mostrarClave(u.nombre, u.usuario, r.clave);
      await cargar();
    } catch (e) { avisoError(e); }
  }

  function mostrarClave(nombre, usuario, clave) {
    ventana({
      titulo: 'Clave de ' + nombre,
      cuerpo: h('div',
        h('p', 'Apunta esta clave y pásasela en mano: no se puede volver a ver.'),
        h('div', {estilo: {background: 'var(--carbon)', color: 'var(--lima)', padding: '18px',
          borderRadius: '10px', textAlign: 'center', fontSize: '26px', fontWeight: '700',
          letterSpacing: '.12em', fontFamily: 'ui-monospace,Menlo,Consolas,monospace'}}, clave),
        h('p.nota', {estilo: {marginTop: '12px'}},
          'Usuario: ' + usuario + '. En cuanto entre, que la cambie desde Mi perfil.')),
      acciones: [h('button.btn.primario', {onclick: () => {
        navigator.clipboard && navigator.clipboard.writeText(clave);
        aviso('Clave copiada.');
      }}, 'Copiar clave')]
    });
  }

  poner(caja, contenedor);
  await cargar();
  return caja;
}

/* ================= ajustes de la casa ================= */
export async function vistaAjustes({refrescar}) {
  const cfg = api.estado.config;
  const grupos = [
    ['La empresa', [
      ['empresa_nombre', 'Razón social'], ['empresa_cif', 'CIF'],
      ['empresa_direccion', 'Domicilio'], ['empresa_email', 'Correo'], ['empresa_telefono', 'Teléfono']]],
    ['Cuentas', [
      ['iva_pct', 'IVA por defecto (%)'], ['coste_estructura_mes', 'Coste fijo mensual (€)'],
      ['margen_objetivo_pct', 'Margen bruto objetivo (%)'], ['dias_cobro_objetivo', 'Días de cobro objetivo']]],
    ['Comisiones y objetivos', [
      ['comision_fv', 'Comisión fotovoltaica (€)'], ['comision_aero', 'Comisión aerotermia (€)'],
      ['comision_fv_ajustada', 'Comisión FV ajustada (€)'], ['comision_aero_ajustada', 'Comisión aero ajustada (€)'],
      ['comision_captacion', 'Comisión por captación vendida (€)'],
      ['objetivo_comercial', 'Ventas/mes por comercial'], ['objetivo_captador', 'Fichas/mes por captador'],
      ['objetivo_visitas_dia', 'Puertas/día por captador']]],
    ['Tarifas de venta', [
      ['precio_fv_10_12', 'FV 10-12 paneles (€)'], ['precio_fv_14_16', 'FV 14-16 paneles (€)'],
      ['precio_fv_18_20', 'FV 18-20 paneles (€)'], ['precio_fv_22_24', 'FV 22-24 paneles (€)'],
      ['precio_aero_12', 'Aerotermia 12 kW (€)'], ['precio_aero_16', 'Aerotermia 16 kW (€)'],
      ['precio_aero_19', 'Aerotermia 19 kW (€)'], ['precio_aero_22', 'Aerotermia 22 kW (€)'],
      ['precio_bateria_modulo', 'Módulo de batería 5,3 kWh (€)'], ['precio_cargador', 'Cargador (€)']]],
    ['Herramientas', [
      ['ficha_dimensionado', 'Ficha de visita'], ['ficha_captacion', 'Ficha de captación']]]
  ];

  const formularios = grupos.map(([titulo, claves]) => {
    const f = formulario(claves.map(([id, et]) => ({id, et})),
      Object.fromEntries(claves.map(([id]) => [id, cfg[id]])));
    return {titulo, f};
  });

  const btn = h('button.btn.primario', 'Guardar ajustes');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const datos = Object.assign({}, ...formularios.map(x => x.f.leer()));
      await api.guardarConfig(datos);
      aviso('Ajustes guardados.');
      await refrescar();
    } catch (e) { avisoError(e); }
    finally { btn.disabled = false; }
  });

  return h('div',
    h('p.nota', {estilo: {marginBottom: '14px'}},
      'Estos valores los usan las propuestas, las comisiones y los cálculos de salud financiera.'),
    formularios.map(x => tarjeta(x.titulo, x.f.nodo)),
    h('.acciones', btn),
    resumenSemanal(),
    copiasSeguridad());
}

/* ---------- resumen semanal por correo ---------- */
function resumenSemanal() {
  const gente = api.estado.usuarios.filter(u => u.activo === 'si');
  const filas = tabla([
    {clave: 'nombre', et: 'Persona', pinta: u => h('b', u.nombre)},
    {clave: 'rol', et: 'Rol', pinta: u => capital(u.rol)},
    {clave: 'email', et: 'Correo donde lo recibe',
     pinta: u => txt(u.email) ? u.email : h('span.nota', 'sin correo: no lo recibirá')}
  ], gente, {vacio: 'Sin usuarios activos.'});

  const btnProbar = h('button.btn.mini', 'Mandármelo a mí para verlo');
  btnProbar.addEventListener('click', async () => {
    btnProbar.disabled = true;
    const original = btnProbar.textContent;
    btnProbar.textContent = 'Enviando…';
    try { await api.pedir('probarResumen'); aviso('Te lo he mandado a tu correo.'); }
    catch (e) { avisoError(e); }
    finally { btnProbar.disabled = false; btnProbar.textContent = original; }
  });

  const btnTodos = h('button.btn.mini.primario', 'Enviarlo ahora a todo el equipo');
  btnTodos.addEventListener('click', async () => {
    if (!await confirmar('Se manda el resumen de esta semana a todo el equipo, ahora mismo.',
      {botón: 'Enviar', peligro: false})) return;
    btnTodos.disabled = true;
    const original = btnTodos.textContent;
    btnTodos.textContent = 'Enviando…';
    try {
      const r = await api.pedir('resumenSemanalAhora');
      aviso(r.resultado.enviados + ' resúmenes enviados.');
    } catch (e) { avisoError(e); }
    finally { btnTodos.disabled = false; btnTodos.textContent = original; }
  });

  return tarjeta('Resumen semanal por correo', filas, {
    sinRelleno: true,
    subtitulo: 'Cada viernes sobre las 18:00 cada uno recibe cómo le ha ido la semana, ' +
      'con sus números, lo que tiene por delante y una frase para cerrar',
    acciones: [btnProbar, btnTodos]
  });
}

/* ---------- copias de seguridad ---------- */
function copiasSeguridad() {
  const caja = h('div', cargando('Mirando las copias…'));

  async function cargar() {
    try {
      const d = await api.pedir('copias');
      const t = tabla([
        {clave: 'nombre', et: 'Archivo', pinta: c => h('a', {href: c.url, target: '_blank'}, c.nombre)},
        {clave: 'creado', et: 'Guardada el', pinta: c => c.creado},
        {clave: 'tamano', et: 'Tamaño', num: true,
         pinta: c => Math.max(1, Math.round(num(c.tamano) / 1024)) + ' KB'}
      ], d.copias, {vacio: 'Todavía no hay ninguna copia guardada.'});

      const btn = h('button.btn.mini.primario', 'Hacer una copia ahora');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = 'Copiando…';
        try { await api.pedir('copiaAhora'); aviso('Copia guardada.'); await cargar(); }
        catch (e) { avisoError(e); }
        finally { btn.disabled = false; btn.textContent = original; }
      });

      poner(caja, tarjeta('Copias de seguridad', t, {
        sinRelleno: true,
        subtitulo: 'Cada viernes sobre las 19:15 se guarda una copia; las de más de ' +
          d.meses + ' meses se borran solas',
        acciones: [h('a.btn.mini', {href: d.carpeta, target: '_blank'}, 'Abrir la carpeta'), btn]
      }));
    } catch (e) {
      poner(caja, tarjeta('Copias de seguridad',
        h('div', h('p.nota', txt(e.message)),
          h('p.nota', 'Si es la primera vez, ejecuta instalarDisparadores() en el editor de Apps Script.'))));
    }
  }

  cargar();
  return caja;
}

/* ================= mi perfil ================= */
export async function vistaPerfil({ir, refrescar}) {
  const u = api.estado.usuario;
  const d = await api.pedir('usuarios');
  const yo = d.usuarios.find(x => String(x.id) === String(u.id)) || u;

  const actual = h('input', {type: 'password', autocomplete: 'current-password'});
  const nueva = h('input', {type: 'password', autocomplete: 'new-password'});
  const repetir = h('input', {type: 'password', autocomplete: 'new-password'});
  const btnClave = h('button.btn.primario', 'Cambiar la clave');
  btnClave.addEventListener('click', async () => {
    if (nueva.value.length < 8) return aviso('La clave nueva necesita al menos 8 caracteres.', 'error');
    if (nueva.value !== repetir.value) return aviso('Las dos claves nuevas no coinciden.', 'error');
    btnClave.disabled = true;
    try {
      await api.pedir('cambiarClave', {actual: actual.value, nueva: nueva.value});
      aviso('Clave cambiada.');
      actual.value = nueva.value = repetir.value = '';
    } catch (e) { avisoError(e); }
    finally { btnClave.disabled = false; }
  });

  const jornada = ventanaJornada(refrescar);

  return h('div',
    h('.cabecera-ficha',
      h('.quien', h('h1', yo.nombre),
        h('.acciones', {estilo: {marginTop: '6px'}},
          marca(yo.rol === 'superadmin' ? 'Superadmin' : capital(yo.rol),
            yo.rol === 'superadmin' ? 'mal' : (yo.rol === 'admin' ? 'info' : 'marca')),
          h('span.nota', 'Usuario: ' + yo.usuario)))),

    h('.doble',
      tarjeta('Tus datos', h('div',
        h('.dato', h('.et', 'Nombre'), h('.v', yo.nombre)),
        h('.dato', h('.et', 'Usuario'), h('.v', yo.usuario)),
        h('.dato', h('.et', 'Correo'), h('.v', txt(yo.email) || '—')),
        h('.dato', h('.et', 'Teléfono'), h('.v', txt(yo.telefono) || '—')),
        h('.dato', h('.et', 'Alta'), h('.v', txt(yo.fecha_alta) ? fechaCorta(yo.fecha_alta) : '—')),
        h('.dato', h('.et', 'Objetivo mensual'), h('.v', miles(yo.objetivo_mes))),
        h('.dato', h('.et', 'Jornada'), h('.v', String(yo.jornada_horas).replace('.', ',') + ' h')),
        yo.salario_bruto !== undefined ? h('div',
          h('.dato', h('.et', 'Sueldo bruto'), h('.v', eur(yo.salario_bruto) + '/mes')),
          h('.dato', h('.et', 'Dietas'), h('.v', eur(yo.dietas_mes) + '/mes')),
          h('.dato', h('.et', 'Comisión FV / aerotermia'),
            h('.v', eur(yo.comision_fv) + ' / ' + eur(yo.comision_aero)))) : null,
        h('.acciones', {estilo: {marginTop: '12px'}},
          h('button.btn', {onclick: () => ir('nomina')}, 'Ver mi nómina'),
          h('button.btn', {onclick: () => ir('resumen')}, 'Ver mi resumen'),
          h('button.btn.plano', {onclick: jornada}, 'Apuntar vacaciones o baja')))),

      tarjeta('Cambiar la clave', h('div',
        h('label.campo', h('span', 'Clave actual'), actual),
        h('label.campo', h('span', 'Clave nueva'), nueva),
        h('label.campo', h('span', 'Repite la clave nueva'), repetir),
        h('p.nota', 'Mínimo 8 caracteres. Si la has olvidado, pídele una nueva al superadmin.'),
        h('.acciones', btnClave)))),

    tarjeta('Tu equipo', tabla([
      {clave: 'nombre', et: 'Persona', pinta: x => h('b', x.nombre)},
      {clave: 'rol', et: 'Rol', pinta: x => capital(x.rol)},
      {clave: 'email', et: 'Correo', pinta: x => txt(x.email) || '—'},
      {clave: 'telefono', et: 'Teléfono', pinta: x => txt(x.telefono) || '—'}
    ], d.usuarios.filter(x => x.activo === 'si'), {vacio: 'Sin equipo.'}), {sinRelleno: true}));
}

function ventanaJornada(refrescar) {
  return () => ventanaFormulario({
    titulo: 'Apuntar una jornada especial',
    campos: [
      {id: 'fecha', et: 'Día', tipo: 'fecha', requerido: true},
      {id: 'tipo', et: 'Tipo', tipo: 'select', vacio: false,
       opciones: [['vacaciones', 'Vacaciones'], ['baja', 'Baja'], ['festivo', 'Festivo'],
                  ['libre', 'Libre'], ['trabajado', 'Trabajado']]},
      {id: 'horas', et: 'Horas', tipo: 'numero', paso: '0.5'},
      {id: 'notas', et: 'Notas', tipo: 'area', ancho: 3}
    ],
    valores: {fecha: hoyISO(), tipo: 'vacaciones'},
    alGuardar: async d => {
      await api.guardarJornada(d);
      aviso('Jornada apuntada.');
      if (refrescar) await refrescar();
    }
  });
}

/* ================= registro ================= */
export async function vistaRegistro() {
  const d = await api.pedir('registro', {limite: 300});
  return tarjeta('Últimos movimientos en el CRM', tabla([
    {clave: 'fecha', et: 'Cuándo', pinta: r => h('div', h('b', txt(r.fecha).slice(0, 10)),
      h('div.nota', txt(r.fecha).slice(11, 16)))},
    {clave: 'usuario', et: 'Quién'},
    {clave: 'accion', et: 'Qué', pinta: r => marca(txt(r.accion).replace(/_/g, ' '))},
    {clave: 'entidad', et: 'Dónde'},
    {clave: 'entidad_id', et: 'Ficha'},
    {clave: 'detalle', et: 'Detalle', noOrden: true, pinta: r => h('span.nota', txt(r.detalle))}
  ], d.registro, {vacio: 'Sin actividad registrada.', csv: 'registro_crm.csv'}), {sinRelleno: true});
}
