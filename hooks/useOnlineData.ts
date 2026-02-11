
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

export const checkSupabaseSchema = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
        return { success: false, error: 'unconfigured', message: 'Supabase client is not configured.' };
    }

    const tableChecks: { [key: string]: string } = {
        'profiles': 'id', 'clients': 'id', 'cases': 'id',
        'stages': 'id', 'sessions': 'id', 'admin_tasks': 'id',
        'appointments': 'id', 'accounting_entries': 'id', 'assistants': 'name',
        'invoices': 'id', 'invoice_items': 'id', 'case_documents': 'id',
        'site_finances': 'id',
        'sync_deletions': 'id',
    };
    
    try {
        for (const [table, query] of Object.entries(tableChecks)) {
            const { error } = await supabase.from(table).select(query).limit(1);
            if (error) {
                const code = String(error.code || '');
                const msg = String(error.message || '').toLowerCase();
                if (code === '42P01' || msg.includes('does not exist')) {
                    return { success: false, error: 'uninitialized', message: `الجدول ${table} غير موجود. يرجى تهيئة قاعدة البيانات.` };
                }
                if (code === '42501' || msg.includes('policy')) continue; 
            }
        }
        return { success: true, error: null, message: '' };
    } catch (err: any) {
        return { success: false, error: 'unknown', message: `خطأ أثناء فحص البيانات: ${err.message}` };
    }
};

export const fetchDataFromSupabase = async (): Promise<Partial<FlatData>> => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not available.');

    const fetchTable = async (table: string) => {
        const { data, error } = await supabase.from(table).select('*');
        if (error) {
            console.error(`Error fetching ${table}:`, error.message);
            if (error.code === '42501' || error.message.includes('policy')) return [];
            throw error;
        }
        return data || [];
    };

    try {
        const [
            clients, admin_tasks, appointments, accounting_entries,
            assistants, invoices, cases, stages, sessions, invoice_items,
            case_documents, profiles, site_finances
        ] = await Promise.all([
            fetchTable('clients'), fetchTable('admin_tasks'), fetchTable('appointments'),
            fetchTable('accounting_entries'), fetchTable('assistants'), fetchTable('invoices'),
            fetchTable('cases'), fetchTable('stages'), fetchTable('sessions'),
            fetchTable('invoice_items'), fetchTable('case_documents'), fetchTable('profiles'),
            fetchTable('site_finances'),
        ]);

        return {
            clients, admin_tasks, appointments, accounting_entries,
            assistants, invoices, cases, stages, sessions, invoice_items,
            case_documents, profiles, site_finances
        };
    } catch (err: any) {
        throw new Error(`فشل جلب البيانات: ${err.message}`);
    }
};

