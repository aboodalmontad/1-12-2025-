
import * as React from 'react';
import { useData } from '../context/DataContext';
import { getTablesConfig, checkSupabaseSchema } from '../hooks/useOnlineData';
import { getSupabaseClient } from '../supabaseClient';
// Fix: Added ExclamationCircleIcon to the import list to resolve the "Cannot find name 'ExclamationCircleIcon'" error.
import { CheckCircleIcon, XCircleIcon, ArrowPathIcon, CloudArrowUpIcon, ExclamationTriangleIcon, DocumentArrowUpIcon, XMarkIcon, ShieldCheckIcon, ChevronDoubleLeftIcon, ExclamationCircleIcon } from './icons';

interface StepStatus {
    table: string;
    label: string;
    status: 'pending' | 'processing' | 'success' | 'error' | 'skipped';
    error?: string;
    count: number;
}

interface BackupRestoreWizardProps {
    onClose: () => void;
}

const BackupRestoreWizard: React.FC<BackupRestoreWizardProps> = ({ onClose }) => {
    const { effectiveUserId, fetchAndRefresh } = useData();
    const [file, setFile] = React.useState<File | null>(null);
    const [steps, setSteps] = React.useState<StepStatus[]>([]);
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [globalError, setGlobalError] = React.useState<string | null>(null);
    const [orderedConfigs, setOrderedConfigs] = React.useState<any[]>([]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setGlobalError(null);
            setSteps([]);
        }
    };

    const processUpload = async (startIndex: number) => {
        setIsProcessing(true);
        setGlobalError(null);
        const supabase = getSupabaseClient();
        if (!supabase) return;

        for (let i = startIndex; i < steps.length; i++) {
            // إذا كان الجدول ناجحاً بالفعل أو تم تخطيه، لا تعيد رفعه عند الاستئناف
            if (steps[i].status === 'success' || steps[i].status === 'skipped') continue;

            setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'processing' } : s));
            
            const config = orderedConfigs.find(c => c?.table === steps[i].table)!;
            const BATCH_SIZE = 50;

            try {
                for (let j = 0; j < config.data.length; j += BATCH_SIZE) {
                    const batch = config.data.slice(j, j + BATCH_SIZE);
                    const { error } = await supabase.from(config.table).upsert(batch, config.options);
                    if (error) throw error;
                }
                setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'success' } : s));
            } catch (err: any) {
                setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'error', error: err.message } : s));
                
                let helpMsg = `توقف الرفع عند جدول ${steps[i].label}: ${err.message}`;
                if (err.message.includes('policy')) {
                    helpMsg += " (يرجى تطبيق سكربت SQL v5.5 من الإعدادات للسماح بالرفع الجماعي).";
                }
                setGlobalError(helpMsg);
                setIsProcessing(false);
                return; // إيقاف الحلقة للسماح للمستخدم بالتدخل
            }
        }

        await fetchAndRefresh();
        setGlobalError("اكتملت عملية المعالجة! تم رفع كافة الجداول المختارة بنجاح.");
        setIsProcessing(false);
    };

    const startRestore = async () => {
        if (!file || !effectiveUserId) return;
        
        setIsProcessing(true);
        setGlobalError(null);

        try {
            const schema = await checkSupabaseSchema();
            if (!schema.success) throw new Error(schema.message);

            const text = await file.text();
            let rawData;
            try {
                rawData = JSON.parse(text);
            } catch (e) {
                throw new Error("الملف المختار ليس ملف JSON صالح.");
            }
            
            const flatData = {
                profiles: rawData.profiles || [],
                assistants: (rawData.assistants || []).map((a: any) => typeof a === 'string' ? { name: a } : a),
                clients: rawData.clients || [],
                cases: rawData.cases || [],
                stages: rawData.stages || [],
                sessions: rawData.sessions || [],
                invoices: rawData.invoices || [],
                invoice_items: rawData.invoice_items || [],
                admin_tasks: rawData.admin_tasks || rawData.adminTasks || [],
                appointments: rawData.appointments || [],
                accounting_entries: rawData.accounting_entries || rawData.accountingEntries || [],
                case_documents: rawData.case_documents || rawData.documents || [],
                site_finances: rawData.site_finances || rawData.siteFinances || [],
            };

            const configs = getTablesConfig(flatData, effectiveUserId);
            const orderOfTables = ['profiles', 'assistants', 'clients', 'cases', 'stages', 'sessions', 'invoices', 'invoice_items', 'admin_tasks', 'appointments', 'accounting_entries', 'case_documents', 'site_finances'];
            
            const validConfigs = orderOfTables
                .map(tName => configs.find(c => c.table === tName))
                .filter(c => c && c.data.length > 0);

            setOrderedConfigs(validConfigs);

            const initialSteps: StepStatus[] = validConfigs.map(c => ({
                table: c!.table,
                label: c!.label,
                status: 'pending' as const,
                count: c!.data.length
            }));

            if (initialSteps.length === 0) throw new Error("الملف فارغ أو لا يحتوي على بيانات متوافقة.");
            
            setSteps(initialSteps);
        } catch (err: any) {
            setGlobalError(err.message);
            setIsProcessing(false);
        }
    };

    // مراقبة تهيئة الخطوات لبدء المعالجة
    React.useEffect(() => {
        if (steps.length > 0 && steps.every(s => s.status === 'pending') && isProcessing) {
            processUpload(0);
        }
    }, [steps]);

    const handleSkipStep = (index: number) => {
        setSteps(prev => prev.map((s, idx) => idx === index ? { ...s, status: 'skipped' } : s));
        processUpload(index + 1);
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]" dir="rtl">
                {/* Header */}
                <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                            <CloudArrowUpIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-800">معالج استعادة النظام v5.5</h2>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Identity & Bulk Sync Wizard</p>
                        </div>
                    </div>
                    {!isProcessing && (
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-grow text-right">
                    {!steps.length ? (
                        <div className="space-y-6">
                            <div className="bg-blue-50 border-s-4 border-blue-500 p-4 rounded text-sm text-blue-800">
                                <p className="font-bold mb-2 flex items-center gap-2"><ShieldCheckIcon className="w-4 h-4"/> وضع المدير المسؤول:</p>
                                <p>يجب التأكد من تشغيل **سكربت v5.5** في SQL Editor قبل البدء لضمان تجاوز قيود الأمان أثناء الرفع الجماعي.</p>
                            </div>

                            <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-gray-50 transition-all group">
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <DocumentArrowUpIcon className="w-12 h-12 text-gray-400 group-hover:text-blue-500 mb-3 transition-colors" />
                                    <p className="mb-2 text-sm text-gray-500">
                                        <span className="font-bold">اسحب ملف النسخة الاحتياطية</span> أو اضغط هنا
                                    </p>
                                    <p className="text-xs text-gray-400">{file ? `المختار: ${file.name}` : ".json فقط"}</p>
                                </div>
                                <input type="file" accept=".json" className="hidden" onChange={handleFileChange} disabled={isProcessing} />
                            </label>

                            {globalError && (
                                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-3">
                                    <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
                                    <p className="text-sm font-bold">{globalError}</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-4 border-b pb-2">
                                <h3 className="font-bold text-gray-700">قائمة خطوات الرفع (v5.5):</h3>
                                {isProcessing && <span className="text-xs bg-blue-600 text-white px-3 py-1 rounded-full animate-pulse font-bold">جاري المزامنة...</span>}
                            </div>
                            
                            <div className="space-y-3">
                                {steps.map((step, idx) => (
                                    <div key={step.table} className={`flex flex-col p-3 rounded-xl border transition-all duration-300 ${
                                        step.status === 'processing' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' :
                                        step.status === 'success' ? 'border-green-200 bg-green-50' :
                                        step.status === 'skipped' ? 'border-orange-200 bg-orange-50' :
                                        step.status === 'error' ? 'border-red-300 bg-red-50 shadow-lg' : 'border-gray-100 bg-white opacity-60'
                                    }`}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="flex-shrink-0">
                                                    {step.status === 'pending' && <div className="w-6 h-6 rounded-full border-2 border-gray-300" />}
                                                    {step.status === 'processing' && <ArrowPathIcon className="w-6 h-6 text-blue-600 animate-spin" />}
                                                    {step.status === 'success' && <CheckCircleIcon className="w-6 h-6 text-green-600" />}
                                                    {step.status === 'skipped' && <ExclamationCircleIcon className="w-6 h-6 text-orange-500" />}
                                                    {step.status === 'error' && <XCircleIcon className="w-6 h-6 text-red-600" />}
                                                </div>
                                                <div>
                                                    <p className={`text-sm font-bold ${step.status === 'error' ? 'text-red-700' : 'text-gray-700'}`}>
                                                        {step.label} {step.status === 'skipped' && "(تم التخطي)"}
                                                    </p>
                                                    <p className="text-[10px] text-gray-500 font-bold">سجلات: {step.count}</p>
                                                </div>
                                            </div>
                                            
                                            {step.status === 'error' && !isProcessing && (
                                                <button 
                                                    onClick={() => handleSkipStep(idx)}
                                                    className="flex items-center gap-1.5 px-3 py-1 bg-orange-600 text-white text-[11px] font-bold rounded-lg hover:bg-orange-700 shadow-sm transition-all"
                                                >
                                                    <ChevronDoubleLeftIcon className="w-4 h-4"/>
                                                    تخطي هذا الخطأ
                                                </button>
                                            )}
                                        </div>
                                        
                                        {step.status === 'error' && (
                                            <div className="mt-2 text-[10px] text-red-600 bg-white/80 p-2 rounded border border-red-200 font-mono break-all leading-relaxed">
                                                {step.error}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {globalError && (
                                <div className={`mt-6 p-4 rounded-xl flex items-start gap-3 border shadow-sm ${globalError.includes("نجاح") || globalError.includes("اكتملت") ? 'bg-green-100 border-green-300 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                                    <div className="flex-shrink-0 mt-0.5">
                                        {globalError.includes("نجاح") || globalError.includes("اكتملت") ? <CheckCircleIcon className="w-5 h-5" /> : <ExclamationTriangleIcon className="w-5 h-5" />}
                                    </div>
                                    <p className="text-sm font-bold leading-relaxed">{globalError}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t bg-gray-50 flex justify-between items-center rounded-b-2xl">
                    <button 
                        onClick={onClose} 
                        disabled={isProcessing}
                        className="px-6 py-2 text-gray-600 font-bold hover:text-gray-800 disabled:opacity-50 transition-colors"
                    >
                        إلغاء
                    </button>

                    {!steps.length ? (
                        <button 
                            onClick={startRestore} 
                            disabled={!file || isProcessing}
                            className="px-8 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-100 transition-all active:scale-95"
                        >
                            تحليل ملف النسخة
                        </button>
                    ) : (
                        steps.some(s => s.status === 'error') && !isProcessing && (
                            <button 
                                onClick={() => processUpload(steps.findIndex(s => s.status === 'error'))}
                                className="px-8 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg transition-all"
                            >
                                إعادة محاولة الرفع
                            </button>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};

export default BackupRestoreWizard;
