
import * as React from 'react';
import { ClipboardDocumentCheckIcon, ClipboardDocumentIcon, ShieldCheckIcon } from './icons';

const CopyButton: React.FC<{ textToCopy: string }> = ({ textToCopy }) => {
    const [copied, setCopied] = React.useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <button type="button" onClick={handleCopy} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors shadow-sm" title="نسخ الكود">
            {copied ? <ClipboardDocumentCheckIcon className="w-4 h-4 text-white" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
            {copied ? 'تم النسخ!' : 'نسخ كود SQL'}
        </button>
    );
};

const unifiedScript = `
-- =================================================================
-- سكربت الإصلاح الجذري (الإصدار 2.3): حل نهائي لـ RLS والمزامنة اللانهائية
-- =================================================================

-- 1. وظيفة محسنة للحصول على معرف صاحب المكتب
CREATE OR REPLACE FUNCTION public.get_data_owner_id()
RETURNS uuid AS $$
BEGIN
    RETURN COALESCE(
        (SELECT lawyer_id FROM public.profiles WHERE id = auth.uid() LIMIT 1),
        auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. إتاحة صلاحية التنفيذ
GRANT EXECUTE ON FUNCTION public.get_data_owner_id() TO authenticated;

-- 3. تفعيل RLS وتحديث السياسات
DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'profiles', 'assistants', 'clients', 'cases', 'stages', 'sessions', 
        'admin_tasks', 'appointments', 'accounting_entries', 
        'invoices', 'invoice_items', 'case_documents', 'site_finances', 'sync_deletions'
    ];
BEGIN
    FOR t IN SELECT unnest(tables) LOOP
        EXECUTE 'ALTER TABLE public.' || t || ' ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Unified Access Policy v2" ON public.' || t;
        EXECUTE 'DROP POLICY IF EXISTS "Unified Access Policy v2.1" ON public.' || t;
        EXECUTE 'DROP POLICY IF EXISTS "Unified Access Policy v2.2" ON public.' || t;
        EXECUTE 'DROP POLICY IF EXISTS "Unified Access Policy v2.3" ON public.' || t;
        
        -- سياسة الإصدار 2.3: 
        -- USING: تسمح بالوصول إذا كان السجل يتبع للمستخدم (لضمان معالجة البيانات القديمة) أو لصاحب المكتب
        -- WITH CHECK: السجلات الجديدة تتبع دائماً لصاحب المكتب لتوحيد البيانات
        IF t = 'profiles' THEN
             EXECUTE 'CREATE POLICY "Unified Access Policy v2.3" ON public.' || t || ' FOR ALL TO authenticated 
             USING (true) 
             WITH CHECK (id = auth.uid() OR role = ''admin'')';
        ELSE
            EXECUTE 'CREATE POLICY "Unified Access Policy v2.3" ON public.' || t || ' FOR ALL TO authenticated 
            USING (user_id = auth.uid() OR user_id = public.get_data_owner_id()) 
            WITH CHECK (user_id = public.get_data_owner_id())';
        END IF;
    END LOOP;
END $$;

-- 4. صلاحيات التخزين
DO $$
BEGIN
    DROP POLICY IF EXISTS "Authenticated users can manage docs" ON storage.objects;
    CREATE POLICY "Authenticated users can manage docs" ON storage.objects 
    FOR ALL TO authenticated 
    USING ( bucket_id = 'documents' )
    WITH CHECK ( bucket_id = 'documents' );
END $$;
`;

interface ConfigurationModalProps {
    onRetry: () => void;
}

const ConfigurationModal: React.FC<ConfigurationModalProps> = ({ onRetry }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[200]">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center gap-3 mb-4 text-blue-600">
                    <ShieldCheckIcon className="w-8 h-8" />
                    <h2 className="text-2xl font-bold">تحديث سياسات المزامنة v2.3</h2>
                </div>
                
                <div className="overflow-y-auto flex-grow pr-2 text-right" dir="rtl">
                    <div className="bg-amber-50 border-s-4 border-amber-500 p-4 mb-4 rounded">
                        <p className="text-sm text-amber-700 font-bold">
                            تنبيه: هذا التحديث (2.3) يحل مشكلة "new row violates row-level security policy" عند استيراد البيانات.
                        </p>
                    </div>

                    <ol className="list-decimal list-inside space-y-4 text-sm text-gray-600 mb-6">
                        <li className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <div className="flex justify-between items-center mb-2">
                                <strong className="text-gray-900 font-bold">1. انسخ السكربت المحدث v2.3:</strong>
                                <CopyButton textToCopy={unifiedScript} />
                            </div>
                            <div className="relative">
                                <pre className="bg-gray-800 text-green-400 p-3 rounded border border-gray-700 overflow-x-auto text-xs font-mono h-48" dir="ltr">
                                    {unifiedScript}
                                </pre>
                            </div>
                        </li>
                        <li>2. افتح <strong>SQL Editor</strong> في لوحة تحكم Supabase.</li>
                        <li>3. الصق الكود واضغط <strong>Run</strong>.</li>
                        <li>4. اضغط على زر <strong>إعادة المحاولة</strong> لتفعيل المزامنة.</li>
                    </ol>
                </div>

                <div className="mt-6 flex justify-end pt-4 border-t">
                    <button onClick={onRetry} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-md">إعادة المحاولة والتحقق</button>
                </div>
            </div>
        </div>
    );
};

export default ConfigurationModal;
