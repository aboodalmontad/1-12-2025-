
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

/**
 * Ensures the Supabase session is valid and the JWT is fresh.
 * @returns The current user if session is valid.
 * @throws Error if session is missing or expired.
 */
const ensureValidSession = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client is not configured.');
    
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
        console.error("Session check failed:", error);
        throw new Error('انتهت صلاحية الجلسة (JWT expired). يرجى إعادة تسجيل الدخول.');
    }
    
    return session.user;
};

export const checkSupabaseSchema = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
        return { success: false, error: 'unconfigured', message: 'Supabase client is not configured.' };
    }

    try {
        // Ensure session is fresh before checking schema to avoid JWT errors
        await ensureValidSession();
    } catch (err: any) {
        return { success: false, error: 'auth_error', message: err.message };
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
                    return { success: false, error: 'uninitialized', message: `الجدول ${table} غير موجود. يرجى تهيئة قاعدة البيانات عبر تشغيل سكربت SQL.` };
                }
                
                if (code === '42501' || msg.includes('policy') || msg.includes('permission denied')) {
                    console.warn(`Table ${table} exists but access is restricted by RLS: ${error.message}`);
                    continue; 
                }

                if (msg.includes('jwt expired')) {
                    return { success: false, error: 'auth_error', message: 'انتهت صلاحية الجلسة. يرجى إعادة تحميل الصفحة.' };
                }
                
                console.error(`Check encountered error for table ${table}:`, error);
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

    // Force a session refresh before starting parallel fetches
    await ensureValidSession();

    const fetchTable = async (table: string) => {
        const { data, error } = await supabase.from(table).select('*');
        if (error) {
            console.error(`Error fetching ${table}:`, error.message);
            if (error.message.includes('JWT expired')) {
                throw new Error(`انتهت صلاحية الجلسة عند جلب ${table}.`);
            }
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
            fetchTable('clients'),
            fetchTable('admin_tasks'),
            fetchTable('appointments'),
            fetchTable('accounting_entries'),
            fetchTable('assistants'),
            fetchTable('invoices'),
            fetchTable('cases'),
            fetchTable('stages'),
            fetchTable('sessions'),
            fetchTable('invoice_items'),
            fetchTable('case_documents'),
            fetchTable('profiles'),
            fetchTable('site_finances'),
        ]);

        return {
            clients, admin_tasks, appointments, accounting_entries,
            assistants, invoices, cases, stages, sessions, invoice_items,
            case_documents, profiles, site_finances
        };
    } catch (err: any) {
        throw new Error(`فشل جلب البيانات من السحابة: ${err.message}`);
    }
};

