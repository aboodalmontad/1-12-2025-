
export interface Permissions {
    // General (عام)
    can_view_agenda: boolean;

    // Clients (الموكلين)
    can_view_clients: boolean;
    can_add_client: boolean;
    can_edit_client: boolean;
    can_delete_client: boolean;

    // Cases (القضايا)
    can_view_cases: boolean;
    can_add_case: boolean;
    can_edit_case: boolean;
    can_delete_case: boolean;

    // Sessions (الجلسات)
    can_view_sessions: boolean;
    can_add_session: boolean;
    can_edit_session: boolean;
    can_delete_session: boolean;
    can_postpone_session: boolean;
    can_decide_session: boolean;

    // Documents (الوثائق)
    can_view_documents: boolean;
    can_add_document: boolean;
    can_delete_document: boolean;

    // Finance (المالية)
    can_view_finance: boolean;
    can_add_financial_entry: boolean;
    can_delete_financial_entry: boolean;
    can_manage_invoices: boolean;

    // Admin Tasks (المهام الإدارية)
    can_view_admin_tasks: boolean;
    can_add_admin_task: boolean;
    can_edit_admin_task: boolean;
    can_delete_admin_task: boolean;

    // Reports (التقارير)
    can_view_reports: boolean;
}

export const defaultPermissions: Permissions = {
    can_view_agenda: true,
    can_view_clients: true,
    can_add_client: false,
    can_edit_client: false,
    can_delete_client: false,
    can_view_cases: true,
    can_add_case: false,
    can_edit_case: false,
    can_delete_case: false,
    can_view_sessions: true,
    can_add_session: true,
    can_edit_session: false,
    can_delete_session: false,
    can_postpone_session: true,
    can_decide_session: false,
    can_view_documents: true,
    can_add_document: true,
    can_delete_document: true,
    can_view_finance: false,
    can_add_financial_entry: false,
    can_delete_financial_entry: false,
    can_manage_invoices: false,
    can_view_admin_tasks: true,
    can_add_admin_task: true,
    can_edit_admin_task: true,
    can_delete_admin_task: false,
    can_view_reports: false,
};

export const fullPermissions: Permissions = {
    can_view_agenda: true,
    can_view_clients: true,
    can_add_client: true,
    can_edit_client: true,
    can_delete_client: true,
    can_view_cases: true,
    can_add_case: true,
    can_edit_case: true,
    can_delete_case: true,
    can_view_sessions: true,
    can_add_session: true,
    can_edit_session: true,
    can_delete_session: true,
    can_postpone_session: true,
    can_decide_session: true,
    can_view_documents: true,
    can_add_document: true,
    can_delete_document: true,
    can_view_finance: true,
    can_add_financial_entry: true,
    can_delete_financial_entry: true,
    can_manage_invoices: true,
    can_view_admin_tasks: true,
    can_add_admin_task: true,
    can_edit_admin_task: true,
    can_delete_admin_task: true,
    can_view_reports: true,
};

export interface Profile {
  id: string; // uuid
  full_name: string;
  mobile_number: string;
  is_approved: boolean;
  is_active: boolean;
  mobile_verified?: boolean; 
  otp_code?: string | null; 
  otp_expires_at?: string | null; 
  subscription_start_date: string | null; // ISO string
  subscription_end_date: string | null; // ISO string
  role: 'user' | 'admin';
  lawyer_id?: string | null;
  permissions?: Permissions;
  created_at?: string; // ISO string
  updated_at?: Date;
}

/**
 * Interface for judicial sessions.
 */
export interface Session {
    id: string;
    court: string;
    caseNumber: string;
    date: Date;
    clientName: string;
    opponentName: string;
    isPostponed: boolean;
    postponementReason?: string;
    nextSessionDate?: Date;
    nextPostponementReason?: string;
    assignee: string;
    stageId?: string;
    stageDecisionDate?: string | Date;
    user_id?: string;
    updated_at?: Date;
}

/**
 * Interface for litigation stages.
 */
