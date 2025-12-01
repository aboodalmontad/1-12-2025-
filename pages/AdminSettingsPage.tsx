
import * as React from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { MusicalNoteIcon, PlayCircleIcon, TrashIcon, ArrowUpTrayIcon, ServerIcon, CloudArrowDownIcon, CloudArrowUpIcon, ExclamationTriangleIcon, CheckCircleIcon, ArrowPathIcon } from '../components/icons';
import { defaultUserApprovalSoundBase64 } from '../components/RealtimeNotifier';
import { useData } from '../context/DataContext';

const USER_APPROVAL_SOUND_KEY = 'customUserApprovalSound';

interface AdminSettingsPageProps {
    onOpenConfig: () => void;
}

const AdminSettingsPage: React.FC<AdminSettingsPageProps> = ({ onOpenConfig }) => {
    const { backupCloudData, restoreCloudData } = useData();
    const [customSound, setCustomSound] = useLocalStorage<string | null>(USER_APPROVAL_SOUND_KEY, null);
    const [feedback, setFeedback] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [isProcessing, setIsProcessing] = React.useState(false);

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
        reader.onerror = () => {
            showFeedback('فشل في قراءة الملف.', 'error');
        };
        reader.readAsDataURL(file);
    };

    const playSound = () => {
        const soundSource = customSound || defaultUserApprovalSoundBase64;
        
        if (!soundSource) {
             showFeedback('الملف الصوتي المعتمد للتنبيه غير موجود. الرجاء اختيار نغمة جديدة.', 'error');
             return;
        }

        try {
            const audio = new Audio(soundSource);
            audio.play().catch(e => {
                console.error("Audio preview playback failed:", e);
                showFeedback('فشل تشغيل الملف الصوتي. قد يكون الملف تالفاً أو غير مدعوم. الرجاء اختيار نغمة تنبيه جديدة.', 'error');
            });
        } catch (e) {
            console.error("Error creating Audio object for preview:", e);
            showFeedback('حدث خطأ في تهيئة الصوت. الرجاء إعادة تحميل الصفحة أو اختيار نغمة جديدة.', 'error');
        }
    };

    const resetSound = () => {
        setCustomSound(null);
        showFeedback('تمت استعادة الصوت الافتراضي.', 'success');
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

    const handleCloudRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!window.confirm("تحذير: استعادة النسخة الاحتياطية ستقوم بتحديث كافة البيانات في قاعدة البيانات السحابية. هل أنت متأكد من المتابعة؟")) {
            event.target.value = ''; // Reset input
            return;
        }

        setIsProcessing(true);
        try {
            await restoreCloudData(file);
            showFeedback('تمت استعادة البيانات بنجاح.', 'success');
        } catch (e: any) {
            showFeedback(`فشل الاستعادة: ${e.message}`, 'error');
        } finally {
            setIsProcessing(false);
            event.target.value = ''; // Reset input
        }
    };

    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-bold text-gray-800">إعدادات المدير</h1>

            {feedback && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${feedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    <span>{feedback.message}</span>
                </div>
            )}
            
            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3 flex items-center gap-3">
                    <CloudArrowDownIcon className="w-6 h-6 text-blue-600" />
                    <span>النسخ الاحتياطي والاستعادة السحابية</span>
                </h2>
                <div className="p-4 bg-gray-50 border rounded-lg">
                    <h3 className="font-semibold text-lg text-gray-800">نسخة كاملة من قاعدة البيانات</h3>
                    <p className="text-sm text-gray-600 mt-1 mb-4">
                        يمكنك تنزيل نسخة كاملة عن كافة البيانات الموجودة في قاعدة البيانات السحابية بصيغة JSON، أو استعادة نسخة سابقة.
                        <br />
                        <span className="text-red-600 font-bold flex items-center gap-1 mt-1">
                            <ExclamationTriangleIcon className="w-4 h-4" />
                            تحذير: عملية الاستعادة ستقوم بتحديث البيانات الموجودة في السحابة.
                        </span>
                    </p>
                    <div className="flex flex-wrap gap-4">
                        <button 
                            onClick={handleCloudBackup}
                            disabled={isProcessing}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                            {isProcessing ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <CloudArrowDownIcon className="w-5 h-5" />}
                            <span>تنزيل نسخة احتياطية (Download Backup)</span>
                        </button>

                        <div className="relative">
                            <input
                                type="file"
                                id="restore-upload"
                                accept=".json"
                                className="hidden"
                                onChange={handleCloudRestore}
                                disabled={isProcessing}
                            />
                            <label
                                htmlFor="restore-upload"
                                className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {isProcessing ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <CloudArrowUpIcon className="w-5 h-5" />}
                                <span>استعادة نسخة احتياطية (Restore Backup)</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3 flex items-center gap-3">
                    <ServerIcon className="w-6 h-6 text-blue-600" />
                    <span>تكوين النظام</span>
                </h2>
                <div className="p-4 bg-gray-50 border rounded-lg">
                    <h3 className="font-semibold text-lg text-gray-800">معالج إعداد قاعدة البيانات</h3>
                    <p className="text-sm text-gray-600 mt-1">
                        استخدم هذه الأداة لإعداد جداول قاعدة البيانات، وتكوين صلاحيات التخزين، وإصلاح مشاكل المزامنة. يجب استخدام هذه الأداة بحذر.
                    </p>
                    <div className="mt-4">
                        <button 
                            onClick={onOpenConfig}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <ServerIcon className="w-5 h-5" />
                            <span>فتح معالج الإعداد</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3 flex items-center gap-3">
                    <MusicalNoteIcon className="w-6 h-6 text-blue-600" />
                    <span>تخصيص صوت التنبيهات</span>
                </h2>

                <div className="p-4 bg-gray-50 border rounded-lg">
                    <h3 className="font-semibold text-lg text-gray-800">صوت تنبيه تسجيل مستخدم جديد</h3>
                    <p className="text-sm text-gray-600 mt-1">
                        اختر ملفًا صوتيًا (مثل MP3, WAV) ليتم تشغيله عند تسجيل مستخدم جديد في انتظار الموافقة.
                    </p>

                    <div className="mt-4 flex flex-col sm:flex-row items-center gap-4">
                        <input
                            type="file"
                            id="sound-upload"
                            accept="audio/*"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                        <label
                            htmlFor="sound-upload"
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                        >
                            <ArrowUpTrayIcon className="w-5 h-5" />
                            <span>اختر ملفًا صوتيًا...</span>
                        </label>

                        
                        <button
                            onClick={playSound}
                            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors"
                        >
                            <PlayCircleIcon className="w-5 h-5" />
                            <span>تشغيل الصوت الحالي</span>
                        </button>
                        {customSound && (
                            <button
                                onClick={resetSound}
                                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors"
                            >
                                <TrashIcon className="w-5 h-5" />
                                <span>استعادة الافتراضي</span>
                            </button>
                        )}
                    </div>
                     {customSound ? <p className="text-xs text-gray-500 mt-2">تم تعيين صوت مخصص.</p> : <p className="text-xs text-gray-500 mt-2">يتم استخدام الصوت الافتراضي حالياً.</p>}
                </div>
            </div>
        </div>
    );
};

export default AdminSettingsPage;