export const fetchDeletionsFromSupabase = async (): Promise<SyncDeletion[]> => {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    
    try {
        await ensureValidSession();
    } catch (e) {
        return [];
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    try {
        const { data, error } = await supabase.from('sync_deletions').select('*').gte('deleted_at', thirtyDaysAgo.toISOString());
        if (error) return []; 
        return data || [];
    } catch (err: any) {
        return []; 
    }
};

export const deleteDataFromSupabase = async (deletions: Partial<FlatData>, ownerId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not available.');

    await ensureValidSession();

    const deletionOrder: (keyof FlatData)[] = [
        'case_documents', 'invoice_items', 'sessions', 'stages', 'cases', 'invoices', 
        'admin_tasks', 'appointments', 'accounting_entries', 'assistants', 'clients',
        'site_finances', 'profiles'
    ];

    for (const table of deletionOrder) {
        const itemsToDelete = (deletions as any)[table];
        if (itemsToDelete && itemsToDelete.length > 0) {
            const primaryKeyColumn = table === 'assistants' ? 'name' : 'id';
            const ids = itemsToDelete.map((i: any) => i[primaryKeyColumn]);
            
            try {
                if (table !== 'profiles') {
                    const deletionsLog = ids.map((id: string) => ({ table_name: table, record_id: id, user_id: ownerId }));
                    await supabase.from('sync_deletions').insert(deletionsLog).catch(() => {});
                }
                const { error } = await supabase.from(table).delete().in(primaryKeyColumn, ids);
                if (error && error.code !== '42501') throw error; 
            } catch (e) {
                console.error(`Deletion failed for ${table}:`, e);
            }
        }
    }
};

export const upsertDataToSupabase = async (data: Partial<FlatData>, ownerId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not available.');
    
    // Refresh session before upsert
    await ensureValidSession();

    const dataToUpsert = {
        clients: data.clients?.map(({ contactInfo, ...rest }) => ({ ...rest, user_id: ownerId, contact_info: contactInfo })),
        cases: data.cases?.map(({ clientName, opponentName, feeAgreement, ...rest }) => ({ ...rest, user_id: ownerId, client_name: clientName, opponent_name: opponentName, fee_agreement: feeAgreement })),
        stages: data.stages?.map(({ caseNumber, firstSessionDate, decisionDate, decisionNumber, decisionSummary, decisionNotes, ...rest }) => ({ ...rest, user_id: ownerId, case_number: caseNumber, first_session_date: firstSessionDate, decision_date: decisionDate, decision_number: decisionNumber, decision_summary: decisionSummary, decision_notes: decisionNotes })),
        sessions: data.sessions?.map((s: any) => ({ ...s, user_id: ownerId, stage_id: s.stage_id, case_number: s.caseNumber, client_name: s.clientName, opponent_name: s.opponentName, postponement_reason: s.postponementReason, next_postponement_reason: s.nextPostponementReason, is_postponed: s.isPostponed, next_session_date: s.nextSessionDate })),
        admin_tasks: data.admin_tasks?.map(({ dueDate, orderIndex, ...rest }) => ({ ...rest, user_id: ownerId, due_date: dueDate, order_index: orderIndex })),
        appointments: data.appointments?.map(({ reminderTimeInMinutes, ...rest }) => ({ ...rest, user_id: ownerId, reminder_time_in_minutes: reminderTimeInMinutes })),
        accounting_entries: data.accounting_entries?.map(({ clientId, caseId, clientName, ...rest }) => ({ ...rest, user_id: ownerId, client_id: clientId, case_id: caseId, client_name: clientName })),
        assistants: data.assistants?.map(item => ({ ...item, user_id: ownerId })),
        invoices: data.invoices?.map(({ clientId, clientName, caseId, caseSubject, issueDate, dueDate, taxRate, ...rest }) => ({ ...rest, user_id: ownerId, client_id: clientId, client_name: clientName, case_id: caseId, case_subject: caseSubject, issue_date: issueDate, due_date: dueDate, tax_rate: taxRate })),
        invoice_items: data.invoice_items?.map(({ ...item }) => ({ ...item, user_id: ownerId })),
        case_documents: data.case_documents?.map(({ caseId, userId: localUserId, addedAt, storagePath, localState, ...rest }) => ({ ...rest, user_id: ownerId, case_id: caseId, added_at: addedAt, storage_path: storagePath })),
        site_finances: data.site_finances?.map(({ user_id: local_uid, payment_date, ...rest }) => ({ ...rest, user_id: ownerId, payment_date })),
    };
    
    const upsertTable = async (table: string, records: any[] | undefined, options: { onConflict?: string } = {}) => {
        if (!records || records.length === 0) return [];
        const { data: responseData, error } = await supabase.from(table).upsert(records, options).select();
        if (error) {
            console.error(`Error upserting to ${table}:`, error);
            if (error.message.includes('JWT expired')) {
                throw new Error(`انتهت صلاحية الجلسة عند رفع بيانات ${table}.`);
            }
            const extra = error.code === '42501' ? ' (انتهاك سياسة RLS - يرجى تشغيل سكربت v2.2 في ConfigurationModal)' : '';
            throw new Error(`خطأ في رفع بيانات ${table}: ${error.message}${extra}`);
        }
        return responseData || [];
    };
    
    const results: Partial<Record<keyof FlatData, any[]>> = {};

    results.assistants = await upsertTable('assistants', dataToUpsert.assistants, { onConflict: 'user_id,name' });
    results.clients = await upsertTable('clients', dataToUpsert.clients);
    results.cases = await upsertTable('cases', dataToUpsert.cases);
    results.stages = await upsertTable('stages', dataToUpsert.stages);
    results.sessions = await upsertTable('sessions', dataToUpsert.sessions);
    results.invoices = await upsertTable('invoices', dataToUpsert.invoices);
    results.invoice_items = await upsertTable('invoice_items', dataToUpsert.invoice_items);
    results.case_documents = await upsertTable('case_documents', dataToUpsert.case_documents);
    
    const [adminTasks, appointments, accountingEntries, site_finances] = await Promise.all([
        upsertTable('admin_tasks', dataToUpsert.admin_tasks),
        upsertTable('appointments', dataToUpsert.appointments),
        upsertTable('accounting_entries', dataToUpsert.accounting_entries),
        upsertTable('site_finances', dataToUpsert.site_finances),
    ]);
    results.admin_tasks = adminTasks;
    results.appointments = appointments;
    results.accounting_entries = accountingEntries;
    results.site_finances = site_finances;
    
    return results;
};

export const transformRemoteToLocal = (remote: any): Partial<FlatData> => {
    if (!remote) return {};
    return {
        clients: remote.clients?.map(({ contact_info, ...r }: any) => ({ ...r, contactInfo: contact_info })),
        cases: remote.cases?.map(({ client_name, opponent_name, fee_agreement, ...r }: any) => ({ ...r, clientName: client_name, opponentName: opponent_name, feeAgreement: fee_agreement })),
        stages: remote.stages?.map(({ case_number, first_session_date, decision_date, decision_number, decision_summary, decision_notes, ...r }: any) => ({ ...r, caseNumber: case_number, firstSessionDate: first_session_date, decisionDate: decision_date, decisionNumber: decision_number, decisionSummary: decision_summary, decisionNotes: decision_notes })),
        sessions: remote.sessions?.map(({ case_number, client_name, opponent_name, postponement_reason, next_postponement_reason, is_postponed, next_session_date, ...r }: any) => ({ ...r, caseNumber: case_number, clientName: client_name, opponentName: opponent_name, postponementReason: postponement_reason, nextPostponementReason: next_postponement_reason, isPostponed: is_postponed, nextSessionDate: next_session_date })),
        admin_tasks: remote.admin_tasks?.map(({ due_date, order_index, ...r }: any) => ({ ...r, dueDate: due_date, orderIndex: order_index })),
        appointments: remote.appointments?.map(({ reminder_time_in_minutes, ...r }: any) => ({ ...r, reminderTimeInMinutes: reminder_time_in_minutes })),
        accounting_entries: remote.accounting_entries?.map(({ client_id, case_id, client_name, ...r }: any) => ({ ...r, clientId: client_id, caseId: case_id, clientName: client_name })),
        assistants: remote.assistants?.map((a: any) => ({ name: a.name })),
        invoices: remote.invoices?.map(({ client_id, client_name, case_id, case_subject, issue_date, due_date, tax_rate, ...r }: any) => ({ ...r, clientId: client_id, clientName: client_name, caseId: case_id, caseSubject: case_subject, issue_date: issue_date, dueDate: due_date, taxRate: tax_rate })),
        invoice_items: remote.invoice_items,
        case_documents: remote.case_documents?.map(({ user_id, case_id, added_at, storage_path, ...r }: any) => ({...r, userId: user_id, caseId: case_id, addedAt: added_at, storagePath: storage_path })),
        profiles: remote.profiles,
        site_finances: remote.site_finances,
    };
};