export interface Stage {
    id: string;
    court: string;
    caseNumber: string;
    firstSessionDate?: Date;
    sessions: Session[];
    decisionDate?: Date;
    decisionNumber?: string;
    decisionSummary?: string;
    decisionNotes?: string;
    updated_at?: Date;
}

/**
 * Interface for legal cases.
 */
export interface Case {
    id: string;
    subject: string;
    clientName: string;
    opponentName: string;
    stages: Stage[];
    feeAgreement: string;
    status: 'active' | 'closed' | 'on_hold';
    updated_at?: Date;
}

/**
 * Interface for legal clients.
 */
export interface Client {
    id: string;
    name: string;
    contactInfo: string;
    cases: Case[];
    user_id?: string;
    updated_at?: Date;
}

/**
 * Interface for administrative tasks.
 */
export interface AdminTask {
    id: string;
    task: string;
    dueDate: Date;
    completed: boolean;
    importance: 'normal' | 'important' | 'urgent';
    assignee: string;
    location?: string;
    orderIndex?: number;
    updated_at?: Date;
}

/**
 * Interface for office appointments.
 */
export interface Appointment {
    id: string;
    title: string;
    time: string;
    date: Date;
    importance: 'normal' | 'important' | 'urgent';
    assignee: string;
    completed: boolean;
    reminderTimeInMinutes: number;
    notified: boolean;
    updated_at?: Date;
}

/**
 * Interface for individual accounting entries.
 */
export interface AccountingEntry {
    id: string;
    type: 'income' | 'expense';
    amount: number;
    date: Date;
    description: string;
    clientId: string;
    caseId: string;
    clientName: string;
    updated_at?: Date;
}

/**
 * Interface for items within an invoice.
 */
export interface InvoiceItem {
    id: string;
    description: string;
    amount: number;
    invoice_id?: string;
    updated_at?: Date;
}

/**
 * Interface for client invoices.
 */
export interface Invoice {
    id: string;
    clientId: string;
    clientName: string;
    caseId?: string;
    caseSubject?: string;
    issueDate: Date;
    dueDate: Date;
    items: InvoiceItem[];
    taxRate: number;
    discount: number;
    status: 'draft' | 'sent' | 'paid' | 'overdue';
    notes?: string;
    updated_at?: Date;
}

/**
 * Interface for case-related documents and attachments.
 */
export interface CaseDocument {
    id: string;
    caseId: string;
    userId: string;
    name: string;
    type: string;
    size: number;
    addedAt: Date;
    storagePath?: string;
    localState: 'synced' | 'pending_upload' | 'pending_download' | 'cloud_only' | 'downloading' | 'error';
    updated_at?: Date;
}

/**
 * Interface for platform-wide financial entries (site maintenance/subscription).
 */
export interface SiteFinancialEntry {
    id: number;
    user_id?: string | null;
    type: 'income' | 'expense';
    payment_date: Date | string;
    amount: number;
    description?: string;
    payment_method?: string;
    category?: string;
    profile_full_name?: string;
    updated_at?: Date;
}

/**
 * Root object for application data.
 */
export interface AppData {
    clients: Client[];
    adminTasks: AdminTask[];
    appointments: Appointment[];
    accountingEntries: AccountingEntry[];
    invoices: Invoice[];
    assistants: string[];
    documents: CaseDocument[];
    profiles: Profile[];
    siteFinances: SiteFinancialEntry[];
    ignoredDocumentIds: string[];
}

/**
 * Interface for synchronization deletion logs.
 */
export interface SyncDeletion {
    id: number;
    table_name: string;
    record_id: string;
    user_id: string;
    deleted_at: string;
}

/**
 * Interface for tracking deleted IDs across all tables.
 */
export interface DeletedIds {
    [key: string]: string[];
}

/**
 * Helper function to generate an initial empty set of deleted IDs.
 */
export const getInitialDeletedIds = (): DeletedIds => ({
    clients: [],
    cases: [],
    stages: [],
    sessions: [],
    admin_tasks: [],
    appointments: [],
    accounting_entries: [],
    assistants: [],
    invoices: [],
    invoice_items: [],
    case_documents: [],
    site_finances: [],
});
