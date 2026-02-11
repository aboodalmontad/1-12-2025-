
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

const validateAndFixData = (loadedData: any): AppData => {
    if (!loadedData || typeof loadedData !== 'object') return getInitialData();
    
    const reviveDate = (d: any) => {
        if (!d) return new Date();
        const date = new Date(d);
        return isNaN(date.getTime()) ? new Date() : date;
    };

    const sanitize = (item: any) => {
        if (!item || typeof item !== 'object') return item;
        const { user_id, ...rest } = item;
        return rest;
    };

    const rawAssistants = Array.isArray(loadedData.assistants) ? loadedData.assistants : [...defaultAssistants];
    const cleanAssistants = rawAssistants.map((a: any) => {
        if (typeof a === 'string') return a;
        if (a && typeof a === 'object' && a.name) return a.name;
        return 'مساعد غير معروف';
    });

    return {
        clients: (loadedData.clients || []).map((c: any) => {
            const cleanClient = sanitize(c);
            return {
                ...cleanClient,
                cases: (c.cases || []).map((cs: any) => {
                    const cleanCase = sanitize(cs);
                    return {
                        ...cleanCase,
                        stages: (cs.stages || []).map((st: any) => {
                            const cleanStage = sanitize(st);
                            return {
                                ...cleanStage,
                                sessions: (st.sessions || []).map((s: any) => ({ 
                                    ...sanitize(s), 
                                    date: reviveDate(s.date), 
                                    nextSessionDate: s.nextSessionDate ? reviveDate(s.nextSessionDate) : undefined,
                                    updated_at: s.updated_at ? reviveDate(s.updated_at) : undefined
                                })),
                                decisionDate: st.decisionDate ? reviveDate(st.decisionDate) : undefined,
                                updated_at: st.updated_at ? reviveDate(st.updated_at) : undefined
                            };
                        }),
                        updated_at: cs.updated_at ? reviveDate(cs.updated_at) : undefined
                    };
                }),
                updated_at: c.updated_at ? reviveDate(c.updated_at) : undefined
            };
        }),
        adminTasks: (loadedData.adminTasks || []).map((t: any) => ({ 
            ...sanitize(t), 
            dueDate: reviveDate(t.dueDate),
            updated_at: t.updated_at ? reviveDate(t.updated_at) : undefined
        })),
        appointments: (loadedData.appointments || []).map((a: any) => ({ 
            ...sanitize(a), 
            date: reviveDate(a.date),
            updated_at: a.updated_at ? reviveDate(a.updated_at) : undefined
        })),
        accountingEntries: (loadedData.accountingEntries || []).map((e: any) => ({ 
            ...sanitize(e), 
            date: reviveDate(e.date),
            updated_at: e.updated_at ? reviveDate(e.updated_at) : undefined
        })),
        invoices: (loadedData.invoices || []).map((i: any) => ({ 
            ...sanitize(i), 
            issueDate: reviveDate(i.issueDate), 
            dueDate: reviveDate(i.dueDate),
            items: (i.items || []).map(sanitize),
            updated_at: i.updated_at ? reviveDate(i.updated_at) : undefined
        })),
        assistants: cleanAssistants,
        documents: (loadedData.documents || []).map((d: any) => ({ 
            ...sanitize(d), 
            addedAt: reviveDate(d.addedAt),
            updated_at: d.updated_at ? reviveDate(d.updated_at) : undefined
        })),
        profiles: (loadedData.profiles || []),
        siteFinances: (loadedData.siteFinances || []).map((sf: any) => ({
            ...sf,
            payment_date: sf.payment_date ? reviveDate(sf.payment_date) : new Date(),
            updated_at: sf.updated_at ? reviveDate(sf.updated_at) : undefined
        })),
        ignoredDocumentIds: loadedData.ignoredDocumentIds || [],
        adminTasksLayout: loadedData.adminTasksLayout || 'horizontal',
        locationOrder: loadedData.locationOrder || [],
    };
};

