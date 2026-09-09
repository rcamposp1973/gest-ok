import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, UserPlus, Search, Edit2, Trash2, CheckCircle2, XCircle, 
  Building2, DollarSign, Shield, HeartPulse, FileText, 
  Download, Upload, Sparkles, Filter, Briefcase, Calendar, CreditCard, ChevronRight,
  Calculator, Printer, Save, FileSpreadsheet, AlertCircle, Eye, Check, Copy, FileCheck
} from 'lucide-react';
import { Employee, ContractType, PensionSystem, HealthSystem, HealthPlanType, ApvType, TramoCargaFamiliar, CostCenterMaster } from '../types';
import { DEFAULT_AFP_COMMISSIONS } from '../utils/payrollCalculator';

export function generateChileanEmploymentContract(
  emp: Employee,
  companyName: string,
  companyRut: string,
  companyAddress?: string,
  templateType: string = 'CONTRATO_INDEFINIDO'
): string {
  const addressCompany = companyAddress || 'Santiago, Región Metropolitana';
  const workerRut = emp.rut || 'RUT PENDIENTE';
  const workerName = emp.name || 'TRABAJADOR';
  const workerAddress = emp.address || 'Domicilio no registrado';
  const workerNationality = emp.nationality || 'Chilena';
  const workerCivil = 'Soltero(a)';
  const workerPosition = emp.position || 'Colaborador';
  const workerHireDate = emp.hireDate || new Date().toISOString().split('T')[0];
  const sueldoBase = (emp.baseSalary || 0).toLocaleString('es-CL');
  const colacion = (emp.colacionPactada || 0).toLocaleString('es-CL');
  const movilizacion = (emp.movilizacionPactada || 0).toLocaleString('es-CL');
  const bonos = (emp.bonosPactados || 0).toLocaleString('es-CL');
  const viaticos = (emp.viaticosPactados || 0).toLocaleString('es-CL');
  const otrosImponibles = (emp.otrosImponiblesPactados || 0).toLocaleString('es-CL');
  const horasSemanales = emp.workHoursPerWeek || 45;
  const hoyStr = new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });

  const gratifClausula = emp.hasGratificacionLegal || emp.gratificacionType === 'ART_50'
    ? 'El empleador pagará al trabajador la Gratificación Legal establecida en el Artículo 50 del Código del Trabajo, equivalente al 25% (veinticinco por ciento) de lo devengado en el respectivo mes por concepto de remuneraciones mensuales, con el tope legal anual de 4,75 (cuatro coma setenta y cinco) Ingresos Mínimos Mensuales prorrateado en 12 meses.'
    : emp.gratificacionType === 'CONVENIDA'
    ? 'Las partes pactan de mutuo acuerdo una gratificación convencional del 25% mensual calculada sobre el total de haberes imponibles devengados.'
    : 'No se contempla pago de gratificación adicional conforme a la modalidad convenida entre las partes.';

  if (templateType === 'ANEXO_SUELDO') {
    return `ANEXO N° 1 AL CONTRATO INDIVIDUAL DE TRABAJO
(ACTUALIZACIÓN DE REMUNERACIONES, GRATIFICACIÓN Y BONOS)

En ${addressCompany}, a ${hoyStr}, entre:

I. EMPLEADOR: ${companyName}, R.U.T. N° ${companyRut}, con domicilio para estos efectos en ${addressCompany}, debidamente representada; y

II. TRABAJADOR: Don(ña) ${workerName}, Cédula de Identidad N° ${workerRut}, de nacionalidad ${workerNationality}, domiciliado(a) en ${workerAddress}, quien presta servicios en el cargo de "${workerPosition}".

PRIMERO: Las partes dejan expresa constancia de que se encuentra plenamente vigente entre ellas un Contrato Individual de Trabajo suscrito con fecha ${workerHireDate}.

SEGUNDO: Por medio del presente instrumento, las partes convienen de común acuerdo sustituir la cláusula relativa a las remuneraciones, estableciéndose a contar del presente período la siguiente estructura:

a) Sueldo Base Mensual: La suma de $${sueldoBase} (pesos chilenos), imponible y tributable.
b) Asignación de Colación: La suma de $${colacion} (pesos chilenos) mensuales, no imponible.
c) Asignación de Movilización: La suma de $${movilizacion} (pesos chilenos) mensuales, no imponible.
${emp.bonosPactados ? `d) Bono Imponible Pactado: La suma de $${bonos} (pesos chilenos) mensuales por concepto de bono de desempeño/responsabilidad.\n` : ''}${emp.otrosImponiblesPactados ? `e) Otros Haberes Imponibles: La suma de $${otrosImponibles} (pesos chilenos) mensuales.\n` : ''}${emp.viaticosPactados ? `f) Viáticos de Traslado: La suma de $${viaticos} (pesos chilenos) no imponibles para compensación de gastos operativos.\n` : ''}g) Gratificación: ${gratifClausula}

TERCERO: En todo lo no modificado expresamente por este anexo, subsisten y continúan plenamente vigentes todas las demás estipulaciones del contrato individual de trabajo.

Para constancia, se firman dos ejemplares del mismo tenor y fecha, quedando uno en poder de cada parte.


____________________________                    ____________________________
       POR EL EMPLEADOR                                 TRABAJADOR
${companyName}                                 ${workerName}
R.U.T.: ${companyRut}                          R.U.T.: ${workerRut}`;
  }

  if (templateType === 'ANEXO_CARGO') {
    return `ANEXO N° 2 AL CONTRATO INDIVIDUAL DE TRABAJO
(MODIFICACIÓN DE CARGO, RESPONSABILIDADES Y FUNCIONES)

En ${addressCompany}, a ${hoyStr}, entre:

I. EMPLEADOR: ${companyName}, R.U.T. N° ${companyRut}, con domicilio en ${addressCompany}; y
II. TRABAJADOR: Don(ña) ${workerName}, Cédula de Identidad N° ${workerRut}, con domicilio en ${workerAddress}.

PRIMERO: Se deja constancia que las partes mantienen un vínculo laboral vigente iniciado el ${workerHireDate}.

SEGUNDO: A contar de la fecha de suscripción del presente anexo, el trabajador pasará a desempeñar el cargo de "${workerPosition}" en el departamento de ${emp.department || 'Operaciones'}, asumiendo la totalidad de funciones técnicas, administrativas y de gestión inherentes a la posición.

TERCERO: Como contraprestación, el trabajador percibirá un sueldo base mensual de $${sueldoBase} pesos chilenos, más las asignaciones y gratificaciones legales pactadas.

CUARTO: Las partes ratifican la vigencia íntegra de las demás cláusulas contractuales no modificadas por el presente anexo.


____________________________                    ____________________________
       POR EL EMPLEADOR                                 TRABAJADOR
${companyName}                                 ${workerName}
R.U.T.: ${companyRut}                          R.U.T.: ${workerRut}`;
  }

  if (templateType === 'ANEXO_40_HORAS') {
    return `ANEXO N° 3 AL CONTRATO INDIVIDUAL DE TRABAJO
(ADECUACIÓN DE JORNADA LABORAL A LA LEY N° 21.561 - 40 HORAS)

En ${addressCompany}, a ${hoyStr}, entre:

I. EMPLEADOR: ${companyName}, R.U.T. N° ${companyRut}, domiciliada en ${addressCompany}; y
II. TRABAJADOR: Don(ña) ${workerName}, Cédula de Identidad N° ${workerRut}, domiciliado(a) en ${workerAddress}.

PRIMERO: En cumplimiento de las disposiciones de la Ley N° 21.561, que reduce la jornada ordinaria de trabajo a 40 horas semanales, las partes acuerdan adecuar la jornada pactada en el contrato individual de trabajo suscrito el ${workerHireDate}.

SEGUNDO: A contar de esta fecha, la jornada ordinaria de trabajo del trabajador se fija en ${Math.min(horasSemanales, 40)} horas semanales, distribuidas de lunes a viernes, con el correspondiente tiempo destinado a colación según el reglamento interno.

TERCERO: De conformidad con el Artículo Transitorio de la Ley N° 21.561, se deja expresa constancia de que la reducción de la jornada laboral en ningún caso implicará una disminución de las remuneraciones del trabajador, manteniéndose su sueldo base de $${sueldoBase} pesos chilenos.


____________________________                    ____________________________
       POR EL EMPLEADOR                                 TRABAJADOR
${companyName}                                 ${workerName}
R.U.T.: ${companyRut}                          R.U.T.: ${workerRut}`;
  }

  const tipoContratoTitulo = templateType === 'CONTRATO_PLAZO_FIJO' 
    ? 'CONTRATO INDIVIDUAL DE TRABAJO A PLAZO FIJO'
    : templateType === 'CONTRATO_OBRA'
    ? 'CONTRATO DE TRABAJO POR OBRA O FAENA DETERMINADA'
    : 'CONTRATO INDIVIDUAL DE TRABAJO INDEFINIDO';

  const duracionTexto = templateType === 'CONTRATO_PLAZO_FIJO'
    ? `El presente contrato tendrá una duración a plazo fijo, comenzando a regir el ${workerHireDate} y finalizando de pleno derecho el día ${emp.terminationDate || 'a definir por las partes'}, fecha en la cual cesarán automáticamente las obligaciones de las partes sin necesidad de desahucio previo.`
    : templateType === 'CONTRATO_OBRA'
    ? `El presente contrato comenzará a regir el día ${workerHireDate} y su vigencia estará estrictamente supeditada a la total y cabal conclusión de la obra, faena o servicio específico para el cual ha sido contratado el Trabajador.`
    : `El presente contrato comenzará a regir el día ${workerHireDate} y tendrá una vigencia y duración INDEFINIDA.`;

  return `${tipoContratoTitulo}
(Conforme al Código del Trabajo de Chile y Ley N° 21.561)

En la ciudad de Santiago, a ${hoyStr}, entre:

I. EMPLEADOR: ${companyName}, R.U.T. N° ${companyRut}, sociedad comercial legalmente constituida, domiciliada para estos efectos en ${addressCompany}, en adelante "el Empleador"; y

II. TRABAJADOR: Don(ña) ${workerName}, Cédula Nacional de Identidad N° ${workerRut}, de nacionalidad ${workerNationality}, estado civil ${workerCivil}, nacido(a) el ${emp.birthDate || 'No informado'}, domiciliado(a) en ${workerAddress}, en adelante "el Trabajador".

Las partes convienen y acuerdan celebrar el siguiente Contrato Individual de Trabajo:

PRIMERO: NATURALEZA DE LOS SERVICIOS Y CARGO
El Trabajador se compromete a prestar sus servicios personales y profesionales desempeñando las labores inherentes al cargo de "${workerPosition}" en el departamento de ${emp.department || 'Operaciones'}, ejecutando con la debida diligencia, fidelidad y esmero las tareas técnicas, operativas y complementarias encomendadas por la jefatura.

SEGUNDO: LUGAR DE PRESTACIÓN DE SERVICIOS
Los servicios se prestarán en las instalaciones y oficinas del Empleador ubicadas en ${addressCompany}, pudiendo desempeñarse en otras dependencias o faenas dentro del territorio nacional según los requerimientos operativos de la empresa.

TERCERO: JORNADA DE TRABAJO
La jornada ordinaria de trabajo será de ${horasSemanales} horas semanales, distribuidas de lunes a viernes en horario regular con interrupción de descanso para colación de conformidad a la legislación vigente. ${horasSemanales <= 40 ? 'Esta jornada cumple a cabalidad con la Ley N° 21.561 de 40 horas semanales.' : ''}

CUARTO: REMUNERACIONES Y BENEFICIOS
Por la prestación de los servicios contratados, el Empleador pagará al Trabajador:
a) Sueldo Base: Un sueldo base mensual de $${sueldoBase} (pesos chilenos), imponible y tributable.
b) Gratificación Legal: ${gratifClausula}
c) Asignación de Colación: La suma de $${colacion} (pesos chilenos) mensuales, de carácter no imponible ni tributable.
d) Asignación de Movilización: La suma de $${movilizacion} (pesos chilenos) mensuales, de carácter no imponible ni tributable.
${emp.bonosPactados ? `e) Bono Imponible Pactado: La suma de $${bonos} (pesos chilenos) mensuales sujeto a metas operativas.\n` : ''}${emp.otrosImponiblesPactados ? `f) Otros Haberes Imponibles: La suma de $${otrosImponibles} (pesos chilenos) mensuales.\n` : ''}${emp.viaticosPactados ? `g) Viáticos de Traslado: La suma de $${viaticos} (pesos chilenos) mensuales no imponibles.\n` : ''}
QUINTO: PERÍODO Y MODALIDAD DE PAGO
Las remuneraciones se liquidarán mensualmente y se pagarán dentro de los primeros 5 días hábiles del mes calendario siguiente mediante transferencia electrónica bancaria a los datos informados por el Trabajador (${emp.bankName || 'Banco'} - Cuenta ${emp.bankAccountType || 'RUT'} N° ${emp.bankAccountNumber || workerRut}). Asimismo, se pacta la entrega de un anticipo de sueldo de quincena en la fecha convenida.

SEXTO: VIGENCIA Y DURACIÓN
${duracionTexto}

SÉPTIMO: OBLIGACIONES Y REGLAMENTO INTERNO
El Trabajador se compromete a respetar fielmente las normas del Reglamento Interno de Orden, Higiene y Seguridad del Empleador, guardando estricta reserva y secreto profesional de la información y secretos comerciales de la empresa.

OCTAVO: SEGURIDAD SOCIAL Y PREVISIÓN
El Trabajador declara encontrarse incorporado a los siguientes organismos de previsión y salud:
- Administradora de Fondos de Pensiones: AFP ${emp.pensionSystem || 'MODELO'}
- Institución de Salud: ${emp.healthSystem || 'FONASA'}
- Seguro de Desempleo (AFC): ${emp.hasCesantiaAFC ? 'Afiliado a Ley N° 19.728' : 'No afecto'}
- Seguro de Accidentes del Trabajo: Ley N° 16.744 administrado por la Mutualidad correspondiente.

NOVENO: EJEMPLARES Y FIRMA
El presente contrato se extiende y firma en dos ejemplares de un mismo tenor y fecha, declarando el Trabajador haber recibido en este acto una copia íntegra y legible del mismo.


____________________________                    ____________________________
       POR EL EMPLEADOR                                 TRABAJADOR
${companyName}                                 ${workerName}
R.U.T.: ${companyRut}                          R.U.T.: ${workerRut}`;
}

