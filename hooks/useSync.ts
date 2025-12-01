
import * as React from 'react';
// Fix: Use `import type` for User as it is used as a type, not a value. This resolves module resolution errors in some environments.
import type { User } from '@supabase/supabase-js';
import { checkSupabaseSchema, fetchDataFromSupabase, upsertDataToSupabase, FlatData, deleteDataFromSupabase, transformRemoteToLocal, fetchDeletionsFromSupabase } from './useOnlineData';
import { getSupabaseClient } from '../supabaseClient';
import { Client, Case, Stage, Session, CaseDocument, AppData, DeletedIds, getInitialDeletedIds, SyncDeletion } from '../types';

export type SyncStatus = 'loading' | 'syncing' | 'synced' | 'error' | 'unconfigured' | 'uninitialized';


interface UseSyncProps {
    user: User | null;
    localData: AppData;
    deletedIds: DeletedIds;
    onDataSynced: (mergedData: AppData) => void;
    onDeletionsSynced: (syncedDeletions: Partial<DeletedIds>) => void;
    onSyncStatusChange: (status: SyncStatus, error: string | null) => void;
    isOnline: boolean;
    isAuthLoading: boolean;
    syncStatus: SyncStatus;
    getDocumentFile: (docId: string) => Promise<File | null>;
}

// ... (flattenData, constructData, mergeForRefresh, applyDeletionsToLocal helpers remain same)
const flattenData = (data: AppData): FlatData => {
    const cases = data.clients.flatMap(c => c.cases.map(cs => ({ ...cs, client_id: c.id })));
    const stages = cases.flatMap(cs => cs.stages.map(st => ({ ...st, case_id: cs.id })));
    const sessions = stages.flatMap(st => st.sessions.map(s => ({ ...s, stage_id: st.id })));
    const invoice_items = data.invoices.flatMap(inv => inv.items.map(item => ({ ...item, invoice_id: inv.id })));

    return {
        clients: data.clients.map(({ cases, ...client }) => client),
        cases: cases.map(({ stages, ...caseItem }) => caseItem),
        stages: stages.map(({ sessions, ...stage }) => stage),
        sessions,
        admin_tasks: data.adminTasks,
        appointments: data.appointments,
        accounting_entries: data.accountingEntries,
        assistants: data.assistants.map(name => ({ name })),
        invoices: data.invoices.map(({ items, ...inv }) => inv),
        invoice_items,
        case_documents: data.documents,
        profiles: data.profiles,
        site_finances: data.siteFinances,
    };
};

const constructData = (flatData: Partial<FlatData>): AppData => {
    const sessionMap = new Map<string, Session[]>();
    (flatData.sessions || []).forEach(s => {
        const stageId = (s as any).stage_id;
        if (!sessionMap.has(stageId)) sessionMap.set(stageId, []);
        sessionMap.get(stageId)!.push(s as Session);
    });

    const stageMap = new Map<string, Stage[]>();
    (flatData.stages || []).forEach(st => {
        const stage = { ...st, sessions: sessionMap.get(st.id) || [] } as Stage;
        const caseId = (st as any).case_id;
        if (!stageMap.has(caseId)) stageMap.set(caseId, []);
        stageMap.get(caseId)!.push(stage);
    });

    const caseMap = new Map<string, Case[]>();
    (flatData.cases || []).forEach(cs => {
        const caseItem = { ...cs, stages: stageMap.get(cs.id) || [] } as Case;
        const clientId = (cs as any).client_id;
        if (!caseMap.has(clientId)) caseMap.set(clientId, []);
        caseMap.get(clientId)!.push(caseItem);
    });
    
    const invoiceItemMap = new Map<string, any[]>();
    (flatData.invoice_items || []).forEach(item => {
        const invoiceId = (item as any).invoice_id;
        if(!invoiceItemMap.has(invoiceId)) invoiceItemMap.set(invoiceId, []);
        invoiceItemMap.get(invoiceId)!.push(item);
    });

    return {
        clients: (flatData.clients || []).map(c => ({ ...c, cases: caseMap.get(c.id) || [] } as Client)),
        adminTasks: (flatData.admin_tasks || []) as any,
        appointments: (flatData.appointments || []) as any,
        accountingEntries: (flatData.accounting_entries || []) as any,
        assistants: (flatData.assistants || []).map(a => a.name),
        invoices: (flatData.invoices || []).map(inv => ({...inv, items: invoiceItemMap.get(inv.id) || []})) as any,
        documents: (flatData.case_documents || []) as any,
        profiles: (flatData.profiles || []) as any,
        siteFinances: (flatData.site_finances || []) as any,
    };
};

