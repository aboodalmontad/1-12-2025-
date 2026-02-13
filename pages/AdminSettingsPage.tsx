
import * as React from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { MusicalNoteIcon, PlayCircleIcon, TrashIcon, ArrowUpTrayIcon, ServerIcon, CloudArrowDownIcon, CloudArrowUpIcon, ExclamationTriangleIcon, CheckCircleIcon, ArrowPathIcon } from '../components/icons';
import { defaultUserApprovalSoundBase64 } from '../components/RealtimeNotifier';
import { useData } from '../context/DataContext';
import BackupRestoreWizard from '../components/BackupRestoreWizard';

const USER_APPROVAL_SOUND_KEY = 'customUserApprovalSound';

interface AdminSettingsPageProps {
    onOpenConfig: () => void;
}

const AdminSettingsPage: React.FC<AdminSettingsPageProps> = ({ onOpenConfig }) => {
    const { backupCloudData } = useData();
    const [customSound, setCustomSound] = useLocalStorage<string | null>(USER_APPROVAL_SOUND_KEY, null);
    const [feedback, setFeedback] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [isWizardOpen, setIsWizardOpen] = React.useState(false);

    const showFeedback = (message: string, type: 'success' | 'error') => {
        setFeedback({ message, type });
        setTimeout(() => setFeedback(null), 3000);
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('audio/')) {
            showFeedback('الرجاء اختيار ملف صوتي صالح.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target?.result as string;
            setCustomSound(base64);
            showFeedback('تم حفظ صوت التنبيه الجديد بنجاح.', 'success');
        };
        reader.readAsDataURL(file);
    };

    const playSound = () => {
        const soundSource = customSound || defaultUserApprovalSoundBase64;
        if (soundSource) {
            const audio = new Audio(soundSource);
            audio.play().catch(e => showFeedback('فشل تشغيل الصوت.', 'error'));
        }
    };

    const handleCloudBackup = async () => {
        setIsProcessing(true);
        try {
            await backupCloudData();
            showFeedback('تم تنزيل النسخة الاحتياطية بنجاح.', 'success');
        } catch (e: any) {
            showFeedback(`فشل النسخ الاحتياطي: ${e.message}`, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-bold text-gray-800">إعدادات النظام</h1>

            {feedback && (
                <div className={`p-4 rounded-lg flex items-center gap-3 animate-fade-in ${feedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {feedback.type === 'success' ? <CheckCircleIcon className="w-5 h-5"/> : <ExclamationTriangleIcon className="w-5 h-5"/>}
                    <span className="font-bold">{feedback.message}</span>
                </div>
            )}
            
            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3 flex items-center gap-3">
                    <CloudArrowUpIcon className="w-6 h-6 text-blue-600" />
                    <span>أدوات النسخ الاحتياطي والاستعادة</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-4 bg-gray-50 border rounded-xl hover:bg-gray-100 transition-colors">
                        <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                            <CloudArrowDownIcon className="w-5 h-5 text-green-600" />
                            تنزيل نسخة شاملة
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">تنزيل كافة بيانات المستخدمين والملفات المحاسبية والوثائق من السحابة في ملف JSON واحد.</p>
                        <button 
                            onClick={handleCloudBackup}
                            disabled={isProcessing}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-all"
                        >
                            {isProcessing ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <CloudArrowDownIcon className="w-5 h-5" />}
                            <span>بدء تنزيل النسخة (Full JSON)</span>
                        </button>
                    </div>

                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-colors">
                        <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                            <CloudArrowUpIcon className="w-5 h-5 text-blue-600" />
                            معالج الاستعادة السحابية
                        </h3>
                        <p className="text-sm text-blue-800 mb-4">رفع ملف نسخة احتياطية (JSON) إلى السحابة مع معالجة الأخطاء خطوة بخطوة لكل جدول.</p>
                        <button 
                            onClick={() => setIsWizardOpen(true)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md transition-all"
                        >
                            <CloudArrowUpIcon className="w-5 h-5" />
                            <span>فتح معالج الرفع السحابي</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3 flex items-center gap-3">
                    <ServerIcon className="w-6 h-6 text-blue-600" />
                    <span>تكوين السيرفر (SQL Editor)</span>
                </h2>
                <div className="p-4 bg-gray-50 border rounded-lg">
                    <h3 className="font-semibold text-lg text-gray-800">إصلاح قواعد البيانات والسياسات</h3>
                    <p className="text-sm text-gray-600 mt-1 mb-4">
                        إذا واجهت أخطاء "Permission Denied" أثناء الاستعادة، يرجى تشغيل سكربت الترقية v5.2 من معالج الإعداد.
                    </p>
                    <button 
                        onClick={onOpenConfig}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors"
                    >
                        <ServerIcon className="w-5 h-5" />
                        <span>فتح معالج تهيئة SQL v5.2</span>
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3 flex items-center gap-3">
                    <MusicalNoteIcon className="w-6 h-6 text-blue-600" />
                    <span>تخصيص نغمة التنبيهات</span>
                </h2>

                <div className="p-4 bg-gray-50 border rounded-lg">
                    <h3 className="font-semibold text-lg text-gray-800">صوت تنبيه طلبات الانضمام</h3>
                    <p className="text-sm text-gray-600 mt-1 mb-4">يتم تشغيل هذا الصوت عند تسجيل محامي أو مساعد جديد بانتظار موافقتك.</p>

                    <div className="flex flex-wrap gap-4 items-center">
                        <input type="file" id="sound-upload" accept="audio/*" className="hidden" onChange={handleFileChange} />
                        <label htmlFor="sound-upload" className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 cursor-pointer transition-all">
                            <ArrowUpTrayIcon className="w-5 h-5" />
                            <span>تغيير النغمة</span>
                        </label>
                        <button onClick={playSound} className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600">
                            <PlayCircleIcon className="w-5 h-5" />
                            <span>تجربة الصوت</span>
                        </button>
                        {customSound && (
                            <button onClick={() => { setCustomSound(null); showFeedback('تمت العودة للصوت الافتراضي.', 'success'); }} className="p-2 text-red-500 hover:bg-red-50 rounded-full">
                                <TrashIcon className="w-6 h-6" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Wizard Modal */}
            {isWizardOpen && <BackupRestoreWizard onClose={() => setIsWizardOpen(false)} />}
        </div>
    );
};

export default AdminSettingsPage;
