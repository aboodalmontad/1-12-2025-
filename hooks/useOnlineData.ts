
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
    if (!supabase) return { success: false, error: 'unconfigured', message: 'Supabase client is not configured.' };
    try { await ensureValidSession(); } catch (err: any) { return { success: false, error: 'auth_error', message: err.message }; }

    const tableChecks: { [key: string]: string } = {
        'profiles': 'id', 'clients': 'id', 'cases': 'id', 'stages': 'id', 'sessions': 'id', 'admin_tasks': 'id',
        'appointments': 'id', 'accounting_entries': 'id', 'assistants': 'name', 'invoices': 'id', 'invoice_items': 'id',
        'case_documents': 'id', 'site_finances': 'id', 'sync_deletions': 'id',
    };
    
    try {
        for (const [table, query] of Object.entries(tableChecks)) {
            const { error } = await supabase.from(table).select(query).limit(1);
            if (error) {
                const code = String(error.code || '');
                const msg = String(error.message || '').toLowerCase();
                if (code === '42P01' || msg.includes('does not exist')) return { success: false, error: 'uninitialized', message: `الجدول ${table} غير موجود.` };
                if (msg.includes('jwt expired')) return { success: false, error: 'auth_error', message: 'انتهت صلاحية الجلسة.' };
            }
        }
        return { success: true, error: null, message: '' };
    } catch (err: any) { return { success: false, error: 'unknown', message: `خطأ في فحص البيانات: ${err.message}` }; }
};

export const fetchDataFromSupabase = async (): Promise<Partial<FlatData>> => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not available.');
    await ensureValidSession();

    const fetchTable = async (table: string) => {
        const { data, error } = await supabase.from(table).select('*');
        if (error) {
            if (error.code === '42501' || error.message.includes('policy')) return [];
            throw error;
        }
        return data || [];
    };

    const [clients, admin_tasks, appointments, accounting_entries, assistants, invoices, cases, stages, sessions, invoice_items, case_documents, profiles, site_finances] = await Promise.all([
        fetchTable('clients'), fetchTable('admin_tasks'), fetchTable('appointments'), fetchTable('accounting_entries'), fetchTable('assistants'), fetchTable('invoices'), fetchTable('cases'), fetchTable('stages'), fetchTable('sessions'), fetchTable('invoice_items'), fetchTable('case_documents'), fetchTable('profiles'), fetchTable('site_finances')
    ]);

    return { clients, admin_tasks, appointments, accounting_entries, assistants, invoices, cases, stages, sessions, invoice_items, case_documents, profiles, site_finances };
};

export const upsertDataToSupabase = async (data: Partial<FlatData>, ownerId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not available.');
    await ensureValidSession();

    const mapItems = (items: any[] | undefined, mapper: (item: any) => any) => (items || []).map(mapper);

    const dataToUpsert = {
        assistants: mapItems(data.assistants, i => ({ ...i, user_id: ownerId })),
        clients: mapItems(data.clients, ({ contactInfo, ...rest }) => ({ ...rest, user_id: ownerId, contact_info: contactInfo })),
        cases: mapItems(data.cases, ({ clientName, opponentName, feeAgreement, ...rest }) => ({ ...rest, user_id: ownerId, client_name: clientName, opponent_name: opponentName, fee_agreement: feeAgreement })),
        stages: mapItems(data.stages, ({ caseNumber, firstSessionDate, decisionDate, decisionNumber, decisionSummary, decisionNotes, ...rest }) => ({ ...rest, user_id: ownerId, case_number: caseNumber, first_session_date: firstSessionDate, decision_date: decisionDate, decision_number: decisionNumber, decision_summary: decisionSummary, decision_notes: decisionNotes })),
        sessions: mapItems(data.sessions, (s: any) => ({ ...s, user_id: ownerId, stage_id: s.stage_id, case_number: s.caseNumber, client_name: s.clientName, opponent_name: s.opponentName, postponement_reason: s.postponementReason, next_postponement_reason: s.nextPostponementReason, is_postponed: s.isPostponed, next_session_date: s.nextSessionDate })),
        invoices: mapItems(data.invoices, ({ clientId, clientName, caseId, caseSubject, issueDate, dueDate, taxRate, ...rest }) => ({ ...rest, user_id: ownerId, client_id: clientId, client_name: clientName, case_id: caseId, case_subject: caseSubject, issue_date: issueDate, due_date: dueDate, tax_rate: taxRate })),
        invoice_items: mapItems(data.invoice_items, i => ({ ...i, user_id: ownerId })),
        case_documents: mapItems(data.case_documents, ({ caseId, userId, addedAt, storagePath, ...rest }) => ({ ...rest, user_id: ownerId, case_id: caseId, added_at: addedAt, storage_path: storagePath })),
        admin_tasks: mapItems(data.admin_tasks, ({ dueDate, orderIndex, ...rest }) => ({ ...rest, user_id: ownerId, due_date: dueDate, order_index: orderIndex })),
        appointments: mapItems(data.appointments, ({ reminderTimeInMinutes, ...rest }) => ({ ...rest, user_id: ownerId, reminder_time_in_minutes: reminderTimeInMinutes })),
        accounting_entries: mapItems(data.accounting_entries, ({ clientId, caseId, clientName, ...rest }) => ({ ...rest, user_id: ownerId, client_id: clientId, case_id: caseId, client_name: clientName })),
        site_finances: mapItems(data.site_finances, ({ payment_date, ...rest }) => ({ ...rest, user_id: ownerId, payment_date })),
    };

    // Batching function to prevent timeouts with large data
    const upsertInBatches = async (table: string, records: any[], options: { onConflict?: string } = {}) => {
        if (!records.length) return;
        const BATCH_SIZE = 200;
        for (let i = 0; i < records.length; i += BATCH_SIZE) {
            const batch = records.slice(i, i + BATCH_SIZE);
            await ensureValidSession(); // Refresh session for each batch
            const { error } = await supabase.from(table).upsert(batch, options);
            if (error) {
                console.error(`Error in table ${table} batch ${i}:`, error);
                throw new Error(`فشل رفع دفعة بيانات ${table}: ${error.message}`);
            }
        }
    };

    // Execute in specific order to satisfy foreign keys
    await upsertInBatches('assistants', dataToUpsert.assistants, { onConflict: 'user_id,name' });
    await upsertInBatches('clients', dataToUpsert.clients);
    await upsertInBatches('cases', dataToUpsert.cases);
    await upsertInBatches('stages', dataToUpsert.stages);
    await upsertInBatches('sessions', dataToUpsert.sessions);
    await upsertInBatches('invoices', dataToUpsert.invoices);
    await upsertInBatches('invoice_items', dataToUpsert.invoice_items);
    await upsertInBatches('case_documents', dataToUpsert.case_documents);
    await upsertInBatches('admin_tasks', dataToUpsert.admin_tasks);
    await upsertInBatches('appointments', dataToUpsert.appointments);
    await upsertInBatches('accounting_entries', dataToUpsert.accounting_entries);
    await upsertInBatches('site_finances', dataToUpsert.site_finances);
    
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
        site_finances: remote.site_finances,
    };
};