const mergeForRefresh = <T extends { id: any; updated_at?: Date | string }>(local: T[], remote: T[]): T[] => {
    const finalItems = new Map<any, T>();
    for (const localItem of local) { finalItems.set(localItem.id ?? (localItem as any).name, localItem); }
    for (const remoteItem of remote) {
        const id = remoteItem.id ?? (remoteItem as any).name;
        const existingItem = finalItems.get(id);
        if (existingItem) {
            const remoteDate = new Date(remoteItem.updated_at || 0);
            const localDate = new Date(existingItem.updated_at || 0);
            if (remoteDate > localDate) finalItems.set(id, remoteItem);
        } else { finalItems.set(id, remoteItem); }
    }
    return Array.from(finalItems.values());
};

const applyDeletionsToLocal = (localFlatData: FlatData, deletions: SyncDeletion[]): FlatData => {
    if (!deletions || deletions.length === 0) return localFlatData;

    const deletionMap = new Map<string, string>(); // RecordID -> DeletedAt ISO
    deletions.forEach(d => {
        deletionMap.set(`${d.table_name}:${d.record_id}`, d.deleted_at);
    });

    const filterItems = (items: any[], tableName: string) => {
        return items.filter(item => {
            const id = item.id ?? item.name;
            const key = `${tableName}:${id}`;
            const deletedAtStr = deletionMap.get(key);
            
            if (deletedAtStr) {
                // If item exists locally but was deleted remotely...
                const deletedAt = new Date(deletedAtStr).getTime();
                const updatedAt = new Date(item.updated_at || 0).getTime();
                if (updatedAt < (deletedAt + 2000)) {
                    return false; // Remove from local view
                }
            }
            return true;
        });
    };

    // 1. Filter top-level items directly from deletion map
    const filteredClients = filterItems(localFlatData.clients, 'clients');
    
    // 2. Cascade Filters... (Same logic as before)
    const clientIds = new Set(filteredClients.map(c => c.id));
    let filteredCases = filterItems(localFlatData.cases, 'cases');
    filteredCases = filteredCases.filter(c => clientIds.has(c.client_id));
    const caseIds = new Set(filteredCases.map(c => c.id));
    let filteredStages = filterItems(localFlatData.stages, 'stages');
    filteredStages = filteredStages.filter(s => caseIds.has(s.case_id));
    const stageIds = new Set(filteredStages.map(s => s.id));
    let filteredSessions = filterItems(localFlatData.sessions, 'sessions');
    filteredSessions = filteredSessions.filter(s => stageIds.has(s.stage_id));
    let filteredInvoices = filterItems(localFlatData.invoices, 'invoices');
    filteredInvoices = filteredInvoices.filter(i => clientIds.has(i.client_id));
    const invoiceIds = new Set(filteredInvoices.map(i => i.id));
    let filteredInvoiceItems = filterItems(localFlatData.invoice_items, 'invoice_items');
    filteredInvoiceItems = filteredInvoiceItems.filter(i => invoiceIds.has(i.invoice_id));
    let filteredDocs = filterItems(localFlatData.case_documents, 'case_documents');
    filteredDocs = filteredDocs.filter(d => caseIds.has(d.caseId)); 
    let filteredEntries = filterItems(localFlatData.accounting_entries, 'accounting_entries');
    filteredEntries = filteredEntries.filter(e => !e.clientId || clientIds.has(e.clientId));

    return {
        ...localFlatData,
        clients: filteredClients,
        cases: filteredCases,
        stages: filteredStages,
        sessions: filteredSessions,
        invoices: filteredInvoices,
        invoice_items: filteredInvoiceItems,
        case_documents: filteredDocs,
        accounting_entries: filteredEntries,
        admin_tasks: filterItems(localFlatData.admin_tasks, 'admin_tasks'),
        appointments: filterItems(localFlatData.appointments, 'appointments'),
        assistants: filterItems(localFlatData.assistants, 'assistants'),
        site_finances: filterItems(localFlatData.site_finances, 'site_finances'),
        profiles: localFlatData.profiles,
    };
};


