
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
-- سكربت الإصلاح الجذري (الإصدار 1.8): حل نهائي لمشاكل RLS والمساعدين
-- =================================================================

-- 1. تحديث وظيفة الحصول على معرف المالك (المحامي)
CREATE OR REPLACE FUNCTION public.get_data_owner_id()
RETURNS uuid AS $$
  -- جلب معرف المحامي إذا كان المستخدم مساعداً، وإلا إرجاع معرفه الشخصي
  SELECT COALESCE(
    (SELECT lawyer_id FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- 2. إتاحة صلاحية التنفيذ
GRANT EXECUTE ON FUNCTION public.get_data_owner_id() TO authenticated;

-- 3. إعادة ضبط سياسات جدول Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles readable by all authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are readable by all authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Profiles updatable by owner" ON public.profiles;

CREATE POLICY "Profiles readable by all authenticated" ON public.profiles 
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Profiles updatable by owner" ON public.profiles 
FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 4. تحديث سياسات كافة الجداول (الموكلين، القضايا، الخ...)
DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'assistants', 'clients', 'cases', 'stages', 'sessions', 
        'admin_tasks', 'appointments', 'accounting_entries', 
        'invoices', 'invoice_items', 'case_documents', 'site_finances'
    ];
BEGIN
    FOR t IN SELECT unnest(tables) LOOP
        EXECUTE 'DROP POLICY IF EXISTS "Allow Managing Data" ON public.' || t;
        
        -- سياسة الإصدار 1.8:
        -- تم تبسيط السياسة لضمان أن USING و WITH CHECK متطابقان تماماً
        -- ويشيران دائماً إلى هوية صاحب المكتب (المالك)
        EXECUTE 'CREATE POLICY "Allow Managing Data" ON public.' || t || ' FOR ALL TO authenticated 
        USING (
            user_id = public.get_data_owner_id()
            OR user_id = auth.uid()
        ) 
        WITH CHECK (
            user_id = public.get_data_owner_id()
        )';
    END LOOP;
END $$;

-- 5. سجل المحذوفات
DROP POLICY IF EXISTS "Access Own Deletions" ON public.sync_deletions;
CREATE POLICY "Access Own Deletions" ON public.sync_deletions FOR ALL TO authenticated 
USING (user_id = public.get_data_owner_id() OR user_id = auth.uid())
WITH CHECK (user_id = public.get_data_owner_id());

-- 6. التخزين السحابي
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
                    <h2 className="text-2xl font-bold">تحديث سياسات المزامنة v1.8</h2>
                </div>
                
                <div className="overflow-y-auto flex-grow pr-2 text-right" dir="rtl">
                    <div className="bg-amber-50 border-s-4 border-amber-500 p-4 mb-4 rounded">
                        <p className="text-sm text-amber-700 font-bold">
                            تنبيه: هذا التحديث (1.8) يعالج مشكلة "violate row-level security policy" التي تظهر عند المزامنة. يرجى تشغيله في Supabase SQL Editor.
                        </p>
                    </div>

                    <ol className="list-decimal list-inside space-y-4 text-sm text-gray-600 mb-6">
                        <li className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <div className="flex justify-between items-center mb-2">
                                <strong className="text-gray-900 font-bold">1. انسخ السكربت المحدث v1.8:</strong>
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
                        <li>4. اضغط على زر <strong>إعادة المحاولة</strong> أدناه لتفعيل المزامنة.</li>
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
