with open('src/components/CompanyAccountingDashboard.tsx', 'r') as f:
    code = f.read()

# 1. Add imports
import_target = "import { Company, DTEConfig, ChartOfAccount, Auxiliary, ExchangeRate, FiscalPeriodYear, RCVDocument, Voucher, VoucherLine, RCVAccountingParams, BankReconciliation, UserRole, CostCenterMaster, ExpenseItemMaster, NonSiiDocTypeMaster, ProjectMaster, ProductMaster, CustomAnalysisTableItem, CommercialDocument, InventoryMovement, ProductService } from '../types';"
import_replacement = """import { Company, DTEConfig, ChartOfAccount, Auxiliary, ExchangeRate, FiscalPeriodYear, RCVDocument, Voucher, VoucherLine, RCVAccountingParams, BankReconciliation, UserRole, CostCenterMaster, ExpenseItemMaster, NonSiiDocTypeMaster, ProjectMaster, ProductMaster, CustomAnalysisTableItem, CommercialDocument, InventoryMovement, ProductService, Employee, PayrollSlip } from '../types';
import { EmployeesView } from './EmployeesView';
import { LiquidacionSueldosView } from './LiquidacionSueldosView';"""

code = code.replace(import_target, import_replacement)

# 2. Update activeTab type definition
old_activetab_type = "const [activeTab, setActiveTab] = useState<'accounts' | 'auxiliaries' | 'periods' | 'rcv' | 'exchange' | 'rcvParams' | 'f29Codes' | 'vouchers' | 'libroDiario' | 'libroMayor' | 'balance8' | 'balanceIFRS' | 'analisisAuxiliares' | 'analisisCuentas' | 'estadoResultados' | 'indicadoresFinancieros' | 'auditorEstadosFinancieros' | 'smartNotebooks' | 'flujoDeCaja' | 'nominasPago' | 'cobranza' | 'conciliacionBancaria' | 'cargaMasiva' | 'formulario29' | 'plantillasCarga' | 'emisionDte' | 'tablasAnalisis' | 'controlFolios' | 'productsServices' | 'operativaComercial' | 'stockKardex'>"
new_activetab_type = "const [activeTab, setActiveTab] = useState<'accounts' | 'auxiliaries' | 'periods' | 'rcv' | 'exchange' | 'rcvParams' | 'f29Codes' | 'vouchers' | 'libroDiario' | 'libroMayor' | 'balance8' | 'balanceIFRS' | 'analisisAuxiliares' | 'analisisCuentas' | 'estadoResultados' | 'indicadoresFinancieros' | 'auditorEstadosFinancieros' | 'smartNotebooks' | 'flujoDeCaja' | 'nominasPago' | 'cobranza' | 'conciliacionBancaria' | 'cargaMasiva' | 'formulario29' | 'plantillasCarga' | 'emisionDte' | 'tablasAnalisis' | 'controlFolios' | 'productsServices' | 'operativaComercial' | 'stockKardex' | 'employees' | 'liquidaciones'>"

code = code.replace(old_activetab_type, new_activetab_type)

# 3. Add employee and payroll states
state_target = "const [commercialDocuments, setCommercialDocuments] = useState<CommercialDocument[]>([]);"
state_replacement = """const [commercialDocuments, setCommercialDocuments] = useState<CommercialDocument[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payrollSlips, setPayrollSlips] = useState<PayrollSlip[]>([]);"""

code = code.replace(state_target, state_replacement)

# 4. Add handlers for employees and payroll
handlers_target = "const handleSaveCommercialDocument = async"
handlers_replacement = """  const handleSaveEmployee = async (emp: Employee) => {
    try {
      if (emp.id) {
        await updateDoc(doc(companyRef, 'employees', emp.id), { ...emp, updatedAt: new Date().toISOString() });
      } else {
        await addDoc(collection(companyRef, 'employees'), {
          ...emp,
          companyId: company.id,
          createdAt: new Date().toISOString()
        });
      }
      await fetchData();
    } catch (e: any) {
      console.error("Error saving employee:", e);
      alert("Error al guardar empleado: " + e.message);
    }
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    try {
      await deleteDoc(doc(companyRef, 'employees', employeeId));
      await fetchData();
    } catch (e: any) {
      console.error("Error deleting employee:", e);
      alert("Error al eliminar empleado: " + e.message);
    }
  };

  const handleSavePayrollSlips = async (slips: PayrollSlip[]) => {
    try {
      for (const slip of slips) {
        if (slip.id) {
          await updateDoc(doc(companyRef, 'payrollSlips', slip.id), { ...slip, updatedAt: new Date().toISOString() });
        } else {
          await addDoc(collection(companyRef, 'payrollSlips'), {
            ...slip,
            companyId: company.id,
            createdAt: new Date().toISOString()
          });
        }
      }
      await fetchData();
    } catch (e: any) {
      console.error("Error saving payroll slips:", e);
      alert("Error al guardar liquidaciones: " + e.message);
    }
  };

  const handleCentralizePayrollVoucher = async (voucherPayload: Omit<Voucher, 'id' | 'createdAt'>) => {
    try {
      const newVoucherRef = await addDoc(collection(companyRef, 'vouchers'), {
        ...voucherPayload,
        createdAt: new Date().toISOString()
      });
      await fetchData();
      return newVoucherRef.id;
    } catch (e: any) {
      console.error("Error centralizing payroll voucher:", e);
      alert("Error al generar comprobante de remuneraciones: " + e.message);
      throw e;
    }
  };

  const handleSaveCommercialDocument = async"""