export const useSupabaseData = (user: User | null, isAuthLoading: boolean) => {
    const [data, setData] = React.useState<AppData>(getInitialData);
    const [syncStatus, setSyncStatus] = React.useState<SyncStatus>('loading');
    const [lastSyncError, setLastSyncError] = React.useState<string | null>(null);
    const [isDataLoading, setIsDataLoading] = React.useState(true);
    const [effectiveUserId, setEffectiveUserId] = React.useState<string | null>(null);
    const [activeProfile, setActiveProfile] = React.useState<Profile | null>(null);
    const [showUnpostponedSessionsModal, setShowUnpostponedSessionsModal] = React.useState(false);
    const [isDirty, setIsDirty] = React.useState(false);
    const isOnline = useOnlineStatus();

    React.useEffect(() => {
        if (!user) { setData(getInitialData()); setEffectiveUserId(null); setActiveProfile(null); return; }

        const resolveIdentity = async () => {
            setIsDataLoading(true);
            let ownerId = user.id;
            try {
                if (isOnline) {
                    const supabase = getSupabaseClient();
                    if (supabase) {
                        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
                        if (profile) { 
                            setActiveProfile(profile); 
                            if (profile.lawyer_id) ownerId = profile.lawyer_id; 
                        }
                    }
                }
            } catch (err) { console.warn("Identity check failed:", err); } finally {
                setEffectiveUserId(ownerId);
                const db = await getDb();
                const stored = await db.get(DATA_STORE_NAME, ownerId);
                if (stored) setData(validateAndFixData(stored));
                setIsDataLoading(false);
            }
        };
        resolveIdentity();
    }, [user?.id, isOnline]);

    const permissions = React.useMemo((): Permissions => {
        if (!user || !effectiveUserId) return defaultPermissions;
        if (user.id === effectiveUserId) return fullPermissions;
        const myProfile = activeProfile || data.profiles.find(p => p.id === user.id);
        return { ...defaultPermissions, ...(myProfile?.permissions || {}) };
    }, [user?.id, effectiveUserId, data.profiles, activeProfile]);

    const updateData = React.useCallback(async (updater: React.SetStateAction<AppData>) => {
        if (!effectiveUserId) return;
        setIsDirty(true);
        setData(curr => {
            const newData = typeof updater === 'function' ? (updater as any)(curr) : updater;
            getDb().then(db => db.put(DATA_STORE_NAME, newData, effectiveUserId));
            return newData;
        });
    }, [effectiveUserId]);

    const setFullData = React.useCallback(async (rawImportedData: any) => {
        if (!effectiveUserId) return;
        const validatedData = validateAndFixData(rawImportedData);
        setIsDirty(true);
        setData(validatedData);
        const db = await getDb();
        await db.put(DATA_STORE_NAME, validatedData, effectiveUserId);
    }, [effectiveUserId]);

    const handleDataSynced = React.useCallback(async (merged: AppData) => {
        if (!effectiveUserId) return;
        const db = await getDb();
        await db.put(DATA_STORE_NAME, merged, effectiveUserId);
        setData(merged);
        setIsDirty(false);
    }, [effectiveUserId]);

    // PREVENT RLS MISMATCH: Construct syncUser ONLY after identity is resolved.
    const syncUser = React.useMemo(() => {
        if (!user || isDataLoading || !effectiveUserId) return null;
        return { ...user, id: effectiveUserId } as User;
    }, [user, effectiveUserId, isDataLoading]);

    const { manualSync, fetchAndRefresh } = useSync({
        user: syncUser,
        localData: data,
        deletedIds: getInitialDeletedIds(),
        onDataSynced: handleDataSynced,
        onDeletionsSynced: () => {},
        onSyncStatusChange: (s, e) => { setSyncStatus(s); setLastSyncError(e); },
        isOnline, isAuthLoading, syncStatus, getDocumentFile: async () => null
    });

    const postponeSession = React.useCallback((sessionId: string, newDate: Date, newReason: string) => {
        updateData(prev => ({
            ...prev,
            clients: prev.clients.map(client => ({
                ...client,
                updated_at: new Date(),
                cases: client.cases.map(caseItem => ({
                    ...caseItem,
                    updated_at: new Date(),
                    stages: caseItem.stages.map(stage => {
                        const sessionIdx = stage.sessions.findIndex(s => s.id === sessionId);
                        if (sessionIdx === -1) return stage;
                        const oldSession = stage.sessions[sessionIdx];
                        const updatedOldSession: Session = { ...oldSession, isPostponed: true, nextSessionDate: newDate, nextPostponementReason: newReason, updated_at: new Date() };
                        const newSession: Session = { id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, court: oldSession.court, caseNumber: oldSession.caseNumber, date: newDate, clientName: oldSession.clientName, opponentName: oldSession.opponentName, isPostponed: false, postponementReason: newReason, assignee: oldSession.assignee, updated_at: new Date() };
                        const newSessionsList = [...stage.sessions];
                        newSessionsList[sessionIdx] = updatedOldSession;
                        newSessionsList.push(newSession);
                        return { ...stage, sessions: newSessionsList, updated_at: new Date() };
                    })
                }))
            }))
        }));
    }, [updateData]);

    const deleteItem = (key: keyof AppData, id: string) => {
        updateData(prev => ({ ...prev, [key]: (prev[key] as any[]).filter((i: any) => i.id !== id) }));
    };

    const allSessions = React.useMemo(() => {
        return (data.clients || []).flatMap(c => 
            (c.cases || []).flatMap(cs => 
                (cs.stages || []).flatMap(st => 
                    (st.sessions || []).map(s => ({
                        ...s, 
                        stageId: st.id, 
                        stageDecisionDate: st.decisionDate,
                        user_id: (s as any).user_id || c.user_id
                    }))
                )
            )
        );
    }, [data.clients]);

    const unpostponedSessions = React.useMemo(() => {
        return allSessions.filter(s => isBeforeToday(s.date) && !s.isPostponed && !s.stageDecisionDate);
    }, [allSessions]);

    return {
        ...data, syncStatus, manualSync, isDataLoading, fetchAndRefresh,
        effectiveUserId, activeProfile, permissions, isDirty,
        allSessions, unpostponedSessions,
        showUnpostponedSessionsModal, setShowUnpostponedSessionsModal,
        postponeSession, setFullData,
        setClients: (u: any) => updateData(p => ({ ...p, clients: u(p.clients) })),
        setProfiles: (u: any) => updateData(p => ({ ...p, profiles: u(p.profiles) })),
        setAdminTasks: (u: any) => updateData(p => ({ ...p, adminTasks: u(p.adminTasks) })),
        setAppointments: (u: any) => updateData(p => ({ ...p, appointments: u(p.appointments) })),
        setAccountingEntries: (u: any) => updateData(p => ({ ...p, accountingEntries: u(p.accountingEntries) })),
        setInvoices: (u: any) => updateData(p => ({ ...p, invoices: u(p.invoices) })),
        setAssistants: (u: any) => updateData(p => ({ ...p, assistants: u(p.assistants) })),
        setSiteFinances: (u: any) => updateData(p => ({ ...p, siteFinances: u(p.siteFinances) })),
        deleteAdminTask: (id: string) => deleteItem('adminTasks', id),
        deleteAppointment: (id: string) => deleteItem('appointments', id),
        deleteAccountingEntry: (id: string) => deleteItem('accountingEntries', id),
        deleteInvoice: (id: string) => deleteItem('invoices', id),
        addRealtimeAlert: () => {}, realtimeAlerts: [], userApprovalAlerts: [], triggeredAlerts: [],
        dismissAlert: () => {}, dismissRealtimeAlert: () => {}, dismissUserApprovalAlert: () => {},
        setAutoSyncEnabled: () => {}, setAutoBackupEnabled: () => {}, 
        setAdminTasksLayout: (layout: 'horizontal' | 'vertical') => updateData(p => ({ ...p, adminTasksLayout: layout })), 
        setLocationOrder: (order: string[]) => updateData(p => ({ ...p, locationOrder: order })),
        isAutoSyncEnabled: true, isAutoBackupEnabled: true, adminTasksLayout: data.adminTasksLayout || 'horizontal',
        exportData: () => {
             const dataStr = JSON.stringify(data);
             const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
             const exportFileDefaultName = `lawyer_backup_${new Date().toISOString().split('T')[0]}.json`;
             const linkElement = document.createElement('a');
             linkElement.setAttribute('href', dataUri);
             linkElement.setAttribute('download', exportFileDefaultName);
             linkElement.click();
             return true;
        }
    } as any;
};
