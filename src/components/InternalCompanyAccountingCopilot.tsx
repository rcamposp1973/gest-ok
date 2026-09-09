import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { 
  Send, 
  X, 
  Minimize2, 
  Building2, 
  ShieldCheck, 
  Search, 
  FileText, 
  Calculator, 
  ArrowRight,
  TrendingUp,
  Receipt,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Scale,
  DollarSign,
  Landmark,
  Percent,
  Layers,
  FileSpreadsheet,
  BrainCircuit,
  Lock,
  Globe2,
  PieChart,
  Lightbulb
} from 'lucide-react';
import { AnimatedOkLogo } from './AnimatedOkLogo';
import { Company, ChartOfAccount, Voucher, RCVDocument, Auxiliary, FiscalPeriodYear } from '../types';
import { CopilotKnowledgeItem } from './JuniorAITrainingCenter';

interface InternalCopilotProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  rcvDocuments: RCVDocument[];
  auxiliaries: Auxiliary[];
  fiscalYears: FiscalPeriodYear[];
  onNavigateTab?: (tab: any) => void;
}

interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  time: string;
  suggestions?: string[];
  actionLink?: {
    tab: string;
    label: string;
  };
}

export default function InternalCompanyAccountingCopilot({
  studyId,
  company,
  accounts,
  vouchers,
  rcvDocuments,
  auxiliaries,
  fiscalYears,
  onNavigateTab
}: InternalCopilotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [trainedKnowledge, setTrainedKnowledge] = useState<CopilotKnowledgeItem[]>([]);
  const [showKnowledgeModal, setShowKnowledgeModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load trained knowledge (Global + Isolated for this company)
  useEffect(() => {
    const loadKnowledge = async () => {
      try {
        const list: CopilotKnowledgeItem[] = [];
        // 1. Global
        const globalSnap = await getDocs(collection(db, 'system_junior_knowledge'));
        globalSnap.docs.forEach(d => {
          list.push({ id: d.id, ...d.data() } as CopilotKnowledgeItem);
        });

        // 2. Company Isolated
        if (studyId && company?.id) {
          const compSnap = await getDocs(collection(db, 'studies', studyId, 'companies', company.id, 'copilotCompanyKnowledge'));
          compSnap.docs.forEach(d => {
            list.push({ id: d.id, ...d.data() } as CopilotKnowledgeItem);
          });
        }
        setTrainedKnowledge(list.filter(k => k.isActive !== false));
      } catch (e) {
        console.error("Error loading Junior trained knowledge:", e);
      }
    };
    loadKnowledge();
  }, [studyId, company?.id]);

  // Historial de conversación inicial de "Junior"
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'ai',
      text: `👋 ¡Hola! Soy **Junior**, tu Asistente y Copiloto Contable para **${company.name}** (RUT: ${company.rut}).\n\nEstoy especializado en **Conciliación Bancaria, Facturas Pendientes por RUT, Normativa Tributaria Chilena (LIR, IVA, F29)** e **IFRS (NIC 1, NIC 2, NIC 16, Partida Doble)**.\n\nPuedo ayudarte a **buscar facturas pendientes de un RUT**, auditar tus libros, guiarte para anular cartolas y conciliar tu banco. ¿En qué te ayudo hoy?`,
      time: 'Ahora',
      suggestions: [
        'Buscar facturas pendientes por RUT',
        '¿Cómo conciliar y anular cartolas?',
        'Resumen de IVA y Formulario 29',
        'Analizar Margen Operacional IFRS',
        'Simular cálculo de Boleta de Honorarios',
        'Proponer asiento contable'
      ]
    }
  ]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages]);

  // Motor de Inteligencia y Razonamiento Contable, Tributario e IFRS (Junior)
  const processAccountingQuery = (rawQuery: string): { response: string; suggestions?: string[]; actionLink?: { tab: string; label: string } } => {
    const q = rawQuery.toLowerCase().trim();

    // 0. Búsqueda de Directivas de Entrenamiento Dinámico (Específicas de Empresa y Globales)
    const matchingCompanyRules = trainedKnowledge.filter(k => 
      k.scope === 'COMPANY' && 
      k.companyId === company.id &&
      k.isActive &&
      (k.keywords.some(kw => q.includes(kw.toLowerCase())) || q.includes(k.title.toLowerCase()))
    );

    const matchingGlobalRules = trainedKnowledge.filter(k => 
      k.scope === 'GLOBAL' && 
      k.isActive &&
      (k.keywords.some(kw => q.includes(kw.toLowerCase())) || q.includes(k.title.toLowerCase()))
    );

    // Si hay una directiva específica para esta empresa, se le da máxima prioridad
    if (matchingCompanyRules.length > 0) {
      const topRule = matchingCompanyRules[0];
      let ruleResponse = `🏢 **Criterio Contable Exclusivo para ${company.name}:**\n\n` +
        `• **${topRule.title}:**\n` +
        `${topRule.directiveContent}\n\n`;

      if (topRule.recommendedEntries) {
        ruleResponse += `💡 **Asiento Contable Sugerido:**\n` +
          `${topRule.recommendedEntries}\n\n`;
      }

      ruleResponse += `🔒 *Nota: Esta regla está aprendida y aislada únicamente para ${company.name}.*`;

      return {
        response: ruleResponse,
        suggestions: ['Proponer otro asiento', 'Ver Comprobantes', 'Auditar Balance'],
        actionLink: { tab: 'vouchers', label: 'Ver Comprobantes' }
      };
    }

    // 0. NUEZ MARIPOSA: MOTOR DE CRUCE INTELIGENTE DE CARTOLAS Y CONTABILIZACIÓN POR RUT
    if (q.includes('nuez') || q.includes('nuez mariposa') || q.includes('mariposa') || q.includes('regla de la nuez') || q.includes('cruce de cartola')) {
      return {
        response: `🧠 **Motor Inteligente "Nuez Mariposa" (Aprendizaje de Conciliación por RUT):**\n\n` +
          `Como tu copiloto **Junior**, aplico las siguientes reglas operativas automatizadas para conciliar y contabilizar la cartola bancaria:\n\n` +
          `📥 **1. Abonos Bancarios (Ingresos):**\n` +
          `   • Escaneo el RUT de quien deposita desde la glosa bancaria (ej. \`0105559089\` ➔ \`10.555.908-9\`).\n` +
          `   • Los comparo contra las **Facturas de Clientes pendientes de cobro en el RCV Ventas** y Auxiliar de Clientes.\n` +
          `   • Propongo el comprobante de **Ingreso** (\`Banco\` al Debe / \`Clientes Nacionales\` al Haber con RUT y Folio).\n\n` +
          `📤 **2. Cargos Bancarios (Egresos - Proveedores y Honorarios):**\n` +
          `   • Si el RUT o glosa corresponde a servicios/boletas, cruzo con **Boletas de Honorarios por Pagar** (\`Honorarios por Pagar\` al Debe / \`Banco\` al Haber).\n` +
          `   • Si corresponde a compras, cruzo con **Facturas de Proveedores por Pagar** (\`Proveedores Nacionales\` al Debe / \`Banco\` al Haber).\n\n` +
          `📅 **3. Regla Estricta de Fechas y Períodos Contables:**\n` +
          `   • Se contabiliza en la fecha original de la cartola.\n` +
          `   • Si el mes está **CERRADO**, la propuesta se traslada automáticamente al **día 01 del siguiente mes abierto** para resguardar los libros tributarios.\n\n` +
          `⚖️ **4. Tolerancia y Diferencias Menores a $10:**\n` +
          `   • Si existe una diferencia menor o igual a **$10** (por redondeo de centavos o comisiones), el comprobante queda **pendiente de registro pero debidamente informado** con advertencia visual para tu aprobación.\n\n` +
          `🧠 **5. Memoria de Aprendizaje:**\n` +
          `   • Cada vez que apruebas un cruce en La Nuez, **yo memorizo la contraparte y cuenta asignada** en la memoria aislada de **${company.name}** para que en la próxima cartola el match sea 100% automático.\n\n` +
          `¿Deseas que abramos el módulo de Conciliación Bancaria para ejecutar la Nuez Mariposa?`,
        suggestions: [
          'Abrir Nuez Mariposa en Conciliación',
          'Ver Facturas Pendientes de Clientes',
          'Ver Boletas de Honorarios Pendientes',
          'Revisar Períodos Contables'
        ],
        actionLink: { tab: 'conciliacion', label: 'Ir a 🧠 Nuez Mariposa' }
      };
    }

    // 0.1 BÚSQUEDA DE FACTURAS PENDIENTES POR RUT Y ASISTENCIA EN CONCILIACIÓN BANCARIA (JUNIOR)
    if (
      q.includes('rut') || 
      q.includes('factura') || 
      q.includes('facturas') || 
      q.includes('pendiente') || 
      q.includes('pendientes') || 
      q.includes('conciliar') || 
      q.includes('conciliacion') || 
      q.includes('conciliación') ||
      q.includes('proveedor') ||
      q.includes('dte')
    ) {
      const cleanRutMatch = q.match(/(\d{1,2}\.?\d{3}\.?\d{3}[-kK0-9]|\d{7,8}[-kK0-9]?)/g);
      const searchRutClean = cleanRutMatch ? cleanRutMatch[0].replace(/[^0-9kK]/g, '').toLowerCase() : '';

      const amountMatches = q.match(/\$?\s*(\d{1,3}(\.\d{3})+|\d{4,})/g);
      const searchAmount = amountMatches ? parseInt(amountMatches[0].replace(/\D/g, ''), 10) : null;

      // Filter DTEs in RCV
      const matchingDocs = rcvDocuments.filter(doc => {
        const docRutEmisor = (doc.rutEmisor || '').replace(/[^0-9kK]/g, '').toLowerCase();
        const docRutReceptor = (doc.rutReceptor || '').replace(/[^0-9kK]/g, '').toLowerCase();
        const docRazonSocial = (doc.razonSocialEmisor || doc.razonSocialReceptor || '').toLowerCase();
        const docFolio = String(doc.folio || '');

        if (searchRutClean && (docRutEmisor.includes(searchRutClean) || docRutReceptor.includes(searchRutClean))) {
          return true;
        }
        if (searchAmount && Math.abs(doc.montoTotal - searchAmount) < 5) {
          return true;
        }
        if (q.includes(docRazonSocial) && docRazonSocial.length > 3) {
          return true;
        }
        if (q.includes(docFolio) && docFolio.length > 1) {
          return true;
        }
        return false;
      });

      // Filter pending auxiliaries matching RUT
      const matchingAux = auxiliaries.filter(aux => {
        const auxRutClean = (aux.rut || '').replace(/[^0-9kK]/g, '').toLowerCase();
        return searchRutClean && auxRutClean.includes(searchRutClean);
      });

      let responseText = `🔍 **Asistente de Conciliación y Búsqueda de DTEs por Junior:**\n\n`;

      if (searchRutClean) {
        responseText += `🎯 **Criterio de Búsqueda de RUT:** \`${cleanRutMatch ? cleanRutMatch[0] : searchRutClean}\`\n\n`;
      } else if (searchAmount) {
        responseText += `💵 **Criterio de Búsqueda por Monto:** $ ${searchAmount.toLocaleString('es-CL')}\n\n`;
      } else {
        responseText += `📋 **Análisis de Documentos Pendientes de Conciliación:**\n\n`;
      }

      if (matchingDocs.length > 0) {
        responseText += `📄 **Facturas y DTEs Encontrados en RCV (${matchingDocs.length}):**\n`;
        matchingDocs.slice(0, 8).forEach(d => {
          const codeStr = String(d.tipoDoc || d.tipoDocumento || '');
          const tipo = codeStr === '33' ? 'Factura Electrónica' : codeStr === '34' ? 'Factura Exenta' : codeStr === '61' ? 'Nota de Crédito' : `DTE ${codeStr}`;
          const rutDisplay = d.rutEmisor || d.rutReceptor || 'N/A';
          const nameDisplay = d.razonSocialEmisor || d.razonSocialReceptor || 'Proveedor / Cliente';
          responseText += `  • **${tipo} N° ${d.folio}** | Fecha: ${d.fechaEmision} | RUT: **${rutDisplay}** (${nameDisplay}) | Total: **$ ${d.montoTotal.toLocaleString('es-CL')}**\n`;
        });
        if (matchingDocs.length > 8) {
          responseText += `  *...y ${matchingDocs.length - 8} documentos adicionales encontrados en el RCV de ${company.name}.*\n`;
        }
        responseText += `\n💡 **Recomendación de Junior para Conciliar:**\n`;
        responseText += `Para vincularlos con la cartola bancaria, entra a **Conciliación Bancaria** y utiliza **⚡ Match Automático Multimes** o concilia manualmente seleccionando el movimiento.\n`;
      } else if (matchingAux.length > 0) {
        responseText += `🏢 **Auxiliar Registrado:** ${matchingAux[0].name} (RUT: ${matchingAux[0].rut})\n\n`;
        responseText += `Se detectó la entidad en el maestro de auxiliares. Puedes revisar los movimientos en el Libro Diario o Libro Auxiliar de Proveedores/Clientes.\n`;
      } else {
        responseText += `⚠️ No se encontraron DTEs en el RCV que coincidan con la búsqueda de RUT/monto en los registros actuales de **${company.name}**.\n\n`;
        responseText += `💡 **Pasos recomendados por Junior:**\n`;
        responseText += `1️⃣ Confirma si las facturas del período fueron importadas en el **Registro de Compras y Ventas (RCV)**.\n`;
        responseText += `2️⃣ Ve al módulo **Conciliación Bancaria** y utiliza **⚡ Match Automático Multimes** para cruzar la cartola del banco con las facturas pendientes.\n`;
        responseText += `3️⃣ Si deseas borrar o volver a cargar una cartola sin movimientos conciliados, utiliza el botón **🗑️ Anular Cartola**.\n`;
      }

      return {
        response: responseText,
        suggestions: [
          'Ir a Conciliación Bancaria',
          'Ver RCV Compras y Ventas',
          'Buscar otra factura por RUT'
        ],
        actionLink: { tab: 'conciliacion', label: 'Abrir Conciliación Bancaria' }
      };
    }

    // 1. GESTIÓN Y FINANZAS PARA CLIENTES: DE LA CONTABILIDAD A LA GESTIÓN (Estratégico)
    if (q.includes('gestion') || q.includes('gestión') || q.includes('informe') || q.includes('gerencia') || q.includes('directorio') || q.includes('centro de costo') || q.includes('centros de costo') || q.includes('rentabilidad') || q.includes('reporte gerencial') || q.includes('aperturar')) {
      return {
        response: `📊 **De la Contabilidad Tradicional a la Gestión Estratégica (Valor para el Cliente):**\n\n` +
          `Para que el estudio contable entregue asesoría de alto impacto a la gerencia de **${company.name}**:\n\n` +
          `💡 **1. Apertura de Cuentas de Costos en Centros de Costo e Ítems de Gasto:**\n` +
          `   • No acumules los desembolsos en una sola cuenta genérica de gasto o costo.\n` +
          `   • **Recomendación de Junior:** Al contabilizar, asocia obligatoriamente cada línea de costo a un **Centro de Costo** (ej. *Administración, Ventas, Sucursal 1, Obra Central*) y a un **Ítem de Gasto** (ej. *Arriendos, Combustibles, Mantención*).\n` +
          `   • *Resultado:* Podrás emitir el **Estado de Resultados por Centro de Costo**, revelando qué área genera ganancias y cuál está destruyendo margen.\n\n` +
          `📜 **2. Respaldo Tributario Clave: Revisa la Circular N° 53 de 2020 del SII:**\n` +
          `   • En esta circular, el SII modernizó el concepto de **Gasto Deducible (Art. 31 LIR)**: ya no exige que el gasto sea 'estrictamente inevitable', sino que tenga **aptitud para generar renta** en el ejercicio o a futuro.\n` +
          `   • La imputación rigurosa por centro de costo sirve como **prueba fehaciente ante el SII** de la correlación económica y necesidad del gasto.\n\n` +
          `📈 **3. Indicadores Financieros de Gestión que Debes Presentar a tu Cliente:**\n` +
          `   • **Margen de Contribución:** (Ventas - Costos Variables) / Ventas.\n` +
          `   • **EBITDA:** Resultado Operativo antes de intereses, impuestos, depreciaciones y amortizaciones.\n` +
          `   • **Ciclo de Conversión de Efectivo:** Días Calle de Clientes (DSO) vs Días de Crédito de Proveedores (DPO).\n\n` +
          `¿Deseas que auditemos qué cuentas de gasto carecen actualmente de Centro de Costo asignado en el Plan de Cuentas?`,
        suggestions: ['Auditar Plan de Cuentas', 'Ver Tablas de Centros de Costo', 'Consultar Circular 53 SII', 'Ver Estado de Resultados IFRS'],
        actionLink: { tab: 'tablasAnalisis', label: 'Gestionar Centros de Costo' }
      };
    }

    // 2. LEGISLACIÓN TRIBUTARIA CHILENA: CIRCULARES Y RESOLUCIONES SII (Art. 31, 21, 14A/D3/D8)
    if (q.includes('circular') || q.includes('circulares') || q.includes('art 31') || q.includes('art. 31') || q.includes('gasto aceptado') || q.includes('gasto rechazado') || q.includes('art 21') || q.includes('art. 21') || q.includes('sii') || q.includes('oficio')) {
      return {
        response: `⚖️ **Jurisprudencia y Criterios Oficiales del SII para ${company.name}:**\n\n` +
          `📘 **1. Circular N° 53 del SII (2020) - Gastos Aceptados (Art. 31 LIR):**\n` +
          `   • Sustituye el criterio rígido de 'necesidad estricta' por el de **'aptitud para generar rentas'**.\n` +
          `   • **Gastos Admisibles:** Gastos de desarrollo de nuevos proyectos (incluso si no prosperan), asesorías legales/financieras/contables, indemnizaciones comerciales, fidelización y publicidad.\n` +
          `   • **Requisitos Copulativos:** 1) Aptitud generadora, 2) Pagado o adeudado en el ejercicio, 3) Documentación fehaciente (no basta la mera factura, se requiere orden de compra, informes o entregables), 4) Corresponder al giro.\n\n` +
          `🚫 **2. Gastos Rechazados (Art. 21 LIR):**\n` +
          `   • **Inciso 1° (40% de Tasa Única a Nivel de Empresa):** Gastos de la empresa que no califican como aceptados y no beneficien directamente a los socios (ej. multas fiscales, intereses penales, faltantes no acreditados).\n` +
          `   • **Inciso 3° (Atribuibles a Socios o Accionistas):** Tributan en el IGC del socio + un **recargo del 10%** (ej. automóviles de uso personal, retiros encubiertos, gastos familiares pagados por la empresa).\n\n` +
          `📑 **Otras Circulares Fundamentales:**\n` +
          `   • **Circular N° 62/2020:** Tributación ProPyme General (14 D3 - Base flujo de caja) y ProPyme Transparente (14 D8 - 0% IDPC).\n` +
          `   • **Circular N° 73/2020:** Régimen Semi-Integrado 14 A (Tasa 27% y restitución del 35% del crédito).\n` +
          `   • **Circular N° 48/2022:** IVA a todos los servicios (Ley 21.420) y exención estricta para Sociedades de Profesionales.\n` +
          `   • **Circular N° 10/2024 (Res. 108):** Obligación de entidades financieras de reportar cuentas con más de 50 transferencias bancarias de distintos emisores en un mes.`,
        suggestions: ['Consultar Tributación Internacional', 'Ver Plan de Cuentas', 'Auditar F29 e Impuestos'],
        actionLink: { tab: 'chartOfAccounts', label: 'Revisar Atributos en Plan de Cuentas' }
      };
    }

    // 3. TRIBUTACIÓN INTERNACIONAL, CONVENIOS DE DOBLE IMPOSICIÓN (CDI) & PRECIOS DE TRANSFERENCIA
    if (q.includes('internacional') || q.includes('exterior') || q.includes('cdi') || q.includes('convenio') || q.includes('doble imposicion') || q.includes('doble imposición') || q.includes('transferencia') || q.includes('transfer pricing') || q.includes('art 59') || q.includes('art. 59') || q.includes('art 41') || q.includes('art. 41') || q.includes('impuesto adicional') || q.includes('wht')) {
      return {
        response: `🌍 **Tributación Internacional y Convenios (CDI) para ${company.name}:**\n\n` +
          `📜 **1. Convenios para Evitar la Doble Imposición (Red CDI de Chile):**\n` +
          `   • Chile cuenta con más de **36 convenios bilaterales vigentes** bajo el modelo OCDE/ONU (incluyendo el nuevo tratado con **EE.UU. vigente desde 2024**, España, Canadá, Reino Unido, Brasil, etc.).\n` +
          `   • **Art. 7 (Beneficios Empresariales):** Las utilidades obtenidas por una empresa extranjera solo pueden gravarse en Chile si realiza su actividad a través de un **Establecimiento Permanente (EP)** en el país. Si no hay EP, la retención en Chile puede reducirse al **0%**, acreditando residencia con el correspondiente *Tax Residence Certificate*.\n\n` +
          `💸 **2. Impuesto Adicional y Retenciones por Servicios del Exterior (Art. 59 LIR):**\n` +
          `   • **Regla General:** Retención del **35%** sobre remesas o pagos al exterior por servicios prestados en Chile o en el extranjero.\n` +
          `   • **Asesorías Técnicas y Servicios Profesionales:** Tasa reducida del **15%** (o 20% si el prestador está constituido en una jurisdicción con régimen fiscal preferencial / paraíso fiscal según Art. 41 H).\n` +
          `   • **Licencias de Software y Soporte:** Tasa del 15% o exención según tratado CDI.\n\n` +
          `📊 **3. Precios de Transferencia (Art. 41 E LIR):**\n` +
          `   • Toda transacción transfronteriza entre partes relacionadas debe respetar el **Principio de Plena Competencia (Arm's Length)**.\n` +
          `   • **Métodos OCDE Reconocidos:** Precio Comparable No Controlado (CUP), Costo Adicionado, Precio de Reventa, Margen Neto Transaccional (TNMM) y División de Utilidades.\n` +
          `   • **Declaraciones Juradas Obligatorias:** F1907 (Precios de Transferencia), F1937 (Reporte País por País) y Estudio Técnico Local / Master File.\n\n` +
          `🔒 **4. Normas Anti-Elusión Internacional:** Art. 41 F (Exceso de Endeudamiento con deuda relacionada) y Art. 41 G (Régimen de Transparencia de Rentas Pasivas en el Exterior - CFC Rules).`,
        suggestions: ['Consultar Circulares SII', 'De Contabilidad a Gestión', 'Ver Retenciones F29']
      };
    }

    // 4. Simulación o Consulta de Boleta de Honorarios / Retención 14.5%
    if (q.includes('honorario') || q.includes('bhr') || q.includes('retencion') || q.includes('retención') || q.includes('14.5') || q.includes('boleta de honorario')) {
      const matchNum = q.match(/\d+([.,]\d+)?/g);
      let exampleBruto = 1000000;
      if (matchNum && matchNum.length > 0) {
        const parsed = parseInt(matchNum[0].replace(/\D/g, ''), 10);
        if (parsed > 1000) exampleBruto = parsed;
      }

      const tasaRet = 0.145; // 14.5% Ley 21.133
      const retencion = Math.round(exampleBruto * tasaRet);
      const liquido = exampleBruto - retencion;

      // Cálculo inverso (de líquido a bruto)
      const brutoDesdeLiquido = Math.round(exampleBruto / (1 - tasaRet));
      const retDesdeLiquido = brutoDesdeLiquido - exampleBruto;

      return {
        response: `📋 **Simulador y Normativa de Boletas de Honorarios (Segunda Categoría - Chile):**\n\n` +
          `• **Tasa de Retención Vigente:** **14.5%** (Ley N° 21.133 para cobertura de seguridad social).\n` +
          `• **Código Formulario 29:** Línea 57, Código [151] (Retención Impuesto 2da Categoría).\n\n` +
          `💰 **Simulación con $ ${exampleBruto.toLocaleString('es-CL')}:**\n` +
          `  - **Si el valor ingresado es BRUTO:**\n` +
          `    • Honorario Bruto: $ ${exampleBruto.toLocaleString('es-CL')}\n` +
          `    • Retención 14.5% (a pagar en F29): **$ ${retencion.toLocaleString('es-CL')}**\n` +
          `    • Líquido a Pagar al Prestador: **$ ${liquido.toLocaleString('es-CL')}**\n\n` +
          `  - **Si el valor ingresado es LÍQUIDO (Pacto Líquido):**\n` +
          `    • Honorario Bruto Requerido: **$ ${brutoDesdeLiquido.toLocaleString('es-CL')}**\n` +
          `    • Retención 14.5%: $ ${retDesdeLiquido.toLocaleString('es-CL')}\n` +
          `    • Líquido Efectivo: $ ${exampleBruto.toLocaleString('es-CL')}\n\n` +
          `💡 **Propuesta de Asiento Contable:**\n` +
          `  - [4201002] Gastos por Honorarios Profesionales (Debe): $ ${exampleBruto.toLocaleString('es-CL')}\n` +
          `  - [2103003] Retenciones de Impuesto 2da Cat. F29 (Haber): $ ${retencion.toLocaleString('es-CL')}\n` +
          `  - [2101002] Honorarios por Pagar (Haber): $ ${liquido.toLocaleString('es-CL')}`,
        suggestions: ['Ver Honorarios en RCV', 'Ver Formulario 29', 'Proponer otro asiento contable'],
        actionLink: { tab: 'rcv', label: 'Ver Registro de Honorarios' }
      };
    }

    // 2. Margen Operacional y Contabilidad Financiera IFRS (NIC 1, NIC 2)
    if (q.includes('margen') || q.includes('ifrs') || q.includes('estado de resultados') || q.includes('ingresos operacionales') || q.includes('costo de venta') || q.includes('bruto')) {
      // Calcular datos reales de la empresa
      const validVouchers = vouchers.filter(v => v.status !== 'Anulado');
      let totalVentasIngresos = 0;
      let totalCostosVenta = 0;
      let totalGastosAdmin = 0;

      validVouchers.forEach(v => {
        (v.lines || []).forEach(l => {
          const code = (l.accountCode || '').trim();
          const debit = Number(l.debit) || 0;
          const credit = Number(l.credit) || 0;

          if (code.startsWith('3') || code.startsWith('31')) {
            totalVentasIngresos += (credit - debit);
          } else if (code.startsWith('41') || code.startsWith('4.1')) {
            totalCostosVenta += (debit - credit);
          } else if (code.startsWith('42') || code.startsWith('4.2') || code.startsWith('4')) {
            totalGastosAdmin += (debit - credit);
          }
        });
      });

      const margenOperacionalBruto = totalVentasIngresos - totalCostosVenta;
      const porcentajeMargen = totalVentasIngresos > 0 ? ((margenOperacionalBruto / totalVentasIngresos) * 100).toFixed(1) : '0.0';
      const ebitda = margenOperacionalBruto - totalGastosAdmin;

      return {
        response: `🏛️ **Estructura Financiera IFRS / NIIF para ${company.name}:**\n\n` +
          `Conforme a la **NIC 1 (Presentación de Estados Financieros)** y **NIC 2 (Inventarios)**, el Estado de Resultados por Función se estructura en cascada:\n\n` +
          `1️⃣ **Ingresos de Actividades Ordinarias (Cuentas 31xxxxx):** $ ${totalVentasIngresos.toLocaleString('es-CL')}\n` +
          `2️⃣ **Menos Costo de Ventas / Explotación (Cuentas 41xxxxx):** $ ${totalCostosVenta.toLocaleString('es-CL')}\n` +
          `────────────────────────────────────────────\n` +
          `💎 **MARGEN OPERACIONAL (Ganancia Bruta):** **$ ${margenOperacionalBruto.toLocaleString('es-CL')}** (${porcentajeMargen}% sobre ventas)\n` +
          `3️⃣ **Menos Gastos de Administración y Ventas (42xxxxx):** $ ${totalGastosAdmin.toLocaleString('es-CL')}\n` +
          `────────────────────────────────────────────\n` +
          `📈 **Resultado Operacional (EBIT / Operativo):** **$ ${ebitda.toLocaleString('es-CL')}**\n\n` +
          `📌 **Principio de Partida Doble:** En el Balance Clasificado IFRS, siempre se valida que:\n` +
          `**ACTIVO (Corriente + No Corriente) = PASIVO (Corriente + No Corriente) + PATRIMONIO NETO**`,
        suggestions: ['Ver Estado de Resultados IFRS', 'Ver Balance Clasificado IFRS', 'Revisar Balance 8 Columnas'],
        actionLink: { tab: 'estadoResultados', label: 'Abrir Estado de Resultados IFRS' }
      };
    }

    // 3. Regímenes Tributarios Chilenos (14A, 14D3, 14D8) y Capital Propio Tributario
    if (q.includes('regimen') || q.includes('régimen') || q.includes('14a') || q.includes('14 d') || q.includes('14d') || q.includes('propyme') || q.includes('cpt') || q.includes('rli')) {
      const reg = company.regimenTributario || 'ProPyme General (Art. 14 D N° 3)';
      return {
        response: `⚖️ **Normativa Tributaria Chilena - Regímenes Ley de la Renta (LIR):**\n\n` +
          `🏢 **Régimen de ${company.name}:** **${reg}**\n\n` +
          `📌 **Resumen de los Principales Regímenes en Chile:**\n\n` +
          `• **1. Régimen ProPyme General (Art. 14 D N° 3):**\n` +
          `  - Tasa Impuesto 1ra Categoría: 25% (o tasa reducida transitoria).\n` +
          `  - Base Imponible simplificada: Ingresos percibidos menos gastos pagados.\n` +
          `  - Crédito de los socios: 100% computable contra IGC / IA.\n` +
          `  - Contabilidad completa con opción de simplificada.\n\n` +
          `• **2. Régimen ProPyme Transparente (Art. 14 D N° 8):**\n` +
          `  - La empresa está **exenta** de Impuesto de Primera Categoría (0%).\n` +
          `  - El resultado tributario se atribuye directamente a los socios en el mismo año.\n\n` +
          `• **3. Régimen General Semi-Integrado (Art. 14 A):**\n` +
          `  - Tasa Impuesto 1ra Categoría: 27% sobre RLI con contabilidad completa.\n` +
          `  - Crédito de los socios: 65% (restitución del 35%).\n\n` +
          `¿Deseas simular la tasa de PPM o consultar el cálculo de RLI / CPT?`,
        suggestions: ['Simular tasa de PPM', 'Ver Formulario 29', 'Ver Plan de Cuentas']
      };
    }

    // 4. IVA, F29, Débito, Crédito, Remanente y PPM
    if (q.includes('iva') || q.includes('f29') || q.includes('debito') || q.includes('débito') || q.includes('credito') || q.includes('crédito') || q.includes('ppm') || q.includes('impuesto')) {
      const totalVentas = rcvDocuments.filter(d => d.tipoRegistro === 'Venta');
      const totalCompras = rcvDocuments.filter(d => d.tipoRegistro === 'Compra');
      const totalHonorarios = rcvDocuments.filter(d => d.tipoRegistro === 'Honorarios');

      const sumDebito = totalVentas.reduce((acc, curr) => acc + (Number(curr.montoIva) || 0), 0);
      const sumCredito = totalCompras.reduce((acc, curr) => acc + (Number(curr.montoIva) || 0), 0);
      const sumNetoVentas = totalVentas.reduce((acc, curr) => acc + (Number(curr.montoNeto) || 0), 0);
      const sumNetoCompras = totalCompras.reduce((acc, curr) => acc + (Number(curr.montoNeto) || 0), 0);
      const retencionHonorarios = totalHonorarios.reduce((acc, curr) => acc + (Number(curr.montoRetencion || curr.montoIva) || 0), 0);

      const diffIva = sumDebito - sumCredito;
      const ppmTasa = company.tasaPpm || 0.25; // 0.25% default ProPyme
      const ppmEstimado = Math.round(sumNetoVentas * (ppmTasa / 100));

      let analysisText = `📊 **Liquidación y Auditoría Tributaria F29 para ${company.name}:**\n\n`;
      analysisText += `• **Ventas Facturadas:** ${totalVentas.length} docs | Base Neta: $ ${sumNetoVentas.toLocaleString('es-CL')}\n`;
      analysisText += `• **Débito Fiscal IVA (19%):** $ ${sumDebito.toLocaleString('es-CL')} (Línea 14 / Cód. 142)\n`;
      analysisText += `• **Compras con Crédito:** ${totalCompras.length} docs | Base Neta: $ ${sumNetoCompras.toLocaleString('es-CL')}\n`;
      analysisText += `• **Crédito Fiscal IVA (19%):** $ ${sumCredito.toLocaleString('es-CL')} (Línea 23 / Cód. 520)\n`;

      if (totalHonorarios.length > 0) {
        analysisText += `• **Retención Honorarios (14.5%):** $ ${retencionHonorarios.toLocaleString('es-CL')} (${totalHonorarios.length} boletas / Cód. 151)\n`;
      }

      analysisText += `• **PPM Obligatorio Estimado (${ppmTasa}%):** $ ${ppmEstimado.toLocaleString('es-CL')} (Cód. 062/115)\n\n`;

      analysisText += `📌 **Resultado Neto Estimado:** `;
      if (diffIva > 0) {
        const totalPagar = diffIva + retencionHonorarios + ppmEstimado;
        analysisText += `Impuesto Determinado IVA a Pagar de **$ ${diffIva.toLocaleString('es-CL')}**.\n` +
          `Total a Pagar en Formulario 29 (con PPM y retenciones): **$ ${totalPagar.toLocaleString('es-CL')}**.`;
      } else if (diffIva < 0) {
        const remanente = Math.abs(diffIva);
        analysisText += `**Remanente de Crédito Fiscal** a favor para el mes siguiente de **$ ${remanente.toLocaleString('es-CL')}** (Art. 28 DL 825).`;
      } else {
        analysisText += `IVA en equilibrio ($ 0).`;
      }

      return {
        response: analysisText,
        suggestions: ['Ir al Formulario 29 Oficial', 'Ver Compras y Ventas RCV', 'Revisar Balance IFRS'],
        actionLink: { tab: 'formulario29', label: 'Abrir Formulario 29 (F29)' }
      };
    }

    // 5. Conciliación Bancaria y Partidas Pendientes
    if (q.includes('concilia') || q.includes('cartola') || q.includes('banco') || q.includes('partidas pendientes') || q.includes('cheque en transito') || q.includes('regulariza')) {
      return {
        response: `🏦 **Asistencia para Conciliación Bancaria y Partidas Pendientes:**\n\n` +
          `Para asegurar la cuadratura perfecta entre la **Cartola Bancaria** y el **Libro Mayor de Banco**:\n\n` +
          `1️⃣ **Partidas Pendientes del Banco (Cartola no contabilizada):**\n` +
          `   • Cargos bancarios / comisiones (ej: Mantención de cuenta cta 4301001).\n` +
          `   • Abonos o transferencias directas de clientes sin comprobante de ingreso.\n` +
          `   *Solución:* Puedes crear el voucher con un solo clic mediante el botón "⚡ Asiento Rápido".\n\n` +
          `2️⃣ **Partidas Pendientes del Libro Mayor (Contabilidad en tránsito):**\n` +
          `   • Cheques girados y no cobrados por proveedores.\n` +
          `   • Depósitos contabilizados al cierre aún no acreditados en la cartola.\n\n` +
          `📑 **Nuevo Reporte Disponible:** En la pestaña de Conciliación Bancaria puedes abrir el **Reporte Oficial de Partidas Pendientes** para imprimirlo o exportarlo a Excel.`,
        suggestions: ['Ir a Conciliación Bancaria', 'Ver Libro Mayor de Banco', 'Revisar Vouchers'],
        actionLink: { tab: 'conciliacionBancaria', label: 'Abrir Conciliación Bancaria' }
      };
    }

    // 6. Asistente y Propuesta de Asientos Contables con formato de 7 dígitos
    if (q.includes('asiento') || q.includes('proponer') || q.includes('contabilizar') || q.includes('como registro') || q.includes('gasto') || q.includes('compra')) {
      return {
        response: `✍️ **Generador de Asientos Contables Sugeridos (Estructura Estándar 7 Dígitos):**\n\n` +
          `Ejemplos frecuentes según el Plan de Cuentas de **${company.name}**:\n\n` +
          `🛒 **1. Compra de Mercadería / Existencias con Factura Afecta:**\n` +
          `   • [1103001] Mercaderías (Activo) ─────────── Debe $ 1.000.000\n` +
          `   • [1104001] IVA Crédito Fiscal (Activo) ──── Debe $ 190.000\n` +
          `   • [2101001] Proveedores Nacionales (Pasivo) ─ Haber $ 1.190.000\n\n` +
          `💼 **2. Venta de Servicios / Mercaderías:**\n` +
          `   • [1102001] Clientes Nacionales (Activo) ──── Debe $ 1.190.000\n` +
          `   • [3101001] Ventas de Bienes/Servicios (Ingreso) ── Haber $ 1.000.000\n` +
          `   • [2103001] IVA Débito Fiscal (Pasivo) ────── Haber $ 190.000\n\n` +
          `🏢 **3. Pago de Arriendo / Servicios:**\n` +
          `   • [4202001] Gastos de Arriendo (Resultado Pérdida) ── Debe $ 500.000\n` +
          `   • [1101002] Banco Cta Cte (Activo) ──────────── Haber $ 500.000\n\n` +
          `¿Necesitas que te arme el asiento para una operación particular? Indícame el monto y el concepto.`,
        suggestions: ['Crear nuevo Comprobante', 'Ver Plan de Cuentas', 'Ver Libro Diario'],
        actionLink: { tab: 'vouchers', label: 'Ir a Creación de Comprobantes' }
      };
    }

    // 7. Auditoría de cuadratura / Balance / Asientos
    if (q.includes('balance') || q.includes('cuadratura') || q.includes('diario') || q.includes('comprobantes')) {
      let totalDebe = 0;
      let totalHaber = 0;
      let descuadradosCount = 0;

      vouchers.forEach((v) => {
        const vDebe = (v.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
        const vHaber = (v.lines || []).reduce((s, l) => s + (Number(l.credit) || 0), 0);
        totalDebe += vDebe;
        totalHaber += vHaber;
        if (Math.abs(vDebe - vHaber) > 0.01) {
          descuadradosCount++;
        }
      });

      const diferencia = Math.abs(totalDebe - totalHaber);
      let balanceReport = `📋 **Auditoría de Comprobantes y Partida Doble para ${company.name}:**\n\n`;
      balanceReport += `• **Comprobantes Totales:** ${vouchers.length} asientos ingresados.\n`;
      balanceReport += `• **Sumas Acumuladas del Libro Diario:**\n`;
      balanceReport += `  - Total Debe: $ ${totalDebe.toLocaleString('es-CL')}\n`;
      balanceReport += `  - Total Haber: $ ${totalHaber.toLocaleString('es-CL')}\n`;

      if (descuadradosCount === 0 && diferencia === 0) {
        balanceReport += `\n✅ **Estado:** ¡Cuadratura perfecta! El Libro Diario y Balance cumplen rigurosamente el principio de Partida Doble (Diferencia: $ 0).`;
      } else {
        balanceReport += `\n⚠️ **Atención:** Se detectaron ${descuadradosCount} comprobantes con descuadre. Diferencia total: $ ${diferencia.toLocaleString('es-CL')}.`;
      }

      return {
        response: balanceReport,
        suggestions: ['Ver Balance de 8 Columnas', 'Ver Balance Clasificado IFRS', 'Ver Libro Diario'],
        actionLink: { tab: 'balance8', label: 'Abrir Balance de 8 Columnas' }
      };
    }

    // 8. Timbraje, Hojas Sueltas y Folios Oficiales SII
    if (q.includes('folio') || q.includes('timbraje') || q.includes('hojas sueltas') || q.includes('libro oficial') || q.includes('resolucion sii') || q.includes('crystal')) {
      return {
        response: `🖨️ **Control de Folios Oficiales y Timbraje SII (Hojas Sueltas):**\n\n` +
          `Bajo la normativa del Servicio de Impuestos Internos (Res. Ex. N° 80 / 85 del SII y Código Tributario Art. 17):\n\n` +
          `• **Autorizaciones de Hojas Sueltas:** Toda empresa que imprime libros contables mediante sistemas computacionales debe contar con una Resolución de Timbraje de Hojas Sueltas con rango de folios autorizados.\n` +
          `• **Correlatividad y Trazabilidad:** Al emitir el **Libro Diario**, **Libro Mayor** o **Balance de 8 Columnas**, el sistema numera correlativamente cada página (ej. Folio N° 000101 al 000120) e incluye el membrete legal con la Resolución SII.\n` +
          `• **Control de Saldos:** Cada impresión descuenta automáticamente los folios disponibles en la bodega de la empresa para evitar reutilización o saltos de numeración.\n` +
          `• **Diseño Crystal Reports:** Las hojas oficiales incluyen las marcas reglamentarias de *"VAN / VIENEN"* entre páginas y los recuadros de firma para el Contador General y el Representante Legal.`,
        suggestions: ['Ir a Control de Folios SII', 'Emitir Libro Diario Oficial', 'Emitir Balance Oficial'],
        actionLink: { tab: 'controlFolios', label: 'Abrir Control de Folios y Timbraje SII' }
      };
    }

    // 9. Respuesta genérica
    return {
      response: `Soy **Junior**, tu asistente contable para **${company.name}**.\n\nPuedo ayudarte con:\n` +
        `• **Tributaria Chilena:** Cálculo de F29, IVA, retención honorarios 14.5%, PPM y regímenes 14A/14D3.\n` +
        `• **Contabilidad IFRS:** Margen Operacional, Balance Clasificado, NIC 1, NIC 2, NIC 16 y Ecuación Patrimonial.\n` +
        `• **Operación Diaria:** Auditoría de cuadratura, partidas pendientes de conciliación bancaria y propuesta de asientos.\n` +
        `• **Libros Oficiales SII:** Emisión de Libro Diario, Mayor y Balance con timbraje de folios y formato Crystal Reports.`,
      suggestions: [
        'Resumen de IVA y Formulario 29',
        'Analizar Margen Operacional IFRS',
        'Simular cálculo de Boleta de Honorarios',
        'Auditar cuadratura del Balance',
        'Ver Control de Folios y Timbraje SII'
      ]
    };
  };

  const handleSend = (textToSend?: string) => {
    const text = textToSend || inputMessage;
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: text.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputMessage('');
    setIsAnalyzing(true);

    setTimeout(() => {
      const result = processAccountingQuery(text);
      setIsAnalyzing(false);

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: result.response,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestions: result.suggestions,
        actionLink: result.actionLink
      };

      setMessages(prev => [...prev, aiMsg]);
    }, 500);
  };

  return (
    <>
      {/* Botón flotante de Junior en la empresa */}
      <div className="fixed bottom-6 right-6 z-40">
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2.5 bg-gradient-to-r from-emerald-600 via-teal-700 to-indigo-800 text-white px-4 py-3 rounded-full shadow-xl shadow-emerald-950/40 hover:shadow-emerald-600/50 hover:scale-105 transition-all duration-200 border border-emerald-400/40 group"
            title={`Junior - Asistente Contable y de Gestión para ${company.name}`}
          >
            <AnimatedOkLogo size="sm" />
            <div className="text-left pr-1">
              <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                <span>Junior</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/30 text-emerald-100 rounded font-medium">Copiloto IA</span>
              </div>
              <div className="text-[11px] text-emerald-100/90 truncate max-w-[140px]">{company.name}</div>
            </div>
          </button>
        )}

        {/* Ventana de Chat de Junior */}
        {isOpen && (
          <div className="w-[380px] sm:w-[440px] h-[600px] max-h-[85vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200 font-sans z-50">
            
            {/* Header de Junior */}
            <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 p-3.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <AnimatedOkLogo size="md" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-slate-900 rounded-full"></span>
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>Junior</span>
                    <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/40">
                      IFRS, Tributario & Gestión
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-300/90 font-medium truncate max-w-[230px]">
                    🏢 {company.name} ({company.rut})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
                  title="Minimizar"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-red-400 p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
                  title="Cerrar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Banner Proactivo Activo (No Invasivo): Apoyo Tributario y de Gestión */}
            <div className="bg-emerald-950/90 border-b border-emerald-800/40 px-3.5 py-2 text-[11px] text-emerald-200 flex items-center justify-between gap-2 shadow-inner">
              <div className="flex items-center gap-2 overflow-hidden">
                <Lightbulb className="w-3.5 h-3.5 text-amber-300 shrink-0 animate-pulse" />
                <span className="truncate">
                  <strong>Tip de Gestión:</strong> Imputa Centros de Costo en cuentas de resultado (Circular SII N° 53/2020)
                </span>
              </div>
              <button
                onClick={() => handleSend('¿Cómo usar Centros de Costo para entregar informes de gestión a clientes según Circular 53 del SII?')}
                className="shrink-0 text-[10px] bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-2 py-0.5 rounded transition shadow-xs"
              >
                Ver Guía
              </button>
            </div>

            {/* Banner de Especialidad y Aislamiento */}
            <div className="bg-emerald-950/50 border-b border-emerald-900/40 px-3 py-1.5 flex items-center justify-between text-[11px] text-emerald-300">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Memoria aislada exclusiva para {company.name}</span>
              </div>
              <button
                onClick={() => setShowKnowledgeModal(true)}
                className="text-[10px] text-emerald-300 hover:text-white bg-emerald-900/60 hover:bg-emerald-800 px-2 py-0.5 rounded border border-emerald-500/40 flex items-center gap-1 transition-colors"
                title="Ver directivas y entrenamiento activo"
              >
                <BrainCircuit className="w-3 h-3 text-amber-300" />
                <span>{trainedKnowledge.length} Reglas</span>
              </button>
            </div>

            {/* Mensajes */}
            <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 bg-slate-950/70 text-xs">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line ${
                      msg.sender === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-none shadow-sm'
                        : 'bg-slate-800 text-slate-200 border border-slate-700/80 rounded-bl-none shadow-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.time}</span>

                  {/* Botón de acción rápida a módulo contable */}
                  {msg.actionLink && onNavigateTab && (
                    <div className="mt-2">
                      <button
                        onClick={() => {
                          onNavigateTab(msg.actionLink!.tab);
                        }}
                        className="bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-all hover:scale-102"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>{msg.actionLink.label}</span>
                      </button>
                    </div>
                  )}

                  {/* Sugerencias contextuales */}
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 max-w-[95%]">
                      {msg.suggestions.map((sug, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(sug)}
                          className="text-[11px] bg-slate-800 hover:bg-emerald-950 text-emerald-300 hover:text-emerald-200 border border-slate-700 hover:border-emerald-500/50 px-2.5 py-1 rounded-full transition-all text-left flex items-center gap-1"
                        >
                          <span>{sug}</span>
                          <ArrowRight className="w-2.5 h-2.5 opacity-60" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {isAnalyzing && (
                <div className="flex items-center gap-2 text-slate-400 bg-slate-800 border border-slate-700 w-fit px-3 py-2 rounded-2xl rounded-bl-none text-xs">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  </div>
                  <span className="text-[11px] text-emerald-300">Junior analizando normativa y datos contables...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Píldoras Rápidas de Temas Especializados */}
            <div className="px-2.5 pt-2 pb-1 bg-slate-900 border-t border-slate-800 flex gap-1.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => handleSend('¿Cómo usar Centros de Costo para entregar informes de gestión a clientes según Circular 53 del SII?')}
                className="whitespace-nowrap text-[10px] bg-slate-800 hover:bg-emerald-950 text-emerald-300 hover:text-emerald-100 border border-slate-700 hover:border-emerald-500/50 px-2 py-1 rounded-full transition flex items-center gap-1 shrink-0"
              >
                📊 De Contabilidad a Gestión
              </button>
              <button
                type="button"
                onClick={() => handleSend('¿Cuáles son las Circulares clave del SII sobre gastos aceptados (Art. 31 y 21 LIR)?')}
                className="whitespace-nowrap text-[10px] bg-slate-800 hover:bg-emerald-950 text-emerald-300 hover:text-emerald-100 border border-slate-700 hover:border-emerald-500/50 px-2 py-1 rounded-full transition flex items-center gap-1 shrink-0"
              >
                📘 Circulares SII (Art. 31)
              </button>
              <button
                type="button"
                onClick={() => handleSend('¿Cómo operan los Convenios de Doble Imposición (CDI) y Precios de Transferencia en Chile?')}
                className="whitespace-nowrap text-[10px] bg-slate-800 hover:bg-emerald-950 text-emerald-300 hover:text-emerald-100 border border-slate-700 hover:border-emerald-500/50 px-2 py-1 rounded-full transition flex items-center gap-1 shrink-0"
              >
                🌍 Tributación Internacional
              </button>
              <button
                type="button"
                onClick={() => handleSend('Analizar Margen Operacional IFRS')}
                className="whitespace-nowrap text-[10px] bg-slate-800 hover:bg-emerald-950 text-emerald-300 hover:text-emerald-100 border border-slate-700 hover:border-emerald-500/50 px-2 py-1 rounded-full transition flex items-center gap-1 shrink-0"
              >
                📐 Margen IFRS
              </button>
            </div>

            {/* Input del Chat */}
            <div className="p-2.5 bg-slate-900 border-t border-slate-800/80">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={`Pregúntale a Junior sobre tributaria, IFRS o asientos...`}
                  className="flex-1 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!inputMessage.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white p-2 rounded-xl transition-colors shrink-0"
                  aria-label="Enviar a Junior"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>

          </div>
        )}
      </div>

      {/* Modal: Directivas de Entrenamiento Activas */}
      {showKnowledgeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-5 text-white shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm uppercase text-white">
                  Base de Conocimiento y Entrenamiento de Junior
                </h3>
              </div>
              <button
                onClick={() => setShowKnowledgeModal(false)}
                className="text-slate-400 hover:text-white font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              <p className="text-slate-400 text-[11px]">
                Directivas activas configuradas por el Administrador. Las reglas específicas de <strong>{company.name}</strong> tienen prioridad y se encuentran aisladas.
              </p>

              {trainedKnowledge.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border ${
                    item.scope === 'COMPANY'
                      ? 'bg-emerald-950/40 border-emerald-700/60'
                      : 'bg-slate-800/80 border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-100 text-xs">{item.title}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                      item.scope === 'COMPANY' ? 'bg-emerald-500 text-slate-950' : 'bg-indigo-900 text-indigo-200'
                    }`}>
                      {item.scope === 'COMPANY' ? 'Aislado Empresa' : 'Global'}
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed mb-2 font-sans">
                    {item.directiveContent}
                  </p>
                  {item.recommendedEntries && (
                    <div className="p-2 bg-slate-950/60 rounded border border-slate-800 text-[10px] font-mono text-amber-300">
                      👉 {item.recommendedEntries}
                    </div>
                  )}
                </div>
              ))}

              {trainedKnowledge.length === 0 && (
                <div className="text-center py-8 text-slate-500 text-xs">
                  No hay directivas de entrenamiento adicionales cargadas. Junior opera con sus reglas predeterminadas de LIR, IVA y NIC 1.
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 pt-3 flex justify-end">
              <button
                onClick={() => setShowKnowledgeModal(false)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
