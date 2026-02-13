
import { getSupabaseClient } from '../supabaseClient';
import { Client, AdminTask, Appointment, AccountingEntry, Invoice, InvoiceItem, CaseDocument, Profile, SiteFinancialEntry, SyncDeletion } from '../types';
import type { User } from '@supabase/supabase-js';

export type FlatData = {
    clients: Omit<Client, 'cases'>[];
    cases: any[];
    stages: any[];
    sessions: any[];
    admin_tasks: AdminTask[];
    appointments: Appointment[];
    accounting_entries: AccountingEntry[];
    assistants: { name: string }[];
    invoices: Omit<Invoice, 'items'>[];
    invoice_items: InvoiceItem[];
    case_documents: CaseDocument[];
    profiles: Profile[];
    site_finances: SiteFinancialEntry[];
};

const SYNC_TIMEOUT_MS = 30000;

const withTimeout = <T>(promise: Promise<T> | any, timeoutMs: number, errorMessage: string): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
        )
    ]);
};

const ensureValidSession = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('سيرفر المزامنة غير مهيأ.');
    
    try {
        const { data: { session }, error } = await withTimeout(
            supabase.auth.getSession(), 
            10000, 
            'انتهت مهلة الاتصال بالسيرفر. تحقق من الإنترنت.'
        ) as any;

        if (error) throw error;
        if (!session) throw new Error('يجب تسجيل الدخول للمزامنة.');
        return session.user;
    } catch (e: any) {
        if (e.message.includes('JWT')) throw new Error('انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول.');
        throw e;
    }
};

export const checkSupabaseSchema = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'unconfigured', message: 'Supabase is not configured.' };
    try { await ensureValidSession(); } catch (err: any) { return { success: false, error: 'auth_error', message: err.message }; }

    try {
        const { error } = await withTimeout(supabase.from('profiles').select('id').limit(1), 5000, 'فشل التحقق من قاعدة البيانات.') as any;
        if (error && (error.code === '42P01')) return { success: false, error: 'uninitialized', message: 'قاعدة البيانات السحابية غير مكتملة.' };
        return { success: true, error: null, message: '' };
    } catch (err: any) { 
        return { success: false, error: 'unknown', message: err.message }; 
    }
};

export const fetchDataFromSupabase = async (onProgress?: (msg: string) => void): Promise<Partial<FlatData>> => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase unavailable');
    await ensureValidSession();

    const keys = ['profiles', 'assistants', 'clients', 'cases', 'stages', 'sessions', 'admin_tasks', 'appointments', 'accounting_entries', 'invoices', 'invoice_items', 'case_documents', 'site_finances'];
    const results: any = {};

    for (const key of keys) {
        if (onProgress) onProgress(`جاري تحميل: ${key}...`);
        try {
            const { data, error } = await withTimeout(
                supabase.from(key).select('*'),
                SYNC_TIMEOUT_MS,
                `فشل تحميل جدول ${key}`
            ) as any;
            
            if (error) {
                console.warn(`Error fetching ${key}:`, error);
                results[key] = [];
            } else {
                results[key] = data || [];
            }
        } catch (e) {
            console.error(`Exception fetching ${key}:`, e);
            results[key] = [];
        }
    }

    return results as Partial<FlatData>;
};

