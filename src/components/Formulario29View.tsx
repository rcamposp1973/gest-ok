import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, addDoc, updateDoc } from 'firebase/firestore';
import { getOfficialUTM } from '../utils/chileanEconomicIndicators';
import { getLatestOpenPeriod } from '../utils/periodUtils';
import {
  Company,
  ChartOfAccount,
  RCVDocument,
  Voucher,
  FiscalPeriodYear,
  F29Declaration,
  F29TaxSettings,
  F29DebitoFiscal,
  F29CreditoFiscal,
  F29Retenciones,
  F29PPM,
  F29ResumenTotal,
  CustomF29Code,
  F29AccountingParams
} from '../types';
import { sanitizeVoucherLines } from '../utils/voucherValidation';

interface Formulario29ViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  rcvDocuments: RCVDocument[];
  vouchers: Voucher[];
  fiscalYears: FiscalPeriodYear[];
  onVouchersUpdated?: () => void;
}

export default function Formulario29View({
  studyId,
  company,
  accounts,
  rcvDocuments,
  vouchers,
  fiscalYears,
  onVouchersUpdated
}: Formulario29ViewProps) {
  // Default tax period: most recent open month in the system
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => getLatestOpenPeriod(fiscalYears));
  const [activeTab, setActiveTab] = useState<'formulario' | 'auditoria' | 'parametros' | 'historial'>('formulario');
  const [loading, setLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [savedDeclarations, setSavedDeclarations] = useState<F29Declaration[]>([]);

  // Default Tax Settings
  const [taxSettings, setTaxSettings] = useState<F29TaxSettings>({
    regimenTributario: '14_D3_PROPYME_GENERAL',
    ppmRate: 0.25, // 0.25% default para ProPyme General inicio
    previousMonthRemanenteUTM: 0,
    utmValue: getOfficialUTM(getLatestOpenPeriod(fiscalYears)),
    honorariosTaxRate: 13.75, // Tasa retención 2024-2025 (13.75% / 14.5%)
    impuestoUnicoSegundaCategoria: 0,
    ivaUsoComunFactor: 1.0,
    retencionCambioSujeto: 0,
    prestamoSolidarioRetencion: 0,
    ivaPostergadoActivo: false,
    ivaPostergadoMonto: 0
  });

  // IVA Postergado State (Cód. 756 / 776)
  const [ivaPostergadoActivo, setIvaPostergadoActivo] = useState<boolean>(false);
  const [ivaPostergadoMonto, setIvaPostergadoMonto] = useState<number>(0);

  // Maestro de Códigos F.29 (Activación por empresa)
  const [f29CodeSettings, setF29CodeSettings] = useState<{ [key: string]: boolean }>({
    debito: true,
    credito: true,
    remanente504: true,
    posterga756: true,
    honorarios151: true,
    impuestoUnico48: true,
    retencionTerceros: true,
    ppm062: true,
    otrosImpuestos: true
  });

  // Códigos Adicionales por Giro / Personalizados
  const [customCodes, setCustomCodes] = useState<CustomF29Code[]>(() => company.customF29Codes || [
    { id: 'c_542', code: '542', name: 'Retención Harinas (12%)', section: 'Retencion', amount: 0, active: false },
    { id: 'c_543', code: '543', name: 'Retención Carnes (5%)', section: 'Retencion', amount: 0, active: false },
    { id: 'c_545', code: '545', name: 'Impuesto Específico Combustibles', section: 'ImpuestoAdicional', amount: 0, active: false },
    { id: 'c_586', code: '586', name: 'ILA Vinos y Chichas (20.5%)', section: 'ImpuestoAdicional', amount: 0, active: false },
    { id: 'c_587', code: '587', name: 'ILA Cervezas (20.5%)', section: 'ImpuestoAdicional', amount: 0, active: false },
    { id: 'c_588', code: '588', name: 'ILA Licores y Destilados (31.5%)', section: 'ImpuestoAdicional', amount: 0, active: false },
    { id: 'c_589', code: '589', name: 'ILA Bebidas Analcohólicas (10%/18%)', section: 'ImpuestoAdicional', amount: 0, active: false },
    { id: 'c_763', code: '763', name: 'Retención Fletes y Transporte', section: 'Retencion', amount: 0, active: false }
  ]);

  // Cuentas Contables Configurables para Centralización F29 y Corrección Monetaria
  const [f29AccountParams, setF29AccountParams] = useState<F29AccountingParams>(() => company.f29AccountParams || {
    ivaDebitoAccountId: accounts.find(a => a.code.startsWith('2-1-03-01'))?.id || '',
    ivaCreditoAccountId: accounts.find(a => a.code.startsWith('1-1-07-01'))?.id || '',
    ivaPagarAccountId: accounts.find(a => a.code.startsWith('2-1-03-02'))?.id || '',
    remanenteAccountId: accounts.find(a => a.code.startsWith('1-1-07-02'))?.id || '',
    correccionMonetariaAccountId: accounts.find(a => a.code.startsWith('4-3-01-01') || a.code.startsWith('5-3-01-01') || a.name.toLowerCase().includes('correcci') || a.name.toLowerCase().includes('reajuste'))?.id || '',
    ivaPostergadoAccountId: accounts.find(a => a.code.startsWith('2-1-03-05') || a.name.toLowerCase().includes('postergado'))?.id || '',
    ppmAccountId: accounts.find(a => a.code.startsWith('1-1-07-03') || a.name.toLowerCase().includes('ppm'))?.id || '',
    retencionHonorariosAccountId: accounts.find(a => a.code.startsWith('2-1-03-03'))?.id || '',
    impuestoUnicoAccountId: accounts.find(a => a.code.startsWith('2-1-03-04'))?.id || '',
    impuestosPorPagarAccountId: accounts.find(a => a.code.startsWith('2-1-03-99') || a.name.toLowerCase().includes('f29'))?.id || ''
  });

  // Manual Adjustments for Audit & Additional Fields
  const [manualAdjustments, setManualAdjustments] = useState<{
    debitoAjuste: number;
    creditoAjuste: number;
    remanenteManualPesos: number;
    impuestoUnicoManual: number;
    retencionTercerosManual: number;
    otrosImpuestosManual: number;
    ppmAdicionalManual: number;
    prestamoSolidarioManual: number;
    notes: string;
  }>({
    debitoAjuste: 0,
    creditoAjuste: 0,
    remanenteManualPesos: 0,
    impuestoUnicoManual: 0,
    retencionTercerosManual: 0,
    otrosImpuestosManual: 0,
    ppmAdicionalManual: 0,
    prestamoSolidarioManual: 0,
    notes: ''
  });

  // Declaration Status, Folio & PDF Summary
  const [declarationStatus, setDeclarationStatus] = useState<'Borrador' | 'Validado' | 'Declarado' | 'Pagado'>('Borrador');
  const [folioSII, setFolioSII] = useState<string>('');
  const [pdfResumenUrl, setPdfResumenUrl] = useState<string>('');

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);

  // Fetch Saved Declarations & Saved Tax Settings
  const fetchDeclarations = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(companyRef, 'f29Declarations'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as F29Declaration));
      list.sort((a, b) => b.period.localeCompare(a.period));
      setSavedDeclarations(list);

      // Check if declaration exists for current period
      const existing = list.find(d => d.period === selectedPeriod);
      if (existing) {
        setDeclarationStatus(existing.status);
        setFolioSII(existing.folioSII || '');
        setPdfResumenUrl(existing.pdfResumenUrl || '');
        if (existing.f29CodeSettings) {
          setF29CodeSettings(existing.f29CodeSettings);
        } else if (company.f29CodeSettings) {
          setF29CodeSettings(company.f29CodeSettings);
        }
        setTaxSettings({
          ...existing.settings,
          utmValue: existing.settings?.utmValue || getOfficialUTM(selectedPeriod),
          impuestoUnicoSegundaCategoria: existing.retenciones?.impuestoUnicoTrabajadores || existing.settings?.impuestoUnicoSegundaCategoria || 0,
          prestamoSolidarioRetencion: existing.retenciones?.prestamoSolidario || existing.settings?.prestamoSolidarioRetencion || 0
        });
        setManualAdjustments({
          debitoAjuste: 0,
          creditoAjuste: 0,
          remanenteManualPesos: existing.creditoFiscal?.remanenteMesAnteriorPesos || 0,
          impuestoUnicoManual: existing.retenciones?.impuestoUnicoTrabajadores || 0,
          retencionTercerosManual: existing.retenciones?.retencionTerceros || 0,
          otrosImpuestosManual: existing.resumen?.otrosImpuestos || 0,
          ppmAdicionalManual: 0,
          prestamoSolidarioManual: existing.retenciones?.prestamoSolidario || 0,
          notes: existing.notes || ''
        });
      } else {
        // PERIODO NUEVO / SIN GUARDAR
        if (company.f29CodeSettings) {
          setF29CodeSettings(company.f29CodeSettings);
        }
        // 1. Heredar la Tasa de PPM del mes anterior más reciente (o última declaración guardada)
        // 2. Heredar el nuevo remanente UTM generado en el mes anterior (si hubo)
        // 3. Cargar la UTM Oficial correspondiente al período seleccionado
        const [currYear, currMonth] = selectedPeriod.split('-').map(Number);
        const prevMonthNum = currMonth === 1 ? 12 : currMonth - 1;
        const prevYearNum = currMonth === 1 ? currYear - 1 : currYear;
        const prevPeriodStr = `${prevYearNum}-${String(prevMonthNum).padStart(2, '0')}`;

        const prevDec = list.find(d => d.period === prevPeriodStr) || list.find(d => d.period < selectedPeriod);
        
        let inheritedPpmRate = 0.25;
        let inheritedRemanenteUTM = 0;
        let inheritedRegimen: any = '14_D3_PROPYME_GENERAL';
        let inheritedHonorariosRate = 13.75;
        let inheritedImpuestoUnico = 0;

        if (prevDec) {
          if (prevDec.settings?.ppmRate !== undefined) {
            inheritedPpmRate = prevDec.settings.ppmRate;
          } else if (prevDec.ppm?.tasaPPM !== undefined) {
            inheritedPpmRate = prevDec.ppm.tasaPPM;
          }
          if (prevDec.settings?.regimenTributario) {
            inheritedRegimen = prevDec.settings.regimenTributario;
          }
          if (prevDec.settings?.honorariosTaxRate) {
            inheritedHonorariosRate = prevDec.settings.honorariosTaxRate;
          }
          if (prevDec.retenciones?.impuestoUnicoTrabajadores) {
            inheritedImpuestoUnico = prevDec.retenciones.impuestoUnicoTrabajadores;
          }
          // Si el mes anterior generó remanente a favor para el siguiente mes (Cód. 77)
          if (prevDec.resumen?.remanenteParaSiguienteMesUTM !== undefined) {
            inheritedRemanenteUTM = prevDec.resumen.remanenteParaSiguienteMesUTM;
          }
        }

        const periodUTM = getOfficialUTM(selectedPeriod);

        setDeclarationStatus('Borrador');
        setFolioSII('');
        setTaxSettings(prev => ({
          ...prev,
          ppmRate: inheritedPpmRate,
          regimenTributario: inheritedRegimen,
          honorariosTaxRate: inheritedHonorariosRate,
          previousMonthRemanenteUTM: inheritedRemanenteUTM,
          utmValue: periodUTM,
          impuestoUnicoSegundaCategoria: inheritedImpuestoUnico
        }));
        setManualAdjustments({
          debitoAjuste: 0,
          creditoAjuste: 0,
          remanenteManualPesos: 0,
          impuestoUnicoManual: inheritedImpuestoUnico,
          retencionTercerosManual: 0,
          otrosImpuestosManual: 0,
          ppmAdicionalManual: 0,
          prestamoSolidarioManual: 0,
          notes: ''
        });
      }
    } catch (err) {
      console.error('Error fetching F29 declarations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeclarations();
  }, [company.id, selectedPeriod]);

  // Documents of the period from RCV
  const periodDocs = useMemo(() => {
    return rcvDocuments.filter(doc => {
      const docPeriod = doc.period || (doc.fechaEmision ? doc.fechaEmision.slice(0, 7) : '');
      return docPeriod === selectedPeriod;
    });
  }, [rcvDocuments, selectedPeriod]);

  // 1. CALCULATE DÉBITO FISCAL (VENTAS)
  const debitoFiscalData: F29DebitoFiscal = useMemo(() => {
    const ventasDocs = periodDocs.filter(d => d.tipoRegistro === 'Venta');

    let ventasAfectasNeto = 0;
    let debitoFacturasEmitidas = 0;
    let ventasBoletasNeto = 0;
    let debitoBoletasEmitidas = 0;
    let debitoNotasDebito = 0;
    let creditoNotasCreditoEmitidas = 0;
    let ventasExentasTotal = 0;

    ventasDocs.forEach(doc => {
      const t = doc.tipoDoc;
      const net = doc.montoNeto || 0;
      const iva = doc.montoIva || 0;
      const exento = doc.montoExento || 0;

      ventasExentasTotal += exento;

      if (t === '33' || t === '30' || t === 'Factura' || t === 'Factura Electrónica') {
        ventasAfectasNeto += net;
        debitoFacturasEmitidas += iva;
      } else if (t === '39' || t === '41' || t === 'Boleta' || t === 'Boleta Electrónica') {
        ventasBoletasNeto += net;
        debitoBoletasEmitidas += iva;
      } else if (t === '56' || t === 'Nota de Débito' || t === 'Nota de Débito Electrónica') {
        debitoNotasDebito += iva;
        ventasAfectasNeto += net;
      } else if (t === '61' || t === 'Nota de Crédito' || t === 'Nota de Crédito Electrónica') {
        creditoNotasCreditoEmitidas += iva;
        ventasAfectasNeto -= net;
      } else if (t === '34' || t === 'Factura Exenta') {
        ventasExentasTotal += net;
      } else {
        ventasAfectasNeto += net;
        debitoFacturasEmitidas += iva;
      }
    });

    const totalDebitoFiscal = Math.max(0, debitoFacturasEmitidas + debitoBoletasEmitidas + debitoNotasDebito - creditoNotasCreditoEmitidas + manualAdjustments.debitoAjuste);

    return {
      ventasAfectasNeto,
      debitoFacturasEmitidas,
      ventasBoletasNeto,
      debitoBoletasEmitidas,
      debitoNotasDebito,
      creditoNotasCreditoEmitidas,
      totalDebitoFiscal,
      ventasExentasTotal,
      docsCount: ventasDocs.length
    };
  }, [periodDocs, manualAdjustments.debitoAjuste]);

  // 2. CALCULATE CRÉDITO FISCAL (COMPRAS)
  const creditoFiscalData: F29CreditoFiscal = useMemo(() => {
    const comprasDocs = periodDocs.filter(d => d.tipoRegistro === 'Compra');

    let comprasGiroNeto = 0;
    let creditoFacturasRecibidas = 0;
    let comprasActivoFijoNeto = 0;
    let creditoActivoFijo = 0;
    let creditoNotasDebitoRecibidas = 0;
    let debitoNotasCreditoRecibidas = 0;
    let ivaNoRecuperable = 0;
    let ivaUsoComunTotal = 0;

    comprasDocs.forEach(doc => {
      const t = doc.tipoDoc;
      const net = doc.montoNeto || 0;
      const iva = doc.montoIva || 0;
      const tipoCompra = (doc as any).tipoCompra || 'Giro';

      if (tipoCompra === 'Activo Fijo') {
        comprasActivoFijoNeto += net;
        creditoActivoFijo += iva;
      } else if (tipoCompra === 'No Recuperable' || tipoCompra === 'Supermercado') {
        ivaNoRecuperable += iva;
      } else if (tipoCompra === 'Uso Común') {
        ivaUsoComunTotal += iva;
      } else {
        if (t === '56' || t === 'Nota de Débito') {
          creditoNotasDebitoRecibidas += iva;
          comprasGiroNeto += net;
        } else if (t === '61' || t === 'Nota de Crédito') {
          debitoNotasCreditoRecibidas += iva;
          comprasGiroNeto -= net;
        } else {
          comprasGiroNeto += net;
          creditoFacturasRecibidas += iva;
        }
      }
    });

    const ivaUsoComunRecuperable = Math.round(ivaUsoComunTotal * (taxSettings.ivaUsoComunFactor || 1.0));
    
    // Cálculo Remanente y Corrección Monetaria / Reajuste Art. 27 DL 825
    const [currYear, currMonth] = selectedPeriod.split('-').map(Number);
    const prevMonthNum = currMonth === 1 ? 12 : currMonth - 1;
    const prevYearNum = currMonth === 1 ? currYear - 1 : currYear;
    const prevPeriodStr = `${prevYearNum}-${String(prevMonthNum).padStart(2, '0')}`;
    const prevMonthUTM = getOfficialUTM(prevPeriodStr);

    const remanenteMesAnteriorUTM = taxSettings.previousMonthRemanenteUTM || 0;
    const remanenteHistoricoPesos = Math.round(remanenteMesAnteriorUTM * prevMonthUTM);
    const remanenteMesAnteriorPesos = manualAdjustments.remanenteManualPesos > 0
      ? manualAdjustments.remanenteManualPesos
      : Math.round(remanenteMesAnteriorUTM * taxSettings.utmValue);
    
    // Reajuste DL 825 Art. 27: Variación UTM = (UTM Actual - UTM Anterior) * Remanente UTM
    const reajusteCorreccionMonetariaRemanente = Math.max(0, remanenteMesAnteriorPesos - remanenteHistoricoPesos);

    const totalCreditoFiscal = Math.max(
      0,
      creditoFacturasRecibidas +
      creditoActivoFijo +
      creditoNotasDebitoRecibidas +
      ivaUsoComunRecuperable +
      remanenteMesAnteriorPesos -
      debitoNotasCreditoRecibidas +
      manualAdjustments.creditoAjuste
    );

    return {
      comprasGiroNeto,
      creditoFacturasRecibidas,
      comprasActivoFijoNeto,
      creditoActivoFijo,
      creditoNotasDebitoRecibidas,
      debitoNotasCreditoRecibidas,
      ivaNoRecuperable,
      ivaUsoComunTotal,
      ivaUsoComunRecuperable,
      remanenteMesAnteriorUTM,
      remanenteMesAnteriorPesos,
      remanenteHistoricoPesos,
      reajusteCorreccionMonetariaRemanente,
      totalCreditoFiscal,
      docsCount: comprasDocs.length
    };
  }, [periodDocs, taxSettings, selectedPeriod, manualAdjustments.creditoAjuste, manualAdjustments.remanenteManualPesos]);

  // 3. CALCULATE RETENCIONES (HONORARIOS & SUELDOS)
  const retencionesData: F29Retenciones = useMemo(() => {
    const honorariosDocs = periodDocs.filter(d => d.tipoRegistro === 'Honorarios');

    let baseHonorariosBruto = 0;
    let retencionHonorarios = 0;

    if (f29CodeSettings.honorarios151 !== false) {
      honorariosDocs.forEach(doc => {
        const brut = doc.montoTotal || 0;
        const ret = doc.montoIva || Math.round(brut * (taxSettings.honorariosTaxRate / 100));
        baseHonorariosBruto += brut;
        retencionHonorarios += ret;
      });
    }

    const impuestoUnicoTrabajadores = (f29CodeSettings.impuestoUnico48 !== false)
      ? (manualAdjustments.impuestoUnicoManual || taxSettings.impuestoUnicoSegundaCategoria || 0)
      : 0;

    const retencionTerceros = (f29CodeSettings.retencionTerceros !== false)
      ? (manualAdjustments.retencionTercerosManual || 0)
      : 0;

    const prestamoSolidario = manualAdjustments.prestamoSolidarioManual || taxSettings.prestamoSolidarioRetencion || 0;

    const totalRetenciones = retencionHonorarios + impuestoUnicoTrabajadores + retencionTerceros + prestamoSolidario;

    return {
      baseHonorariosBruto,
      retencionHonorarios,
      retencionTerceros,
      impuestoUnicoTrabajadores,
      prestamoSolidario,
      totalRetenciones,
      docsCount: honorariosDocs.length
    };
  }, [periodDocs, taxSettings, manualAdjustments.impuestoUnicoManual, manualAdjustments.retencionTercerosManual, manualAdjustments.prestamoSolidarioManual, f29CodeSettings]);

  // 4. CALCULATE PPM (PAGOS PROVISIONALES MENSUALES)
  const ppmData: F29PPM = useMemo(() => {
    if (f29CodeSettings.ppm062 === false) {
      return {
        baseImponibleVentas: 0,
        tasaPPM: 0,
        montoPPM: 0
      };
    }

    // Base Imponible de Ingresos Brutos = Ventas Afectas Netas + Ventas Exentas
    const baseImponibleVentas = Math.max(0, debitoFiscalData.ventasAfectasNeto + debitoFiscalData.ventasBoletasNeto + debitoFiscalData.ventasExentasTotal);
    const tasaPPM = taxSettings.ppmRate || 0.25;
    const montoPPM = Math.round(baseImponibleVentas * (tasaPPM / 100));

    return {
      baseImponibleVentas,
      tasaPPM,
      montoPPM
    };
  }, [debitoFiscalData, taxSettings.ppmRate, f29CodeSettings.ppm062]);

  // 5. RESUMEN DETERMINACIÓN FINAL F29 CON IVA POSTERGADO Y CÓDIGOS ADICIONALES POR GIRO
  const resumenF29: F29ResumenTotal = useMemo(() => {
    const diffIVA = debitoFiscalData.totalDebitoFiscal - creditoFiscalData.totalCreditoFiscal;
    let ivaPagar = 0;
    let remanenteParaSiguienteMes = 0;
    let remanenteParaSiguienteMesUTM = 0;

    if (diffIVA > 0) {
      ivaPagar = diffIVA;
    } else {
      remanenteParaSiguienteMes = Math.abs(diffIVA);
      remanenteParaSiguienteMesUTM = taxSettings.utmValue > 0 ? parseFloat((remanenteParaSiguienteMes / taxSettings.utmValue).toFixed(2)) : 0;
    }

    // Suma de Códigos Adicionales por Giro
    const totalCustomCodes = customCodes
      .filter(c => c.active && (c.amount || 0) > 0)
      .reduce((s, c) => s + (c.amount || 0), 0);

    // IVA Postergado (Cód. 756 / Ley ProPyme)
    const ivaPostergado = (ivaPostergadoActivo && ivaPagar > 0)
      ? Math.min(ivaPagar, (ivaPostergadoMonto > 0 ? ivaPostergadoMonto : ivaPagar))
      : 0;

    const ivaPagarNetoPostergacion = Math.max(0, ivaPagar - ivaPostergado);

    const retencionesPagar = retencionesData.totalRetenciones + (manualAdjustments.retencionTercerosManual || 0);
    const ppmPagar = ppmData.montoPPM + (manualAdjustments.ppmAdicionalManual || 0);
    const otrosImpuestos = (taxSettings.retencionCambioSujeto || 0) + (manualAdjustments.otrosImpuestosManual || 0);

    const totalPagarF29 = ivaPagarNetoPostergacion + retencionesPagar + ppmPagar + otrosImpuestos + totalCustomCodes;

    return {
      ivaPagar,
      ivaPostergado,
      ivaPagarNetoPostergacion,
      remanenteParaSiguienteMes,
      remanenteParaSiguienteMesUTM,
      reajusteCorreccionMonetaria: creditoFiscalData.reajusteCorreccionMonetariaRemanente || 0,
      retencionesPagar,
      ppmPagar,
      otrosImpuestos,
      customCodesTotal: totalCustomCodes,
      totalPagarF29
    };
  }, [debitoFiscalData, creditoFiscalData, retencionesData, ppmData, taxSettings, manualAdjustments, ivaPostergadoActivo, ivaPostergadoMonto, customCodes]);

  // Handle Save F29 Declaration to Firestore
  const handleSaveDeclaration = async () => {
    setIsSubmitting(true);
    try {
      const declarationId = `${company.rut.replace(/[^a-zA-Z0-9]/g, '')}_${selectedPeriod}`;
      const payload: F29Declaration = {
        id: declarationId,
        period: selectedPeriod,
        status: declarationStatus,
        folioSII: folioSII || undefined,
        pdfResumenUrl: pdfResumenUrl || undefined,
        f29CodeSettings,
        customCodes,
        f29AccountParams,
        declarationDate: declarationStatus === 'Declarado' || declarationStatus === 'Pagado' ? new Date().toISOString() : undefined,
        settings: {
          ...taxSettings,
          ivaPostergadoActivo,
          ivaPostergadoMonto
        },
        debitoFiscal: debitoFiscalData,
        creditoFiscal: creditoFiscalData,
        retenciones: {
          ...retencionesData,
          retencionTerceros: manualAdjustments.retencionTercerosManual || 0
        },
        ppm: ppmData,
        resumen: resumenF29,
        notes: manualAdjustments.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(companyRef, 'f29Declarations', declarationId), payload);
      alert(`✅ Declaración F29 del período ${selectedPeriod} guardada exitosamente con estado: ${declarationStatus}.`);
      fetchDeclarations();
    } catch (err: any) {
      console.error('Error saving F29:', err);
      alert('Error al guardar F29: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Guardar Parámetros de Cuentas y Códigos Adicionales en la Empresa
  const handleSaveCompanyF29Settings = async () => {
    setIsSubmitting(true);
    try {
      await updateDoc(companyRef, {
        f29CodeSettings,
        f29AccountParams,
        customF29Codes: customCodes,
        updatedAt: new Date().toISOString()
      });
      alert('✅ Parámetros de Cuentas Contables y Maestro de Códigos F.29 guardados exitosamente para la empresa.');
    } catch (err: any) {
      console.error('Error saving company F29 settings:', err);
      alert('Error al guardar parámetros: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Centralize F29 in General Ledger (Asiento Contable de Liquidación de Impuestos con Corrección Monetaria)
  const handleCentralizeF29Voucher = async () => {
    if (!confirm(`¿Desea generar automáticamente el Asiento Contable de Centralización y Liquidación de Impuestos F29 para el período ${selectedPeriod}?`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const nextVoucherNumber = (vouchers.length > 0 ? Math.max(...vouchers.map(v => v.voucherNumber || 0)) : 0) + 1;

      // Helper para buscar cuenta asignada en parámetros o sugerida del plan de cuentas
      const getAccountByIdOrPrefix = (accId: string | undefined, defaultPrefix: string, fallbackName: string) => {
        if (accId) {
          const acc = accounts.find(a => a.id === accId);
          if (acc) return acc;
        }
        const found = accounts.find(a => a.code.startsWith(defaultPrefix) || a.name.toLowerCase().includes(fallbackName.toLowerCase()));
        return found || { id: `acc_${defaultPrefix}`, code: defaultPrefix, name: fallbackName };
      };

      const accIvaDebito = getAccountByIdOrPrefix(f29AccountParams.ivaDebitoAccountId, '2-1-03-01', 'IVA Débito Fiscal');
      const accIvaCredito = getAccountByIdOrPrefix(f29AccountParams.ivaCreditoAccountId, '1-1-07-01', 'IVA Crédito Fiscal');
      const accIvaPagar = getAccountByIdOrPrefix(f29AccountParams.ivaPagarAccountId, '2-1-03-02', 'IVA por Pagar');
      const accRemanente = getAccountByIdOrPrefix(f29AccountParams.remanenteAccountId, '1-1-07-02', 'Remanente Crédito Fiscal');
      const accCorreccionMonetaria = getAccountByIdOrPrefix(f29AccountParams.correccionMonetariaAccountId, '4-3-01-01', 'Corrección Monetaria / Reajuste Remanente');
      const accIvaPostergado = getAccountByIdOrPrefix(f29AccountParams.ivaPostergadoAccountId, '2-1-03-05', 'IVA Postergado por Pagar');
      const accPPMActivo = getAccountByIdOrPrefix(f29AccountParams.ppmAccountId, '1-1-07-03', 'Pagos Provisionales Mensuales (PPM)');
      const accRetencionHonorarios = getAccountByIdOrPrefix(f29AccountParams.retencionHonorariosAccountId, '2-1-03-03', 'Retención Honorarios 2da Cat');
      const accImpuestoUnico = getAccountByIdOrPrefix(f29AccountParams.impuestoUnicoAccountId, '2-1-03-04', 'Impuesto Único por Pagar');
      const accImpuestosPorPagarTotal = getAccountByIdOrPrefix(f29AccountParams.impuestosPorPagarAccountId, '2-1-03-99', 'Impuestos Mensuales F29 por Pagar');

      const lines: any[] = [];

      // 1. REAJUSTE / CORRECCIÓN MONETARIA DEL REMANENTE ANTERIOR (Art. 27 DL 825)
      if (creditoFiscalData.reajusteCorreccionMonetariaRemanente && creditoFiscalData.reajusteCorreccionMonetariaRemanente > 0) {
        lines.push({
          id: 'line_reajuste_remanente_debe',
          accountId: accRemanente.id,
          accountCode: accRemanente.code,
          accountName: accRemanente.name,
          debit: creditoFiscalData.reajusteCorreccionMonetariaRemanente,
          credit: 0,
          documentRef: `F29 ${selectedPeriod}`,
          gloss: `Reajuste Art. 27 DL 825 Remanente (${creditoFiscalData.remanenteMesAnteriorUTM} UTM) F29 ${selectedPeriod}`
        });
        lines.push({
          id: 'line_reajuste_remanente_haber',
          accountId: accCorreccionMonetaria.id,
          accountCode: accCorreccionMonetaria.code,
          accountName: accCorreccionMonetaria.name,
          debit: 0,
          credit: creditoFiscalData.reajusteCorreccionMonetariaRemanente,
          documentRef: `F29 ${selectedPeriod}`,
          gloss: `Ganancia Corrección Monetaria Reajuste Remanente F29 ${selectedPeriod}`
        });
      }

      // 2. Liquidación IVA Débito (Al DEBE para saldar la cuenta pasiva de IVA Débito acumulada en ventas)
      if (debitoFiscalData.totalDebitoFiscal > 0) {
        lines.push({
          id: 'line_debito',
          accountId: accIvaDebito.id,
          accountCode: accIvaDebito.code,
          accountName: accIvaDebito.name,
          debit: debitoFiscalData.totalDebitoFiscal,
          credit: 0,
          documentRef: `F29 ${selectedPeriod}`,
          gloss: `Liquidación mensual IVA Débito Fiscal ${selectedPeriod}`
        });
      }

      // 3. Liquidación IVA Crédito (Al HABER para saldar la cuenta activa de IVA Crédito acumulada en compras)
      if (creditoFiscalData.totalCreditoFiscal > 0) {
        lines.push({
          id: 'line_credito',
          accountId: accIvaCredito.id,
          accountCode: accIvaCredito.code,
          accountName: accIvaCredito.name,
          debit: 0,
          credit: creditoFiscalData.totalCreditoFiscal,
          documentRef: `F29 ${selectedPeriod}`,
          gloss: `Liquidación mensual IVA Crédito Fiscal ${selectedPeriod}`
        });
      }

      // 4. IVA por Pagar, IVA Postergado o Nuevo Remanente
      if (resumenF29.ivaPagar > 0) {
        if (resumenF29.ivaPostergado && resumenF29.ivaPostergado > 0) {
          // Registro de IVA Postergado (Pasivo a largo plazo / postergado ProPyme Cód. 756)
          lines.push({
            id: 'line_iva_postergado',
            accountId: accIvaPostergado.id,
            accountCode: accIvaPostergado.code,
            accountName: accIvaPostergado.name,
            debit: 0,
            credit: resumenF29.ivaPostergado,
            documentRef: `F29 Cód 756`,
            gloss: `IVA Postergado por Pagar (Ley ProPyme Cód. 756) F29 ${selectedPeriod}`
          });
        }
        if (resumenF29.ivaPagarNetoPostergacion && resumenF29.ivaPagarNetoPostergacion > 0) {
          lines.push({
            id: 'line_iva_pagar',
            accountId: accIvaPagar.id,
            accountCode: accIvaPagar.code,
            accountName: accIvaPagar.name,
            debit: 0,
            credit: resumenF29.ivaPagarNetoPostergacion,
            documentRef: `F29 ${selectedPeriod}`,
            gloss: `IVA Determinado a Pagar en Banco según F29 ${selectedPeriod}`
          });
        }
      } else if (resumenF29.remanenteParaSiguienteMes > 0) {
        lines.push({
          id: 'line_remanente',
          accountId: accRemanente.id,
          accountCode: accRemanente.code,
          accountName: accRemanente.name,
          debit: resumenF29.remanenteParaSiguienteMes,
          credit: 0,
          documentRef: `F29 ${selectedPeriod}`,
          gloss: `Nuevo Remanente Crédito Fiscal para el mes siguiente (${resumenF29.remanenteParaSiguienteMesUTM} UTM)`
        });
      }

      // 5. Reconocimiento de PPM (Activo de PPM al DEBE contra Impuesto por Pagar al HABER)
      if (ppmData.montoPPM > 0) {
        lines.push({
          id: 'line_ppm_debe',
          accountId: accPPMActivo.id,
          accountCode: accPPMActivo.code,
          accountName: accPPMActivo.name,
          debit: ppmData.montoPPM,
          credit: 0,
          documentRef: `F29 ${selectedPeriod}`,
          gloss: `Devengación PPM ${taxSettings.ppmRate}% sobre ventas netas $${ppmData.baseImponibleVentas.toLocaleString('es-CL')}`
        });
        lines.push({
          id: 'line_ppm_haber',
          accountId: accImpuestosPorPagarTotal.id,
          accountCode: accImpuestosPorPagarTotal.code,
          accountName: accImpuestosPorPagarTotal.name,
          debit: 0,
          credit: ppmData.montoPPM,
          documentRef: `F29 ${selectedPeriod}`,
          gloss: `PPM a Pagar según F29 ${selectedPeriod}`
        });
      }

      // 6. Retenciones de Honorarios (Al HABER como pasivo exigible)
      if (retencionesData.retencionHonorarios > 0) {
        lines.push({
          id: 'line_ret_hon',
          accountId: accRetencionHonorarios.id,
          accountCode: accRetencionHonorarios.code,
          accountName: accRetencionHonorarios.name,
          debit: 0,
          credit: retencionesData.retencionHonorarios,
          documentRef: `F29 ${selectedPeriod}`,
          gloss: `Retención Boletas de Honorarios (${taxSettings.honorariosTaxRate}%) F29`
        });
      }

      // 7. Retención Impuesto Único de Segunda Categoría
      if (retencionesData.impuestoUnicoTrabajadores > 0) {
        lines.push({
          id: 'line_imp_unico',
          accountId: accImpuestoUnico.id,
          accountCode: accImpuestoUnico.code,
          accountName: accImpuestoUnico.name,
          debit: 0,
          credit: retencionesData.impuestoUnicoTrabajadores,
          documentRef: `F29 Cód 48`,
          gloss: `Impuesto Único Sueldos Trabajadores F29 ${selectedPeriod}`
        });
      }

      // 8. Códigos Adicionales por Giro
      customCodes.filter(c => c.active && (c.amount || 0) > 0).forEach((c, idx) => {
        lines.push({
          id: `line_custom_${c.code}_${idx}`,
          accountId: accImpuestosPorPagarTotal.id,
          accountCode: accImpuestosPorPagarTotal.code,
          accountName: accImpuestosPorPagarTotal.name,
          debit: 0,
          credit: c.amount,
          documentRef: `F29 Cód ${c.code}`,
          gloss: `${c.name} (Cód. ${c.code}) F29 ${selectedPeriod}`
        });
      });

      // Calculate Total Debit and Credit
      const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
      const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);

      // Check balance
      const diff = Math.abs(totalDebit - totalCredit);
      if (diff > 0.01) {
        // Balance adjustment if rounding difference exists
        if (totalDebit > totalCredit) {
          lines.push({
            id: 'line_round_cred',
            accountId: accImpuestosPorPagarTotal.id,
            accountCode: accImpuestosPorPagarTotal.code,
            accountName: accImpuestosPorPagarTotal.name,
            debit: 0,
            credit: diff,
            documentRef: `F29 ${selectedPeriod}`,
            gloss: `Ajuste cuadratura F29`
          });
        } else {
          lines.push({
            id: 'line_round_deb',
            accountId: accPPMActivo.id,
            accountCode: accPPMActivo.code,
            accountName: accPPMActivo.name,
            debit: diff,
            credit: 0,
            documentRef: `F29 ${selectedPeriod}`,
            gloss: `Ajuste cuadratura F29`
          });
        }
      }

      const sanitizedLines = sanitizeVoucherLines(lines, accounts);
      const finalDebit = sanitizedLines.reduce((s, l) => s + (l.debit || 0), 0);
      const finalCredit = sanitizedLines.reduce((s, l) => s + (l.credit || 0), 0);

      const voucherData = {
        voucherNumber: nextVoucherNumber,
        date: `${selectedPeriod}-28`,
        period: selectedPeriod,
        type: 'Traspaso',
        gloss: `Centralización y Liquidación Mensual Formulario 29 Impuestos - Período ${selectedPeriod}`,
        lines: sanitizedLines,
        totalDebit: finalDebit,
        totalCredit: finalCredit,
        status: 'Valido',
        createdAt: new Date().toISOString()
      };

      const vRef = await addDoc(collection(companyRef, 'vouchers'), voucherData);
      const voucherId = vRef.id;

      // Update F29 with generated voucher info
      const declarationId = `${company.rut.replace(/[^a-zA-Z0-9]/g, '')}_${selectedPeriod}`;
      await updateDoc(doc(companyRef, 'f29Declarations', declarationId), {
        voucherId,
        voucherNumber: nextVoucherNumber,
        updatedAt: new Date().toISOString()
      });

      alert(`✅ Asiento Contable N° ${nextVoucherNumber} de Liquidación de Impuestos F29 generado y centralizado exitosamente con Corrección Monetaria e IVA Postergado.`);
      if (onVouchersUpdated) onVouchersUpdated();
      fetchDeclarations();
    } catch (err: any) {
      console.error('Error generating F29 voucher:', err);
      alert('Error al centralizar asiento F29: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Export F29 Summary CSV
  const handleExportCSV = () => {
    const headers = ['Codigo SII', 'Concepto Tributario', 'Valor / Monto ($)'];
    const rows = [
      ['503', 'Débito Fiscal Facturas Emitidas', debitoFiscalData.debitoFacturasEmitidas.toString()],
      ['110', 'Débito Fiscal Boletas Emitidas', debitoFiscalData.debitoBoletasEmitidas.toString()],
      ['512', 'Débito Fiscal Notas de Débito', debitoFiscalData.debitoNotasDebito.toString()],
      ['509', 'Crédito Notas de Crédito Emitidas', debitoFiscalData.creditoNotasCreditoEmitidas.toString()],
      ['538', 'TOTAL DÉBITO FISCAL', debitoFiscalData.totalDebitoFiscal.toString()],
      ['520', 'Crédito Fiscal Facturas Recibidas', creditoFiscalData.creditoFacturasRecibidas.toString()],
      ['525', 'Crédito Fiscal Activo Fijo', creditoFiscalData.creditoActivoFijo.toString()],
      ['504', 'Remanente Crédito Fiscal Mes Anterior (UTM)', creditoFiscalData.remanenteMesAnteriorUTM.toString()],
      ['563', 'Remanente Crédito Fiscal Mes Anterior ($)', creditoFiscalData.remanenteMesAnteriorPesos.toString()],
      ['537', 'TOTAL CRÉDITO FISCAL', creditoFiscalData.totalCreditoFiscal.toString()],
      ['89', 'IVA Determinado a Pagar', resumenF29.ivaPagar.toString()],
      ['77', 'Remanente para Mes Siguiente ($)', resumenF29.remanenteParaSiguienteMes.toString()],
      ['151', 'Retención Boletas de Honorarios (Segunda Cat)', retencionesData.retencionHonorarios.toString()],
      ['48', 'Impuesto Único Segunda Categoría (Sueldos)', retencionesData.impuestoUnicoTrabajadores.toString()],
      ['115', 'Tasa PPM Aplicada (%)', ppmData.tasaPPM.toString()],
      ['62', 'Monto PPM Determinado', ppmData.montoPPM.toString()],
      ['91', 'TOTAL A PAGAR EN GIRO F29', resumenF29.totalPagarF29.toString()]
    ];

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `F29_${company.rut}_${selectedPeriod}.csv`;
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📑</span>
            <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">
              Formulario 29 y Determinación de Impuestos Mensuales
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Cálculo oficial de Débito/Crédito Fiscal IVA, Retenciones de Segunda Categoría, PPM y Liquidación Contable ({company.name} - RUT: {company.rut})
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 transition-colors flex items-center gap-1.5"
          >
            <span>📥</span>
            <span>Exportar F29 CSV</span>
          </button>

          <button
            onClick={handleCentralizeF29Voucher}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
            title="Generar asiento contable de liquidación mensual en Libro Diario"
          >
            <span>⚡</span>
            <span>Contabilizar Asiento F29</span>
          </button>

          <button
            onClick={handleSaveDeclaration}
            disabled={isSubmitting}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
          >
            <span>💾</span>
            <span>{isSubmitting ? 'Guardando...' : 'Guardar Declaración'}</span>
          </button>
        </div>
      </div>

      {/* TOP CONTROL BAR: PERIOD, REGIMEN & STATUS */}
      <div className="bg-slate-900 text-white p-4 rounded-xl shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Período Tributario:</label>
          <input
            type="month"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 font-mono font-bold text-white text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Régimen Tributario:</label>
          <select
            value={taxSettings.regimenTributario}
            onChange={(e) => setTaxSettings({ ...taxSettings, regimenTributario: e.target.value as any })}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 font-semibold text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          >
            <option value="14_D3_PROPYME_GENERAL">ProPyme General (Art. 14 D3)</option>
            <option value="14_D8_PROPYME_TRANSPARENTE">ProPyme Transparente (Art. 14 D8)</option>
            <option value="14_A_SEMI_INTEGRADO">Régimen General Semi-Integrado (14 A)</option>
            <option value="RENTA_PRESUNTA">Renta Presunta</option>
          </select>
        </div>

        <div>
          <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Estado de Declaración:</label>
          <select
            value={declarationStatus}
            onChange={(e) => setDeclarationStatus(e.target.value as any)}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 font-bold text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          >
            <option value="Borrador">⏳ Borrador / En Preparación</option>
            <option value="Validado">✓ Validado por Contador</option>
            <option value="Declarado">📑 Declarado en SII</option>
            <option value="Pagado">💰 Pagado en Banco / TGR</option>
          </select>
        </div>

        <div>
          <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Folio Declaración SII:</label>
          <input
            type="text"
            placeholder="Ej: 99481283"
            value={folioSII}
            onChange={(e) => setFolioSII(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 font-mono font-bold text-indigo-300 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />
        </div>
      </div>

      {/* SUMMARY KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Débito Fiscal */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Débito Fiscal (IVA Ventas)</span>
            <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded font-mono font-bold">Cód. 538</span>
          </div>
          <span className="text-xl font-black font-mono text-slate-900 block mt-1">
            ${debitoFiscalData.totalDebitoFiscal.toLocaleString('es-CL')}
          </span>
          <span className="text-[10px] text-slate-500">
            {debitoFiscalData.docsCount} ventas | Base: ${debitoFiscalData.ventasAfectasNeto.toLocaleString('es-CL')}
          </span>
        </div>

        {/* Card 2: Crédito Fiscal */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Crédito Fiscal (IVA Compras)</span>
            <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded font-mono font-bold">Cód. 537</span>
          </div>
          <span className="text-xl font-black font-mono text-slate-900 block mt-1">
            ${creditoFiscalData.totalCreditoFiscal.toLocaleString('es-CL')}
          </span>
          <span className="text-[10px] text-slate-500">
            {creditoFiscalData.docsCount} compras | Remanente ant: ${creditoFiscalData.remanenteMesAnteriorPesos.toLocaleString('es-CL')}
          </span>
        </div>

        {/* Card 3: PPM & Retenciones */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">PPM + Retenciones</span>
            <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.2 rounded font-mono font-bold">PPM {taxSettings.ppmRate}%</span>
          </div>
          <span className="text-xl font-black font-mono text-amber-700 block mt-1">
            ${(ppmData.montoPPM + retencionesData.totalRetenciones).toLocaleString('es-CL')}
          </span>
          <span className="text-[10px] text-slate-500">
            PPM: ${ppmData.montoPPM.toLocaleString('es-CL')} | Ret: ${retencionesData.totalRetenciones.toLocaleString('es-CL')}
          </span>
        </div>

        {/* Card 4: Total a Pagar / Giro */}
        <div className={`p-3.5 rounded-xl border shadow-xs transition-all ${
          resumenF29.totalPagarF29 > 0
            ? 'bg-rose-50 border-rose-300'
            : 'bg-emerald-50 border-emerald-300'
        }`}>
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
              {resumenF29.totalPagarF29 > 0 ? 'Total a Pagar en F29' : 'Remanente a Favor'}
            </span>
            <span className="text-xs bg-slate-900 text-white px-1.5 py-0.2 rounded font-mono font-bold">
              {resumenF29.totalPagarF29 > 0 ? 'Cód. 91' : 'Cód. 77'}
            </span>
          </div>
          <span className={`text-xl font-black font-mono block mt-1 ${
            resumenF29.totalPagarF29 > 0 ? 'text-rose-700' : 'text-emerald-700'
          }`}>
            {resumenF29.totalPagarF29 > 0
              ? `$${resumenF29.totalPagarF29.toLocaleString('es-CL')}`
              : `$${resumenF29.remanenteParaSiguienteMes.toLocaleString('es-CL')}`}
          </span>
          <span className="text-[10px] text-slate-600 font-medium">
            {resumenF29.totalPagarF29 > 0
              ? `IVA: $${resumenF29.ivaPagar.toLocaleString('es-CL')} + Otros: $${(resumenF29.ppmPagar + resumenF29.retencionesPagar).toLocaleString('es-CL')}`
              : `Remanente acumulado: ${resumenF29.remanenteParaSiguienteMesUTM} UTM`}
          </span>
        </div>
      </div>

      {/* TABS */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-2 gap-2">
        <button
          onClick={() => setActiveTab('formulario')}
          className={`px-4 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'formulario'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>📋 Formulario 29 Oficial (SII)</span>
        </button>

        <button
          onClick={() => setActiveTab('auditoria')}
          className={`px-4 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'auditoria'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>🔍 Auditoría y Trazabilidad RCV</span>
          <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded-full text-[10px]">{periodDocs.length} docs</span>
        </button>

        <button
          onClick={() => setActiveTab('parametros')}
          className={`px-4 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'parametros'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>⚙️ Parámetros Tributarios y UTM</span>
        </button>

        <button
          onClick={() => setActiveTab('historial')}
          className={`px-4 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'historial'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>📑 Historial de Declaraciones F29</span>
          <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded-full text-[10px]">{savedDeclarations.length}</span>
        </button>
      </div>

      {/* TAB 1: FORMULARIO 29 OFICIAL (FORMATO SII) */}
      {activeTab === 'formulario' && (
        <div className="bg-white rounded-b-xl border border-slate-200 shadow-xs p-5 space-y-6">
          {/* SECCIÓN I: DÉBITO FISCAL */}
          {f29CodeSettings.debito !== false && (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-slate-100 px-3 py-2 rounded-lg border border-slate-200">
                <span className="font-bold text-xs text-slate-800 uppercase tracking-wide">
                  I. Débito Fiscal IVA y Ventas / Servicios (Líneas 1 a 15)
                </span>
                <span className="font-mono text-xs font-black text-slate-900">
                  Total Débito: ${debitoFiscalData.totalDebitoFiscal.toLocaleString('es-CL')}
                </span>
              </div>

              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead className="bg-slate-50 text-slate-600 border-b text-[11px] font-sans">
                  <tr>
                    <th className="py-2 px-3 w-20">Cód. SII</th>
                    <th className="py-2 px-3">Glosa / Concepto Tributario</th>
                    <th className="py-2 px-3 text-right">Base Imponible ($)</th>
                    <th className="py-2 px-3 text-right">Débito Fiscal ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-indigo-700">[503 / 502]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">Facturas Emitidas (Afectas)</td>
                    <td className="py-2 px-3 text-right text-slate-600">${debitoFiscalData.ventasAfectasNeto.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">${debitoFiscalData.debitoFacturasEmitidas.toLocaleString('es-CL')}</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-indigo-700">[110 / 111]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">Boletas Electrónicas y Vales Transbank</td>
                    <td className="py-2 px-3 text-right text-slate-600">${debitoFiscalData.ventasBoletasNeto.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">${debitoFiscalData.debitoBoletasEmitidas.toLocaleString('es-CL')}</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-indigo-700">[512 / 513]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">Notas de Débito Emitidas</td>
                    <td className="py-2 px-3 text-right text-slate-600">-</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">${debitoFiscalData.debitoNotasDebito.toLocaleString('es-CL')}</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-rose-700">[509 / 510]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">(-) Notas de Crédito Emitidas (Rebaja Débito)</td>
                    <td className="py-2 px-3 text-right text-slate-600">-</td>
                    <td className="py-2 px-3 text-right font-bold text-rose-700">-${debitoFiscalData.creditoNotasCreditoEmitidas.toLocaleString('es-CL')}</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-slate-500">[585 / 142]</td>
                    <td className="py-2 px-3 font-sans text-slate-600">Ventas y Servicios Exentos o No Gravados</td>
                    <td className="py-2 px-3 text-right text-slate-600">${debitoFiscalData.ventasExentasTotal.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3 text-right text-slate-400">$0</td>
                  </tr>
                  <tr className="bg-slate-100 font-bold border-t border-slate-300">
                    <td className="py-2 px-3 text-indigo-900">[538]</td>
                    <td className="py-2 px-3 font-sans uppercase text-slate-900">TOTAL DÉBITO FISCAL DEL PERÍODO</td>
                    <td className="py-2 px-3 text-right">-</td>
                    <td className="py-2 px-3 text-right text-indigo-900 text-xs">${debitoFiscalData.totalDebitoFiscal.toLocaleString('es-CL')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* SECCIÓN II: CRÉDITO FISCAL */}
          {f29CodeSettings.credito !== false && (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-slate-100 px-3 py-2 rounded-lg border border-slate-200">
                <span className="font-bold text-xs text-slate-800 uppercase tracking-wide">
                  II. Crédito Fiscal IVA y Compras / Gastos (Líneas 16 a 35)
                </span>
                <span className="font-mono text-xs font-black text-slate-900">
                  Total Crédito: ${creditoFiscalData.totalCreditoFiscal.toLocaleString('es-CL')}
                </span>
              </div>

              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead className="bg-slate-50 text-slate-600 border-b text-[11px] font-sans">
                  <tr>
                    <th className="py-2 px-3 w-20">Cód. SII</th>
                    <th className="py-2 px-3">Glosa / Concepto Tributario</th>
                    <th className="py-2 px-3 text-right">Base Imponible ($)</th>
                    <th className="py-2 px-3 text-right">Crédito Fiscal ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-indigo-700">[520 / 524]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">Facturas Recibidas del Giro (Recuperable 100%)</td>
                    <td className="py-2 px-3 text-right text-slate-600">${creditoFiscalData.comprasGiroNeto.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">${creditoFiscalData.creditoFacturasRecibidas.toLocaleString('es-CL')}</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-indigo-700">[525 / 528]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">Facturas de Activo Fijo Recibidas</td>
                    <td className="py-2 px-3 text-right text-slate-600">${creditoFiscalData.comprasActivoFijoNeto.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">${creditoFiscalData.creditoActivoFijo.toLocaleString('es-CL')}</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-indigo-700">[532]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">Notas de Débito Recibidas de Proveedores</td>
                    <td className="py-2 px-3 text-right text-slate-600">-</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">${creditoFiscalData.creditoNotasDebitoRecibidas.toLocaleString('es-CL')}</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-rose-700">[535]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">(-) Notas de Crédito Recibidas de Proveedores</td>
                    <td className="py-2 px-3 text-right text-slate-600">-</td>
                    <td className="py-2 px-3 text-right font-bold text-rose-700">-${creditoFiscalData.debitoNotasCreditoRecibidas.toLocaleString('es-CL')}</td>
                  </tr>
                  {f29CodeSettings.remanente504 !== false && (
                    <>
                      <tr className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-bold text-indigo-700">[504 / 563]</td>
                        <td className="py-2 px-3 font-sans text-slate-800">
                          <div>
                            <span className="font-bold">Remanente de Crédito Fiscal Mes Anterior</span>
                            <span className="text-[11px] text-slate-500 block">
                              Base: {creditoFiscalData.remanenteMesAnteriorUTM} UTM (Valor histórico: ${creditoFiscalData.remanenteHistoricoPesos?.toLocaleString('es-CL') || 0})
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600">{creditoFiscalData.remanenteMesAnteriorUTM} UTM</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-700">+${creditoFiscalData.remanenteMesAnteriorPesos.toLocaleString('es-CL')}</td>
                      </tr>
                      {creditoFiscalData.reajusteCorreccionMonetariaRemanente !== undefined && creditoFiscalData.reajusteCorreccionMonetariaRemanente > 0 && (
                        <tr className="bg-emerald-50/50 text-[11px]">
                          <td className="py-1 px-3 text-emerald-700 font-bold">Art. 27 DL 825</td>
                          <td className="py-1 px-3 font-sans text-emerald-800 italic" colSpan={2}>
                            ↳ Reajuste por Corrección Monetaria de Remanente (Variación UTM): +${creditoFiscalData.reajusteCorreccionMonetariaRemanente.toLocaleString('es-CL')} (Ganancia CM imputable al crédito)
                          </td>
                          <td className="py-1 px-3 text-right font-semibold text-emerald-800">
                            Reajuste: +${creditoFiscalData.reajusteCorreccionMonetariaRemanente.toLocaleString('es-CL')}
                          </td>
                        </tr>
                      )}
                    </>
                  )}
                  <tr className="bg-slate-100 font-bold border-t border-slate-300">
                    <td className="py-2 px-3 text-indigo-900">[537]</td>
                    <td className="py-2 px-3 font-sans uppercase text-slate-900">TOTAL CRÉDITO FISCAL DEL PERÍODO</td>
                    <td className="py-2 px-3 text-right">-</td>
                    <td className="py-2 px-3 text-right text-indigo-900 text-xs">${creditoFiscalData.totalCreditoFiscal.toLocaleString('es-CL')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* SECCIÓN III: LIQUIDACIÓN DE IVA E IVA POSTERGADO */}
          <div className={`p-4 rounded-xl border transition-all ${
            resumenF29.ivaPagar > 0 ? 'bg-rose-50/70 border-rose-200' : 'bg-emerald-50/70 border-emerald-200'
          }`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs font-mono">
              <div>
                <span className="font-bold uppercase font-sans text-slate-800 block">
                  III. Determinación del IVA Mensual (Débito $ - Crédito $)
                </span>
                {resumenF29.reajusteCorreccionMonetaria > 0 && (
                  <span className="text-[11px] text-emerald-700 font-sans">
                    ✓ Incluye corrección monetaria Art. 27 DL 825 (${resumenF29.reajusteCorreccionMonetaria.toLocaleString('es-CL')}).
                  </span>
                )}
              </div>

              <div className="text-right">
                {resumenF29.ivaPagar > 0 ? (
                  <div>
                    <span className="font-black text-rose-700 text-sm block">
                      [Cód. 89] Impuesto Determinado: ${resumenF29.ivaPagar.toLocaleString('es-CL')}
                    </span>
                    {f29CodeSettings.posterga756 !== false && (
                      <div className="mt-2 pt-2 border-t border-rose-200 flex items-center justify-end gap-2">
                        <label className="flex items-center gap-1.5 cursor-pointer font-sans text-xs text-slate-800">
                          <input
                            type="checkbox"
                            checked={ivaPostergadoActivo}
                            onChange={e => setIvaPostergadoActivo(e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="font-bold text-indigo-900">Postergación de Pago de IVA (Cód. 756 / Ley ProPyme)</span>
                        </label>
                        {ivaPostergadoActivo && (
                          <div className="flex items-center gap-1">
                            <span className="text-slate-500">$</span>
                            <input
                              type="number"
                              value={ivaPostergadoMonto || resumenF29.ivaPagar}
                              onChange={e => setIvaPostergadoMonto(parseFloat(e.target.value) || 0)}
                              className="w-28 bg-white border border-indigo-300 rounded px-2 py-0.5 text-right font-mono font-bold text-indigo-900"
                              placeholder={resumenF29.ivaPagar.toString()}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {ivaPostergadoActivo && resumenF29.ivaPostergado > 0 && (
                      <div className="text-[11px] text-indigo-700 font-sans mt-1">
                        [Cód. 756] IVA Postergado: -${resumenF29.ivaPostergado.toLocaleString('es-CL')} | [Cód. 89 Neto]: ${resumenF29.ivaPagarNetoPostergacion.toLocaleString('es-CL')}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="font-black text-emerald-700 text-sm">
                    [Cód. 77] Nuevo Remanente a Favor Mes Siguiente: ${resumenF29.remanenteParaSiguienteMes.toLocaleString('es-CL')} ({resumenF29.remanenteParaSiguienteMesUTM} UTM)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* SECCIÓN IV: RETENCIONES DE SEGUNDA CATEGORÍA Y CAMBIO DE SUJETO */}
          {(f29CodeSettings.honorarios151 !== false || f29CodeSettings.impuestoUnico48 !== false || f29CodeSettings.retencionTerceros !== false) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-slate-100 px-3 py-2 rounded-lg border border-slate-200">
                <span className="font-bold text-xs text-slate-800 uppercase tracking-wide">
                  IV. Retenciones de Impuesto a la Renta (Honorarios, Sueldos y Cambio de Sujeto)
                </span>
                <span className="font-mono text-xs font-black text-slate-900">
                  Total Retenciones: ${retencionesData.totalRetenciones.toLocaleString('es-CL')}
                </span>
              </div>

              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead className="bg-slate-50 text-slate-600 border-b text-[11px] font-sans">
                  <tr>
                    <th className="py-2 px-3 w-20">Cód. SII</th>
                    <th className="py-2 px-3">Concepto Retención</th>
                    <th className="py-2 px-3 text-right">Tasa Retención</th>
                    <th className="py-2 px-3 text-right">Monto Bruto ($)</th>
                    <th className="py-2 px-3 text-right">Impuesto Retenido ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {f29CodeSettings.honorarios151 !== false && (
                    <tr className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-indigo-700">[151 / 152]</td>
                      <td className="py-2 px-3 font-sans text-slate-800">Retención Boletas de Honorarios Recibidas ({retencionesData.docsCount} boletas)</td>
                      <td className="py-2 px-3 text-right">{taxSettings.honorariosTaxRate}%</td>
                      <td className="py-2 px-3 text-right text-slate-600">${retencionesData.baseHonorariosBruto.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900">${retencionesData.retencionHonorarios.toLocaleString('es-CL')}</td>
                    </tr>
                  )}
                  {f29CodeSettings.impuestoUnico48 !== false && (
                    <tr className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-indigo-700">[48 / 49]</td>
                      <td className="py-2 px-3 font-sans text-slate-800">
                        Impuesto Único Segunda Categoría (Trabajadores Dependientes)
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">Tabla SII</td>
                      <td className="py-2 px-3 text-right text-slate-600">-</td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-slate-400">$</span>
                          <input
                            type="number"
                            value={manualAdjustments.impuestoUnicoManual || ''}
                            onChange={e => setManualAdjustments({ ...manualAdjustments, impuestoUnicoManual: parseFloat(e.target.value) || 0 })}
                            className="w-32 bg-amber-50 border border-amber-300 rounded px-2 py-0.5 text-right font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                            placeholder="0"
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                  {f29CodeSettings.retencionTerceros !== false && (
                    <tr className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-indigo-700">[538 / 542]</td>
                      <td className="py-2 px-3 font-sans text-slate-800">
                        IVA Retenido a Terceros / Cambio de Sujeto (Facturas de Compra con Retención)
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">Variable</td>
                      <td className="py-2 px-3 text-right text-slate-600">-</td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-slate-400">$</span>
                          <input
                            type="number"
                            value={manualAdjustments.retencionTercerosManual || ''}
                            onChange={e => setManualAdjustments({ ...manualAdjustments, retencionTercerosManual: parseFloat(e.target.value) || 0 })}
                            className="w-32 bg-amber-50 border border-amber-300 rounded px-2 py-0.5 text-right font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                            placeholder="0"
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* SECCIÓN V: PAGOS PROVISIONALES MENSUALES (PPM) */}
          {f29CodeSettings.ppm062 !== false && (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-slate-100 px-3 py-2 rounded-lg border border-slate-200">
                <span className="font-bold text-xs text-slate-800 uppercase tracking-wide">
                  V. Pagos Provisionales Mensuales (PPM)
                </span>
                <span className="font-mono text-xs font-black text-slate-900">
                  PPM Determinado: ${ppmData.montoPPM.toLocaleString('es-CL')}
                </span>
              </div>

              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead className="bg-slate-50 text-slate-600 border-b text-[11px] font-sans">
                  <tr>
                    <th className="py-2 px-3 w-20">Cód. SII</th>
                    <th className="py-2 px-3">Concepto PPM</th>
                    <th className="py-2 px-3 text-right">Base Imponible Ingresos Brutos ($)</th>
                    <th className="py-2 px-3 text-right">Tasa PPM (%)</th>
                    <th className="py-2 px-3 text-right">Monto PPM ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-indigo-700">[120 / 115 / 62]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">PPM Régimen {taxSettings.regimenTributario} sobre Ingresos del Giro</td>
                    <td className="py-2 px-3 text-right text-slate-700">${ppmData.baseImponibleVentas.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3 text-right font-bold text-indigo-700">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          step="0.01"
                          value={taxSettings.ppmRate}
                          onChange={e => setTaxSettings({ ...taxSettings, ppmRate: parseFloat(e.target.value) || 0 })}
                          className="w-20 bg-amber-50 border border-amber-300 rounded px-1.5 py-0.5 text-right font-mono font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500"
                        />
                        <span>%</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-black text-slate-900">${ppmData.montoPPM.toLocaleString('es-CL')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* SECCIÓN V.B: CÓDIGOS ADICIONALES POR GIRO DE LA EMPRESA */}
          {customCodes.some(c => c.active) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-slate-100 px-3 py-2 rounded-lg border border-slate-200">
                <span className="font-bold text-xs text-slate-800 uppercase tracking-wide">
                  Códigos Adicionales por Giro de la Empresa (ILA, Retenciones Específicas, etc.)
                </span>
                <span className="font-mono text-xs font-black text-slate-900">
                  Total Adicionales: ${(resumenF29.customCodesTotal || 0).toLocaleString('es-CL')}
                </span>
              </div>

              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead className="bg-slate-50 text-slate-600 border-b text-[11px] font-sans">
                  <tr>
                    <th className="py-2 px-3 w-20">Cód. SII</th>
                    <th className="py-2 px-3">Concepto Tributario por Giro</th>
                    <th className="py-2 px-3">Sección F29</th>
                    <th className="py-2 px-3 text-right">Monto a Declarar ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {customCodes.filter(c => c.active).map(code => (
                    <tr key={code.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-indigo-700">[{code.code}]</td>
                      <td className="py-2 px-3 font-sans text-slate-800">{code.name}</td>
                      <td className="py-2 px-3 text-slate-500 font-sans text-[11px]">{code.section}</td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-slate-400">$</span>
                          <input
                            type="number"
                            value={code.amount || ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setCustomCodes(customCodes.map(c => c.id === code.id ? { ...c, amount: val } : c));
                            }}
                            className="w-32 bg-amber-50 border border-amber-300 rounded px-2 py-0.5 text-right font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                            placeholder="0"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* CAMPOS DE INGRESO MANUAL Y ADICIONALES */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2">
              <span>✍️</span>
              <span>Valores de Ingreso Manual y Ajustes Adicionales (No Automatizados)</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Impuesto Único Sueldos ($):</label>
                <input
                  type="number"
                  value={manualAdjustments.impuestoUnicoManual}
                  onChange={e => setManualAdjustments({ ...manualAdjustments, impuestoUnicoManual: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900"
                />
                <span className="text-[10px] text-slate-500">Cód. 48/49 (Remuneraciones).</span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">IVA Retenido Terceros / C.Sujeto ($):</label>
                <input
                  type="number"
                  value={manualAdjustments.retencionTercerosManual}
                  onChange={e => setManualAdjustments({ ...manualAdjustments, retencionTercerosManual: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900"
                />
                <span className="text-[10px] text-slate-500">Cód. 538 / Facturas compra retención.</span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Otros Impuestos F29 ($):</label>
                <input
                  type="number"
                  value={manualAdjustments.otrosImpuestosManual}
                  onChange={e => setManualAdjustments({ ...manualAdjustments, otrosImpuestosManual: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900"
                />
                <span className="text-[10px] text-slate-500">Impuestos específicos o adicionales.</span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">PPM Voluntario / Adicional ($):</label>
                <input
                  type="number"
                  value={manualAdjustments.ppmAdicionalManual}
                  onChange={e => setManualAdjustments({ ...manualAdjustments, ppmAdicionalManual: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900"
                />
                <span className="text-[10px] text-slate-500">PPM voluntario extraordinario.</span>
              </div>
            </div>
          </div>

          {/* SECCIÓN VI: TOTAL A PAGAR EN GIRO */}
          <div className="p-4 bg-slate-900 text-white rounded-xl flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
                Total a Pagar en Caja / Banco / TGR
              </span>
              <span className="text-sm font-sans text-slate-300">
                Código [91] del Formulario 29 SII (IVA + Retenciones + PPM)
              </span>
            </div>

            <div className="text-right">
              <span className="text-2xl font-mono font-black text-amber-400 block">
                ${resumenF29.totalPagarF29.toLocaleString('es-CL')}
              </span>
            </div>
          </div>

          {/* CONTROL DE REGISTRO DE DECLARACIÓN (BLOCK AL FINAL DEL F29) */}
          <div className="bg-slate-900 text-white p-5 rounded-xl shadow-md space-y-4 mt-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛡️</span>
                <h4 className="text-sm font-black uppercase tracking-tight text-white">
                  Control de Registro y Declaración en el SII (Período {selectedPeriod})
                </h4>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                declarationStatus === 'Pagado' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                declarationStatus === 'Declarado' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                declarationStatus === 'Validado' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' :
                'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                Estado: {declarationStatus}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Estado F.29:</label>
                <select
                  value={declarationStatus}
                  onChange={e => setDeclarationStatus(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 font-bold text-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Borrador">⏳ Borrador / En Preparación</option>
                  <option value="Validado">✓ Validado por Contador</option>
                  <option value="Declarado">📑 Declarado en SII</option>
                  <option value="Pagado">💰 Pagado en Banco / TGR</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Nº de Folio Declaración SII:</label>
                <input
                  type="text"
                  placeholder="Ej: 982341928"
                  value={folioSII}
                  onChange={e => setFolioSII(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 font-mono font-bold text-indigo-300 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Archivo / PDF Resumen F.29:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="URL del PDF o nombre del archivo..."
                    value={pdfResumenUrl}
                    onChange={e => setPdfResumenUrl(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 font-mono text-slate-300 focus:ring-2 focus:ring-indigo-500"
                  />
                  <label className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg cursor-pointer text-xs whitespace-nowrap transition-colors">
                    <span>📁 Adjuntar</span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          setPdfResumenUrl(e.target.files[0].name);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveDeclaration}
                disabled={isSubmitting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg shadow-md transition-colors flex items-center gap-2 text-xs"
              >
                <span>💾</span>
                <span>{isSubmitting ? 'Guardando Registro...' : 'Guardar y Registrar Declaración F.29'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AUDITORÍA Y TRAZABILIDAD RCV */}
      {activeTab === 'auditoria' && (
        <div className="bg-white rounded-b-xl border border-slate-200 shadow-xs p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-bold uppercase text-slate-900">
              Detalle de Documentos Tributarios Electrónicos del Período {selectedPeriod} ({periodDocs.length} DTEs)
            </h4>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px] font-sans">
                <tr>
                  <th className="py-2.5 px-3">Registro</th>
                  <th className="py-2.5 px-2.5">Emisión</th>
                  <th className="py-2.5 px-2.5">Tipo</th>
                  <th className="py-2.5 px-2.5">Folio</th>
                  <th className="py-2.5 px-3">RUT Emisor / Contraparte</th>
                  <th className="py-2.5 px-3">Razón Social</th>
                  <th className="py-2.5 px-2.5 text-right">Neto ($)</th>
                  <th className="py-2.5 px-2.5 text-right">IVA / Ret ($)</th>
                  <th className="py-2.5 px-3 text-right">Total ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[11px]">
                {periodDocs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400 font-sans italic">
                      No hay documentos cargados en el RCV para el período {selectedPeriod}.
                    </td>
                  </tr>
                ) : (
                  periodDocs.map(d => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-sans font-bold">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          d.tipoRegistro === 'Venta'
                            ? 'bg-emerald-100 text-emerald-800'
                            : d.tipoRegistro === 'Compra'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {d.tipoRegistro}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-slate-600">{d.fechaEmision}</td>
                      <td className="py-2 px-2.5 font-sans font-semibold">{d.tipoDoc}</td>
                      <td className="py-2 px-2.5 font-bold text-indigo-700">{d.folio}</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">{d.rutEmisor}</td>
                      <td className="py-2 px-3 font-sans truncate max-w-xs text-slate-900">{d.razonSocialEmisor}</td>
                      <td className="py-2 px-2.5 text-right text-slate-700">${(d.montoNeto || 0).toLocaleString('es-CL')}</td>
                      <td className="py-2 px-2.5 text-right font-bold text-indigo-700">${(d.montoIva || 0).toLocaleString('es-CL')}</td>
                      <td className="py-2 px-3 text-right font-black text-slate-900">${d.montoTotal.toLocaleString('es-CL')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PARÁMETROS TRIBUTARIOS Y AJUSTES */}
      {activeTab === 'parametros' && (
        <div className="bg-white rounded-b-xl border border-slate-200 shadow-xs p-5 space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h4 className="text-sm font-black uppercase text-slate-900 flex items-center gap-2">
              <span>⚙️</span>
              <span>Configuración y Maestro de Códigos F.29 (Activación por Empresa)</span>
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              Seleccione qué secciones y códigos del Formulario 29 utiliza habitualmente esta sociedad. Los códigos desactivados no se desplegarán en el formulario de cálculo.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {[
              { key: 'debito', label: 'Débito Fiscal IVA (Ventas / Cód. 538)' },
              { key: 'credito', label: 'Crédito Fiscal IVA (Compras / Cód. 537)' },
              { key: 'remanente504', label: 'Remanente Mes Anterior (Cód. 504 / 563)' },
              { key: 'posterga756', label: 'Posterga IVA / Pago Postergado (Cód. 756)' },
              { key: 'honorarios151', label: 'Retención Honorarios 2da Cat (Cód. 151)' },
              { key: 'impuestoUnico48', label: 'Impuesto Único Segunda Categoría (Cód. 48/49)' },
              { key: 'retencionTerceros', label: 'IVA Retenido a Terceros / Cambio Sujeto (Cód. 538)' },
              { key: 'ppm062', label: 'Pagos Provisionales Mensuales - PPM (Cód. 62)' },
              { key: 'otrosImpuestos', label: 'Otros Impuestos / PPM Adicionales' }
            ].map(item => (
              <label key={item.key} className="flex items-center gap-2 p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 cursor-pointer font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={f29CodeSettings[item.key] !== false}
                  onChange={e => setF29CodeSettings({ ...f29CodeSettings, [item.key]: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>

          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-xs font-bold uppercase text-slate-900">
                  Plan de Cuentas para Asiento de Centralización F.29 y Corrección Monetaria
                </h4>
                <p className="text-[11px] text-slate-500">
                  Seleccione las cuentas contables de la empresa utilizadas para generar automáticamente el asiento de liquidación tributaria y reajuste de remanente.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Cuenta IVA Débito Fiscal (Debe):</label>
                <select
                  value={f29AccountParams.ivaDebitoAccountId}
                  onChange={e => setF29AccountParams({ ...f29AccountParams, ivaDebitoAccountId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-sans"
                >
                  <option value="">-- Por defecto (2-1-03-01 / IVA Débito) --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cuenta IVA Crédito Fiscal (Haber):</label>
                <select
                  value={f29AccountParams.ivaCreditoAccountId}
                  onChange={e => setF29AccountParams({ ...f29AccountParams, ivaCreditoAccountId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-sans"
                >
                  <option value="">-- Por defecto (1-1-07-01 / IVA Crédito) --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cuenta Remanente Crédito Fiscal (Activo):</label>
                <select
                  value={f29AccountParams.remanenteAccountId}
                  onChange={e => setF29AccountParams({ ...f29AccountParams, remanenteAccountId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-sans"
                >
                  <option value="">-- Por defecto (1-1-07-02 / Remanente Crédito Fiscal) --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-emerald-800 mb-1">Cuenta Corrección Monetaria / Reajuste Remanente (Ganancia):</label>
                <select
                  value={f29AccountParams.correccionMonetariaAccountId}
                  onChange={e => setF29AccountParams({ ...f29AccountParams, correccionMonetariaAccountId: e.target.value })}
                  className="w-full bg-emerald-50 border border-emerald-300 rounded px-2.5 py-1.5 font-sans font-semibold text-emerald-900"
                >
                  <option value="">-- Por defecto (4-3-01-01 / Corrección Monetaria) --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cuenta IVA Postergado por Pagar (Pasivo):</label>
                <select
                  value={f29AccountParams.ivaPostergadoAccountId}
                  onChange={e => setF29AccountParams({ ...f29AccountParams, ivaPostergadoAccountId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-sans"
                >
                  <option value="">-- Por defecto (2-1-03-05 / IVA Postergado) --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cuenta IVA Determinado por Pagar (Pasivo Banco/TGR):</label>
                <select
                  value={f29AccountParams.ivaPagarAccountId}
                  onChange={e => setF29AccountParams({ ...f29AccountParams, ivaPagarAccountId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-sans"
                >
                  <option value="">-- Por defecto (2-1-03-02 / IVA por Pagar) --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cuenta PPM Pagos Provisionales (Activo):</label>
                <select
                  value={f29AccountParams.ppmAccountId}
                  onChange={e => setF29AccountParams({ ...f29AccountParams, ppmAccountId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-sans"
                >
                  <option value="">-- Por defecto (1-1-07-03 / PPM) --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cuenta Retención Honorarios 2da Cat (Pasivo):</label>
                <select
                  value={f29AccountParams.retencionHonorariosAccountId}
                  onChange={e => setF29AccountParams({ ...f29AccountParams, retencionHonorariosAccountId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-sans"
                >
                  <option value="">-- Por defecto (2-1-03-03 / Retención Honorarios) --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* CÓDIGOS ADICIONALES POR GIRO DE LA EMPRESA */}
          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-xs font-bold uppercase text-slate-900">
                  Códigos Especiales y Específicos por Giro de Negocio
                </h4>
                <p className="text-[11px] text-slate-500">
                  Active o agregue nuevos códigos del Formulario 29 según el giro específico de la empresa (Molinería, Carnes, Minería, Licores, Bebidas, etc.).
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const newCodeNum = prompt('Ingrese el Código SII (Ej: 544, 585, 763):');
                  if (!newCodeNum) return;
                  const newName = prompt('Nombre o Glosa del Impuesto / Retención:', 'Impuesto Adicional');
                  if (!newName) return;
                  const newCustom: CustomF29Code = {
                    id: `c_${newCodeNum}_${Date.now()}`,
                    code: newCodeNum.trim(),
                    name: newName.trim(),
                    section: 'ImpuestoAdicional',
                    amount: 0,
                    active: true
                  };
                  setCustomCodes([...customCodes, newCustom]);
                }}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg border border-indigo-200 text-xs flex items-center gap-1 transition-colors"
              >
                <span>➕ Agregar Código Personalizado</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
              {customCodes.map(c => (
                <div key={c.id} className={`p-2.5 rounded-lg border flex items-center justify-between ${
                  c.active ? 'bg-indigo-50/60 border-indigo-200' : 'bg-slate-50 border-slate-200 opacity-70'
                }`}>
                  <label className="flex items-center gap-2 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={c.active}
                      onChange={e => {
                        setCustomCodes(customCodes.map(item => item.id === c.id ? { ...item, active: e.target.checked } : item));
                      }}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <div>
                      <span className="font-bold text-indigo-900 block">[{c.code}] {c.name}</span>
                      <span className="text-[10px] text-slate-500 font-sans">{c.section}</span>
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`¿Eliminar código [${c.code}] ${c.name}?`)) {
                        setCustomCodes(customCodes.filter(item => item.id !== c.id));
                      }
                    }}
                    className="text-slate-400 hover:text-rose-600 font-bold p-1 text-xs"
                    title="Eliminar código"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 flex justify-end">
            <button
              onClick={handleSaveCompanyF29Settings}
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm text-xs flex items-center gap-2 transition-colors"
            >
              <span>💾</span>
              <span>{isSubmitting ? 'Guardando...' : 'Guardar Parámetros y Códigos de la Empresa'}</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: HISTORIAL DE DECLARACIONES F29 */}
      {activeTab === 'historial' && (
        <div className="bg-white rounded-b-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead className="bg-slate-900 text-white text-[11px] uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-2.5 px-3">Período</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3">Folio SII</th>
                  <th className="py-2.5 px-3 text-right">Débito Fiscal ($)</th>
                  <th className="py-2.5 px-3 text-right">Crédito Fiscal ($)</th>
                  <th className="py-2.5 px-3 text-right">PPM ($)</th>
                  <th className="py-2.5 px-3 text-right">Retenciones ($)</th>
                  <th className="py-2.5 px-3 text-right">Total Giro F29 ($)</th>
                  <th className="py-2.5 px-3 text-center">Asiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[11px]">
                {savedDeclarations.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400 font-sans italic">
                      No hay declaraciones de F29 guardadas en el historial.
                    </td>
                  </tr>
                ) : (
                  savedDeclarations.map(dec => (
                    <tr key={dec.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-indigo-700">{dec.period}</td>
                      <td className="py-2 px-3 font-sans">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          dec.status === 'Pagado'
                            ? 'bg-emerald-100 text-emerald-800'
                            : dec.status === 'Declarado'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {dec.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono">{dec.folioSII || '-'}</td>
                      <td className="py-2 px-3 text-right text-slate-800">${dec.debitoFiscal.totalDebitoFiscal.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-3 text-right text-slate-800">${dec.creditoFiscal.totalCreditoFiscal.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-3 text-right text-slate-800">${dec.ppm.montoPPM.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-3 text-right text-slate-800">${dec.retenciones.totalRetenciones.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-3 text-right font-black text-rose-700">${dec.resumen.totalPagarF29.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-3 text-center font-sans">
                        {dec.voucherNumber ? (
                          <span className="text-[10px] bg-slate-100 text-indigo-800 px-1.5 py-0.5 rounded font-bold">
                            Asiento N° {dec.voucherNumber}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Sin contabilizar</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