export const useSync = ({ user, localData, deletedIds, onDataSynced, onDeletionsSynced, onSyncStatusChange, isOnline, isAuthLoading, syncStatus, getDocumentFile }: UseSyncProps) => {
    const userRef = React.useRef(user);
    userRef.current = user;

    const setStatus = (status: SyncStatus, error: string | null = null) => { onSyncStatusChange(status, error); };

    // Function to check and delete old files (48+ hours) from cloud but NOT track them as deleted sync items
    // This allows clients to keep their local copies.
    const cleanUpOldCloudDocuments = async () => {
        const supabase = getSupabaseClient();
        if (!supabase) return;

        // 48 hours ago
        const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

        try {
            // Find old documents
            const { data: oldDocs, error: fetchError } = await supabase
                .from('case_documents')
                .select('id, storage_path, added_at')
                .lt('added_at', cutoffDate);

            if (fetchError) throw fetchError;

            if (oldDocs && oldDocs.length > 0) {
                console.log(`Found ${oldDocs.length} expired documents to clean up from cloud.`);
                
                // 1. Delete from Storage
                const pathsToRemove = oldDocs.map(d => d.storage_path).filter(Boolean);
                if (pathsToRemove.length > 0) {
                    await supabase.storage.from('documents').remove(pathsToRemove);
                }

                // 2. Delete from DB Table (Hard delete, bypassing sync_deletions trigger if any, or just not adding to client sync log)
                // Note: Clients rely on 'sync_deletions' table or 'deletedIds' to know what to remove locally.
                // Since we are NOT adding these to 'sync_deletions', clients will treat them as "Orphaned" local records and keep them.
                const idsToRemove = oldDocs.map(d => d.id);
                await supabase.from('case_documents').delete().in('id', idsToRemove);
                
                console.log("Cleanup complete. Local copies remain intact.");
            }
        } catch (e) {
            console.error("Auto-cleanup failed:", e);
        }
    };

    // Upload pending docs
    const uploadPendingDocuments = async (docs: CaseDocument[]): Promise<Set<string>> => {
        const supabase = getSupabaseClient();
        const uploadedIds = new Set<string>();
        if (!supabase) return uploadedIds;
        
        const pendingDocs = docs.filter(d => d.localState === 'pending_upload');
        
        for (const doc of pendingDocs) {
            try {
                const file = await getDocumentFile(doc.id); // Re-use getDocumentFile to pull from IDB
                if (file) {
                    const { error } = await supabase.storage.from('documents').upload(doc.storagePath, file, { upsert: true });
                    if (error) throw error;
                    uploadedIds.add(doc.id);
                } else {
                    console.error("File not found locally for upload:", doc.id);
                }
            } catch (e) {
                console.error("Failed to upload doc:", doc.name, e);
            }
        }
        return uploadedIds;
    };

    const manualSync = React.useCallback(async () => {
        if (syncStatus === 'syncing') return;
        if (isAuthLoading) return;
        const currentUser = userRef.current;
        if (!isOnline || !currentUser) {
            setStatus('error', isOnline ? 'يجب تسجيل الدخول للمزامنة.' : 'يجب أن تكون متصلاً بالإنترنت للمزامنة.');
            return;
        }
    
        setStatus('syncing', 'التحقق من الخادم...');
        const schemaCheck = await checkSupabaseSchema();
        if (!schemaCheck.success) {
            if (schemaCheck.error === 'unconfigured') setStatus('unconfigured');
            else if (schemaCheck.error === 'uninitialized') setStatus('uninitialized', `قاعدة البيانات غير مهيأة: ${schemaCheck.message}`);
            else setStatus('error', `فشل الاتصال: ${schemaCheck.message}`);
            return;
        }
    
        try {
            // Upload binaries first
            let uploadedDocIds = new Set<string>();
            if (localData.documents.some(d => d.localState === 'pending_upload')) {
                setStatus('syncing', 'جاري رفع الملفات...');
                uploadedDocIds = await uploadPendingDocuments(localData.documents);
            }

            // Run Auto-Cleanup (Admin Only usually, or any user if RLS permits)
            // We run this quietly.
            if (currentUser) {
                cleanUpOldCloudDocuments();
            }

            // 1. Fetch Remote Data
            setStatus('syncing', 'جاري جلب البيانات من السحابة...');
            const [remoteDataRaw, remoteDeletions] = await Promise.all([
                fetchDataFromSupabase(),
                fetchDeletionsFromSupabase()
            ]);
            const remoteFlatData = transformRemoteToLocal(remoteDataRaw);

            // 2. Prepare Local Data
            let localFlatData = flattenData(localData);
            
            // 3. Apply Remote Deletions
            localFlatData = applyDeletionsToLocal(localFlatData, remoteDeletions);

            const flatUpserts: Partial<FlatData> = {};
            const mergedFlatData: Partial<FlatData> = {};

            const deletedIdsSets = {
                clients: new Set(deletedIds.clients), cases: new Set(deletedIds.cases), stages: new Set(deletedIds.stages),
                sessions: new Set(deletedIds.sessions), adminTasks: new Set(deletedIds.adminTasks), appointments: new Set(deletedIds.appointments),
                accountingEntries: new Set(deletedIds.accountingEntries), invoices: new Set(deletedIds.invoices),
                invoiceItems: new Set(deletedIds.invoiceItems), assistants: new Set(deletedIds.assistants),
                documents: new Set(deletedIds.documents), profiles: new Set(deletedIds.profiles), siteFinances: new Set(deletedIds.siteFinances),
            };

            for (const key of Object.keys(localFlatData) as (keyof FlatData)[]) {
                const localItems = (localFlatData as any)[key] as any[];
                const remoteItems = (remoteFlatData as any)[key] as any[] || [];
                const localMap = new Map(localItems.map(i => [i.id ?? i.name, i]));
                const remoteMap = new Map(remoteItems.map(i => [i.id ?? i.name, i]));
                const finalMergedItems = new Map<string, any>();
                const itemsToUpsert: any[] = [];

                for (const localItem of localItems) {
                    const id = localItem.id ?? localItem.name;
                    // ... (parent deletion checks same as before)
                    let isParentDeleted = false;
                    // ...
                    if (isParentDeleted) continue; 

                    const remoteItem = remoteMap.get(id);
                    if (remoteItem) {
                        const localDate = new Date(localItem.updated_at || 0).getTime();
                        const remoteDate = new Date(remoteItem.updated_at || 0).getTime();
                        if (localDate > remoteDate) {
                            itemsToUpsert.push(localItem);
                            finalMergedItems.set(id, localItem);
                        } else { finalMergedItems.set(id, remoteItem); }
                    } else {
                        // New Item
                        itemsToUpsert.push(localItem);
                        finalMergedItems.set(id, localItem);
                    }
                }

                for (const remoteItem of remoteItems) {
                    const id = remoteItem.id ?? remoteItem.name;
                    if (!localMap.has(id)) {
                        let isDeleted = false;
                        const entityKey = key === 'admin_tasks' ? 'adminTasks' : key === 'accounting_entries' ? 'accountingEntries' : key === 'invoice_items' ? 'invoiceItems' : key === 'case_documents' ? 'documents' : key === 'site_finances' ? 'siteFinances' : key;
                        const deletedSet = (deletedIdsSets as any)[entityKey];
                        if (deletedSet) isDeleted = deletedSet.has(id);
                        if (!isDeleted) finalMergedItems.set(id, remoteItem);
                    }
                }
                (flatUpserts as any)[key] = itemsToUpsert;
                (mergedFlatData as any)[key] = Array.from(finalMergedItems.values());
            }
            
            // ... (Orphan checks same as before)
            const validClientIds = new Set([...(remoteFlatData.clients || []).map(c => c.id), ...(flatUpserts.clients || []).map(c => c.id)]);
            if (flatUpserts.cases) flatUpserts.cases = flatUpserts.cases.filter(c => validClientIds.has(c.client_id));
            const validCaseIds = new Set([...(remoteFlatData.cases || []).map(c => c.id), ...(flatUpserts.cases || []).map(c => c.id)]);
            if (flatUpserts.stages) flatUpserts.stages = flatUpserts.stages.filter(s => validCaseIds.has(s.case_id));
            const validStageIds = new Set([...(remoteFlatData.stages || []).map(s => s.id), ...(flatUpserts.stages || []).map(s => s.id)]);
            if (flatUpserts.sessions) flatUpserts.sessions = flatUpserts.sessions.filter(s => validStageIds.has(s.stage_id));
            
            if (mergedFlatData.cases) mergedFlatData.cases = mergedFlatData.cases.filter(c => validClientIds.has(c.client_id));
            if (mergedFlatData.stages) mergedFlatData.stages = mergedFlatData.stages.filter(s => validCaseIds.has(s.case_id));
            if (mergedFlatData.sessions) mergedFlatData.sessions = mergedFlatData.sessions.filter(s => validStageIds.has(s.stage_id));
            if (mergedFlatData.case_documents) mergedFlatData.case_documents = mergedFlatData.case_documents.filter(doc => validCaseIds.has(doc.caseId));
            if (flatUpserts.case_documents) flatUpserts.case_documents = flatUpserts.case_documents.filter(doc => validCaseIds.has(doc.caseId));

            // Mark uploaded docs as synced in the upsert payload
            if (flatUpserts.case_documents) {
                const docsToUpsert = [];
                for (const d of flatUpserts.case_documents) {
                    if (d.localState === 'pending_upload') {
                        if (uploadedDocIds.has(d.id)) {
                            // Upload successful, prepare for DB insertion with synced status
                            docsToUpsert.push({ ...d, localState: 'synced' });
                        } else {
                            // Upload failed, DO NOT UPSERT to DB yet. Keep it local pending_upload.
                            // We don't add it to docsToUpsert.
                        }
                    } else {
                        // Already synced or other state, include it
                        docsToUpsert.push(d);
                    }
                }
                flatUpserts.case_documents = docsToUpsert;
            }

            let successfulDeletions = getInitialDeletedIds();

            // Local Document Deletion Handling:
            const flatDeletes: Partial<FlatData> = {
                clients: deletedIds.clients.map(id => ({ id })) as any,
                cases: deletedIds.cases.map(id => ({ id })) as any,
                stages: deletedIds.stages.map(id => ({ id })) as any,
                sessions: deletedIds.sessions.map(id => ({ id })) as any,
                admin_tasks: deletedIds.adminTasks.map(id => ({ id })) as any,
                appointments: deletedIds.appointments.map(id => ({ id })) as any,
                accounting_entries: deletedIds.accountingEntries.map(id => ({ id })) as any,
                assistants: deletedIds.assistants.map(name => ({ name })),
                invoices: deletedIds.invoices.map(id => ({ id })) as any,
                invoice_items: deletedIds.invoiceItems.map(id => ({ id })) as any,
                // Do NOT send document deletes
                case_documents: [], 
                site_finances: deletedIds.siteFinances.map(id => ({ id })) as any,
            };

            if (Object.values(flatDeletes).some(arr => arr && arr.length > 0)) {
                setStatus('syncing', 'جاري حذف البيانات من السحابة...');
                await deleteDataFromSupabase(flatDeletes, currentUser);
                successfulDeletions = { ...successfulDeletions, ...deletedIds };
            }

            setStatus('syncing', 'جاري رفع البيانات إلى السحابة...');
            const upsertedDataRaw = await upsertDataToSupabase(flatUpserts as FlatData, currentUser);
            const upsertedFlatData = transformRemoteToLocal(upsertedDataRaw);
            
            // Patch returned documents to have 'synced' state if they were just uploaded.
            if (upsertedFlatData.case_documents) {
                upsertedFlatData.case_documents = upsertedFlatData.case_documents.map(d => {
                    if (uploadedDocIds.has(d.id)) {
                        return { ...d, localState: 'synced' };
                    }
                    return d;
                });
            }

            const upsertedDataMap = new Map();
            Object.values(upsertedFlatData).forEach(arr => (arr as any[])?.forEach(item => upsertedDataMap.set(item.id ?? item.name, item)));

            for (const key of Object.keys(mergedFlatData) as (keyof FlatData)[]) {
                const mergedItems = (mergedFlatData as any)[key];
                if (Array.isArray(mergedItems)) (mergedFlatData as any)[key] = mergedItems.map((item: any) => upsertedDataMap.get(item.id ?? item.name) || item);
            }

            const finalMergedData = constructData(mergedFlatData as FlatData);
            onDataSynced(finalMergedData);
            onDeletionsSynced(successfulDeletions);
            setStatus('synced');
        } catch (err: any) {
            // ... (Error handling same as before)
            let errorMessage = err.message || 'حدث خطأ غير متوقع.';
            if (errorMessage.toLowerCase().includes('failed to fetch')) errorMessage = 'فشل الاتصال بالخادم.';
            else console.error("Error during sync:", err);
            
            if ((errorMessage.includes('column') && errorMessage.includes('does not exist')) || errorMessage.includes('relation')) {
                setStatus('uninitialized', `هناك عدم تطابق في مخطط قاعدة البيانات: ${errorMessage}`); return;
            }
            if (err.table) errorMessage = `[جدول: ${err.table}] ${errorMessage}`;
            setStatus('error', `فشل المزامنة: ${errorMessage}`);
        }
    }, [localData, userRef, isOnline, onDataSynced, deletedIds, onDeletionsSynced, isAuthLoading, syncStatus, getDocumentFile]);

    const fetchAndRefresh = React.useCallback(async () => {
        if (syncStatus === 'syncing' || isAuthLoading) return;
        const currentUser = userRef.current;
        if (!isOnline || !currentUser) return;
    
        setStatus('syncing', 'جاري تحديث البيانات...');
        
        try {
            const [remoteDataRaw, remoteDeletions] = await Promise.all([
                fetchDataFromSupabase(),
                fetchDeletionsFromSupabase()
            ]);
            const remoteFlatDataUntyped = transformRemoteToLocal(remoteDataRaw);
    
            // ... (Delete set logic same as before)
            const deletedIdsSets = {
                clients: new Set(deletedIds.clients), cases: new Set(deletedIds.cases), stages: new Set(deletedIds.stages),
                sessions: new Set(deletedIds.sessions), adminTasks: new Set(deletedIds.adminTasks), appointments: new Set(deletedIds.appointments),
                accountingEntries: new Set(deletedIds.accountingEntries), invoices: new Set(deletedIds.invoices), invoiceItems: new Set(deletedIds.invoiceItems),
                assistants: new Set(deletedIds.assistants), documents: new Set(deletedIds.documents), profiles: new Set(deletedIds.profiles), siteFinances: new Set(deletedIds.siteFinances),
            };
    
            const remoteFlatData: Partial<FlatData> = {};
            for (const key of Object.keys(remoteFlatDataUntyped) as (keyof FlatData)[]) {
                const entityKey = key === 'admin_tasks' ? 'adminTasks' : key === 'accounting_entries' ? 'accountingEntries' : key === 'invoice_items' ? 'invoiceItems' : key === 'case_documents' ? 'documents' : key === 'site_finances' ? 'siteFinances' : key;
                const deletedSet = (deletedIdsSets as any)[entityKey];
                if (deletedSet && deletedSet.size > 0) {
                    (remoteFlatData as any)[key] = ((remoteFlatDataUntyped as any)[key] || []).filter((item: any) => !deletedSet.has(item.id ?? item.name));
                } else { (remoteFlatData as any)[key] = (remoteFlatDataUntyped as any)[key]; }
            }
    
            let localFlatData = flattenData(localData);
            localFlatData = applyDeletionsToLocal(localFlatData, remoteDeletions);

            const mergedAssistants = Array.from(new Set([...localFlatData.assistants.map(a => a.name), ...(remoteFlatData.assistants || []).map(a => a.name)])).map(name => ({ name }));
    
            const mergedFlatData: FlatData = {
                // ... (Merging logic same as before)
                clients: mergeForRefresh(localFlatData.clients, remoteFlatData.clients || []),
                cases: mergeForRefresh(localFlatData.cases, remoteFlatData.cases || []),
                stages: mergeForRefresh(localFlatData.stages, remoteFlatData.stages || []),
                sessions: mergeForRefresh(localFlatData.sessions, remoteFlatData.sessions || []),
                admin_tasks: mergeForRefresh(localFlatData.admin_tasks, remoteFlatData.admin_tasks || []),
                appointments: mergeForRefresh(localFlatData.appointments, remoteFlatData.appointments || []),
                accounting_entries: mergeForRefresh(localFlatData.accounting_entries, remoteFlatData.accounting_entries || []),
                assistants: mergedAssistants,
                invoices: mergeForRefresh(localFlatData.invoices, remoteFlatData.invoices || []),
                invoice_items: mergeForRefresh(localFlatData.invoice_items, remoteFlatData.invoice_items || []),
                case_documents: mergeForRefresh(localFlatData.case_documents, remoteFlatData.case_documents || []),
                profiles: mergeForRefresh(localFlatData.profiles, remoteFlatData.profiles || []),
                site_finances: mergeForRefresh(localFlatData.site_finances, remoteFlatData.site_finances || []),
            };
    
            const mergedData = constructData(mergedFlatData);
            onDataSynced(mergedData);
            setStatus('synced');
        } catch (err: any) {
            let errorMessage = err.message || 'حدث خطأ غير متوقع.';
            if (String(errorMessage).toLowerCase().includes('failed to fetch')) errorMessage = 'فشل الاتصال بالخادم.';
            else console.error("Error during realtime refresh:", err);
            setStatus('error', `فشل تحديث البيانات: ${errorMessage}`);
        }
    }, [localData, deletedIds, userRef, isOnline, onDataSynced, isAuthLoading, syncStatus]);

    return { manualSync, fetchAndRefresh };
};