export const getTablesConfig = (data: Partial<FlatData>, ownerId: string) => {
    const sanitize = (items: any[] | undefined, pickFields: (item: any) => any) => 
        (items || []).map(item => {
            const fields = pickFields(item);
            const finalUserId = item.user_id || item.userId || ownerId;
            return { 
                ...fields, 
                user_id: finalUserId, 
                updated_at: item.updated_at || item.updatedAt || new Date().toISOString() 
            };
        });

    return [
        { 
            table: 'profiles', 
            label: 'ملفات المستخدمين',
            data: (data.profiles || []).map(p => ({
                id: p.id,
                full_name: p.full_name,
                mobile_number: p.mobile_number,
                role: p.role,
                is_approved: p.is_approved,
                is_active: p.is_active,
                subscription_start_date: p.subscription_start_date,
                subscription_end_date: p.subscription_end_date,
                lawyer_id: p.lawyer_id,
                permissions: p.permissions,
                mobile_verified: p.mobile_verified,
                created_at: p.created_at
            }))
        },
        { 
            table: 'assistants', 
            label: 'المساعدين',
            data: sanitize(data.assistants, i => ({ name: i.name })), 
            options: { onConflict: 'user_id,name' } 
        },
        { 
            table: 'clients', 
            label: 'الموكلين',
            data: sanitize(data.clients, i => ({ id: i.id, name: i.name, contact_info: i.contactInfo || i.contact_info })) 
        },
        { 
            table: 'cases', 
            label: 'القضايا',
            data: sanitize(data.cases, i => ({ id: i.id, client_id: i.client_id || i.clientId, subject: i.subject, opponent_name: i.opponentName || i.opponent_name, fee_agreement: i.feeAgreement || i.fee_agreement, status: i.status })) 
        },
        { 
            table: 'stages', 
            label: 'مراحل التقاضي',
            data: sanitize(data.stages, i => ({ id: i.id, case_id: i.case_id || i.caseId, court: i.court, case_number: i.caseNumber || i.case_number, first_session_date: i.firstSessionDate || i.first_session_date, decision_date: i.decisionDate || i.decision_date, decision_number: i.decisionNumber || i.decision_number, decision_summary: i.decisionSummary || i.decision_summary, decision_notes: i.decisionNotes || i.decision_notes })) 
        },
        { 
            table: 'sessions', 
            label: 'الجلسات',
            data: sanitize(data.sessions, i => ({ id: i.id, stage_id: i.stage_id || i.stageId, date: i.date, court: i.court, case_number: i.caseNumber || i.case_number, client_name: i.clientName || i.client_name, opponent_name: i.opponentName || i.opponent_name, postponement_reason: i.postponementReason || i.postponement_reason, next_session_date: i.nextSessionDate || i.next_session_date, next_postponement_reason: i.nextPostponementReason || i.next_postponement_reason, is_postponed: !!i.is_postponed || !!i.isPostponed, assignee: i.assignee })) 
        },
        { 
            table: 'invoices', 
            label: 'الفواتير',
            data: sanitize(data.invoices, i => ({ id: i.id, client_id: i.clientId || i.client_id, client_name: i.clientName || i.client_name, case_id: i.caseId || i.case_id, case_subject: i.caseSubject || i.case_subject, issue_date: i.issueDate || i.issue_date, due_date: i.dueDate || i.due_date, tax_rate: i.taxRate || i.tax_rate, discount: i.discount, status: i.status, notes: i.notes })) 
        },
        { 
            table: 'invoice_items', 
            label: 'بنود الفواتير',
            data: (data.invoice_items || []).map(i => ({ id: i.id, invoice_id: i.invoice_id, description: i.description, amount: i.amount })) 
        },
        { 
            table: 'admin_tasks', 
            label: 'المهام الإدارية',
            data: sanitize(data.admin_tasks, i => ({ id: i.id, task: i.task, due_date: i.dueDate || i.due_date, completed: !!i.completed, importance: i.importance, assignee: i.assignee, location: i.location, order_index: i.orderIndex || i.order_index })) 
        },
        { 
            table: 'appointments', 
            label: 'المواعيد',
            data: sanitize(data.appointments, i => ({ id: i.id, title: i.title, time: i.time, date: i.date, importance: i.importance, assignee: i.assignee, completed: !!i.completed, reminder_time_in_minutes: i.reminderTimeInMinutes || i.reminder_time_in_minutes, notified: !!i.notified })) 
        },
        { 
            table: 'accounting_entries', 
            label: 'القيود المحاسبية',
            data: sanitize(data.accounting_entries, i => ({ id: i.id, type: i.type, amount: i.amount, date: i.date, description: i.description, client_id: i.clientId || i.client_id, case_id: i.caseId || i.case_id, client_name: i.clientName || i.client_name })) 
        },
        { 
            table: 'case_documents', 
            label: 'الوثائق والمستندات',
            data: sanitize(data.case_documents, i => ({ id: i.id, case_id: i.caseId || i.case_id, name: i.name, type: i.type, size: i.size, storage_path: i.storagePath || i.storage_path, added_at: i.addedAt || i.added_at })) 
        },
        { 
            table: 'site_finances', 
            label: 'المالية العامة لمكتبك',
            data: sanitize(data.site_finances, i => ({ id: i.id && i.id < 0 ? undefined : i.id, type: i.type, amount: i.amount, payment_date: i.payment_date || i.paymentDate, description: i.description, category: i.category, payment_method: i.payment_method || i.paymentMethod })) 
        },
    ];
};

