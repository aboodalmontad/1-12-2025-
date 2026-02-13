
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
            {copied ? 'تم النسخ!' : 'نسخ كود SQL v5.3'}
        </button>
    );
};

const unifiedScript = `-- =================================================================
-- سكربت الإصلاح v5.3 - حل نهائي لمشكلة RLS في الحسابات (Profiles)
-- =================================================================

-- 1. دالة التحقق من رتبة المدير (بصلاحيات أمنية محصنة)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_data_owner_id()
RETURNS uuid AS $$
DECLARE
    found_lawyer_id uuid;
BEGIN
    SELECT lawyer_id INTO found_lawyer_id FROM public.profiles WHERE id = auth.uid();
    RETURN COALESCE(found_lawyer_id, auth.uid());
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 2. إعادة ضبط سياسة جدول الحسابات (Profiles) بشكل جذري
DO $$
BEGIN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    
    -- حذف كافة السياسات السابقة لتجنب التعارض
    DROP POLICY IF EXISTS "Policy_Profiles_v50" ON public.profiles;
    DROP POLICY IF EXISTS "Policy_Profiles_v51" ON public.profiles;
    DROP POLICY IF EXISTS "Policy_Profiles_v52" ON public.profiles;
    DROP POLICY IF EXISTS "Policy_Profiles_v53" ON public.profiles;
    
    -- سياسة v5.3: المدير يملك صلاحيات كاملة، المستخدم يرى حسابه ومساعديه فقط
    CREATE POLICY "Policy_Profiles_v53" ON public.profiles FOR ALL TO authenticated 
    USING (
        public.is_admin() 
        OR id = auth.uid() 
        OR lawyer_id = auth.uid()
    ) 
    WITH CHECK (
        public.is_admin() 
        OR id = auth.uid()
    );
END $$;

-- 3. تحديث سياسات جداول البيانات الأخرى لتعمل مع v5.3
DO $$
DECLARE
    t text;
    data_tables text[] := ARRAY[
        'assistants', 'clients', 'cases', 'stages', 'sessions', 
        'admin_tasks', 'appointments', 'accounting_entries', 
        'invoices', 'invoice_items', 'case_documents', 'site_finances'
    ];
BEGIN
    FOR t IN SELECT unnest(data_tables) LOOP
        -- ضمان وجود عمود user_id
        EXECUTE 'ALTER TABLE public.' || t || ' ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id)';
        
        -- تفعيل الحماية
        EXECUTE 'ALTER TABLE public.' || t || ' ENABLE ROW LEVEL SECURITY';
        
        -- تنظيف السياسات السابقة
        EXECUTE 'DROP POLICY IF EXISTS "Policy_Select_v52" ON public.' || t;
        EXECUTE 'DROP POLICY IF EXISTS "Policy_Insert_v52" ON public.' || t;
        EXECUTE 'DROP POLICY IF EXISTS "Policy_Update_v52" ON public.' || t;
        EXECUTE 'DROP POLICY IF EXISTS "Policy_Delete_v52" ON public.' || t;
        EXECUTE 'DROP POLICY IF EXISTS "Policy_All_v53" ON public.' || t;

        -- تطبيق سياسة موحدة وشاملة v5.3
        EXECUTE 'CREATE POLICY "Policy_All_v53" ON public.' || t || ' FOR ALL TO authenticated 
        USING (public.is_admin() OR user_id = public.get_data_owner_id()) 
        WITH CHECK (public.is_admin() OR user_id = public.get_data_owner_id())';
    END LOOP;
END $$;

-- 4. إعادة منح الصلاحيات
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_data_owner_id() TO authenticated;
`;

interface ConfigurationModalProps {
    onRetry: () => void;
}

const ConfigurationModal: React.FC<ConfigurationModalProps> = ({ onRetry }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[200]">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" dir="rtl">
                <div className="flex items-center gap-3 mb-4 text-blue-600">
                    <ShieldCheckIcon className="w-8 h-8" />
                    <h2 className="text-2xl font-bold">معالج تهيئة النظام المتقدم v5.3</h2>
                </div>
                
                <div className="overflow-y-auto flex-grow pr-2 text-right">
                    <div className="bg-blue-50 border-s-4 border-blue-500 p-4 mb-4 rounded text-sm text-blue-800">
                        <strong>حل مشكلة RLS في الحسابات:</strong> هذا السكربت (v5.3) يمنح المدير الصلاحيات اللازمة لاستعادة بيانات حسابات المستخدمين الآخرين من النسخة الاحتياطية.
                    </div>

                    <ol className="list-decimal list-inside space-y-4 text-sm text-gray-600 mb-6">
                        <li className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <div className="flex justify-between items-center mb-2">
                                <strong className="text-gray-900 font-bold">1. انسخ كود الترقية v5.3:</strong>
                                <CopyButton textToCopy={unifiedScript} />
                            </div>
                            <div className="relative">
                                <pre className="bg-gray-800 text-green-400 p-3 rounded border border-gray-700 overflow-x-auto text-xs font-mono h-48" dir="ltr">
                                    {unifiedScript}
                                </pre>
                            </div>
                        </li>
                        <li>2. الصق الكود في <strong>SQL Editor</strong> في Supabase واضغط <strong>Run</strong>.</li>
                        <li>3. ارجع هنا واضغط <strong>بدء المزامنة</strong> لإتمام عملية الاستعادة.</li>
                    </ol>
                </div>

                <div className="mt-6 flex justify-end pt-4 border-t">
                    <button onClick={onRetry} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-md">بدء المزامنة</button>
                </div>
            </div>
        </div>
    );
};

export default ConfigurationModal;
