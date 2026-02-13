
import * as React from 'react';
import { Client, AdminTask, Appointment, AccountingEntry, Invoice, InvoiceItem, CaseDocument, Profile, SiteFinancialEntry, SyncDeletion, AppData, DeletedIds, getInitialDeletedIds, Session, Permissions, defaultPermissions, fullPermissions } from '../types';
import { useOnlineStatus } from './useOnlineStatus';
import type { User, RealtimeChannel } from '@supabase/supabase-js';
import { useSync, SyncStatus as SyncStatusType } from './useSync';
import { getSupabaseClient } from '../supabaseClient';
import { isBeforeToday, toInputDateString } from '../utils/dateUtils';
import { openDB, IDBPDatabase } from 'idb';

export const APP_DATA_KEY = 'lawyerBusinessManagementData';
export type SyncStatus = SyncStatusType;
const defaultAssistants = ['أحمد', 'فاطمة', 'سارة', 'بدون تخصيص'];
const DB_NAME = 'LawyerAppData';
const DB_VERSION = 12;
const DATA_STORE_NAME = 'appData';

const getInitialData = (): AppData => ({
    clients: [], adminTasks: [], appointments: [], accountingEntries: [], invoices: [], assistants: [...defaultAssistants], documents: [], profiles: [], siteFinances: [], ignoredDocumentIds: [],
    adminTasksLayout: 'horizontal',
    locationOrder: [],
});

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
        if (!db.objectStoreNames.contains(DATA_STORE_NAME)) db.createObjectStore(DATA_STORE_NAME);
    },
  });
}

const reviveDate = (d: any, fallback?: any) => {
    if (!d) return fallback;
    const date = new Date(d);
    return isNaN(date.getTime()) ? fallback : date;
};

const validateAndFixData = (loadedData: any, isImport: boolean = false, currentUserId?: string | null): AppData => {
    if (!loadedData || typeof loadedData !== 'object') return getInitialData();
    
    const sanitized = loadedData;
    const importUpdateTimestamp = isImport ? new Date() : undefined;

    // Helper to force owner ID and sanitize fields during import/validation
    const applyUserId = (item: any) => {
        const newItem = { ...item };
        if (isImport && currentUserId) {
            newItem.user_id = currentUserId;
        }
        return newItem;
    };

    return {
        clients: (sanitized.clients || []).map((c: any) => {
            const client = applyUserId(c);
            // Ensure snake_case alignment for DB
            const contact_info = client.contact_info || client.contactInfo || '';
            return {
                ...client,
                contactInfo: contact_info,
                contact_info: contact_info, // Double map for safety
                cases: (client.cases || []).map((cs: any) => {
                    const caseItem = applyUserId(cs);
                    const opponent_name = caseItem.opponent_name || caseItem.opponentName || '';
                    const fee_agreement = caseItem.fee_agreement || caseItem.feeAgreement || '';
                    return {
                        ...caseItem,
                        opponentName: opponent_name,
                        feeAgreement: fee_agreement,
                        opponent_name,
                        fee_agreement,
                        stages: (caseItem.stages || []).map((st: any) => {
                            const stage = applyUserId(st);
                            const case_number = stage.case_number || stage.caseNumber || '';
                            const first_session_date = stage.first_session_date || stage.firstSessionDate;
                            const decision_date = stage.decision_date || stage.decisionDate;
                            return {
                                ...stage,
                                caseNumber: case_number,
                                case_number,
                                firstSessionDate: reviveDate(first_session_date, undefined),
                                first_session_date: reviveDate(first_session_date, undefined),
                                decisionDate: reviveDate(decision_date, undefined),
                                decision_date: reviveDate(decision_date, undefined),
                                sessions: (stage.sessions || []).map((s: any) => {
                                    const session = applyUserId(s);
                                    const next_session_date = session.next_session_date || session.nextSessionDate;
                                    return { 
                                        ...session, 
                                        date: reviveDate(session.date, new Date()),
                                        nextSessionDate: reviveDate(next_session_date, undefined),
                                        next_session_date: reviveDate(next_session_date, undefined),
                                        updated_at: reviveDate(session.updated_at, importUpdateTimestamp)
                                    };
                                }),
                                updated_at: reviveDate(stage.updated_at, importUpdateTimestamp)
                            };
                        }),
                        updated_at: reviveDate(caseItem.updated_at, importUpdateTimestamp)
                    };
                }),
                updated_at: reviveDate(client.updated_at, importUpdateTimestamp)
            };
        }),
        adminTasks: (sanitized.adminTasks || sanitized.admin_tasks || []).map((t: any) => {
            const task = applyUserId(t);
            return { 
                ...task, 
                dueDate: reviveDate(task.dueDate || task.due_date, new Date()),
                updated_at: reviveDate(task.updated_at, importUpdateTimestamp)
            };
        }),
        appointments: (sanitized.appointments || []).map((a: any) => {
            const appt = applyUserId(a);
            return { 
                ...appt, 
                date: reviveDate(appt.date, new Date()),
                updated_at: reviveDate(appt.updated_at, importUpdateTimestamp)
            };
        }),
        accountingEntries: (sanitized.accountingEntries || sanitized.accounting_entries || []).map((e: any) => {
            const entry = applyUserId(e);
            return { 
                ...entry, 
                date: reviveDate(entry.date, new Date()),
                updated_at: reviveDate(entry.updated_at, importUpdateTimestamp)
            };
        }),
        invoices: (sanitized.invoices || []).map((i: any) => {
            const inv = applyUserId(i);
            return { 
                ...inv, 
                issueDate: reviveDate(inv.issueDate || inv.issue_date, new Date()), 
                dueDate: reviveDate(inv.dueDate || inv.due_date, new Date()),
                items: (inv.items || []).map((item: any) => applyUserId(item)),
                updated_at: reviveDate(inv.updated_at, importUpdateTimestamp)
            };
        }),
        assistants: Array.isArray(sanitized.assistants) 
            ? sanitized.assistants.map((a: any) => {
                if (typeof a === 'string') return a;
                if (a && typeof a === 'object' && 'name' in a) return String(a.name);
                return String(a);
              }).filter(Boolean)
            : [...defaultAssistants],
        documents: (sanitized.documents || sanitized.case_documents || []).map((d: any) => {
            const doc = applyUserId(d);
            return { 
                ...doc, 
                addedAt: reviveDate(doc.addedAt || doc.added_at, new Date()),
                updated_at: reviveDate(doc.updated_at, importUpdateTimestamp)
            };
        }),
        profiles: (sanitized.profiles || []),
        siteFinances: (sanitized.siteFinances || sanitized.site_finances || []).map((sf: any) => {
            const fin = applyUserId(sf);
            return {
                ...fin,
                payment_date: reviveDate(fin.payment_date || fin.paymentDate, new Date()),
                updated_at: reviveDate(fin.updated_at, importUpdateTimestamp)
            };
        }),
        ignoredDocumentIds: sanitized.ignoredDocumentIds || [],
        adminTasksLayout: sanitized.adminTasksLayout || 'horizontal',
        locationOrder: Array.isArray(sanitized.locationOrder) ? sanitized.locationOrder : [],
    };
};

