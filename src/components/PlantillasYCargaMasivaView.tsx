import React, { useState } from 'react';
import { Company, ChartOfAccount, Auxiliary, Voucher, VoucherLine } from '../types';
import { db } from '../lib/firebase';
import { collection, doc, writeBatch, setDoc } from 'firebase/firestore';

interface PlantillasYCargaMasivaViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  auxiliaries: Auxiliary[];
  onRefreshData: () => Promise<void>;
}

export default function PlantillasYCargaMasivaView({
  studyId,
  company,
  accounts,
  auxiliaries,
  onRefreshData
}: PlantillasYCargaMasivaViewProps) {
  const [activeTab, setActiveTab] = useState<'descargas' | 'importarCuentas' | 'importarAuxiliares'>('descargas');
  const [importText, setImportText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [importResults, setImportResults] = useState<{
    successCount: number;
    errorCount: number;
    errors: string[];
  } | null>(null);

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);

  // 1. DESCARGA DE PLANTILLA: PLAN DE CUENTAS
  const downloadPlanCuentasTemplate = () => {
    const headers = [
      'CodigoCuenta',
      'NombreCuenta',
      'TipoCuenta',
      'CodigoPadre',
      'RequiereCentroCosto',
      'RequiereAuxiliarRUT',
      'RequiereConciliacionBancaria',
      'RequiereDocumento'
    ];

    const sampleRows = [
      ['1.1.01.001', 'Caja Central Moneda Nacional', 'Activo', '1.1.01', 'NO', 'NO', 'NO', 'NO'],
      ['1.1.02.001', 'Banco de Chile Cta Cte 991823-01', 'Activo', '1.1.02', 'NO', 'NO', 'SI', 'NO'],
      ['1.1.03.001', 'Clientes por Cobrar Nacionales', 'Activo', '1.1.03', 'NO', 'SI', 'NO', 'SI'],
      ['1.1.07.001', 'IVA Credito Fiscal 19%', 'Activo', '1.1.07', 'NO', 'NO', 'NO', 'SI'],
      ['2.1.01.001', 'Proveedores por Pagar Nacionales', 'Pasivo', '2.1.01', 'NO', 'SI', 'NO', 'SI'],
      ['2.1.03.001', 'IVA Debito Fiscal 19%', 'Pasivo', '2.1.03', 'NO', 'NO', 'NO', 'SI'],
      ['2.1.03.003', 'Retencion Honorarios 2da Categoria', 'Pasivo', '2.1.03', 'NO', 'SI', 'NO', 'SI'],
      ['3.1.01.001', 'Capital Social Aportado', 'Patrimonio', '3.1.01', 'NO', 'NO', 'NO', 'NO'],
      ['4.1.01.001', 'Ingresos por Ventas del Giro', 'Ingreso', '4.1.01', 'SI', 'NO', 'NO', 'SI'],
      ['5.1.01.001', 'Costo de Ventas y Mercaderias', 'Gasto', '5.1.01', 'SI', 'NO', 'NO', 'SI'],
      ['5.2.01.001', 'Gastos Generales y Arriendos', 'Gasto', '5.2.01', 'SI', 'SI', 'NO', 'SI']
    ];

    const csvContent = '\uFEFF' + [headers.join(';'), ...sampleRows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Plantilla_Plan_Cuentas_${company.rut}.csv`;
    link.click();
  };

  // 2. DESCARGA DE PLANTILLA: AUXILIARES (CLIENTES / PROVEEDORES)
  const downloadAuxiliaresTemplate = () => {
    const headers = [
      'RUT',
      'RazonSocial',
      'NombreFantasia',
      'Giro',
      'Direccion',
      'Comuna',
      'Ciudad',
      'Email',
      'Telefono',
      'EsCliente',
      'EsProveedor',
      'EsEmpleado',
      'Banco',
      'TipoCuenta',
      'NumeroCuenta',
      'CuentaContableCobrar',
      'CuentaContablePagar'
    ];

    const sampleRows = [
      [
        '76.123.456-7',
        'DISTRIBUIDORA Y COMERCIAL SUR LIMITADA',
        'Comercial Sur',
        'Venta de Insumos',
        'Av Providencia 1234',
        'Providencia',
        'Santiago',
        'contacto@comercialsur.cl',
        '+56911223344',
        'SI',
        'NO',
        'NO',
        'Banco de Chile',
        'Corriente',
        '123456789',
        '1.1.03.001',
        ''
      ],
      [
        '77.987.654-3',
        'PROVEEDORA INDUSTRIAL Y SERVICIOS SPA',
        'Industrial SpA',
        'Servicios de Mantencion',
        'Calle Los Boldos 500',
        'Concepcion',
        'Concepcion',
        'facturas@industrial.cl',
        '+56999887766',
        'NO',
        'SI',
        'NO',
        'Banco Santander',
        'Corriente',
        '00987654321',
        '',
        '2.1.01.001'
      ],
      [
        '15.432.109-8',
        'GONZALEZ PEREZ JUAN PABLO',
        'Consultoria Gonzalez',
        'Servicios Profesionales de Ingenieria',
        'Av El Bosque Norte 400',
        'Las Condes',
        'Santiago',
        'jpgonzalez@gmail.com',
        '+56987654321',
        'NO',
        'SI',
        'NO',
        'Banco Estado',
        'RUT',
        '15432109',
        '',
        '2.1.03.003'
      ]
    ];

    const csvContent = '\uFEFF' + [headers.join(';'), ...sampleRows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Plantilla_Maestro_Auxiliares_${company.rut}.csv`;
    link.click();
  };

  // 3. DESCARGA DE PLANTILLA: COMPROBANTES CONTABLES MASIVOS
  const downloadComprobantesTemplate = () => {
    const headers = [
      'NumeroComprobante',
      'Fecha',
      'TipoComprobante',
      'GlosaGeneral',
      'CodigoCuenta',
      'NombreCuenta',
      'Debe',
      'Haber',
      'GlosaLinea',
      'RUTCliProv',
      'RazonSocialCliProv',
      'TipoDoc',
      'NumeroDoc',
      'CentroCosto'
    ];

    const sampleRows = [
      ['1', '2026-01-02', 'Traspaso', 'Asiento de Apertura Ejercicio 2026', '1.1.02.001', 'Banco de Chile Cta Cte', '15000000', '0', 'Saldo inicial banco', '', '', '', '', ''],
      ['1', '2026-01-02', 'Traspaso', 'Asiento de Apertura Ejercicio 2026', '1.1.03.001', 'Clientes por Cobrar', '5000000', '0', 'Facturas pendientes', '76.123.456-7', 'Comercial Sur', 'Factura', '450', ''],
      ['1', '2026-01-02', 'Traspaso', 'Asiento de Apertura Ejercicio 2026', '2.1.01.001', 'Proveedores por Pagar', '0', '4000000', 'Deuda inicial compras', '77.987.654-3', 'Industrial SpA', 'Factura', '9812', ''],
      ['1', '2026-01-02', 'Traspaso', 'Asiento de Apertura Ejercicio 2026', '3.1.01.001', 'Capital Social Aportado', '0', '16000000', 'Aporte de socios', '', '', '', '', '']
    ];

    const csvContent = '\uFEFF' + [headers.join(';'), ...sampleRows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Plantilla_Comprobantes_Contables_${company.rut}.csv`;
    link.click();
  };

  // PROCESAMIENTO: IMPORTACIÓN MASIVA DE PLAN DE CUENTAS
  const handleImportPlanCuentas = async () => {
    if (!importText.trim()) {
      alert('Por favor ingrese o pegue los datos del archivo Excel / CSV.');
      return;
    }

    setIsProcessing(true);
    setImportResults(null);

    try {
      const lines = importText.trim().split('\n');
      const rows = lines.map(l => l.split(/[\t;,]/).map(c => c.trim().replace(/^["']|["']$/g, '')));

      // Check header
      let startIndex = 0;
      if (rows[0][0]?.toLowerCase().includes('codigo') || rows[0][0]?.toLowerCase().includes('cuenta')) {
        startIndex = 1;
      }

      const errors: string[] = [];
      let successCount = 0;
      const batch = writeBatch(db);

      for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 2 || !row[0]) continue;

        const code = row[0];
        const name = row[1];
        let type = row[2] || 'Activo';

        // Normalize Type
        const typeLow = type.toLowerCase();
        if (typeLow.includes('pasivo')) type = 'Pasivo';
        else if (typeLow.includes('patrimonio') || typeLow.includes('capital')) type = 'Patrimonio';
        else if (typeLow.includes('ingreso') || typeLow.includes('ganancia') || typeLow.includes('venta')) type = 'Ingreso';
        else if (typeLow.includes('gasto') || typeLow.includes('costo') || typeLow.includes('perdida')) type = 'Gasto';
        else type = 'Activo';

        const parentCode = row[3] || '';
        const reqCC = row[4]?.toUpperCase() === 'SI' || row[4]?.toUpperCase() === 'TRUE' || row[4] === '1';
        const reqRUT = row[5]?.toUpperCase() === 'SI' || row[5]?.toUpperCase() === 'TRUE' || row[5] === '1';
        const reqBanco = row[6]?.toUpperCase() === 'SI' || row[6]?.toUpperCase() === 'TRUE' || row[6] === '1';
        const reqDoc = row[7]?.toUpperCase() === 'SI' || row[7]?.toUpperCase() === 'TRUE' || row[7] === '1';

        if (!code || !name) {
          errors.push(`Fila ${i + 1}: Código o Nombre de cuenta vacío.`);
          continue;
        }

        const accountId = `acc_${code.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const accRef = doc(companyRef, 'chartOfAccounts', accountId);

        const newAccount: any = {
          code,
          name,
          type,
          parentCode: parentCode || undefined,
          requiereCentroCosto: reqCC,
          requiereAuxiliarRUT: reqRUT,
          requiereConciliacionBancaria: reqBanco,
          requiereDocumento: reqDoc,
          createdAt: new Date().toISOString()
        };

        batch.set(accRef, newAccount, { merge: true });
        successCount++;
      }

      await batch.commit();
      await onRefreshData();

      setImportResults({
        successCount,
        errorCount: errors.length,
        errors
      });

      alert(`✅ Plan de Cuentas importado con éxito: ${successCount} cuentas registradas/actualizadas.`);
    } catch (err: any) {
      console.error('Error importing chart of accounts:', err);
      alert('Error en la importación: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // PROCESAMIENTO: IMPORTACIÓN MASIVA DE AUXILIARES
  const handleImportAuxiliares = async () => {
    if (!importText.trim()) {
      alert('Por favor ingrese o pegue los datos del archivo Excel / CSV de Auxiliares.');
      return;
    }

    setIsProcessing(true);
    setImportResults(null);

    try {
      const lines = importText.trim().split('\n');
      const rows = lines.map(l => l.split(/[\t;,]/).map(c => c.trim().replace(/^["']|["']$/g, '')));

      let startIndex = 0;
      if (rows[0][0]?.toLowerCase().includes('rut') || rows[0][1]?.toLowerCase().includes('razon')) {
        startIndex = 1;
      }

      const errors: string[] = [];
      let successCount = 0;
      const batch = writeBatch(db);

      for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 2 || !row[0]) continue;

        const rut = row[0];
        const razonSocial = row[1];
        const nombreFantasia = row[2] || '';
        const giro = row[3] || '';
        const direccion = row[4] || '';
        const comuna = row[5] || '';
        const ciudad = row[6] || '';
        const email = row[7] || '';
        const phone = row[8] || '';

        const isClient = row[9]?.toUpperCase() === 'SI' || row[9]?.toUpperCase() === 'TRUE' || row[9] === '1';
        const isSupplier = row[10]?.toUpperCase() === 'SI' || row[10]?.toUpperCase() === 'TRUE' || row[10] === '1';
        const isEmployee = row[11]?.toUpperCase() === 'SI' || row[11]?.toUpperCase() === 'TRUE' || row[11] === '1';

        const banco = row[12] || '';
        const tipoCuenta = (row[13] as any) || 'Corriente';
        const numeroCuenta = row[14] || '';
        const defaultDebtorAccountId = row[15] || undefined;
        const defaultCreditorAccountId = row[16] || undefined;

        if (!rut || !razonSocial) {
          errors.push(`Fila ${i + 1}: RUT o Razón Social vacía.`);
          continue;
        }

        const auxId = `aux_${rut.replace(/[^a-zA-Z0-9]/g, '')}`;
        const auxRef = doc(companyRef, 'auxiliaries', auxId);

        const newAux: any = {
          rut,
          razonSocial,
          nombreFantasia: nombreFantasia || undefined,
          giro: giro || undefined,
          direccion: direccion || undefined,
          comuna: comuna || undefined,
          ciudad: ciudad || undefined,
          email: email || undefined,
          phone: phone || undefined,
          isClient: isClient || (!isSupplier && !isEmployee), // Default to client if none set
          isSupplier: isSupplier,
          isEmployee: isEmployee,
          banco: banco || undefined,
          tipoCuenta: tipoCuenta || undefined,
          numeroCuenta: numeroCuenta || undefined,
          defaultDebtorAccountId,
          defaultCreditorAccountId,
          estado: 'Activo',
          createdAt: new Date().toISOString()
        };

        batch.set(auxRef, newAux, { merge: true });
        successCount++;
      }

      await batch.commit();
      await onRefreshData();

      setImportResults({
        successCount,
        errorCount: errors.length,
        errors
      });

      alert(`✅ Maestro de Auxiliares importado con éxito: ${successCount} clientes/proveedores registrados.`);
    } catch (err: any) {
      console.error('Error importing auxiliaries:', err);
      alert('Error en la importación de auxiliares: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* HEADER PRINCIPAL */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">📥</span>
            <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">
              Centro de Cargas Masivas y Plantillas de Importación
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Descarga de formatos Excel/CSV estándar e importación masiva para Plan de Cuentas, Clientes, Proveedores y Asientos Contables ({company.name})
          </p>
        </div>
      </div>

      {/* NAVEGACIÓN DE PESTAÑAS */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-2 gap-2">
        <button
          onClick={() => { setActiveTab('descargas'); setImportResults(null); }}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'descargas'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>📁 Descarga de Plantillas Oficiales</span>
        </button>

        <button
          onClick={() => { setActiveTab('importarCuentas'); setImportText(''); setImportResults(null); }}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'importarCuentas'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>📑 Importar Plan de Cuentas</span>
          <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded-full text-[10px]">{accounts.length} actuales</span>
        </button>

        <button
          onClick={() => { setActiveTab('importarAuxiliares'); setImportText(''); setImportResults(null); }}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'importarAuxiliares'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>👥 Importar Clientes y Proveedores (Auxiliares)</span>
          <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded-full text-[10px]">{auxiliaries.length} actuales</span>
        </button>
      </div>

      {/* PESTAÑA 1: TARJETAS DE DESCARGA DE PLANTILLAS */}
      {activeTab === 'descargas' && (
        <div className="bg-white rounded-b-xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 mb-1">
              Formatos Oficiales de Importación Masiva (Excel / CSV)
            </h4>
            <p className="text-xs text-slate-500">
              Descarga la planilla modelo correspondiente, completa los datos en Microsoft Excel o Google Sheets, y cárgala en la sección de importación.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Tarjeta 1: Plan de Cuentas */}
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 flex flex-col justify-between space-y-4 transition-all">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📑</span>
                  <h5 className="font-bold text-sm text-slate-900">Plantilla: Plan de Cuentas</h5>
                </div>
                <p className="text-xs text-slate-600">
                  Formato para cargar el catálogo completo de cuentas contables de la sociedad (Código, Nombre, Tipo, C. Costo, Exige RUT, Conciliación).
                </p>
                <div className="text-[11px] text-slate-500 bg-white p-2.5 rounded-lg border border-slate-200 space-y-1">
                  <div><strong>Columnas:</strong> Codigo, Nombre, Tipo, Padre, CC, RUT, Banco, Doc</div>
                  <div><strong>Uso típico:</strong> Inicio de contabilidad de la empresa.</div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-200">
                <button
                  onClick={downloadPlanCuentasTemplate}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2"
                >
                  <span>📥</span>
                  <span>Descargar Plantilla Plan de Cuentas</span>
                </button>
                <button
                  onClick={() => setActiveTab('importarCuentas')}
                  className="w-full py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition-colors"
                >
                  Ir a Importar Cuentas →
                </button>
              </div>
            </div>

            {/* Tarjeta 2: Clientes y Proveedores (Auxiliares) */}
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 flex flex-col justify-between space-y-4 transition-all">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">👥</span>
                  <h5 className="font-bold text-sm text-slate-900">Plantilla: Clientes y Proveedores</h5>
                </div>
                <p className="text-xs text-slate-600">
                  Formato para importar la cartera de clientes, proveedores y honorarios con sus datos bancarios y cuentas contables predeterminadas.
                </p>
                <div className="text-[11px] text-slate-500 bg-white p-2.5 rounded-lg border border-slate-200 space-y-1">
                  <div><strong>Columnas:</strong> RUT, RazonSocial, Giro, Email, Banco, CtaBanco, CtaCobrar, CtaPagar</div>
                  <div><strong>Uso típico:</strong> Migración de cartera y nóminas de transferencia.</div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-200">
                <button
                  onClick={downloadAuxiliaresTemplate}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2"
                >
                  <span>📥</span>
                  <span>Descargar Plantilla Auxiliares</span>
                </button>
                <button
                  onClick={() => setActiveTab('importarAuxiliares')}
                  className="w-full py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition-colors"
                >
                  Ir a Importar Auxiliares →
                </button>
              </div>
            </div>

            {/* Tarjeta 3: Comprobantes Contables */}
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 flex flex-col justify-between space-y-4 transition-all">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚡</span>
                  <h5 className="font-bold text-sm text-slate-900">Plantilla: Comprobantes Contables</h5>
                </div>
                <p className="text-xs text-slate-600">
                  Formato multilínea para importar asientos de apertura, cierres de año, ajustes contables y comprobantes por lote con partida doble.
                </p>
                <div className="text-[11px] text-slate-500 bg-white p-2.5 rounded-lg border border-slate-200 space-y-1">
                  <div><strong>Columnas:</strong> NumComprobante, Fecha, Tipo, Cuenta, Debe, Haber, RUT, Doc</div>
                  <div><strong>Uso típico:</strong> Asientos de apertura o migración histórica.</div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-200">
                <button
                  onClick={downloadComprobantesTemplate}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2"
                >
                  <span>📥</span>
                  <span>Descargar Plantilla Comprobantes</span>
                </button>
                <div className="text-center">
                  <span className="text-[10px] text-slate-500">Disponible en sub-menú: ⚡ Carga Masiva Comprobantes</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 2: IMPORTAR PLAN DE CUENTAS */}
      {activeTab === 'importarCuentas' && (
        <div className="bg-white rounded-b-xl border border-slate-200 shadow-xs p-6 space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Importación Masiva de Plan de Cuentas
              </h4>
              <p className="text-xs text-slate-500">
                Pega el contenido copiado desde Excel (separado por tabulaciones) o CSV (separado por punto y coma / comas).
              </p>
            </div>
            <button
              onClick={downloadPlanCuentasTemplate}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 transition-colors flex items-center gap-1.5"
            >
              <span>📥</span>
              <span>Descargar Plantilla CSV</span>
            </button>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              Copiar y Pegar Datos desde Excel o archivo CSV:
            </label>
            <textarea
              rows={9}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="CodigoCuenta	NombreCuenta	TipoCuenta	CodigoPadre	RequiereCC	RequiereRUT	RequiereBanco	RequiereDoc&#10;1.1.01.001	Caja Central	Activo	1.1.01	NO	NO	NO	NO&#10;1.1.02.001	Banco Chile	Activo	1.1.02	NO	NO	SI	NO&#10;1.1.03.001	Clientes Nacionales	Activo	1.1.03	NO	SI	NO	SI"
              className="w-full p-3 font-mono text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50"
            />
            <div className="flex justify-between items-center text-[11px] text-slate-500">
              <span>Estructura: Código; Nombre; Tipo; Padre; ReqCC; ReqRUT; ReqBanco; ReqDoc</span>
              <span>{importText.trim() ? `${importText.trim().split('\n').length} líneas detectadas` : '0 líneas'}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setImportText('')}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Limpiar
            </button>
            <button
              type="button"
              disabled={isProcessing || !importText.trim()}
              onClick={handleImportPlanCuentas}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black rounded-lg shadow-xs transition-colors flex items-center gap-2"
            >
              <span>⚡</span>
              <span>{isProcessing ? 'Procesando e Importando...' : 'Importar y Guardar Cuentas'}</span>
            </button>
          </div>

          {/* RESULTADOS DE IMPORTACIÓN */}
          {importResults && (
            <div className={`p-4 rounded-xl border text-xs ${
              importResults.errorCount === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}>
              <div className="font-bold flex items-center gap-2">
                <span>{importResults.errorCount === 0 ? '✅' : '⚠️'}</span>
                <span>
                  Resumen: {importResults.successCount} cuentas importadas correctamente. {importResults.errorCount > 0 && `(${importResults.errorCount} errores encontrados)`}
                </span>
              </div>
              {importResults.errors.length > 0 && (
                <ul className="mt-2 list-disc list-inside space-y-1 font-mono text-[11px]">
                  {importResults.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA 3: IMPORTAR AUXILIARES (CLIENTES Y PROVEEDORES) */}
      {activeTab === 'importarAuxiliares' && (
        <div className="bg-white rounded-b-xl border border-slate-200 shadow-xs p-6 space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Importación Masiva de Clientes, Proveedores y Empleados (Auxiliares)
              </h4>
              <p className="text-xs text-slate-500">
                Carga masiva de auxiliares con RUT chileno, razón social, contactos y datos de transferencia bancaria.
              </p>
            </div>
            <button
              onClick={downloadAuxiliaresTemplate}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 transition-colors flex items-center gap-1.5"
            >
              <span>📥</span>
              <span>Descargar Plantilla Auxiliares</span>
            </button>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              Copiar y Pegar Datos desde Excel o archivo CSV:
            </label>
            <textarea
              rows={9}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="RUT	RazonSocial	NombreFantasia	Giro	Direccion	Comuna	Ciudad	Email	Telefono	EsCliente	EsProveedor	EsEmpleado	Banco	TipoCuenta	NumeroCuenta	CtaCobrar	CtaPagar&#10;76.123.456-7	COMERCIAL SUR LIMITADA	Comercial Sur	Insumos	Av Providencia 123	Providencia	Santiago	contacto@sur.cl	+56911223344	SI	NO	NO	Banco de Chile	Corriente	123456789	1.1.03.001	&#10;77.987.654-3	INDUSTRIAL SPA	Industrial	Servicios	Calle Los Boldos	Concepcion	Concepcion	pagos@industrial.cl	+56999887766	NO	SI	NO	Banco Santander	Corriente	987654321		2.1.01.001"
              className="w-full p-3 font-mono text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50"
            />
            <div className="flex justify-between items-center text-[11px] text-slate-500">
              <span>Estructura: RUT; RazónSocial; NombreFantasía; Giro; Dirección; Comuna; Ciudad; Email; Teléfono; EsCliente; EsProveedor; EsEmpleado; Banco; TipoCuenta; NroCuenta; CtaCobrar; CtaPagar</span>
              <span>{importText.trim() ? `${importText.trim().split('\n').length} líneas detectadas` : '0 líneas'}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setImportText('')}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Limpiar
            </button>
            <button
              type="button"
              disabled={isProcessing || !importText.trim()}
              onClick={handleImportAuxiliares}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black rounded-lg shadow-xs transition-colors flex items-center gap-2"
            >
              <span>⚡</span>
              <span>{isProcessing ? 'Procesando e Importando...' : 'Importar y Guardar Auxiliares'}</span>
            </button>
          </div>

          {/* RESULTADOS DE IMPORTACIÓN */}
          {importResults && (
            <div className={`p-4 rounded-xl border text-xs ${
              importResults.errorCount === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}>
              <div className="font-bold flex items-center gap-2">
                <span>{importResults.errorCount === 0 ? '✅' : '⚠️'}</span>
                <span>
                  Resumen: {importResults.successCount} auxiliares registrados/actualizados. {importResults.errorCount > 0 && `(${importResults.errorCount} errores encontrados)`}
                </span>
              </div>
              {importResults.errors.length > 0 && (
                <ul className="mt-2 list-disc list-inside space-y-1 font-mono text-[11px]">
                  {importResults.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
