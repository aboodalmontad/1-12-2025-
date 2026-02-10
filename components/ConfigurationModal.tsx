
import * as React from 'react';
import { ClipboardDocumentCheckIcon, ClipboardDocumentIcon, ServerIcon, ShieldCheckIcon, ExclamationTriangleIcon } from './icons';

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
-- سكربت إصلاح سياسات الأمان والمزامنة للمساعدين (الإصدار المحدث)
-- =================================================================

-- 1. وظيفة التحقق من صلاحيات المدير
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN (SELECT (role = 'admin') FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. وظيفة الحصول على معرّف مالك المكتب (المحامي)
CREATE OR REPLACE FUNCTION public.get_data_owner_id()
RETURNS uuid AS $$
DECLARE
    found_lawyer_id uuid;
BEGIN
    -- البحث عن معرّف المحامي المرتبط بالمستخدم الحالي
    SELECT lawyer_id INTO found_lawyer_id FROM public.profiles WHERE id = auth.uid();
    -- إذا كان المستخدم مساعداً نرجع معرّف محاميه، وإلا نرجع معرّفه الشخصي
    RETURN COALESCE(found_lawyer_id, auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. تحديث سياسات جدول Profiles (ضروري لعمل المساعدين)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own and lawyer profile" ON public.profiles;
CREATE POLICY "Users can view own and lawyer profile" ON public.profiles 
FOR SELECT USING (
    auth.uid() = id 
    OR id = (SELECT lawyer_id FROM public.profiles WHERE id = auth.uid())
    OR lawyer_id = auth.uid()
    OR public.is_admin()
);

-- 4. تحديث سياسات RLS لكافة جداول البيانات (Clients, Cases, etc.)
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
        -- حذف السياسات القديمة
        EXECUTE 'DROP POLICY IF EXISTS "Access Own Data" ON public.' || t;
        EXECUTE 'DROP POLICY IF EXISTS "Allow Managing Data" ON public.' || t;
        
        -- إنشاء سياسة شاملة تسمح بالوصول (SELECT/DELETE) والتحقق (INSERT/UPDATE)
        EXECUTE 'CREATE POLICY "Allow Managing Data" ON public.' || t || ' FOR ALL USING (
            user_id = auth.uid() -- بياناتي الخاصة
            OR user_id = public.get_data_owner_id() -- بيانات المحامي الذي أعمل لديه
            OR user_id IN (SELECT id FROM public.profiles WHERE lawyer_id = auth.uid()) -- بيانات مساعديني (للمحامي)
            OR public.is_admin()
        ) WITH CHECK (
            user_id = auth.uid() 
            OR user_id = public.get_data_owner_id()
            OR public.is_admin()
        )';
    END LOOP;
END $$;

-- 5. تحديث سياسات سجل المحذوفات
DROP POLICY IF EXISTS "Access Own Deletions" ON public.sync_deletions;
CREATE POLICY "Access Own Deletions" ON public.sync_deletions FOR ALL USING (
    user_id = auth.uid() 
    OR user_id = public.get_data_owner_id()
    OR public.is_admin()
);

-- 6. تأكيد صلاحيات التخزين
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
                <div className="flex items-center gap-3 mb-4 text-amber-600">
                    <ServerIcon className="w-8 h-8" />
                    <h2 className="text-2xl font-bold">إصلاح مشكلة سياسة الأمان (RLS Error)</h2>
                </div>
                
                <div className="overflow-y-auto flex-grow pr-2">
                    <div className="bg-red-50 border-s-4 border-red-500 p-4 mb-4 rounded">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
                            </div>
                            <div className="ms-3">
                                <p className="text-sm text-red-700">
                                    عذراً، تمنع سياسات الأمان الحالية المساعدين من رفع البيانات. يرجى تطبيق السكربت البرمجي أدناه في لوحة تحكم Supabase لتصحيح الصلاحيات فوراً.
                                </p>
                            </div>
                        </div>
                    </div>

                    <ol className="list-decimal list-inside space-y-4 text-sm text-gray-600 mb-6">
                        <li className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <div className="flex justify-between items-center mb-2">
                                <strong className="text-gray-900">1. انسخ كود SQL المحدث:</strong>
                                <CopyButton textToCopy={unifiedScript} />
                            </div>
                            <div className="relative">
                                <pre className="bg-gray-800 text-green-400 p-3 rounded border border-gray-700 overflow-x-auto text-xs font-mono h-40" dir="ltr">
                                    {unifiedScript}
                                </pre>
                            </div>
                        </li>
                        <li>2. اذهب إلى <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-bold inline-flex items-center gap-1">لوحة تحكم Supabase <ShieldCheckIcon className="w-3 h-3"/></a>.</li>
                        <li>3. افتح <strong>SQL Editor</strong> وقم بلصق الكود ثم اضغط <strong>Run</strong>.</li>
                        <li>4. بعد ظهور رسالة النجاح، عد إلى هنا واضغط زر "إعادة المحاولة".</li>
                    </ol>
                </div>

                <div className="mt-6 flex justify-end pt-4 border-t">
                    <button onClick={onRetry} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-md">إعادة المحاولة</button>
                </div>
            </div>
        </div>
    );
};

export default ConfigurationModal;
