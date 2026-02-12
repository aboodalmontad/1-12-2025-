
import * as React from 'react';
import type { User } from '@supabase/supabase-js';
import { checkSupabaseSchema, fetchDataFromSupabase, upsertDataToSupabase, FlatData, transformRemoteToLocal } from './useOnlineData';
import { Client, Case, Stage, Session, AppData, DeletedIds } from '../types';

export type SyncStatus = 'loading' | 'syncing' | 'synced' | 'error' | 'unconfigured' | 'uninitialized';

interface UseSyncProps {
    user: User | null;
    ownerId: string | null;
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
    const cases = (data.clients || []).flatMap(c => (c.cases || []).map(cs => ({ ...cs, client_id: c.id })));
    const stages = cases.flatMap(cs => (cs.stages || []).map(st => ({ ...st, case_id: cs.id })));
    const sessions = stages.flatMap(st => (st.sessions || []).map(s => ({ ...s, stage_id: st.id })));
    return {
        clients: (data.clients || []).map(({ cases, ...client }) => client),
        cases, stages, sessions,
        admin_tasks: data.adminTasks || [],
        appointments: data.appointments || [],
        accounting_entries: data.accountingEntries || [],
        assistants: (data.assistants || []).map(name => ({ name })),
        invoices: (data.invoices || []).map(({ items, ...inv }) => inv),
        invoice_items: (data.invoices || []).flatMap(inv => (inv.items || []).map(i => ({...i, invoice_id: inv.id}))),
        case_documents: data.documents || [],
        profiles: data.profiles || [],
        site_finances: data.siteFinances || [],
    };
};

const constructData = (flatData: Partial<FlatData>): AppData => {
    const sessionMap = new Map<string, Session[]>();
    (flatData.sessions || []).forEach(s => {
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

export const useSync = ({ user, ownerId, localData, onDataSynced, onSyncStatusChange, isOnline, isAuthLoading, syncStatus }: UseSyncProps) => {
    const isSyncingRef = React.useRef(false);

    const manualSync = React.useCallback(async () => {
        if (isSyncingRef.current || syncStatus === 'syncing' || !isOnline || !user || !ownerId) return;
        
        isSyncingRef.current = true;
        onSyncStatusChange('syncing', 'جاري معالجة البيانات...');
        
        try {
            const schemaCheck = await checkSupabaseSchema();
            if (!schemaCheck.success) { 
                onSyncStatusChange('uninitialized', schemaCheck.message); 
                isSyncingRef.current = false;
                return; 
            }

            console.log("Sync starting: Pulling remote...");
            const remoteDataRaw = await fetchDataFromSupabase();
            const remoteFlatData = transformRemoteToLocal(remoteDataRaw);
            const localFlatData = flattenData(localData);

            const mergedFlatData: Partial<FlatData> = {};
            const keys: (keyof FlatData)[] = ['clients', 'cases', 'stages', 'sessions', 'admin_tasks', 'appointments', 'accounting_entries', 'assistants', 'invoices', 'invoice_items', 'case_documents', 'profiles', 'site_finances'];

            let localNeedsPush = false;

            for (const key of keys) {
                const remoteItems = (remoteFlatData as any)[key] || [];
                const localItems = (localFlatData as any)[key] || [];
                const finalMap = new Map();
                
                remoteItems.forEach((i: any) => finalMap.set(i.id ?? i.name, i));
                
                localItems.forEach((i: any) => {
                    const id = i.id ?? i.name;
                    const existing = finalMap.get(id);
                    if (!existing) {
                        finalMap.set(id, i);
                        localNeedsPush = true;
                    } else {
                        const remoteDate = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
                        const localDate = i.updated_at ? new Date(i.updated_at).getTime() : 0;
                        if (localDate > remoteDate) {
                            finalMap.set(id, i);
                            localNeedsPush = true;
                        }
                    }
                });
                (mergedFlatData as any)[key] = Array.from(finalMap.values());
            }

            if (localNeedsPush) {
                console.log("Sync: Pushing local changes in batches...");
                onSyncStatusChange('syncing', 'جاري رفع البيانات إلى السحابة...');
                await upsertDataToSupabase(mergedFlatData, ownerId);
            }

            const finalMergedData = constructData(mergedFlatData);
            await onDataSynced(finalMergedData);
            onSyncStatusChange('synced', null);
            console.log("Sync finished successfully.");
        } catch (err: any) {
            console.error("Sync error:", err);
            onSyncStatusChange('error', err.message || 'فشل الاتصال بالسيرفر');
        } finally {
            isSyncingRef.current = false;
        }
    }, [localData, isOnline, user, ownerId, syncStatus, onDataSynced, onSyncStatusChange]);

    return { manualSync, fetchAndRefresh: manualSync };
};