interface EmployeesViewProps {
  employees: Employee[];
  costCenters: CostCenterMaster[];
  onSaveEmployee: (employee: Employee) => Promise<void>;
  onDeleteEmployee: (employeeId: string) => Promise<void>;
  companyName: string;
  companyRut: string;
  companyAddress?: string;
  initialSubTab?: 'employees' | 'contracts' | 'attendance' | 'advances' | 'severance' | 'certificates';
  onSubTabChange?: (tab: 'employees' | 'contracts' | 'attendance' | 'advances' | 'severance' | 'certificates') => void;
  onNavigateToPayroll?: (tab?: string) => void;
}

export const EmployeesView: React.FC<EmployeesViewProps> = ({
  employees,
  costCenters,
  onSaveEmployee,
  onDeleteEmployee,
  companyName,
  companyRut,
  companyAddress,
  initialSubTab,
  onSubTabChange,
  onNavigateToPayroll
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'employees' | 'contracts' | 'attendance' | 'advances' | 'severance' | 'certificates'>(initialSubTab || 'employees');

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const handleSwitchSubTab = (tab: 'employees' | 'contracts' | 'attendance' | 'advances' | 'severance' | 'certificates') => {
    setActiveSubTab(tab);
    onSubTabChange?.(tab);
  };

  // State for Contracts sub-tab
  const [selectedContractEmpId, setSelectedContractEmpId] = useState(employees[0]?.id || '');
  const [contractTemplate, setContractTemplate] = useState<'CONTRATO_INDEFINIDO' | 'CONTRATO_PLAZO_FIJO' | 'CONTRATO_OBRA' | 'ANEXO_SUELDO' | 'ANEXO_CARGO' | 'ANEXO_40_HORAS'>('CONTRATO_INDEFINIDO');
  const [contractCustomText, setContractCustomText] = useState<string>('');
  const [isSavingContract, setIsSavingContract] = useState(false);
  const [contractSaveSuccess, setContractSaveSuccess] = useState(false);

  // Operational HR process states
  const [attendanceRecords, setAttendanceRecords] = useState<Array<{id: string, employeeId: string, employeeName: string, period: string, type: string, days: number, note: string}>>([
    { id: 'att_1', employeeId: employees[0]?.id || '1', employeeName: employees[0]?.name || 'Colaborador Demo', period: '2024-09', type: 'VACACIONES', days: 2, note: 'Vacaciones legales' }
  ]);
  const [advanceRecords, setAdvanceRecords] = useState<Array<{id: string, employeeId: string, employeeName: string, amount: number, date: string, status: string}>>([
    { id: 'adv_1', employeeId: employees[0]?.id || '1', employeeName: employees[0]?.name || 'Colaborador Demo', amount: 100000, date: '2024-09-15', status: 'PENDIENTE' }
  ]);
  const [newAtt, setNewAtt] = useState({ employeeId: employees[0]?.id || '', period: '2024-09', type: 'LICENCIA', days: 1, note: '' });
  const [newAdv, setNewAdv] = useState({ employeeId: employees[0]?.id || '', amount: 50000, date: new Date().toISOString().split('T')[0] });
  const [finiquitoEmpId, setFiniquitoEmpId] = useState(employees[0]?.id || '');
  const [finiquitoCausal, setFiniquitoCausal] = useState('ART_161_NECESIDADES');
  const [finiquitoFecha, setFiniquitoFecha] = useState(new Date().toISOString().split('T')[0]);
  const [certType, setCertType] = useState<'ANTIGUEDAD' | 'RENTA'>('ANTIGUEDAD');
  const [certEmpId, setCertEmpId] = useState(employees[0]?.id || '');

  // Form State
  const initialFormState: Omit<Employee, 'id' | 'companyId' | 'createdAt' | 'updatedAt'> = {
    rut: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    birthDate: '',
    gender: 'M',
    nationality: 'Chilena',
    hireDate: new Date().toISOString().split('T')[0],
    position: '',
    department: 'Operaciones',
    costCenterId: '',
    contractType: 'INDEFINIDO',
    workHoursPerWeek: 45,
    baseSalary: 650000,
    hasGratificacionLegal: true,
    gratificacionType: 'ART_50',
    pensionSystem: 'MODELO',
    pensionCommissionPercent: DEFAULT_AFP_COMMISSIONS.MODELO,
    healthSystem: 'FONASA',
    healthPlanType: 'FONASA_7',
    healthPlanValue: 0,
    hasCesantiaAFC: true,
    apvType: 'NINGUNO',
    apvInstitution: '',
    apvAmount: 0,
    cargasFamiliares: 0,
    tramoCargaFamiliar: 'SIN_TRAMO',
    colacionPactada: 45000,
    movilizacionPactada: 45000,
    viaticosPactados: 0,
    bonosPactados: 0,
    otrosImponiblesPactados: 0,
    otrosNoImponiblesPactados: 0,
    descuentoSeguroComplementario: 0,
    descuentoAhorroBienestar: 0,
    descuentoPrestamoCuota: 0,
    otrosDescuentosPactados: 0,
    contractText: '',
    contractStatus: 'VIGENTE',
    contractGeneratedDate: '',
    contractObservations: '',
    bankName: 'BancoEstado',
    bankAccountType: 'RUT',
    bankAccountNumber: '',
    active: true
  };

  const [formData, setFormData] = useState(initialFormState);

  // Departments list
  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach(e => {
      if (e.department) set.add(e.department);
    });
    return Array.from(set);
  }, [employees]);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchesSearch = 
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.rut.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.position.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesDept = filterDepartment === 'ALL' || emp.department === filterDepartment;
      const matchesStatus = 
        filterStatus === 'ALL' || 
        (filterStatus === 'ACTIVE' && emp.active) || 
        (filterStatus === 'INACTIVE' && !emp.active);

      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [employees, searchTerm, filterDepartment, filterStatus]);

  const handleOpenNewModal = () => {
    setEditingEmployee(null);
    setFormData(initialFormState);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormData({
      rut: emp.rut,
      name: emp.name,
      email: emp.email || '',
      phone: emp.phone || '',
      address: emp.address || '',
      birthDate: emp.birthDate || '',
      gender: emp.gender || 'M',
      nationality: emp.nationality || 'Chilena',
      hireDate: emp.hireDate,
      terminationDate: emp.terminationDate,
      position: emp.position,
      department: emp.department || 'Administración',
      costCenterId: emp.costCenterId || '',
      contractType: emp.contractType,
      workHoursPerWeek: emp.workHoursPerWeek || 45,
      baseSalary: emp.baseSalary,
      hasGratificacionLegal: emp.hasGratificacionLegal ?? true,
      gratificacionType: emp.gratificacionType || 'ART_50',
      pensionSystem: emp.pensionSystem,
      pensionCommissionPercent: emp.pensionCommissionPercent || DEFAULT_AFP_COMMISSIONS[emp.pensionSystem] || 11.44,
      healthSystem: emp.healthSystem,
      healthPlanType: emp.healthPlanType,
      healthPlanValue: emp.healthPlanValue || 0,
      hasCesantiaAFC: emp.hasCesantiaAFC ?? true,
      apvType: emp.apvType || 'NINGUNO',
      apvInstitution: emp.apvInstitution || '',
      apvAmount: emp.apvAmount || 0,
      cargasFamiliares: emp.cargasFamiliares || 0,
      tramoCargaFamiliar: emp.tramoCargaFamiliar || 'SIN_TRAMO',
      colacionPactada: emp.colacionPactada || 0,
      movilizacionPactada: emp.movilizacionPactada || 0,
      viaticosPactados: emp.viaticosPactados || 0,
      bonosPactados: emp.bonosPactados || 0,
      otrosImponiblesPactados: emp.otrosImponiblesPactados || 0,
      otrosNoImponiblesPactados: emp.otrosNoImponiblesPactados || 0,
      descuentoSeguroComplementario: emp.descuentoSeguroComplementario || 0,
      descuentoAhorroBienestar: emp.descuentoAhorroBienestar || 0,
      descuentoPrestamoCuota: emp.descuentoPrestamoCuota || 0,
      otrosDescuentosPactados: emp.otrosDescuentosPactados || 0,
      contractText: emp.contractText || '',
      contractStatus: emp.contractStatus || 'VIGENTE',
      contractGeneratedDate: emp.contractGeneratedDate || '',
      contractObservations: emp.contractObservations || '',
      bankName: emp.bankName || '',
      bankAccountType: emp.bankAccountType || 'CORRIENTE',
      bankAccountNumber: emp.bankAccountNumber || '',
      active: emp.active ?? true
    });
    setIsModalOpen(true);
  };

  const handlePensionChange = (newPension: PensionSystem) => {
    setFormData(prev => ({
      ...prev,
      pensionSystem: newPension,
      pensionCommissionPercent: DEFAULT_AFP_COMMISSIONS[newPension] || 11.44
    }));
  };

  const handleHealthChange = (newHealth: HealthSystem) => {
    setFormData(prev => ({
      ...prev,
      healthSystem: newHealth,
      healthPlanType: newHealth === 'FONASA' ? 'FONASA_7' : 'ISAPRE_UF',
      healthPlanValue: newHealth === 'FONASA' ? 0 : (prev.healthPlanValue > 0 ? prev.healthPlanValue : 3.2)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.rut.trim() || !formData.name.trim() || !formData.position.trim()) {
      alert('Por favor complete los campos obligatorios: RUT, Nombre y Cargo.');
      return;
    }

    try {
      setIsSaving(true);
      const employeePayload: Employee = {
        id: editingEmployee ? editingEmployee.id : `emp_${Date.now()}`,
        companyId: editingEmployee ? editingEmployee.companyId : '',
        ...formData,
        createdAt: editingEmployee ? editingEmployee.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await onSaveEmployee(employeePayload);
      setIsModalOpen(false);
      setEditingEmployee(null);
    } catch (err) {
      console.error('Error al guardar trabajador:', err);
      alert('Error al guardar la ficha del trabajador.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSeedDemoEmployees = async () => {
    if (!confirm('¿Desea crear una nómina demo de trabajadores (5 colaboradores con distintos contratos, AFPs e Isapres) para probar las liquidaciones y Previred?')) return;
    
    const demoStaff: Omit<Employee, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>[] = [
      {
        rut: '15.421.890-3',
        name: 'Andrea Paz Morales Soto',
        email: 'andrea.morales@empresa.cl',
        phone: '+56 9 8765 4321',
        position: 'Jefa de Contabilidad y Finanzas',
        department: 'Finanzas',
        hireDate: '2022-03-01',
        contractType: 'INDEFINIDO',
        workHoursPerWeek: 40,
        baseSalary: 1850000,
        hasGratificacionLegal: true,
        gratificacionType: 'ART_50',
        pensionSystem: 'HABITAT',
        pensionCommissionPercent: DEFAULT_AFP_COMMISSIONS.HABITAT,
        healthSystem: 'COLMENA',
        healthPlanType: 'ISAPRE_UF',
        healthPlanValue: 4.5,
        hasCesantiaAFC: true,
        apvType: 'REGIMEN_B',
        apvInstitution: 'Habitat APV',
        apvAmount: 100000,
        cargasFamiliares: 1,
        tramoCargaFamiliar: 'C',
        colacionPactada: 60000,
        movilizacionPactada: 50000,
        bankName: 'Banco de Chile',
        bankAccountType: 'CORRIENTE',
        bankAccountNumber: '00-12345-67',
        active: true
      },
      {
        rut: '16.789.012-K',
        name: 'Carlos Esteban González Rivas',
        email: 'carlos.gonzalez@empresa.cl',
        phone: '+56 9 7654 3210',
        position: 'Desarrollador Senior Fullstack',
        department: 'Tecnología',
        hireDate: '2023-01-15',
        contractType: 'INDEFINIDO',
        workHoursPerWeek: 40,
        baseSalary: 2300000,
        hasGratificacionLegal: true,
        gratificacionType: 'ART_50',
        pensionSystem: 'MODELO',
        pensionCommissionPercent: DEFAULT_AFP_COMMISSIONS.MODELO,
        healthSystem: 'BANMEDICA',
        healthPlanType: 'ISAPRE_UF',
        healthPlanValue: 5.2,
        hasCesantiaAFC: true,
        apvType: 'REGIMEN_B',
        apvInstitution: 'Fintual APV',
        apvAmount: 150000,
        cargasFamiliares: 2,
        tramoCargaFamiliar: 'D',
        colacionPactada: 70000,
        movilizacionPactada: 60000,
        bankName: 'Banco Santander',
        bankAccountType: 'CORRIENTE',
        bankAccountNumber: '98-76543-21',
        active: true
      },
      {
        rut: '18.345.678-2',
        name: 'Valentina Ignacia Silva Muñoz',
        email: 'valentina.silva@empresa.cl',
        phone: '+56 9 6543 2109',
        position: 'Ejecutiva Comercial y Ventas',
        department: 'Comercial',
        hireDate: '2023-08-01',
        contractType: 'INDEFINIDO',
        workHoursPerWeek: 45,
        baseSalary: 750000,
        hasGratificacionLegal: true,
        gratificacionType: 'ART_50',
        pensionSystem: 'PROVIDA',
        pensionCommissionPercent: DEFAULT_AFP_COMMISSIONS.PROVIDA,
        healthSystem: 'FONASA',
        healthPlanType: 'FONASA_7',
        healthPlanValue: 0,
        hasCesantiaAFC: true,
        apvType: 'NINGUNO',
        apvAmount: 0,
        cargasFamiliares: 0,
        tramoCargaFamiliar: 'SIN_TRAMO',
        colacionPactada: 45000,
        movilizacionPactada: 45000,
        bankName: 'BancoEstado',
        bankAccountType: 'RUT',
        bankAccountNumber: '18345678',
        active: true
      },
      {
        rut: '19.876.543-1',
        name: 'Matías Alejandro Castro Vega',
        email: 'matias.castro@empresa.cl',
        phone: '+56 9 5432 1098',
        position: 'Asistente Operativo y Logística',
        department: 'Operaciones',
        hireDate: '2024-02-01',
        contractType: 'PLAZO_FIJO',
        workHoursPerWeek: 45,
        baseSalary: 550000,
        hasGratificacionLegal: true,
        gratificacionType: 'ART_50',
        pensionSystem: 'UNO',
        pensionCommissionPercent: DEFAULT_AFP_COMMISSIONS.UNO,
        healthSystem: 'FONASA',
        healthPlanType: 'FONASA_7',
        healthPlanValue: 0,
        hasCesantiaAFC: true,
        apvType: 'NINGUNO',
        apvAmount: 0,
        cargasFamiliares: 1,
        tramoCargaFamiliar: 'B',
        colacionPactada: 40000,
        movilizacionPactada: 40000,
        bankName: 'Banco BCI',
        bankAccountType: 'VISTA',
        bankAccountNumber: '77-12345-88',
        active: true
      },
      {
        rut: '14.234.567-9',
        name: 'Roberto Antonio Gómez Flores',
        email: 'roberto.gomez@empresa.cl',
        phone: '+56 9 4321 0987',
        position: 'Supervisor de Planta y Mantenimiento',
        department: 'Operaciones',
        hireDate: '2021-06-01',
        contractType: 'INDEFINIDO',
        workHoursPerWeek: 45,
        baseSalary: 950000,
        hasGratificacionLegal: true,
        gratificacionType: 'ART_50',
        pensionSystem: 'PLANVITAL',
        pensionCommissionPercent: DEFAULT_AFP_COMMISSIONS.PLANVITAL,
        healthSystem: 'CONSALUD',
        healthPlanType: 'ISAPRE_UF',
        healthPlanValue: 2.8,
        hasCesantiaAFC: true,
        apvType: 'NINGUNO',
        apvAmount: 0,
        cargasFamiliares: 2,
        tramoCargaFamiliar: 'B',
        colacionPactada: 50000,
        movilizacionPactada: 50000,
        bankName: 'Banco Itaú',
        bankAccountType: 'CORRIENTE',
        bankAccountNumber: '01-99887-22',
        active: true
      }
    ];

    for (const d of demoStaff) {
      const payload: Employee = {
        id: `emp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        companyId: '',
        ...d,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await onSaveEmployee(payload);
    }
    alert('✅ Se han registrado 5 colaboradores de prueba correctamente.');
  };

  return (
    <div className="space-y-6">
      {/* Header del Módulo */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
              <Users className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">personal</h1>
          </div>
          <p className="text-sm text-slate-600">
            Gestión integral de colaboradores, régimen previsional (AFP), instituciones de salud (Fonasa/Isapre), AFC y datos laborales para {companyName}.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {employees.length === 0 && (
            <button
              onClick={handleSeedDemoEmployees}
              className="px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <Sparkles className="w-4 h-4 text-indigo-600" />
              Cargar Nómina Demo
            </button>
          )}

          <button
            onClick={handleOpenNewModal}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Nuevo Trabajador
          </button>
        </div>
      </div>

      {/* Métricas Rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Colaboradores</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{employees.length}</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Contratos Activos</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              {employees.filter(e => e.active).length}
            </p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Indefinidos / Plazo Fijo</p>
            <p className="text-2xl font-bold text-indigo-900 mt-1">
              {employees.filter(e => e.contractType === 'INDEFINIDO').length} / {employees.filter(e => e.contractType !== 'INDEFINIDO').length}
            </p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Briefcase className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Masa Salarial Base</p>
            <p className="text-2xl font-bold text-slate-900 font-mono mt-1">
              ${employees.reduce((sum, e) => sum + (e.active ? e.baseSalary : 0), 0).toLocaleString('es-CL')}
            </p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* PESTAÑAS DE PROCESOS DE RRHH */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto no-scrollbar justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSwitchSubTab('employees')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === 'employees'
                ? 'bg-indigo-900 text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Fichas del Personal ({employees.length})</span>
          </button>
          <button
            onClick={() => {
              handleSwitchSubTab('contracts');
              const emp = employees.find(e => e.id === selectedContractEmpId) || employees[0];
              if (emp && (!contractCustomText || contractCustomText.trim().length === 0)) {
                if (emp.contractText && emp.contractText.trim().length > 50) {
                  setContractCustomText(emp.contractText);
                } else {
                  setContractCustomText(generateChileanEmploymentContract(emp, companyName, companyRut, companyAddress, contractTemplate));
                }
              }
            }}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === 'contracts'
                ? 'bg-indigo-900 text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Contratos & Anexos</span>
          </button>
          <button
            onClick={() => handleSwitchSubTab('attendance')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === 'attendance'
                ? 'bg-indigo-900 text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Asistencia & Licencias</span>
          </button>
          <button
            onClick={() => handleSwitchSubTab('advances')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === 'advances'
                ? 'bg-indigo-900 text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Anticipos & Préstamos</span>
          </button>
          <button
            onClick={() => handleSwitchSubTab('severance')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === 'severance'
                ? 'bg-indigo-900 text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>Cálculo de Finiquitos</span>
          </button>
          <button
            onClick={() => handleSwitchSubTab('certificates')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === 'certificates'
                ? 'bg-indigo-900 text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Certificados Laborales</span>
          </button>
        </div>

        {onNavigateToPayroll && (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <button
              onClick={() => onNavigateToPayroll('NOMINA')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs flex items-center gap-1.5 whitespace-nowrap transition-colors"
              title="Ir a procesar el cálculo de nómina y remuneraciones"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Cálculo de Remuneraciones</span>
            </button>
            <button
              onClick={() => onNavigateToPayroll('LIQUIDACION_INDIVIDUAL')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs flex items-center gap-1.5 whitespace-nowrap transition-colors"
              title="Ir a liquidaciones individuales de sueldo oficiales"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Liquidaciones Oficiales</span>
            </button>
          </div>
        )}
      </div>

      {activeSubTab === 'employees' && (
        <>
          {/* Barra de Búsqueda y Filtros */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 justify-between items-center">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por RUT, nombre o cargo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {departments.length > 0 && (
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-medium text-slate-700"
            >
              <option value="ALL">Todos los Departamentos</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}

          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium">
            <button
              onClick={() => setFilterStatus('ACTIVE')}
              className={`px-3 py-1 rounded-md transition-all ${filterStatus === 'ACTIVE' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Activos ({employees.filter(e => e.active).length})
            </button>
            <button
              onClick={() => setFilterStatus('INACTIVE')}
              className={`px-3 py-1 rounded-md transition-all ${filterStatus === 'INACTIVE' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Inactivos ({employees.filter(e => !e.active).length})
            </button>
            <button
              onClick={() => setFilterStatus('ALL')}
              className={`px-3 py-1 rounded-md transition-all ${filterStatus === 'ALL' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Todos ({employees.length})
            </button>
          </div>
        </div>
      </div>

      {/* Tabla de Trabajadores */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredEmployees.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800">No hay trabajadores registrados</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-4">
              Crea las fichas del personal para comenzar a emitir liquidaciones mensuales, generar el archivo Previred y el Libro de Remuneraciones Digital (LRD).
            </p>
            <button
              onClick={handleOpenNewModal}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
            >
              Agregar Primer Trabajador
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">RUT & Colaborador</th>
                  <th className="py-3 px-4">Cargo & Departamento</th>
                  <th className="py-3 px-4">Tipo Contrato</th>
                  <th className="py-3 px-4 text-right">Sueldo Base</th>
                  <th className="py-3 px-4">Previsión (AFP)</th>
                  <th className="py-3 px-4">Salud</th>
                  <th className="py-3 px-4 text-center">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-800 text-white flex items-center justify-center font-bold text-xs uppercase shadow-2xs">
                          {emp.name.slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{emp.name}</div>
                          <div className="text-xs font-mono text-slate-500">{emp.rut}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{emp.position}</div>
                      <div className="text-xs text-slate-500">{emp.department || 'Sin Depto'}</div>
                    </td>

                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        emp.contractType === 'INDEFINIDO' 
                          ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {emp.contractType.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">
                      ${emp.baseSalary.toLocaleString('es-CL')}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="font-medium text-xs text-slate-800">
                          {emp.pensionSystem}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          ({emp.pensionCommissionPercent || DEFAULT_AFP_COMMISSIONS[emp.pensionSystem]}%)
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <HeartPulse className="w-3.5 h-3.5 text-rose-500" />
                        <span className="font-medium text-xs text-slate-800">
                          {emp.healthSystem}
                        </span>
                        {emp.healthPlanValue > 0 && (
                          <span className="text-[11px] text-slate-500">
                            ({emp.healthPlanValue} {emp.healthPlanType === 'ISAPRE_UF' ? 'UF' : '$'})
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        emp.active 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {emp.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(emp)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                          title="Editar Ficha de Trabajador"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`¿Desea eliminar o desactivar al trabajador ${emp.name}?`)) {
                              onDeleteEmployee(emp.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                          title="Eliminar Trabajador"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

              </>
      )}

      {/* SUB-TAB: CONTRATOS & ANEXOS */}
      {activeSubTab === 'contracts' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-700" />
                <h3 className="text-base font-bold text-slate-900">Gestor de Contratos de Trabajo y Anexos Legales</h3>
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-800 rounded-md">
                  Código del Trabajo & Ley 21.561
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Generador y editor de contratos individuales de trabajo y anexos oficiales con resguardo en la ficha permanente del trabajador.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  const emp = employees.find(e => e.id === selectedContractEmpId) || employees[0];
                  if (!emp) return;
                  const newText = generateChileanEmploymentContract(emp, companyName, companyRut, companyAddress, contractTemplate);
                  setContractCustomText(newText);
                  setContractSaveSuccess(false);
                }}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 flex items-center gap-1.5 transition-colors"
                title="Genera las cláusulas conforme a la plantilla seleccionada y datos del trabajador"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Regenerar Texto Legal</span>
              </button>

              <button
                disabled={isSavingContract || !selectedContractEmpId}
                onClick={async () => {
                  const emp = employees.find(e => e.id === selectedContractEmpId);
                  if (!emp) return;
                  try {
                    setIsSavingContract(true);
                    await onSaveEmployee({
                      ...emp,
                      contractText: contractCustomText,
                      contractStatus: 'VIGENTE',
                      contractGeneratedDate: new Date().toISOString(),
                      contractObservations: `Contrato/Anexo (${contractTemplate}) oficial guardado el ${new Date().toLocaleDateString('es-CL')}`
                    });
                    setContractSaveSuccess(true);
                    setTimeout(() => setContractSaveSuccess(false), 3500);
                  } catch (e) {
                    console.error('Error saving contract to employee profile:', e);
                  } finally {
                    setIsSavingContract(false);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white shadow-xs flex items-center gap-1.5 transition-colors"
              >
                {isSavingContract ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Guardar en Ficha del Personal</span>
              </button>

              <button
                onClick={() => {
                  window.print();
                }}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-xs flex items-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir / Exportar PDF</span>
              </button>
            </div>
          </div>

          {contractSaveSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl flex items-center justify-between text-emerald-800 text-xs font-medium animate-fadeIn">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Contrato de trabajo guardado exitosamente en la ficha permanente del trabajador.</span>
              </div>
              <span className="text-[11px] text-emerald-600 font-mono">Estado: VIGENTE</span>
            </div>
          )}

          {/* Selectores */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Seleccionar Trabajador
              </label>
              <select
                value={selectedContractEmpId}
                onChange={(e) => {
                  const empId = e.target.value;
                  setSelectedContractEmpId(empId);
                  const emp = employees.find(x => x.id === empId);
                  if (emp) {
                    if (emp.contractText && emp.contractText.trim().length > 50) {
                      setContractCustomText(emp.contractText);
                    } else {
                      setContractCustomText(generateChileanEmploymentContract(emp, companyName, companyRut, companyAddress, contractTemplate));
                    }
                  }
                  setContractSaveSuccess(false);
                }}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500"
              >
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} — {emp.rut} ({emp.position}) {emp.contractText ? '✓ Contrato Guardado' : '• Sin Contrato'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Plantilla de Documento Legal
              </label>
              <select
                value={contractTemplate}
                onChange={(e) => {
                  const tmpl = e.target.value as any;
                  setContractTemplate(tmpl);
                  const emp = employees.find(x => x.id === selectedContractEmpId) || employees[0];
                  if (emp) {
                    setContractCustomText(generateChileanEmploymentContract(emp, companyName, companyRut, companyAddress, tmpl));
                  }
                  setContractSaveSuccess(false);
                }}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 font-semibold text-indigo-900 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="CONTRATO_INDEFINIDO">Contrato Individual de Trabajo Indefinido</option>
                <option value="CONTRATO_PLAZO_FIJO">Contrato Individual de Trabajo a Plazo Fijo</option>
                <option value="CONTRATO_OBRA">Contrato por Obra o Faena Determinada</option>
                <option value="ANEXO_SUELDO">Anexo N° 1 - Actualización Salarial, Bonos y Gratificación</option>
                <option value="ANEXO_CARGO">Anexo N° 2 - Modificación de Cargo y Responsabilidades</option>
                <option value="ANEXO_40_HORAS">Anexo N° 3 - Adecuación de Jornada a 40 Horas (Ley 21.561)</option>
              </select>
            </div>
          </div>

          {/* Hoja de Trabajo / Documento Imprimible */}
          <div className="bg-slate-100 p-4 md:p-8 rounded-xl border border-slate-200">
            <div className="max-w-4xl mx-auto bg-white p-8 md:p-14 shadow-lg rounded-xl border border-slate-200 print:border-none print:shadow-none print:p-0">
              {/* Membrete Oficial */}
              <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-start">
                <div>
                  <h2 className="text-sm font-black tracking-tight text-slate-900 uppercase">{companyName}</h2>
                  <p className="text-xs text-slate-600 font-mono">R.U.T.: {companyRut}</p>
                  {companyAddress && <p className="text-xs text-slate-500">{companyAddress}</p>}
                </div>
                <div className="text-right">
                  <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-white rounded">
                    Instrumento Privado Laboral
                  </span>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    Fecha Emisión: {new Date().toLocaleDateString('es-CL')}
                  </p>
                </div>
              </div>

              {/* Editor del Contrato */}
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Edite directamente las cláusulas en el cuadro inferior o descargue/imprima:</span>
                  <span className="font-mono text-[11px] text-indigo-700 font-semibold">
                    {contractCustomText.length} caracteres
                  </span>
                </div>

                <textarea
                  value={contractCustomText}
                  onChange={(e) => setContractCustomText(e.target.value)}
                  rows={28}
                  className="w-full p-4 border border-slate-300 rounded-lg text-xs font-mono leading-relaxed bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-y"
                  placeholder="El texto del contrato de trabajo se generará aquí automáticamente..."
                />
              </div>

              {/* Cuadros de Firma Formal */}
              <div className="mt-12 pt-8 border-t border-slate-200 grid grid-cols-2 gap-8 text-center">
                <div className="space-y-2">
                  <div className="h-16 flex items-end justify-center">
                    <div className="w-48 border-b border-slate-800"></div>
                  </div>
                  <p className="text-xs font-bold text-slate-900 uppercase">{companyName}</p>
                  <p className="text-[11px] text-slate-500 font-mono">R.U.T. {companyRut}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Por el Empleador</p>
                </div>

                <div className="space-y-2">
                  <div className="h-16 flex items-end justify-center">
                    <div className="w-48 border-b border-slate-800"></div>
                  </div>
                  <p className="text-xs font-bold text-slate-900 uppercase">
                    {employees.find(e => e.id === selectedContractEmpId)?.name || 'TRABAJADOR'}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono">
                    R.U.T. {employees.find(e => e.id === selectedContractEmpId)?.rut || ''}
                  </p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Firma del Trabajador</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {activeSubTab === 'attendance' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Control de Asistencia, Vacaciones y Licencias Médicas</h3>
              <p className="text-xs text-slate-500">Registro de ausencias, licencias Fonasa/Isapre y feriados legales para el cálculo de remuneraciones</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Trabajador</label>
              <select
                value={newAtt.employeeId}
                onChange={(e) => setNewAtt({ ...newAtt, employeeId: e.target.value })}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2"
              >
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.rut})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Novedad</label>
              <select
                value={newAtt.type}
                onChange={(e) => setNewAtt({ ...newAtt, type: e.target.value })}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2"
              >
                <option value="LICENCIA">Licencia Médica</option>
                <option value="VACACIONES">Vacaciones Legales</option>
                <option value="INASISTENCIA">Inasistencia Injustificada</option>
                <option value="PERMISO">Permiso con Goce</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Días Hábiles / Corridos</label>
              <input
                type="number"
                min={1}
                value={newAtt.days}
                onChange={(e) => setNewAtt({ ...newAtt, days: parseInt(e.target.value) || 1 })}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-mono"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  const emp = employees.find(e => e.id === newAtt.employeeId);
                  if (!emp) { alert('Seleccione un trabajador'); return; }
                  setAttendanceRecords([
                    ...attendanceRecords,
                    {
                      id: `att_${Date.now()}`,
                      employeeId: emp.id,
                      employeeName: emp.name,
                      period: newAtt.period,
                      type: newAtt.type,
                      days: newAtt.days,
                      note: newAtt.note || 'Sin observaciones'
                    }
                  ]);
                  alert('Registro de asistencia/licencia agregado con éxito.');
                }}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg shadow-xs"
              >
                Registrar Novedad
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                  <th className="py-2.5 px-3">Colaborador</th>
                  <th className="py-2.5 px-3">Período</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3 text-center">Días</th>
                  <th className="py-2.5 px-3">Observación</th>
                  <th className="py-2.5 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {attendanceRecords.map(rec => (
                  <tr key={rec.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-medium text-slate-900">{rec.employeeName}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{rec.period}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        {rec.type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold">{rec.days}</td>
                    <td className="py-2.5 px-3 text-slate-600 text-xs">{rec.note}</td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => setAttendanceRecords(attendanceRecords.filter(r => r.id !== rec.id))}
                        className="text-slate-400 hover:text-rose-600 text-xs font-semibold"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TABA: ANTICIPOS Y PRÉSTAMOS */}
      {activeSubTab === 'advances' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Anticipos de Quincena y Préstamos de Personal</h3>
              <p className="text-xs text-slate-500">Control de desembolsos a cuenta de remuneraciones para descuento automático en la liquidación mensual</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Trabajador</label>
              <select
                value={newAdv.employeeId}
                onChange={(e) => setNewAdv({ ...newAdv, employeeId: e.target.value })}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2"
              >
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.rut})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Monto del Anticipo (CLP)</label>
              <input
                type="number"
                min={1000}
                value={newAdv.amount}
                onChange={(e) => setNewAdv({ ...newAdv, amount: parseFloat(e.target.value) || 0 })}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Fecha Desembolso</label>
              <input
                type="date"
                value={newAdv.date}
                onChange={(e) => setNewAdv({ ...newAdv, date: e.target.value })}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-mono"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  const emp = employees.find(e => e.id === newAdv.employeeId);
                  if (!emp) { alert('Seleccione un trabajador'); return; }
                  setAdvanceRecords([
                    ...advanceRecords,
                    {
                      id: `adv_${Date.now()}`,
                      employeeId: emp.id,
                      employeeName: emp.name,
                      amount: newAdv.amount,
                      date: newAdv.date,
                      status: 'PENDIENTE'
                    }
                  ]);
                  alert('Anticipo registrado con éxito para descuento en remuneraciones.');
                }}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg shadow-xs"
              >
                Registrar Anticipo
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                  <th className="py-2.5 px-3">Colaborador</th>
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3 text-right">Monto</th>
                  <th className="py-2.5 px-3 text-center">Estado</th>
                  <th className="py-2.5 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {advanceRecords.map(adv => (
                  <tr key={adv.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-medium text-slate-900">{adv.employeeName}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{adv.date}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">${adv.amount.toLocaleString('es-CL')}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {adv.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => setAdvanceRecords(advanceRecords.filter(a => a.id !== adv.id))}
                        className="text-slate-400 hover:text-rose-600 text-xs font-semibold"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TABA: CÁLCULO DE FINIQUITOS */}
      {activeSubTab === 'severance' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-bold text-slate-900">Módulo de Cálculo de Finiquitos (Código del Trabajo)</h3>
            <p className="text-xs text-slate-500">Cálculo de indemnización por años de servicio, aviso previo y feriado proporcional</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Seleccionar Trabajador</label>
              <select
                value={finiquitoEmpId}
                onChange={(e) => setFiniquitoEmpId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-medium"
              >
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.rut}) - Base: ${emp.baseSalary.toLocaleString('es-CL')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Causal de Término</label>
              <select
                value={finiquitoCausal}
                onChange={(e) => setFiniquitoCausal(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-medium"
              >
                <option value="ART_159_02">Art. 159 N° 2 - Renuncia Voluntaria</option>
                <option value="ART_161_NECESIDADES">Art. 161 - Necesidades de la Empresa (Indemnización)</option>
                <option value="ART_159_04">Art. 159 N° 4 - Vencimiento del Plazo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Fecha de Término</label>
              <input
                type="date"
                value={finiquitoFecha}
                onChange={(e) => setFiniquitoFecha(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-mono"
              />
            </div>
          </div>

          {(() => {
            const emp = employees.find(e => e.id === finiquitoEmpId);
            if (!emp) return <div className="text-sm text-slate-500">Seleccione un trabajador para simular el finiquito.</div>;

            const hireYear = new Date(emp.hireDate).getFullYear();
            const termYear = new Date(finiquitoFecha).getFullYear();
            const yearsOfService = Math.max(1, termYear - hireYear);
            const isIndemnizable = finiquitoCausal === 'ART_161_NECESIDADES';
            const baseIndemnizacion = isIndemnizable ? emp.baseSalary * Math.min(11, yearsOfService) : 0;
            const avisoPrevio = isIndemnizable ? emp.baseSalary : 0;
            const feriadoProporcional = Math.round((emp.baseSalary / 30) * 1.25 * 10); // aprox 10 dias acumulados
            const totalFiniquito = baseIndemnizacion + avisoPrevio + feriadoProporcional;

            return (
              <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-6 space-y-4">
                <div className="flex justify-between items-center border-b border-indigo-200 pb-3">
                  <div>
                    <h4 className="font-bold text-indigo-900 text-base">Simulación de Liquidación de Finiquito</h4>
                    <p className="text-xs text-indigo-700">Trabajador: <span className="font-semibold">{emp.name}</span> | Ingreso: {emp.hireDate}</p>
                  </div>
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg shadow-xs flex items-center gap-1.5"
                  >
                    <FileText className="w-4 h-4" />
                    Imprimir / Exportar Finiquito
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm font-mono">
                  <div className="bg-white p-4 rounded-lg border border-indigo-100 shadow-2xs">
                    <span className="text-xs font-sans text-slate-500 block">Indemnización Años Servicio</span>
                    <span className="text-lg font-bold text-slate-900">${baseIndemnizacion.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="bg-white p-4 rounded-lg border border-indigo-100 shadow-2xs">
                    <span className="text-xs font-sans text-slate-500 block">Indemnización Aviso Previo</span>
                    <span className="text-lg font-bold text-slate-900">${avisoPrevio.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="bg-white p-4 rounded-lg border border-indigo-100 shadow-2xs">
                    <span className="text-xs font-sans text-slate-500 block">Feriado Proporcional (Vacaciones)</span>
                    <span className="text-lg font-bold text-slate-900">${feriadoProporcional.toLocaleString('es-CL')}</span>
                  </div>
                </div>

                <div className="bg-indigo-900 text-white p-4 rounded-lg flex justify-between items-center">
                  <span className="font-bold text-sm">TOTAL A PAGAR POR FINIQUITO:</span>
                  <span className="text-xl font-mono font-black">${totalFiniquito.toLocaleString('es-CL')}</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* SUB-TABA: CERTIFICADOS */}
      {activeSubTab === 'certificates' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-bold text-slate-900">Emisor de Certificados de Antigüedad y Renta</h3>
            <p className="text-xs text-slate-500">Generación de certificados oficiales con membrete para trámites bancarios, arriendos o instituciones</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Certificado</label>
              <select
                value={certType}
                onChange={(e) => setCertType(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-medium"
              >
                <option value="ANTIGUEDAD">Certificado de Antigüedad Laboral</option>
                <option value="RENTA">Certificado de Renta y Remuneraciones</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Trabajador</label>
              <select
                value={certEmpId}
                onChange={(e) => setCertEmpId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-medium"
              >
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.rut})</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => window.print()}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg shadow-xs flex items-center justify-center gap-1.5"
              >
                <FileText className="w-4 h-4" />
                Imprimir Certificado Oficial
              </button>
            </div>
          </div>

          {(() => {
            const emp = employees.find(e => e.id === certEmpId);
            if (!emp) return <div className="text-sm text-slate-500">Seleccione un trabajador.</div>;

            return (
              <div className="bg-white border-2 border-slate-300 rounded-xl p-8 space-y-6 shadow-sm max-w-2xl mx-auto font-serif">
                <div className="text-center space-y-1 border-b border-slate-200 pb-4">
                  <h4 className="text-lg font-black text-slate-900 uppercase tracking-wide">{companyName}</h4>
                  <p className="text-xs font-mono text-slate-500">RUT: {companyRut}</p>
                  <h5 className="text-base font-bold text-indigo-900 pt-2 uppercase">
                    {certType === 'ANTIGUEDAD' ? 'CERTIFICADO DE ANTIGÜEDAD LABORAL' : 'CERTIFICADO DE RENTA'}
                  </h5>
                </div>

                <div className="text-sm text-slate-800 leading-relaxed space-y-4 font-sans">
                  <p>A quien corresponda,</p>
                  <p>
                    Por medio del presente documento, la empresa <span className="font-semibold">{companyName}</span>, RUT N° <span className="font-semibold">{companyRut}</span>, certifica que el/la colaborador(a):
                  </p>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-1 font-mono text-xs">
                    <div><strong>Nombre:</strong> {emp.name}</div>
                    <div><strong>RUT:</strong> {emp.rut}</div>
                    <div><strong>Cargo:</strong> {emp.position}</div>
                    <div><strong>Fecha de Ingreso:</strong> {emp.hireDate}</div>
                    {certType === 'RENTA' && (
                      <div><strong>Sueldo Base Mensual:</strong> ${emp.baseSalary.toLocaleString('es-CL')} CLP</div>
                    )}
                  </div>
                  <p>
                    Se extiende el presente certificado a petición del interesado(a) para los fines que estime convenientes.
                  </p>
                </div>

                <div className="pt-12 flex justify-between items-end text-xs text-slate-700 font-sans">
                  <div>
                    <p>Fecha de emisión: {new Date().toLocaleDateString('es-CL')}</p>
                  </div>
                  <div className="text-center">
                    <div className="border-b border-slate-400 w-48 mb-1"></div>
                    <p className="font-semibold">Representante Legal / RRHH</p>
                    <p>{companyName}</p>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Modal de Creación / Edición de Ficha de Trabajador */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                  {editingEmployee ? <Edit2 className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingEmployee ? `Editar Ficha: ${editingEmployee.name}` : 'Registrar Nuevo Trabajador'}
                  </h3>
                  <p className="text-xs text-slate-500">Configuración laboral, previsional, de salud y tributaria</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
              {/* SECCIÓN 1: DATOS PERSONALES */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900 border-b border-indigo-100 pb-1 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  1. Identificación y Datos Personales
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">RUT Trabajador *</label>
                    <input
                      type="text"
                      required
                      placeholder="12.345.678-9"
                      value={formData.rut}
                      onChange={(e) => setFormData({ ...formData, rut: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nombres y Apellidos Completos *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Juan Andrés Pérez Soto"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Correo Electrónico</label>
                    <input
                      type="email"
                      placeholder="juan.perez@empresa.cl"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Teléfono Móvil</label>
                    <input
                      type="text"
                      placeholder="+56 9 1234 5678"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Fecha de Nacimiento</label>
                    <input
                      type="date"
                      value={formData.birthDate}
                      onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* SECCIÓN 2: CONTRATO Y DATOS LABORALES */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900 border-b border-indigo-100 pb-1 mb-3 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-indigo-600" />
                  2. Contrato y Cargo
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Cargo / Puesto *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Contador General"
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Departamento / Área</label>
                    <input
                      type="text"
                      placeholder="Ej. Administración, Ventas, TI"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Centro de Costo</label>
                    <select
                      value={formData.costCenterId}
                      onChange={(e) => setFormData({ ...formData, costCenterId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="">(Sin Centro de Costo)</option>
                      {costCenters.map(cc => (
                        <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Contrato</label>
                    <select
                      value={formData.contractType}
                      onChange={(e) => setFormData({ ...formData, contractType: e.target.value as ContractType })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="INDEFINIDO">Indefinido</option>
                      <option value="PLAZO_FIJO">Plazo Fijo</option>
                      <option value="OBRA_FAENA">Por Obra o Faena</option>
                      <option value="PART_TIME">Part Time</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Fecha de Ingreso *</label>
                    <input
                      type="date"
                      required
                      value={formData.hireDate}
                      onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Jornada Semanal (Horas)</label>
                    <input
                      type="number"
                      min={1}
                      max={45}
                      value={formData.workHoursPerWeek}
                      onChange={(e) => setFormData({ ...formData, workHoursPerWeek: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* SECCIÓN 3: REMUNERACIÓN Y HABERES PACTADOS */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900 border-b border-indigo-100 pb-1 mb-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  3. Remuneraciones y Haberes Pactados
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Sueldo Base Mensual (CLP) *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono">$</span>
                      <input
                        type="number"
                        required
                        min={0}
                        value={formData.baseSalary}
                        onChange={(e) => setFormData({ ...formData, baseSalary: Number(e.target.value) })}
                        className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Bonos Imponibles Pactados ($)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono">$</span>
                      <input
                        type="number"
                        min={0}
                        value={formData.bonosPactados || 0}
                        onChange={(e) => setFormData({ ...formData, bonosPactados: Number(e.target.value) })}
                        className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm font-mono text-emerald-700 font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Otros Imponibles Pactados ($)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono">$</span>
                      <input
                        type="number"
                        min={0}
                        value={formData.otrosImponiblesPactados || 0}
                        onChange={(e) => setFormData({ ...formData, otrosImponiblesPactados: Number(e.target.value) })}
                        className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Asignación Colación (No Imponible)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono">$</span>
                      <input
                        type="number"
                        min={0}
                        value={formData.colacionPactada || 0}
                        onChange={(e) => setFormData({ ...formData, colacionPactada: Number(e.target.value) })}
                        className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Asignación Movilización (No Imponible)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono">$</span>
                      <input
                        type="number"
                        min={0}
                        value={formData.movilizacionPactada || 0}
                        onChange={(e) => setFormData({ ...formData, movilizacionPactada: Number(e.target.value) })}
                        className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Viáticos / Otros No Imponibles ($)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono">$</span>
                      <input
                        type="number"
                        min={0}
                        value={formData.viaticosPactados || 0}
                        onChange={(e) => setFormData({ ...formData, viaticosPactados: Number(e.target.value) })}
                        className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-2 md:col-span-3 bg-indigo-50/60 p-3.5 rounded-xl border border-indigo-100 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-xs text-indigo-950 block">Gratificación Legal Mensual (Art. 50 Código del Trabajo)</span>
                      <p className="text-[11px] text-indigo-700">Aplica 25% de remuneraciones devengadas con tope legal mensual de (4.75 IMM / 12).</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.hasGratificacionLegal}
                        onChange={(e) => setFormData({ ...formData, hasGratificacionLegal: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* SECCIÓN ADICIONAL: DESCUENTOS PACTADOS Y PRÉSTAMOS */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900 border-b border-indigo-100 pb-1 mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-rose-600" />
                  3.1. Descuentos Recurrentes Pactados (Cuota Préstamos, Bienestar, Seguros)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Cuota Préstamo Empresa ($)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono">$</span>
                      <input
                        type="number"
                        min={0}
                        value={formData.descuentoPrestamoCuota || 0}
                        onChange={(e) => setFormData({ ...formData, descuentoPrestamoCuota: Number(e.target.value) })}
                        className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm font-mono text-rose-700 font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Seguro Complementario ($)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono">$</span>
                      <input
                        type="number"
                        min={0}
                        value={formData.descuentoSeguroComplementario || 0}
                        onChange={(e) => setFormData({ ...formData, descuentoSeguroComplementario: Number(e.target.value) })}
                        className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Cuota Bienestar / Ahorro ($)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono">$</span>
                      <input
                        type="number"
                        min={0}
                        value={formData.descuentoAhorroBienestar || 0}
                        onChange={(e) => setFormData({ ...formData, descuentoAhorroBienestar: Number(e.target.value) })}
                        className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Otros Descuentos ($)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono">$</span>
                      <input
                        type="number"
                        min={0}
                        value={formData.otrosDescuentosPactados || 0}
                        onChange={(e) => setFormData({ ...formData, otrosDescuentosPactados: Number(e.target.value) })}
                        className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECCIÓN 4: PREVISIÓN, SALUD Y CARGAS FAMILIARES */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900 border-b border-indigo-100 pb-1 mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-600" />
                  4. Régimen Previsional (AFP), Salud e Impuestos
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Institución AFP</label>
                    <select
                      value={formData.pensionSystem}
                      onChange={(e) => handlePensionChange(e.target.value as PensionSystem)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="CAPITAL">AFP Capital (11.44%)</option>
                      <option value="CUPRUM">AFP Cuprum (11.44%)</option>
                      <option value="HABITAT">AFP Habitat (11.27%)</option>
                      <option value="MODELO">AFP Modelo (10.58%)</option>
                      <option value="PLANVITAL">AFP Planvital (11.16%)</option>
                      <option value="PROVIDA">AFP Provida (11.45%)</option>
                      <option value="UNO">AFP Uno (10.49%)</option>
                      <option value="INP">IPS / Ex Cajas (18.84%)</option>
                      <option value="JUBILADO_COTIZA">Jubilado Cotizante</option>
                      <option value="JUBILADO_NO_COTIZA">Jubilado No Cotizante (0%)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tasa Total Cotización AFP (%)</label>
                    <input
                      type="number"
                      step={0.01}
                      value={formData.pensionCommissionPercent || DEFAULT_AFP_COMMISSIONS[formData.pensionSystem]}
                      onChange={(e) => setFormData({ ...formData, pensionCommissionPercent: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Sistema de Salud</label>
                    <select
                      value={formData.healthSystem}
                      onChange={(e) => handleHealthChange(e.target.value as HealthSystem)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="FONASA">FONASA (7% Legal)</option>
                      <option value="BANMEDICA">Isapre Banmédica</option>
                      <option value="COLMENA">Isapre Colmena Golden Cross</option>
                      <option value="CONSALUD">Isapre Consalud</option>
                      <option value="CRUZ_BLANCA">Isapre Cruz Blanca</option>
                      <option value="NUEVA_MASVIDA">Isapre Nueva Masvida</option>
                      <option value="VIDA_TRES">Isapre Vida Tres</option>
                      <option value="ESENCIAL">Isapre Esencial</option>
                    </select>
                  </div>

                  {formData.healthSystem !== 'FONASA' && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Plan Isapre</label>
                        <select
                          value={formData.healthPlanType}
                          onChange={(e) => setFormData({ ...formData, healthPlanType: e.target.value as HealthPlanType })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        >
                          <option value="ISAPRE_UF">Monto Pactado en UF</option>
                          <option value="ISAPRE_PESOS">Monto Pactado en Pesos ($)</option>
                          <option value="ISAPRE_PORCENTAJE">Porcentaje (%)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Valor Plan {formData.healthPlanType === 'ISAPRE_UF' ? '(UF)' : '($)'}
                        </label>
                        <input
                          type="number"
                          step={formData.healthPlanType === 'ISAPRE_UF' ? 0.01 : 100}
                          value={formData.healthPlanValue}
                          onChange={(e) => setFormData({ ...formData, healthPlanValue: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Cargas Familiares</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.cargasFamiliares}
                      onChange={(e) => setFormData({ ...formData, cargasFamiliares: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Ahorro Previsional Voluntario (APV)</label>
                    <select
                      value={formData.apvType}
                      onChange={(e) => setFormData({ ...formData, apvType: e.target.value as ApvType })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="NINGUNO">Sin APV</option>
                      <option value="REGIMEN_B">Régimen B (Rebaja Tributaria)</option>
                      <option value="REGIMEN_A">Régimen A (Bonificación 15%)</option>
                    </select>
                  </div>

                  {formData.apvType !== 'NINGUNO' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Monto Mensual APV ($)</label>
                      <input
                        type="number"
                        min={0}
                        value={formData.apvAmount || 0}
                        onChange={(e) => setFormData({ ...formData, apvAmount: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* SECCIÓN 5: DATOS DE PAGO BANCARIO */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900 border-b border-indigo-100 pb-1 mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                  5. Cuenta Bancaria para Pago de Sueldos
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Banco Destino</label>
                    <input
                      type="text"
                      placeholder="Ej. Banco de Chile, Santander, BancoEstado"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Cuenta</label>
                    <select
                      value={formData.bankAccountType}
                      onChange={(e) => setFormData({ ...formData, bankAccountType: e.target.value as any })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="CORRIENTE">Cuenta Corriente</option>
                      <option value="VISTA">Cuenta Vista</option>
                      <option value="RUT">Cuenta RUT</option>
                      <option value="AHORRO">Cuenta de Ahorro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Número de Cuenta</label>
                    <input
                      type="text"
                      placeholder="Ej. 00-12345678-0"
                      value={formData.bankAccountNumber}
                      onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-200 flex justify-end items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {isSaving ? 'Guardando...' : editingEmployee ? 'Guardar Cambios' : 'Registrar Trabajador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