export const upsertDataToSupabase = async (data: Partial<FlatData>, user: User) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not available.');
    
    const authId = user.id;

    // دالة مساعدة لضمان إرسال الحقول الصحيحة فقط وتجنب مشاكل RLS
    const mapTable = (items: any[] | undefined, mapper: (item: any) => any) => {
        return (items || []).map(item => {
            const mapped = mapper(item);
            return { ...mapped, user_id: authId }; // فرض المعرف الحالي لضمان الصلاحية
        });
    };

    const dataToUpsert = {
        clients: mapTable(data.clients, i => ({ id: i.id, name: i.name, contact_info: i.contactInfo || i.contact_info, updated_at: i.updated_at || new Date() })),
        cases: mapTable(data.cases, i => ({ id: i.id, client_id: i.client_id || i.clientId, subject: i.subject, client_name: i.clientName || i.client_name, opponent_name: i.opponentName || i.opponent_name, fee_agreement: i.feeAgreement || i.fee_agreement, status: i.status, updated_at: i.updated_at || new Date() })),
        stages: mapTable(data.stages, i => ({ id: i.id, case_id: i.case_id || i.caseId, court: i.court, case_number: i.caseNumber || i.case_number, first_session_date: i.firstSessionDate || i.first_session_date, decision_date: i.decisionDate || i.decision_date, decision_number: i.decision_number || i.decision_number, decision_summary: i.decisionSummary || i.decision_summary, decision_notes: i.decisionNotes || i.decision_notes, updated_at: i.updated_at || new Date() })),
        sessions: mapTable(data.sessions, i => ({ id: i.id, stage_id: i.stage_id || i.stageId, date: i.date, court: i.court, case_number: i.caseNumber || i.case_number, client_name: i.clientName || i.client_name, opponent_name: i.opponentName || i.opponent_name, is_postponed: i.is_postponed ?? i.isPostponed, postponement_reason: i.postponementReason || i.postponement_reason, next_session_date: i.nextSessionDate || i.next_session_date, next_postponement_reason: i.nextPostponementReason || i.next_postponement_reason, assignee: i.assignee, updated_at: i.updated_at || new Date() })),
        admin_tasks: mapTable(data.admin_tasks, i => ({ id: i.id, task: i.task, due_date: i.dueDate || i.due_date, completed: i.completed, importance: i.importance, assignee: i.assignee, location: i.location, order_index: i.orderIndex ?? i.order_index, updated_at: i.updated_at || new Date() })),
        appointments: mapTable(data.appointments, i => ({ id: i.id, title: i.title, time: i.time, date: i.date, importance: i.importance, assignee: i.assignee, completed: i.completed, reminder_time_in_minutes: i.reminderTimeInMinutes ?? i.reminder_time_in_minutes, notified: i.notified, updated_at: i.updated_at || new Date() })),
        accounting_entries: mapTable(data.accounting_entries, i => ({ id: i.id, type: i.type, amount: i.amount, date: i.date, description: i.description, client_id: i.clientId || i.client_id, case_id: i.caseId || i.case_id, client_name: i.clientName || i.client_name, updated_at: i.updated_at || new Date() })),
        assistants: (data.assistants || []).map(i => ({ name: i.name, user_id: authId })),
        invoices: mapTable(data.invoices, i => ({ id: i.id, client_id: i.clientId || i.client_id, client_name: i.clientName || i.client_name, case_id: i.caseId || i.case_id, case_subject: i.caseSubject || i.case_subject, issue_date: i.issueDate || i.issue_date, due_date: i.dueDate || i.due_date, tax_rate: i.taxRate ?? i.tax_rate, discount: i.discount, status: i.status, notes: i.notes, updated_at: i.updated_at || new Date() })),
        invoice_items: mapTable(data.invoice_items, i => ({ id: i.id, invoice_id: i.invoice_id || i.invoiceId, description: i.description, amount: i.amount, updated_at: i.updated_at || new Date() })),
        case_documents: mapTable(data.case_documents, i => ({ id: i.id, case_id: i.caseId || i.case_id, name: i.name, type: i.type, size: i.size, added_at: i.addedAt || i.added_at, storage_path: i.storagePath || i.storage_path, updated_at: i.updated_at || new Date() })),
        // Fix: Changed 'i.paymentDate' to 'i.payment_date' to match the 'SiteFinancialEntry' interface.
        site_finances: (data.site_finances || []).map(i => ({ ...i, user_id: authId, payment_date: i.payment_date })),
    };
    
    const upsertTable = async (table: string, records: any[], options: { onConflict?: string } = {}) => {
        if (records.length === 0) return [];
        const { data: res, error } = await supabase.from(table).upsert(records, options).select();
        if (error) {
            console.error(`Upsert error on ${table}:`, error);
            throw new Error(`فشل رفع ${table}: ${error.message}`);
        }
        return res || [];
    };
    
    const results: any = {};
    results.assistants = await upsertTable('assistants', dataToUpsert.assistants, { onConflict: 'user_id,name' });
    results.clients = await upsertTable('clients', dataToUpsert.clients);
    results.cases = await upsertTable('cases', dataToUpsert.cases);
    results.stages = await upsertTable('stages', dataToUpsert.stages);
    results.sessions = await upsertTable('sessions', dataToUpsert.sessions);
    results.invoices = await upsertTable('invoices', dataToUpsert.invoices);
    results.invoice_items = await upsertTable('invoice_items', dataToUpsert.invoice_items);
    results.case_documents = await upsertTable('case_documents', dataToUpsert.case_documents);
    results.admin_tasks = await upsertTable('admin_tasks', dataToUpsert.admin_tasks);
    results.appointments = await upsertTable('appointments', dataToUpsert.appointments);
    results.accounting_entries = await upsertTable('accounting_entries', dataToUpsert.accounting_entries);
    results.site_finances = await upsertTable('site_finances', dataToUpsert.site_finances);
    
    return results;
};

export const transformRemoteToLocal = (remote: any): Partial<FlatData> => {
    if (!remote) return {};
    const san = (r: any) => { if (!r) return r; const { user_id, ...rest } = r; return rest; };
    return {
        clients: remote.clients?.map((r: any) => ({ ...san(r), contactInfo: r.contact_info })),
        cases: remote.cases?.map((r: any) => ({ ...san(r), clientName: r.client_name, opponentName: r.opponent_name, feeAgreement: r.fee_agreement })),
        stages: remote.stages?.map((r: any) => ({ ...san(r), caseNumber: r.case_number, firstSessionDate: r.first_session_date, decisionDate: r.decision_date, decisionNumber: r.decision_number, decisionSummary: r.decision_summary, decisionNotes: r.decision_notes })),
        sessions: remote.sessions?.map((r: any) => ({ ...san(r), caseNumber: r.case_number, clientName: r.client_name, opponentName: r.opponent_name, postponementReason: r.postponement_reason, nextPostponementReason: r.next_postponement_reason, isPostponed: r.is_postponed, nextSessionDate: r.next_session_date })),
        admin_tasks: remote.admin_tasks?.map((r: any) => ({ ...san(r), dueDate: r.due_date, orderIndex: r.order_index })),
        appointments: remote.appointments?.map((r: any) => ({ ...san(r), reminderTimeInMinutes: r.reminder_time_in_minutes })),
        accounting_entries: remote.accounting_entries?.map((r: any) => ({ ...san(r), clientId: r.client_id, caseId: r.case_id, clientName: r.client_name })),
        assistants: remote.assistants?.map((a: any) => ({ name: a.name })),
        invoices: remote.invoices?.map((r: any) => ({ ...san(r), clientId: r.client_id, clientName: r.client_name, caseId: r.case_id, caseSubject: r.case_subject, issue_date: r.issue_date, due_date: r.due_date, taxRate: r.tax_rate })),
        invoice_items: remote.invoice_items?.map(san),
        case_documents: remote.case_documents?.map((r: any) => ({...san(r), userId: r.user_id, caseId: r.case_id, addedAt: r.added_at, storagePath: r.storage_path })),
        profiles: remote.profiles,
        site_finances: remote.site_finances,
    };
};