code = code.replace(handlers_target, handlers_replacement)

# 5. Fetch employees and payroll in fetchData
fetch_target = "const invMovSnap = await getDocs(collection(companyRef, 'inventoryMovements'));"
fetch_replacement = """const empSnap = await getDocs(collection(companyRef, 'employees'));
      setEmployees(empSnap.docs.map(d => ({ ...d.data(), id: d.id } as Employee)));

      const slipsSnap = await getDocs(collection(companyRef, 'payrollSlips'));
      setPayrollSlips(slipsSnap.docs.map(d => ({ ...d.data(), id: d.id } as PayrollSlip)));

      const invMovSnap = await getDocs(collection(companyRef, 'inventoryMovements'));"""

code = code.replace(fetch_target, fetch_replacement)

# 6. Realtime snapshots in useEffect
sub_target = "const unsubFiscal = onSnapshot(collection(companyRef, 'fiscalPeriods'), (fySnap) => {"
sub_replacement = """const unsubEmp = onSnapshot(collection(companyRef, 'employees'), (snap) => {
      setEmployees(snap.docs.map(d => ({ ...d.data(), id: d.id } as Employee)));
    }, (err) => console.warn("Realtime listener error employees:", err));

    const unsubSlips = onSnapshot(collection(companyRef, 'payrollSlips'), (snap) => {
      setPayrollSlips(snap.docs.map(d => ({ ...d.data(), id: d.id } as PayrollSlip)));
    }, (err) => console.warn("Realtime listener error payrollSlips:", err));

    const unsubFiscal = onSnapshot(collection(companyRef, 'fiscalPeriods'), (fySnap) => {"

code = code.replace(sub_target, sub_replacement)

# Unsubscribe cleanup
unsub_target = "unsubFiscal();"
unsub_replacement = """unsubFiscal();
      unsubEmp();
      unsubSlips();"""

code = code.replace(unsub_target, unsub_replacement)

# 7. Add labels
label_target = "emisionDte: 'Emisión DTE'"
label_replacement = """emisionDte: 'Emisión DTE',
                  employees: 'Gestión de Empleados y Contratos',
                  liquidaciones: 'Liquidaciones de Sueldos & Previred'"""

code = code.replace(label_target, label_replacement)

# 8. Add ribbon buttons under TESORERIA
ribbon_target = "<span>Conciliación Bancaria</span>\n                  </button>"
ribbon_replacement = """<span>Conciliación Bancaria</span>\n                  </button>
                  <button
                    onClick={() => setActiveTab('employees')}
                    className={`px-3 py-1.5 text-xs rounded-md font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'employees'
                        ? 'bg-slate-900 text-white shadow-2xs font-semibold'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <span>Empleados & Contratos</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('liquidaciones')}
                    className={`px-3 py-1.5 text-xs rounded-md font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'liquidaciones'
                        ? 'bg-slate-900 text-white shadow-2xs font-semibold'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
                    <span>Liquidaciones & Previred</span>
                  </button>"""

code = code.replace(ribbon_target, ribbon_replacement)

# 9. Render views
render_target = "{/* TAB: NÓMINAS DE PAGO */}"
render_replacement = """{/* TAB: EMPLEADOS Y CONTRATOS */}
      {activeTab === 'employees' && (
        <EmployeesView
          employees={employees}
          costCenters={costCenters}
          onSaveEmployee={handleSaveEmployee}
          onDeleteEmployee={handleDeleteEmployee}
          companyName={company.name}
          companyRut={company.rut}
        />
      )}

      {/* TAB: LIQUIDACIONES Y PREVIRED */}
      {activeTab === 'liquidaciones' && (
        <LiquidacionSueldosView
          companyId={company.id}
          companyName={company.name}
          companyRut={company.rut}
          companyAddress={company.address}
          employees={employees}
          accounts={accounts}
          costCenters={costCenters}
          vouchers={vouchers}
          onSavePayrollSlips={handleSavePayrollSlips}
          onCentralizePayrollVoucher={handleCentralizePayrollVoucher}
          onNavigateToLibroDiario={(vId) => setActiveTab('libroDiario')}
          savedSlips={payrollSlips}
        />
      )}

      {/* TAB: NÓMINAS DE PAGO */}"""

code = code.replace(render_target, render_replacement)

with open('src/components/CompanyAccountingDashboard.tsx', 'w') as f:
    f.write(code)

print("Successfully patched CompanyAccountingDashboard.tsx")