export const useSupabaseData = (user: User | null, isAuthLoading: boolean) => {
    const [data, setData] = React.useState<AppData>(getInitialData);
    const [syncStatus, setSyncStatus] = React.useState<SyncStatus>('synced'); 
    const [lastSyncError, setLastSyncError] = React.useState<string | null>(null);
    const [isDataLoading, setIsDataLoading] = React.useState(true);
    const [effectiveUserId, setEffectiveUserId] = React.useState<string | null>(null);
    const [activeProfile, setActiveProfile] = React.useState<Profile | null>(null);
    const [showUnpostponedSessionsModal, setShowUnpostponedSessionsModal] = React.useState(false);
    const [isDirty, setIsDirty] = React.useState(false);
    const isOnline = useOnlineStatus();

    const [triggeredAlerts, setTriggeredAlerts] = React.useState<Appointment[]>([]);
    const [realtimeAlerts, setRealtimeAlerts] = React.useState<any[]>([]);
    const [userApprovalAlerts, setUserApprovalAlerts] = React.useState<any[]>([]);

    React.useEffect(() => {
        if (!user) {
            setData(getInitialData());
            setEffectiveUserId(null);
            setActiveProfile(null);
            setIsDataLoading(false);
            return;
        }

        const resolveIdentity = async () => {
            setIsDataLoading(true);
            let ownerId = user.id;

            try {
                if (isOnline) {
                    const supabase = getSupabaseClient();
                    if (supabase) {
                        const profilePromise = supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
                        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
                        
                        try {
                            const result: any = await Promise.race([profilePromise, timeoutPromise]);
                            if (result.data) {
                                setActiveProfile(result.data);
                                if (result.data.lawyer_id) ownerId = result.data.lawyer_id;
                            }
                        } catch (e) {
                            console.warn("Profile check timed out or failed, proceeding with local ID.");
                        }
                    }
                }
            } catch (err) {
                console.warn("Identity check failed:", err);
            } finally {
                setEffectiveUserId(ownerId);
                const db = await getDb();
                const stored = await db.get(DATA_STORE_NAME, ownerId);
                if (stored) setData(validateAndFixData(stored, false));
                setIsDataLoading(false);
                setSyncStatus('synced'); 
            }
        };

        resolveIdentity();
    }, [user?.id, isOnline]);

    const permissions = React.useMemo((): Permissions => {
        if (!user || !effectiveUserId) return defaultPermissions;
        if (user.id === effectiveUserId) return fullPermissions;
        const myProfile = activeProfile || (data.profiles || []).find(p => p.id === user.id);
        return { ...defaultPermissions, ...(myProfile?.permissions || {}) };
    }, [user?.id, effectiveUserId, data.profiles, activeProfile]);

    const updateData = React.useCallback((updater: React.SetStateAction<AppData>) => {
        if (!effectiveUserId) return;
        setIsDirty(true);
        setData(curr => {
            const newData = typeof updater === 'function' ? (updater as any)(curr) : updater;
            const validated = validateAndFixData(newData, false, effectiveUserId);
            getDb().then(db => db.put(DATA_STORE_NAME, validated, effectiveUserId));
            return validated;
        });
    }, [effectiveUserId]);

    const setFullData = React.useCallback((rawImportedData: any) => {
        if (!effectiveUserId) return;
        const validatedData = validateAndFixData(rawImportedData, true, effectiveUserId);
        setData(validatedData);
        setIsDirty(true); 
        getDb().then(db => db.put(DATA_STORE_NAME, validatedData, effectiveUserId));
    }, [effectiveUserId]);

    const handleDataSynced = React.useCallback(async (merged: AppData) => {
        if (!effectiveUserId) return;
        const db = await getDb();
        const validated = validateAndFixData(merged, false, effectiveUserId);
        await db.put(DATA_STORE_NAME, validated, effectiveUserId);
        setData(validated);
        setIsDirty(false); 
    }, [effectiveUserId]);

    const getDocumentFile = React.useCallback(async (docId: string): Promise<File | null> => {
        return null; 
    }, []);

    const addDocuments = React.useCallback(async (caseId: string, files: FileList) => {
        const newDocs: CaseDocument[] = Array.from(files).map(file => ({
            id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            caseId,
            userId: effectiveUserId || '',
            name: file.name,
            type: file.type,
            size: file.size,
            addedAt: new Date(),
            localState: 'pending_upload',
            updated_at: new Date()
        }));
        updateData(prev => ({ ...prev, documents: [...(prev.documents || []), ...newDocs] }));
    }, [effectiveUserId, updateData]);

    const deleteDocument = React.useCallback(async (doc: CaseDocument) => {
        updateData(prev => ({ ...prev, documents: (prev.documents || []).filter(d => d.id !== doc.id) }));
    }, [updateData]);

    const { manualSync, fetchAndRefresh } = useSync({
        user: user,
        ownerId: effectiveUserId,
        localData: data,
        deletedIds: getInitialDeletedIds(),
        onDataSynced: handleDataSynced,
        onDeletionsSynced: () => {},
        onSyncStatusChange: (s, e) => { 
            setSyncStatus(s); 
            setLastSyncError(e); 
        },
        isOnline, isAuthLoading, syncStatus, getDocumentFile
    });

    const postponeSession = React.useCallback((sessionId: string, newDate: Date, newReason: string) => {
        updateData(prev => ({
            ...prev,
            clients: (prev.clients ?? []).map(client => ({
                ...client,
                updated_at: new Date(),
                cases: (client.cases ?? []).map(caseItem => ({
                    ...caseItem,
                    updated_at: new Date(),
                    stages: (caseItem.stages ?? []).map(stage => {
                        const sessions = stage.sessions ?? [];
                        const sessionIdx = sessions.findIndex(s => s.id === sessionId);
                        if (sessionIdx === -1) return stage;
                        const oldSession = sessions[sessionIdx];
                        const updatedOldSession: Session = { ...oldSession, isPostponed: true, nextSessionDate: newDate, nextPostponementReason: newReason, updated_at: new Date() };
                        const newSession: Session = { id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, court: oldSession.court, caseNumber: oldSession.caseNumber, clientName: oldSession.clientName, opponentName: oldSession.opponentName, date: newDate, isPostponed: false, postponementReason: newReason, assignee: oldSession.assignee, updated_at: new Date() };
                        const newSessionsList = [...sessions];
                        newSessionsList[sessionIdx] = updatedOldSession;
                        newSessionsList.push(newSession);
                        return { ...stage, sessions: newSessionsList, updated_at: new Date() };
                    })
                }))
            }))
        }));
    }, [updateData]);

    const deleteItem = (key: keyof AppData, id: string) => {
        updateData(prev => ({ ...prev, [key]: (prev[key] as any[] ?? []).filter((i: any) => i.id !== id) }));
    };

    return {
        ...data,
        syncStatus, manualSync, isDataLoading, fetchAndRefresh,
        effectiveUserId, activeProfile, permissions, isDirty,
        triggeredAlerts, realtimeAlerts, userApprovalAlerts,
        dismissAlert: (id: string) => setTriggeredAlerts(prev => prev.filter(a => a.id !== id)),
        dismissRealtimeAlert: (id: number) => setRealtimeAlerts(prev => prev.filter(a => a.id !== id)),
        dismissUserApprovalAlert: (id: number) => setUserApprovalAlerts(prev => prev.filter(a => a.id !== id)),
        allSessions: (data.clients ?? []).flatMap(c => (c.cases ?? []).flatMap(cs => (cs.stages ?? []).flatMap(st => (st.sessions ?? []).map(s => ({...s, stageId: st.id, stageDecisionDate: st.decisionDate, user_id: (s as any).user_id || (st as any).user_id}))))),
        unpostponedSessions: (data.clients ?? []).flatMap(c => (c.cases ?? []).flatMap(cs => (cs.stages ?? []).flatMap(st => (st.sessions ?? []).map(s => ({...s, stageId: st.id, stageDecisionDate: st.decisionDate}))))).filter(s => isBeforeToday(s.date) && !s.isPostponed && !s.stageDecisionDate),
        showUnpostponedSessionsModal, setShowUnpostponedSessionsModal,
        postponeSession, setFullData,
        setClients: (u: any) => updateData(p => ({ ...p, clients: u(p.clients ?? []) })),
        setProfiles: (u: any) => updateData(p => ({ ...p, profiles: u(p.profiles ?? []) })),
        setAdminTasks: (u: any) => updateData(p => ({ ...p, adminTasks: u(p.adminTasks ?? []) })),
        setAppointments: (u: any) => updateData(p => ({ ...p, appointments: u(p.appointments ?? []) })),
        setAccountingEntries: (u: any) => updateData(p => ({ ...p, accountingEntries: u(p.accountingEntries ?? []) })),
        setInvoices: (u: any) => updateData(p => ({ ...p, invoices: u(p.invoices ?? []) })),
        setAssistants: (u: any) => updateData(p => ({ ...p, assistants: u(p.assistants ?? [...defaultAssistants]) })),
        setSiteFinances: (u: any) => updateData(p => ({ ...p, siteFinances: u(p.siteFinances ?? []) })),
        deleteAdminTask: (id: string) => deleteItem('adminTasks', id),
        deleteAppointment: (id: string) => deleteItem('appointments', id),
        deleteAccountingEntry: (id: string) => deleteItem('accountingEntries', id),
        deleteInvoice: (id: string) => deleteItem('invoices', id),
        deleteAssistant: (name: string) => updateData(prev => ({ ...prev, assistants: (prev.assistants ?? []).filter(a => (typeof a === 'string' ? a : (a as any).name) !== name) })),
        setAdminTasksLayout: (layout: 'horizontal' | 'vertical') => updateData(p => ({ ...p, adminTasksLayout: layout })), 
        setLocationOrder: (order: string[]) => updateData(p => ({ ...p, locationOrder: order })),
        isAutoSyncEnabled: true,
        setAutoSyncEnabled: (enabled: boolean) => {},
        isAutoBackupEnabled: true,
        setAutoBackupEnabled: (enabled: boolean) => {},
        backupCloudData: async () => {
            const supabase = getSupabaseClient();
            if (!supabase) return;
            const { fetchDataFromSupabase } = await import('./useOnlineData');
            const cloudData = await fetchDataFromSupabase();
            const dataStr = JSON.stringify(cloudData);
            const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', `lawyer_cloud_backup_${new Date().toISOString().split('T')[0]}.json`);
            linkElement.click();
        },
        restoreCloudData: async (file: File) => {
            const supabase = getSupabaseClient();
            if (!supabase || !effectiveUserId) return;
            const text = await file.text();
            const imported = JSON.parse(text);
            const { upsertDataToSupabase } = await import('./useOnlineData');
            await upsertDataToSupabase(imported, effectiveUserId);
            await fetchAndRefresh();
        },
        getDocumentFile, addDocuments, deleteDocument,
        exportData: () => {
             const dataStr = JSON.stringify(data);
             const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
             const linkElement = document.createElement('a');
             linkElement.setAttribute('href', dataUri);
             linkElement.setAttribute('download', `lawyer_backup_${new Date().toISOString().split('T')[0]}.json`);
             linkElement.click();
             return true;
        }
    } as any;
};
