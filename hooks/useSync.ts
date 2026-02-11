
import * as React from 'react';
import type { User } from '@supabase/supabase-js';
import { checkSupabaseSchema, fetchDataFromSupabase, upsertDataToSupabase, FlatData, transformRemoteToLocal } from './useOnlineData';
import { Client, Case, Stage, Session, AppData, DeletedIds, getInitialDeletedIds } from '../types';

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
    const cases = (data.clients || []).flatMap(c => (c.cases || []).map(cs => ({ ...cs, client_id: c.id })));
    const stages = (cases || []).flatMap(cs => (cs.stages || []).map(st => ({ ...st, case_id: cs.id })));
    const sessions = (stages || []).flatMap(st => (st.sessions || []).map(s => ({ ...s, stage_id: st.id })));
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
            sessionMap.get(stageId)!.push({ ...s, date: new Date(s.date), nextSessionDate: s.nextSessionDate ? new Date(s.nextSessionDate) : undefined } as Session);
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
        adminTasks: (flatData.admin_tasks || []).map(t => ({ ...t, dueDate: new Date(t.dueDate) })),
        appointments: (flatData.appointments || []).map(a => ({ ...a, date: new Date(a.date) })),
        accountingEntries: (flatData.accounting_entries || []).map(e => ({ ...e, date: new Date(e.date) })),
        assistants: (flatData.assistants || []).map(a => a.name),
        invoices: (flatData.invoices || []).map(inv => ({...inv, issueDate: new Date(inv.issueDate), dueDate: new Date(inv.dueDate), items: (flatData.invoice_items || []).filter(i => (i as any).invoice_id === inv.id)})) as any,
        documents: (flatData.case_documents || []).map(d => ({ ...d, addedAt: new Date(d.addedAt) })),
        profiles: (flatData.profiles || []) as any,
        siteFinances: (flatData.site_finances || []) as any,
        ignoredDocumentIds: [],
    };
};

export const useSync = ({ user, localData, onDataSynced, onSyncStatusChange, isOnline, isAuthLoading, syncStatus }: UseSyncProps) => {
    // استخدام Ref لضمان أن دالة manualSync تستخدم دائماً أحدث نسخة من البيانات المحلية
    // هذا يمنع مشكلة "الإغلاق القديم" (Stale Closure) التي كانت تحدث عند استدعاء المزامنة فور الاستيراد
    const localDataRef = React.useRef(localData);
    React.useEffect(() => {
        localDataRef.current = localData;
    }, [localData]);

    const setStatus = (status: SyncStatus, error: string | null = null) => { onSyncStatusChange(status, error); };

    const manualSync = React.useCallback(async () => {
        if (syncStatus === 'syncing' || isAuthLoading || !isOnline || !user) return;
        setStatus('syncing', 'جاري المزامنة...');
        
        try {
            const schemaCheck = await checkSupabaseSchema();
            if (!schemaCheck.success) { setStatus('uninitialized', schemaCheck.message); return; }

            // 1. جلب البيانات من السحابة
            const remoteDataRaw = await fetchDataFromSupabase();
            const remoteFlatData = transformRemoteToLocal(remoteDataRaw);
            
            // 2. تحويل أحدث بيانات محلية (بما فيها المستوردة مؤخراً)
            const currentLocalData = localDataRef.current;
            const localFlatData = flattenData(currentLocalData);

            // 3. الدمج مع إعطاء الأولوية القصوى للمحلي
            const mergedFlatData: Partial<FlatData> = {};
            const keys: (keyof FlatData)[] = ['clients', 'cases', 'stages', 'sessions', 'admin_tasks', 'appointments', 'accounting_entries', 'assistants', 'invoices', 'invoice_items', 'case_documents', 'profiles', 'site_finances'];

            for (const key of keys) {
                const remoteItems = (remoteFlatData as any)[key] || [];
                const localItems = (localFlatData as any)[key] || [];
                const finalMap = new Map();
                
                // نبدأ بالسحابة
                remoteItems.forEach((i: any) => finalMap.set(i.id ?? i.name, i));
                
                // المحلي يطغى على السحابة (ضروري لرفع النسخة الاحتياطية)
                // إذا وجد نفس الـ ID في النسخة الاحتياطية، سيستبدل النسخة الموجودة في السحابة
                localItems.forEach((i: any) => finalMap.set(i.id ?? i.name, i));
                
                (mergedFlatData as any)[key] = Array.from(finalMap.values());
            }

            // 4. رفع النتيجة المدمجة للسحابة (أمر Upsert سيقوم بالتحديث أو الإضافة)
            await upsertDataToSupabase(mergedFlatData, user);

            // 5. تحديث الحالة المحلية بالبيانات الموحدة والنهائية
            const finalMergedData = constructData(mergedFlatData);
            await onDataSynced(finalMergedData);
            
            setStatus('synced');
        } catch (err: any) {
            console.error("Sync Error:", err);
            setStatus('error', err.message || 'حدث خطأ أثناء المزامنة');
        }
    }, [isOnline, user, syncStatus, isAuthLoading, onDataSynced]); // أزلنا localData من التبعيات لضمان استقرار الدالة واستخدام Ref بدلاً منها

    return { manualSync, fetchAndRefresh: manualSync };
};
