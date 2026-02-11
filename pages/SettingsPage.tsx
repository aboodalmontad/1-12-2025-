
import * as React from 'react';
import { TrashIcon, ExclamationTriangleIcon, CloudArrowUpIcon, ArrowPathIcon, PlusIcon, CheckCircleIcon, XCircleIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, ShieldCheckIcon, UserGroupIcon } from '../components/icons';
import { Client, AdminTask, Appointment, AccountingEntry } from '../types';
import { useData } from '../context/DataContext';
import { openDB } from 'idb';
import AssistantsManager from '../components/AssistantsManager';

interface SettingsPageProps {}

const SettingsPage: React.FC<SettingsPageProps> = () => {
    const { setFullData, assistants, setAssistants, userId, isAutoSyncEnabled, setAutoSyncEnabled, isAutoBackupEnabled, setAutoBackupEnabled, adminTasksLayout, setAdminTasksLayout, deleteAssistant, exportData, permissions, manualSync } = useData();
    const [feedback, setFeedback] = React.useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = React.useState(false);
    const [isDeleteAssistantModalOpen, setIsDeleteAssistantModalOpen] = React.useState(false);
    const [assistantToDelete, setAssistantToDelete] = React.useState<string | null>(null);
    const [newAssistant, setNewAssistant] = React.useState('');
    const [dbStats, setDbStats] = React.useState<string | null>(null);
    const [isAssistantsManagerOpen, setIsAssistantsManagerOpen] = React.useState(false);

    const showFeedback = (message: string, type: 'success' | 'error' | 'info') => {
        setFeedback({ message, type });
        setTimeout(() => setFeedback(null), 5000);
    };

    const handleConfirmClearData = () => {
        try {
            const emptyData = { clients: [], adminTasks: [], appointments: [], accountingEntries: [], invoices: [], assistants: ['بدون تخصيص'], documents: [], profiles: [], siteFinances: [] };
            setFullData(emptyData);
            showFeedback('تم مسح جميع البيانات بنجاح.', 'success');
        } catch (error) { 
            console.error("Clear data error:", error);
            showFeedback('حدث خطأ أثناء مسح البيانات.', 'error'); 
        }
        setIsConfirmModalOpen(false);
    };

    const handleExportData = () => { 
        try {
            if (exportData()) { 
                showFeedback('تم تصدير البيانات بنجاح.', 'success'); 
            } else { 
                showFeedback('فشل تصدير البيانات.', 'error'); 
            } 
        } catch (e) {
            console.error("Export error:", e);
            showFeedback('فشل تصدير البيانات.', 'error');
        }
    };

    const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]; 
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => { 
            try { 
                const text = e.target?.result; 
                if (typeof text !== 'string') throw new Error("لا يمكن قراءة ملف النسخة الاحتياطية."); 
                
                const importedData = JSON.parse(text); 
                
                if (!importedData || typeof importedData !== 'object') {
                    throw new Error("تنسيق ملف النسخة الاحتياطية غير صحيح.");
                }

                // تحميل البيانات محلياً أولاً
                setFullData(importedData); 
                showFeedback('تم تحميل البيانات محلياً. جاري المزامنة مع السحابة الآن...', 'info'); 

                // طلب مزامنة فورية لرفع البيانات المستوردة
                setTimeout(async () => {
                    try {
                        await manualSync();
                        showFeedback('تم استيراد البيانات ومزامنتها بنجاح مع السحابة.', 'success');
                    } catch (syncErr: any) {
                        console.error("Sync after import failed:", syncErr);
                        showFeedback('تم الاستيراد محلياً ولكن فشلت المزامنة التلقائية. يرجى الضغط على زر المزامنة اليدوي.', 'error');
                    }
                }, 1000);

            } catch (error: any) { 
                console.error("Import process failed:", error);
                showFeedback(`فشل استيراد البيانات: ${error.message || 'خطأ غير معروف'}`, 'error'); 
            } 
        };
        reader.onerror = () => {
            showFeedback('فشل قراءة الملف من الجهاز.', 'error');
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    const handleAddAssistant = (e: React.FormEvent) => { 
        e.preventDefault(); 
        if (newAssistant && !assistants.includes(newAssistant) && newAssistant !== 'بدون تخصيص') { 
            setAssistants(prev => [...prev, newAssistant.trim()]); 
            setNewAssistant(''); 
        } 
    };

    const handleDeleteAssistant = (name: string) => { 
        if (name !== 'بدون تخصيص') { 
            setAssistantToDelete(name); 
            setIsDeleteAssistantModalOpen(true); 
        } 
    };

    const handleConfirmDeleteAssistant = () => { 
        if (assistantToDelete) { 
            deleteAssistant(assistantToDelete); 
            showFeedback(`تم حذف المساعد "${assistantToDelete}" بنجاح.`, 'success'); 
        } 
        setIsDeleteAssistantModalOpen(false); 
        setAssistantToDelete(null); 
    };

    const handleInspectDb = async () => { 
        setDbStats('جاري الفحص...'); 
        try { 
            const db = await openDB('LawyerAppData', 12); 
            let stats = ''; 
            const stores = Array.from(db.objectStoreNames);
            for (const s of stores) { 
                const count = await db.count(s); 
                stats += `- ${s}: ${count} سجل\n`; 
            } 
            setDbStats(stats || 'لا توجد سجلات في قاعدة البيانات المحلية.'); 
        } catch (e:any) { 
            console.error("DB Inspect error:", e);
            setDbStats('فشل الفحص: ' + e.message); 
        } 
    };

    const ToggleSwitch: React.FC<{ enabled: boolean; onChange: (enabled: boolean) => void; label: string }> = ({ enabled, onChange, label }) => (
        <div className="flex items-center">
            <span className="text-gray-700 me-3 font-medium">{label}</span>
            <button type="button" className={`${enabled ? 'bg-blue-600' : 'bg-gray-200'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none`} role="switch" aria-checked={enabled} onClick={() => onChange(!enabled)}>
                <span aria-hidden="true" className={`${enabled ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`} />
            </button>
        </div>
    );

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">الإعدادات</h1>
            {feedback && (
                <div className={`p-4 rounded-lg flex items-center gap-3 animate-fade-in transition-all duration-500 ${
                    feedback.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 
                    feedback.type === 'info' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                    'bg-red-100 text-red-800 border border-red-200'
                }`}>
                    {feedback.type === 'success' ? <CheckCircleIcon className="w-5 h-5"/> : 
                     feedback.type === 'info' ? <ArrowPathIcon className="w-5 h-5 animate-spin"/> :
                     <ExclamationTriangleIcon className="w-5 h-5"/>}
                    <span>{feedback.message}</span>
                </div>
            )}
            
            {permissions?.can_delete_client && (
                <div className="bg-white p-6 rounded-lg shadow space-y-4">
                    <h2 className="text-xl font-bold text-gray-800 border-b pb-3 flex items-center gap-2"><UserGroupIcon className="w-6 h-6 text-blue-600" />إدارة المساعدين والصلاحيات</h2>
                    <p className="text-gray-600 text-sm">هنا يمكنك استعراض المساعدين الذين انضموا لمكتبك، تفعيل حساباتهم، وتحديد صلاحيات الوصول الخاصة بهم بشكل دقيق.</p>
                    <button onClick={() => setIsAssistantsManagerOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"><UserGroupIcon className="w-5 h-5" /><span>فتح لوحة تعريف المساعدين</span></button>
                </div>
            )}

            <div className="bg-white p-6 rounded-lg shadow space-y-4">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">إعدادات المزامنة</h2>
                <div className="pt-2"><ToggleSwitch label="المزامنة التلقائية" enabled={isAutoSyncEnabled} onChange={setAutoSyncEnabled} /></div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow space-y-4">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">النسخ الاحتياطي</h2>
                <div className="pt-2"><ToggleSwitch label="النسخ الاحتياطي اليومي التلقائي" enabled={isAutoBackupEnabled} onChange={setAutoBackupEnabled} /></div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-4">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">تخطيط المهام</h2>
                <div className="pt-2 flex gap-4">
                    <button onClick={() => setAdminTasksLayout('horizontal')} className={`px-4 py-2 rounded-lg font-medium transition-all ${adminTasksLayout === 'horizontal' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>أفقي (قائمة)</button>
                    <button onClick={() => setAdminTasksLayout('vertical')} className={`px-4 py-2 rounded-lg font-medium transition-all ${adminTasksLayout === 'vertical' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>عمودي (أعمدة)</button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-4">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">فحص البيانات</h2>
                <button onClick={handleInspectDb} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
                    <ArrowPathIcon className="w-5 h-5"/>
                    <span>فحص حالة التخزين المحلي</span>
                </button>
                {dbStats && <pre className="mt-4 bg-gray-900 text-green-400 p-4 rounded-lg text-xs font-mono overflow-x-auto border border-gray-700 shadow-inner">{dbStats}</pre>}
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-4">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">نقل البيانات (ملفات محليّة)</h2>
                <p className="text-sm text-gray-500 mb-4">هذه الأدوات تتيح لك حفظ نسخة احتياطية على جهازك أو استيراد بيانات من ملف JSON تم تصديره سابقاً من هذا التطبيق.</p>
                <div className="flex flex-wrap gap-4">
                    <button onClick={handleExportData} className="flex items-center gap-2 px-6 py-2 bg-blue-50 text-blue-700 font-bold rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors">
                        <ArrowDownTrayIcon className="w-5 h-5"/>
                        <span>تصدير ملف نسخة احتياطية</span>
                    </button>
                    <label className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer shadow-md">
                        <ArrowUpTrayIcon className="w-5 h-5"/>
                        <span>استيراد من ملف</span>
                        <input type="file" accept=".json" className="hidden" onChange={handleImportData}/>
                    </label>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">قائمة المساعدين (للقوائم المنسدلة)</h2>
                <div className="space-y-4">
                    <form onSubmit={handleAddAssistant} className="flex gap-2">
                        <input type="text" value={newAssistant} onChange={e => setNewAssistant(e.target.value)} className="flex-grow p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="أدخل اسم المساعد..." />
                        <button type="submit" className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm">إضافة</button>
                    </form>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {assistants.map(a => (
                            <li key={a} className="flex justify-between items-center p-3 bg-gray-50 border rounded-lg hover:shadow-sm transition-shadow">
                                <span className="font-medium text-gray-700">{a}</span>
                                {a !== 'بدون تخصيص' && (
                                    <button onClick={() => handleDeleteAssistant(a)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-full transition-colors">
                                        <TrashIcon className="w-4 h-4"/>
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-4 border-2 border-red-50">
                <h2 className="text-xl font-bold text-red-600 border-b pb-3 flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-6 h-6"/>
                    <span>منطقة الخطر</span>
                </h2>
                <p className="text-sm text-gray-600">سيؤدي مسح البيانات إلى حذف كافة الموكلين والقضايا والمهام من هذا الجهاز. تأكد من أنك قمت بعمل مزامنة سحابية أولاً.</p>
                <button onClick={() => setIsConfirmModalOpen(true)} className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors shadow-md">
                    <TrashIcon className="w-5 h-5"/>
                    <span>مسح كافة البيانات من الجهاز</span>
                </button>
            </div>

            {isConfirmModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full animate-fade-in">
                        <div className="text-center">
                            <ExclamationTriangleIcon className="w-16 h-16 text-red-600 mx-auto mb-4"/>
                            <h3 className="text-2xl font-bold text-gray-900 mb-2">تأكيد المسح الشامل</h3>
                            <p className="text-gray-600 mb-6">هل أنت متأكد تماماً؟ لا يمكن التراجع عن هذه الخطوة إلا إذا كان لديك نسخة احتياطية سحابية أو محليّة.</p>
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => setIsConfirmModalOpen(false)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition-colors">إلغاء</button>
                            <button onClick={handleConfirmClearData} className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors shadow-lg">نعم، امسح كل شيء</button>
                        </div>
                    </div>
                </div>
            )}
            
            {isDeleteAssistantModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white p-8 rounded-xl shadow-lg max-w-sm w-full">
                        <h3 className="text-xl font-bold mb-4">حذف من القائمة؟</h3>
                        <p className="text-gray-600 mb-6">هل تريد إزالة "{assistantToDelete}" من قائمة المساعدين المتاحة للتخصيص؟</p>
                        <div className="flex gap-4">
                            <button onClick={() => setIsDeleteAssistantModalOpen(false)} className="flex-1 px-4 py-2 bg-gray-100 rounded-lg">تراجع</button>
                            <button onClick={handleConfirmDeleteAssistant} className="flex-1 px-4 py-2 bg-red-600 text-white font-bold rounded-lg">حذف</button>
                        </div>
                    </div>
                </div>
            )}
            
            {isAssistantsManagerOpen && <AssistantsManager onClose={() => setIsAssistantsManagerOpen(false)} />}
        </div>
    );
};

export default SettingsPage;