export const upsertDataToSupabase = async (data: Partial<FlatData>, ownerId: string, onProgress?: (msg: string) => void) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not available.');
    await ensureValidSession();
    
    const configs = getTablesConfig(data, ownerId);

    for (const config of configs) {
        if (!config.data.length) continue;
        if (onProgress) onProgress(`جاري رفع: ${config.label}...`);

        const BATCH_SIZE = 40;
        for (let i = 0; i < config.data.length; i += BATCH_SIZE) {
            const batch = config.data.slice(i, i + BATCH_SIZE);
            const { error } = await withTimeout(
                supabase.from(config.table).upsert(batch, config.options),
                SYNC_TIMEOUT_MS,
                `فشل رفع دفعة ${config.label}`
            ) as any;
            
            if (error) {
                console.error(`RLS or DB Error on table ${config.table}:`, error);
                throw new Error(`فشل في جدول ${config.table}: ${error.message}. يرجى تشغيل سكربت v5.3 من الإعدادات.`);
            }
        }
    }
    
    return true;
};

export const transformRemoteToLocal = (remote: any): Partial<FlatData> => {
    if (!remote) return {};
    const mapItems = (items: any[] | undefined, mapper: (item: any) => any) => (items || []).map(mapper);
    return {
        clients: mapItems(remote.clients, ({ contact_info, ...r }) => ({ ...r, contactInfo: contact_info })),
        cases: mapItems(remote.cases, ({ client_name, opponent_name, fee_agreement, ...r }) => ({ ...r, clientName: client_name, opponentName: opponent_name, feeAgreement: fee_agreement })),
        stages: mapItems(remote.stages, ({ case_number, first_session_date, decision_date, decision_number, decision_summary, decision_notes, ...r }) => ({ ...r, caseNumber: case_number, firstSessionDate: first_session_date, decisionDate: decision_date, decisionNumber: decision_number, decisionSummary: decision_summary, decisionNotes: decision_notes })),
        sessions: mapItems(remote.sessions, ({ case_number, client_name, opponent_name, postponement_reason, next_postponement_reason, is_postponed, next_session_date, ...r }) => ({ ...r, caseNumber: case_number, clientName: client_name, opponentName: opponent_name, postponementReason: postponement_reason, nextPostponementReason: next_postponement_reason, isPostponed: is_postponed, nextSessionDate: next_session_date })),
        admin_tasks: mapItems(remote.admin_tasks, ({ due_date, order_index, ...r }) => ({ ...r, dueDate: due_date, orderIndex: order_index })),
        appointments: mapItems(remote.appointments, ({ reminder_time_in_minutes, ...r }) => ({ ...r, reminderTimeInMinutes: reminder_time_in_minutes })),
        accounting_entries: mapItems(remote.accounting_entries, ({ client_id, case_id, client_name, ...r }) => ({ ...r, clientId: client_id, caseId: case_id, clientName: client_name })),
        assistants: mapItems(remote.assistants, a => ({ name: a.name })),
        invoices: mapItems(remote.invoices, ({ client_id, client_name, case_id, case_subject, issue_date, due_date, tax_rate, ...r }) => ({ ...r, clientId: client_id, clientName: client_name, caseId: case_id, caseSubject: case_subject, issue_date: issue_date, dueDate: due_date, taxRate: tax_rate })),
        invoice_items: remote.invoice_items,
        case_documents: mapItems(remote.case_documents, ({ user_id, case_id, added_at, storage_path, ...r }) => ({...r, userId: user_id, caseId: case_id, addedAt: added_at, storagePath: storage_path })),
        profiles: remote.profiles,
        site_finances: mapItems(remote.site_finances, ({ payment_date, payment_method, ...r }) => ({...r, paymentDate: payment_date, paymentMethod: payment_method})),
    };
};
