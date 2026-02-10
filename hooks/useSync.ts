
import * as React from 'react';
import type { User } from '@supabase/supabase-js';
import { checkSupabaseSchema, fetchDataFromSupabase, upsertDataToSupabase, FlatData, transformRemoteToLocal, fetchDeletionsFromSupabase } from './useOnlineData';
import { Client, Case, Stage, Session, CaseDocument, AppData, DeletedIds, getInitialDeletedIds, SyncDeletion } from '../types';

export type SyncStatus = 'loading' | 'syncing' | 'synced' | 'error' | 'unconfigured' | 'uninitialized';

interface UseSyncProps {
    user: User | null;
    localData: AppData;
    deletedIds: DeletedIds;
    onDataSynced: (mergedData: AppData) => Promise<void> | void;
    onDeletionsSynced: (syncedDeletions: Partial<DeletedIds>) => Promise<void> | void;
    onSyncStatusChange: (status: SyncStatus, error: string | null) => void;
    isOnline: boolean;
    isAuthLoading: boolean;
    syncStatus: SyncStatus;
    getDocumentFile: (docId: string) => Promise<File | null>;
}

const flattenData = (data: AppData): FlatData => {
    const cases = data.clients.flatMap(c => c.cases.map(cs => ({ ...cs, client_id: c.id })));
    const stages = cases.flatMap(cs => cs.stages.map(st => ({ ...st, case_id: cs.id })));
    const sessions = stages.flatMap(st => st.sessions.map(s => ({ ...s, stage_id: st.id })));
    return {
        clients: data.clients.map(({ cases, ...client }) => client),
        cases, stages, sessions,
        admin_tasks: data.adminTasks,
        appointments: data.appointments,
        accounting_entries: data.accountingEntries,
        assistants: data.assistants.map(name => ({ name })),
        invoices: data.invoices.map(({ items, ...inv }) => inv),
        invoice_items: data.invoices.flatMap(inv => inv.items.map(i => ({...i, invoice_id: inv.id}))),
        case_documents: data.documents,
        profiles: data.profiles,
        site_finances: data.siteFinances,
    };
};

const constructData = (flatData: Partial<FlatData>): AppData => {
    const sessionMap = new Map<string, Session[]>();
    (flatData.sessions || []).forEach(s => {
        // دعم مرن لكلا التسميتين لضمان عدم ضياع الجلسات
        const stageId = (s as any).stage_id || (s as any).stageId;
        if (stageId) {
            if (!sessionMap.has(stageId)) sessionMap.set(stageId, []);
            sessionMap.get(stageId)!.push(s as Session);
        }
    });

    const stageMap = new Map<string, Stage[]>();
    (flatData.stages || []).forEach(st => {
        const stage = { ...st, sessions: sessionMap.get(st.id) || [] } as Stage;
        const caseId = (st as any).case_id || (st as any).caseId;
        if (caseId) {
            if (!stageMap.has(caseId)) stageMap.set(caseId, []);
            stageMap.get(caseId)!.push(stage);
        }
    });

    const caseMap = new Map<string, Case[]>();
    (flatData.cases || []).forEach(cs => {
        const caseItem = { ...cs, stages: stageMap.get(cs.id) || [] } as Case;
        const clientId = (cs as any).client_id || (cs as any).clientId;
        if (clientId) {
            if (!caseMap.has(clientId)) caseMap.set(clientId, []);
            caseMap.get(clientId)!.push(caseItem);
        }
    });

    return {
        clients: (flatData.clients || []).map(c => ({ ...c, cases: caseMap.get(c.id) || [] } as Client)),
        adminTasks: (flatData.admin_tasks || []) as any,
        appointments: (flatData.appointments || []) as any,
        accountingEntries: (flatData.accounting_entries || []) as any,
        assistants: (flatData.assistants || []).map(a => a.name),
        invoices: (flatData.invoices || []).map(inv => ({...inv, items: (flatData.invoice_items || []).filter(i => (i as any).invoice_id === inv.id)})) as any,
        documents: (flatData.case_documents || []) as any,
        profiles: (flatData.profiles || []) as any,
        siteFinances: (flatData.site_finances || []) as any,
        ignoredDocumentIds: [],
    };
};

export const useSync = ({ user, localData, onDataSynced, onSyncStatusChange, isOnline, isAuthLoading, syncStatus }: UseSyncProps) => {
    const setStatus = (status: SyncStatus, error: string | null = null) => { onSyncStatusChange(status, error); };

    const manualSync = React.useCallback(async () => {
        if (syncStatus === 'syncing' || isAuthLoading || !isOnline || !user) return;
        setStatus('syncing', 'جاري المزامنة...');
        try {
            const schemaCheck = await checkSupabaseSchema();
            if (!schemaCheck.success) { setStatus('uninitialized', schemaCheck.message); return; }

            const [remoteDataRaw, remoteDeletions] = await Promise.all([fetchDataFromSupabase(), fetchDeletionsFromSupabase()]);
            const remoteFlatData = transformRemoteToLocal(remoteDataRaw);
            const localFlatData = flattenData(localData);

            // دمج البيانات بذكاء (الدمج يفضل البيانات الأحدث أو البيانات السحابية في حال تعارض الهوية)
            const mergedFlatData: Partial<FlatData> = {};
            const keys: (keyof FlatData)[] = ['clients', 'cases', 'stages', 'sessions', 'admin_tasks', 'appointments', 'accounting_entries', 'assistants', 'invoices', 'invoice_items', 'case_documents', 'profiles', 'site_finances'];

            for (const key of keys) {
                const remoteItems = (remoteFlatData as any)[key] || [];
                const localItems = (localFlatData as any)[key] || [];
                const finalMap = new Map();
                
                // إضافة البيانات المحلية أولاً ثم덮 البيانات السحابية لضمان الدقة
                localItems.forEach((i: any) => finalMap.set(i.id ?? i.name, i));
                remoteItems.forEach((i: any) => finalMap.set(i.id ?? i.name, i));
                
                (mergedFlatData as any)[key] = Array.from(finalMap.values());
            }

            const finalMergedData = constructData(mergedFlatData);
            await onDataSynced(finalMergedData);
            setStatus('synced');
        } catch (err: any) {
            console.error("Sync Error:", err);
            setStatus('error', err.message);
        }
    }, [localData, isOnline, user, syncStatus, isAuthLoading, onDataSynced]);

    return { manualSync, fetchAndRefresh: manualSync };
};
